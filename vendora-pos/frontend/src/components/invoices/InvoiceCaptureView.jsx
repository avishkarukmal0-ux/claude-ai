import React, { useEffect, useMemo, useRef, useState } from 'react';
import toast from 'react-hot-toast';
import {
  ArrowLeft, FileText, Camera, Plus, Trash2, Check, AlertTriangle, Loader2, ScanText,
} from 'lucide-react';
import { useInvoices, matchLines, blankInvoiceLine, lineUnitCost, lineTotal, invoiceTotal, validateInvoiceFile } from '../../lib/invoiceStore';
import { useSuppliers } from '../../lib/supplierStore';
import { useInventory } from '../../lib/inventoryStore';
import { useDeliveries } from '../../lib/deliveryStore';
import { useOrders } from '../../lib/orderStore';
import { useClaims } from '../../lib/claimStore';
import { extractInvoiceText } from '../../lib/invoiceOcr';
import { reconcile, discrepanciesToClaimItems } from '../../lib/reconcile';
import { hasClaimFor } from '../../lib/buyingJourney';
import { backupAvailable, backupInvoiceFile, listBackedUp, getBackupState } from '../../lib/cloudDocs';
import { parseInvoiceText } from '../../lib/parseInvoiceText';
import { downscaleImage } from '../../lib/image';
import { recordFailure } from '../../lib/diagnostics';

// Supplier invoice capture + review (Phase 1). Capture a photo/PDF (or enter manually), REVIEW every field
// before committing. Matches lines to existing products, flags unmatched, warns on likely duplicates.
// OCR is optional (behind config): when available we show the extracted text as an aid — never auto-apply.
const gbp = (v) => `£${(Number(v) || 0).toFixed(2)}`;
const dayInput = (ts) => (ts ? new Date(ts).toISOString().slice(0, 10) : '');

