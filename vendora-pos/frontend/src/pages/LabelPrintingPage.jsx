import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Printer, Search, Plus, Minus, RefreshCw, Tag } from 'lucide-react';
import api from '../services/api';
import toast from 'react-hot-toast';

const LABEL_TEMPLATES = [
  { id: 'shelf',   label: 'Shelf Edge',   size: '60×25mm',  desc: 'Name, price, barcode' },
  { id: 'product', label: 'Product Label', size: '80×50mm',  desc: 'Full label with VAT info' },
  { id: 'promo',   label: 'Promo Sticker', size: '50×50mm',  desc: 'Was/Now pricing, red background' },
  { id: 'alcohol', label: 'Age Restriction', size: '40×20mm', desc: '18+ Challenge 25 badge' },
];

function PrintPreview({ items, template }) {
  return (
    <div className="bg-white border border-dashed border-gray-300 rounded-xl p-4 min-h-32">
      <p className="text-xs text-gray-400 uppercase tracking-wide mb-3 font-semibold">Print Preview — {template.label} ({template.size})</p>
      <div className="flex flex-wrap gap-2">
        {items.filter(i => i.qty > 0).map(item => (
          Array.from({ length: Math.min(item.qty, 3) }).map((_, idx) => (
            <div key={`${item._id}-${idx}`}
              className={`border rounded p-2 text-center text-xs ${template.id === 'promo' ? 'bg-red-50 border-red-300' : 'bg-gray-50 border-gray-200'}`}
              style={{ width: template.id === 'shelf' ? 120 : 160 }}>
              <p className="font-semibold truncate" style={{ fontSize: 10 }}>{item.name}</p>
              {item.barcode && <p className="text-gray-400 mt-0.5" style={{ fontSize: 8 }}>{item.barcode}</p>}
              <p className={`font-black mt-1 ${template.id === 'promo' ? 'text-red-600' : 'text-gray-900'}`}>
                £{((item.sellingPrice || item.price || 0)).toFixed(2)}
              </p>
              {template.id === 'alcohol' && (
                <p className="text-red-700 font-black mt-0.5" style={{ fontSize: 9 }}>18+ CHALLENGE 25</p>
              )}
              {item.qty > 3 && idx === 2 && (
                <p className="text-gray-400 mt-0.5" style={{ fontSize: 8 }}>+{item.qty - 3} more…</p>
              )}
            </div>
          ))
        ))}
        {items.filter(i => i.qty > 0).length === 0 && (
          <p className="text-gray-400 text-sm py-4">Add products below to preview labels</p>
        )}
      </div>
    </div>
  );
}

