import React, { useState } from 'react';
import toast from 'react-hot-toast';
import { Beef, Printer, Share2, Trash2, Download } from 'lucide-react';
import ComplianceNote from './ComplianceNote';
import { getSavedShopType } from '../../config/shopTypes';
import { useArrayLog, logCsv } from '../../lib/simpleStores';

// Traceability (Fresh & weighed). Two modes:
//  • Origin card — a point-of-sale card with the origin info that loose beef / fish / produce must show, with
//    the fields that matter for the shop's trade (butcher = beef, fishmonger = fish, greengrocer = produce).
//  • Licence log — a daily record of slaughterhouse / cutting-plant licence numbers for meat on sale.
// Field sets are reported (EU-derived; confirm per nation) so the tool captures and prints, it does not assert.
const FIELD_SETS = {
  butcher: { title: 'Beef / meat origin', source: 'https://www.gov.uk/comply-with-the-compulsory-beef-labelling-scheme', label: 'Beef labelling (GOV.UK)',
    fields: [['ref', 'Reference / batch code'], ['born', 'Country of birth'], ['reared', 'Country of rearing'], ['slaughtered', 'Slaughtered in (country)'], ['cut', 'Cut in (country)']] },
  'butcher-fish': { title: 'Fish origin', source: 'https://www.businesscompanion.info/en/quick-guides/food-and-drink/labelling-of-fish', label: 'Fish labelling (Business Companion)',
    fields: [['commercial', 'Commercial name (from the official list)'], ['latin', 'Latin name'], ['method', 'Caught at sea / inland / farmed'], ['area', 'Catch or production area'], ['gear', 'Fishing-gear category']] },
  greengrocer: { title: 'Produce origin', source: 'https://www.gov.uk/guidance/comply-with-marketing-standards-for-fresh-fruit-and-vegetables', label: 'Fruit & veg standards (GOV.UK)',
    fields: [['origin', 'Country of origin (full name)'], ['class', 'Class'], ['variety', 'Variety / type'], ['size', 'Size or count']] },
  default: { title: 'Origin', source: 'https://www.gov.uk/guidance/comply-with-marketing-standards-for-fresh-fruit-and-vegetables', label: 'Marketing standards (GOV.UK)',
    fields: [['origin', 'Country of origin (full name)']] },
};

