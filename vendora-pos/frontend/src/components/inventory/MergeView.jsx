import React, { useMemo, useState } from 'react';
import toast from 'react-hot-toast';
import { ArrowLeft, Merge, AlertTriangle } from 'lucide-react';
import { useInventory, findDuplicateProducts } from '../../lib/inventoryStore';

/**
 * Reviewable duplicate-product merge (Phase 2.7e/f). Shows likely duplicates (same barcode, or same name),
 * lets the owner choose which record to KEEP, and merges the rest into it — unioning barcodes, summing
 * stock, and re-pointing all history (movements, claims, price history, invoice + delivery lines) so
 * nothing is lost. Never merges automatically; every merge is an explicit, confirmed choice.
 */
export default function MergeView({ onBack }) {
  const { products, mergeProducts } = useInventory();
  const groups = useMemo(() => findDuplicateProducts(products), [products]);
  const [keepByGroup, setKeepByGroup] = useState({}); // groupKey -> productId to keep

  function doMerge(group) {
    const keepId = keepByGroup[group.key] || group.products[0].id;
    const drops = group.products.filter((p) => p.id !== keepId);
    const names = drops.map((d) => d.name).join(', ');
    if (!window.confirm(`Merge ${drops.length} product${drops.length === 1 ? '' : 's'} (${names}) into "${group.products.find((p) => p.id === keepId).name}"?\n\nStock is combined and all history moves to the kept product. This can't be auto-undone.`)) return;
    let ok = 0;
    for (const d of drops) {
      const r = mergeProducts(keepId, d.id);
      if (r.ok) ok += 1; else { toast.error(r.error || 'Merge failed'); break; }
    }
    if (ok) toast.success(`Merged ${ok} duplicate${ok === 1 ? '' : 's'}`);
  }

  return (
    <div>
      {onBack && (
        <button type="button" onClick={onBack} className="mb-4 inline-flex items-center gap-1 text-sm font-medium text-primary hover:underline">
          <ArrowLeft className="h-4 w-4" /> Back
        </button>
      )}
      <div className="mb-3 flex items-center gap-2">
        <span className="flex h-10 w-10 items-center justify-center rounded-2xl bg-primary-50 text-primary"><Merge className="h-5 w-5" /></span>
        <div>
          <h2 className="text-base font-bold text-gray-900">Merge duplicates</h2>
          <p className="text-xs text-gray-400">Same item entered twice? Combine them without losing history.</p>
        </div>
      </div>

      {groups.length === 0 ? (
        <p className="rounded-2xl border border-gray-100 bg-white p-6 text-center text-sm text-gray-500 shadow-sm">
          No likely duplicates found. We flag products that share a barcode or have the same name.
        </p>
      ) : (
        <div className="space-y-4">
          {groups.map((g) => {
            const keepId = keepByGroup[g.key] || g.products[0].id;
            return (
              <div key={g.key} className="rounded-2xl border border-gray-200 bg-white p-3 shadow-sm">
                <p className="mb-2 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-gray-400">
                  <AlertTriangle className="h-3.5 w-3.5 text-amber-500" />
                  {g.reason === 'barcode' ? 'Same barcode' : 'Same name'}
                </p>
                <ul className="space-y-1.5">
                  {g.products.map((p) => (
                    <li key={p.id}>
                      <label className="flex items-center gap-2 rounded-xl border border-gray-100 p-2">
                        <input type="radio" name={`keep-${g.key}`} checked={keepId === p.id} onChange={() => setKeepByGroup((m) => ({ ...m, [g.key]: p.id }))} />
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-sm font-semibold text-gray-900">{p.name}</span>
                          <span className="block text-[11px] text-gray-500">
                            {Number(p.qty) || 0} in stock{p.barcode ? ` · ${p.barcode}` : ''}{keepId === p.id ? ' · keep this' : ''}
                          </span>
                        </span>
                      </label>
                    </li>
                  ))}
                </ul>
                <button type="button" onClick={() => doMerge(g)} className="mt-2 flex w-full items-center justify-center gap-2 rounded-xl bg-primary px-3 py-2.5 text-sm font-semibold text-white active:scale-[0.99]">
                  <Merge className="h-4 w-4" /> Merge into the kept product
                </button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
