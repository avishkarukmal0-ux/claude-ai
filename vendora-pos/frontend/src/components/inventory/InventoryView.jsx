import React, { useEffect, useMemo, useRef, useState } from 'react';
import toast from 'react-hot-toast';
import { Plus, Search, Trash2, Minus, PackagePlus, Truck, Upload, Package2, Pencil, History, Merge, MoreVertical, ShoppingCart, Check } from 'lucide-react';
import ConfirmDialog from '../common/ConfirmDialog';
import ScreenBack from '../common/ScreenBack';
import { useInventory, margin, isLowStock, expiryInfo, DATE_TYPES, normalisePackSize, findDuplicateProducts } from '../../lib/inventoryStore';
import ProductHistory from './ProductHistory';
import MergeView from './MergeView';
import { ProductThumb } from '../common/ProductImage';
import { useFormDraft } from '../../lib/formDraft';
import { useSuppliers } from '../../lib/supplierStore';
import { useBuyList } from '../../lib/buyListStore';
import { getSavedShopType, getFamily } from '../../config/shopTypes';
import { categoriesForFamily, categoriesInUse, UNCATEGORISED } from '../../config/categories';
import { unitPrice } from '../../lib/priceMarking';
import { validBarcode } from '../../lib/barcode';
import { ALLERGENS } from '../../data/allergens';
import { round2 } from '../../lib/money';

// ── Form input validation (UX pass 1) ─────────────────────────────────────────
// Money fields accept UK comma decimals ("1,20" → 1.2) as well as "1.20". Blank is allowed (optional).
// Text or a negative is rejected with an inline message; the raw text the user typed is always kept.
function parseMoneyInput(raw) {
  const s = String(raw == null ? '' : raw).trim().replace(',', '.');
  if (s === '') return { value: null, error: null };
  if (!/^\d*\.?\d+$/.test(s)) return { value: null, error: 'Enter a number, e.g. 1.20' };
  const n = Number(s);
  if (!Number.isFinite(n) || n < 0) return { value: null, error: 'Enter a number, e.g. 1.20' };
  return { value: round2(n), error: null };
}
// Quantity must be a whole number. Blank → 0. A negative parses but is flagged so the form can demand an
// explicit "Yes, stock is -N" confirmation before it's ever saved (never save a silent negative).
function parseQtyInput(raw) {
  const s = String(raw == null ? '' : raw).trim();
  if (s === '') return { value: 0, error: null, negative: false };
  if (!/^-?\d+$/.test(s)) return { value: null, error: 'Enter a whole number', negative: false };
  const n = Number(s);
  return { value: n, error: null, negative: n < 0 };
}
// Inline field error (screen-reader live): role="alert" announces it the moment it appears.
function FieldError({ children }) {
  if (!children) return null;
  return <p role="alert" className="mb-2 -mt-1 text-xs font-medium text-danger-dark">{children}</p>;
}

// Food shops (Fresh & weighed, World & specialist) need allergen/ingredient capture for PPDS.
function isFoodShop() {
  const fam = getSavedShopType()?.familyId;
  return fam === 'fresh-weighed' || fam === 'world-specialist';
}

// A barcode is optional, but if present it must be a real EAN/UPC length (8–14 digits).
// Canonical impl lives in lib/barcode.js; imported above for local use and re-exported so existing
// imports/tests of `validBarcode` from this module keep working.
export { validBarcode };

