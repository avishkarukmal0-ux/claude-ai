import React, { useEffect, useMemo, useState } from 'react';
import toast from 'react-hot-toast';
import {
  ArrowLeft, Bell, BellOff, Mail, Loader2, Clock, Moon, Check,
} from 'lucide-react';
import {
  getDevicePrefs, setDevicePrefs, ensurePermission, permissionState, notificationSupported,
  buildLocalDigest, digestLine,
} from '../../lib/notifications';
import { getEmailPrefs, saveEmailPrefs, getPreview } from '../../lib/notifyClient';
import { ACCOUNTS_ENABLED, isLoggedIn, currentRole } from '../../lib/account';
import { can } from '../../lib/permissions';

// Notification preferences (mandate #6). Two channels, clearly separated:
//  - This device (local, best-effort, works when the app is open).
//  - Email digest (server-sent, reliable; owner/manager only; off unless the shop has it configured).
const CATS = [
  { key: 'expiry', label: 'Stock expiring soon' },
  { key: 'claims', label: 'Overdue supplier claims' },
  { key: 'tasks', label: 'Urgent team tasks' },
];
const HOURS = Array.from({ length: 24 }, (_, i) => i);
const hourLabel = (h) => `${String(h).padStart(2, '0')}:00`;

export default function NotificationsView({ onBack }) {
  const [device, setDevice] = useState(getDevicePrefs);
  const [perm, setPerm] = useState(permissionState());
  const now = Date.now();
  const localDigest = useMemo(() => buildLocalDigest(now, device), [device, now]);

  const emailAllowed = ACCOUNTS_ENABLED && isLoggedIn() && can(currentRole(), 'notificationsEmail');

  function patchDevice(patch) { setDevice(setDevicePrefs(patch)); }

  async function toggleDevice() {
    if (!device.enabled) {
      const res = await ensurePermission();
      setPerm(res);
      if (res !== 'granted') {
        toast.error(res === 'denied' ? 'Notifications are blocked in your browser settings.' : 'This device can’t show notifications.');
        return;
      }
      patchDevice({ enabled: true });
      toast.success('Reminders on for this device');
    } else {
      patchDevice({ enabled: false });
      toast('Reminders off for this device', { icon: '🔕' });
    }
  }
  function snoozeToday() {
    const until = new Date(); until.setHours(23, 59, 59, 999);
    patchDevice({ snoozeUntil: until.getTime() });
    toast.success('Snoozed until tomorrow');
  }

  return (
    <div>
      <button type="button" onClick={onBack} className="mb-4 inline-flex items-center gap-1 text-sm font-medium text-primary hover:underline">
        <ArrowLeft className="h-4 w-4" /> Back
      </button>
      <h2 className="mb-1 text-base font-bold text-gray-900">Notifications</h2>
      <p className="mb-4 text-xs text-gray-400">A morning heads-up about what needs attention. You choose what and when.</p>

      {/* ── This device ── */}
      <section className="mb-4 rounded-2xl border border-gray-100 bg-white p-3 shadow-sm">
        <div className="flex items-center justify-between">
          <h3 className="flex items-center gap-1.5 text-sm font-bold text-gray-900">{device.enabled ? <Bell className="h-4 w-4 text-primary" /> : <BellOff className="h-4 w-4 text-gray-400" />} This device</h3>
          <Toggle on={device.enabled} onClick={toggleDevice} />
        </div>
        <p className="mt-0.5 text-[11px] text-gray-400">Shows a reminder when you open Vendora in the morning. Works on this device only.</p>
        {!notificationSupported() && <p className="mt-2 rounded-lg bg-gray-50 px-2 py-1.5 text-[11px] text-gray-500">This browser can’t show notifications — use the email digest below instead.</p>}
        {perm === 'denied' && <p className="mt-2 rounded-lg bg-warning-light px-2 py-1.5 text-[11px] text-warning-dark">Notifications are blocked. Turn them on for this site in your browser settings, then try again.</p>}

        {device.enabled && (
          <div className="mt-3 space-y-3">
            <CategoryPicker prefs={device} onChange={patchDevice} />
            <TimeRow label="Show from" icon={Clock} value={device.sendHour} onChange={(v) => patchDevice({ sendHour: v })} />
            <QuietRow prefs={device} onChange={patchDevice} />
            <button type="button" onClick={snoozeToday} className="w-full rounded-xl border border-gray-200 px-3 py-2 text-xs font-semibold text-gray-600 active:scale-95">Snooze until tomorrow</button>
          </div>
        )}

        <div className="mt-3 rounded-xl bg-gray-50 px-3 py-2 text-[11px] text-gray-500">
          Right now this device would show: <b className="text-gray-700">{digestLine(localDigest)}</b>
        </div>
      </section>

      {/* ── Email digest ── */}
      {emailAllowed ? <EmailSection /> : (
        <section className="rounded-2xl border border-gray-100 bg-white p-3 shadow-sm">
          <h3 className="flex items-center gap-1.5 text-sm font-bold text-gray-900"><Mail className="h-4 w-4 text-gray-400" /> Email digest</h3>
          <p className="mt-1 text-[11px] text-gray-400">
            {ACCOUNTS_ENABLED && isLoggedIn()
              ? 'Only the owner or a manager can set up the shop email digest.'
              : 'Log in to your shop account to set up an email digest that arrives even when the app is closed.'}
          </p>
        </section>
      )}

      <p className="mt-4 text-center text-[11px] text-gray-400">Device reminders need the app to be opened. The email digest is the reliable one — it arrives on its own.</p>
    </div>
  );
}

