import React, { useMemo, useState } from 'react';
import toast from 'react-hot-toast';
import { ArrowLeft, LifeBuoy, Copy, Trash2, Activity } from 'lucide-react';
import { useDiagnostics, clearDiagnostics, makeReference } from '../../lib/diagnostics';
import { getSyncState } from '../../lib/sync';
import { getSaveStatus } from '../../lib/saveStatus';

const KIND_LABEL = { save: 'Failed saves', sync: 'Sync failures', ocr: 'Invoice-scan failures', reminder: 'Reminder failures', other: 'Other' };
const when = (ts) => { try { return new Date(ts).toLocaleString('en-GB'); } catch { return ''; } };

/**
 * Help & diagnostics (Phase 3.10). Shows a safe, non-sensitive health summary (app version, sync state,
 * failure counts, recent issue types) and a "Report a problem" flow that mints a reference number and a
 * COPYABLE summary. Nothing is transmitted automatically — no shop data, documents or customer details are
 * ever included or sent; the owner copies the summary and sends it to their support contact themselves.
 */
export default function SupportView({ onBack }) {
  const diag = useDiagnostics();
  const [reference, setReference] = useState(null);
  const sync = (() => { try { return getSyncState(); } catch { return {}; } })();
  const save = (() => { try { return getSaveStatus(); } catch { return { failed: [] }; } })();
  const c = diag.counts || {};

  const summary = useMemo(() => {
    const lines = [
      'Vendora problem report',
      reference ? `Reference: ${reference}` : null,
      `App version: ${diag.version}`,
      `When: ${when(Date.now())}`,
      `Sync: ${sync.status || 'n/a'}${sync.pending ? ` (${sync.pending} waiting)` : ''}${sync.lastSyncedAt ? `, last ${when(sync.lastSyncedAt)}` : ''}`,
      `Unsynced save issues now: ${(save.failed || []).length}`,
      `Failure counts — saves ${c.save || 0}, sync ${c.sync || 0}, invoice-scan ${c.ocr || 0}, reminders ${c.reminder || 0}`,
    ].filter(Boolean);
    if (diag.events && diag.events.length) {
      lines.push('Recent issues:');
      for (const e of diag.events.slice(0, 8)) lines.push(` • ${when(e.at)} ${KIND_LABEL[e.kind] || e.kind}${e.code ? ` — ${e.code}` : ''}`);
    }
    lines.push('');
    lines.push('(No shop data, documents or customer details are included.)');
    return lines.join('\n');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [diag, reference, sync.status, sync.pending, sync.lastSyncedAt, save.failed]);

  async function copy() {
    try { await navigator.clipboard.writeText(summary); toast.success('Copied — paste it to your support contact'); }
    catch { toast('Select the text and copy it', { icon: '📋' }); }
  }

  const totalFailures = (c.save || 0) + (c.sync || 0) + (c.ocr || 0) + (c.reminder || 0) + (c.other || 0);

  return (
    <div>
      {onBack && (
        <button type="button" onClick={onBack} className="mb-4 inline-flex items-center gap-1 text-sm font-medium text-primary hover:underline">
          <ArrowLeft className="h-4 w-4" /> Back
        </button>
      )}
      <div className="mb-3 flex items-center gap-2">
        <span className="flex h-10 w-10 items-center justify-center rounded-2xl bg-primary-50 text-primary"><LifeBuoy className="h-5 w-5" /></span>
        <div>
          <h2 className="text-base font-bold text-gray-900">Help &amp; diagnostics</h2>
          <p className="text-xs text-gray-500">A health check you can send to support — no shop data included.</p>
        </div>
      </div>

      {/* Safe status snapshot */}
      <div className="mb-4 rounded-2xl border border-gray-100 bg-white p-4 shadow-sm">
        <div className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-gray-500"><Activity className="h-3.5 w-3.5" /> Status</div>
        <dl className="mt-2 space-y-1 text-sm">
          <Row label="App version" value={diag.version} />
          <Row label="Sync" value={`${sync.status || 'n/a'}${sync.pending ? ` · ${sync.pending} waiting` : ''}`} />
          <Row label="Last synced" value={sync.lastSyncedAt ? when(sync.lastSyncedAt) : 'never'} />
          <Row label="Failures recorded" value={String(totalFailures)} />
        </dl>
        {totalFailures > 0 && (
          <ul className="mt-2 space-y-0.5 border-t border-gray-100 pt-2 text-[11px] text-gray-500">
            {['save', 'sync', 'ocr', 'reminder'].filter((k) => c[k]).map((k) => (
              <li key={k} className="flex justify-between"><span>{KIND_LABEL[k]}</span><span className="tabular-nums">{c[k]}</span></li>
            ))}
          </ul>
        )}
      </div>

      {/* Problem report */}
      <div className="rounded-2xl border border-gray-100 bg-white p-4 shadow-sm">
        <h3 className="text-sm font-bold text-gray-900">Report a problem</h3>
        {!reference ? (
          <>
            <p className="mt-1 text-xs text-gray-500">Create a reference and a short summary to send to support. It contains only the status above — never your stock, invoices or customer details.</p>
            <button type="button" onClick={() => setReference(makeReference())} className="mt-3 rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-white active:scale-[0.99]">Create a problem report</button>
          </>
        ) : (
          <>
            <p className="mt-1 text-xs text-gray-500">Your reference: <span className="font-mono font-semibold text-gray-800">{reference}</span>. Copy the summary and send it to your support contact — nothing is sent automatically.</p>
            <textarea readOnly value={summary} aria-label="Problem report summary" className="mt-2 h-44 w-full resize-none rounded-xl border border-gray-200 bg-gray-50 p-2 font-mono text-[11px] text-gray-700" />
            <div className="mt-2 flex gap-2">
              <button type="button" onClick={copy} className="flex flex-1 items-center justify-center gap-1.5 rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-white active:scale-[0.99]"><Copy className="h-4 w-4" /> Copy summary</button>
            </div>
          </>
        )}
      </div>

      {totalFailures > 0 && (
        <button type="button" onClick={() => { clearDiagnostics(); toast('Diagnostics cleared', { icon: '🧹' }); }} className="mt-3 flex w-full items-center justify-center gap-1.5 rounded-xl border border-gray-200 bg-white px-4 py-2.5 text-xs font-semibold text-gray-600">
          <Trash2 className="h-3.5 w-3.5" /> Clear recorded issues
        </button>
      )}
    </div>
  );
}

function Row({ label, value }) {
  return (
    <div className="flex items-center justify-between">
      <dt className="text-gray-500">{label}</dt>
      <dd className="font-semibold text-gray-900">{value}</dd>
    </div>
  );
}
