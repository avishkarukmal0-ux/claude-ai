'use strict';

// PWA owner/staff daily digest (mandate #6). The reliable, not-app-open-dependent channel: the server
// reads the shop's already-synced data (opaque SyncBlobs it can parse) and emails a morning summary of
// what needs attention — stock expiring soon, overdue supplier claims, urgent/overdue team tasks.
//
// Everything here degrades honestly: with no email provider configured, nothing is sent and the caller is
// told `configured:false`. Pure helpers (buildDigest / isDue / londonParts) are exported for DB-free tests.
const config = require('../config');
const logger = require('../utils/logger');
const { round2, sumMoney } = require('../utils/money');
const emailService = require('./emailService');
const Account = require('../models/Account');
const SyncBlob = require('../models/SyncBlob');

const DAY_MS = 24 * 60 * 60 * 1000;
const MAX_LIST = 12; // cap items per section so an email can't balloon

/** Is the email channel actually configured? (provider + key). Never claims a send works otherwise. */
function emailConfigured() {
  return config.notify.emailProvider === 'sendgrid' && !!process.env.SENDGRID_API_KEY;
}

// Europe/London hour + calendar day, without a tz plugin — Intl gives us the parts directly.
function londonParts(now = Date.now()) {
  const fmt = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Europe/London', hour: '2-digit', hour12: false,
    year: 'numeric', month: '2-digit', day: '2-digit',
  });
  const parts = Object.fromEntries(fmt.formatToParts(new Date(now)).map((p) => [p.type, p.value]));
  let hour = parseInt(parts.hour, 10);
  if (hour === 24) hour = 0; // some engines render midnight as 24
  return { hour, day: `${parts.year}-${parts.month}-${parts.day}` };
}

function parseBlob(blobsByName, name) {
  try { const v = blobsByName[name]; return v ? JSON.parse(v) : null; }
  catch { return null; }
}

// ── digest pieces ────────────────────────────────────────────────────────────────────────────────────
const OPEN_CLAIM_STATUSES = ['draft', 'submitted', 'acknowledged', 'approved'];
const DONE_TASK_STATUSES = ['done', 'cancelled', 'completed'];

function daysUntil(dateStr, now) {
  if (!dateStr) return null;
  const d = new Date(dateStr); if (Number.isNaN(d.getTime())) return null;
  d.setHours(0, 0, 0, 0);
  const t = new Date(now); t.setHours(0, 0, 0, 0);
  return Math.round((d.getTime() - t.getTime()) / DAY_MS);
}

function earliestExpiryDays(product, now) {
  const dates = [];
  if (product && product.expiry) dates.push(daysUntil(product.expiry, now));
  if (Array.isArray(product && product.batches)) {
    for (const b of product.batches) if (b && b.expiry) dates.push(daysUntil(b.expiry, now));
  }
  const valid = dates.filter((n) => n != null);
  return valid.length ? Math.min(...valid) : null;
}

function claimTarget(c) {
  if (c.approvedAmount != null) return Number(c.approvedAmount) || 0;
  if (c.requestedAmount != null) return Number(c.requestedAmount) || 0;
  return (c.items || []).reduce((n, i) => n + (Number(i.amount) || 0), 0);
}
function claimOutstanding(c) {
  return round2(Math.max(0, (claimTarget(c) || 0) - (Number(c.receivedAmount) || 0)));
}

/**
 * Compute the digest from an account's blobs + its prefs. Pure — no I/O. Returns a structured summary
 * with small capped lists and an `empty` flag.
 */