// Stock tab — a real, on-device inventory. Add/search products, adjust stock,
// see margins and low-stock at a glance. Works offline; no backend needed.
export default function InventoryView({ onOpenSuppliers, onOpenImport }) {
  const { products, addProduct, updateProduct, removeProduct, restoreProduct } = useInventory();
  const { suppliers } = useSuppliers();
  const [query, setQuery] = useState('');
  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState(null); // product being edited, or null
  const [viewingId, setViewingId] = useState(null); // product whose movement history is open
  const [merging, setMerging] = useState(false);    // duplicate-merge screen open
  const supplierNameById = useMemo(() => Object.fromEntries(suppliers.map((s) => [s.id, s.name])), [suppliers]);
  const viewing = viewingId ? products.find((p) => p.id === viewingId) : null;
  const dupCount = useMemo(() => findDuplicateProducts(products).length, [products]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return products;
    return products.filter(
      (p) => p.name.toLowerCase().includes(q)
        || (p.barcode || '').includes(q)
        || (p.caseBarcode || '').includes(q)
        || (p.category || '').toLowerCase().includes(q)
    );
  }, [products, query]);

  // Group the visible products by category (Uncategorised sinks to the bottom) so the list reads like a
  // shop — confectionery together, tobacco together — instead of one long undifferentiated roll.
  const grouped = useMemo(() => {
    const map = new Map();
    for (const p of filtered) {
      const key = p.category || UNCATEGORISED;
      if (!map.has(key)) map.set(key, []);
      map.get(key).push(p);
    }
    return [...map.entries()].sort(([a], [b]) => {
      if (a === UNCATEGORISED) return 1;
      if (b === UNCATEGORISED) return -1;
      return a.localeCompare(b);
    });
  }, [filtered]);

  // Category suggestions: shop-family presets, with any the shop already uses pulled to the front.
  const categorySuggestions = useMemo(() => {
    const family = getFamily(getSavedShopType()?.familyId);
    const used = categoriesInUse(products);
    const presets = categoriesForFamily(family && family.id);
    const seen = new Set();
    return [...used, ...presets].filter((c) => (seen.has(c) ? false : seen.add(c)));
  }, [products]);

  const lowCount = products.filter(isLowStock).length;

  if (viewing) return <ProductHistory product={viewing} onBack={() => setViewingId(null)} />;
  if (merging) return <MergeView onBack={() => setMerging(false)} />;

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="text-base font-bold text-gray-900">Inventory</h2>
          <p className="text-xs text-gray-400">
            {products.length} item{products.length === 1 ? '' : 's'}
            {lowCount > 0 && <span className="text-danger"> · {lowCount} low</span>}
          </p>
        </div>
        <div className="flex flex-wrap items-center justify-end gap-2">
          {dupCount > 0 && (
            <button type="button" onClick={() => setMerging(true)} className="flex h-11 items-center gap-1 rounded-xl border border-amber-300 bg-amber-50 px-2.5 text-xs font-semibold text-amber-700 active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary" aria-label="Merge duplicate products">
              <Merge className="h-4 w-4" /> {dupCount}
            </button>
          )}
          {onOpenImport && (
            <button type="button" onClick={onOpenImport} className="flex h-11 w-11 items-center justify-center rounded-xl border border-gray-200 bg-white text-gray-600 active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary" aria-label="Import products">
              <Upload className="h-5 w-5" />
            </button>
          )}
          {onOpenSuppliers && (
            <button type="button" onClick={onOpenSuppliers} className="flex h-11 w-11 items-center justify-center rounded-xl border border-gray-200 bg-white text-gray-600 active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary" aria-label="Suppliers">
              <Truck className="h-5 w-5" />
            </button>
          )}
          <button
            type="button"
            onClick={() => setAdding((v) => !v)}
            className="flex min-h-[44px] items-center gap-1 rounded-xl bg-primary px-3 text-sm font-semibold text-white shadow-sm active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2"
          >
            <Plus className="h-4 w-4" /> Add
          </button>
        </div>
      </div>

      {adding && <AddForm suppliers={suppliers} categorySuggestions={categorySuggestions} onAdd={(p) => { addProduct(p); setAdding(false); toast.success(`Saved ${(p.name || '').trim() || 'item'}`); }} onCancel={() => setAdding(false)} />}

      {editing && (
        <EditForm
          product={editing}
          suppliers={suppliers}
          categorySuggestions={categorySuggestions}
          onSave={(patch) => { updateProduct(editing.id, patch); setEditing(null); }}
          onCancel={() => setEditing(null)}
        />
      )}

      {products.length > 0 && (
        <div className="relative mb-3">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search name or barcode"
            aria-label="Search products"
            className="min-h-[44px] w-full rounded-xl border border-gray-200 py-2.5 pl-9 pr-3 text-base focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
          />
        </div>
      )}

      {products.length > 0 && filtered.length === 0 && (
        <div className="mt-6 flex flex-col items-center text-center">
          <span className="mb-3 flex h-14 w-14 items-center justify-center rounded-2xl bg-gray-100 text-gray-400"><Search className="h-7 w-7" strokeWidth={1.75} /></span>
          <p className="text-sm font-semibold text-gray-900">No products match “{query}”</p>
          <p className="mt-1 max-w-xs text-sm text-gray-500">Try a different name or barcode.</p>
          <button type="button" onClick={() => setQuery('')} className="mt-4 inline-flex min-h-[44px] items-center rounded-xl border border-gray-200 px-4 text-sm font-semibold text-primary">Clear search</button>
        </div>
      )}

      {products.length === 0 && !adding ? (
        <EmptyState onAdd={() => setAdding(true)} onImport={onOpenImport} />
      ) : (
        <div className="space-y-4">
          {grouped.map(([cat, items]) => (
            <div key={cat}>
              <div className="mb-1.5 flex items-center gap-2 px-1">
                <h3 className="text-xs font-bold uppercase tracking-wide text-gray-400">{cat}</h3>
                <span className="text-xs text-gray-300">{items.length}</span>
              </div>
              <ul className="space-y-2">
                {items.map((p) => (
                  <ProductRow key={p.id} p={p} suppliers={suppliers} updateProduct={updateProduct} removeProduct={removeProduct} restoreProduct={restoreProduct} onEdit={() => setEditing(p)} onHistory={() => setViewingId(p.id)} />
                ))}
              </ul>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// One product row. Shows category + pack ("Case of N") alongside the existing barcode/price/margin so
// the shopkeeper can see at a glance what the item is and how it's bought.
function ProductRow({ p, suppliers, updateProduct, removeProduct, restoreProduct, onEdit, onHistory }) {
  const m = margin(p);
  const low = isLowStock(p);
  const buyList = useBuyList();
  const onBuyList = !!buyList.hasProduct?.(p.id);
  function orderThis() {
    buyList.addItem({ productId: p.id, name: p.name, barcode: p.barcode, qty: 1, supplierId: p.supplierId || null, supplierName: suppliers.find((s) => s.id === p.supplierId)?.name });
    toast.success(`Added ${p.name} to the buy list`);
  }
  const [menuOpen, setMenuOpen] = useState(false); // kebab menu: History / Edit / Delete (declutters the row)
  const [confirmDel, setConfirmDel] = useState(false);
  // Move keyboard focus into the menu when it opens (a11y: an opened menu should take focus), and back to the
  // trigger when it closes, so keyboard/screen-reader users land on the first item instead of being left behind.
  const menuTriggerRef = useRef(null);
  const firstMenuItemRef = useRef(null);
  useEffect(() => { if (menuOpen) firstMenuItemRef.current?.focus(); }, [menuOpen]);
  function doDelete() {
    setConfirmDel(false);
    const snapshot = p; // keep the exact product so Undo can restore it (id + history links intact)
    removeProduct(p.id);
    toast((t) => (
      <span className="flex items-center gap-3 text-sm">Deleted “{snapshot.name}”.
        <button type="button" onClick={() => { restoreProduct?.(snapshot); toast.dismiss(t.id); }} className="inline-flex min-h-[44px] items-center px-2 font-semibold text-primary underline">Undo</button>
      </span>
    ), { duration: 6000 });
  }
  return (
    <li className="rounded-2xl border border-gray-100 bg-white p-3 shadow-sm">
      <div className="flex items-start justify-between gap-2">
        <div className="flex min-w-0 gap-2.5">
          <ProductThumb product={p} />
          <div className="min-w-0">
          <div className="text-sm font-semibold leading-tight text-gray-900 line-clamp-2">{p.name}</div>
          <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-gray-500">
            {p.barcode && <span className="font-mono">{p.barcode}</span>}
            {Number.isFinite(p.price) && p.price != null && <span>£{Number(p.price).toFixed(2)} incl. VAT</span>}
            {unitPrice(p) && <span className="text-gray-400">{unitPrice(p).text}</span>}
            {m != null && <span className={m < 0 ? 'text-danger' : 'text-success-dark'}>{(m * 100).toFixed(0)}% margin</span>}
            {!(Number.isFinite(Number(p.price)) && Number(p.price) > 0) && (
              <button type="button" onClick={onEdit} className="text-primary underline">Add a price to see your margin</button>
            )}
            {isFoodShop() && (!Array.isArray(p.allergens) || p.allergens.length === 0) && !p.ingredients && (
              <span className="inline-flex items-center gap-1 rounded-full bg-warning-light px-1.5 py-0.5 text-xs font-semibold text-warning-dark">⚠ no allergens</span>
            )}
            {p.packSize > 1 && (
              <span className="inline-flex items-center gap-1 rounded-full bg-primary-50 px-1.5 py-0.5 text-xs font-semibold text-primary">
                <Package2 className="h-3 w-3" /> Case of {p.packSize}
              </span>
            )}
            {/* Stock confidence (Phase 2.8): has this number been physically counted? */}
            {p.countedAt ? (
              <span className="text-success">counted {new Date(p.countedAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}</span>
            ) : (
              <span className="text-gray-400">not counted</span>
            )}
          </div>
          {/* Inline edits — each control is >= 44px tall and wraps to its own row on narrow phones (375px). */}
          {suppliers.length > 0 && (
            <select
              value={p.supplierId || ''}
              onChange={(e) => updateProduct(p.id, { supplierId: e.target.value || null })}
              className="mt-1.5 min-h-[44px] w-full max-w-[16rem] rounded-lg border border-gray-200 bg-white px-2 text-xs text-gray-600 focus:border-primary focus:outline-none"
              aria-label={`Supplier for ${p.name}`}
            >
              <option value="">— supplier —</option>
              {suppliers.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          )}
          <div className="mt-1.5 flex flex-wrap items-center gap-2">
            <input
              type="date"
              value={p.expiry || ''}
              onChange={(e) => updateProduct(p.id, { expiry: e.target.value || null })}
              className="min-h-[44px] rounded-lg border border-gray-200 bg-white px-2 text-xs text-gray-600 focus:border-primary focus:outline-none"
              aria-label={`Expiry date for ${p.name}`}
            />
            {p.expiry && (
              <select
                value={p.dateType || 'best-before'}
                onChange={(e) => updateProduct(p.id, { dateType: e.target.value })}
                className="min-h-[44px] rounded-lg border border-gray-200 bg-white px-2 text-xs text-gray-600 focus:border-primary focus:outline-none"
                aria-label={`Date type for ${p.name}`}
              >
                {Object.entries(DATE_TYPES).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
              </select>
            )}
            {(() => { const ei = expiryInfo(p); if (!ei || ei.status === 'ok') return null; return (
              <span className={`rounded-full px-2 py-1 text-xs font-semibold ${ei.mustPull ? 'bg-danger text-white' : 'bg-warning-light text-warning-dark'}`}>
                {ei.daysLeft < 0 ? (ei.mustPull ? 'PULL' : 'expired') : `${ei.daysLeft}d`}
              </span>
            ); })()}
          </div>
          </div>
        </div>
        {/* Actions collapse into a "⋮" menu so the row isn't a wall of icon buttons (375px). Delete sits apart
            at the bottom (danger tint) and CONFIRMS — it removes the product + its stock number. */}
        <div className="relative shrink-0">
          <button ref={menuTriggerRef} type="button" onClick={() => setMenuOpen((v) => !v)} aria-haspopup="menu" aria-expanded={menuOpen} className="flex h-11 w-11 items-center justify-center rounded-lg text-gray-500 hover:bg-gray-100 hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary" aria-label={`More actions for ${p.name}`}>
            <MoreVertical className="h-5 w-5" />
          </button>
          {menuOpen && (
            <>
              <button type="button" className="fixed inset-0 z-10 cursor-default" aria-label="Close menu" onClick={() => setMenuOpen(false)} />
              <div role="menu" aria-label={`Actions for ${p.name}`} onKeyDown={(e) => { if (e.key === 'Escape') { setMenuOpen(false); menuTriggerRef.current?.focus(); } }} className="absolute right-0 top-11 z-20 w-44 overflow-hidden rounded-xl border border-gray-200 bg-white py-1 shadow-lg">
                <button ref={firstMenuItemRef} type="button" role="menuitem" onClick={() => { setMenuOpen(false); onHistory(); }} className="flex min-h-[44px] w-full items-center gap-2 px-3 text-sm text-gray-700 hover:bg-gray-50">
                  <History className="h-4 w-4 text-gray-400" /> Stock history
                </button>
                <button type="button" role="menuitem" onClick={() => { setMenuOpen(false); onEdit(); }} className="flex min-h-[44px] w-full items-center gap-2 px-3 text-sm text-gray-700 hover:bg-gray-50">
                  <Pencil className="h-4 w-4 text-gray-400" /> Edit product
                </button>
                <div className="my-1 border-t border-gray-100" />
                <button type="button" role="menuitem" onClick={() => { setMenuOpen(false); setConfirmDel(true); }} className="flex min-h-[44px] w-full items-center gap-2 px-3 text-sm font-medium text-danger hover:bg-danger-light">
                  <Trash2 className="h-4 w-4" /> Delete product
                </button>
              </div>
            </>
          )}
        </div>
      </div>
      <div className="mt-2 flex items-center justify-between">
        <div className="flex flex-wrap items-center gap-2">
          <span className={`rounded-full px-2 py-1 text-xs font-semibold ${low ? 'bg-danger-light text-danger-dark' : 'bg-gray-100 text-gray-500'}`}>
            {low ? 'Low stock' : 'In stock'}
          </span>
          {/* Quick "Order this" straight from a low-stock row (UX pass 1.8) — one tap adds it to the buy list. */}
          {low && (onBuyList ? (
            <span className="inline-flex items-center gap-1 text-xs font-medium text-success-dark"><Check className="h-3.5 w-3.5" /> On buy list</span>
          ) : (
            <button type="button" onClick={orderThis} className="inline-flex min-h-[44px] items-center gap-1 rounded-lg border border-primary/30 bg-primary-50 px-3 text-xs font-semibold text-primary active:scale-95">
              <ShoppingCart className="h-3.5 w-3.5" /> Order this
            </button>
          ))}
        </div>
        <div className="flex items-center gap-3">
          <button type="button" onClick={() => updateProduct(p.id, { qty: Math.max(0, (Number(p.qty) || 0) - 1) })} className="flex h-11 w-11 items-center justify-center rounded-lg bg-gray-100 text-gray-600 active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary" aria-label={`Decrease ${p.name}`}>
            <Minus className="h-5 w-5" />
          </button>
          <span className="w-8 text-center text-base font-bold tabular-nums text-gray-900">{Number(p.qty) || 0}</span>
          <button type="button" onClick={() => updateProduct(p.id, { qty: (Number(p.qty) || 0) + 1 })} className="flex h-11 w-11 items-center justify-center rounded-lg bg-primary-50 text-primary active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary" aria-label={`Increase ${p.name}`}>
            <Plus className="h-5 w-5" />
          </button>
        </div>
      </div>
      <ConfirmDialog
        open={confirmDel}
        title={`Delete “${p.name}”?`}
        message="This removes the product and its stock number. You can undo straight after."
        confirmLabel="Delete"
        tone="danger"
        onConfirm={doDelete}
        onCancel={() => setConfirmDel(false)}
      />
    </li>
  );
}

function AddForm({ onAdd, onCancel, suppliers = [], categorySuggestions = [] }) {
  // Draft-backed so a half-typed product survives a tab switch (Phase 3.9f).
  const [f, setF, clearDraft] = useFormDraft('add-product', { name: '', barcode: '', category: '', cost: '', price: '', qty: '', supplierId: '', packSize: '', caseBarcode: '' });
  const [showPack, setShowPack] = useState(false);
  // Disposable-vape ban (since 1 Jun 2025): if the product is a vape, the owner must confirm it's reusable
  // (rechargeable AND refillable with a replaceable coil). A single-use device can't legally be stocked.
  const [reusable, setReusable] = useState(null); // tri-state: null unanswered / true / false
  const isVape = /\bvape|e-?liquid|e-?cig|e-?cigarette|nicotine\b/i.test(f.category || '');
  const vapeBlocked = isVape && reusable === false;
  const vapeUnanswered = isVape && reusable == null;
  const set = (k) => (e) => setF((prev) => ({ ...prev, [k]: e.target.value }));
  const [errors, setErrors] = useState({});
  const [confirmNegQty, setConfirmNegQty] = useState(false);
  // Typing in a number field clears its error and cancels any pending negative-stock confirm.
  const setNum = (k) => (e) => { set(k)(e); setErrors((x) => (x[k] ? { ...x, [k]: null } : x)); if (k === 'qty') setConfirmNegQty(false); };
  const barcodeOk = validBarcode(f.barcode);
  const canSave = f.name.trim().length > 0 && !vapeBlocked && !vapeUnanswered && barcodeOk;
  // Autofocus the name field when the form opens (UX pass 1.6) so the owner can type straight away.
  const nameRef = useRef(null);
  useEffect(() => { nameRef.current?.focus(); }, []);
  const negQty = parseQtyInput(f.qty).value;
  function save() {
    const cost = parseMoneyInput(f.cost);
    const price = parseMoneyInput(f.price);
    const qty = parseQtyInput(f.qty);
    const errs = { cost: cost.error, price: price.error, qty: qty.error };
    setErrors(errs);
    if (errs.cost || errs.price || errs.qty) return;         // reject text; keep what they typed
    if (qty.negative && !confirmNegQty) { setConfirmNegQty(true); return; } // never save a silent negative
    clearDraft();
    onAdd({ ...f, cost: cost.value, price: price.value, qty: qty.value });
  }
  const cancel = () => { clearDraft(); onCancel(); };
  const inputCls = 'mb-2 min-h-[44px] w-full rounded-xl border border-gray-200 px-3 py-2.5 text-base focus:border-primary focus:outline-none';
  return (
    <div className="mb-3 rounded-2xl border border-primary/20 bg-primary-50/50 p-3">
      <ScreenBack onBack={cancel} label="Back" />
      <input ref={nameRef} value={f.name} onChange={set('name')} placeholder="Product name" aria-label="Product name" className={inputCls} />
      <input value={f.barcode} onChange={set('barcode')} inputMode="numeric" placeholder="Barcode (optional)" aria-label="Barcode" className={`${inputCls.replace('mb-2', barcodeOk ? 'mb-2' : 'mb-1')}`} />
      {!barcodeOk && <p className="mb-2 text-xs font-medium text-danger-dark">A barcode should be 8–14 digits.</p>}
      <input
        value={f.category} onChange={set('category')} list="vendora-category-list" placeholder="Category (e.g. Confectionery)" aria-label="Category"
        className={inputCls}
      />
      <datalist id="vendora-category-list">
        {categorySuggestions.map((c) => <option key={c} value={c} />)}
      </datalist>
      {isVape && (
        <div className="mb-2 rounded-xl border border-warning/40 bg-warning-light/50 p-3">
          <p className="mb-2 text-xs font-medium text-warning-dark">Rechargeable AND refillable, with a replaceable coil?</p>
          <div className="flex gap-2">
            {[['true', 'Yes'], ['false', 'No']].map(([v, label]) => {
              const on = String(reusable) === v;
              return (
                <button key={v} type="button" onClick={() => setReusable(v === 'true')} aria-pressed={on}
                  className={`inline-flex min-h-[44px] min-w-[72px] items-center justify-center rounded-xl border px-3 text-sm font-semibold ${on ? 'border-primary bg-primary-50 text-primary' : 'border-gray-200 bg-white text-gray-600'}`}>{label}</button>
              );
            })}
          </div>
          {vapeBlocked && (
            <p className="mt-2 text-xs font-semibold text-danger-dark">Single-use (disposable) vapes cannot be sold — illegal since 1 June 2025. Don’t stock this.</p>
          )}
        </div>
      )}
      {suppliers.length > 0 && (
        <select value={f.supplierId} onChange={set('supplierId')} className="mb-2 min-h-[44px] w-full rounded-xl border border-gray-200 bg-white px-3 py-2.5 text-base text-gray-700 focus:border-primary focus:outline-none">
          <option value="">Supplier (optional)</option>
          {suppliers.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
        </select>
      )}
      <div className="mb-1 grid grid-cols-3 gap-2">
        <input value={f.cost} onChange={setNum('cost')} inputMode="decimal" placeholder="Cost £" aria-label="Cost in pounds" aria-invalid={!!errors.cost} className={`min-h-[44px] rounded-xl border px-3 py-2.5 text-base focus:outline-none ${errors.cost ? 'border-danger/60 focus:border-danger' : 'border-gray-200 focus:border-primary'}`} />
        <input value={f.price} onChange={setNum('price')} inputMode="decimal" placeholder="Sell £" aria-label="Sell price in pounds" aria-invalid={!!errors.price} className={`min-h-[44px] rounded-xl border px-3 py-2.5 text-base focus:outline-none ${errors.price ? 'border-danger/60 focus:border-danger' : 'border-gray-200 focus:border-primary'}`} />
        <input value={f.qty} onChange={setNum('qty')} inputMode="numeric" placeholder="Qty" aria-label="Quantity in stock" aria-invalid={!!errors.qty} className={`min-h-[44px] rounded-xl border px-3 py-2.5 text-base focus:outline-none ${errors.qty ? 'border-danger/60 focus:border-danger' : 'border-gray-200 focus:border-primary'}`} />
      </div>
      <FieldError>{errors.cost && `Cost: ${errors.cost}`}</FieldError>
      <FieldError>{errors.price && `Sell price: ${errors.price}`}</FieldError>
      <FieldError>{errors.qty && `Quantity: ${errors.qty}`}</FieldError>

      {!showPack ? (
        <button type="button" onClick={() => setShowPack(true)} className="mb-2 inline-flex min-h-[44px] items-center text-sm font-medium text-primary">+ Comes in a case? Add pack size</button>
      ) : (
        <div className="mb-2 rounded-xl border border-gray-200 bg-white p-2">
          <p className="mb-1.5 text-xs text-gray-500">If you buy this by the case, set how many singles are in a case. Scanning the case barcode then books in a whole case.</p>
          <div className="grid grid-cols-2 gap-2">
            <input value={f.packSize} onChange={set('packSize')} inputMode="numeric" placeholder="Units per case (e.g. 24)" className="min-h-[44px] rounded-xl border border-gray-200 px-3 py-2.5 text-base focus:border-primary focus:outline-none" />
            <input value={f.caseBarcode} onChange={set('caseBarcode')} inputMode="numeric" placeholder="Case barcode (optional)" className="min-h-[44px] rounded-xl border border-gray-200 px-3 py-2.5 text-base focus:border-primary focus:outline-none" />
          </div>
        </div>
      )}

      {confirmNegQty && (
        <div role="alert" className="mb-2 rounded-xl border border-warning/50 bg-warning-light/60 p-2.5 text-xs text-warning-dark">
          Stock will be set to <b>{negQty}</b> (a negative number). That’s unusual — only do this if you’re deliberately recording a shortfall.
          <div className="mt-2 flex gap-2">
            <button type="button" onClick={save} className="inline-flex min-h-[44px] items-center rounded-lg bg-warning px-3 font-semibold text-white">Yes, stock is {negQty}</button>
            <button type="button" onClick={() => setConfirmNegQty(false)} className="inline-flex min-h-[44px] items-center rounded-lg border border-gray-300 bg-white px-3 font-semibold text-gray-700">No, fix it</button>
          </div>
        </div>
      )}

      <div className="flex gap-2">
        <button type="button" disabled={!canSave} onClick={save} className="min-h-[44px] flex-1 rounded-xl bg-primary px-3 text-sm font-semibold text-white disabled:opacity-40">Save item</button>
        <button type="button" onClick={cancel} className="min-h-[44px] rounded-xl border border-gray-200 px-3 text-sm font-medium text-gray-600">Cancel</button>
      </div>
    </div>
  );
}

// Edit an existing product — set/fix anything, including the category + pack size + case barcode that
// previously could only be set when adding. Saves via updateProduct (packSize normalised, blanks → null).
function EditForm({ product, onSave, onCancel, suppliers = [], categorySuggestions = [] }) {
  const toStr = (v) => (v == null ? '' : String(v));
  const [f, setF] = useState({
    name: toStr(product.name), barcode: toStr(product.barcode), category: toStr(product.category),
    cost: toStr(product.cost), price: toStr(product.price), supplierId: toStr(product.supplierId),
    packSize: toStr(product.packSize), caseBarcode: toStr(product.caseBarcode),
  });
  const [errors, setErrors] = useState({});
  const set = (k) => (e) => setF((prev) => ({ ...prev, [k]: e.target.value }));
  const setNum = (k) => (e) => { set(k)(e); setErrors((x) => (x[k] ? { ...x, [k]: null } : x)); };
  const canSave = f.name.trim().length > 0 && validBarcode(f.barcode);

  // Allergens + ingredients (PPDS / Natasha's Law) — food shops only.
  const foodShop = isFoodShop();
  const [allergens, setAllergens] = useState(() => (Array.isArray(product.allergens) ? product.allergens : []));
  const [ingredients, setIngredients] = useState(toStr(product.ingredients));
  const toggleAllergen = (a) => setAllergens((prev) => (prev.includes(a) ? prev.filter((x) => x !== a) : [...prev, a]));

  // Extra barcodes (Phase 2.7a): a product can answer to several codes. Kept out of the main/case slots.
  const [extra, setExtra] = useState(() => (Array.isArray(product.extraBarcodes) ? product.extraBarcodes : []));
  const [newBc, setNewBc] = useState('');
  function addExtra() {
    const code = newBc.trim();
    if (!code) return;
    if (code === f.barcode.trim() || code === f.caseBarcode.trim() || extra.includes(code)) { setNewBc(''); return; }
    setExtra([...extra, code]);
    setNewBc('');
  }
  const removeExtra = (c) => setExtra(extra.filter((x) => x !== c));

  // Supplier aliases (Phase 2.7b): the code/name a supplier uses for this product on their invoices.
  const [aliases, setAliases] = useState(() => (Array.isArray(product.supplierAliases) ? product.supplierAliases : []));
  const [al, setAl] = useState({ supplierId: '', code: '', name: '' });
  function addAlias() {
    const code = al.code.trim(); const name = al.name.trim();
    if (!code && !name) return;
    setAliases([...aliases, { supplierId: al.supplierId || null, code, name }]);
    setAl({ supplierId: '', code: '', name: '' });
  }
  const removeAlias = (i) => setAliases(aliases.filter((_, idx) => idx !== i));
  const supplierLabel = (id) => (suppliers.find((s) => s.id === id)?.name || 'Any supplier');

  function save() {
    const cost = parseMoneyInput(f.cost);
    const price = parseMoneyInput(f.price);
    if (cost.error || price.error) { setErrors({ cost: cost.error, price: price.error }); return; }
    onSave({
      name: f.name.trim() || 'Unnamed item',
      barcode: f.barcode.trim(),
      category: f.category.trim() || null,
      cost: cost.value,
      price: price.value,
      supplierId: f.supplierId || null,
      packSize: normalisePackSize(f.packSize),
      caseBarcode: f.caseBarcode.trim() || null,
      extraBarcodes: extra.map((c) => String(c).trim()).filter((c) => c && c !== f.barcode.trim() && c !== f.caseBarcode.trim()),
      supplierAliases: aliases,
      ...(foodShop ? { allergens, ingredients: ingredients.trim() || null } : {}),
    });
  }

  return (
    <div className="mb-3 rounded-2xl border border-gray-300 bg-white p-3 shadow-sm">
      <h3 className="mb-2 text-sm font-bold text-gray-900">Edit product</h3>
      <input value={f.name} onChange={set('name')} placeholder="Product name" aria-label="Product name" className="min-h-[44px] mb-2 w-full rounded-xl border border-gray-200 px-3 py-2.5 text-sm focus:border-primary focus:outline-none" />
      <input value={f.barcode} onChange={set('barcode')} inputMode="numeric" placeholder="Barcode" aria-label="Barcode" className="min-h-[44px] mb-2 w-full rounded-xl border border-gray-200 px-3 py-2.5 text-sm focus:border-primary focus:outline-none" />
      <input value={f.category} onChange={set('category')} list="vendora-category-list" placeholder="Category" aria-label="Category" className="min-h-[44px] mb-2 w-full rounded-xl border border-gray-200 px-3 py-2.5 text-sm focus:border-primary focus:outline-none" />
      <datalist id="vendora-category-list">{categorySuggestions.map((c) => <option key={c} value={c} />)}</datalist>
      {suppliers.length > 0 && (
        <select value={f.supplierId} onChange={set('supplierId')} className="min-h-[44px] mb-2 w-full rounded-xl border border-gray-200 bg-white px-3 py-2.5 text-sm text-gray-700 focus:border-primary focus:outline-none">
          <option value="">Supplier (optional)</option>
          {suppliers.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
        </select>
      )}
      <div className="mb-1 grid grid-cols-2 gap-2">
        <input value={f.cost} onChange={setNum('cost')} inputMode="decimal" placeholder="Cost £" aria-label="Cost" aria-invalid={!!errors.cost} className={`min-h-[44px] rounded-xl border px-3 py-2.5 text-sm focus:outline-none ${errors.cost ? 'border-danger/60 focus:border-danger' : 'border-gray-200 focus:border-primary'}`} />
        <input value={f.price} onChange={setNum('price')} inputMode="decimal" placeholder="Sell £" aria-label="Sell price" aria-invalid={!!errors.price} className={`min-h-[44px] rounded-xl border px-3 py-2.5 text-sm focus:outline-none ${errors.price ? 'border-danger/60 focus:border-danger' : 'border-gray-200 focus:border-primary'}`} />
      </div>
      <FieldError>{errors.cost && `Cost: ${errors.cost}`}</FieldError>
      <FieldError>{errors.price && `Sell price: ${errors.price}`}</FieldError>
      <div className="mb-2 grid grid-cols-2 gap-2">
        <input value={f.packSize} onChange={set('packSize')} inputMode="numeric" placeholder="Units per case" aria-label="Units per case" className="min-h-[44px] rounded-xl border border-gray-200 px-3 py-2.5 text-sm focus:border-primary focus:outline-none" />
        <input value={f.caseBarcode} onChange={set('caseBarcode')} inputMode="numeric" placeholder="Case barcode" aria-label="Case barcode" className="min-h-[44px] rounded-xl border border-gray-200 px-3 py-2.5 text-sm focus:border-primary focus:outline-none" />
      </div>

      {/* Allergens + ingredients (PPDS / Natasha's Law) — food shops only. */}
      {foodShop && (
        <div className="mb-2 rounded-xl border border-gray-200 bg-gray-50 p-2.5">
          <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-gray-400">Allergens &amp; ingredients (PPDS)</p>
          <textarea value={ingredients} onChange={(e) => setIngredients(e.target.value)} rows={2} placeholder="Full ingredients (in weight order)" aria-label="Ingredients"
            className="min-h-[44px] mb-2 w-full rounded-xl border border-gray-200 px-3 py-2 text-sm focus:border-primary focus:outline-none" />
          <div className="flex flex-wrap gap-1.5">
            {ALLERGENS.map((a) => {
              const on = allergens.includes(a);
              return (
                <button key={a} type="button" onClick={() => toggleAllergen(a)} aria-pressed={on}
                  className={`inline-flex min-h-[44px] items-center rounded-full border px-3 text-xs font-semibold ${on ? 'border-warning bg-warning-light text-warning-dark' : 'border-gray-200 bg-white text-gray-600'}`}>{a}</button>
              );
            })}
          </div>
        </div>
      )}

      {/* Extra barcodes (Phase 2.7a) — the same product can scan under several codes. */}
      <div className="mb-2">
        <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-gray-400">Other barcodes</p>
        {extra.length > 0 && (
          <div className="mb-1.5 flex flex-wrap gap-1.5">
            {extra.map((c) => (
              <span key={c} className="inline-flex items-center gap-1 rounded-full bg-gray-100 px-2 py-1 font-mono text-xs text-gray-700">
                {c}
                <button type="button" onClick={() => removeExtra(c)} className="text-gray-400 hover:text-danger" aria-label={`Remove barcode ${c}`}>×</button>
              </span>
            ))}
          </div>
        )}
        <div className="flex gap-2">
          <input
            value={newBc}
            onChange={(e) => setNewBc(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addExtra(); } }}
            inputMode="numeric"
            placeholder="Add another barcode"
            aria-label="Add another barcode"
            className="min-h-[44px] flex-1 rounded-xl border border-gray-200 px-3 py-2 text-sm focus:border-primary focus:outline-none"
          />
          <button type="button" onClick={addExtra} className="min-h-[44px] rounded-xl border border-gray-200 px-3 py-2 text-sm font-semibold text-primary">Add</button>
        </div>
      </div>

      {/* Supplier aliases (Phase 2.7b) — what a supplier calls this on their invoice. */}
      <div className="mb-2">
        <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-gray-400">Supplier names / codes</p>
        {aliases.length > 0 && (
          <ul className="mb-1.5 space-y-1">
            {aliases.map((a, i) => (
              <li key={`${a.code}-${a.name}-${i}`} className="flex items-center gap-2 rounded-lg bg-gray-50 px-2 py-1 text-xs text-gray-700">
                <span className="min-w-0 flex-1 truncate">{supplierLabel(a.supplierId)}: {a.code && <span className="font-mono">{a.code}</span>}{a.code && a.name ? ' · ' : ''}{a.name}</span>
                <button type="button" onClick={() => removeAlias(i)} className="text-gray-400 hover:text-danger" aria-label="Remove supplier alias">×</button>
              </li>
            ))}
          </ul>
        )}
        <div className="grid grid-cols-2 gap-2">
          {suppliers.length > 0 ? (
            <select value={al.supplierId} onChange={(e) => setAl((p) => ({ ...p, supplierId: e.target.value }))} className="min-h-[44px] col-span-2 rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm text-gray-700 focus:border-primary focus:outline-none">
              <option value="">Any supplier</option>
              {suppliers.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          ) : null}
          <input value={al.code} onChange={(e) => setAl((p) => ({ ...p, code: e.target.value }))} placeholder="Their code" aria-label="Supplier code" className="min-h-[44px] rounded-xl border border-gray-200 px-3 py-2 text-sm focus:border-primary focus:outline-none" />
          <input value={al.name} onChange={(e) => setAl((p) => ({ ...p, name: e.target.value }))} placeholder="Their name for it" aria-label="Supplier name for product" className="min-h-[44px] rounded-xl border border-gray-200 px-3 py-2 text-sm focus:border-primary focus:outline-none" />
        </div>
        <button type="button" onClick={addAlias} className="min-h-[44px] mt-1.5 rounded-xl border border-gray-200 px-3 py-1.5 text-xs font-semibold text-primary">Add supplier alias</button>
      </div>

      <div className="flex gap-2">
        <button type="button" disabled={!canSave} onClick={save} className="min-h-[44px] flex-1 rounded-xl bg-primary px-3 py-2.5 text-sm font-semibold text-white disabled:opacity-40">Save changes</button>
        <button type="button" onClick={onCancel} className="min-h-[44px] rounded-xl border border-gray-200 px-3 py-2.5 text-sm font-medium text-gray-600">Cancel</button>
      </div>
    </div>
  );
}

function EmptyState({ onAdd, onImport }) {
  return (
    <div className="mt-6 flex flex-col items-center text-center">
      <span className="mb-3 flex h-14 w-14 items-center justify-center rounded-2xl bg-primary-50 text-primary">
        <PackagePlus className="h-7 w-7" strokeWidth={1.75} />
      </span>
      <p className="text-sm font-semibold text-gray-900">No stock yet</p>
      <p className="mt-1 max-w-xs text-sm text-gray-500">Add your first product, scan a delivery, or import your list from an old till/spreadsheet.</p>
      <div className="mt-4 flex gap-2">
        <button type="button" onClick={onAdd} className="inline-flex min-h-[44px] items-center rounded-xl bg-primary px-4 text-sm font-semibold text-white">Add a product</button>
        {onImport && <button type="button" onClick={onImport} className="inline-flex min-h-[44px] items-center rounded-xl border border-gray-200 px-4 text-sm font-semibold text-gray-600">Import CSV</button>}
      </div>
    </div>
  );
}
