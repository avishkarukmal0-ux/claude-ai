import React, { useMemo, useRef, useState } from 'react';
import toast from 'react-hot-toast';
import {
  Camera, Plus, Minus, Trash2, PackageCheck, Keyboard, Building2, Repeat,
  ChevronLeft, ImagePlus, AlertTriangle, FileText, Check, ShoppingCart,
} from 'lucide-react';
import { useInventory } from '../../lib/inventoryStore';
import { useSuppliers } from '../../lib/supplierStore';
import { useOrders, statusFor, OPEN_STATUSES } from '../../lib/orderStore';
import {
  useDeliveries, blankLine, DELIVERY_ISSUES,
  deliveredUnits, acceptedUnits, orderedUnits, perUnitCost, packSize, deliveryTotals,
} from '../../lib/deliveryStore';
import BarcodeScanner, { barcodeScanSupported } from '../scan/BarcodeScanner';

// Downscale a photo to a small JPEG data URL so evidence photos don't blow storage quota.
function downscaleImage(file, max = 640, quality = 0.6) {
  return new Promise((resolve) => {
    try {
      const img = new Image();
      img.onload = () => {
        const scale = Math.min(1, max / Math.max(img.width, img.height));
        const c = document.createElement('canvas');
        c.width = Math.round(img.width * scale); c.height = Math.round(img.height * scale);
        c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
        resolve(c.toDataURL('image/jpeg', quality));
      };
      img.onerror = () => resolve(null);
      img.src = URL.createObjectURL(file);
    } catch { resolve(null); }
  });
}

const money = (v) => `£${(Number(v) || 0).toFixed(2)}`;

