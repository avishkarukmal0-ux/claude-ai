import React, { useState, useEffect } from 'react';
import { Tag, Plus, ToggleLeft, ToggleRight } from 'lucide-react';
import * as promoSvc from '../services/promotions';
import toast from 'react-hot-toast';
import dayjs from 'dayjs';

const TYPE_LABELS = { multi_buy:'Multi-Buy', bogof:'BOGOF', percentage:'% Off', fixed:'Fixed Off', spend_threshold:'Spend & Save', bundle:'Bundle' };

export default function PromotionsPage() {
  const [promos, setPromos] = useState([]); const [loading, setLoading] = useState(true);
  async function load() { setLoading(true); try { const r = await promoSvc.getPromotions(); setPromos(r.promotions||r.data||r||[]); } catch {} finally { setLoading(false); } }
  useEffect(() => { load(); }, []);
  async function toggle(id, isActive) { try { await promoSvc.updatePromotion(id, { isActive: !isActive }); toast.success(isActive ? 'Promotion disabled' : 'Promotion enabled'); load(); } catch {} }
  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-6"><div><h1 className="text-2xl font-bold text-gray-900">Promotions</h1><p className="text-sm text-gray-500 mt-1">Active deals and discounts</p></div></div>
      <div className="bg-white rounded-xl border overflow-hidden">
        {loading ? <div className="flex justify-center py-12"><div className="animate-spin rounded-full h-8 w-8 border-2 border-primary border-t-transparent"/></div>
        : promos.length === 0 ? <div className="flex flex-col items-center justify-center py-16 text-gray-400"><Tag size={48} className="mb-3 opacity-30"/><p>No promotions configured</p></div>
        : <table className="w-full text-sm"><thead className="bg-gray-50 border-b"><tr><th className="text-left px-4 py-3 font-semibold text-gray-600">Promotion</th><th className="text-center px-4 py-3 font-semibold text-gray-600">Type</th><th className="text-right px-4 py-3 font-semibold text-gray-600">Used</th><th className="text-left px-4 py-3 font-semibold text-gray-600">Valid Until</th><th className="text-center px-4 py-3 font-semibold text-gray-600">Active</th></tr></thead>
          <tbody className="divide-y">{promos.map(p => (<tr key={p._id} className="hover:bg-gray-50"><td className="px-4 py-3"><p className="font-medium text-gray-900">{p.name}</p><p className="text-xs text-gray-400">{p.description}</p></td><td className="px-4 py-3 text-center"><span className="inline-flex px-2 py-0.5 rounded-full text-xs font-medium bg-blue-50 text-blue-700">{TYPE_LABELS[p.type]||p.type}</span></td><td className="px-4 py-3 text-right text-gray-500">{p.usageCount||0}</td><td className="px-4 py-3 text-gray-500 text-xs">{p.endDate ? dayjs(p.endDate).format('DD/MM/YYYY') : 'No end'}</td><td className="px-4 py-3 text-center"><button onClick={()=>toggle(p._id, p.isActive)} className={p.isActive?'text-green-600':'text-gray-400'}>{p.isActive?<ToggleRight size={22}/>:<ToggleLeft size={22}/>}</button></td></tr>))}</tbody></table>}
      </div>
    </div>
  );
}
