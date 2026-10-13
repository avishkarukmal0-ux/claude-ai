import React, { useState } from 'react';
import { Keyboard } from 'lucide-react';
import { isBarcode } from '../../lib/barcode';

// Typed-barcode entry + Check. Shown wherever the camera is closed OR blocked (Scan to identify AND Rapid
// book-in) so a barcode can always be entered by hand. Enforces a real 8–14 digit code with an inline hint.
// `label` lets Rapid use "Add" instead of "Check"; `clearOnSubmit` keeps the field ready for the next item.
export default function TypedBarcodeEntry({ onSubmit, label = 'Check', clearOnSubmit = false, autoFocus = false }) {
  const [typed, setTyped] = useState('');
  const ok = isBarcode(typed);
  function submit(e) {
    e.preventDefault();
    if (!ok) return;
    onSubmit(typed.trim());
    if (clearOnSubmit) setTyped('');
  }
  return (
    <div>
      <form onSubmit={submit} className="flex gap-2">
        <div className="relative flex-1">
          <Keyboard className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
          <input
            value={typed}
            onChange={(e) => setTyped(e.target.value)}
            inputMode="numeric"
            autoFocus={autoFocus}
            placeholder="Type a barcode"
            aria-label="Type a barcode"
            className={`min-h-[44px] w-full rounded-xl border py-2.5 pl-9 pr-3 text-base focus:outline-none ${typed.trim() && !ok ? 'border-danger/50' : 'border-gray-200 focus:border-primary'}`}
          />
        </div>
        <button type="submit" disabled={!ok} className="inline-flex min-h-[44px] items-center rounded-xl bg-gray-900 px-4 text-sm font-semibold text-white disabled:opacity-40">{label}</button>
      </form>
      {typed.trim() && !ok && <p className="mt-1 text-xs font-medium text-danger-dark">Enter 8–14 digits.</p>}
    </div>
  );
}
