import React, { useState, useEffect } from 'react';
import { Gift } from 'lucide-react';
import * as giftSvc from '../services/giftCards';
import dayjs from 'dayjs';

export default function GiftCardsPage() {
  const [cards, setCards] = useState([]); const [loading, setLoading] = useState(true);
  useEffect(() => { giftSvc.getGiftCards().then(r => setCards(r.giftCards||r.data||r||[])).catch(()=>{}).finally(()=>setLoading(false)); }, []);
  return (
    <div className="p-6">
      <div className="mb-6"><h1 className="text-2xl font-bold text-gray-900">Gift Cards</h1><p className="text-sm text-gray-500 mt-1">Manage issued gift cards</p></div>
      <div className="bg-white rounded-xl border overflow-hidden">
        {loading ? <div className="flex justify-center py-12"><div className="animate-spin rounded-full h-8 w-8 border-2 border-primary border-t-transparent"/></div>
        : cards.length === 0 ? <div className="flex flex-col items-center justify-center py-16 text-gray-400"><Gift size={48} className="mb-3 opacity-30"/><p>No gift cards issued</p></div>
        : <table className="w-full text-sm"><thead className="bg-gray-50 border-b"><tr><th className="text-left px-4 py-3 font-semibold text-gray-600">Code</th><th className="text-right px-4 py-3 font-semibold text-gray-600">Initial Value</th><th className="text-right px-4 py-3 font-semibold text-gray-600">Balance</th><th className="text-center px-4 py-3 font-semibold text-gray-600">Status</th><th className="text-left px-4 py-3 font-semibold text-gray-600">Issued</th><th className="text-left px-4 py-3 font-semibold text-gray-600">Expires</th></tr></thead>
          <tbody className="divide-y">{cards.map(c => (<tr key={c._id} className="hover:bg-gray-50"><td className="px-4 py-3 font-mono font-medium text-gray-800">{c.code}</td><td className="px-4 py-3 text-right">£{Number(c.initialValue||0).toFixed(2)}</td><td className="px-4 py-3 text-right font-bold text-green-600">£{Number(c.balance||0).toFixed(2)}</td><td className="px-4 py-3 text-center"><span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${c.isActive&&c.balance>0?'bg-green-100 text-green-700':'bg-gray-100 text-gray-500'}`}>{!c.isActive?'Disabled':c.balance<=0?'Spent':'Active'}</span></td><td className="px-4 py-3 text-gray-500 text-xs">{dayjs(c.createdAt).format('DD/MM/YYYY')}</td><td className="px-4 py-3 text-gray-500 text-xs">{c.expiresAt?dayjs(c.expiresAt).format('DD/MM/YYYY'):'No expiry'}</td></tr>))}</tbody></table>}
      </div>
    </div>
  );
}
