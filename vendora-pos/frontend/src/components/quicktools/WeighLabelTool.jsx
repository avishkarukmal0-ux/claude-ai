import React, { useMemo, useState } from 'react';
import toast from 'react-hot-toast';
import { Scale, Printer, Share2, CheckCircle2, AlertTriangle } from 'lucide-react';
import ComplianceNote from './ComplianceNote';
import { useInventory } from '../../lib/inventoryStore';
import { unitPrice } from '../../lib/priceMarking';
import { useScaleChecks } from '../../lib/scaleChecks';

// Weigh-and-label (Fresh group). Pick a per-kg line (or type a £/kg), enter the weight, and print/share a
// customer label showing weight, £/kg, total (incl VAT), optional use-by and allergens. Also records that the
// scales are verified and routine self-checks (weights & measures).
export default function WeighLabelTool() {
  const { products } = useInventory();
  const { recordCheck, lastVerified, lastSelfCheck } = useScaleChecks();
  const [productId, setProductId] = useState('');
  const [perKg, setPerKg] = useState('');
  const [weight, setWeight] = useState('');
  const [name, setName] = useState('');
  const [useBy, setUseBy] = useState('');
  const [allergens, setAllergens] = useState('');

  const perKgLines = useMemo(() => products.filter((p) => (p.sizeUnit === 'kg') || /per kg|\/kg/i.test(p.name || '')), [products]);

  function pick(id) {
    setProductId(id);
    const p = products.find((x) => x.id === id);
    if (!p) return;
    setName(p.name);
    const up = unitPrice(p);
    setPerKg(up && up.unit === 'kg' ? up.value.toFixed(2) : (p.price != null ? String(p.price) : ''));
  }

  const rate = parseFloat(perKg);
  const w = parseFloat(weight);
  const valid = Number.isFinite(rate) && rate > 0 && Number.isFinite(w) && w > 0;
  const total = valid ? rate * w : null;

  function labelText() {
    const lines = [(name || 'Item').toUpperCase()];
    lines.push(`£${rate.toFixed(2)}/kg`);
    lines.push(`Weight: ${w.toFixed(3)} kg`);
    lines.push(`TOTAL: £${total.toFixed(2)} incl. VAT`);
    if (useBy) { const d = new Date(useBy); if (!Number.isNaN(d.getTime())) lines.push(`Use by ${d.toLocaleDateString('en-GB')}`); }
    if (allergens.trim()) lines.push(`ALLERGENS: ${allergens.trim().toUpperCase()}`);
    return lines.join('\n');
  }

  async function share() {
    const text = labelText();
    try { if (navigator.share) { await navigator.share({ title: 'Weighed label', text }); return; } } catch { /* fall through */ }
    try { await navigator.clipboard.writeText(text); toast.success('Label copied'); } catch { toast.error('Couldn’t copy'); }
  }
  function print() {
    const esc = (s) => s.replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));
    const html = `<!doctype html><html><head><meta charset="utf-8"><title>Label</title>
      <style>body{font:14px/1.5 system-ui,sans-serif;padding:16px;max-width:360px}h1{font-size:18px;margin:0 0 6px}
      .t{font-size:20px;font-weight:700}.al{font-weight:700;text-transform:uppercase}</style></head><body>
      <h1>${esc(name || 'Item')}</h1><p>£${rate.toFixed(2)}/kg · ${w.toFixed(3)} kg</p>
      <p class="t">TOTAL £${total.toFixed(2)} <span style="font-size:12px;font-weight:400">incl. VAT</span></p>
      ${useBy ? `<p>Use by ${esc(new Date(useBy).toLocaleDateString('en-GB'))}</p>` : ''}
      ${allergens.trim() ? `<p class="al">Allergens: ${esc(allergens.trim())}</p>` : ''}</body></html>`;
    const win = window.open('', '_blank'); if (win) { win.document.write(html); win.document.close(); win.print(); }
  }

  function check(kind) { const r = recordCheck({ kind }); if (r.ok) toast.success('Recorded'); else toast.error('Couldn’t record'); }

  return (
    <div>
      <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-primary-50 text-primary">
        <Scale className="h-7 w-7" strokeWidth={1.75} />
      </div>

      {perKgLines.length > 0 && (
        <select value={productId} onChange={(e) => pick(e.target.value)} className="mb-2 min-h-[44px] w-full rounded-xl border border-gray-200 px-3 py-2.5 text-base focus:border-primary focus:outline-none">
          <option value="">Pick a per-kg line… (optional)</option>
          {perKgLines.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
      )}
      <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Item name" aria-label="Item name" className="mb-2 w-full rounded-xl border border-gray-200 px-3 py-2.5 text-base text-gray-900 focus:border-primary focus:outline-none" />
      <div className="grid grid-cols-2 gap-2">
        <label className="block"><span className="mb-1 block text-xs font-medium text-gray-500">£ / kg</span>
          <input type="number" inputMode="decimal" min="0" step="0.01" value={perKg} onChange={(e) => setPerKg(e.target.value)} placeholder="e.g. 2.50" className="w-full rounded-xl border border-gray-200 px-3 py-2.5 text-base text-gray-900 focus:border-primary focus:outline-none" />
        </label>
        <label className="block"><span className="mb-1 block text-xs font-medium text-gray-500">Weight (kg)</span>
          <input type="number" inputMode="decimal" min="0" step="0.001" value={weight} onChange={(e) => setWeight(e.target.value)} placeholder="e.g. 0.450" className="w-full rounded-xl border border-gray-200 px-3 py-2.5 text-base text-gray-900 focus:border-primary focus:outline-none" />
        </label>
      </div>
      <div className="mt-2 grid grid-cols-2 gap-2">
        <label className="block"><span className="mb-1 block text-xs font-medium text-gray-500">Use by (optional)</span>
          <input type="date" value={useBy} onChange={(e) => setUseBy(e.target.value)} className="w-full rounded-xl border border-gray-200 px-3 py-2.5 text-sm text-gray-900 focus:border-primary focus:outline-none" />
        </label>
        <label className="block"><span className="mb-1 block text-xs font-medium text-gray-500">Allergens (optional)</span>
          <input value={allergens} onChange={(e) => setAllergens(e.target.value)} placeholder="e.g. milk, mustard" className="w-full rounded-xl border border-gray-200 px-3 py-2.5 text-base text-gray-900 focus:border-primary focus:outline-none" />
        </label>
      </div>

      {total != null ? (
        <div className="mt-4 rounded-xl bg-gray-50 p-4 text-center">
          <div className="text-xs font-semibold uppercase tracking-wide text-gray-400">Total incl. VAT</div>
          <div className="mt-1 text-3xl font-extrabold tabular-nums text-gray-900">£{total.toFixed(2)}</div>
          <div className="mt-0.5 text-xs text-gray-500">{w.toFixed(3)} kg × £{rate.toFixed(2)}/kg</div>
        </div>
      ) : (
        <p className="mt-4 text-center text-sm font-medium text-gray-500">Enter a £/kg and a weight to see the total.</p>
      )}

      {total != null && (
        <div className="mt-3 grid grid-cols-2 gap-2">
          <button type="button" onClick={print} className="inline-flex min-h-[44px] items-center justify-center gap-1.5 rounded-xl bg-primary px-3 text-sm font-semibold text-white"><Printer className="h-4 w-4" /> Print</button>
          <button type="button" onClick={share} className="inline-flex min-h-[44px] items-center justify-center gap-1.5 rounded-xl border border-gray-200 bg-white px-3 text-sm font-semibold text-gray-700"><Share2 className="h-4 w-4" /> Share</button>
        </div>
      )}

      {/* Scales verified + self-checks */}
      <div className="mt-5 rounded-xl border border-gray-100 bg-white p-3 shadow-sm">
        <div className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-gray-400"><Scale className="h-3.5 w-3.5" /> Scale checks</div>
        <p className="mt-1 text-xs text-gray-500">
          {lastVerified ? <>Verified {new Date(lastVerified.at).toLocaleDateString('en-GB')}</> : <span className="text-warning-dark">Not marked verified</span>}
          {' · '}
          {lastSelfCheck ? <>last self-check {new Date(lastSelfCheck.at).toLocaleDateString('en-GB')}</> : 'no self-check yet'}
        </p>
        <div className="mt-2 grid grid-cols-2 gap-2">
          <button type="button" onClick={() => check('verified')} className="inline-flex min-h-[44px] items-center justify-center gap-1 rounded-lg bg-gray-900 px-3 text-xs font-semibold text-white"><CheckCircle2 className="h-4 w-4" /> Mark verified</button>
          <button type="button" onClick={() => check('selfcheck')} className="inline-flex min-h-[44px] items-center justify-center gap-1 rounded-lg border border-gray-200 px-3 text-xs font-semibold text-gray-700"><AlertTriangle className="h-4 w-4" /> Record self-check</button>
        </div>
      </div>

      <ComplianceNote verified="2026-10-12" href="https://cdn.acs.org.uk/public/AA%20Guides%20Jan%202026/Weights%20and%20Measures%20-%20ACS%20Assured%20Advice%20(2026).pdf" label="Weights & Measures (ACS)">
        Loose goods are priced in metric (per kg). Trade scales must carry a verification mark and be accurate;
        the customer must see the weight and price before paying. Re-verify after repair; self-check with
        approved weights and keep a record.
      </ComplianceNote>
    </div>
  );
}