function EmailSection() {
  const [prefs, setPrefs] = useState(null);
  const [configured, setConfigured] = useState(true);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const [preview, setPreview] = useState(null);

  useEffect(() => {
    (async () => {
      try { const r = await getEmailPrefs(); setPrefs(normalise(r.prefs)); setConfigured(!!r.configured); }
      catch { setError('Couldn’t load email settings. Accounts may not be switched on yet.'); }
      finally { setLoading(false); }
    })();
  }, []);

  function normalise(p) {
    return {
      email: { enabled: !!(p && p.email && p.email.enabled) },
      categories: { expiry: p?.categories?.expiry !== false, claims: p?.categories?.claims !== false, tasks: p?.categories?.tasks !== false },
      expiryDays: p?.expiryDays ?? 3,
      sendHour: p?.sendHour ?? 7,
      quietFrom: p?.quietFrom ?? 21,
      quietTo: p?.quietTo ?? 7,
      recipient: p?.recipient || '',
    };
  }

  async function save(next) {
    setPrefs(next); setSaving(true);
    try { const r = await saveEmailPrefs(next); setConfigured(!!r.configured); }
    catch { toast.error('Couldn’t save — try again.'); }
    finally { setSaving(false); }
  }
  async function showPreview() {
    try { const r = await getPreview(); setPreview(r.digest); }
    catch { toast.error('Couldn’t build a preview.'); }
  }

  if (loading) return <section className="rounded-2xl border border-gray-100 bg-white p-6 text-center shadow-sm"><Loader2 className="mx-auto h-5 w-5 animate-spin text-gray-300" /></section>;
  if (error) return <section className="rounded-2xl border border-gray-100 bg-white p-3 shadow-sm"><p className="text-xs text-danger">{error}</p></section>;

  return (
    <section className="rounded-2xl border border-gray-100 bg-white p-3 shadow-sm">
      <div className="flex items-center justify-between">
        <h3 className="flex items-center gap-1.5 text-sm font-bold text-gray-900"><Mail className="h-4 w-4 text-primary" /> Email digest</h3>
        <Toggle on={prefs.email.enabled} onClick={() => save({ ...prefs, email: { enabled: !prefs.email.enabled } })} />
      </div>
      <p className="mt-0.5 text-[11px] text-gray-400">A daily summary emailed to you — arrives even when the app is closed.</p>

      {!configured && (
        <p className="mt-2 rounded-lg bg-warning-light px-2 py-1.5 text-[11px] text-warning-dark">
          Email isn’t switched on for your shop yet. Your choices are saved and take effect once it’s set up (needs an email provider on the server).
        </p>
      )}

      {prefs.email.enabled && (
        <div className="mt-3 space-y-3">
          <label className="block">
            <span className="text-[11px] font-semibold text-gray-500">Send to</span>
            <input value={prefs.recipient} onChange={(e) => setPrefs({ ...prefs, recipient: e.target.value })} onBlur={() => save(prefs)} type="email" placeholder="Your account email" className="mt-0.5 w-full rounded-xl border border-gray-200 px-3 py-2 text-sm focus:border-primary focus:outline-none" />
          </label>
          <CategoryPicker prefs={prefs} onChange={(patch) => save({ ...prefs, ...patch })} />
          <TimeRow label="Send around" icon={Clock} value={prefs.sendHour} onChange={(v) => save({ ...prefs, sendHour: v })} />
          <QuietRow prefs={prefs} onChange={(patch) => save({ ...prefs, ...patch })} />
          <button type="button" onClick={showPreview} className="w-full rounded-xl border border-gray-200 px-3 py-2 text-xs font-semibold text-gray-600 active:scale-95">Show me a preview</button>
          {preview && (
            <div className="rounded-xl bg-gray-50 px-3 py-2 text-[11px] text-gray-600">
              <b className="text-gray-800">Preview:</b> {preview.empty ? 'All clear — nothing to send.' : `${preview.expiry.count} expiring · ${preview.claims.count} claim(s) (£${preview.claims.outstanding.toFixed(2)}) · ${preview.tasks.count} urgent task(s)`}
            </div>
          )}
        </div>
      )}
      {saving && <p className="mt-2 text-[11px] text-gray-400"><Loader2 className="mr-1 inline h-3 w-3 animate-spin" /> Saving…</p>}
    </section>
  );
}

