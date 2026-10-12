import React, { useState } from 'react';
import toast from 'react-hot-toast';
import { AlertOctagon, Trash2, Download } from 'lucide-react';
import ComplianceNote from './ComplianceNote';
import { useArrayLog, logCsv } from '../../lib/simpleStores';

// Product recall / safety-alert log (Mobile & value / discount). Record a recall or alert you acted on, with
// the supplier evidence you hold. No compliance claim — it's a record to show you acted.
export default function RecallLogTool() {
  const { items, add, remove } = useArrayLog('recall_log_v1', 'rec');
  const [f, setF] = useState({ product: '', supplier: '', action: '', evidence: '' });
  const set = (k) => (e) => setF((p) => ({ ...p, [k]: e.target.value }));

  function save() {
    if (!f.product.trim()) { toast.error('Name the product'); return; }
    const r = add({ product: f.product.trim(), supplier: f.supplier.trim(), action: f.action.trim(), evidence: f.evidence.trim() });
    if (r.ok) { toast.success('Logged'); setF({ product: '', supplier: '', action: '', evidence: '' }); } else toast.error('Couldn’t save');
  }
  function exportCsv() {
    try {
      const csv = logCsv(items, [['Date seen', (e) => new Date(e.at).toLocaleDateString('en-GB')], ['Product', 'product'], ['Supplier', 'supplier'], ['Action', 'action'], ['Evidence', 'evidence']]);
      const blob = new Blob([csv], { type: 'text/csv' }); const url = URL.createObjectURL(blob);
      const a = document.createElement('a'); a.href = url; a.download = `recall-log-${new Date().toISOString().slice(0, 10)}.csv`;
      document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch { toast.error('Couldn’t export'); }
  }

  return (
    <div>
      <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-primary-50 text-primary">
        <AlertOctagon className="h-7 w-7" strokeWidth={1.75} />
      </div>

      <div className="space-y-2">
        <input value={f.product} onChange={set('product')} placeholder="Product recalled / alerted" aria-label="Product" className="w-full rounded-xl border border-gray-200 px-3 py-2.5 text-base text-gray-900 focus:border-primary focus:outline-none" />
        <input value={f.supplier} onChange={set('supplier')} placeholder="Supplier" aria-label="Supplier" className="w-full rounded-xl border border-gray-200 px-3 py-2.5 text-base text-gray-900 focus:border-primary focus:outline-none" />
        <input value={f.action} onChange={set('action')} placeholder="Action taken (pulled, returned, labelled)" aria-label="Action taken" className="w-full rounded-xl border border-gray-200 px-3 py-2.5 text-base text-gray-900 focus:border-primary focus:outline-none" />
        <input value={f.evidence} onChange={set('evidence')} placeholder="Supplier evidence (CE/UKCA, declaration ref)" aria-label="Supplier evidence" className="w-full rounded-xl border border-gray-200 px-3 py-2.5 text-base text-gray-900 focus:border-primary focus:outline-none" />
      </div>
      <button type="button" onClick={save} className="mt-3 inline-flex min-h-[44px] w-full items-center justify-center rounded-xl bg-primary px-3 text-sm font-semibold text-white">Log it</button>

      {items.length > 0 && (
        <>
          <div className="mb-2 mt-5 flex items-center justify-between">
            <h3 className="text-xs font-semibold uppercase tracking-wide text-gray-400">Recent</h3>
            <button type="button" onClick={exportCsv} className="inline-flex min-h-[44px] items-center gap-1 rounded-lg border border-gray-200 px-3 text-xs font-semibold text-gray-700"><Download className="h-4 w-4" /> Export</button>
          </div>
          <ul className="space-y-2">
            {items.slice(0, 20).map((e) => (
              <li key={e.id} className="flex items-center gap-3 rounded-xl border border-gray-100 bg-white p-3 shadow-sm">
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-semibold text-gray-900">{e.product}{e.supplier ? ` · ${e.supplier}` : ''}</span>
                  <span className="block text-xs text-gray-500">{new Date(e.at).toLocaleDateString('en-GB')}{e.action ? ` · ${e.action}` : ''}{e.evidence ? ` · ${e.evidence}` : ''}</span>
                </span>
                <button type="button" onClick={() => remove(e.id)} className="p-1 text-gray-300 hover:text-danger" aria-label="Delete entry"><Trash2 className="h-4 w-4" /></button>
              </li>
            ))}
          </ul>
        </>
      )}

      <ComplianceNote verified="2026-10-12" href="https://www.gov.uk/guidance/product-safety-for-businesses" label="Product safety (GOV.UK)">
        A record that you acted on a recall/alert and the supplier evidence you hold. Product-safety duties are
        changing (Product Regulation &amp; Metrology Act 2025 + 2026 consultation) — confirm current rules.
      </ComplianceNote>
    </div>
  );
}