export default function LabelPrintingPage() {
  const [products, setProducts] = useState([]);
  const [search, setSearch] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [searching, setSearching] = useState(false);
  const [printQueue, setPrintQueue] = useState([]);
  const [template, setTemplate] = useState(LABEL_TEMPLATES[0]);
  const [printing, setPrinting] = useState(false);
  const searchRef = useRef(null);
  let debounceTimer = useRef(null);

  const searchProducts = useCallback(async (q) => {
    if (!q.trim()) { setSearchResults([]); return; }
    setSearching(true);
    try {
      const data = await api.get(`/products?search=${encodeURIComponent(q)}&limit=10`);
      setSearchResults(Array.isArray(data) ? data : data?.products || []);
    } catch { } finally { setSearching(false); }
  }, []);

  const handleSearchChange = (e) => {
    const q = e.target.value;
    setSearch(q);
    clearTimeout(debounceTimer.current);
    debounceTimer.current = setTimeout(() => searchProducts(q), 300);
  };

  const addToQueue = (product) => {
    setPrintQueue(prev => {
      const exists = prev.find(p => p._id === product._id);
      if (exists) return prev.map(p => p._id === product._id ? { ...p, qty: p.qty + 1 } : p);
      return [...prev, { ...product, qty: 1 }];
    });
    setSearch('');
    setSearchResults([]);
  };

  const updateQty = (id, delta) => {
    setPrintQueue(prev => prev
      .map(p => p._id === id ? { ...p, qty: Math.max(0, p.qty + delta) } : p)
      .filter(p => p.qty > 0)
    );
  };

  const handlePrint = async () => {
    const toPrint = printQueue.filter(p => p.qty > 0);
    if (toPrint.length === 0) { toast.error('Add products to the queue first'); return; }
    setPrinting(true);
    try {
      const resp = await api.post('/hardware/print-labels', {
        template: template.id,
        items: toPrint.map(p => ({ productId: p._id, qty: p.qty })),
      });
      const total = toPrint.reduce((s, p) => s + p.qty, 0);
      if (resp.data?.results?.length > 0) {
        // If ESC/POS data returned, fall through to browser print as well
        toast.success(`${total} label(s) prepared — printing via browser`);
        window.print();
      } else {
        toast.success(`${total} label(s) sent to printer`);
      }
    } catch {
      // Fallback: browser print
      toast('Printing via browser (no ESC/POS printer connected)', { icon: '🖨' });
      window.print();
    } finally { setPrinting(false); }
  };

  const totalLabels = printQueue.reduce((s, p) => s + p.qty, 0);

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-black text-gray-900">Label Printing</h1>
          <p className="text-sm text-gray-500 mt-0.5">Shelf edge, product, promo &amp; age-restriction labels</p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left: template + search */}
        <div className="lg:col-span-1 space-y-4">
          {/* Template picker */}
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4">
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">Label Template</p>
            <div className="space-y-2">
              {LABEL_TEMPLATES.map(t => (
                <button key={t.id} onClick={() => setTemplate(t)}
                  className={`w-full text-left px-3 py-2.5 rounded-xl border transition ${template.id === t.id
                    ? 'border-blue-500 bg-blue-50'
                    : 'border-gray-200 hover:bg-gray-50'}`}>
                  <div className="flex items-center justify-between">
                    <p className="text-sm font-semibold text-gray-900">{t.label}</p>
                    <span className="text-xs text-gray-400">{t.size}</span>
                  </div>
                  <p className="text-xs text-gray-500 mt-0.5">{t.desc}</p>
                </button>
              ))}
            </div>
          </div>

          {/* Product search */}
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4">
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">Add Products</p>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <input ref={searchRef} value={search} onChange={handleSearchChange}
                placeholder="Search by name or barcode…"
                className="w-full pl-9 pr-4 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
            </div>
            {searching && <p className="text-xs text-gray-400 mt-2">Searching…</p>}
            {searchResults.length > 0 && (
              <div className="mt-2 space-y-1 max-h-48 overflow-y-auto">
                {searchResults.map(p => (
                  <button key={p._id} onClick={() => addToQueue(p)}
                    className="w-full text-left flex items-center justify-between px-3 py-2 hover:bg-blue-50 rounded-lg transition">
                    <div>
                      <p className="text-sm font-medium text-gray-900 truncate">{p.name}</p>
                      <p className="text-xs text-gray-400">{p.barcode}</p>
                    </div>
                    <p className="text-sm font-bold text-gray-900 ml-2">£{((p.sellingPrice || p.price || 0)).toFixed(2)}</p>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Right: queue + preview */}
        <div className="lg:col-span-2 space-y-4">
          <PrintPreview items={printQueue} template={template} />

          {/* Queue */}
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm">
            <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
              <p className="text-sm font-semibold text-gray-900">Print Queue ({totalLabels} labels)</p>
              {printQueue.length > 0 && (
                <button onClick={() => setPrintQueue([])} className="text-xs text-red-500 hover:text-red-700">Clear all</button>
              )}
            </div>
            {printQueue.length === 0 ? (
              <div className="text-center py-10 text-gray-400">
                <Tag className="w-8 h-8 mx-auto mb-2 opacity-30" />
                <p className="text-sm">Queue is empty — search and add products above</p>
              </div>
            ) : (
              <div className="divide-y divide-gray-50">
                {printQueue.map(item => (
                  <div key={item._id} className="flex items-center gap-3 px-4 py-3">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-gray-900 truncate">{item.name}</p>
                      <p className="text-xs text-gray-400">{item.barcode} · £{((item.sellingPrice || item.price || 0)).toFixed(2)}</p>
                    </div>
                    <div className="flex items-center gap-2">
                      <button onClick={() => updateQty(item._id, -1)}
                        className="w-7 h-7 flex items-center justify-center bg-gray-100 hover:bg-gray-200 rounded-lg transition">
                        <Minus className="w-3 h-3" />
                      </button>
                      <span className="w-8 text-center text-sm font-bold">{item.qty}</span>
                      <button onClick={() => updateQty(item._id, 1)}
                        className="w-7 h-7 flex items-center justify-center bg-gray-100 hover:bg-gray-200 rounded-lg transition">
                        <Plus className="w-3 h-3" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <button onClick={handlePrint} disabled={printing || totalLabels === 0}
            className="w-full flex items-center justify-center gap-2 bg-blue-600 hover:bg-blue-700 text-white font-bold py-3.5 rounded-2xl transition disabled:opacity-50 disabled:cursor-not-allowed shadow-lg shadow-blue-200">
            <Printer className="w-5 h-5" />
            {printing ? 'Sending to Printer…' : `Print ${totalLabels > 0 ? totalLabels + ' ' : ''}Labels`}
          </button>
        </div>
      </div>
    </div>
  );
}
