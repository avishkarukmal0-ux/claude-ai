import React, { useEffect, useMemo, useState } from 'react';
import toast from 'react-hot-toast';
import {
  ArrowLeft, ScanLine, Keyboard, PackageCheck, Package2, Minus, Plus, Check, PackagePlus, Sparkles, Loader2,
} from 'lucide-react';
import BarcodeScanner, { barcodeScanSupported } from './BarcodeScanner';
import { useInventory, margin } from '../../lib/inventoryStore';
import { getSavedShopType, getFamily } from '../../config/shopTypes';
import { categoriesForFamily, categoriesInUse } from '../../config/categories';
import { lookupBarcode } from '../../lib/productLookup';

// Scan → identify. Scan (or type) a barcode and see exactly what it is: the product, its category, price,
// margin and stock — and whether the scan was a SINGLE or a whole CASE. Book stock in (a case books in
// ×pack size), sell one, or, for an unknown code, add it once so every future scan knows it.
export default function ScanIdentifyView({ onBack }) {
  const inv = useInventory();
  const { products, matchByBarcode } = inv;
  const [mode, setMode] = useState('idle');     // 'idle' | 'camera' | 'result' | 'add'
  const [match, setMatch] = useState(null);     // { product, unit, multiplier }
  const [unknownCode, setUnknownCode] = useState('');
  const [typed, setTyped] = useState('');

  const categorySuggestions = useMemo(() => {
    const family = getFamily(getSavedShopType());
    const used = categoriesInUse(products);
    const presets = categoriesForFamily(family && family.id);
    const seen = new Set();
    return [...used, ...presets].filter((c) => (seen.has(c) ? false : seen.add(c)));
  }, [products]);

  function resolve(code) {
    const c = String(code || '').trim();
    if (!c) return;
    const m = matchByBarcode(c);
    if (m) { setMatch(m); setMode('result'); }
    else { setUnknownCode(c); setMode('add'); }
  }

  function reset() { setMatch(null); setUnknownCode(''); setTyped(''); setMode('idle'); }

  return (
    <div>
      <button type="button" onClick={onBack} className="mb-4 inline-flex items-center gap-1 text-sm font-medium text-primary hover:underline">
        <ArrowLeft className="h-4 w-4" /> Back
      </button>

      {mode === 'camera' && (
        <BarcodeScanner onScan={(code) => resolve(code)} onClose={() => setMode('idle')} />
      )}

      {mode === 'idle' && (
        <div>
          <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-primary-50 text-primary">
            <ScanLine className="h-7 w-7" strokeWidth={1.75} />
          </div>
          <h2 className="text-center text-base font-bold text-gray-900">Scan to identify</h2>
          <p className="mx-auto mb-4 max-w-xs text-center text-sm text-gray-500">
            Point the camera at a barcode to see the product, its price and stock — and whether it’s a single or a case.
          </p>
          {barcodeScanSupported ? (
            <button type="button" onClick={() => setMode('camera')} className="mb-3 flex w-full items-center justify-center gap-2 rounded-2xl bg-primary px-4 py-3 text-sm font-semibold text-white active:scale-[0.99]">
              <ScanLine className="h-4 w-4" /> Open camera
            </button>
          ) : (
            <p className="mb-3 rounded-xl bg-warning-light px-3 py-2 text-xs text-warning-dark">This browser can’t use the camera scanner — type the barcode below instead.</p>
          )}
          <form onSubmit={(e) => { e.preventDefault(); resolve(typed); }} className="flex gap-2">
            <div className="relative flex-1">
              <Keyboard className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
              <input value={typed} onChange={(e) => setTyped(e.target.value)} inputMode="numeric" placeholder="Type a barcode" aria-label="Type a barcode" className="w-full rounded-xl border border-gray-200 py-2.5 pl-9 pr-3 text-sm focus:border-primary focus:outline-none" />
            </div>
            <button type="submit" disabled={!typed.trim()} className="rounded-xl bg-gray-900 px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-40">Check</button>
          </form>
        </div>
      )}

      {mode === 'result' && match && (
        <ResultCard
          match={match}
          onBookedIn={(n, unitWord) => { toast.success(`Booked in ${n} ${unitWord}`); }}
          onSold={() => toast.success('Sold 1')}
          inv={inv}
          onScanNext={() => (barcodeScanSupported ? setMode('camera') : reset())}
          onDone={reset}
        />
      )}

      {mode === 'add' && (
        <AddUnknown
          code={unknownCode}
          categorySuggestions={categorySuggestions}
          onCancel={reset}
          onSave={(fields) => {
            inv.addProduct({ ...fields, barcode: unknownCode });
            toast.success('Added — this barcode is now known');
            reset();
          }}
        />
      )}
    </div>
  );
}

