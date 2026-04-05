import React, { useState, useEffect, useCallback } from 'react';
import { Search, Receipt, ChevronLeft, ChevronRight, X, Eye, Ban } from 'lucide-react';
import * as salesSvc from '../services/sales';
import { useAuth } from '../context/AuthContext';
import toast from 'react-hot-toast';
import dayjs from 'dayjs';

function SaleDetailModal({ sale, onClose, onVoided }) {
  const { hasRole } = useAuth();
  const [supervisorPin, setSupervisorPin] = useState('');
  const [voidReason, setVoidReason] = useState('');
  const [showVoidForm, setShowVoidForm] = useState(false);
  const [voiding, setVoiding] = useState(false);

  async function handleVoid() {
    if (!voidReason.trim()) { toast.error('Enter a void reason'); return; }
    setVoiding(true);
    try {
      await salesSvc.voidSale(sale._id, { supervisorPin: supervisorPin || undefined, reason: voidReason });
      toast.success('Sale voided');
      onVoided();
    } catch {
    } finally {
      setVoiding(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between p-6 border-b">
          <div>
            <h2 className="text-lg font-bold">Receipt {sale.receiptNumber}</h2>
            <p className="text-sm text-gray-500">{dayjs(sale.createdAt).format('DD/MM/YYYY HH:mm')}</p>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-gray-100 rounded-lg"><X size={20} /></button>
        </div>
        <div className="p-6 space-y-4">
          {sale.isVoided && (
            <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-sm text-red-700 font-medium">
              VOIDED — {sale.voidReason}
            </div>
          )}
          {sale.isTraining && (
            <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-3 text-sm text-yellow-700 font-medium">
              TRAINING MODE TRANSACTION
            </div>
          )}
          <div>
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">Items</p>
            <div className="space-y-1">
              {sale.items?.map((item, i) => (
                <div key={i} className="flex justify-between text-sm">
                  <span className="text-gray-700">{item.name} × {item.quantity}</span>
                  <span className="font-medium">£{Number(item.lineTotal).toFixed(2)}</span>
                </div>
              ))}
            </div>
          </div>
          <div className="border-t pt-3 space-y-1 text-sm">
            <div className="flex justify-between"><span className="text-gray-500">Subtotal</span><span>£{Number(sale.subtotal).toFixed(2)}</span></div>
            {sale.totalDiscount > 0 && <div className="flex justify-between text-green-600"><span>Discount</span><span>-£{Number(sale.totalDiscount).toFixed(2)}</span></div>}
            <div className="flex justify-between font-bold text-base"><span>Total</span><span>£{Number(sale.total).toFixed(2)}</span></div>
          </div>
          <div>
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">Payment</p>
            {sale.payments?.map((pay, i) => (
              <div key={i} className="flex justify-between text-sm">
                <span className="capitalize text-gray-600">{pay.method}</span>
                <span>£{Number(pay.amount).toFixed(2)}</span>
              </div>
            ))}
          </div>
          {sale.customer && (
            <div className="text-sm text-gray-500">
              Customer: <span className="font-medium text-gray-800">{sale.customer.firstName} {sale.customer.lastName}</span>
              {sale.loyaltyPointsEarned > 0 && <span className="ml-2 text-green-600">+{sale.loyaltyPointsEarned} pts</span>}
            </div>
          )}

          {!sale.isVoided && hasRole('supervisor') && (
            <div className="border-t pt-4">
              {!showVoidForm ? (
                <button onClick={() => setShowVoidForm(true)} className="flex items-center gap-2 text-red-600 text-sm font-medium hover:text-red-700">
                  <Ban size={16} /> Void This Sale
                </button>
              ) : (
                <div className="space-y-3">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Void Reason *</label>
                    <input className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-red-300" value={voidReason} onChange={e => setVoidReason(e.target.value)} placeholder="e.g. Customer error, refund requested" />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Supervisor PIN</label>
                    <input type="password" className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-red-300" value={supervisorPin} onChange={e => setSupervisorPin(e.target.value)} placeholder="Enter PIN" />
                  </div>
                  <div className="flex gap-2">
                    <button onClick={() => setShowVoidForm(false)} className="flex-1 border border-gray-300 text-gray-700 px-3 py-2 rounded-lg text-sm hover:bg-gray-50">Cancel</button>
                    <button onClick={handleVoid} disabled={voiding} className="flex-1 bg-red-600 text-white px-3 py-2 rounded-lg text-sm font-medium hover:bg-red-700 disabled:opacity-50">
                      {voiding ? 'Voiding…' : 'Confirm Void'}
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default function TransactionHistoryPage() {
  const [sales, setSales] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [dateFrom, setDateFrom] = useState(dayjs().subtract(7, 'day').format('YYYY-MM-DD'));
  const [dateTo, setDateTo] = useState(dayjs().format('YYYY-MM-DD'));
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);
  const [selectedSale, setSelectedSale] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await salesSvc.getSales({ search: search || undefined, dateFrom, dateTo, page, limit: 25 });
      setSales(res.sales || res.data || []);
      setTotalPages(res.pagination?.totalPages || 1);
      setTotal(res.pagination?.total || 0);
    } catch {
    } finally {
      setLoading(false);
    }
  }, [search, dateFrom, dateTo, page]);

  useEffect(() => { load(); }, [load]);

  return (
    <div className="p-6">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Transaction History</h1>
        <p className="text-sm text-gray-500 mt-1">{total} transactions</p>
      </div>

      <div className="flex gap-3 mb-6 flex-wrap">
        <div className="relative flex-1 min-w-[180px]">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            className="w-full pl-9 pr-4 py-2 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary"
            placeholder="Search receipt number…"
            value={search}
            onChange={e => { setSearch(e.target.value); setPage(1); }}
          />
        </div>
        <input type="date" className="border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary" value={dateFrom} onChange={e => { setDateFrom(e.target.value); setPage(1); }} />
        <input type="date" className="border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary" value={dateTo} onChange={e => { setDateTo(e.target.value); setPage(1); }} />
      </div>

      <div className="bg-white rounded-xl border overflow-hidden">
        {loading ? (
          <div className="flex justify-center py-12"><div className="animate-spin rounded-full h-8 w-8 border-2 border-primary border-t-transparent" /></div>
        ) : sales.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-gray-400">
            <Receipt size={48} className="mb-3 opacity-30" />
            <p className="font-medium">No transactions found</p>
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b">
              <tr>
                <th className="text-left px-4 py-3 font-semibold text-gray-600">Receipt</th>
                <th className="text-left px-4 py-3 font-semibold text-gray-600">Date/Time</th>
                <th className="text-left px-4 py-3 font-semibold text-gray-600">Cashier</th>
                <th className="text-center px-4 py-3 font-semibold text-gray-600">Items</th>
                <th className="text-right px-4 py-3 font-semibold text-gray-600">Total</th>
                <th className="text-left px-4 py-3 font-semibold text-gray-600">Payment</th>
                <th className="text-center px-4 py-3 font-semibold text-gray-600">Status</th>
                <th className="px-4 py-3"></th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {sales.map(s => (
                <tr key={s._id} className={`hover:bg-gray-50 ${s.isVoided ? 'opacity-60' : ''}`}>
                  <td className="px-4 py-3 font-mono text-xs text-gray-600">{s.receiptNumber}</td>
                  <td className="px-4 py-3 text-gray-500">{dayjs(s.createdAt).format('DD/MM HH:mm')}</td>
                  <td className="px-4 py-3 text-gray-700">{s.cashier?.firstName} {s.cashier?.lastName}</td>
                  <td className="px-4 py-3 text-center text-gray-500">{s.items?.length || 0}</td>
                  <td className="px-4 py-3 text-right font-medium">£{Number(s.total).toFixed(2)}</td>
                  <td className="px-4 py-3">
                    {s.payments?.map((p, i) => (
                      <span key={i} className="capitalize text-gray-500 text-xs">{p.method}</span>
                    ))}
                  </td>
                  <td className="px-4 py-3 text-center">
                    {s.isVoided ? (
                      <span className="inline-flex px-2 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-600">Voided</span>
                    ) : s.isTraining ? (
                      <span className="inline-flex px-2 py-0.5 rounded-full text-xs font-medium bg-yellow-100 text-yellow-700">Training</span>
                    ) : (
                      <span className="inline-flex px-2 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-700">Complete</span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <button onClick={() => setSelectedSale(s)} className="p-1.5 hover:bg-gray-100 rounded text-gray-400 hover:text-gray-700">
                      <Eye size={15} />
                    </button>
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

      {selectedSale && (
        <SaleDetailModal
          sale={selectedSale}
          onClose={() => setSelectedSale(null)}
          onVoided={() => { setSelectedSale(null); load(); }}
        />
      )}
    </div>
  );
}