export default function InvoiceCaptureView({ onBack, onReconcile }) {
  const { invoices, saveDraft, commitInvoice, removeInvoice, getFile, deleteFile, findDuplicate } = useInvoices();
  const { suppliers } = useSuppliers();
  const { products } = useInventory();
  const [mode, setMode] = useState('list'); // 'list' | 'review' | 'reconcile'
  const [draft, setDraft] = useState(null);
  const [file, setFile] = useState(null);   // { dataUrl, type }
  const [ocr, setOcr] = useState({ busy: false, text: null });
  const [reconcileId, setReconcileId] = useState(null);
  const fileRef = useRef(null);

  // Document backup (Phase 3) — only offered when the flag is on, the shop is signed in, AND the server
  // reports it enabled. `backedUp` is the server's authoritative set; `bkState` is this device's progress.
  const [backupOk, setBackupOk] = useState(false);
  const [backedUp, setBackedUp] = useState(() => new Set());
  const [bkState, setBkState] = useState(() => getBackupState());
  useEffect(() => {
    let live = true;
    (async () => {
      const ok = await backupAvailable();
      if (!live) return;
      setBackupOk(ok);
      if (ok) { try { setBackedUp(await listBackedUp()); } catch { /* offline — leave empty */ } }
    })();
    const refresh = () => setBkState(getBackupState());
    window.addEventListener('vendora:doc-backup', refresh);
    return () => { live = false; window.removeEventListener('vendora:doc-backup', refresh); };
  }, []);

  async function doBackup(inv) {
    const f = getFile(inv.fileId);
    if (!f || !f.dataUrl) { toast.error('That file isn’t on this device to back up.'); return; }
    // Let the data-URL's own mime flow through for images; only force the PDF type. (Stored `type` is the
    // coarse 'image'|'pdf' label, not a real mime, so never pass it as the content type.)
    const r = await backupInvoiceFile({ fileId: inv.fileId, dataUrl: f.dataUrl, type: f.type === 'pdf' ? 'application/pdf' : undefined, invoiceId: inv.id });
    if (r.ok) { setBackedUp((prev) => new Set(prev).add(inv.fileId)); toast.success('Backed up'); }
    else toast.error(r.error || 'Backup failed');
  }

  function startManual() {
    setFile(null); setOcr({ busy: false, text: null });
    setDraft({ supplierId: '', supplierName: '', reference: '', date: Date.now(), lines: [blankInvoiceLine()], source: 'manual' });
    setMode('review');
  }

  async function onFile(e) {
    const f = e.target.files && e.target.files[0];
    e.target.value = '';
    if (!f) return;
    const check = validateInvoiceFile(f); // untrusted upload — validate type + size before reading (Phase 2)
    if (!check.ok) { toast.error(check.error); return; }
    const { isPdf } = check;
    const reader = new FileReader();
    reader.onload = async () => {
      const raw = String(reader.result || '');
      // Shrink photos before we hold them in state/localStorage or send them (Phase 3.9h) — keeps the UI
      // responsive and avoids the quota risk of a full ~8MB base64. PDFs are left as-is.
      const dataUrl = isPdf ? raw : ((await downscaleImage(raw, { maxDim: 1600, quality: 0.7 })) || raw);
      setFile({ dataUrl, type: isPdf ? 'pdf' : 'image' });
      setDraft({ supplierId: '', supplierName: '', reference: '', date: Date.now(), lines: [blankInvoiceLine()], source: 'manual' });
      setMode('review');
      // Optional OCR aid for images only — shown to help manual entry, never auto-applied.
      if (!isPdf) {
        setOcr({ busy: true, text: null });
        const res = await extractInvoiceText(dataUrl);
        // Don't silently drop a genuine OCR failure (Phase 3.10): record it + tell the owner to type it in,
        // distinct from "OCR isn't switched on".
        if (res && res.failed) { recordFailure('ocr', res.error); toast('Couldn’t read the image — type the details in.', { icon: '✏️' }); }
        setOcr({ busy: false, text: res && res.configured && res.text ? res.text : null, configured: res && res.configured });
      }
    };
    reader.onerror = () => toast.error('Couldn’t read that file');
    reader.readAsDataURL(f);
  }

  if (mode === 'reconcile' && reconcileId) {
    const inv = invoices.find((x) => x.id === reconcileId);
    if (!inv) { setMode('list'); setReconcileId(null); return null; }
    return <ReconcileView invoice={inv} onBack={() => { setMode('list'); setReconcileId(null); }} />;
  }

  if (mode === 'review' && draft) {
    return (
      <ReviewForm
        draft={draft} file={file} ocr={ocr} suppliers={suppliers} products={products}
        findDuplicate={findDuplicate}
        onCancel={() => { setMode('list'); setDraft(null); setFile(null); }}
        onSaveDraft={(d) => { const r = saveDraft(d, file); if (r.ok) { toast.success('Invoice saved as draft'); setMode('list'); setDraft(null); setFile(null); } else toast.error(r.error || 'Couldn’t save'); }}
        onCommit={(d) => {
          const r = saveDraft({ ...d, status: 'committed', committedAt: Date.now() }, file);
          if (r.ok) { toast.success('Invoice committed'); setMode('list'); setDraft(null); setFile(null); }
          else toast.error(r.error || 'Couldn’t save');
        }}
      />
    );
  }

  return (
    <div>
      <button type="button" onClick={onBack} className="mb-4 inline-flex items-center gap-1 text-sm font-medium text-primary hover:underline">
        <ArrowLeft className="h-4 w-4" /> Home
      </button>
      <h2 className="mb-1 text-base font-bold text-gray-900">Supplier invoices</h2>
      <p className="mb-4 text-xs text-gray-400">Capture an invoice, check it against your delivery, and claim any discrepancy.</p>

      <div className="mb-4 flex gap-2">
        <button type="button" onClick={() => fileRef.current?.click()} className="flex flex-1 items-center justify-center gap-2 rounded-2xl bg-primary px-4 py-3 text-sm font-semibold text-white active:scale-[0.99]">
          <Camera className="h-4 w-4" /> Capture invoice
        </button>
        <button type="button" onClick={startManual} className="flex flex-1 items-center justify-center gap-2 rounded-2xl border border-gray-200 bg-white px-4 py-3 text-sm font-semibold text-gray-700 active:scale-[0.99]">
          <Plus className="h-4 w-4" /> Enter manually
        </button>
        <input ref={fileRef} type="file" accept="image/*,application/pdf" capture="environment" onChange={onFile} hidden />
      </div>

      {invoices.length === 0 ? (
        <div className="mt-6 flex flex-col items-center text-center">
          <span className="mb-3 flex h-14 w-14 items-center justify-center rounded-2xl bg-primary-50 text-primary"><FileText className="h-7 w-7" strokeWidth={1.75} /></span>
          <p className="text-sm font-semibold text-gray-900">No invoices yet</p>
          <p className="mt-1 max-w-xs text-sm text-gray-500">Snap a supplier invoice or enter it manually to start checking deliveries against what you were charged.</p>
        </div>
      ) : (
        <ul className="space-y-2">
          {invoices.map((inv) => (
            <li key={inv.id} className="rounded-2xl border border-gray-100 bg-white p-3 shadow-sm">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="truncate text-sm font-semibold text-gray-900">{inv.supplierName || 'Unknown supplier'}{inv.reference ? ` · ${inv.reference}` : ''}</div>
                  <div className="mt-0.5 text-[11px] text-gray-500">
                    {inv.date ? new Date(inv.date).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : 'no date'} · {(inv.lines || []).length} line{(inv.lines || []).length === 1 ? '' : 's'} · {gbp(invoiceTotal(inv))}
                  </div>
                  <span className={`mt-1 inline-block rounded-full px-2 py-0.5 text-[10px] font-semibold ${inv.status === 'committed' ? 'bg-success-light text-success-dark' : 'bg-gray-100 text-gray-500'}`}>{inv.status === 'committed' ? 'Committed' : 'Draft'}</span>
                </div>
                <button type="button" onClick={() => { if (window.confirm('Delete this invoice?')) removeInvoice(inv.id); }} className="shrink-0 p-1 text-gray-300 hover:text-danger" aria-label="Delete"><Trash2 className="h-4 w-4" /></button>
              </div>
              <div className="mt-2 flex gap-2">
                {inv.status !== 'committed' && (
                  <button type="button" onClick={() => commitInvoice(inv.id)} className="rounded-lg bg-primary px-2.5 py-1.5 text-[11px] font-semibold text-white active:scale-95">Commit</button>
                )}
                <button type="button" onClick={() => { setReconcileId(inv.id); setMode('reconcile'); }} className="rounded-lg border border-gray-200 px-2.5 py-1.5 text-[11px] font-semibold text-gray-700 active:scale-95">Check vs delivery</button>
                {inv.fileId && (
                  <button type="button" onClick={() => { if (window.confirm('Delete the stored scan/photo but keep the invoice record?')) { deleteFile(inv.id); toast.success('Stored file deleted'); } }} className="rounded-lg border border-gray-200 px-2.5 py-1.5 text-[11px] font-semibold text-gray-500 active:scale-95">Delete file</button>
                )}
                {backupOk && inv.fileId && (() => {
                  const st = backedUp.has(inv.fileId) ? 'uploaded' : (bkState[inv.fileId]?.status || 'none');
                  if (st === 'uploaded') return <span className="inline-flex items-center gap-1 rounded-lg bg-success-light px-2.5 py-1.5 text-[11px] font-semibold text-success-dark"><Check className="h-3.5 w-3.5" /> Backed up</span>;
                  if (st === 'pending') return <span className="rounded-lg border border-gray-200 px-2.5 py-1.5 text-[11px] font-semibold text-gray-400">Backing up…</span>;
                  return <button type="button" onClick={() => doBackup(inv)} className="rounded-lg border border-primary/30 bg-primary-50 px-2.5 py-1.5 text-[11px] font-semibold text-primary active:scale-95">{st === 'failed' ? 'Retry backup' : 'Back up'}</button>;
                })()}
              </div>
              {backupOk && inv.fileId && !backedUp.has(inv.fileId) && (
                <p className="mt-1.5 text-[10px] text-gray-400">Stored on this device only — back up to reach it on another device.</p>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function ReviewForm({ draft, file, ocr, suppliers, products, findDuplicate, onCancel, onSaveDraft, onCommit }) {
  const [f, setF] = useState(draft);
  const set = (k) => (e) => setF((p) => ({ ...p, [k]: e.target.value }));
  const matched = useMemo(() => matchLines(f.lines || [], products), [f.lines, products]);
  const total = useMemo(() => invoiceTotal({ ...f, lines: matched }), [f, matched]);
  const unmatchedCount = matched.filter((l) => (l.name || l.barcode) && !l.matched).length;
  const dup = useMemo(() => findDuplicate({ ...f, total, lines: matched }), [f, total, matched, findDuplicate]);

  function setLine(i, patch) { setF((p) => ({ ...p, lines: p.lines.map((l, idx) => (idx === i ? { ...l, ...patch } : l)) })); }
  function addLine() { setF((p) => ({ ...p, lines: [...p.lines, blankInvoiceLine()] })); }
  function removeLine(i) { setF((p) => ({ ...p, lines: p.lines.filter((_, idx) => idx !== i) })); }
  // Heuristic pre-fill from the scanned text (human-review gated — every line is flagged uncertain and
  // still needs checking + an explicit commit; nothing is applied to stock or money here).
  function fillFromText() {
    const { lines } = parseInvoiceText(ocr.text);
    if (!lines.length) { toast('Couldn’t pick out lines automatically — enter them below'); return; }
    setF((p) => ({ ...p, lines: lines.map((l) => blankInvoiceLine(l)) }));
    toast('Lines pre-filled from the scan — check every figure before committing');
  }

  const payload = () => ({ ...f, total, lines: matched });
  const canSave = (f.supplierName || f.supplierId) && (f.lines || []).some((l) => l.name || l.barcode);

  return (
    <div>
      <button type="button" onClick={onCancel} className="mb-4 inline-flex items-center gap-1 text-sm font-medium text-primary hover:underline">
        <ArrowLeft className="h-4 w-4" /> Back
      </button>
      <h2 className="mb-3 text-base font-bold text-gray-900">Review invoice</h2>

      {file && (
        <div className="mb-3 overflow-hidden rounded-xl border border-gray-200">
          {file.type === 'image'
            ? <img src={file.dataUrl} alt="Invoice" className="max-h-48 w-full object-contain bg-gray-50" />
            : <div className="flex items-center gap-2 p-3 text-sm text-gray-600"><FileText className="h-5 w-5 text-gray-400" /> PDF attached</div>}
        </div>
      )}

      {ocr.busy && <p className="mb-2 flex items-center gap-1.5 text-xs text-gray-400"><Loader2 className="h-3.5 w-3.5 animate-spin" /> Reading the invoice…</p>}
      {ocr.text && (
        <details className="mb-3 rounded-xl border border-gray-200 bg-gray-50 p-2 text-xs text-gray-600">
          <summary className="flex cursor-pointer items-center gap-1 font-medium text-gray-700"><ScanText className="h-3.5 w-3.5" /> Scanned text (check &amp; type the figures below)</summary>
          <pre className="mt-2 max-h-40 overflow-auto whitespace-pre-wrap text-[11px]">{ocr.text}</pre>
          <button type="button" onClick={fillFromText} className="mt-2 rounded-lg border border-gray-300 bg-white px-2.5 py-1.5 text-[11px] font-semibold text-gray-700 active:scale-95">Fill lines from this text (then check each)</button>
        </details>
      )}

      {dup && (
        <div className="mb-3 flex items-start gap-2 rounded-xl bg-warning-light p-2.5 text-xs text-warning-dark">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" /> This looks like a duplicate of an invoice you already have ({dup.supplierName} · {dup.reference || 'no ref'}). Check before committing.
        </div>
      )}

      {/* Header fields */}
      <div className="space-y-2">
        <input value={f.supplierName} onChange={set('supplierName')} list="vendora-invoice-suppliers" placeholder="Supplier" aria-label="Supplier" className="w-full rounded-xl border border-gray-200 px-3 py-2.5 text-sm focus:border-primary focus:outline-none" />
        <datalist id="vendora-invoice-suppliers">{suppliers.map((s) => <option key={s.id} value={s.name} />)}</datalist>
        <div className="grid grid-cols-2 gap-2">
          <input value={f.reference} onChange={set('reference')} placeholder="Invoice ref" aria-label="Invoice reference" className="rounded-xl border border-gray-200 px-3 py-2.5 text-sm focus:border-primary focus:outline-none" />
          <input type="date" value={dayInput(f.date)} onChange={(e) => setF((p) => ({ ...p, date: e.target.value ? new Date(e.target.value).getTime() : null }))} aria-label="Invoice date" className="rounded-xl border border-gray-200 px-3 py-2.5 text-sm focus:border-primary focus:outline-none" />
        </div>
      </div>

      {/* Lines */}
      <h3 className="mb-1 mt-4 text-xs font-semibold uppercase tracking-wide text-gray-400">Lines</h3>
      <p className="mb-2 text-[11px] leading-snug text-gray-400">Enter the quantity, whether it’s in <strong>units</strong> or <strong>cases</strong>, the <strong>units per case</strong> (for cases), and the cost (<strong>£ per case</strong> or <strong>£ per unit</strong> to match). The per-single-unit cost is worked out below each line.</p>
      <ul className="space-y-2">
        {matched.map((l, i) => (
          <li key={l.id} className="rounded-xl border border-gray-100 bg-white p-2.5 shadow-sm">
            <div className="mb-1.5 flex items-center gap-2">
              <input value={l.name} onChange={(e) => setLine(i, { name: e.target.value })} list="vendora-invoice-products" placeholder="Product" className="min-w-0 flex-1 rounded-lg border border-gray-200 px-2 py-1.5 text-sm focus:border-primary focus:outline-none" />
              {(l.name || l.barcode) && (
                <span className={`shrink-0 rounded-full px-1.5 py-0.5 text-[10px] font-semibold ${l.matched ? 'bg-success-light text-success-dark' : 'bg-warning-light text-warning-dark'}`}>{l.matched ? 'matched' : 'new'}</span>
              )}
              <button type="button" onClick={() => removeLine(i)} className="shrink-0 p-1 text-gray-300 hover:text-danger" aria-label="Remove line"><Trash2 className="h-3.5 w-3.5" /></button>
            </div>
            <div className="grid grid-cols-4 gap-1.5">
              <input value={l.qty} onChange={(e) => setLine(i, { qty: e.target.value })} inputMode="decimal" placeholder="Qty" aria-label="Quantity" className="rounded-lg border border-gray-200 px-2 py-1.5 text-sm focus:border-primary focus:outline-none" />
              <select value={l.qtyMode} onChange={(e) => setLine(i, { qtyMode: e.target.value })} aria-label="Units or cases" className="rounded-lg border border-gray-200 bg-white px-1 py-1.5 text-xs text-gray-700 focus:border-primary focus:outline-none">
                <option value="units">units</option>
                <option value="cases">cases</option>
              </select>
              <input value={l.packSize} onChange={(e) => setLine(i, { packSize: e.target.value })} inputMode="numeric" placeholder="Units/case" aria-label="Units per case" title="How many single units are in one case" className="rounded-lg border border-gray-200 px-2 py-1.5 text-sm focus:border-primary focus:outline-none" />
              <input value={l.qtyMode === 'cases' ? l.caseCost : l.unitCost} onChange={(e) => setLine(i, l.qtyMode === 'cases' ? { caseCost: e.target.value } : { unitCost: e.target.value })} inputMode="decimal" placeholder={l.qtyMode === 'cases' ? '£/case' : '£/unit'} aria-label="Cost" className="rounded-lg border border-gray-200 px-2 py-1.5 text-sm focus:border-primary focus:outline-none" />
            </div>
            <div className="mt-1 text-right text-[11px] text-gray-500">{gbp(lineUnitCost(l))}/unit · line {gbp(lineTotal(l))}</div>
          </li>
        ))}
      </ul>
      <datalist id="vendora-invoice-products">{products.map((p) => <option key={p.id} value={p.name} />)}</datalist>
      <button type="button" onClick={addLine} className="mt-2 text-xs font-medium text-primary">+ Add line</button>

      <div className="mt-4 flex items-center justify-between rounded-xl bg-gray-50 p-3">
        <span className="text-sm text-gray-500">Invoice total{unmatchedCount > 0 ? ` · ${unmatchedCount} unmatched` : ''}</span>
        <span className="text-lg font-extrabold tabular-nums text-gray-900">{gbp(total)}</span>
      </div>

      <div className="mt-3 flex gap-2">
        <button type="button" disabled={!canSave} onClick={() => onSaveDraft(payload())} className="flex-1 rounded-xl border border-gray-200 px-4 py-2.5 text-sm font-semibold text-gray-700 disabled:opacity-40">Save draft</button>
        <button type="button" disabled={!canSave} onClick={() => onCommit(payload())} className="flex flex-1 items-center justify-center gap-1 rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-40"><Check className="h-4 w-4" /> Commit</button>
      </div>
      <p className="mt-2 text-center text-[11px] text-gray-400">Nothing is applied to stock here — committing just confirms the invoice figures for checking &amp; price history.</p>
    </div>
  );
}

// Delivery ↔ invoice reconciliation (Phase 1.2). Pick a received delivery for the same supplier, see the
// explained discrepancies, and raise a claim through the existing claims workflow. No order required.
function ReconcileView({ invoice, onBack }) {
  const { deliveries } = useDeliveries();
  const { orders } = useOrders();
  const { claims, createClaim } = useClaims();
  const supKey = (invoice.supplierName || '').trim().toLowerCase();
  const candidates = useMemo(() => deliveries.filter((d) => d.status === 'received'
    && (!supKey || (d.supplierName || '').trim().toLowerCase() === supKey)), [deliveries, supKey]);
  const [deliveryId, setDeliveryId] = useState(candidates[0] ? candidates[0].id : '');
  const [excluded, setExcluded] = useState(() => new Set());
  const delivery = candidates.find((d) => d.id === deliveryId) || deliveries.find((d) => d.id === deliveryId) || null;
  // If the delivery was booked against an order, include it so reconcile can also compare ordered qty +
  // agreed price (info only — it never adds claimable amounts, so no double counting).
  const order = delivery && delivery.orderId ? orders.find((o) => o.id === delivery.orderId) : null;
  const result = useMemo(() => (delivery ? reconcile({ delivery, invoice, order }) : null), [delivery, invoice, order]);

  const claimable = (result ? result.discrepancies : []).filter((d) => d.claimReason);
  const info = (result ? result.discrepancies : []).filter((d) => !d.claimReason);
  const selected = claimable.filter((_, i) => !excluded.has(i));
  const selectedTotal = selected.reduce((s, d) => s + d.overcharge, 0);

  function toggle(i) { setExcluded((prev) => { const n = new Set(prev); if (n.has(i)) n.delete(i); else n.add(i); return n; }); }
  function raise() {
    const items = discrepanciesToClaimItems(selected);
    if (!items.length) { toast('Nothing selected to claim'); return; }
    // Prevent a duplicate claim for the same delivery/invoice pairing (mandate: no duplicate claims).
    if (hasClaimFor(claims, { deliveryId: delivery.id, invoiceId: invoice.id })) {
      toast.error('A claim already exists for this delivery/invoice — edit it in Supplier claims.');
      return;
    }
    const c = createClaim({ supplierId: invoice.supplierId, supplierName: invoice.supplierName, deliveryId: delivery.id, deliveryRef: delivery.reference || invoice.reference || '', invoiceId: invoice.id, invoiceRef: invoice.reference || '', items });
    if (c) { toast.success('Claim drafted — review it in Supplier claims'); onBack(); }
    else toast.error('Couldn’t create the claim');
  }

  return (
    <div>
      <button type="button" onClick={onBack} className="mb-4 inline-flex items-center gap-1 text-sm font-medium text-primary hover:underline">
        <ArrowLeft className="h-4 w-4" /> Back
      </button>
      <h2 className="mb-1 text-base font-bold text-gray-900">Check vs delivery</h2>
      <p className="mb-3 text-xs text-gray-400">{invoice.supplierName || 'Invoice'}{invoice.reference ? ` · ${invoice.reference}` : ''} · {gbp(invoiceTotal(invoice))}</p>

      {candidates.length === 0 ? (
        <p className="rounded-xl bg-gray-50 px-3 py-6 text-center text-sm text-gray-400">No received deliveries for this supplier to check against. Receive a delivery first (Scan → Receive a delivery).</p>
      ) : (
        <>
          <label className="mb-3 block">
            <span className="mb-1 block text-xs font-medium text-gray-500">Delivery to compare</span>
            <select value={deliveryId} onChange={(e) => { setDeliveryId(e.target.value); setExcluded(new Set()); }} className="w-full rounded-xl border border-gray-200 bg-white px-3 py-2.5 text-sm focus:border-primary focus:outline-none">
              {candidates.map((d) => <option key={d.id} value={d.id}>{(d.reference || 'Delivery')} · {d.receivedAt ? new Date(d.receivedAt).toLocaleDateString('en-GB') : ''}</option>)}
            </select>
          </label>

          {result && (
            <>
              {claimable.length === 0 && <p className="rounded-xl bg-success-light px-3 py-4 text-center text-sm font-semibold text-success-dark">No chargeable discrepancies — the invoice matches the delivery. ✅</p>}
              {claimable.length > 0 && (
                <ul className="space-y-2">
                  {claimable.map((d, i) => (
                    <li key={i} className="rounded-2xl border border-gray-100 bg-white p-3 shadow-sm">
                      <label className="flex items-start gap-2">
                        <input type="checkbox" checked={!excluded.has(i)} onChange={() => toggle(i)} className="mt-0.5 h-4 w-4" />
                        <span className="min-w-0 flex-1">
                          <span className="flex items-center justify-between gap-2">
                            <span className="truncate text-sm font-semibold text-gray-900">{d.name}</span>
                            <span className="shrink-0 font-bold tabular-nums text-danger">{gbp(d.overcharge)}</span>
                          </span>
                          <span className="mt-0.5 block text-[11px] text-gray-500">{d.detail}</span>
                          <span className="mt-1 inline-block rounded-full bg-gray-100 px-1.5 py-0.5 text-[10px] font-semibold text-gray-500">{d.type === 'overcharge' ? 'overcharge' : d.type === 'shortage' ? 'short-delivered' : 'not delivered'}</span>
                        </span>
                      </label>
                    </li>
                  ))}
                </ul>
              )}

              {info.length > 0 && (
                <details className="mt-3 rounded-xl border border-gray-200 bg-gray-50 p-2 text-xs text-gray-500">
                  <summary className="cursor-pointer font-medium text-gray-600">{info.length} note(s) (no claim)</summary>
                  <ul className="mt-2 space-y-1">{info.map((d, i) => <li key={i}>{d.detail}</li>)}</ul>
                </details>
              )}

              {claimable.length > 0 && (
                <div className="mt-4">
                  <div className="mb-2 flex items-center justify-between rounded-xl bg-gray-50 p-3">
                    <span className="text-sm text-gray-500">Selected to claim</span>
                    <span className="text-lg font-extrabold tabular-nums text-gray-900">{gbp(selectedTotal)}</span>
                  </div>
                  <button type="button" disabled={selected.length === 0} onClick={raise} className="flex w-full items-center justify-center gap-2 rounded-xl bg-primary px-4 py-3 text-sm font-semibold text-white disabled:opacity-40 active:scale-[0.99]">
                    <Check className="h-4 w-4" /> Draft a claim for {selected.length} item{selected.length === 1 ? '' : 's'}
                  </button>
                  <p className="mt-2 text-center text-[11px] text-gray-400">Creates a draft in Supplier claims — you review, then submit &amp; follow up there.</p>
                </div>
              )}
            </>
          )}
        </>
      )}
    </div>
  );
}
