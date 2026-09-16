import React, { useMemo, useState } from 'react';
import toast from 'react-hot-toast';
import { Camera, Plus, Minus, Trash2, PackageCheck, Keyboard } from 'lucide-react';
import { useInventory } from '../../lib/inventoryStore';
import BarcodeScanner, { barcodeScanSupported } from '../scan/BarcodeScanner';

// Scan tab — book in a cash-&-carry delivery. Scan or type barcodes to build a
// goods-in list, then Receive to update stock. Known barcodes prefill; unknown
// ones are quick-created. Local-first; real today.
export default function GoodsInView() {
  const { findByBarcode, receiveLines } = useInventory();
  const [lines, setLines] = useState([]);
  const [code, setCode] = useState('');
  const [scanning, setScanning] = useState(false);

  const totalUnits = useMemo(() => lines.reduce((n, l) => n + (Number(l.qty) || 0), 0), [lines]);

  function addByBarcode(raw) {
    const barcode = (raw || '').trim();
    if (!barcode) return;
    setLines((prev) => {
      const idx = prev.findIndex((l) => l.barcode === barcode);
      if (idx >= 0) {
        const next = [...prev];
        next[idx] = { ...next[idx], qty: (Number(next[idx].qty) || 0) + 1 };
        return next;
      }
      const known = findByBarcode(barcode);
      return [
        {
          key: `${barcode}_${Date.now()}`,
          barcode,
          name: known?.name || '',
          cost: known?.cost ?? '',
          qty: 1,
          isNew: !known,
        },
        ...prev,
      ];
    });
    setCode('');
  }

  function updateLine(key, patch) {
    setLines((prev) => prev.map((l) => (l.key === key ? { ...l, ...patch } : l)));
  }
  function removeLine(key) {
    setLines((prev) => prev.filter((l) => l.key !== key));
  }

  function receive() {
    const clean = lines
      .map((l) => ({ ...l, name: (l.name || '').trim() || 'New item', qty: Number(l.qty) || 0 }))
      .filter((l) => l.qty > 0);
    if (clean.length === 0) return;
    receiveLines(clean);
    toast.success(`Booked in ${totalUnits} item${totalUnits === 1 ? '' : 's'} — stock updated`);
    setLines([]);
  }

  return (
    <div>
      <h2 className="mb-1 text-base font-bold text-gray-900">Book in a delivery</h2>
      <p className="mb-4 text-xs text-gray-400">Scan or type each barcode off the trolley, set the quantity, then Receive.</p>

      {scanning ? (
        <div className="mb-3">
          <BarcodeScanner onScan={(v) => { setScanning(false); addByBarcode(v); }} onClose={() => setScanning(false)} />
        </div>
      ) : (
        <div className="mb-4 flex gap-2">
          <input
            value={code}
            onChange={(e) => setCode(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') addByBarcode(code); }}
            inputMode="numeric"
            placeholder="Barcode"
            className="min-w-0 flex-1 rounded-xl border border-gray-200 px-3 py-2.5 text-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
          />
          <button type="button" onClick={() => addByBarcode(code)} className="rounded-xl bg-gray-100 px-3 py-2.5 text-sm font-semibold text-gray-700 active:scale-95" aria-label="Add barcode">
            <Plus className="h-5 w-5" />
          </button>
          <button type="button" onClick={() => setScanning(true)} className="flex items-center gap-1 rounded-xl bg-primary px-3 py-2.5 text-sm font-semibold text-white active:scale-95">
            <Camera className="h-5 w-5" />
          </button>
        </div>
      )}

      {!barcodeScanSupported && !scanning && (
        <p className="mb-3 flex items-center gap-1.5 text-[11px] text-gray-400">
          <Keyboard className="h-3.5 w-3.5" /> Camera scan needs Chrome/Android — typing works everywhere.
        </p>
      )}

      {lines.length === 0 ? (
        <div className="mt-6 flex flex-col items-center text-center">
          <span className="mb-3 flex h-14 w-14 items-center justify-center rounded-2xl bg-primary-50 text-primary">
            <PackageCheck className="h-7 w-7" strokeWidth={1.75} />
          </span>
          <p className="text-sm font-semibold text-gray-900">Nothing booked in yet</p>
          <p className="mt-1 max-w-xs text-sm text-gray-500">Scan the first item off your cash-&-carry trolley to start.</p>
        </div>
      ) : (
        <>
          <ul className="space-y-2">
            {lines.map((l) => (
              <li key={l.key} className="rounded-2xl border border-gray-100 bg-white p-3 shadow-sm">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <input
                      value={l.name}
                      onChange={(e) => updateLine(l.key, { name: e.target.value })}
                      placeholder="Item name"
                      className="w-full truncate border-none p-0 text-sm font-semibold text-gray-900 placeholder-gray-400 focus:outline-none"
                    />
                    <div className="mt-0.5 flex items-center gap-2 text-[11px] text-gray-500">
                      <span className="font-mono">{l.barcode}</span>
                      {l.isNew && <span className="rounded-full bg-warning-light px-1.5 py-0.5 font-semibold text-warning-dark">New</span>}
                    </div>
                  </div>
                  <button type="button" onClick={() => removeLine(l.key)} className="shrink-0 p-1 text-gray-300 hover:text-danger" aria-label="Remove line">
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
                <div className="mt-2 flex items-center justify-between">
                  <label className="flex items-center gap-1 text-xs text-gray-500">
                    Cost £
                    <input
                      value={l.cost}
                      onChange={(e) => updateLine(l.key, { cost: e.target.value })}
                      inputMode="decimal"
                      placeholder="0.00"
                      className="w-16 rounded-lg border border-gray-200 px-2 py-1 text-sm focus:border-primary focus:outline-none"
                    />
                  </label>
                  <div className="flex items-center gap-3">
                    <button type="button" onClick={() => updateLine(l.key, { qty: Math.max(1, (Number(l.qty) || 1) - 1) })} className="flex h-8 w-8 items-center justify-center rounded-lg bg-gray-100 text-gray-600 active:scale-95" aria-label="Decrease">
                      <Minus className="h-4 w-4" />
                    </button>
                    <span className="w-8 text-center text-base font-bold tabular-nums text-gray-900">{l.qty}</span>
                    <button type="button" onClick={() => updateLine(l.key, { qty: (Number(l.qty) || 0) + 1 })} className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary-50 text-primary active:scale-95" aria-label="Increase">
                      <Plus className="h-4 w-4" />
                    </button>
                  </div>
                </div>
              </li>
            ))}
          </ul>

          <button
            type="button"
            onClick={receive}
            className="mt-4 flex w-full items-center justify-center gap-2 rounded-xl bg-success px-4 py-3.5 text-sm font-semibold text-white shadow-lg shadow-success/30 active:scale-[0.99]"
          >
            <PackageCheck className="h-5 w-5" /> Receive {totalUnits} item{totalUnits === 1 ? '' : 's'} → update stock
          </button>
        </>
      )}
    </div>
  );
}
