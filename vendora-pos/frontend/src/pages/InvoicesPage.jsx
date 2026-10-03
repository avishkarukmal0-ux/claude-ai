import React, { useState, useEffect, useCallback } from 'react';
import { FileText, CheckCircle, Clock, AlertCircle, RefreshCw, Eye, PoundSterling, Search } from 'lucide-react';
import * as invoiceSvc from '../services/invoices';
import toast from 'react-hot-toast';
import dayjs from 'dayjs';

const STATUS_STYLES = {
  pending:  'bg-yellow-50 text-yellow-700 border border-yellow-200',
  verified: 'bg-blue-50 text-blue-700 border border-blue-200',
  paid:     'bg-green-50 text-green-700 border border-green-200',
  overdue:  'bg-red-50 text-red-700 border border-red-200',
};

const STATUS_ICONS = {
  pending:  <Clock className="w-3 h-3" />,
  verified: <CheckCircle className="w-3 h-3" />,
  paid:     <CheckCircle className="w-3 h-3" />,
  overdue:  <AlertCircle className="w-3 h-3" />,
};

function InvoiceDetail({ invoice, onClose, onRefresh }) {
  const [acting, setActing] = useState(false);

  const handleVerify = async () => {
    setActing(true);
    try {
      await invoiceSvc.verifyInvoice(invoice._id);
      toast.success('Invoice verified — prices confirmed');
      onRefresh();
      onClose();
    } catch { } finally { setActing(false); }
  };

  const handlePay = async () => {
    setActing(true);
    try {
      await invoiceSvc.payInvoice(invoice._id);
      toast.success('Invoice marked as paid');
      onRefresh();
      onClose();
    } catch { } finally { setActing(false); }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl w-full max-w-lg shadow-xl">
        <div className="flex items-center justify-between p-5 border-b">
          <div>
            <h2 className="font-bold text-gray-900">{invoice.invoiceNumber || invoice._id?.slice(-8).toUpperCase()}</h2>
            <p className="text-sm text-gray-500">{invoice.supplier?.name || invoice.supplierName || 'Unknown Supplier'}</p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl leading-none">×</button>
        </div>

        <div className="p-5 space-y-4">
          <div className="grid grid-cols-2 gap-4 text-sm">
            <div>
              <p className="text-gray-500">Invoice Date</p>
              <p className="font-medium">{dayjs(invoice.invoiceDate || invoice.createdAt).format('DD MMM YYYY')}</p>
            </div>
            <div>
              <p className="text-gray-500">Due Date</p>
              <p className="font-medium">{invoice.dueDate ? dayjs(invoice.dueDate).format('DD MMM YYYY') : '—'}</p>
            </div>
            <div>
              <p className="text-gray-500">Net</p>
              <p className="font-medium">£{((invoice.netAmount || 0)).toFixed(2)}</p>
            </div>
            <div>
              <p className="text-gray-500">VAT</p>
              <p className="font-medium">£{((invoice.vatAmount || 0)).toFixed(2)}</p>
            </div>
          </div>

          <div className="bg-gray-50 rounded-xl p-4 flex items-center justify-between">
            <span className="text-gray-600 font-medium">Total (inc. VAT)</span>
            <span className="text-xl font-black text-gray-900">£{((invoice.totalAmount || 0)).toFixed(2)}</span>
          </div>

          {/* Line items */}
          {invoice.items?.length > 0 && (
            <div>
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Line Items — Price Verification</p>
              <div className="space-y-1 max-h-48 overflow-y-auto">
                {invoice.items.map((item, i) => (
                  <div key={i} className="flex items-center justify-between text-sm py-1.5 border-b border-gray-100">
                    <span className="text-gray-700 truncate flex-1 mr-2">{item.description || item.productName}</span>
                    <span className="text-gray-500 mr-3">×{item.qty || item.quantity}</span>
                    <span className="font-medium">£{((item.unitPrice || 0) * (item.qty || item.quantity || 1)).toFixed(2)}</span>
                    {item.priceVariance && Math.abs(item.priceVariance) > 0.01 && (
                      <span className="ml-2 text-xs text-red-600 font-medium">⚠ Variance</span>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        <div className="flex gap-3 p-5 border-t">
          {invoice.status === 'pending' && (
            <button onClick={handleVerify} disabled={acting}
              className="flex-1 bg-blue-600 hover:bg-blue-700 text-white font-semibold py-2.5 rounded-xl transition disabled:opacity-50">
              {acting ? 'Verifying…' : 'Verify Prices'}
            </button>
          )}
          {(invoice.status === 'verified') && (
            <button onClick={handlePay} disabled={acting}
              className="flex-1 bg-green-600 hover:bg-green-700 text-white font-semibold py-2.5 rounded-xl transition disabled:opacity-50">
              {acting ? 'Saving…' : 'Mark as Paid'}
            </button>
          )}
          <button onClick={onClose} className="flex-1 bg-gray-100 hover:bg-gray-200 text-gray-700 font-semibold py-2.5 rounded-xl transition">
            Close
          </button>
        </div>
      </div>
    </div>
  );
}

export default function InvoicesPage() {
  const [invoices, setInvoices] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState(null);
  const [search, setSearch] = useState('');
  const [filterStatus, setFilterStatus] = useState('all');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await invoiceSvc.getInvoices();
      setInvoices(Array.isArray(data) ? data : data?.invoices || []);
    } catch {
      toast.error('Failed to load invoices');
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  const filtered = invoices.filter(inv => {
    const matchSearch = !search ||
      (inv.invoiceNumber || '').toLowerCase().includes(search.toLowerCase()) ||
      (inv.supplier?.name || inv.supplierName || '').toLowerCase().includes(search.toLowerCase());
    const matchStatus = filterStatus === 'all' || inv.status === filterStatus;
    return matchSearch && matchStatus;
  });

  const totals = {
    pending: invoices.filter(i => i.status === 'pending').length,
    overdue: invoices.filter(i => i.status === 'overdue').length,
    totalOwed: invoices.filter(i => i.status !== 'paid').reduce((s, i) => s + (i.totalAmount || 0), 0),
  };

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-black text-gray-900">Invoices</h1>
          <p className="text-sm text-gray-500 mt-0.5">Price verification &amp; supplier payments</p>
        </div>
        <button onClick={load} className="flex items-center gap-2 text-sm text-gray-500 hover:text-gray-700">
          <RefreshCw className="w-4 h-4" /> Refresh
        </button>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-3 gap-4">
        <div className="bg-white rounded-2xl p-4 border border-gray-100 shadow-sm">
          <p className="text-xs text-gray-500 uppercase tracking-wide">Pending Verification</p>
          <p className="text-3xl font-black text-yellow-600 mt-1">{totals.pending}</p>
        </div>
        <div className="bg-white rounded-2xl p-4 border border-gray-100 shadow-sm">
          <p className="text-xs text-gray-500 uppercase tracking-wide">Overdue</p>
          <p className="text-3xl font-black text-red-600 mt-1">{totals.overdue}</p>
        </div>
        <div className="bg-white rounded-2xl p-4 border border-gray-100 shadow-sm">
          <p className="text-xs text-gray-500 uppercase tracking-wide">Total Owed</p>
          <p className="text-2xl font-black text-gray-900 mt-1">£{totals.totalOwed.toFixed(2)}</p>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search invoice # or supplier…"
            className="w-full pl-9 pr-4 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
        </div>
        <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)}
          className="border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
          <option value="all">All Statuses</option>
          <option value="pending">Pending</option>
          <option value="verified">Verified</option>
          <option value="paid">Paid</option>
          <option value="overdue">Overdue</option>
        </select>
      </div>

      {/* Table */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center py-16">
            <div className="animate-spin rounded-full h-8 w-8 border-4 border-blue-500 border-t-transparent" />
          </div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-16 text-gray-400">
            <FileText className="w-12 h-12 mx-auto mb-3 opacity-30" />
            <p className="font-medium">No invoices found</p>
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-xs text-gray-500 uppercase tracking-wide">
              <tr>
                <th className="px-4 py-3 text-left">Invoice #</th>
                <th className="px-4 py-3 text-left">Supplier</th>
                <th className="px-4 py-3 text-left">Date</th>
                <th className="px-4 py-3 text-right">Total</th>
                <th className="px-4 py-3 text-center">Status</th>
                <th className="px-4 py-3 text-center">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {filtered.map(inv => (
                <tr key={inv._id} className="hover:bg-gray-50 transition">
                  <td className="px-4 py-3 font-mono font-medium text-gray-900">
                    {inv.invoiceNumber || inv._id?.slice(-8).toUpperCase()}
                  </td>
                  <td className="px-4 py-3 text-gray-700">{inv.supplier?.name || inv.supplierName || '—'}</td>
                  <td className="px-4 py-3 text-gray-500">{dayjs(inv.invoiceDate || inv.createdAt).format('DD MMM YYYY')}</td>
                  <td className="px-4 py-3 text-right font-semibold text-gray-900">£{((inv.totalAmount || 0)).toFixed(2)}</td>
                  <td className="px-4 py-3">
                    <div className="flex justify-center">
                      <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_STYLES[inv.status] || STATUS_STYLES.pending}`}>
                        {STATUS_ICONS[inv.status] || STATUS_ICONS.pending}
                        {inv.status || 'pending'}
                      </span>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-center">
                    <button onClick={() => setSelected(inv)}
                      className="inline-flex items-center gap-1 text-blue-600 hover:text-blue-800 text-xs font-medium">
                      <Eye className="w-3.5 h-3.5" /> View
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {selected && <InvoiceDetail invoice={selected} onClose={() => setSelected(null)} onRefresh={load} />}
    </div>
  );
}