// Stage 2 — receive & check a delivery. Cases/packs with conversion, ordered vs delivered vs
// accepted, discrepancies, notes/photos, drafts (autosaved), duplicate protection, repeat-last.
export default function DeliveryReceivingView() {
  const { findByBarcode, applyDelivery } = useInventory();
  const { suppliers } = useSuppliers();
  const { orders, receiveAgainst } = useOrders();
  const { deliveries, createDraft, updateDraft, removeDelivery, markReceived, repeatFrom } = useDeliveries();

  const openOrders = orders.filter((o) => OPEN_STATUSES.includes(statusFor(o)));

  const [draftId, setDraftId] = useState(null);
  const [draft, setDraft] = useState(null); // working copy (persisted on every change)
  const [code, setCode] = useState('');
  const [scanning, setScanning] = useState(false);
  const photoInputs = useRef({});

  const recent = useMemo(
    () => deliveries.filter((d) => d.status === 'received').sort((a, b) => b.receivedAt - a.receivedAt).slice(0, 8),
    [deliveries],
  );
  const openDrafts = useMemo(() => deliveries.filter((d) => d.status === 'draft'), [deliveries]);

  function edit(d) { setDraft(d); setDraftId(d.id); }
  function commit(nextDraft) { setDraft(nextDraft); updateDraft(nextDraft.id, nextDraft); }

  function start() { edit(createDraft({})); }
  function repeat(id) { const d = repeatFrom(id); if (d) { edit(d); toast('Copied — review quantities & prices before receiving', { icon: '📝' }); } }

  function addByBarcode(raw) {
    const barcode = (raw || '').trim();
    if (!barcode || !draft) return;
    const lines = [...draft.lines];
    const idx = lines.findIndex((l) => l.barcode === barcode);
    if (idx >= 0) {
      lines[idx] = { ...lines[idx], deliveredQty: (Number(lines[idx].deliveredQty) || 0) + 1 };
    } else {
      const known = findByBarcode(barcode);
      lines.unshift(blankLine({ barcode, name: known?.name || '', productId: known?.id || null, unitCost: known?.cost ?? '' }));
    }
    commit({ ...draft, lines });
    setCode('');
  }

  function setLine(key, patch) {
    commit({ ...draft, lines: draft.lines.map((l) => (l.key === key ? { ...l, ...patch } : l)) });
  }
  function removeLine(key) { commit({ ...draft, lines: draft.lines.filter((l) => l.key !== key) }); }

  async function attachPhoto(key, file) {
    if (!file) return;
    const url = await downscaleImage(file);
    if (url) setLine(key, { photo: url });
    else toast.error('Couldn’t read that photo');
  }

  function receive() {
    if (!draft) return;
    const totals = deliveryTotals(draft);
    if (totals.acceptedUnits <= 0) { toast.error('Nothing to receive — add delivered quantities'); return; }
    const res = applyDelivery(draft);
    if (!res.ok) { toast.error(res.error || 'Couldn’t receive'); return; }
    markReceived(draft.id);
    // If this delivery fulfils an order, record the accepted units against it.
    if (draft.orderId) {
      const receipts = (draft.lines || [])
        .map((l) => ({ productId: l.productId, barcode: l.barcode, qty: acceptedUnits(l) }))
        .filter((r) => r.qty > 0);
      if (receipts.length) receiveAgainst(draft.orderId, receipts);
    }
    toast.success(`Received ${res.applied} units into stock`);
    setDraft(null); setDraftId(null);
  }

  // ---- Start screen ---------------------------------------------------------
  if (!draft) {
    return (
      <div>
        <h2 className="mb-1 text-base font-bold text-gray-900">Receive a delivery</h2>
        <p className="mb-4 text-xs text-gray-400">Book in what actually arrived — cases or units, with any shortages or damage.</p>

        <button type="button" onClick={start} className="mb-3 flex w-full items-center justify-center gap-2 rounded-2xl bg-primary px-4 py-3.5 text-sm font-bold text-white shadow-sm active:scale-[0.99]">
          <Plus className="h-4 w-4" /> Start a delivery
        </button>

        {openDrafts.length > 0 && (
          <section className="mb-5">
            <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-400">Unfinished drafts</h3>
            <ul className="space-y-2">
              {openDrafts.map((d) => (
                <li key={d.id} className="flex items-center gap-3 rounded-2xl border border-gray-100 bg-white p-3 shadow-sm">
                  <FileText className="h-4 w-4 shrink-0 text-warning" />
                  <button type="button" onClick={() => edit(d)} className="min-w-0 flex-1 text-left">
                    <span className="block truncate text-sm font-semibold text-gray-900">{d.supplierName || 'Delivery'} {d.reference && `· ${d.reference}`}</span>
                    <span className="block text-[11px] text-gray-500">{d.lines.length} line{d.lines.length === 1 ? '' : 's'} · saved {new Date(d.updatedAt).toLocaleDateString('en-GB')}</span>
                  </button>
                  <button type="button" onClick={() => removeDelivery(d.id)} className="p-1 text-gray-300 hover:text-danger" aria-label="Discard draft"><Trash2 className="h-4 w-4" /></button>
                </li>
              ))}
            </ul>
          </section>
        )}

        {recent.length > 0 && (
          <section>
            <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-400">Recent deliveries</h3>
            <ul className="space-y-2">
              {recent.map((d) => {
                const t = deliveryTotals(d);
                return (
                  <li key={d.id} className="flex items-center gap-3 rounded-2xl border border-gray-100 bg-white p-3 shadow-sm">
                    <PackageCheck className="h-4 w-4 shrink-0 text-success" />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-semibold text-gray-900">{d.supplierName || 'Delivery'} {d.reference && `· ${d.reference}`}</span>
                      <span className="block text-[11px] text-gray-500">{t.acceptedUnits} units · {money(t.cost)}{t.discrepancies > 0 ? ` · ${t.discrepancies} issue${t.discrepancies === 1 ? '' : 's'}` : ''} · {new Date(d.receivedAt).toLocaleDateString('en-GB')}</span>
                    </span>
                    <button type="button" onClick={() => repeat(d.id)} className="flex shrink-0 items-center gap-1 rounded-lg bg-primary-50 px-2 py-1 text-[11px] font-semibold text-primary active:scale-95">
                      <Repeat className="h-3.5 w-3.5" /> Repeat
                    </button>
                  </li>
                );
              })}
            </ul>
          </section>
        )}
      </div>
    );
  }

  // ---- Draft editor ---------------------------------------------------------
  const totals = deliveryTotals(draft);
  return (
    <div>
      <button type="button" onClick={() => { setDraft(null); setDraftId(null); }} className="mb-3 inline-flex items-center gap-1 text-sm font-medium text-primary hover:underline">
        <ChevronLeft className="h-4 w-4" /> Deliveries
      </button>

      {/* Supplier + reference */}
      <div className="mb-3 space-y-2 rounded-2xl border border-gray-100 bg-white p-3 shadow-sm">
        <label className="flex items-center gap-2 text-xs font-medium text-gray-500">
          <Building2 className="h-4 w-4 text-gray-400" />
          <input
            list="supplier-list"
            value={draft.supplierName}
            onChange={(e) => commit({ ...draft, supplierName: e.target.value })}
            placeholder="Supplier (e.g. Booker)"
            className="min-w-0 flex-1 rounded-lg border border-gray-200 px-2 py-1.5 text-sm text-gray-900 focus:border-primary focus:outline-none"
          />
          <datalist id="supplier-list">{suppliers.map((s) => <option key={s.id} value={s.name} />)}</datalist>
        </label>
        <label className="flex items-center gap-2 text-xs font-medium text-gray-500">
          <FileText className="h-4 w-4 text-gray-400" />
          <input
            value={draft.reference}
            onChange={(e) => commit({ ...draft, reference: e.target.value })}
            placeholder="Delivery / invoice reference (optional)"
            className="min-w-0 flex-1 rounded-lg border border-gray-200 px-2 py-1.5 text-sm text-gray-900 focus:border-primary focus:outline-none"
          />
        </label>
        {openOrders.length > 0 && (
          <label className="flex items-center gap-2 text-xs font-medium text-gray-500">
            <ShoppingCart className="h-4 w-4 text-gray-400" />
            <select
              value={draft.orderId || ''}
              onChange={(e) => commit({ ...draft, orderId: e.target.value || null })}
              className="min-w-0 flex-1 rounded-lg border border-gray-200 px-2 py-1.5 text-sm text-gray-900 focus:border-primary focus:outline-none"
            >
              <option value="">Not against an order</option>
              {openOrders.map((o) => <option key={o.id} value={o.id}>{o.supplierName || 'Order'} · {(o.lines || []).length} lines</option>)}
            </select>
          </label>
        )}
      </div>

      {/* Add line */}
      {scanning ? (
        <div className="mb-3"><BarcodeScanner onScan={(v) => { setScanning(false); addByBarcode(v); }} onClose={() => setScanning(false)} /></div>
      ) : (
        <div className="mb-3 flex gap-2">
          <input value={code} onChange={(e) => setCode(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') addByBarcode(code); }} inputMode="numeric" placeholder="Barcode" className="min-w-0 flex-1 rounded-xl border border-gray-200 px-3 py-2.5 text-sm focus:border-primary focus:outline-none" />
          <button type="button" onClick={() => addByBarcode(code)} className="rounded-xl bg-gray-100 px-3 py-2.5 text-gray-700 active:scale-95" aria-label="Add barcode"><Plus className="h-5 w-5" /></button>
          <button type="button" onClick={() => setScanning(true)} className="rounded-xl bg-primary px-3 py-2.5 text-white active:scale-95" aria-label="Scan"><Camera className="h-5 w-5" /></button>
        </div>
      )}
      {!barcodeScanSupported && !scanning && (
        <p className="mb-3 flex items-center gap-1.5 text-[11px] text-gray-400"><Keyboard className="h-3.5 w-3.5" /> Camera scan needs Chrome/Android — typing works everywhere.</p>
      )}

      {draft.lines.length === 0 ? (
        <div className="mt-6 flex flex-col items-center text-center">
          <span className="mb-3 flex h-14 w-14 items-center justify-center rounded-2xl bg-primary-50 text-primary"><PackageCheck className="h-7 w-7" strokeWidth={1.75} /></span>
          <p className="text-sm font-semibold text-gray-900">No items yet</p>
          <p className="mt-1 max-w-xs text-sm text-gray-500">Scan or type the first item on the delivery. Your draft saves automatically.</p>
        </div>
      ) : (
        <ul className="space-y-2 pb-28">
          {draft.lines.map((l) => {
            const du = deliveredUnits(l); const au = acceptedUnits(l); const ou = orderedUnits(l);
            const shortfall = ou > 0 && du < ou;
            const puc = perUnitCost(l);
            return (
              <li key={l.key} className="rounded-2xl border border-gray-100 bg-white p-3 shadow-sm">
                <div className="flex items-start justify-between gap-2">
                  <input value={l.name} onChange={(e) => setLine(l.key, { name: e.target.value })} placeholder="Item name" className="min-w-0 flex-1 border-none p-0 text-sm font-semibold text-gray-900 placeholder-gray-400 focus:outline-none" />
                  <button type="button" onClick={() => removeLine(l.key)} className="shrink-0 p-1 text-gray-300 hover:text-danger" aria-label="Remove line"><Trash2 className="h-4 w-4" /></button>
                </div>
                {l.barcode && <div className="font-mono text-[11px] text-gray-400">{l.barcode}</div>}

                {/* units vs cases + pack size */}
                <div className="mt-2 flex items-center gap-2 text-xs">
                  <div className="inline-flex overflow-hidden rounded-lg border border-gray-200">
                    {['units', 'cases'].map((m) => (
                      <button key={m} type="button" onClick={() => setLine(l.key, { qtyMode: m })} className={`px-2.5 py-1 text-[11px] font-semibold ${l.qtyMode === m ? 'bg-primary text-white' : 'bg-white text-gray-500'}`}>{m}</button>
                    ))}
                  </div>
                  {l.qtyMode === 'cases' && (
                    <label className="flex items-center gap-1 text-gray-500">×
                      <input value={l.packSize} onChange={(e) => setLine(l.key, { packSize: e.target.value })} inputMode="numeric" className="w-12 rounded-lg border border-gray-200 px-2 py-1 text-center" aria-label="Pack size" />
                      per case
                    </label>
                  )}
                </div>

                {/* ordered / delivered / accepted */}
                <div className="mt-2 grid grid-cols-3 gap-2 text-[11px] text-gray-500">
                  <label className="flex flex-col gap-0.5">Ordered
                    <input value={l.orderedQty} onChange={(e) => setLine(l.key, { orderedQty: e.target.value })} inputMode="numeric" placeholder="—" className="rounded-lg border border-gray-200 px-2 py-1 text-center text-sm text-gray-900" />
                  </label>
                  <label className="flex flex-col gap-0.5">Delivered
                    <input value={l.deliveredQty} onChange={(e) => setLine(l.key, { deliveredQty: e.target.value })} inputMode="numeric" className="rounded-lg border border-gray-200 px-2 py-1 text-center text-sm font-semibold text-gray-900" />
                  </label>
                  <label className="flex flex-col gap-0.5">Accepted
                    <input value={l.acceptedQty} onChange={(e) => setLine(l.key, { acceptedQty: e.target.value })} inputMode="numeric" placeholder={String(l.deliveredQty)} className="rounded-lg border border-gray-200 px-2 py-1 text-center text-sm text-gray-900" />
                  </label>
                </div>

                {/* cost */}
                <div className="mt-2 flex items-center gap-3 text-[11px] text-gray-500">
                  {l.qtyMode === 'cases' ? (
                    <label className="flex items-center gap-1">Case cost £
                      <input value={l.caseCost} onChange={(e) => setLine(l.key, { caseCost: e.target.value })} inputMode="decimal" placeholder="0.00" className="w-16 rounded-lg border border-gray-200 px-2 py-1 text-sm text-gray-900" />
                    </label>
                  ) : (
                    <label className="flex items-center gap-1">Unit cost £
                      <input value={l.unitCost} onChange={(e) => setLine(l.key, { unitCost: e.target.value })} inputMode="decimal" placeholder="0.00" className="w-16 rounded-lg border border-gray-200 px-2 py-1 text-sm text-gray-900" />
                    </label>
                  )}
                  <span className="text-gray-400">= {money(puc)}/unit</span>
                </div>

                {/* conversion + accepted summary */}
                <div className="mt-2 rounded-lg bg-gray-50 px-2 py-1.5 text-[11px] text-gray-600">
                  {l.qtyMode === 'cases' ? `${l.deliveredQty || 0} cases × ${packSize(l)} = ` : ''}<span className="font-semibold text-gray-900">{du} units delivered</span>
                  {au !== du && <span className="text-warning-dark"> · {au} accepted</span>}
                  {shortfall && <span className="text-danger"> · short {ou - du} vs ordered</span>}
                </div>

                {/* issues */}
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {Object.entries(DELIVERY_ISSUES).map(([k, v]) => (
                    <button key={k} type="button" onClick={() => setLine(l.key, { issue: l.issue === k ? null : k })} className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${l.issue === k ? 'bg-danger text-white' : 'bg-gray-100 text-gray-500'}`}>{v.label}</button>
                  ))}
                </div>

                {/* note + photo */}
                <div className="mt-2 flex items-center gap-2">
                  <input value={l.note} onChange={(e) => setLine(l.key, { note: e.target.value })} placeholder="Note (optional)" className="min-w-0 flex-1 rounded-lg border border-gray-200 px-2 py-1 text-[11px] text-gray-900 focus:border-primary focus:outline-none" />
                  {l.photo ? (
                    <img src={l.photo} alt="evidence" className="h-8 w-8 rounded object-cover" />
                  ) : (
                    <button type="button" onClick={() => photoInputs.current[l.key]?.click()} className="flex h-8 w-8 items-center justify-center rounded-lg bg-gray-100 text-gray-500" aria-label="Add photo"><ImagePlus className="h-4 w-4" /></button>
                  )}
                  <input ref={(el) => { photoInputs.current[l.key] = el; }} type="file" accept="image/*" capture="environment" hidden onChange={(e) => { attachPhoto(l.key, e.target.files?.[0]); e.target.value = ''; }} />
                </div>
              </li>
            );
          })}
        </ul>
      )}

      {/* Sticky receive bar */}
      {draft.lines.length > 0 && (
        <div className="fixed inset-x-0 bottom-16 z-10 mx-auto max-w-2xl px-4">
          <div className="rounded-2xl border border-gray-100 bg-white p-3 shadow-lg">
            <div className="mb-2 flex items-center justify-between text-xs text-gray-500">
              <span><span className="font-bold text-gray-900">{totals.acceptedUnits}</span> units · {money(totals.cost)}</span>
              {totals.discrepancies > 0 && <span className="flex items-center gap-1 font-semibold text-danger"><AlertTriangle className="h-3.5 w-3.5" /> {totals.discrepancies} to check</span>}
            </div>
            <button type="button" onClick={receive} className="flex w-full items-center justify-center gap-2 rounded-xl bg-success px-4 py-3 text-sm font-bold text-white shadow active:scale-[0.99]">
              <Check className="h-5 w-5" /> Receive → update stock &amp; costs
            </button>
            <p className="mt-1 text-center text-[10px] text-gray-400">Updates stock and purchase cost. Retail prices are never changed automatically.</p>
          </div>
        </div>
      )}
    </div>
  );
}
