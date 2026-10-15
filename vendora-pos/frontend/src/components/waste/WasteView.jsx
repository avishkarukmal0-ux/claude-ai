import React, { useState, useMemo } from 'react';
import toast from 'react-hot-toast';
import { ArrowLeft, Trash2, TrendingDown, PiggyBank, AlertTriangle, CalendarClock, CalendarPlus, BadgePercent, Printer, Share2, Check } from 'lucide-react';
import { useWaste } from '../../lib/wasteStore';
import { useInventory, DATE_TYPES, fefo, undatedQty } from '../../lib/inventoryStore';
import { useMarkdowns, markdownLabelText, markdownTotals } from '../../lib/markdownStore';
import { useRecoveryGuard } from '../../lib/recoveryGuard';
import ScreenBack from '../common/ScreenBack';

function newOpId() {
  try { if (crypto?.randomUUID) return crypto.randomUUID(); } catch { /* ignore */ }
  return `wb_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}
const money = (v) => `£${(Number(v) || 0).toFixed(2)}`;

// Waste & savings tracker — money lost to the bin vs money rescued by marking down in time.
// Batch-aware: expiring stock is reviewed earliest-first per dated batch, and binning removes
// from the correct batch. Local-first.
export default function WasteView({ onBack }) {
  const { entries, addEntry, removeEntry, monthWasted, monthSaved } = useWaste();
  const { products, recordWaste, reverseWaste, wasteBatch, reverseBatchWaste, addBatch } = useInventory();
  const { markdowns, createMarkdown, recordOutcome, removeMarkdown } = useMarkdowns();
  const recovery = useRecoveryGuard();

  const [form, setForm] = useState({ name: '', value: '', qty: '1' });
  const [dc, setDc] = useState({ open: false, productId: '', qty: '', expiry: '', dateType: 'best-before' });
  const [md, setMd] = useState(null); // active markdown form: { row, qty, reducedPrice }

  const activeMarkdowns = useMemo(() => markdowns.filter((m) => m.status === 'active'), [markdowns]);
  const mdTotals = useMemo(() => markdownTotals(markdowns), [markdowns]);

  // Start marking down a FEFO row (sellable only — a hard-stop row can never be marked down).
  function startMarkdown(row) {
    const { product: p, info } = row;
    if (info.mustPull) { toast.error('Past its use-by — pull it, don’t sell it.'); return; }
    setMd({ row, qty: String(row.qty || 1), reducedPrice: '' });
  }

  function submitMarkdown() {
    if (!md) return;
    const { product: p, batchId, info } = md.row;
    const res = createMarkdown({
      productId: p.id, batchId: batchId || null, name: p.name,
      qty: md.qty, originalPrice: p.price, reducedPrice: md.reducedPrice,
      expiry: info?.date ? info.date.toISOString() : (p.expiry || null), dateType: info?.type || p.dateType || null,
      mustPull: !!info?.mustPull, size: p.size ?? null, sizeUnit: p.sizeUnit ?? null,
    });
    if (!res.ok) { toast.error(res.error || 'Couldn’t create the markdown'); return; }
    toast.success('Marked down — print or share the label. Stock is unchanged.');
    setMd(null);
    shareLabel(res.markdown);
  }

  async function shareLabel(m) {
    const text = markdownLabelText(m);
    try { if (navigator.share) { await navigator.share({ title: 'Markdown label', text }); return; } } catch { /* fall through */ }
    try { await navigator.clipboard.writeText(text); toast('Label copied', { icon: '🏷️' }); } catch { /* ignore */ }
  }

  function printLabel(m) {
    const safe = (s) => String(s).replace(/[<&>]/g, (c) => ({ '<': '&lt;', '&': '&amp;', '>': '&gt;' }[c]));
    const was = Number(m.originalPrice) > 0 ? `<div class="was">was £${Number(m.originalPrice).toFixed(2)}</div>` : '';
    const by = m.expiry ? `<div class="by">Sell by ${new Date(m.expiry).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}</div>` : '';
    const html = `<!doctype html><html><head><meta charset="utf-8"><title>Markdown label</title>
      <style>@media print{@page{margin:10mm}} body{font-family:system-ui,Arial,sans-serif;text-align:center;padding:24px}
      .tag{font-size:13px;letter-spacing:.15em;color:#b91c1c;font-weight:800}
      .name{font-size:22px;font-weight:800;margin:8px 0}
      .was{color:#6b7280;text-decoration:line-through;font-size:16px}
      .now{font-size:40px;font-weight:900;color:#b91c1c;margin:4px 0}
      .by{font-size:14px;color:#374151;margin-top:8px}</style></head>
      <body><div class="tag">REDUCED TO CLEAR</div><div class="name">${safe(m.name || 'Item')}</div>
      ${was}<div class="now">£${Number(m.reducedPrice).toFixed(2)}</div>${by}
      <script>window.onload=function(){window.print()}</script></body></html>`;
    try {
      const w = window.open('', '_blank');
      if (!w) { toast('Pop-up blocked — use Share instead', { icon: 'ℹ️' }); return; }
      w.document.write(html); w.document.close();
    } catch { toast.error('Couldn’t open the print view'); }
  }

  // Bin n units of a markdown's batch/product through the EXISTING waste flow (real stock movement), then
  // close the markdown with the reported sold + binned split. "Sold" is reported-only (estimated), never a
  // confirmed sale and never a stock change here.
  function closeMarkdown(m, soldReported, binned) {
    const want = Number(binned) || 0;
    let appliedBinned = 0;
    if (want > 0) {
      const p = products.find((x) => x.id === m.productId);
      if (!p) { toast.error('That product no longer exists — markdown left open.'); return; }
      // R4: an earlier unsafe save on this item blocks further stock changes until the owner reloads + verifies.
      if (recovery.has(`product:${m.productId}`)) { toast.error('This item needs checking after a failed save — reload and verify its stock first.'); return; }
      const opGroupId = newOpId();
      // Audit D11: don't pass a single-unit valuation (the store values it at cost × actual applied), and do
      // NOT report binning or close the markdown unless the waste actually committed. Record the ACTUAL applied
      // quantity, not the requested one (stock may have been sold/removed since, or be less than requested).
      const res = m.batchId
        ? wasteBatch({ id: p.id, batchId: m.batchId, qty: want, reason: 'marked down — unsold, binned', opGroupId })
        : recordWaste({ id: p.id, qty: want, reason: 'marked down — unsold, binned', batchId: opGroupId });
      if (!res || !res.ok) {
        // R4: a failed+un-undoable save is unsafe — record a DURABLE block so a re-tap can't double-bin.
        if (res && res.needsRecovery) recovery.record(`product:${m.productId}`, { kind: 'waste', name: p.name });
        toast.error((res && res.error) || 'Couldn’t bin that stock — markdown left open to try again.'); return;
      }
      appliedBinned = res.applied;
      addEntry({ type: 'wasted', name: p.name, value: (p.cost ?? 0) * res.applied, qty: res.applied, productId: p.id, batchId: opGroupId, productBatchId: m.batchId || undefined, batchInfo: res.batch, reason: 'marked down — unsold' });
      if (appliedBinned < want) toast(`Only ${appliedBinned} of ${want} were still in stock to bin.`, { icon: 'ℹ️' });
    }
    recordOutcome(m.id, { soldReported: Number(soldReported) || 0, binned: appliedBinned, close: true });
    toast.success('Markdown closed');
  }

  function log(type) {
    if (!form.value) return;
    // Quick-log is standalone (no product link) — it does NOT change stock.
    addEntry({ type, name: form.name, value: form.value, qty: form.qty });
    setForm({ name: '', value: '', qty: '1' });
  }

  // Bin a FEFO row (a dated batch, or an unbatched product) as ONE operation: reduce the right
  // stock + log a typed waste movement + add the £ ledger entry, linked for undo.
  function binRow(row) {
    const { product: p, batchId, dateType } = row;
    // R4: block a bin on an item left in an unsafe needs-recovery state by an earlier failed save (durable, so it
    // holds across reload/navigation) — a re-tap would otherwise double-bin.
    if (recovery.has(`product:${p.id}`)) { toast.error('This item needs checking after a failed save — reload and verify its stock before binning again.'); return; }
    const opGroupId = newOpId();
    const valuation = (p.cost ?? 0) * 1;
    let entry = null;
    if (batchId) {
      const res = wasteBatch({ id: p.id, batchId, qty: 1, valuation, reason: 'expired / near-date', opGroupId });
      if (!res.ok) { if (res.needsRecovery) recovery.record(`product:${p.id}`, { kind: 'waste', name: p.name }); toast.error(res.error || 'Couldn’t bin that'); return; }
      entry = addEntry({ type: 'wasted', name: p.name, value: (p.cost ?? 0) * res.applied, qty: res.applied, productId: p.id, batchId: opGroupId, productBatchId: batchId, batchInfo: res.batch, reason: 'expired / near-date' });
    } else {
      const res = recordWaste({ id: p.id, qty: 1, valuation, reason: 'expired / near-date', batchId: opGroupId });
      if (!res.ok) { if (res.needsRecovery) recovery.record(`product:${p.id}`, { kind: 'waste', name: p.name }); toast.error(res.error || 'Couldn’t bin that'); return; }
      entry = addEntry({ type: 'wasted', name: p.name, value: (p.cost ?? 0) * res.applied, qty: res.applied, productId: p.id, batchId: opGroupId, reason: 'expired / near-date' });
    }
    // Binning changes stock — offer an Undo (restores stock + removes the ledger entry via the same safe path).
    toast((t) => (
      <span className="flex items-center gap-3 text-sm">Binned 1 × {p.name}
        {entry && <button type="button" onClick={() => { undoEntry(entry); toast.dismiss(t.id); }} className="font-semibold text-primary underline">Undo</button>}
      </span>
    ), { icon: '🗑️', duration: 6000 });
  }

  // Undo restores stock + history consistently (batch-aware).
  function undoEntry(e) {
    if (e.type === 'wasted' && e.productId && e.batchId) {
      // Audit V1 (round 4): an earlier unsafe undo (stock restored, ledger + rollback both failed) leaves a
      // durable recovery flag AND the entry in place. Without checking that flag here, a SECOND Undo reverses
      // again and double-restores stock (8→10→12). Block it until the owner reloads + reconciles; a plain
      // recoverable failure (no flag) stays retryable.
      if (recovery.has(`product:${e.productId}`)) {
        toast.error('This item needs checking after a failed undo — reload and verify its stock before undoing again.');
        return;
      }
      const res = e.productBatchId
        ? reverseBatchWaste({ id: e.productId, qty: e.qty, opGroupId: e.batchId, batch: e.batchInfo })
        : reverseWaste({ id: e.productId, qty: e.qty, batchId: e.batchId });
      // Audit R8 (round 3): the undo discarded this result and ALWAYS removed the ledger entry — so a failed
      // stock-restore made the entry vanish while stock stayed reduced. KEEP the entry so a retry is possible;
      // on an unsafe (restore + rollback both failed) result, record a durable block.
      if (res && res.ok === false) {
        if (res.needsRecovery) recovery.record(`product:${e.productId}`, { kind: 'waste', name: e.name });
        toast.error(res.error || 'Couldn’t undo that — your waste entry is kept, please retry.');
        return;
      }
    }
    removeEntry(e.id);
  }

  function dateCode() {
    if (!dc.productId || !dc.qty || !dc.expiry) { toast.error('Pick a product, quantity and date'); return; }
    const res = addBatch(dc.productId, { qty: dc.qty, expiry: dc.expiry, dateType: dc.dateType });
    if (!res.ok) { toast.error(res.error || 'Couldn’t date-code that'); return; }
    toast.success(`Date-coded ${res.allocated} unit${res.allocated === 1 ? '' : 's'}`);
    setDc({ open: false, productId: '', qty: '', expiry: '', dateType: 'best-before' });
  }

  // FEFO across dated batches (and unbatched products), soonest expiry first.
  const rows = useMemo(() => fefo(products), [products]);
  // Estimated markdown opportunity: RETAIL value of soft (sellable) near/expired stock. Labelled
  // as an estimate — NOT money already saved.
  const atRisk = useMemo(() => rows.filter((r) => !r.info.mustPull)
    .reduce((s, r) => s + (Number(r.product.price) || 0) * (Number(r.qty) || 0), 0), [rows]);
  const codeable = useMemo(() => products.filter((p) => undatedQty(p) > 0), [products]);

  const monthName = new Date().toLocaleDateString('en-GB', { month: 'long' });

  return (
    <div>
      <ScreenBack onBack={onBack} />

      <h2 className="mb-1 text-base font-bold text-gray-900">Waste &amp; savings</h2>
      <p className="mb-4 text-xs text-gray-400">Log what you bin and what you rescue. See the money either way.</p>

      {/* R4: durable needs-recovery notice — an earlier bin saved stock but its record couldn’t be written or
          undone. Binning that item stays blocked until the owner reloads, checks real stock, and clears this. */}
      {recovery.list().filter((g) => g.kind === 'waste').map((g) => (
        <div key={g.opKey} className="mb-3 rounded-xl bg-danger/10 px-3 py-2.5 text-xs font-semibold text-danger" role="alert">
          <AlertTriangle className="mr-1 inline h-4 w-4" />
          “{g.name || 'An item'}” was binned but its record didn’t save and couldn’t be undone. Reload the app and
          check this item’s stock before binning it again.
          <button type="button" onClick={() => recovery.clear(g.opKey)} className="mt-1.5 block w-full rounded-lg bg-danger/15 px-2 py-1.5 text-xs font-bold text-danger active:scale-95">
            I’ve reloaded and checked its stock — clear this
          </button>
        </div>
      ))}

      {/* FEFO — expiring / sell first, earliest-expiry batch first */}
      {rows.length > 0 && (
        <section className="mb-4">
          <h3 className="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-gray-400">
            <CalendarClock className="h-3.5 w-3.5" /> Sell first — expiring{atRisk > 0 && <span className="ml-1 font-normal normal-case text-gray-400">· {money(atRisk)} at risk (est.)</span>}
          </h3>
          <ul className="space-y-2">
            {rows.map((row) => {
              const { product: p, batchId, qty, info } = row;
              return (
                <li key={`${p.id}:${batchId || 'nb'}`} className={`flex items-center gap-3 rounded-2xl border p-3 shadow-sm ${info.mustPull ? 'border-danger/40 bg-danger-light' : info.status === 'expired' ? 'border-warning/40 bg-warning-light' : 'border-gray-100 bg-white'}`}>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-semibold text-gray-900">{p.name} <span className="font-normal text-gray-400">×{qty}</span></span>
                    <span className={`block text-xs ${info.status === 'expired' ? 'text-danger' : 'text-gray-500'}`}>
                      {DATE_TYPES[info.type].label} {info.date.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })} ·{' '}
                      {info.daysLeft < 0 ? `${Math.abs(info.daysLeft)}d ago` : info.daysLeft === 0 ? 'today' : `in ${info.daysLeft}d`}
                    </span>
                    {info.mustPull ? (
                      <span className="mt-0.5 flex items-center gap-1 text-xs font-bold text-danger-dark"><AlertTriangle className="h-3 w-3" /> Do not sell — pull now</span>
                    ) : (
                      <span className="mt-0.5 inline-block rounded-full bg-warning-light px-1.5 py-0.5 text-xs font-semibold text-warning-dark">Mark down to sell in time</span>
                    )}
                  </span>
                  <span className="flex shrink-0 flex-col gap-3">
                    {!info.mustPull && (
                      <button
                        type="button"
                        disabled={qty <= 0}
                        onClick={() => startMarkdown(row)}
                        className="inline-flex min-h-[44px] items-center justify-center rounded-lg bg-primary-50 px-3 text-xs font-semibold text-primary ring-1 ring-primary/20 active:scale-95 disabled:opacity-40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                      >
                        Mark down
                      </button>
                    )}
                    <button
                      type="button"
                      disabled={qty <= 0}
                      onClick={() => binRow(row)}
                      className="inline-flex min-h-[44px] items-center justify-center rounded-lg bg-white/70 px-3 text-xs font-semibold text-danger-dark ring-1 ring-danger/20 active:scale-95 disabled:opacity-40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-danger"
                    >
                      {info.mustPull ? 'Pull' : 'Bin'}
                    </button>
                  </span>
                </li>
              );
            })}
          </ul>
        </section>
      )}

      {/* Markdown form (price action only — does NOT change stock) */}
      {md && (
        <div className="mb-4 rounded-2xl border border-primary/20 bg-white p-3 shadow-sm">
          <h3 className="mb-1 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-gray-400"><BadgePercent className="h-3.5 w-3.5" /> Mark down</h3>
          <p className="mb-2 text-sm font-semibold text-gray-900">{md.row.product.name}</p>
          {/* Tobacco & Vapes Act: a ban on discounting/free distribution of nicotine products is reported from
              29 Oct 2026, but what "discounting" covers is unconfirmed — warn, don't block (ground rule 1). */}
          {/\b(tobacco|vape|e-?liquid|e-?cig|nicotine|cigarette)\b/i.test(md.row.product.category || '') && (
            <p className="mb-2 rounded-xl bg-warning-light p-2 text-xs text-warning-dark">Heads up: from 29 Oct 2026 discounting/free distribution of nicotine products may be restricted (reported — the detail is unconfirmed). Check before promoting tobacco/vape lines.</p>
          )}
          <div className="mb-2 grid grid-cols-2 gap-2">
            <label className="flex min-h-[44px] items-center gap-1 rounded-xl border border-gray-200 px-3 text-sm text-gray-500">Qty
              <input value={md.qty} onChange={(e) => setMd((m) => ({ ...m, qty: e.target.value }))} inputMode="numeric" aria-label="Markdown quantity" className="min-h-[44px] w-full border-none bg-transparent p-0 text-gray-900 focus:outline-none" />
            </label>
            <label className="flex min-h-[44px] items-center gap-1 rounded-xl border border-gray-200 px-3 text-sm text-gray-500">New £
              <input value={md.reducedPrice} onChange={(e) => setMd((m) => ({ ...m, reducedPrice: e.target.value }))} inputMode="decimal" placeholder={Number(md.row.product.price) > 0 ? `was ${money(md.row.product.price)}` : 'price'} aria-label="Reduced price in pounds" className="min-h-[44px] w-full border-none bg-transparent p-0 text-gray-900 focus:outline-none" />
            </label>
          </div>
          <p className="mb-2 text-xs text-gray-400">Creates a reduced-price label to print/share. It does <strong>not</strong> change your stock or record a sale.</p>
          <div className="grid grid-cols-2 gap-2">
            <button type="button" onClick={() => setMd(null)} className="rounded-xl bg-gray-100 px-3 py-2.5 text-sm font-semibold text-gray-600">Cancel</button>
            <button type="button" onClick={submitMarkdown} className="rounded-xl bg-primary px-3 py-2.5 text-sm font-semibold text-white">Create label</button>
          </div>
        </div>
      )}

      {/* Active markdowns */}
      {activeMarkdowns.length > 0 && (
        <section className="mb-4">
          <h3 className="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-gray-400">
            <BadgePercent className="h-3.5 w-3.5" /> On markdown
            {mdTotals.unitsOnOffer > 0 && <span className="ml-1 font-normal normal-case text-gray-400">· {mdTotals.unitsOnOffer} unit{mdTotals.unitsOnOffer === 1 ? '' : 's'}</span>}
          </h3>
          <ul className="space-y-2">
            {activeMarkdowns.map((m) => (
              <li key={m.id} className="rounded-2xl border border-gray-100 bg-white p-3 shadow-sm">
                <div className="flex items-start justify-between gap-2">
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-semibold text-gray-900">{m.name} <span className="font-normal text-gray-400">×{m.qty}</span></span>
                    <span className="block text-xs text-gray-500">{Number(m.originalPrice) > 0 ? `was ${money(m.originalPrice)} · ` : ''}now <span className="font-semibold text-danger">{money(m.reducedPrice)}</span>{m.expiry ? ` · sell by ${new Date(m.expiry).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}` : ''}</span>
                  </span>
                  <button type="button" onClick={() => removeMarkdown(m.id)} className="shrink-0 p-1 text-gray-300 hover:text-danger" aria-label="Remove markdown"><Trash2 className="h-4 w-4" /></button>
                </div>
                <div className="mt-2 flex flex-wrap gap-2">
                  <button type="button" onClick={() => printLabel(m)} className="flex items-center gap-1 rounded-lg border border-gray-200 px-2.5 py-1.5 text-xs font-semibold text-gray-700 active:scale-95"><Printer className="h-3.5 w-3.5" /> Print</button>
                  <button type="button" onClick={() => shareLabel(m)} className="flex items-center gap-1 rounded-lg border border-gray-200 px-2.5 py-1.5 text-xs font-semibold text-gray-700 active:scale-95"><Share2 className="h-3.5 w-3.5" /> Share</button>
                  <button
                    type="button"
                    onClick={() => {
                      const sold = Number(window.prompt(`How many of the ${m.qty} sold at the reduced price? (reported only — not a confirmed sale)`, '0'));
                      if (Number.isNaN(sold)) return;
                      const bin = Math.max(0, (Number(m.qty) || 0) - (Number(sold) || 0));
                      if (window.confirm(`Record ${sold || 0} sold (reported) and bin the remaining ${bin}?`)) closeMarkdown(m, sold, bin);
                    }}
                    className="flex items-center gap-1 rounded-lg bg-gray-900 px-2.5 py-1.5 text-xs font-semibold text-white active:scale-95"
                  ><Check className="h-3.5 w-3.5" /> Record outcome</button>
                </div>
              </li>
            ))}
          </ul>
          <p className="mt-1.5 text-xs text-gray-400">“Sold” here is your own estimate — confirmed sales only come from till imports. Unsold units you bin update stock.</p>
        </section>
      )}

      {/* Date-code stock (optional batches) */}
      {codeable.length > 0 && (
        <section className="mb-4">
          {!dc.open ? (
            <button type="button" onClick={() => setDc((d) => ({ ...d, open: true }))} className="flex min-h-[44px] w-full items-center justify-center gap-2 rounded-2xl border border-dashed border-gray-300 bg-white px-4 text-xs font-semibold text-gray-600 active:scale-[0.99]">
              <CalendarPlus className="h-4 w-4" /> Date-code stock (add a batch)
            </button>
          ) : (
            <div className="rounded-2xl border border-gray-100 bg-white p-3 shadow-sm">
              <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-400">Date-code stock</h3>
              <select value={dc.productId} onChange={(e) => setDc((d) => ({ ...d, productId: e.target.value }))} className="mb-2 w-full rounded-xl border border-gray-200 px-3 py-2.5 text-sm focus:border-primary focus:outline-none">
                <option value="">Choose a product…</option>
                {codeable.map((p) => <option key={p.id} value={p.id}>{p.name} · {undatedQty(p)} undated</option>)}
              </select>
              <div className="mb-2 grid grid-cols-2 gap-2">
                <label className="flex min-h-[44px] items-center gap-1 rounded-xl border border-gray-200 px-3 text-sm text-gray-500">Qty
                  <input value={dc.qty} onChange={(e) => setDc((d) => ({ ...d, qty: e.target.value }))} inputMode="numeric" aria-label="Quantity to date-code" placeholder="e.g. 2" className="min-h-[44px] w-full border-none bg-transparent p-0 text-gray-900 focus:outline-none" />
                </label>
                <input type="date" value={dc.expiry} onChange={(e) => setDc((d) => ({ ...d, expiry: e.target.value }))} aria-label="Expiry date" className="min-h-[44px] rounded-xl border border-gray-200 px-3 py-2.5 text-sm text-gray-900 focus:border-primary focus:outline-none" />
              </div>
              <select value={dc.dateType} onChange={(e) => setDc((d) => ({ ...d, dateType: e.target.value }))} className="mb-2 w-full rounded-xl border border-gray-200 px-3 py-2.5 text-sm focus:border-primary focus:outline-none">
                {Object.entries(DATE_TYPES).map(([k, v]) => <option key={k} value={k}>{v.label}{v.hard ? ' (legal — pull after date)' : ''}</option>)}
              </select>
              <div className="grid grid-cols-2 gap-2">
                <button type="button" onClick={() => setDc({ open: false, productId: '', qty: '', expiry: '', dateType: 'best-before' })} className="rounded-xl bg-gray-100 px-3 py-2.5 text-sm font-semibold text-gray-600">Cancel</button>
                <button type="button" onClick={dateCode} className="rounded-xl bg-primary px-3 py-2.5 text-sm font-semibold text-white">Add batch</button>
              </div>
            </div>
          )}
        </section>
      )}

      {/* Headline stats */}
      <div className="mb-4 grid grid-cols-2 gap-3">
        <div className="rounded-2xl border border-gray-100 bg-white p-4 shadow-sm">
          <div className="flex items-center gap-1.5 text-xs font-medium text-gray-400"><TrendingDown className="h-4 w-4 text-danger" /> Wasted · {monthName}</div>
          <div className="mt-1 text-2xl font-extrabold tabular-nums text-danger">£{monthWasted.toFixed(2)}</div>
        </div>
        <div className="rounded-2xl border border-gray-100 bg-white p-4 shadow-sm">
          <div className="flex items-center gap-1.5 text-xs font-medium text-gray-400"><PiggyBank className="h-4 w-4 text-success" /> Saved · {monthName}</div>
          <div className="mt-1 text-2xl font-extrabold tabular-nums text-success">£{monthSaved.toFixed(2)}</div>
        </div>
      </div>

      {monthSaved > 0 && (
        <div className="mb-4 rounded-xl bg-success-light p-3 text-center text-sm font-semibold text-success-dark">
          You’ve rescued £{monthSaved.toFixed(2)} from the bin this month. 🎉
        </div>
      )}

      {/* Quick add */}
      <div className="mb-4 rounded-2xl border border-gray-100 bg-white p-3 shadow-sm">
        <input value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} placeholder="What is it? (e.g. Milk 2L)" aria-label="Item name" className="mb-2 min-h-[44px] w-full rounded-xl border border-gray-200 px-3 py-2.5 text-base focus:border-primary focus:outline-none" />
        <div className="mb-3 grid grid-cols-2 gap-2">
          <label className="flex min-h-[44px] items-center gap-1 rounded-xl border border-gray-200 px-3 text-sm text-gray-500">
            £<input value={form.value} onChange={(e) => setForm((f) => ({ ...f, value: e.target.value }))} inputMode="decimal" placeholder="0.00" aria-label="Cost in pounds" className="min-h-[44px] w-full border-none bg-transparent p-0 text-base text-gray-900 focus:outline-none" />
          </label>
          <label className="flex min-h-[44px] items-center gap-1 rounded-xl border border-gray-200 px-3 text-sm text-gray-500">
            Qty<input value={form.qty} onChange={(e) => setForm((f) => ({ ...f, qty: e.target.value }))} inputMode="numeric" placeholder="1" aria-label="Quantity" className="min-h-[44px] w-full border-none bg-transparent p-0 text-base text-gray-900 focus:outline-none" />
          </label>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <button type="button" disabled={!form.value} onClick={() => log('wasted')} className="flex min-h-[44px] items-center justify-center gap-1.5 rounded-xl bg-danger px-3 text-sm font-semibold text-white disabled:opacity-40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-danger focus-visible:ring-offset-2">
            <Trash2 className="h-4 w-4" /> Binned it
          </button>
          <button type="button" disabled={!form.value} onClick={() => log('saved')} className="flex min-h-[44px] items-center justify-center gap-1.5 rounded-xl bg-success px-3 text-sm font-semibold text-white disabled:opacity-40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-success focus-visible:ring-offset-2">
            <PiggyBank className="h-4 w-4" /> Saved it
          </button>
        </div>
        <p className="mt-2 text-xs leading-snug text-gray-400">
          “Saved” = marked down or used before it expired. That’s money you kept. This quick log is
          for stock that isn’t in your catalogue — it doesn’t change stock levels. To bin a catalogued
          item and update stock, use the <span className="font-semibold">Sell first</span> list above.
        </p>
      </div>

      {/* Recent entries */}
      {entries.length > 0 && (
        <>
          <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-400">Recent</h3>
          <ul className="space-y-2">
            {entries.slice(0, 30).map((e) => (
              <li key={e.id} className="flex items-center gap-3 rounded-xl border border-gray-100 bg-white p-3 shadow-sm">
                <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${e.type === 'saved' ? 'bg-success-light text-success-dark' : 'bg-danger-light text-danger-dark'}`}>
                  {e.type === 'saved' ? <PiggyBank className="h-5 w-5" /> : <Trash2 className="h-5 w-5" />}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-semibold text-gray-900">{e.name}</span>
                  <span className="block text-xs text-gray-500">
                    {e.qty > 1 ? `×${e.qty} · ` : ''}{new Date(e.ts).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}
                  </span>
                </span>
                <span className={`text-sm font-bold tabular-nums ${e.type === 'saved' ? 'text-success' : 'text-danger'}`}>
                  {e.type === 'saved' ? '+' : '−'}£{e.value.toFixed(2)}
                </span>
                <button type="button" onClick={() => undoEntry(e)} className="flex h-11 w-11 shrink-0 items-center justify-center text-gray-300 hover:text-danger" aria-label={e.productId ? 'Undo — restores stock' : 'Delete'} title={e.productId ? 'Undo — restores stock' : 'Delete'}>
                  <Trash2 className="h-4 w-4" />
                </button>
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}
