import React, { useState, useEffect } from 'react';
import { FileText, ChevronRight } from 'lucide-react';
import * as poSvc from '../services/purchaseOrders';
import dayjs from 'dayjs';

const STATUS_COLORS = { draft:'bg-gray-100 text-gray-600', sent:'bg-blue-100 text-blue-700', received:'bg-green-100 text-green-700', partial:'bg-yellow-100 text-yellow-700', cancelled:'bg-red-100 text-red-600' };

export default function PurchaseOrdersPage() {
  const [orders, setOrders] = useState([]); const [loading, setLoading] = useState(true);
  useEffect(() => { poSvc.getPurchaseOrders().then(r => setOrders(r.orders || (Array.isArray(r) ? r : []))).catch(()=>{}).finally(()=>setLoading(false)); }, []);
  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-6"><div><h1 className="text-2xl font-bold text-gray-900">Purchase Orders</h1><p className="text-sm text-gray-500 mt-1">Stock replenishment orders</p></div></div>
      <div className="bg-white rounded-xl border overflow-hidden">
        {loading ? <div className="flex justify-center py-12"><div className="animate-spin rounded-full h-8 w-8 border-2 border-primary border-t-transparent"/></div>
        : orders.length === 0 ? <div className="flex flex-col items-center justify-center py-16 text-gray-400"><FileText size={48} className="mb-3 opacity-30"/><p>No purchase orders yet</p><p className="text-sm mt-1">Use Smart Reorder to generate orders</p></div>
        : <table className="w-full text-sm"><thead className="bg-gray-50 border-b"><tr><th className="text-left px-4 py-3 font-semibold text-gray-600">PO Number</th><th className="text-left px-4 py-3 font-semibold text-gray-600">Supplier</th><th className="text-center px-4 py-3 font-semibold text-gray-600">Items</th><th className="text-right px-4 py-3 font-semibold text-gray-600">Total</th><th className="text-center px-4 py-3 font-semibold text-gray-600">Status</th><th className="text-left px-4 py-3 font-semibold text-gray-600">Date</th></tr></thead>
          <tbody className="divide-y">{orders.map(o => (<tr key={o._id} className="hover:bg-gray-50"><td className="px-4 py-3 font-mono text-xs text-gray-600">{o.poNumber}</td><td className="px-4 py-3 font-medium">{o.supplier?.name || '—'}</td><td className="px-4 py-3 text-center text-gray-500">{o.items?.length || 0}</td><td className="px-4 py-3 text-right font-medium">£{Number(o.totalValue||0).toFixed(2)}</td><td className="px-4 py-3 text-center"><span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium capitalize ${STATUS_COLORS[o.status]||''}`}>{o.status}</span></td><td className="px-4 py-3 text-gray-500 text-xs">{dayjs(o.createdAt).format('DD/MM/YYYY')}</td></tr>))}</tbody></table>}
      </div>
    </div>
  );
}