// ── shared controls ──
function Toggle({ on, onClick }) {
  return (
    <button type="button" role="switch" aria-checked={on} onClick={onClick} className={`relative h-6 w-11 shrink-0 rounded-full transition ${on ? 'bg-primary' : 'bg-gray-300'}`}>
      <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition ${on ? 'left-[22px]' : 'left-0.5'}`} />
    </button>
  );
}
function CategoryPicker({ prefs, onChange }) {
  const cats = prefs.categories || {};
  return (
    <div>
      <span className="text-[11px] font-semibold text-gray-500">Tell me about</span>
      <div className="mt-1 space-y-1">
        {CATS.map((c) => {
          const on = cats[c.key] !== false;
          return (
            <button key={c.key} type="button" onClick={() => onChange({ categories: { ...cats, [c.key]: !on } })} className="flex w-full items-center justify-between rounded-lg border border-gray-100 px-2.5 py-1.5 text-xs">
              <span className="text-gray-700">{c.label}</span>
              <span className={`flex h-4 w-4 items-center justify-center rounded ${on ? 'bg-primary text-white' : 'border border-gray-300'}`}>{on && <Check className="h-3 w-3" />}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
function TimeRow({ label, icon: Icon, value, onChange }) {
  return (
    <label className="flex items-center justify-between">
      <span className="flex items-center gap-1.5 text-xs text-gray-600">{Icon && <Icon className="h-3.5 w-3.5 text-gray-400" />}{label}</span>
      <select value={value} onChange={(e) => onChange(Number(e.target.value))} className="rounded-lg border border-gray-200 px-2 py-1 text-xs focus:border-primary focus:outline-none">
        {HOURS.map((h) => <option key={h} value={h}>{hourLabel(h)}</option>)}
      </select>
    </label>
  );
}
function QuietRow({ prefs, onChange }) {
  return (
    <div className="flex items-center justify-between">
      <span className="flex items-center gap-1.5 text-xs text-gray-600"><Moon className="h-3.5 w-3.5 text-gray-400" /> Quiet hours</span>
      <div className="flex items-center gap-1 text-xs">
        <select value={prefs.quietFrom} onChange={(e) => onChange({ quietFrom: Number(e.target.value) })} className="rounded-lg border border-gray-200 px-1.5 py-1 focus:border-primary focus:outline-none">
          {HOURS.map((h) => <option key={h} value={h}>{hourLabel(h)}</option>)}
        </select>
        <span className="text-gray-400">to</span>
        <select value={prefs.quietTo} onChange={(e) => onChange({ quietTo: Number(e.target.value) })} className="rounded-lg border border-gray-200 px-1.5 py-1 focus:border-primary focus:outline-none">
          {HOURS.map((h) => <option key={h} value={h}>{hourLabel(h)}</option>)}
        </select>
      </div>
    </div>
  );
}
