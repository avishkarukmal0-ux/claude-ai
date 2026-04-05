import React, { useState, useEffect } from 'react';
import { ClipboardList, Plus } from 'lucide-react';
import api from '../services/api';
import toast from 'react-hot-toast';
import dayjs from 'dayjs';

const STATUS_COLORS = { draft:'bg-gray-100 text-gray-600', in_progress:'bg-blue-100 text-blue-700', completed:'bg-green-100 text-green-700', cancelled:'bg-red-100 text-red-600' };

export default function StockTakePage() {
  const [stockTakes, setStockTakes] = useState([]); const [loading, setLoading] = useState(true);
  async function load() { setLoading(true); try { const r = await api.get('/stock-take'); setStockTakes(r.stockTakes||r.data||r||[]); } catch {} finally { setLoading(false); } }
  useEffect(() => { load(); }, []);
  async function createNew() { try { await api.post('/stock-take/create', {}); toast.success('Stock take created'); load(); } catch {} }
  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-6"><div><h1 className="text-2xl font-bold text-gray-900">Stock Take</h1><p className="text-sm text-gray-500 mt-1">Periodic inventory counts</p></div><button onClick={createNew} className="flex items-center gap-2 bg-primary text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-primary/90"><Plus size={18}/>New Stock Take</button></div>
      <div className="bg-white rounded-xl border overflow-hidden">
        {loading ? <div className="flex justify-center py-12"><div className="animate-spin rounded-full h-8 w-8 border-2 border-primary border-t-transparent"/></div>
        : stockTakes.length === 0 ? <div className="flex flex-col items-center justify-center py-16 text-gray-400"><ClipboardList size={48} className="mb-3 opacity-30"/><p>No stock takes yet</p></div>
        : <table className="w-full text-sm"><thead className="bg-gray-50 border-b"><tr><th className="text-left px-4 py-3 font-semibold text-gray-600">Reference</th><th className="text-center px-4 py-3 font-semibold text-gray-600">Status</th><th className="text-right px-4 py-3 font-semibold text-gray-600">Items</th><th className="text-right px-4 py-3 font-semibold text-gray-600">Variance (£)</th><th className="text-left px-4 py-3 font-semibold text-gray-600">Date</th></tr></thead>
          <tbody className="divide-y">{stockTakes.map(s => (<tr key={s._id} className="hover:bg-gray-50"><td className="px-4 py-3 font-medium text-gray-900">{s.reference || `ST-${s._id?.slice(-6)}`}</td><td className="px-4 py-3 text-center"><span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium capitalize ${STATUS_COLORS[s.status]||''}`}>{s.status}</span></td><td className="px-4 py-3 text-right text-gray-500">{s.itemCount||0}</td><td className={`px-4 py-3 text-right font-medium ${s.totalVarianceValue<0?'text-red-600':s.totalVarianceValue>0?'text-green-600':'text-gray-500'}`}>{s.totalVarianceValue != null ? `£${Number(s.totalVarianceValue).toFixed(2)}` : '—'}</td><td className="px-4 py-3 text-gray-500 text-xs">{dayjs(s.createdAt).format('DD/MM/YYYY HH:mm')}</td></tr>))}</tbody></table>}
      </div>
    </div>
  );
}