export default function TraceabilityTool() {
  const saved = getSavedShopType();
  const member = saved?.memberId || '';
  const setKey = member === 'butcher' ? 'butcher' : member === 'greengrocer' ? 'greengrocer' : 'default';
  const [mode, setMode] = useState('origin');
  const [set, setSet] = useState(setKey);
  const spec = FIELD_SETS[set] || FIELD_SETS.default;
  const [name, setName] = useState('');
  const [vals, setVals] = useState({});
  const licence = useArrayLog('licence_log_v1', 'lic');
  const [lic, setLic] = useState({ slaughterhouse: '', cuttingPlant: '', note: '' });

  function cardText() {
    const lines = [(name || 'Item').toUpperCase()];
    for (const [k, lbl] of spec.fields) { if ((vals[k] || '').trim()) lines.push(`${lbl}: ${vals[k].trim()}`); }
    return lines.join('\n');
  }
  async function shareCard() {
    const text = cardText();
    try { if (navigator.share) { await navigator.share({ title: 'Origin card', text }); return; } } catch { /* fall */ }
    try { await navigator.clipboard.writeText(text); toast.success('Copied'); } catch { toast.error('Couldn’t copy'); }
  }
  function printCard() {
    const esc = (s) => s.replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));
    const rows = spec.fields.filter(([k]) => (vals[k] || '').trim()).map(([k, lbl]) => `<p><b>${esc(lbl)}:</b> ${esc(vals[k].trim())}</p>`).join('');
    const html = `<!doctype html><html><head><meta charset="utf-8"><title>Origin</title><style>body{font:14px/1.5 system-ui,sans-serif;padding:16px;max-width:380px}h1{font-size:18px;margin:0 0 8px}</style></head><body><h1>${esc(name || 'Item')}</h1>${rows}</body></html>`;
    const w = window.open('', '_blank'); if (w) { w.document.write(html); w.document.close(); w.print(); }
  }

  function addLicence() {
    if (!lic.slaughterhouse.trim() && !lic.cuttingPlant.trim()) { toast.error('Enter a licence number'); return; }
    const r = licence.add({ slaughterhouse: lic.slaughterhouse.trim(), cuttingPlant: lic.cuttingPlant.trim(), note: lic.note.trim() });
    if (r.ok) { toast.success('Logged'); setLic({ slaughterhouse: '', cuttingPlant: '', note: '' }); } else toast.error('Couldn’t save');
  }
  function exportLicence() {
    try {
      const csv = logCsv(licence.items, [['Date', (e) => new Date(e.at).toLocaleDateString('en-GB')], ['Slaughterhouse', 'slaughterhouse'], ['Cutting plant', 'cuttingPlant'], ['Note', 'note']]);
      const blob = new Blob([csv], { type: 'text/csv' }); const url = URL.createObjectURL(blob);
      const a = document.createElement('a'); a.href = url; a.download = `licence-log-${new Date().toISOString().slice(0, 10)}.csv`;
      document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch { toast.error('Couldn’t export'); }
  }

  return (
    <div>
      <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-primary-50 text-primary">
        <Beef className="h-7 w-7" strokeWidth={1.75} />
      </div>

      <div className="mb-3 flex rounded-xl bg-gray-100 p-1 text-sm font-semibold">
        {[['origin', 'Origin card'], ['licence', 'Licence log']].map(([id, lbl]) => (
          <button key={id} type="button" onClick={() => setMode(id)} aria-pressed={mode === id}
            className={`inline-flex min-h-[44px] flex-1 items-center justify-center rounded-lg ${mode === id ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500'}`}>{lbl}</button>
        ))}
      </div>

      {mode === 'origin' && (
        <>
          <select value={set} onChange={(e) => { setSet(e.target.value); setVals({}); }} className="mb-2 min-h-[44px] w-full rounded-xl border border-gray-200 px-3 py-2.5 text-base focus:border-primary focus:outline-none">
            <option value="butcher">Beef / meat</option>
            <option value="butcher-fish">Fish</option>
            <option value="greengrocer">Fruit & veg</option>
            <option value="default">Other</option>
          </select>
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Item name" aria-label="Item name" className="mb-2 w-full rounded-xl border border-gray-200 px-3 py-2.5 text-base text-gray-900 focus:border-primary focus:outline-none" />
          <div className="space-y-2">
            {spec.fields.map(([k, lbl]) => (
              <input key={k} value={vals[k] || ''} onChange={(e) => setVals((p) => ({ ...p, [k]: e.target.value }))} placeholder={lbl} aria-label={lbl}
                className="w-full rounded-xl border border-gray-200 px-3 py-2.5 text-base text-gray-900 focus:border-primary focus:outline-none" />
            ))}
          </div>
          <div className="mt-3 grid grid-cols-2 gap-2">
            <button type="button" onClick={printCard} className="inline-flex min-h-[44px] items-center justify-center gap-1.5 rounded-xl bg-primary px-3 text-sm font-semibold text-white"><Printer className="h-4 w-4" /> Print card</button>
            <button type="button" onClick={shareCard} className="inline-flex min-h-[44px] items-center justify-center gap-1.5 rounded-xl border border-gray-200 bg-white px-3 text-sm font-semibold text-gray-700"><Share2 className="h-4 w-4" /> Share</button>
          </div>
          <ComplianceNote verified="2026-10-12" href={spec.source} label={spec.label}>
            Loose meat/fish/produce must show its origin in writing at the point of sale, with different origins
            kept clearly separate. Field rules are reported (EU-derived) — confirm for your nation.
          </ComplianceNote>
        </>
      )}

      {mode === 'licence' && (
        <>
          <p className="mb-2 text-xs text-gray-500">Keep a daily record of the slaughterhouse &amp; cutting-plant licence numbers for meat on sale, ready to show on request.</p>
          <div className="grid grid-cols-2 gap-2">
            <input value={lic.slaughterhouse} onChange={(e) => setLic((p) => ({ ...p, slaughterhouse: e.target.value }))} placeholder="Slaughterhouse no." aria-label="Slaughterhouse licence number" className="rounded-xl border border-gray-200 px-3 py-2.5 text-base text-gray-900 focus:border-primary focus:outline-none" />
            <input value={lic.cuttingPlant} onChange={(e) => setLic((p) => ({ ...p, cuttingPlant: e.target.value }))} placeholder="Cutting-plant no." aria-label="Cutting plant licence number" className="rounded-xl border border-gray-200 px-3 py-2.5 text-base text-gray-900 focus:border-primary focus:outline-none" />
          </div>
          <input value={lic.note} onChange={(e) => setLic((p) => ({ ...p, note: e.target.value }))} placeholder="Note (optional)" aria-label="Note" className="mt-2 w-full rounded-xl border border-gray-200 px-3 py-2.5 text-base text-gray-900 focus:border-primary focus:outline-none" />
          <button type="button" onClick={addLicence} className="mt-3 inline-flex min-h-[44px] w-full items-center justify-center rounded-xl bg-primary px-3 text-sm font-semibold text-white">Log today</button>
          {licence.items.length > 0 && (
            <>
              <div className="mb-2 mt-4 flex items-center justify-between">
                <h3 className="text-xs font-semibold uppercase tracking-wide text-gray-400">Recent</h3>
                <button type="button" onClick={exportLicence} className="inline-flex min-h-[44px] items-center gap-1 rounded-lg border border-gray-200 px-3 text-xs font-semibold text-gray-700"><Download className="h-4 w-4" /> Export</button>
              </div>
              <ul className="space-y-2">
                {licence.items.slice(0, 20).map((e) => (
                  <li key={e.id} className="flex items-center gap-3 rounded-xl border border-gray-100 bg-white p-3 shadow-sm">
                    <span className="min-w-0 flex-1">
                      <span className="block text-sm font-semibold text-gray-900">{[e.slaughterhouse, e.cuttingPlant].filter(Boolean).join(' · ')}</span>
                      <span className="block text-xs text-gray-500">{new Date(e.at).toLocaleDateString('en-GB')}{e.note ? ` · ${e.note}` : ''}</span>
                    </span>
                    <button type="button" onClick={() => licence.remove(e.id)} className="p-1 text-gray-300 hover:text-danger" aria-label="Delete entry"><Trash2 className="h-4 w-4" /></button>
                  </li>
                ))}
              </ul>
            </>
          )}
          <ComplianceNote verified="2026-10-12" href="https://www.gov.uk/comply-with-the-compulsory-beef-labelling-scheme" label="Beef labelling scheme (GOV.UK)">
            Reported (much is assimilated EU law) — confirm the current scheme for your nation.
          </ComplianceNote>
        </>
      )}
    </div>
  );
}
