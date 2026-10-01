import React, { useMemo, useState } from 'react';
import toast from 'react-hot-toast';
import {
  ArrowLeft, ClipboardCheck, Camera, Search, Check, Play, X,
  AlertTriangle, TrendingDown, TrendingUp, History, ChevronRight,
} from 'lucide-react';
import { useInventory } from '../../lib/inventoryStore';
import { useStocktake, buildSummary } from '../../lib/stocktakeStore';
import BarcodeScanner from '../scan/BarcodeScanner';

const money = (n) => `£${(Math.round(Math.abs(n) * 100) / 100).toFixed(2)}`;
const dateLabel = (t) => new Date(t).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });

// Stocktake / audit — count the shop, catch shrinkage. Local-first, no backend.
export default function StocktakeView({ onBack }) {
  const { products, applyCounts } = useInventory();
  const { session, history, start, countItem, bumpItem, setReason, cancel, saveSummary } = useStocktake();
  const [query, setQuery] = useState('');
  const [cat, setCat] = useState('all'); // quick-count scope by category (Phase 2.8c)
  const [scanning, setScanning] = useState(false);
  const [reviewing, setReviewing] = useState(false);

  const categories = useMemo(() => {
    const set = new Set();
    for (const p of products) if (p.category) set.add(p.category);
    return [...set].sort((a, b) => a.localeCompare(b));
  }, [products]);

  const summary = useMemo(
    () => (session ? buildSummary(session, products) : null),
    [session, products],
  );

  const countedIds = session ? Object.keys(session.counts) : [];
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const list = products.filter((p) => {
      if (cat !== 'all' && (p.category || '') !== cat) return false;        // scope the count to one category
      if (!q) return true;
      return p.name.toLowerCase().includes(q) || (p.barcode || '').includes(q);
    });
    // Uncounted first, then counted — so it's obvious what's left to do.
    return [...list].sort((a, b) => {
      const ac = session?.counts[a.id] != null ? 1 : 0;
      const bc = session?.counts[b.id] != null ? 1 : 0;
      return ac - bc;
    });
  }, [products, query, cat, session]);

  function onScan(code) {
    setScanning(false);
    const p = products.find((x) => x.barcode && x.barcode === String(code).trim());
    if (!p) { toast.error('Not in your stock list'); return; }
    bumpItem(p.id, 1, Number(p.qty) || 0); // snapshot expected-at-count
    toast.success(`${p.name}: ${(Number(session?.counts[p.id]) || 0) + 1}`);
  }

  function applyAndFinish() {
    if (!summary) return;
    // A big difference must carry a reason before it's applied (Phase 2.8e) — a fat-finger or a theft
    // shouldn't change stock with no explanation. Small miscounts aren't gated.
    if (summary.materialWithoutReason && summary.materialWithoutReason.length) {
      toast.error(`Add a reason for ${summary.materialWithoutReason.length} big difference${summary.materialWithoutReason.length === 1 ? '' : 's'} before applying.`);
      return;
    }
    // Snapshot-safe: apply the count's correction (counted − expectedAt) to CURRENT stock, so a
    // sale/delivery that happened during the count isn't overwritten by a stale total.
    const items = Object.keys(session.counts).map((id) => ({
      id,
      counted: session.counts[id],
      expectedAt: session.expected?.[id],
      reason: session.reasons?.[id],
    }));
    applyCounts(items);
    saveSummary(summary, { name: session.name, startedAt: session.startedAt });
    setReviewing(false);
    const net = summary.netValue;
    if (net < 0) toast(`Counts applied · ${money(net)} shrinkage recorded`, { icon: '📉' });
    else toast.success('Counts applied to stock');
  }

  // ---- No active session: intro + history ----------------------------------
  if (!session) {
    return (
      <div>
        <BackLink onBack={onBack} />
        <h2 className="mb-1 text-base font-bold text-gray-900">Stocktake</h2>
        <p className="mb-4 text-xs text-gray-400">Count your stock, catch shrinkage. Scan or type — we do the maths and put a £ on what’s missing.</p>

        {products.length === 0 ? (
          <div className="mt-6 flex flex-col items-center text-center">
            <span className="mb-3 flex h-14 w-14 items-center justify-center rounded-2xl bg-primary-50 text-primary">
              <ClipboardCheck className="h-7 w-7" strokeWidth={1.75} />
            </span>
            <p className="text-sm font-semibold text-gray-900">Add stock first</p>
            <p className="mt-1 max-w-xs text-sm text-gray-500">Book in a delivery on the Scan tab, then come back to count it.</p>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => start('Stock count')}
            className="flex w-full items-center justify-center gap-2 rounded-2xl bg-primary px-4 py-3.5 text-sm font-bold text-white shadow-sm active:scale-[0.99]"
          >
            <Play className="h-4 w-4" /> Start a count
          </button>
        )}

        {history.length > 0 && (
          <section className="mt-6">
            <h3 className="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-gray-400">
              <History className="h-3.5 w-3.5" /> Past counts
            </h3>
            <ul className="space-y-2">
              {history.map((h) => (
                <li key={h.id} className="flex items-center gap-3 rounded-2xl border border-gray-100 bg-white p-3 shadow-sm">
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-semibold text-gray-900">{dateLabel(h.finishedAt)}</span>
                    <span className="block text-[11px] text-gray-500">{h.itemsCounted} counted · {h.discrepancyCount} off</span>
                  </span>
                  {h.shrinkageValue > 0 ? (
                    <span className="shrink-0 rounded-full bg-danger/10 px-2 py-0.5 text-[11px] font-bold tabular-nums text-danger">
                      −{money(h.shrinkageValue)}
                    </span>
                  ) : (
                    <span className="shrink-0 rounded-full bg-success-light px-2 py-0.5 text-[11px] font-bold text-success-dark">Clean</span>
                  )}
                </li>
              ))}
            </ul>
          </section>
        )}
      </div>
    );
  }

  // ---- Review screen -------------------------------------------------------
  if (reviewing) {
    return (
      <div>
        <button type="button" onClick={() => setReviewing(false)} className="mb-4 inline-flex items-center gap-1 text-sm font-medium text-primary hover:underline">
          <ArrowLeft className="h-4 w-4" /> Back to counting
        </button>
        <h2 className="mb-1 text-base font-bold text-gray-900">Count summary</h2>
        <p className="mb-4 text-xs text-gray-400">{summary.itemsCounted} items counted · {summary.discrepancyCount} don’t match.</p>

        {/* Headline */}
        <div className="mb-4 grid grid-cols-2 gap-3">
          <div className="rounded-2xl border border-gray-100 bg-white p-4 shadow-sm">
            <span className="flex items-center gap-1.5 text-xs font-medium text-gray-400"><TrendingDown className="h-4 w-4" /> Shrinkage</span>
            <span className="mt-1 block text-2xl font-extrabold tabular-nums text-danger">−{money(summary.shrinkageValue)}</span>
            <span className="text-[10px] text-gray-400">{summary.shrinkageUnits} units missing</span>
          </div>
          <div className="rounded-2xl border border-gray-100 bg-white p-4 shadow-sm">
            <span className="flex items-center gap-1.5 text-xs font-medium text-gray-400"><TrendingUp className="h-4 w-4" /> Overage</span>
            <span className="mt-1 block text-2xl font-extrabold tabular-nums text-success">+{money(summary.overageValue)}</span>
            <span className="text-[10px] text-gray-400">more on shelf than expected</span>
          </div>
        </div>

        {summary.discrepancies.length > 0 ? (
          <ul className="mb-4 space-y-2">
            {summary.discrepancies.map((l) => (
              <li key={l.productId} className="flex items-center gap-3 rounded-2xl border border-gray-100 bg-white p-3 shadow-sm">
                <AlertTriangle className={`h-4 w-4 shrink-0 ${l.variance < 0 ? 'text-danger' : 'text-success'}`} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-semibold text-gray-900">{l.name}</span>
                  <span className="block text-[11px] text-gray-500">Expected {l.expected} · counted {l.counted}{l.material && <span className="ml-1 font-semibold text-danger">· big difference</span>}</span>
                  {(() => {
                    const needsReason = l.material && !String(session.reasons?.[l.productId] || '').trim();
                    return (
                      <input
                        value={session.reasons?.[l.productId] || ''}
                        onChange={(e) => setReason(l.productId, e.target.value)}
                        placeholder={l.material ? 'Reason required — e.g. damaged, miscount, theft' : 'Reason (optional) — e.g. damaged, miscount'}
                        aria-label={`Reason for ${l.name}`}
                        aria-required={l.material || undefined}
                        className={`mt-1 w-full rounded-lg border px-2 py-1 text-[11px] text-gray-900 focus:outline-none ${needsReason ? 'border-danger focus:border-danger' : 'border-gray-200 focus:border-primary'}`}
                      />
                    );
                  })()}
                </span>
                <span className={`shrink-0 self-start text-sm font-bold tabular-nums ${l.variance < 0 ? 'text-danger' : 'text-success'}`}>
                  {l.variance > 0 ? '+' : ''}{l.variance}
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <div className="mb-4 flex items-center gap-2 rounded-2xl border border-success-light bg-success-light/40 p-4 text-sm font-semibold text-success-dark">
            <Check className="h-5 w-5" /> Everything matches. Spotless.
          </div>
        )}

        <button type="button" onClick={applyAndFinish} className="flex w-full items-center justify-center gap-2 rounded-2xl bg-primary px-4 py-3.5 text-sm font-bold text-white shadow-sm active:scale-[0.99]">
          <Check className="h-4 w-4" /> Apply counts to stock
        </button>
        <p className="mt-2 text-center text-[11px] text-gray-400">Applies each count as a correction (safe if stock moved mid-count) and saves it. Count only the items you check — a shelf at a time is fine.</p>
      </div>
    );
  }

  // ---- Counting screen ----------------------------------------------------
  const net = summary.netValue;
  return (
    <div>
      <BackLink onBack={onBack} />

      <div className="mb-3 flex items-center justify-between">
        <div>
          <h2 className="text-base font-bold text-gray-900">Counting…</h2>
          <p className="text-xs text-gray-400">{countedIds.length} of {products.length} counted{net !== 0 ? ` · net ${net < 0 ? '−' : '+'}${money(net)}` : ''}</p>
        </div>
        <button type="button" onClick={() => { if (confirm('Cancel this count? Your counts will be discarded.')) cancel(); }} className="text-xs font-medium text-gray-400 hover:text-danger">Cancel</button>
      </div>

      {/* Scan + search */}
      {scanning ? (
        <div className="mb-3">
          <BarcodeScanner onScan={onScan} onClose={() => setScanning(false)} />
        </div>
      ) : (
        <button type="button" onClick={() => setScanning(true)} className="mb-3 flex w-full items-center justify-center gap-2 rounded-2xl border border-primary/30 bg-primary-50 px-4 py-3 text-sm font-semibold text-primary active:scale-[0.99]">
          <Camera className="h-4 w-4" /> Scan to count (+1 each scan)
        </button>
      )}
      <div className="relative mb-4">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search stock to count…"
          className="w-full rounded-xl border border-gray-200 bg-white py-2.5 pl-9 pr-3 text-sm focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
        />
      </div>

      {/* Quick-count scope: count one category at a time (Phase 2.8c). */}
      {categories.length > 1 && (
        <div className="mb-3 flex gap-2 overflow-x-auto pb-1">
          <CatChip label="All" active={cat === 'all'} onClick={() => setCat('all')} />
          {categories.map((c) => (
            <CatChip key={c} label={c} active={cat === c} onClick={() => setCat(c)} />
          ))}
        </div>
      )}

      <ul className="space-y-2">
        {filtered.map((p) => {
          const counted = session.counts[p.id];
          const isCounted = counted != null;
          const expected = Number(p.qty) || 0;
          const variance = isCounted ? (Number(counted) || 0) - expected : 0;
          return (
            <li key={p.id} className={`flex items-center gap-3 rounded-2xl border p-3 shadow-sm ${isCounted ? 'border-primary/30 bg-primary-50/40' : 'border-gray-100 bg-white'}`}>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-semibold text-gray-900">{p.name}</span>
                <span className="block text-[11px] text-gray-500">
                  {p.countedAt ? 'Counted' : 'Recorded'} {expected}
                  {p.countedAt && <span className="text-gray-400"> · last {dateLabel(p.countedAt)}</span>}
                  {isCounted && variance !== 0 && (
                    <span className={`ml-1 font-semibold ${variance < 0 ? 'text-danger' : 'text-success'}`}>
                      · {variance > 0 ? '+' : ''}{variance}
                    </span>
                  )}
                  {isCounted && variance === 0 && <span className="ml-1 font-semibold text-success">· match</span>}
                </span>
              </span>
              <input
                type="number"
                inputMode="numeric"
                min="0"
                value={counted ?? ''}
                onChange={(e) => countItem(p.id, e.target.value, expected)}
                placeholder="—"
                aria-label={`Counted quantity for ${p.name}`}
                className="w-16 rounded-xl border border-gray-200 py-2 text-center text-sm font-bold tabular-nums focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
              />
              <button
                type="button"
                onClick={() => countItem(p.id, expected, expected)}
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-gray-100 text-gray-500 active:scale-95"
                aria-label={`Mark ${p.name} as matching expected`}
                title="Counts match expected"
              >
                <Check className="h-4 w-4" />
              </button>
            </li>
          );
        })}
        {filtered.length === 0 && <li className="py-6 text-center text-sm text-gray-400">No products match “{query}”.</li>}
      </ul>

      {/* Finish bar */}
      {countedIds.length > 0 && (
        <button
          type="button"
          onClick={() => setReviewing(true)}
          className="mt-5 flex w-full items-center justify-center gap-2 rounded-2xl bg-gray-900 px-4 py-3.5 text-sm font-bold text-white shadow-sm active:scale-[0.99]"
        >
          Review {countedIds.length} counted <ChevronRight className="h-4 w-4" />
        </button>
      )}
    </div>
  );
}

function CatChip({ label, active, onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`shrink-0 rounded-full border px-3 py-1.5 text-xs font-semibold active:scale-95 ${active ? 'border-primary bg-primary text-white' : 'border-gray-200 bg-white text-gray-700'}`}
    >
      {label}
    </button>
  );
}

function BackLink({ onBack }) {
  return (
    <button type="button" onClick={onBack} className="mb-4 inline-flex items-center gap-1 text-sm font-medium text-primary hover:underline">
      <ArrowLeft className="h-4 w-4" /> Home
    </button>
  );
}