function buildDigest({ shopName, blobsByName = {}, prefs = {}, now = Date.now() } = {}) {
  const cats = prefs.categories || { expiry: true, claims: true, tasks: true };
  const expiryDays = Number.isFinite(prefs.expiryDays) ? prefs.expiryDays : 3;

  const expiring = [];
  if (cats.expiry !== false) {
    const inv = parseBlob(blobsByName, 'inventory_v1') || [];
    for (const p of Array.isArray(inv) ? inv : []) {
      const days = earliestExpiryDays(p, now);
      if (days != null && days <= expiryDays) {
        expiring.push({ name: p.name || 'Item', days, qty: Number(p.qty) || 0 });
      }
    }
    expiring.sort((a, b) => a.days - b.days);
  }

  const overdueClaims = [];
  if (cats.claims !== false) {
    const claims = parseBlob(blobsByName, 'claims_v1') || [];
    const today = new Date(now); today.setHours(0, 0, 0, 0);
    for (const c of Array.isArray(claims) ? claims : []) {
      const open = OPEN_CLAIM_STATUSES.includes(c.status);
      const due = c.followUpDate && new Date(c.followUpDate).setHours(0, 0, 0, 0) < today.getTime();
      if (open && due) {
        overdueClaims.push({ supplierName: c.supplierName || 'Supplier', outstanding: claimOutstanding(c), followUpDate: c.followUpDate });
      }
    }
    overdueClaims.sort((a, b) => b.outstanding - a.outstanding);
  }

  const urgentTasks = [];
  if (cats.tasks !== false) {
    const tasks = parseBlob(blobsByName, 'tasks_v1') || [];
    for (const t of Array.isArray(tasks) ? tasks : []) {
      const open = !DONE_TASK_STATUSES.includes(t.status);
      const overdue = t.dueAt && Number(t.dueAt) < now;
      if (open && (t.priority === 'high' || overdue)) {
        urgentTasks.push({ title: t.title || 'Task', overdue: !!overdue, priority: t.priority || 'normal' });
      }
    }
  }

  const expiringOutstanding = sumMoney(overdueClaims.map((c) => c.outstanding));
  const empty = expiring.length === 0 && overdueClaims.length === 0 && urgentTasks.length === 0;

  return {
    shopName: shopName || 'your shop',
    generatedAt: now,
    expiry: { count: expiring.length, items: expiring.slice(0, MAX_LIST) },
    claims: { count: overdueClaims.length, outstanding: expiringOutstanding, items: overdueClaims.slice(0, MAX_LIST) },
    tasks: { count: urgentTasks.length, items: urgentTasks.slice(0, MAX_LIST) },
    empty,
  };
}

/**
 * Should a digest be sent now for these prefs? Respects enabled, snooze, quiet hours, the send hour, and
 * a once-per-day guard (lastSentDay). Pure.
 */
function isDue(prefs = {}, now = Date.now()) {
  if (!prefs.email || !prefs.email.enabled) return false;
  if (prefs.snoozeUntil && now < Number(prefs.snoozeUntil)) return false;

  const { hour, day } = londonParts(now);
  const qFrom = Number.isFinite(prefs.quietFrom) ? prefs.quietFrom : 21;
  const qTo = Number.isFinite(prefs.quietTo) ? prefs.quietTo : 7;
  const inQuiet = qFrom === qTo ? false
    : qFrom < qTo ? (hour >= qFrom && hour < qTo)
      : (hour >= qFrom || hour < qTo); // wraps midnight
  if (inQuiet) return false;

  const sendHour = Number.isFinite(prefs.sendHour) ? prefs.sendHour : 7;
  if (hour < sendHour) return false;        // not yet time today
  if (prefs.lastSentDay === day) return false; // already sent today
  return true;
}

// ── email rendering ────────────────────────────────────────────────────────────────────────────────────
function digestToText(d) {
  const L = [];
  L.push(`Vendora — morning summary for ${d.shopName}`);
  L.push('');
  if (d.empty) { L.push('Nothing needs your attention right now. Have a good day.'); return L.join('\n'); }
  if (d.expiry.count) {
    L.push(`Expiring soon (${d.expiry.count}):`);
    for (const x of d.expiry.items) L.push(`  • ${x.name} — ${x.days < 0 ? `${-x.days}d past` : x.days === 0 ? 'today' : `in ${x.days}d`} (${x.qty} in stock)`);
    L.push('');
  }
  if (d.claims.count) {
    L.push(`Overdue supplier claims (${d.claims.count}, £${d.claims.outstanding.toFixed(2)} outstanding):`);
    for (const x of d.claims.items) L.push(`  • ${x.supplierName} — £${x.outstanding.toFixed(2)} (follow-up was ${x.followUpDate})`);
    L.push('');
  }
  if (d.tasks.count) {
    L.push(`Urgent team tasks (${d.tasks.count}):`);
    for (const x of d.tasks.items) L.push(`  • ${x.title}${x.overdue ? ' (overdue)' : ''}${x.priority === 'high' ? ' [high]' : ''}`);
    L.push('');
  }
  L.push('Open Vendora to act on these. Outstanding claim amounts are what you’ve asked for, not money received.');
  return L.join('\n');
}
function esc(s) { return String(s).replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c])); }
function digestToHtml(d) {
  if (d.empty) return `<p>Nothing needs your attention right now for <b>${esc(d.shopName)}</b>. Have a good day.</p>`;
  const sec = (title, items) => items.length ? `<h3 style="margin:16px 0 4px">${esc(title)}</h3><ul>${items.map((i) => `<li>${i}</li>`).join('')}</ul>` : '';
  return [
    `<p>Morning summary for <b>${esc(d.shopName)}</b></p>`,
    sec(`Expiring soon (${d.expiry.count})`, d.expiry.items.map((x) => `${esc(x.name)} — ${x.days < 0 ? `${-x.days}d past` : x.days === 0 ? 'today' : `in ${x.days}d`} (${x.qty} in stock)`)),
    sec(`Overdue supplier claims (${d.claims.count}, £${d.claims.outstanding.toFixed(2)})`, d.claims.items.map((x) => `${esc(x.supplierName)} — £${x.outstanding.toFixed(2)} (follow-up was ${esc(x.followUpDate)})`)),
    sec(`Urgent team tasks (${d.tasks.count})`, d.tasks.items.map((x) => `${esc(x.title)}${x.overdue ? ' (overdue)' : ''}${x.priority === 'high' ? ' [high]' : ''}`)),
    '<p style="color:#888;font-size:12px">Open Vendora to act on these. Outstanding claim amounts are what you’ve asked for, not money received.</p>',
  ].join('');
}

