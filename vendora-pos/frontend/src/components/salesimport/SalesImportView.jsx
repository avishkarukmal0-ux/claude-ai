import React, { useMemo, useRef, useState } from 'react';
import toast from 'react-hot-toast';
import {
  ArrowLeft, FileSpreadsheet, Upload, TrendingUp, Check, AlertTriangle, Undo2, Info,
} from 'lucide-react';
import { useInventory } from '../../lib/inventoryStore';
import {
  useSalesImport, parseCSV, guessMapping, buildImport, MAX_AGE_DAYS,
} from '../../lib/salesImportStore';

const FIELD_LABELS = {
  barcode: 'Barcode',
  name: 'Product name',
  qty: 'Quantity sold',
  date: 'Date',
  amount: 'Sale value (optional)',
};
const FIELD_HINTS = {
  barcode: 'Matched to your products first',
  name: 'Used when no barcode matches',
  qty: 'Required',
  date: 'Optional — set a date below if your file has none',
  amount: 'Optional — for a sales-value summary only',
};

function fmtDate(ts) {
  if (!ts) return '—';
  return new Date(ts).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}
function todayInput() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

// Optional till/EPOS CSV import → confirmed sale movements (velocity evidence). Never changes stock.
export default function SalesImportView({ onBack }) {
  const { products } = useInventory();
  const { imports, isDuplicate, applyImport, undoImport } = useSalesImport();
  const fileRef = useRef(null);

  const [parsed, setParsed] = useState(null); // { headers, rows }
  const [fileName, setFileName] = useState('');
  const [mapping, setMapping] = useState(null);
  const [defaultDate, setDefaultDate] = useState(todayInput());

  function onFile(e) {
    const file = e.target.files?.[0];
    e.target.value = ''; // allow re-selecting the same file
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const out = parseCSV(String(reader.result || ''));
      if (!out.headers.length || !out.rows.length) {
        toast.error('That file has no rows we can read.');
        return;
      }
      setParsed(out);
      setFileName(file.name);
      setMapping(guessMapping(out.headers));
    };
    reader.onerror = () => toast.error('Could not read that file.');
    reader.readAsText(file);
  }

  const defaultDateTs = useMemo(() => {
    const t = Date.parse(defaultDate);
    return Number.isNaN(t) ? null : t;
  }, [defaultDate]);

  const analysis = useMemo(() => {
    if (!parsed || !mapping) return null;
    return buildImport({
      rows: parsed.rows, mapping, products,
      defaultDate: mapping.date >= 0 ? null : defaultDateTs,
    });
  }, [parsed, mapping, products, defaultDateTs]);

  const dup = analysis ? isDuplicate(analysis.importId) : false;
  const canApply = analysis && analysis.lines.length > 0 && !dup;
  const noDateColumn = mapping && mapping.date < 0;

  function reset() {
    setParsed(null); setMapping(null); setFileName('');
  }

  function apply() {
    if (!analysis) return;
    const res = applyImport(analysis, { fileName });
    if (res.ok) {
      toast.success(`Imported ${analysis.unitsTotal} sales across ${analysis.productsMatched} products`);
      reset();
    } else if (res.reason === 'duplicate') {
      toast.error('Looks like this exact file was already imported.');
    } else {
      toast.error('Nothing to import.');
    }
  }

  function onUndo(im) {
    const removed = undoImport(im.importId);
    toast.success(removed ? 'Import reversed' : 'Nothing to reverse');
  }

  return (
    <div>
      <button type="button" onClick={onBack} className="mb-4 inline-flex items-center gap-1 text-sm font-medium text-primary hover:underline">
        <ArrowLeft className="h-4 w-4" /> Home
      </button>
      <h2 className="mb-1 text-base font-bold text-gray-900">Import till sales</h2>
      <p className="mb-4 text-xs text-gray-400">
        Optional. Upload a sales export from your till/EPOS to turn estimated sell-through into
        confirmed sales. This is used for reorder and insights only — it does not change your stock counts.
      </p>

      {!parsed && (
        <>
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            className="flex w-full flex-col items-center gap-2 rounded-2xl border-2 border-dashed border-gray-200 bg-white p-8 text-center active:scale-[0.99]"
          >
            <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-primary-50 text-primary"><Upload className="h-7 w-7" strokeWidth={1.75} /></span>
            <span className="text-sm font-semibold text-gray-900">Choose a CSV file</span>
            <span className="max-w-xs text-xs text-gray-500">A file with a row per product (or per sale line) — barcode/name, quantity, and ideally a date.</span>
          </button>
          <input ref={fileRef} type="file" accept=".csv,text/csv,text/plain" onChange={onFile} hidden />

          <div className="mt-4 flex items-start gap-2 rounded-2xl bg-blue-50 p-3 text-xs text-blue-800">
            <Info className="mt-0.5 h-4 w-4 shrink-0" />
            <span>Sales are matched to products by barcode, then by name. We only count sales from the last {MAX_AGE_DAYS} days. Your current stock quantities stay exactly as they are.</span>
          </div>

          {imports.length > 0 && <History imports={imports} onUndo={onUndo} />}
        </>
      )}

      {parsed && mapping && (
        <>
          <div className="mb-3 flex items-center justify-between rounded-2xl border border-gray-100 bg-white p-3 shadow-sm">
            <span className="flex min-w-0 items-center gap-2">
              <FileSpreadsheet className="h-5 w-5 shrink-0 text-primary" />
              <span className="min-w-0">
                <span className="block truncate text-sm font-semibold text-gray-900">{fileName}</span>
                <span className="block text-[11px] text-gray-400">{parsed.rows.length} rows · {parsed.headers.length} columns</span>
              </span>
            </span>
            <button type="button" onClick={reset} className="shrink-0 text-xs font-semibold text-gray-400 hover:text-gray-600">Change</button>
          </div>

          <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-400">Match your columns</h3>
          <div className="mb-3 space-y-2 rounded-2xl border border-gray-100 bg-white p-3 shadow-sm">
            {Object.keys(FIELD_LABELS).map((field) => (
              <label key={field} className="flex items-center gap-2">
                <span className="w-32 shrink-0">
                  <span className="block text-xs font-semibold text-gray-800">{FIELD_LABELS[field]}</span>
                  <span className="block text-[10px] text-gray-400">{FIELD_HINTS[field]}</span>
                </span>
                <select
                  value={mapping[field]}
                  onChange={(e) => setMapping((m) => ({ ...m, [field]: Number(e.target.value) }))}
                  className="min-w-0 flex-1 rounded-xl border border-gray-200 px-2 py-2 text-sm focus:border-primary focus:outline-none"
                >
                  <option value={-1}>— none —</option>
                  {parsed.headers.map((h, i) => (
                    <option key={i} value={i}>{h || `Column ${i + 1}`}</option>
                  ))}
                </select>
              </label>
            ))}
          </div>

          {noDateColumn && (
            <label className="mb-3 flex items-center justify-between gap-2 rounded-2xl border border-amber-200 bg-amber-50 p-3">
              <span className="text-xs text-amber-800">No date column — apply all sales to this date:</span>
              <input type="date" value={defaultDate} max={todayInput()} onChange={(e) => setDefaultDate(e.target.value)} className="rounded-lg border border-amber-300 bg-white px-2 py-1.5 text-sm text-amber-900 focus:outline-none" />
            </label>
          )}

          {analysis && (
            <>
              <div className="mb-3 grid grid-cols-2 gap-2">
                <Stat label="Sales matched" value={`${analysis.unitsTotal}`} sub={`${analysis.productsMatched} products`} good />
                <Stat label="Not matched" value={`${analysis.unmatched.length}`} sub="rows skipped" warn={analysis.unmatched.length > 0} />
                {analysis.hasValue && <Stat label="Sales value" value={`£${analysis.valueTotal.toFixed(2)}`} sub="from your file" />}
                <Stat label="Date range" value={analysis.from ? fmtDate(analysis.from) : '—'} sub={analysis.to && analysis.to !== analysis.from ? `to ${fmtDate(analysis.to)}` : 'single day'} />
              </div>

              {(analysis.invalid.length > 0 || analysis.tooOld > 0) && (
                <p className="mb-3 text-[11px] text-gray-400">
                  {analysis.invalid.length > 0 && `${analysis.invalid.length} rows skipped (no quantity/date). `}
                  {analysis.tooOld > 0 && `${analysis.tooOld} rows older than ${MAX_AGE_DAYS} days skipped.`}
                </p>
              )}

              {analysis.unmatched.length > 0 && (
                <div className="mb-3 rounded-2xl border border-gray-100 bg-white p-3 shadow-sm">
                  <p className="mb-1.5 text-xs font-semibold text-gray-700">Couldn’t match these to a product:</p>
                  <ul className="space-y-0.5 text-[11px] text-gray-500">
                    {analysis.unmatched.slice(0, 6).map((u, i) => (
                      <li key={i} className="truncate">{u.name || u.barcode || 'unknown'} <span className="text-gray-300">· {u.qty}</span></li>
                    ))}
                    {analysis.unmatched.length > 6 && <li className="text-gray-400">+{analysis.unmatched.length - 6} more</li>}
                  </ul>
                  <p className="mt-1.5 text-[10px] text-gray-400">Add these as products first (with the right barcode) to include them.</p>
                </div>
              )}

              {dup && (
                <div className="mb-3 flex items-start gap-2 rounded-2xl bg-amber-50 p-3 text-xs text-amber-800">
                  <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                  <span>This exact set of sales was already imported. Importing again is blocked to avoid double-counting.</span>
                </div>
              )}

              <button
                type="button"
                onClick={apply}
                disabled={!canApply}
                className="flex w-full items-center justify-center gap-2 rounded-2xl bg-primary px-4 py-3 text-sm font-semibold text-white active:scale-[0.99] disabled:cursor-not-allowed disabled:bg-gray-200 disabled:text-gray-400"
              >
                <TrendingUp className="h-4 w-4" />
                {analysis.lines.length ? `Import ${analysis.unitsTotal} sales` : 'Nothing to import'}
              </button>
              <p className="mt-2 text-center text-[10px] text-gray-400">This adds sales history only. Stock counts are unchanged.</p>
            </>
          )}
        </>
      )}
    </div>
  );
}

