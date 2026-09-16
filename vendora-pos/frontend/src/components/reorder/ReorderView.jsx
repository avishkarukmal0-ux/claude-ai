import React, { useMemo } from 'react';
import toast from 'react-hot-toast';
import { ArrowLeft, ShoppingCart, Plus, Minus, Trash2, Check, PackagePlus, Building2, Share2 } from 'lucide-react';
import { useInventory, isLowStock } from '../../lib/inventoryStore';
import { useBuyList } from '../../lib/buyListStore';
import { useSuppliers } from '../../lib/supplierStore';

// Share/copy a supplier's outstanding list so the shop can send it to that
// wholesaler or rep (WhatsApp, text, paste into the supplier's own app).
async function shareGroup(supplier, groupItems) {
  const lines = groupItems.filter((i) => !i.bought).map((i) => `• ${i.name} x${i.qty}`);
  if (lines.length === 0) { toast('Nothing left to order here'); return; }
  const text = `Order — ${supplier}\n${lines.join('\n')}\n\n— via Vendora`;
  try {
    if (navigator.share) { await navigator.share({ title: `Order — ${supplier}`, text }); return; }
  } catch { /* user cancelled or share failed — fall back to copy */ }
  try {
    await navigator.clipboard.writeText(text);
    toast.success('List copied — paste it to your supplier');
    return;
  } catch { /* clipboard blocked */ }
  toast('Couldn’t copy automatically', { icon: 'ℹ️' });
}

// Suggested restock quantity to bring a low item back to a sensible "par" level.
// Honest heuristic (no sales history yet — that's the later forecasting feature):
// par = min level ×2, or 6 by default; suggest enough to reach it.
function suggestQty(p) {
  const qty = Number(p.qty) || 0;
  const par = (Number(p.min) || 0) > 0 ? Number(p.min) * 2 : 6;
  return Math.max(1, par - qty);
}