function ResultCard({ match, inv, onBookedIn, onSold, onScanNext, onDone }) {
  const { product: p, unit, multiplier } = match;
  const [cases, setCases] = useState(1);
  const [singles, setSingles] = useState(1);
  const m = margin(p);
  const isCaseScan = unit === 'case';

  function bookCases(nCases) {
    const units = Math.max(1, nCases) * (multiplier || 1);
    const res = inv.bookIn(p.id, units);
    if (res.ok) onBookedIn(res.added, 'units');
  }
  function bookSingles(n) {
    const res = inv.bookIn(p.id, Math.max(1, n));
    if (res.ok) onBookedIn(res.added, res.added === 1 ? 'unit' : 'units');
  }

  return (
    <div>
      <div className={`mb-3 inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-semibold ${isCaseScan ? 'bg-primary text-white' : 'bg-success-light text-success-dark'}`}>
        {isCaseScan ? <Package2 className="h-3.5 w-3.5" /> : <Check className="h-3.5 w-3.5" />}
        {isCaseScan ? `Case barcode — ${multiplier} per case` : 'Single barcode'}
      </div>

      <div className="rounded-2xl border border-gray-100 bg-white p-4 shadow-sm">
        <h2 className="text-lg font-bold text-gray-900">{p.name}</h2>
        <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-gray-500">
          {p.category && <span className="rounded-full bg-gray-100 px-2 py-0.5 font-medium text-gray-600">{p.category}</span>}
          {Number.isFinite(p.price) && p.price != null && <span>£{Number(p.price).toFixed(2)}</span>}
          {m != null && <span className={m < 0 ? 'text-danger' : 'text-success'}>{(m * 100).toFixed(0)}% margin</span>}
          {p.packSize > 1 && <span className="inline-flex items-center gap-1"><Package2 className="h-3 w-3" /> case of {p.packSize}</span>}
        </div>
        <div className="mt-3 flex items-baseline gap-1">
          <span className="text-3xl font-extrabold tabular-nums text-gray-900">{Number(p.qty) || 0}</span>
          <span className="text-sm text-gray-500">in stock</span>
        </div>
      </div>

      {/* Book in */}
      <div className="mt-4 rounded-2xl border border-gray-100 bg-white p-4 shadow-sm">
        <h3 className="mb-2 text-sm font-bold text-gray-900">Book in stock</h3>
        {isCaseScan || p.packSize > 1 ? (
          <div className="space-y-2">
            <Stepper label={`Cases (× ${multiplier || p.packSize})`} value={cases} setValue={setCases} />
            <button type="button" onClick={() => bookCases(cases)} className="flex w-full items-center justify-center gap-2 rounded-xl bg-primary px-4 py-3 text-sm font-semibold text-white active:scale-[0.99]">
              <PackageCheck className="h-4 w-4" /> Book in {cases} case{cases === 1 ? '' : 's'} (+{cases * (multiplier || p.packSize || 1)})
            </button>
            <div className="pt-1">
              <Stepper label="Or singles" value={singles} setValue={setSingles} />
              <button type="button" onClick={() => bookSingles(singles)} className="mt-2 w-full rounded-xl border border-gray-200 px-4 py-2.5 text-sm font-semibold text-gray-700 active:scale-[0.99]">
                Book in {singles} single{singles === 1 ? '' : 's'}
              </button>
            </div>
          </div>
        ) : (
          <div>
            <Stepper label="Units" value={singles} setValue={setSingles} />
            <button type="button" onClick={() => bookSingles(singles)} className="mt-2 flex w-full items-center justify-center gap-2 rounded-xl bg-primary px-4 py-3 text-sm font-semibold text-white active:scale-[0.99]">
              <PackageCheck className="h-4 w-4" /> Book in {singles}
            </button>
          </div>
        )}
      </div>

      {/* Sell one (quick) */}
      <button type="button" onClick={() => { const r = inv.sellUnits(p.id, 1); if (r.ok) onSold(); else toast.error(r.error || 'Nothing in stock'); }} className="mt-3 flex w-full items-center justify-center gap-2 rounded-xl border border-gray-200 bg-white px-4 py-2.5 text-sm font-semibold text-gray-700 active:scale-[0.99]">
        <Minus className="h-4 w-4" /> Sell 1
      </button>

      <div className="mt-4 flex gap-2">
        <button type="button" onClick={onScanNext} className="flex-1 rounded-xl bg-gray-900 px-4 py-3 text-sm font-semibold text-white active:scale-[0.99]">Scan next</button>
        <button type="button" onClick={onDone} className="rounded-xl border border-gray-200 px-4 py-3 text-sm font-medium text-gray-600">Done</button>
      </div>
    </div>
  );
}

