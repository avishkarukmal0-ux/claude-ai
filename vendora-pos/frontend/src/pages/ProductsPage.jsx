import React, { useState, useEffect, useCallback } from 'react';
import { Search, Plus, Edit2, AlertTriangle, Package, ChevronLeft, ChevronRight, X, BarChart2, Lightbulb } from 'lucide-react';
import * as productsSvc from '../services/products';
import api from '../services/api';
import toast from 'react-hot-toast';

const VAT_RATES = [
  { value: 0, label: '0% Zero-rated' },
  { value: 5, label: '5% Reduced' },
  { value: 20, label: '20% Standard' },
];

const CATEGORIES = [
  'Beer & Cider', 'Spirits', 'Wine', 'Soft Drinks', 'Confectionery',
  'Tobacco', 'Snacks', 'Household', 'Top-Up Cards', 'Mobile Top-Up',
  'Newspapers & Mags', 'Lottery', 'Other',
];

function ProductModal({ product, onClose, onSaved }) {
  const isEdit = !!product?._id;
  const [form, setForm] = useState(product ? {
    name: product.name || '',
    barcode: product.barcode || '',
    category: product.category || 'Other',
    brand: product.brand || '',
    retailPrice: product.retailPrice || '',
    costPrice: product.costPrice || '',
    vatRate: product.vatRate ?? 20,
    stockQuantity: product.stockQuantity ?? 0,
    lowStockThreshold: product.lowStockThreshold ?? 5,
    ageRestricted: product.ageRestricted || false,
    requiresChallenge25: product.requiresChallenge25 || false,
    isActive: product.isActive !== false,
  } : {
    name: '', barcode: '', category: 'Other', brand: '',
    retailPrice: '', costPrice: '', vatRate: 20,
    stockQuantity: 0, lowStockThreshold: 5,
    ageRestricted: false, requiresChallenge25: false, isActive: true,
  });
  const [saving, setSaving] = useState(false);
  const [suggestedPrice, setSuggestedPrice] = useState(null);
  const [suggestLoading, setSuggestLoading] = useState(false);

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const handleSuggestPrice = async () => {
    if (!form.costPrice || parseFloat(form.costPrice) <= 0) {
      toast.error('Enter cost price first');
      return;
    }
    setSuggestLoading(true);
    try {
      const res = await api.post('/products/suggest-price', {
        costPrice: parseFloat(form.costPrice),
        category: form.category,
      });
      setSuggestedPrice(res);
    } catch {
      toast.error('Could not fetch price suggestion');
    } finally {
      setSuggestLoading(false);
    }
  };

  async function handleSubmit(e) {
    e.preventDefault();
    setSaving(true);
    try {
      if (isEdit) {
        await productsSvc.updateProduct(product._id, form);
        toast.success('Product updated');
      } else {
        await productsSvc.createProduct(form);
        toast.success('Product created');
      }
      onSaved();
    } catch {
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between p-6 border-b">
          <h2 className="text-xl font-bold">{isEdit ? 'Edit Product' : 'Add Product'}</h2>
          <button onClick={onClose} className="p-2 hover:bg-gray-100 rounded-lg"><X size={20} /></button>
        </div>
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="col-span-2">
              <label className="block text-sm font-medium text-gray-700 mb-1">Product Name *</label>
              <input className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary" value={form.name} onChange={e => set('name', e.target.value)} required />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Barcode</label>
              <input className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary font-mono" value={form.barcode} onChange={e => set('barcode', e.target.value)} />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Category</label>
              <select className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary" value={form.category} onChange={e => set('category', e.target.value)}>
                {CATEGORIES.map(c => <option key={c}>{c}</option>)}
              </select>
            </div>
            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="block text-sm font-medium text-gray-700">Retail Price (£) *</label>
                <button
                  type="button"
                  onClick={handleSuggestPrice}
                  disabled={suggestLoading}
                  className="flex items-center gap-1 text-xs text-amber-600 hover:text-amber-700 font-medium disabled:opacity-50"
                >
                  {suggestLoading
                    ? <span className="animate-spin inline-block w-3 h-3 border border-amber-500 border-t-transparent rounded-full" />
                    : <Lightbulb size={12} />}
                  Suggest
                </button>
              </div>
              <input type="number" step="0.01" min="0" className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary" value={form.retailPrice} onChange={e => { set('retailPrice', e.target.value); setSuggestedPrice(null); }} required />
              {suggestedPrice && (
                <div className="mt-2 bg-amber-50 border border-amber-200 rounded-lg p-3 text-sm">
                  <div className="flex items-start gap-2 mb-2">
                    <Lightbulb size={14} className="text-amber-500 mt-0.5 shrink-0" />
                    <div className="flex-1">
                      <p className="font-semibold text-amber-900">
                        Suggested: £{Number(suggestedPrice.suggestedPrice || 0).toFixed(2)}
                        {suggestedPrice.marginPct != null && (
                          <span className={`ml-2 text-xs font-bold ${
                            suggestedPrice.marginPct >= 30 ? 'text-green-700' :
                            suggestedPrice.marginPct >= 15 ? 'text-amber-700' : 'text-red-600'
                          }`}>
                            ({suggestedPrice.marginPct}% margin)
                          </span>
                        )}
                      </p>
                      {suggestedPrice.reason && (
                        <p className="text-xs text-amber-700 mt-0.5">{suggestedPrice.reason}</p>
                      )}
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => { set('retailPrice', suggestedPrice.suggestedPrice); setSuggestedPrice(null); }}
                      className="flex-1 bg-amber-600 text-white px-2 py-1.5 rounded-md text-xs font-semibold hover:bg-amber-700"
                    >
                      Use This Price
                    </button>
                    <button
                      type="button"
                      onClick={() => setSuggestedPrice(null)}
                      className="flex-1 border border-amber-300 text-amber-700 px-2 py-1.5 rounded-md text-xs font-semibold hover:bg-amber-100"
                    >
                      Dismiss
                    </button>
                  </div>
                </div>
              )}
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Cost Price (£)</label>
              <input type="number" step="0.01" min="0" className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary" value={form.costPrice} onChange={e => set('costPrice', e.target.value)} />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">VAT Rate</label>
              <select className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary" value={form.vatRate} onChange={e => set('vatRate', Number(e.target.value))}>
                {VAT_RATES.map(r => <option key={r.value} value={r.value}>{r.label}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Stock Qty</label>
              <input type="number" min="0" className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary" value={form.stockQuantity} onChange={e => set('stockQuantity', Number(e.target.value))} />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Low Stock Alert At</label>
              <input type="number" min="0" className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary" value={form.lowStockThreshold} onChange={e => set('lowStockThreshold', Number(e.target.value))} />
            </div>
          </div>
          <div className="space-y-2 pt-2 border-t">
            <label className="flex items-center gap-2 cursor-pointer">
              <input type="checkbox" className="w-4 h-4 rounded accent-primary" checked={!!form.ageRestricted} onChange={e => set('ageRestricted', e.target.checked)} />
              <span className="text-sm font-medium text-gray-700">Age Restricted</span>
            </label>
            {form.ageRestricted && (
              <label className="flex items-center gap-2 cursor-pointer ml-6">
                <input type="checkbox" className="w-4 h-4 rounded accent-primary" checked={!!form.requiresChallenge25} onChange={e => set('requiresChallenge25', e.target.checked)} />
                <span className="text-sm font-medium text-gray-700">Challenge 25 Required</span>
              </label>
            )}
            <label className="flex items-center gap-2 cursor-pointer">
              <input type="checkbox" className="w-4 h-4 rounded accent-primary" checked={!!form.isActive} onChange={e => set('isActive', e.target.checked)} />
              <span className="text-sm font-medium text-gray-700">Active (visible at POS)</span>
            </label>
          </div>
          <div className="flex gap-3 pt-4">
            <button type="button" onClick={onClose} className="flex-1 border border-gray-300 text-gray-700 px-4 py-2 rounded-lg text-sm font-medium hover:bg-gray-50">Cancel</button>
            <button type="submit" disabled={saving} className="flex-1 bg-primary text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-primary/90 disabled:opacity-50">
              {saving ? 'Saving…' : (isEdit ? 'Save Changes' : 'Add Product')}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// Product Insights Modal (#74)
function InsightsModal({ productId, onClose }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.get(`/products/${productId}/insights`)
      .then(r => setData(r.data))
      .catch(() => toast.error('Failed to load insights'))
      .finally(() => setLoading(false));
  }, [productId]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-lg max-h-[90vh] flex flex-col">
        <div className="flex items-center justify-between p-5 border-b">
          <div>
            <h2 className="font-bold text-gray-900">Product Insights</h2>
            {data && <p className="text-sm text-gray-500">{data.product.name}</p>}
          </div>
          <button onClick={onClose}><X size={20} /></button>
        </div>
        {loading ? (
          <div className="flex justify-center py-12"><div className="animate-spin rounded-full h-8 w-8 border-2 border-primary border-t-transparent" /></div>
        ) : data ? (
          <div className="flex-1 overflow-y-auto p-5 space-y-4">
            <div className="grid grid-cols-2 gap-3">
              {[
                ['Units Sold (7d)', data.insights.unitsSold7, '📦'],
                ['Units Sold (30d)', data.insights.unitsSold30, '📦'],
                ['Revenue (30d)', `£${Number(data.insights.revenue30).toFixed(2)}`, '💷'],
                ['Daily Velocity', `${data.insights.dailyVelocity}/day`, '📈'],
                ['Days of Stock', data.insights.daysOfStock !== null ? `${data.insights.daysOfStock}d` : '—', '🗓️'],
                ['Margin', data.insights.marginPct !== null ? `${data.insights.marginPct}%` : '—', '💰'],
              ].map(([label, value, icon]) => (
                <div key={label} className="bg-gray-50 rounded-lg p-3">
                  <p className="text-xs text-gray-500">{icon} {label}</p>
                  <p className="text-xl font-bold text-gray-900 mt-1">{value}</p>
                </div>
              ))}
            </div>
            <div className="bg-gray-50 rounded-lg p-3 space-y-2 text-sm">
              <p className="font-medium text-gray-700">Pricing</p>
              <div className="flex justify-between"><span className="text-gray-500">Cost Price</span><span className="font-mono">£{Number(data.insights.costPrice).toFixed(2)}</span></div>
              <div className="flex justify-between"><span className="text-gray-500">Retail Price</span><span className="font-mono font-bold">£{Number(data.insights.retailPrice).toFixed(2)}</span></div>
              <div className="flex justify-between"><span className="text-gray-500">Current Stock</span><span className={`font-bold ${data.insights.currentStock <= data.insights.lowStockThreshold ? 'text-red-600' : 'text-green-600'}`}>{data.insights.currentStock} units</span></div>
            </div>
            {data.stockHistory.length > 0 && (
              <div>
                <p className="font-medium text-gray-700 mb-2 text-sm">Recent Stock Movements</p>
                <div className="space-y-1">
                  {data.stockHistory.slice(0, 8).map((m, i) => (
                    <div key={i} className="flex justify-between text-xs bg-gray-50 rounded px-3 py-2">
                      <span className="text-gray-600 capitalize">{m.type?.replace(/_/g, ' ')}</span>
                      <span className={m.quantity >= 0 ? 'text-green-600 font-medium' : 'text-red-600 font-medium'}>{m.quantity >= 0 ? '+' : ''}{m.quantity}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        ) : null}
      </div>
    </div>
  );
}

export default function ProductsPage() {
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState('');
  const [lowStock, setLowStock] = useState(false);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [editProduct, setEditProduct] = useState(null);
  const [showModal, setShowModal] = useState(false);
  const [insightsProductId, setInsightsProductId] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await productsSvc.getProducts({ search, category: category || undefined, lowStock: lowStock || undefined, page, limit: 25 });
      setProducts(res.products || res.data || []);
      setTotalPages(res.pagination?.totalPages || 1);
    } catch {
    } finally {
      setLoading(false);
    }
  }, [search, category, lowStock, page]);

  useEffect(() => { load(); }, [load]);

  function openAdd() { setEditProduct(null); setShowModal(true); }
  function openEdit(p) { setEditProduct(p); setShowModal(true); }
  function closeModal() { setShowModal(false); setEditProduct(null); }
  function onSaved() { closeModal(); load(); }

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Products</h1>
          <p className="text-sm text-gray-500 mt-1">Manage your product catalogue</p>
        </div>
        <button onClick={openAdd} className="flex items-center gap-2 bg-primary text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-primary/90">
          <Plus size={18} /> Add Product
        </button>
      </div>

      <div className="flex gap-3 mb-6 flex-wrap">
        <div className="relative flex-1 min-w-[200px]">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            className="w-full pl-9 pr-4 py-2 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary"
            placeholder="Search by name or barcode…"
            value={search}
            onChange={e => { setSearch(e.target.value); setPage(1); }}
          />
        </div>
        <select
          className="border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
          value={category}
          onChange={e => { setCategory(e.target.value); setPage(1); }}
        >
          <option value="">All Categories</option>
          {CATEGORIES.map(c => <option key={c}>{c}</option>)}
        </select>
        <label className="flex items-center gap-2 border rounded-lg px-3 py-2 text-sm cursor-pointer hover:bg-gray-50">
          <input type="checkbox" checked={lowStock} onChange={e => { setLowStock(e.target.checked); setPage(1); }} className="accent-yellow-500" />
          <AlertTriangle size={14} className="text-yellow-500" /> Low Stock Only
        </label>
      </div>

      <div className="bg-white rounded-xl border overflow-hidden">
        {loading ? (
          <div className="flex justify-center py-12"><div className="animate-spin rounded-full h-8 w-8 border-2 border-primary border-t-transparent" /></div>
        ) : products.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-gray-400">
            <Package size={48} className="mb-3 opacity-30" />
            <p className="font-medium">No products found</p>
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b">
              <tr>
                <th className="text-left px-4 py-3 font-semibold text-gray-600">Product</th>
                <th className="text-left px-4 py-3 font-semibold text-gray-600">Barcode</th>
                <th className="text-left px-4 py-3 font-semibold text-gray-600">Category</th>
                <th className="text-right px-4 py-3 font-semibold text-gray-600">Price</th>
                <th className="text-right px-4 py-3 font-semibold text-gray-600">Stock</th>
                <th className="text-center px-4 py-3 font-semibold text-gray-600">Status</th>
                <th className="px-4 py-3"></th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {products.map(p => (
                <tr key={p._id} className="hover:bg-gray-50">
                  <td className="px-4 py-3">
                    <div className="font-medium text-gray-900">{p.name}</div>
                    {p.brand && <div className="text-xs text-gray-400">{p.brand}</div>}
                  </td>
                  <td className="px-4 py-3 text-gray-500 font-mono text-xs">{p.barcode || '—'}</td>
                  <td className="px-4 py-3 text-gray-500">{p.category}</td>
                  <td className="px-4 py-3 text-right font-medium">£{Number(p.retailPrice).toFixed(2)}</td>
                  <td className="px-4 py-3 text-right">
                    <span className={`font-medium ${p.stockQuantity <= p.lowStockThreshold ? 'text-yellow-600' : 'text-gray-900'}`}>
                      {p.stockQuantity}
                    </span>
                    {p.stockQuantity <= p.lowStockThreshold && <AlertTriangle size={12} className="inline ml-1 text-yellow-500" />}
                  </td>
                  <td className="px-4 py-3 text-center">
                    <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${p.isActive ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
                      {p.isActive ? 'Active' : 'Inactive'}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex gap-1">
                      <button onClick={() => setInsightsProductId(p._id)} className="p-1.5 hover:bg-blue-50 rounded text-blue-400 hover:text-blue-600" title="Product Insights">
                        <BarChart2 size={15} />
                      </button>
                      <button onClick={() => openEdit(p)} className="p-1.5 hover:bg-gray-100 rounded text-gray-400 hover:text-gray-700">
                        <Edit2 size={15} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-2 mt-4">
          <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1} className="p-2 rounded-lg border hover:bg-gray-50 disabled:opacity-40">
            <ChevronLeft size={16} />
          </button>
          <span className="text-sm text-gray-600">Page {page} of {totalPages}</span>
          <button onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page === totalPages} className="p-2 rounded-lg border hover:bg-gray-50 disabled:opacity-40">
            <ChevronRight size={16} />
          </button>
        </div>
      )}

      {showModal && <ProductModal product={editProduct} onClose={closeModal} onSaved={onSaved} />}
      {insightsProductId && <InsightsModal productId={insightsProductId} onClose={() => setInsightsProductId(null)} />}
    </div>
  );
}