// Buy list — low stock turns into a tickable cash-&-carry list. Local-first.
export default function ReorderView({ onBack }) {
  const { products } = useInventory();
  const { suppliers } = useSuppliers();
  const { items, addItem, setQty, toggleBought, removeItem, clearBought, hasProduct } = useBuyList();

  const supplierNameById = useMemo(() => Object.fromEntries(suppliers.map((s) => [s.id, s.name])), [suppliers]);

  // Suggestions = low-stock products not already on the list.
  const suggestions = products.filter((p) => isLowStock(p) && !hasProduct(p.id));
  const boughtCount = items.filter((i) => i.bought).length;
  const totalUnits = items.reduce((n, i) => n + (Number(i.qty) || 0), 0);

  // Group the buy list by supplier (name snapshot, falling back to current lookup).
  const groups = useMemo(() => {
    const map = new Map();
    for (const i of items) {
      const key = i.supplierName || supplierNameById[i.supplierId] || 'No supplier yet';
      if (!map.has(key)) map.set(key, []);
      map.get(key).push(i);
    }
    // Named suppliers first, "No supplier yet" last.
    return [...map.entries()].sort((a, b) => (a[0] === 'No supplier yet' ? 1 : b[0] === 'No supplier yet' ? -1 : a[0].localeCompare(b[0])));
  }, [items, supplierNameById]);

  return (
    <div>
      <button type="button" onClick={onBack} className="mb-4 inline-flex items-center gap-1 text-sm font-medium text-primary hover:underline">
        <ArrowLeft className="h-4 w-4" /> Home
      </button>

      <h2 className="mb-1 text-base font-bold text-gray-900">Buy list</h2>
      <p className="mb-4 text-xs text-gray-400">Low stock becomes your cash-&-carry list. Tick items off as you shop.</p>

      {/* Suggestions */}
      {suggestions.length > 0 && (
        <section className="mb-5">
          <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-400">Running low — suggested</h3>
          <ul className="space-y-2">
            {suggestions.map((p) => (
              <li key={p.id} className="flex items-center gap-3 rounded-2xl border border-gray-100 bg-white p-3 shadow-sm">
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-semibold text-gray-900">{p.name}</span>
                  <span className="block text-[11px] text-gray-500">In stock: {Number(p.qty) || 0} · suggest +{suggestQty(p)}</span>
                </span>
                <button
                  type="button"
                  onClick={() => addItem({ productId: p.id, name: p.name, barcode: p.barcode, qty: suggestQty(p), supplierId: p.supplierId, supplierName: supplierNameById[p.supplierId] })}
                  className="flex shrink-0 items-center gap-1 rounded-xl bg-primary px-3 py-2 text-sm font-semibold text-white active:scale-95"
                >
                  <Plus className="h-4 w-4" /> Add
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* The list */}
      <div className="mb-2 flex items-center justify-between">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-gray-400">Your list {items.length > 0 && `· ${totalUnits} units`}</h3>
        {boughtCount > 0 && (
          <button type="button" onClick={clearBought} className="text-xs font-medium text-primary hover:underline">
            Clear {boughtCount} bought
          </button>
        )}
      </div>

      {items.length === 0 ? (
        <div className="mt-6 flex flex-col items-center text-center">
          <span className="mb-3 flex h-14 w-14 items-center justify-center rounded-2xl bg-primary-50 text-primary">
            <ShoppingCart className="h-7 w-7" strokeWidth={1.75} />
          </span>
          <p className="text-sm font-semibold text-gray-900">Your buy list is empty</p>
          <p className="mt-1 max-w-xs text-sm text-gray-500">
            {suggestions.length > 0 ? 'Add a suggested item above to start.' : 'When stock runs low it’ll be suggested here. Add products in the Stock tab.'}
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {groups.map(([supplier, groupItems]) => (
            <div key={supplier}>
              <div className="mb-2 flex items-center gap-1.5 text-xs font-semibold text-gray-500">
                <Building2 className="h-3.5 w-3.5 text-gray-400" /> {supplier}
                <span className="text-gray-300">· {groupItems.reduce((n, x) => n + (Number(x.qty) || 0), 0)}</span>
                <button
                  type="button"
                  onClick={() => shareGroup(supplier, groupItems)}
                  className="ml-auto flex items-center gap-1 rounded-lg bg-primary-50 px-2 py-1 text-[11px] font-semibold text-primary active:scale-95"
                >
                  <Share2 className="h-3.5 w-3.5" /> Share
                </button>
              </div>
              <ul className="space-y-2">
                {groupItems.map((i) => (
                  <li key={i.id} className={`flex items-center gap-3 rounded-2xl border p-3 shadow-sm ${i.bought ? 'border-gray-100 bg-gray-50' : 'border-gray-100 bg-white'}`}>
                    <button
                      type="button"
                      onClick={() => toggleBought(i.id)}
                      className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full border-2 ${i.bought ? 'border-success bg-success text-white' : 'border-gray-300 text-transparent'}`}
                      aria-label={i.bought ? 'Mark not bought' : 'Mark bought'}
                    >
                      <Check className="h-4 w-4" strokeWidth={3} />
                    </button>
                    <span className="min-w-0 flex-1">
                      <span className={`block truncate text-sm font-semibold ${i.bought ? 'text-gray-400 line-through' : 'text-gray-900'}`}>{i.name}</span>
                      {i.barcode && <span className="block font-mono text-[11px] text-gray-400">{i.barcode}</span>}
                    </span>
                    {!i.bought && (
                      <div className="flex items-center gap-2">
                        <button type="button" onClick={() => setQty(i.id, (Number(i.qty) || 1) - 1)} className="flex h-7 w-7 items-center justify-center rounded-lg bg-gray-100 text-gray-600 active:scale-95" aria-label="Decrease">
                          <Minus className="h-3.5 w-3.5" />
                        </button>
                        <span className="w-6 text-center text-sm font-bold tabular-nums text-gray-900">{i.qty}</span>
                        <button type="button" onClick={() => setQty(i.id, (Number(i.qty) || 0) + 1)} className="flex h-7 w-7 items-center justify-center rounded-lg bg-primary-50 text-primary active:scale-95" aria-label="Increase">
                          <Plus className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    )}
                    <button type="button" onClick={() => removeItem(i.id)} className="shrink-0 p-1 text-gray-300 hover:text-danger" aria-label="Remove">
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      )}

      {items.length > 0 && (
        <p className="mt-4 flex items-center gap-1.5 text-[11px] leading-snug text-gray-400">
          <PackagePlus className="h-3.5 w-3.5" /> Back from the cash-&-carry? Book it in on the Scan tab to update stock.
        </p>
      )}
    </div>
  );
}
