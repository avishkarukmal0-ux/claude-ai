import React, { useState, useEffect } from 'react';
import { RefreshCw, ShoppingCart, AlertTriangle, TrendingDown } from 'lucide-react';
import api from '../services/api';
import toast from 'react-hot-toast';

export default function SmartReorderPage() {
  const [suggestions, setSuggestions] = useState([]);
  const [loading, setLoading] = useState(true);

  async function load() {
    setLoading(true);
    try {
      const res = await api.get('/smart-reorder/suggestions');
      setSuggestions(res.suggestions || res.data || []);
    } catch {
    } finally { setLoading(false); }
  }

  useEffect(() => { load(); }, []);

  async function createPO(supplierId, items) {
    try {
      await api.post('/purchase-orders', { supplierId, items });
      toast.success('Purchase order created');
    } catch {}
  }

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Smart Reorder</h1>
          <p className="text-sm text-gray-500 mt-1">Velocity-based stock replenishment suggestions</p>
        </div>
        <button onClick={load} className="flex items-center gap-2 border px-4 py-2 rounded-lg text-sm hover:bg-gray-50">
          <RefreshCw size={16} className={loading ? 'animate-spin' : ''} /> Refresh
        </button>
      </div>

      {loading ? (
        <div className="flex justify-center py-12"><div className="animate-spin rounded-full h-8 w-8 border-2 border-primary border-t-transparent" /></div>
      ) : suggestions.length === 0 ? (
        <div className="bg-white rounded-xl border flex flex-col items-center justify-center py-16 text-gray-400">
          <ShoppingCart size={48} className="mb-3 opacity-30" />
          <p className="font-medium">No reorder suggestions</p>
          <p className="text-sm mt-1">All products have sufficient stock</p>
        </div>
      ) : (
        <div className="bg-white rounded-xl border overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b">
              <tr>
                <th className="text-left px-4 py-3 font-semibold text-gray-600">Product</th>
                <th className="text-right px-4 py-3 font-semibold text-gray-600">Current Stock</th>
                <th className="text-right px-4 py-3 font-semibold text-gray-600">Daily Velocity</th>
                <th className="text-right px-4 py-3 font-semibold text-gray-600">Days Left</th>
                <th className="text-right px-4 py-3 font-semibold text-gray-600">Suggest Qty</th>
                <th className="text-left px-4 py-3 font-semibold text-gray-600">Supplier</th>
                <th className="px-4 py-3"></th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {suggestions.map(s => (
                <tr key={s.productId} className="hover:bg-gray-50">
                  <td className="px-4 py-3">
                    <p className="font-medium text-gray-900">{s.productName}</p>
                    <p className="text-xs text-gray-400">{s.barcode}</p>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <span className={s.currentStock <= 5 ? 'text-red-600 font-bold' : 'text-gray-700'}>{s.currentStock}</span>
                  </td>
                  <td className="px-4 py-3 text-right text-gray-500">{Number(s.dailyVelocity).toFixed(1)}/day</td>
                  <td className="px-4 py-3 text-right">
                    <span className={`font-medium ${s.daysUntilStockout <= 3 ? 'text-red-600' : s.daysUntilStockout <= 7 ? 'text-orange-500' : 'text-gray-700'}`}>
                      {s.daysUntilStockout <= 0 ? <span className="flex items-center justify-end gap-1"><AlertTriangle size={12} />OOS</span> : `${s.daysUntilStockout}d`}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right font-bold text-primary">{s.suggestedOrderQty}</td>
                  <td className="px-4 py-3 text-gray-500">{s.supplierName || '—'}</td>
                  <td className="px-4 py-3">
                    <button
                      onClick={() => createPO(s.supplierId, [{ product: s.productId, quantity: s.suggestedOrderQty, unitCost: s.costPrice }])}
                      className="text-xs bg-primary text-white px-2.5 py-1 rounded hover:bg-primary/90"
                    >
                      Order
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