// ── orchestration (DB) ────────────────────────────────────────────────────────────────────────────────
async function blobsForAccount(accountId) {
  const docs = await SyncBlob.find({ account: accountId, name: { $in: ['inventory_v1', 'claims_v1', 'tasks_v1'] } }).lean();
  const byName = {};
  for (const d of docs) byName[d.name] = d.value;
  return byName;
}

/** Compute (but never send) the digest for an account — powers the in-app "send me a preview". */
async function previewForAccount(accountId, now = Date.now()) {
  const account = await Account.findById(accountId);
  if (!account) return null;
  const blobsByName = await blobsForAccount(accountId);
  return buildDigest({ shopName: account.shopName, blobsByName, prefs: account.notify || {}, now });
}

/**
 * Send the digest for one account if it's due (or force). Marks lastSentDay when it runs in-window so it
 * won't re-fire the same day. Returns { sent, reason }.
 */
async function runForAccount(account, now = Date.now(), { force = false } = {}) {
  if (!emailConfigured()) return { sent: false, reason: 'not_configured' };
  const prefs = account.notify || {};
  if (!force && !isDue(prefs, now)) return { sent: false, reason: 'not_due' };

  const blobsByName = await blobsForAccount(account._id);
  const digest = buildDigest({ shopName: account.shopName, blobsByName, prefs, now });

  // Mark the day as handled up front (in-window) so an empty day doesn't get re-evaluated every sweep.
  if (!force) {
    account.notify = account.notify || {};
    account.notify.lastSentDay = londonParts(now).day;
    await account.save();
  }

  if (digest.empty && !force) return { sent: false, reason: 'nothing_to_send' };

  const to = (prefs.recipient && prefs.recipient.trim()) || account.email;
  try {
    await emailService.send({
      to,
      subject: `Vendora: ${digest.empty ? 'all clear' : 'what needs attention'} — ${account.shopName}`,
      text: digestToText(digest),
      html: digestToHtml(digest),
    });
    return { sent: true, reason: 'sent', to };
  } catch (err) {
    logger.error(`PWA digest send failed for ${account._id}: ${err.message}`);
    return { sent: false, reason: 'send_failed', error: err.message };
  }
}

/** Sweep every account with the email digest enabled and send those that are due. */
async function runDue(now = Date.now()) {
  if (!emailConfigured()) return { configured: false, considered: 0, sent: 0 };
  const accounts = await Account.find({ 'notify.email.enabled': true });
  let sent = 0;
  for (const account of accounts) {
    // eslint-disable-next-line no-await-in-loop
    const r = await runForAccount(account, now).catch((e) => ({ sent: false, reason: 'error', error: e.message }));
    if (r.sent) sent += 1;
  }
  return { configured: true, considered: accounts.length, sent };
}

module.exports = {
  emailConfigured, londonParts, buildDigest, isDue, digestToText, digestToHtml,
  previewForAccount, runForAccount, runDue,
};