function AddUnknown({ code, categorySuggestions, onSave, onCancel }) {
  const [f, setF] = useState({ name: '', category: '', cost: '', price: '', qty: '', packSize: '', caseBarcode: '' });
  const [lookup, setLookup] = useState({ state: 'idle' }); // 'idle' | 'searching' | 'found' | 'none'
  const set = (k) => (e) => setF((prev) => ({ ...prev, [k]: e.target.value }));
  const canSave = f.name.trim().length > 0;

  // Try to auto-fill name + category from the public database (via our backend). Best-effort: only fills
  // empty fields, never overwrites what the shopkeeper typed, and silently does nothing if offline / not
  // signed in / not found. Price, cost and stock are never looked up — those are the shop's own.
  useEffect(() => {
    let cancelled = false;
    setLookup({ state: 'searching' });
    lookupBarcode(code).then((r) => {
      if (cancelled) return;
      if (r && r.found && (r.name || r.category)) {
        setF((prev) => ({
          ...prev,
          name: prev.name || r.name || '',
          category: prev.category || r.category || '',
        }));
        setLookup({ state: 'found' });
      } else {
        setLookup({ state: 'none' });
      }
    });
    return () => { cancelled = true; };
  }, [code]);

  return (
    <div>
      <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-warning-light text-warning-dark">
        <PackagePlus className="h-6 w-6" strokeWidth={1.75} />
      </div>
      <h2 className="text-center text-base font-bold text-gray-900">Not in your list yet</h2>
      <p className="mx-auto mb-3 max-w-xs text-center text-sm text-gray-500">
        Add it once and every future scan of <span className="font-mono text-gray-700">{code}</span> will identify it instantly.
      </p>
      {lookup.state === 'searching' && (
        <p className="mb-2 flex items-center justify-center gap-1.5 text-xs text-gray-400"><Loader2 className="h-3.5 w-3.5 animate-spin" /> Looking up the name online…</p>
      )}
      {lookup.state === 'found' && (
        <p className="mb-2 flex items-center justify-center gap-1.5 text-xs text-primary"><Sparkles className="h-3.5 w-3.5" /> Found online — please check it’s right. You still set the price &amp; stock.</p>
      )}
      <div className="rounded-2xl border border-primary/20 bg-primary-50/50 p-3">
        <input value={f.name} onChange={set('name')} placeholder="Product name" aria-label="Product name" className="mb-2 w-full rounded-xl border border-gray-200 px-3 py-2.5 text-sm focus:border-primary focus:outline-none" />
        <input value={f.category} onChange={set('category')} list="vendora-scan-cats" placeholder="Category" aria-label="Category" className="mb-2 w-full rounded-xl border border-gray-200 px-3 py-2.5 text-sm focus:border-primary focus:outline-none" />
        <datalist id="vendora-scan-cats">{categorySuggestions.map((c) => <option key={c} value={c} />)}</datalist>
        <div className="mb-2 grid grid-cols-3 gap-2">
          <input value={f.cost} onChange={set('cost')} inputMode="decimal" placeholder="Cost £" className="rounded-xl border border-gray-200 px-3 py-2.5 text-sm focus:border-primary focus:outline-none" />
          <input value={f.price} onChange={set('price')} inputMode="decimal" placeholder="Sell £" className="rounded-xl border border-gray-200 px-3 py-2.5 text-sm focus:border-primary focus:outline-none" />
          <input value={f.qty} onChange={set('qty')} inputMode="numeric" placeholder="Qty" className="rounded-xl border border-gray-200 px-3 py-2.5 text-sm focus:border-primary focus:outline-none" />
        </div>
        <div className="mb-2 grid grid-cols-2 gap-2">
          <input value={f.packSize} onChange={set('packSize')} inputMode="numeric" placeholder="Units per case" className="rounded-xl border border-gray-200 px-3 py-2.5 text-sm focus:border-primary focus:outline-none" />
          <input value={f.caseBarcode} onChange={set('caseBarcode')} inputMode="numeric" placeholder="Case barcode" className="rounded-xl border border-gray-200 px-3 py-2.5 text-sm focus:border-primary focus:outline-none" />
        </div>
        <div className="flex gap-2">
          <button type="button" disabled={!canSave} onClick={() => onSave(f)} className="flex-1 rounded-xl bg-primary px-3 py-2.5 text-sm font-semibold text-white disabled:opacity-40">Save & identify</button>
          <button type="button" onClick={onCancel} className="rounded-xl border border-gray-200 px-3 py-2.5 text-sm font-medium text-gray-600">Cancel</button>
        </div>
      </div>
    </div>
  );
}

function Stepper({ label, value, setValue }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-sm text-gray-600">{label}</span>
      <div className="flex items-center gap-3">
        <button type="button" onClick={() => setValue((v) => Math.max(1, v - 1))} className="flex h-8 w-8 items-center justify-center rounded-lg bg-gray-100 text-gray-600 active:scale-95" aria-label="Decrease">
          <Minus className="h-4 w-4" />
        </button>
        <span className="w-8 text-center text-base font-bold tabular-nums text-gray-900">{value}</span>
        <button type="button" onClick={() => setValue((v) => v + 1)} className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary-50 text-primary active:scale-95" aria-label="Increase">
          <Plus className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}
