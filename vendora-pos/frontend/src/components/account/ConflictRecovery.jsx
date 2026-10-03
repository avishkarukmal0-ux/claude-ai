import React, { useState } from 'react';
import toast from 'react-hot-toast';
import { ArrowLeft, Download, Trash2, GitMerge } from 'lucide-react';
import { getActiveWorkspace } from '../../lib/storage';
import { listConflicts, clearConflicts } from '../../lib/conflictBackup';

// Human labels for the store names we stash.
const STORE_LABEL = {
  inventory_v1: 'Stock', suppliers_v1: 'Suppliers', buylist_v1: 'Buy list', waste_v1: 'Waste',
  takings_v1: 'Takings', movements_v1: 'Stock movements', stocktake_v1: 'Stock count',
  deliveries_v1: 'Deliveries', orders_v1: 'Orders', claims_v1: 'Claims', tasks_v1: 'Tasks',
  requests_v1: 'Customer requests', invoices_v1: 'Invoices', credit_notes_v1: 'Credit notes',
  price_alerts_v1: 'Price changes',
};
const label = (n) => STORE_LABEL[n] || n.replace(/_v1$/, '');

/**
 * Recovered changes (Phase 1.1g). When a newer change from another device replaced one of this device's
 * unsynced edits, we kept the replaced copy. Here the owner can see what happened and download their copy
 * before clearing it — so last-write-wins never means silent data loss.
 */
export default function ConflictRecovery({ onBack }) {
  const ws = getActiveWorkspace();
  const [items, setItems] = useState(() => listConflicts(ws));

  function download() {
    try {
      const payload = { app: 'vendora', kind: 'recovered-changes', exportedAt: new Date().toISOString(), items };
      const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = `vendora-recovered-${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 1000);
      toast.success('Downloaded your replaced copies');
    } catch {
      toast.error('Couldn’t create the file');
    }
  }

  function dismiss() {
    if (!window.confirm('Clear these recovered copies? Download them first if you might need them.')) return;
    clearConflicts(ws);
    setItems([]);
    toast('Cleared', { icon: '🧹' });
  }

  return (
    <div>
      {onBack && (
        <button type="button" onClick={onBack} className="mb-4 inline-flex items-center gap-1 text-sm font-medium text-primary hover:underline">
          <ArrowLeft className="h-4 w-4" /> Back
        </button>
      )}
      <div className="mb-3 flex items-center gap-2">
        <span className="flex h-10 w-10 items-center justify-center rounded-2xl bg-amber-100 text-amber-700"><GitMerge className="h-5 w-5" /></span>
        <div>
          <h2 className="text-base font-bold text-gray-900">Recovered changes</h2>
          <p className="text-xs text-gray-400">Edits replaced by a newer change from another device</p>
        </div>
      </div>

      {items.length === 0 ? (
        <p className="rounded-2xl border border-gray-100 bg-white p-6 text-center text-sm text-gray-500 shadow-sm">
          Nothing here. When two devices change the same thing at once, the most recent change wins and your
          replaced copy is kept here so it’s never lost.
        </p>
      ) : (
        <>
          <p className="mb-3 rounded-xl bg-amber-50 px-3 py-2 text-xs text-amber-800">
            A newer change from another device replaced {items.length} of your edit{items.length === 1 ? '' : 's'}.
            Download your copy if you need to re-apply anything, then clear.
          </p>
          <ul className="space-y-2">
            {items.map((it, i) => (
              <li key={`${it.name}-${it.at}-${i}`} className="rounded-2xl border border-gray-100 bg-white p-3 shadow-sm">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-semibold text-gray-900">{label(it.name)}</span>
                  <span className="text-[11px] text-gray-400">{it.at ? new Date(it.at).toLocaleString('en-GB') : ''}</span>
                </div>
                <p className="mt-1 text-[11px] text-gray-500">Your replaced copy is kept ({Math.max(1, Math.round((it.value || '').length / 1024))} KB).</p>
              </li>
            ))}
          </ul>
          <div className="mt-4 flex gap-2">
            <button type="button" onClick={download} className="flex flex-1 items-center justify-center gap-2 rounded-2xl bg-primary px-4 py-3 text-sm font-semibold text-white active:scale-[0.99]">
              <Download className="h-4 w-4" /> Download my copies
            </button>
            <button type="button" onClick={dismiss} className="flex items-center justify-center gap-2 rounded-2xl border border-gray-200 bg-white px-4 py-3 text-sm font-semibold text-gray-700 active:scale-[0.99]">
              <Trash2 className="h-4 w-4" /> Clear
            </button>
          </div>
        </>
      )}
    </div>
  );
}
