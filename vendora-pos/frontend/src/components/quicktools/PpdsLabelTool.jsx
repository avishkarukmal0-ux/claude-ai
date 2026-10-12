import React, { useState } from 'react';
import toast from 'react-hot-toast';
import { Tags, Printer, Share2 } from 'lucide-react';
import ComplianceNote from './ComplianceNote';

// PPDS (Prepacked for Direct Sale) label helper — Natasha's Law. Food packed on the premises for direct sale
// must carry the product name AND a full ingredients list with the 14 regulated allergens emphasised. This is
// a label GENERATOR only (it prints/shares text); it keeps no record and makes no legal guarantee.
const ALLERGENS = [
  'Celery', 'Cereals containing gluten', 'Crustaceans', 'Eggs', 'Fish', 'Lupin', 'Milk',
  'Molluscs', 'Mustard', 'Nuts (tree nuts)', 'Peanuts', 'Sesame', 'Soya', 'Sulphur dioxide / sulphites',
];

export default function PpdsLabelTool() {
  const [name, setName] = useState('');
  const [ingredients, setIngredients] = useState('');
  const [picked, setPicked] = useState(() => new Set());

  const toggle = (a) => setPicked((prev) => { const n = new Set(prev); n.has(a) ? n.delete(a) : n.add(a); return n; });
  const allergenList = ALLERGENS.filter((a) => picked.has(a));
  const ready = name.trim() && ingredients.trim();

  function labelText() {
    const lines = [name.trim().toUpperCase(), '', 'INGREDIENTS:', ingredients.trim()];
    if (allergenList.length) lines.push('', `ALLERGENS: ${allergenList.join(', ').toUpperCase()}`);
    lines.push('', 'Prepacked for direct sale (PPDS).');
    return lines.join('\n');
  }

  async function share() {
    const text = labelText();
    try { if (navigator.share) { await navigator.share({ title: 'PPDS label', text }); return; } } catch { /* fall through */ }
    try { await navigator.clipboard.writeText(text); toast.success('Label copied'); } catch { toast.error('Couldn’t copy'); }
  }

  function print() {
    const esc = (s) => s.replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));
    const html = `<!doctype html><html><head><meta charset="utf-8"><title>PPDS label</title>
      <style>body{font:14px/1.4 system-ui,sans-serif;padding:16px;max-width:420px}h1{font-size:18px;margin:0 0 8px}
      .al{font-weight:700;text-transform:uppercase}</style></head><body>
      <h1>${esc(name.trim())}</h1><p><b>Ingredients:</b> ${esc(ingredients.trim())}</p>
      ${allergenList.length ? `<p class="al">Allergens: ${esc(allergenList.join(', '))}</p>` : ''}
      <p>Prepacked for direct sale (PPDS).</p></body></html>`;
    const w = window.open('', '_blank'); if (w) { w.document.write(html); w.document.close(); w.print(); }
  }

  return (
    <div>
      <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-primary-50 text-primary">
        <Tags className="h-7 w-7" strokeWidth={1.75} />
      </div>

      <div className="space-y-3">
        <label className="block">
          <span className="mb-1 block text-xs font-medium text-gray-500">Product name</span>
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Chicken &amp; bacon sandwich"
            className="w-full rounded-xl border border-gray-200 px-3 py-2.5 text-base text-gray-900 focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary" />
        </label>
        <label className="block">
          <span className="mb-1 block text-xs font-medium text-gray-500">Ingredients (in descending weight order)</span>
          <textarea value={ingredients} onChange={(e) => setIngredients(e.target.value)} rows={3} placeholder="Wheat flour, chicken (22%), bacon, mayonnaise (egg)…"
            className="w-full rounded-xl border border-gray-200 px-3 py-2.5 text-base text-gray-900 focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary" />
        </label>
      </div>

      <p className="mb-2 mt-4 text-xs font-semibold uppercase tracking-wide text-gray-400">Allergens present (of the 14)</p>
      <div className="flex flex-wrap gap-2">
        {ALLERGENS.map((a) => {
          const on = picked.has(a);
          return (
            <button key={a} type="button" onClick={() => toggle(a)} aria-pressed={on}
              className={`inline-flex min-h-[44px] items-center rounded-full border px-3 text-xs font-semibold ${on ? 'border-warning bg-warning-light text-warning-dark' : 'border-gray-200 bg-white text-gray-600'}`}>
              {a}
            </button>
          );
        })}
      </div>

      {ready && (
        <>
          <pre className="mt-4 whitespace-pre-wrap rounded-xl border border-gray-200 bg-gray-50 p-3 text-sm text-gray-900">{labelText()}</pre>
          <div className="mt-3 grid grid-cols-2 gap-2">
            <button type="button" onClick={print} className="inline-flex min-h-[44px] items-center justify-center gap-1.5 rounded-xl bg-primary px-3 text-sm font-semibold text-white"><Printer className="h-4 w-4" /> Print</button>
            <button type="button" onClick={share} className="inline-flex min-h-[44px] items-center justify-center gap-1.5 rounded-xl border border-gray-200 bg-white px-3 text-sm font-semibold text-gray-700"><Share2 className="h-4 w-4" /> Share</button>
          </div>
        </>
      )}

      <ComplianceNote verified="2026-10-12" href="https://www.food.gov.uk/business-guidance/packaging-and-labelling" label="FSA labelling guidance">
        Allergens must be emphasised in the ingredients list on the pack. This generates the label text — you’re
        responsible for its accuracy.
      </ComplianceNote>
    </div>
  );
}
