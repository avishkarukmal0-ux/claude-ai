import React, { useMemo, useState } from 'react';
import { Plus, Search, Trash2, Minus, PackagePlus, Truck, Upload, Package2, Pencil, History, Merge } from 'lucide-react';
import { useInventory, margin, isLowStock, expiryInfo, DATE_TYPES, normalisePackSize, findDuplicateProducts } from '../../lib/inventoryStore';
import ProductHistory from './ProductHistory';
import MergeView from './MergeView';
import { useSuppliers } from '../../lib/supplierStore';
import { getSavedShopType, getFamily } from '../../config/shopTypes';
import { categoriesForFamily, categoriesInUse, UNCATEGORISED } from '../../config/categories';

// Stock tab — a real, on-device inventory. Add/search products, adjust stock,
// see margins and low-stock at a glance. Works offline; no backend needed.
export default function InventoryView({ onOpenSuppliers, onOpenImport }) {
  const { products, addProduct, updateProduct, removeProduct } = useInventory();
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
      <div className="mb-3 flex items-center justify-between">
        <div>
          <h2 className="text-base font-bold text-gray-900">Inventory</h2>
          <p className="text-xs text-gray-400">
            {products.length} item{products.length === 1 ? '' : 's'}
            {lowCount > 0 && <span className="text-danger"> · {lowCount} low</span>}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {dupCount > 0 && (
            <button type="button" onClick={() => setMerging(true)} className="flex h-9 items-center gap-1 rounded-xl border border-amber-300 bg-amber-50 px-2 text-xs font-semibold text-amber-700 active:scale-95" aria-label="Merge duplicate products">
              <Merge className="h-4 w-4" /> {dupCount}
            </button>
          )}
          {onOpenImport && (
            <button type="button" onClick={onOpenImport} className="flex h-9 w-9 items-center justify-center rounded-xl border border-gray-200 bg-white text-gray-600 active:scale-95" aria-label="Import products">
              <Upload className="h-4 w-4" />
            </button>
          )}
          {onOpenSuppliers && (
            <button type="button" onClick={onOpenSuppliers} className="flex h-9 w-9 items-center justify-center rounded-xl border border-gray-200 bg-white text-gray-600 active:scale-95" aria-label="Suppliers">
              <Truck className="h-4 w-4" />
            </button>
          )}
          <button
            type="button"
            onClick={() => setAdding((v) => !v)}
            className="flex items-center gap-1 rounded-xl bg-primary px-3 py-2 text-sm font-semibold text-white shadow-sm active:scale-95"
          >
            <Plus className="h-4 w-4" /> Add
          </button>
        </div>
      </div>

      {adding && <AddForm suppliers={suppliers} categorySuggestions={categorySuggestions} onAdd={(p) => { addProduct(p); setAdding(false); }} onCancel={() => setAdding(false)} />}

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
            className="w-full rounded-xl border border-gray-200 py-2.5 pl-9 pr-3 text-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
          />
        </div>
      )}

      {products.length === 0 && !adding ? (
        <EmptyState onAdd={() => setAdding(true)} onImport={onOpenImport} />
      ) : (
        <div className="space-y-4">
          {grouped.map(([cat, items]) => (
            <div key={cat}>
              <div className="mb-1.5 flex items-center gap-2 px-1">
                <h3 className="text-[11px] font-bold uppercase tracking-wide text-gray-400">{cat}</h3>
                <span className="text-[11px] text-gray-300">{items.length}</span>
              </div>
              <ul className="space-y-2">
                {items.map((p) => (
                  <ProductRow key={p.id} p={p} suppliers={suppliers} updateProduct={updateProduct} removeProduct={removeProduct} onEdit={() => setEditing(p)} onHistory={() => setViewingId(p.id)} />
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
function ProductRow({ p, suppliers, updateProduct, removeProduct, onEdit, onHistory }) {
  const m = margin(p);
  const low = isLowStock(p);
  return (
    <li className="rounded-2xl border border-gray-100 bg-white p-3 shadow-sm">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="truncate text-sm font-semibold text-gray-900">{p.name}</div>
          <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11px] text-gray-500">
            {p.barcode && <span className="font-mono">{p.barcode}</span>}
            {Number.isFinite(p.price) && p.price != null && <span>£{Number(p.price).toFixed(2)}</span>}
            {m != null && <span className={m < 0 ? 'text-danger' : 'text-success'}>{(m * 100).toFixed(0)}% margin</span>}
            {p.packSize > 1 && (
              <span className="inline-flex items-center gap-1 rounded-full bg-primary-50 px-1.5 py-0.5 text-[10px] font-semibold text-primary">
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
          {suppliers.length > 0 && (
            <select
              value={p.supplierId || ''}
              onChange={(e) => updateProduct(p.id, { supplierId: e.target.value || null })}
              className="mt-1 max-w-[12rem] truncate rounded-md border border-gray-200 bg-white px-1.5 py-1 text-[11px] text-gray-600 focus:border-primary focus:outline-none"
              aria-label="Supplier"
            >
              <option value="">— supplier —</option>
              {suppliers.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          )}
          <div className="mt-1 flex items-center gap-1">
            <input
              type="date"
              value={p.expiry || ''}
              onChange={(e) => updateProduct(p.id, { expiry: e.target.value || null })}
              className="rounded-md border border-gray-200 bg-white px-1.5 py-1 text-[11px] text-gray-600 focus:border-primary focus:outline-none"
              aria-label="Expiry date"
            />
            {p.expiry && (
              <select
                value={p.dateType || 'best-before'}
                onChange={(e) => updateProduct(p.id, { dateType: e.target.value })}
                className="rounded-md border border-gray-200 bg-white px-1.5 py-1 text-[11px] text-gray-600 focus:border-primary focus:outline-none"
                aria-label="Date type"
              >
                {Object.entries(DATE_TYPES).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
              </select>
            )}
            {(() => { const ei = expiryInfo(p); if (!ei || ei.status === 'ok') return null; return (
              <span className={`rounded-full px-1.5 py-0.5 text-[10px] font-semibold ${ei.mustPull ? 'bg-danger text-white' : 'bg-warning-light text-warning-dark'}`}>
                {ei.daysLeft < 0 ? (ei.mustPull ? 'PULL' : 'expired') : `${ei.daysLeft}d`}
              </span>
            ); })()}
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          <button type="button" onClick={onHistory} className="p-2 text-gray-500 hover:text-primary" aria-label="Stock history">
            <History className="h-4 w-4" />
          </button>
          <button type="button" onClick={onEdit} className="p-2 text-gray-500 hover:text-primary" aria-label="Edit product">
            <Pencil className="h-4 w-4" />
          </button>
          <button type="button" onClick={() => removeProduct(p.id)} className="p-2 text-gray-500 hover:text-danger" aria-label="Delete">
            <Trash2 className="h-4 w-4" />
          </button>
        </div>
      </div>
      <div className="mt-2 flex items-center justify-between">
        <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${low ? 'bg-danger-light text-danger-dark' : 'bg-gray-100 text-gray-500'}`}>
          {low ? 'Low stock' : 'In stock'}
        </span>
        <div className="flex items-center gap-3">
          <button type="button" onClick={() => updateProduct(p.id, { qty: Math.max(0, (Number(p.qty) || 0) - 1) })} className="flex h-8 w-8 items-center justify-center rounded-lg bg-gray-100 text-gray-600 active:scale-95" aria-label="Decrease">
            <Minus className="h-4 w-4" />
          </button>
          <span className="w-8 text-center text-base font-bold tabular-nums text-gray-900">{Number(p.qty) || 0}</span>
          <button type="button" onClick={() => updateProduct(p.id, { qty: (Number(p.qty) || 0) + 1 })} className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary-50 text-primary active:scale-95" aria-label="Increase">
            <Plus className="h-4 w-4" />
          </button>
        </div>
      </div>
    </li>
  );
}

function AddForm({ onAdd, onCancel, suppliers = [], categorySuggestions = [] }) {
  const [f, setF] = useState({ name: '', barcode: '', category: '', cost: '', price: '', qty: '', supplierId: '', packSize: '', caseBarcode: '' });
  const [showPack, setShowPack] = useState(false);
  const set = (k) => (e) => setF((prev) => ({ ...prev, [k]: e.target.value }));
  const canSave = f.name.trim().length > 0;
  return (
    <div className="mb-3 rounded-2xl border border-primary/20 bg-primary-50/50 p-3">
      <input value={f.name} onChange={set('name')} placeholder="Product name" aria-label="Product name" className="mb-2 w-full rounded-xl border border-gray-200 px-3 py-2.5 text-sm focus:border-primary focus:outline-none" />
      <input value={f.barcode} onChange={set('barcode')} inputMode="numeric" placeholder="Barcode (optional)" aria-label="Barcode" className="mb-2 w-full rounded-xl border border-gray-200 px-3 py-2.5 text-sm focus:border-primary focus:outline-none" />
      <input
        value={f.category} onChange={set('category')} list="vendora-category-list" placeholder="Category (e.g. Confectionery)" aria-label="Category"
        className="mb-2 w-full rounded-xl border border-gray-200 px-3 py-2.5 text-sm focus:border-primary focus:outline-none"
      />
      <datalist id="vendora-category-list">
        {categorySuggestions.map((c) => <option key={c} value={c} />)}
      </datalist>
      {suppliers.length > 0 && (
        <select value={f.supplierId} onChange={set('supplierId')} className="mb-2 w-full rounded-xl border border-gray-200 bg-white px-3 py-2.5 text-sm text-gray-700 focus:border-primary focus:outline-none">
          <option value="">Supplier (optional)</option>
          {suppliers.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
        </select>
      )}
      <div className="mb-2 grid grid-cols-3 gap-2">
        <input value={f.cost} onChange={set('cost')} inputMode="decimal" placeholder="Cost £" aria-label="Cost in pounds" className="rounded-xl border border-gray-200 px-3 py-2.5 text-sm focus:border-primary focus:outline-none" />
        <input value={f.price} onChange={set('price')} inputMode="decimal" placeholder="Sell £" aria-label="Sell price in pounds" className="rounded-xl border border-gray-200 px-3 py-2.5 text-sm focus:border-primary focus:outline-none" />
        <input value={f.qty} onChange={set('qty')} inputMode="numeric" placeholder="Qty" aria-label="Quantity in stock" className="rounded-xl border border-gray-200 px-3 py-2.5 text-sm focus:border-primary focus:outline-none" />
      </div>

      {!showPack ? (
        <button type="button" onClick={() => setShowPack(true)} className="mb-2 text-xs font-medium text-primary">+ Comes in a case? Add pack size</button>
      ) : (
        <div className="mb-2 rounded-xl border border-gray-200 bg-white p-2">
          <p className="mb-1.5 text-[11px] text-gray-500">If you buy this by the case, set how many singles are in a case. Scanning the case barcode then books in a whole case.</p>
          <div className="grid grid-cols-2 gap-2">
            <input value={f.packSize} onChange={set('packSize')} inputMode="numeric" placeholder="Units per case (e.g. 24)" className="rounded-xl border border-gray-200 px-3 py-2.5 text-sm focus:border-primary focus:outline-none" />
            <input value={f.caseBarcode} onChange={set('caseBarcode')} inputMode="numeric" placeholder="Case barcode (optional)" className="rounded-xl border border-gray-200 px-3 py-2.5 text-sm focus:border-primary focus:outline-none" />
          </div>
        </div>
      )}

      <div className="flex gap-2">
        <button type="button" disabled={!canSave} onClick={() => onAdd(f)} className="flex-1 rounded-xl bg-primary px-3 py-2.5 text-sm font-semibold text-white disabled:opacity-40">Save item</button>
        <button type="button" onClick={onCancel} className="rounded-xl border border-gray-200 px-3 py-2.5 text-sm font-medium text-gray-600">Cancel</button>
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
  const set = (k) => (e) => setF((prev) => ({ ...prev, [k]: e.target.value }));
  const canSave = f.name.trim().length > 0;

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
    onSave({
      name: f.name.trim() || 'Unnamed item',
      barcode: f.barcode.trim(),
      category: f.category.trim() || null,
      cost: f.cost === '' ? null : Number(f.cost),
      price: f.price === '' ? null : Number(f.price),
      supplierId: f.supplierId || null,
      packSize: normalisePackSize(f.packSize),
      caseBarcode: f.caseBarcode.trim() || null,
      extraBarcodes: extra.map((c) => String(c).trim()).filter((c) => c && c !== f.barcode.trim() && c !== f.caseBarcode.trim()),
      supplierAliases: aliases,
    });
  }

  return (
    <div className="mb-3 rounded-2xl border border-gray-300 bg-white p-3 shadow-sm">
      <h3 className="mb-2 text-sm font-bold text-gray-900">Edit product</h3>
      <input value={f.name} onChange={set('name')} placeholder="Product name" aria-label="Product name" className="mb-2 w-full rounded-xl border border-gray-200 px-3 py-2.5 text-sm focus:border-primary focus:outline-none" />
      <input value={f.barcode} onChange={set('barcode')} inputMode="numeric" placeholder="Barcode" aria-label="Barcode" className="mb-2 w-full rounded-xl border border-gray-200 px-3 py-2.5 text-sm focus:border-primary focus:outline-none" />
      <input value={f.category} onChange={set('category')} list="vendora-category-list" placeholder="Category" aria-label="Category" className="mb-2 w-full rounded-xl border border-gray-200 px-3 py-2.5 text-sm focus:border-primary focus:outline-none" />
      <datalist id="vendora-category-list">{categorySuggestions.map((c) => <option key={c} value={c} />)}</datalist>
      {suppliers.length > 0 && (
        <select value={f.supplierId} onChange={set('supplierId')} className="mb-2 w-full rounded-xl border border-gray-200 bg-white px-3 py-2.5 text-sm text-gray-700 focus:border-primary focus:outline-none">
          <option value="">Supplier (optional)</option>
          {suppliers.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
        </select>
      )}
      <div className="mb-2 grid grid-cols-2 gap-2">
        <input value={f.cost} onChange={set('cost')} inputMode="decimal" placeholder="Cost £" aria-label="Cost" className="rounded-xl border border-gray-200 px-3 py-2.5 text-sm focus:border-primary focus:outline-none" />
        <input value={f.price} onChange={set('price')} inputMode="decimal" placeholder="Sell £" aria-label="Sell price" className="rounded-xl border border-gray-200 px-3 py-2.5 text-sm focus:border-primary focus:outline-none" />
      </div>
      <div className="mb-2 grid grid-cols-2 gap-2">
        <input value={f.packSize} onChange={set('packSize')} inputMode="numeric" placeholder="Units per case" aria-label="Units per case" className="rounded-xl border border-gray-200 px-3 py-2.5 text-sm focus:border-primary focus:outline-none" />
        <input value={f.caseBarcode} onChange={set('caseBarcode')} inputMode="numeric" placeholder="Case barcode" aria-label="Case barcode" className="rounded-xl border border-gray-200 px-3 py-2.5 text-sm focus:border-primary focus:outline-none" />
      </div>

      {/* Extra barcodes (Phase 2.7a) — the same product can scan under several codes. */}
      <div className="mb-2">
        <p className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-gray-400">Other barcodes</p>
        {extra.length > 0 && (
          <div className="mb-1.5 flex flex-wrap gap-1.5">
            {extra.map((c) => (
              <span key={c} className="inline-flex items-center gap-1 rounded-full bg-gray-100 px-2 py-1 font-mono text-[11px] text-gray-700">
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
            className="flex-1 rounded-xl border border-gray-200 px-3 py-2 text-sm focus:border-primary focus:outline-none"
          />
          <button type="button" onClick={addExtra} className="rounded-xl border border-gray-200 px-3 py-2 text-sm font-semibold text-primary">Add</button>
        </div>
      </div>

      {/* Supplier aliases (Phase 2.7b) — what a supplier calls this on their invoice. */}
      <div className="mb-2">
        <p className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-gray-400">Supplier names / codes</p>
        {aliases.length > 0 && (
          <ul className="mb-1.5 space-y-1">
            {aliases.map((a, i) => (
              <li key={`${a.code}-${a.name}-${i}`} className="flex items-center gap-2 rounded-lg bg-gray-50 px-2 py-1 text-[11px] text-gray-700">
                <span className="min-w-0 flex-1 truncate">{supplierLabel(a.supplierId)}: {a.code && <span className="font-mono">{a.code}</span>}{a.code && a.name ? ' · ' : ''}{a.name}</span>
                <button type="button" onClick={() => removeAlias(i)} className="text-gray-400 hover:text-danger" aria-label="Remove supplier alias">×</button>
              </li>
            ))}
          </ul>
        )}
        <div className="grid grid-cols-2 gap-2">
          {suppliers.length > 0 ? (
            <select value={al.supplierId} onChange={(e) => setAl((p) => ({ ...p, supplierId: e.target.value }))} className="col-span-2 rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm text-gray-700 focus:border-primary focus:outline-none">
              <option value="">Any supplier</option>
              {suppliers.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          ) : null}
          <input value={al.code} onChange={(e) => setAl((p) => ({ ...p, code: e.target.value }))} placeholder="Their code" aria-label="Supplier code" className="rounded-xl border border-gray-200 px-3 py-2 text-sm focus:border-primary focus:outline-none" />
          <input value={al.name} onChange={(e) => setAl((p) => ({ ...p, name: e.target.value }))} placeholder="Their name for it" aria-label="Supplier name for product" className="rounded-xl border border-gray-200 px-3 py-2 text-sm focus:border-primary focus:outline-none" />
        </div>
        <button type="button" onClick={addAlias} className="mt-1.5 rounded-xl border border-gray-200 px-3 py-1.5 text-xs font-semibold text-primary">Add supplier alias</button>
      </div>

      <div className="flex gap-2">
        <button type="button" disabled={!canSave} onClick={save} className="flex-1 rounded-xl bg-primary px-3 py-2.5 text-sm font-semibold text-white disabled:opacity-40">Save changes</button>
        <button type="button" onClick={onCancel} className="rounded-xl border border-gray-200 px-3 py-2.5 text-sm font-medium text-gray-600">Cancel</button>
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
        <button type="button" onClick={onAdd} className="rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-white">Add a product</button>
        {onImport && <button type="button" onClick={onImport} className="rounded-xl border border-gray-200 px-4 py-2.5 text-sm font-semibold text-gray-600">Import CSV</button>}
      </div>
    </div>
  );
}
