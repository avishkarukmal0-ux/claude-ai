import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../services/api';
import toast from 'react-hot-toast';
import dayjs from 'dayjs';
import {
  Package, Phone, Clock, CheckCircle, XCircle, Plus, RefreshCw, X,
  ShoppingBag, AlertTriangle, Loader2, ChevronDown
} from 'lucide-react';

const STATUS_COLORS = {
  pending: 'bg-yellow-100 text-yellow-800 border-yellow-200',
  ready: 'bg-green-100 text-green-800 border-green-200',
  collected: 'bg-gray-100 text-gray-600 border-gray-200',
  cancelled: 'bg-red-100 text-red-700 border-red-200',
};

const STATUS_LABELS = {
  pending: 'Pending',
  ready: 'Ready',
  collected: 'Collected',
  cancelled: 'Cancelled',
};

const FILTER_TABS = ['all', 'pending', 'ready', 'collected', 'cancelled'];

const emptyItem = () => ({ name: '', qty: 1, unitPrice: '' });

const emptyForm = () => ({
  customerName: '',
  customerPhone: '',
  items: [emptyItem()],
  notes: '',
  requestedTime: dayjs().add(1, 'hour').format('YYYY-MM-DDTHH:mm'),
});

function CreateOrderModal({ onClose, onCreated }) {
  const [form, setForm] = useState(emptyForm());
  const [saving, setSaving] = useState(false);

  const total = form.items.reduce((sum, it) => {
    const price = parseFloat(it.unitPrice) || 0;
    const qty = parseInt(it.qty, 10) || 0;
    return sum + price * qty;
  }, 0);

  const setField = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const updateItem = (idx, field, value) => {
    setForm(f => {
      const items = [...f.items];
      items[idx] = { ...items[idx], [field]: value };
      return { ...f, items };
    });
  };

  const addItem = () => setForm(f => ({ ...f, items: [...f.items, emptyItem()] }));

  const removeItem = idx => setForm(f => ({
    ...f,
    items: f.items.filter((_, i) => i !== idx),
  }));

  const handleSubmit = async e => {
    e.preventDefault();
    if (!form.customerName.trim()) return toast.error('Customer name is required');
    if (form.items.length === 0) return toast.error('Add at least one item');
    for (const it of form.items) {
      if (!it.name.trim()) return toast.error('All items need a name');
      if (!it.unitPrice || parseFloat(it.unitPrice) <= 0) return toast.error('All items need a valid price');
    }
    setSaving(true);
    try {
      await api.post('/collection-orders', {
        ...form,
        total,
        items: form.items.map(it => ({
          name: it.name,
          qty: parseInt(it.qty, 10) || 1,
          unitPrice: parseFloat(it.unitPrice) || 0,
        })),
      });
      toast.success('Collection order created');
      onCreated();
      onClose();
    } catch (err) {
      toast.error(err?.response?.data?.message || 'Failed to create order');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-xl max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between p-6 border-b sticky top-0 bg-white z-10">
          <div>
            <h2 className="text-xl font-bold text-gray-900">New Collection Order</h2>
            <p className="text-sm text-gray-500">Click &amp; Collect</p>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-gray-100 rounded-lg">
            <X size={20} />
          </button>
        </div>
        <form onSubmit={handleSubmit} className="p-6 space-y-5">
          <div className="grid grid-cols-2 gap-4">
            <div className="col-span-2 sm:col-span-1">
              <label className="block text-sm font-medium text-gray-700 mb-1">Customer Name *</label>
              <input
                className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                value={form.customerName}
                onChange={e => setField('customerName', e.target.value)}
                placeholder="John Smith"
                required
              />
            </div>
            <div className="col-span-2 sm:col-span-1">
              <label className="block text-sm font-medium text-gray-700 mb-1">Phone Number</label>
              <input
                className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                value={form.customerPhone}
                onChange={e => setField('customerPhone', e.target.value)}
                placeholder="07700 900000"
                type="tel"
              />
            </div>
            <div className="col-span-2">
              <label className="block text-sm font-medium text-gray-700 mb-1">Requested Collection Time</label>
              <input
                type="datetime-local"
                className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                value={form.requestedTime}
                onChange={e => setField('requestedTime', e.target.value)}
              />
            </div>
          </div>

          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="block text-sm font-medium text-gray-700">Items *</label>
              <button
                type="button"
                onClick={addItem}
                className="flex items-center gap-1 text-xs text-blue-600 hover:text-blue-800 font-medium"
              >
                <Plus size={14} /> Add Item
              </button>
            </div>
            <div className="space-y-2">
              {form.items.map((item, idx) => (
                <div key={idx} className="grid grid-cols-12 gap-2 items-center">
                  <div className="col-span-5">
                    <input
                      className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                      placeholder="Item name"
                      value={item.name}
                      onChange={e => updateItem(idx, 'name', e.target.value)}
                    />
                  </div>
                  <div className="col-span-2">
                    <input
                      type="number"
                      min="1"
                      className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 text-center"
                      value={item.qty}
                      onChange={e => updateItem(idx, 'qty', e.target.value)}
                    />
                  </div>
                  <div className="col-span-3">
                    <div className="relative">
                      <span className="absolute left-2 top-1/2 -translate-y-1/2 text-gray-400 text-sm">£</span>
                      <input
                        type="number"
                        step="0.01"
                        min="0"
                        className="w-full border rounded-lg pl-6 pr-2 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                        placeholder="0.00"
                        value={item.unitPrice}
                        onChange={e => updateItem(idx, 'unitPrice', e.target.value)}
                      />
                    </div>
                  </div>
                  <div className="col-span-2 text-right">
                    <span className="text-sm font-medium text-gray-700">
                      £{((parseFloat(item.unitPrice) || 0) * (parseInt(item.qty, 10) || 0)).toFixed(2)}
                    </span>
                  </div>
                  {form.items.length > 1 && (
                    <button
                      type="button"
                      onClick={() => removeItem(idx)}
                      className="absolute right-0 text-red-400 hover:text-red-600 -ml-1"
                    >
                      <X size={14} />
                    </button>
                  )}
                </div>
              ))}
            </div>
            <div className="flex justify-end mt-3 pt-3 border-t">
              <div className="text-right">
                <p className="text-xs text-gray-500">Order Total</p>
                <p className="text-2xl font-black text-gray-900">£{total.toFixed(2)}</p>
              </div>
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Notes</label>
            <textarea
              className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
              rows={2}
              placeholder="Any special instructions…"
              value={form.notes}
              onChange={e => setField('notes', e.target.value)}
            />
          </div>

          <div className="flex gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 border border-gray-300 text-gray-700 px-4 py-2.5 rounded-lg text-sm font-medium hover:bg-gray-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving}
              className="flex-1 bg-blue-600 text-white px-4 py-2.5 rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50 flex items-center justify-center gap-2"
            >
              {saving ? <Loader2 size={16} className="animate-spin" /> : <Plus size={16} />}
              {saving ? 'Creating…' : 'Create Order'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function ConfirmModal({ title, message, confirmLabel, confirmClass, onConfirm, onCancel }) {
  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-6">
        <h3 className="text-lg font-bold text-gray-900 mb-2">{title}</h3>
        <p className="text-sm text-gray-600 mb-6">{message}</p>
        <div className="flex gap-3">
          <button
            onClick={onCancel}
            className="flex-1 border border-gray-300 text-gray-700 px-4 py-2 rounded-lg text-sm font-medium hover:bg-gray-50"
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            className={`flex-1 px-4 py-2 rounded-lg text-sm font-medium text-white ${confirmClass || 'bg-blue-600 hover:bg-blue-700'}`}
          >
            {confirmLabel || 'Confirm'}
          </button>
        </div>
      </div>
    </div>
  );
}

function OrderCard({ order, onAction }) {
  const navigate = useNavigate();
  const [expanded, setExpanded] = useState(false);

  const handleLoadToPOS = () => {
    localStorage.setItem('vendora_collection_order_recall', order._id);
    toast.success('Order loaded — opening POS…');
    navigate('/pos');
  };

  return (
    <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
      <div className="p-4">
        <div className="flex items-start justify-between gap-2 mb-3">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="font-bold text-gray-900 text-base">{order.orderNumber || `#${order._id?.slice(-6).toUpperCase()}`}</span>
              <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold border ${STATUS_COLORS[order.status]}`}>
                {STATUS_LABELS[order.status]}
              </span>
              {order.status === 'ready' && (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold bg-blue-100 text-blue-700 border border-blue-200 animate-pulse">
                  Ready for pickup
                </span>
              )}
            </div>
            <div className="flex items-center gap-3 mt-1 text-sm text-gray-500">
              <span className="flex items-center gap-1">
                <Package size={13} /> {order.customerName}
              </span>
              {order.customerPhone && (
                <span className="flex items-center gap-1">
                  <Phone size={13} /> {order.customerPhone}
                </span>
              )}
            </div>
          </div>
          <div className="text-right shrink-0">
            <p className="text-xl font-black text-gray-900">£{Number(order.total || 0).toFixed(2)}</p>
            <p className="text-xs text-gray-400">{order.items?.length || 0} item{(order.items?.length || 0) !== 1 ? 's' : ''}</p>
          </div>
        </div>

        {order.requestedTime && (
          <div className="flex items-center gap-1 text-xs text-gray-500 mb-3">
            <Clock size={12} />
            <span>Collect by: {dayjs(order.requestedTime).format('ddd D MMM, h:mma')}</span>
          </div>
        )}

        <button
          onClick={() => setExpanded(e => !e)}
          className="flex items-center gap-1 text-xs text-gray-400 hover:text-gray-600 mb-3"
        >
          <ChevronDown size={12} className={`transition-transform ${expanded ? 'rotate-180' : ''}`} />
          {expanded ? 'Hide' : 'Show'} items
        </button>

        {expanded && (
          <div className="bg-gray-50 rounded-lg p-3 mb-3 space-y-1">
            {(order.items || []).map((it, idx) => (
              <div key={idx} className="flex justify-between text-sm">
                <span className="text-gray-700">{it.qty}x {it.name}</span>
                <span className="text-gray-900 font-medium">£{((it.unitPrice || 0) * (it.qty || 1)).toFixed(2)}</span>
              </div>
            ))}
            {order.notes && (
              <p className="text-xs text-gray-500 mt-2 pt-2 border-t italic">Note: {order.notes}</p>
            )}
          </div>
        )}

        <div className="flex flex-wrap gap-2">
          {order.status === 'pending' && (
            <button
              onClick={() => onAction(order._id, 'ready')}
              className="flex items-center gap-1.5 bg-green-600 text-white px-3 py-1.5 rounded-lg text-xs font-semibold hover:bg-green-700"
            >
              <CheckCircle size={13} /> Mark Ready
            </button>
          )}
          {order.status === 'ready' && (
            <>
              <button
                onClick={() => onAction(order._id, 'collected')}
                className="flex items-center gap-1.5 bg-gray-700 text-white px-3 py-1.5 rounded-lg text-xs font-semibold hover:bg-gray-800"
              >
                <CheckCircle size={13} /> Mark Collected
              </button>
              <button
                onClick={handleLoadToPOS}
                className="flex items-center gap-1.5 bg-blue-600 text-white px-3 py-1.5 rounded-lg text-xs font-semibold hover:bg-blue-700"
              >
                <ShoppingBag size={13} /> Load to POS
              </button>
            </>
          )}
          {order.status !== 'collected' && order.status !== 'cancelled' && (
            <button
              onClick={() => onAction(order._id, 'cancel')}
              className="flex items-center gap-1.5 border border-red-200 text-red-600 px-3 py-1.5 rounded-lg text-xs font-semibold hover:bg-red-50"
            >
              <XCircle size={13} /> Cancel
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

export default function CollectionOrdersPage() {
  const [orders, setOrders] = useState([]);
  const [filter, setFilter] = useState('all');
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [confirm, setConfirm] = useState(null); // { orderId, action }
  const intervalRef = useRef(null);

  const load = useCallback(async () => {
    try {
      const data = await api.get('/collection-orders?status=all');
      const list = Array.isArray(data) ? data : (data.orders || data.data || []);
      setOrders(list);
    } catch {
      // silently fail on refresh
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
    intervalRef.current = setInterval(load, 30000);
    return () => clearInterval(intervalRef.current);
  }, [load]);

  const counts = {
    pending: orders.filter(o => o.status === 'pending').length,
    ready: orders.filter(o => o.status === 'ready').length,
    collected: orders.filter(
      o => o.status === 'collected' && dayjs(o.updatedAt).isSame(dayjs(), 'day')
    ).length,
  };

  const filtered = filter === 'all' ? orders : orders.filter(o => o.status === filter);

  const handleAction = async (orderId, action) => {
    if (action === 'collected') {
      setConfirm({ orderId, action });
      return;
    }
    await doAction(orderId, action);
  };

  const doAction = async (orderId, action) => {
    try {
      if (action === 'ready') {
        await api.put(`/collection-orders/${orderId}/ready`);
        toast.success('Order marked as ready');
      } else if (action === 'collected') {
        await api.put(`/collection-orders/${orderId}/collected`);
        toast.success('Order marked as collected');
      } else if (action === 'cancel') {
        await api.put(`/collection-orders/${orderId}/cancel`);
        toast.success('Order cancelled');
      }
      await load();
    } catch (err) {
      toast.error(err?.response?.data?.message || 'Action failed');
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 p-4 sm:p-6">
      {/* Header */}
      <div className="mb-6">
        <div className="flex items-center justify-between flex-wrap gap-3 mb-4">
          <div>
            <h1 className="text-2xl font-black text-gray-900 flex items-center gap-2">
              <Package size={24} className="text-blue-600" />
              Click &amp; Collect
            </h1>
            <p className="text-sm text-gray-500 mt-0.5">Manage collection orders</p>
          </div>
          <div className="flex gap-2">
            <button
              onClick={load}
              className="p-2 border border-gray-200 rounded-lg hover:bg-gray-100 text-gray-500"
              title="Refresh"
            >
              <RefreshCw size={16} />
            </button>
            <button
              onClick={() => setShowCreate(true)}
              className="flex items-center gap-2 bg-blue-600 text-white px-4 py-2 rounded-lg text-sm font-semibold hover:bg-blue-700"
            >
              <Plus size={16} /> New Order
            </button>
          </div>
        </div>

        {/* Dashboard stats */}
        <div className="grid grid-cols-3 gap-3 mb-4">
          <div className="bg-white rounded-xl border border-gray-200 p-4 text-center">
            <p className="text-3xl font-black text-red-600">{counts.pending}</p>
            <p className="text-xs font-semibold text-gray-500 mt-1">Pending</p>
          </div>
          <div className="bg-white rounded-xl border border-gray-200 p-4 text-center">
            <p className="text-3xl font-black text-green-600">{counts.ready}</p>
            <p className="text-xs font-semibold text-gray-500 mt-1">Ready</p>
          </div>
          <div className="bg-white rounded-xl border border-gray-200 p-4 text-center">
            <p className="text-3xl font-black text-gray-500">{counts.collected}</p>
            <p className="text-xs font-semibold text-gray-500 mt-1">Collected Today</p>
          </div>
        </div>

        {/* Filter tabs */}
        <div className="flex gap-1 bg-gray-100 p-1 rounded-xl overflow-x-auto">
          {FILTER_TABS.map(tab => (
            <button
              key={tab}
              onClick={() => setFilter(tab)}
              className={`px-4 py-1.5 rounded-lg text-sm font-semibold capitalize transition-all whitespace-nowrap ${
                filter === tab
                  ? 'bg-white text-gray-900 shadow-sm'
                  : 'text-gray-500 hover:text-gray-700'
              }`}
            >
              {tab}
              {tab !== 'all' && orders.filter(o => o.status === tab).length > 0 && (
                <span className={`ml-1.5 inline-flex items-center justify-center w-4 h-4 rounded-full text-xs ${
                  filter === tab ? 'bg-blue-600 text-white' : 'bg-gray-300 text-gray-600'
                }`}>
                  {orders.filter(o => o.status === tab).length}
                </span>
              )}
            </button>
          ))}
        </div>
      </div>

      {/* Orders grid */}
      {loading ? (
        <div className="flex justify-center py-16">
          <Loader2 size={32} className="animate-spin text-blue-600" />
        </div>
      ) : filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-gray-400">
          <Package size={56} className="mb-3 opacity-20" />
          <p className="font-semibold text-lg">No orders found</p>
          <p className="text-sm mt-1">
            {filter === 'all' ? 'Create your first collection order above' : `No ${filter} orders`}
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {filtered.map(order => (
            <OrderCard key={order._id} order={order} onAction={handleAction} />
          ))}
        </div>
      )}

      {showCreate && (
        <CreateOrderModal onClose={() => setShowCreate(false)} onCreated={load} />
      )}

      {confirm && (
        <ConfirmModal
          title="Mark as Collected?"
          message={`This will mark the order as collected and cannot be undone.`}
          confirmLabel="Mark Collected"
          confirmClass="bg-gray-700 hover:bg-gray-800"
          onConfirm={async () => {
            const { orderId, action } = confirm;
            setConfirm(null);
            await doAction(orderId, action);
          }}
          onCancel={() => setConfirm(null)}
        />
      )}
    </div>
  );
}