function Stat({ label, value, sub, good, warn }) {
  return (
    <div className={`rounded-2xl border p-3 shadow-sm ${good ? 'border-emerald-100 bg-emerald-50' : warn ? 'border-amber-100 bg-amber-50' : 'border-gray-100 bg-white'}`}>
      <span className="block text-[10px] font-semibold uppercase tracking-wide text-gray-400">{label}</span>
      <span className={`block text-lg font-bold tabular-nums ${good ? 'text-emerald-700' : warn ? 'text-amber-700' : 'text-gray-900'}`}>{value}</span>
      <span className="block text-[11px] text-gray-400">{sub}</span>
    </div>
  );
}

function History({ imports, onUndo }) {
  return (
    <>
      <h3 className="mb-2 mt-6 text-xs font-semibold uppercase tracking-wide text-gray-400">Previous imports</h3>
      <ul className="space-y-2">
        {imports.map((im) => (
          <li key={im.id} className="flex items-center gap-3 rounded-2xl border border-gray-100 bg-white p-3 shadow-sm">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-emerald-50 text-emerald-600"><Check className="h-4 w-4" /></span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm font-semibold text-gray-900">{im.fileName}</span>
              <span className="block text-[11px] text-gray-400">
                {im.unitsTotal} sales · {im.productsMatched} products
                {im.unmatchedCount > 0 && ` · ${im.unmatchedCount} skipped`}
                {' · '}{fmtDate(im.appliedAt)}
              </span>
            </span>
            <button type="button" onClick={() => onUndo(im)} className="flex shrink-0 items-center gap-1 rounded-lg bg-gray-100 px-2.5 py-1.5 text-[11px] font-semibold text-gray-600 active:scale-95">
              <Undo2 className="h-3.5 w-3.5" /> Undo
            </button>
          </li>
        ))}
      </ul>
    </>
  );
}
