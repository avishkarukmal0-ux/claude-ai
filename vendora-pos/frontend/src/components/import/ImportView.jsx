import React, { useMemo, useState } from 'react';
import toast from 'react-hot-toast';
import { ArrowLeft, Upload, FileText } from 'lucide-react';
import { useInventory } from '../../lib/inventoryStore';
import { parseCSV, toProductRows } from '../../lib/csv';

// Migration / onboarding import — bring products in from an old EPOS or a
// spreadsheet (CSV) in minutes. The switching wedge. Local-first.
const SAMPLE = 'Name,Barcode,Cost,Price,Qty\nCoca-Cola 330ml,5000112637922,0.45,1.20,24\nWalkers Crisps,5000328000000,0.30,0.85,40';

export default function ImportView({ onBack, onDone }) {
  const { importProducts } = useInventory();
  const [text, setText] = useState('');

  const rows = useMemo(() => (text.trim() ? toProductRows(parseCSV(text)) : []), [text]);

  function onFile(e) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => setText(String(reader.result || ''));
    reader.onerror = () => toast.error('Couldn’t read that file');
    reader.readAsText(file);
  }

  function doImport() {
    if (!rows.length) return;
    const { added, skipped } = importProducts(rows);
    toast.success(`Imported ${added} product${added === 1 ? '' : 's'}${skipped ? ` · ${skipped} skipped (duplicate)` : ''}`);
    onDone?.();
  }

  return (
    <div>
      <button type="button" onClick={onBack} className="mb-4 inline-flex items-center gap-1 text-sm font-medium text-primary hover:underline">
        <ArrowLeft className="h-4 w-4" /> Back
      </button>

      <h2 className="mb-1 text-base font-bold text-gray-900">Import products</h2>
      <p className="mb-4 text-xs text-gray-400">Bring your list from an old till or a spreadsheet. Upload a CSV or paste it below.</p>

      <div className="mb-3 flex gap-2">
        <label className="flex flex-1 cursor-pointer items-center justify-center gap-2 rounded-xl bg-primary px-3 py-3 text-sm font-semibold text-white active:scale-[0.99]">
          <Upload className="h-4 w-4" /> Upload CSV
          <input type="file" accept=".csv,text/csv,text/plain" onChange={onFile} hidden />
        </label>
        <button type="button" onClick={() => setText(SAMPLE)} className="rounded-xl border border-gray-200 px-3 py-3 text-sm font-medium text-gray-600 active:scale-95">
          Try sample
        </button>
      </div>

      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        rows={5}
        placeholder="…or paste CSV here: Name, Barcode, Cost, Price, Qty"
        className="mb-1 w-full rounded-xl border border-gray-200 p-3 font-mono text-xs text-gray-900 focus:border-primary focus:outline-none"
      />
      <p className="mb-4 text-[11px] text-gray-400">We detect columns by header (Name / Barcode / Cost / Price / Qty), or read them in that order.</p>

      {rows.length > 0 && (
        <>
          <div className="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-gray-400">
            <FileText className="h-3.5 w-3.5" /> Preview · {rows.length} product{rows.length === 1 ? '' : 's'}
          </div>
          <ul className="mb-4 space-y-1.5">
            {rows.slice(0, 8).map((r, i) => (
              <li key={i} className="flex items-center gap-2 rounded-xl border border-gray-100 bg-white p-2.5 shadow-sm">
                <span className="min-w-0 flex-1 truncate text-sm font-semibold text-gray-900">{r.name}</span>
                {r.barcode && <span className="font-mono text-[11px] text-gray-400">{r.barcode}</span>}
                {r.price !== '' && <span className="text-xs text-gray-500">£{Number(r.price).toFixed(2)}</span>}
                {r.qty !== '' && <span className="text-xs text-gray-400">×{r.qty}</span>}
              </li>
            ))}
            {rows.length > 8 && <li className="px-1 text-[11px] text-gray-400">+{rows.length - 8} more…</li>}
          </ul>
          <button type="button" onClick={doImport} className="flex w-full items-center justify-center gap-2 rounded-xl bg-success px-4 py-3.5 text-sm font-semibold text-white shadow-lg shadow-success/30 active:scale-[0.99]">
            <Upload className="h-5 w-5" /> Import {rows.length} product{rows.length === 1 ? '' : 's'}
          </button>
        </>
      )}
    </div>
  );
}
