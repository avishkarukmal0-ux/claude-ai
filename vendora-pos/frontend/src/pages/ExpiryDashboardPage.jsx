import React, { useState, useEffect, useCallback } from 'react';
import api from '../services/api';
import toast from 'react-hot-toast';
import dayjs from 'dayjs';

const fmt = (n) => `£${(Number(n) || 0).toFixed(2)}`;

// ── Summary Card ─────────────────────────────────────────────────────────────
function SummaryCard({ label, value, sub, color }) {
  const colors = {
    red:    { bg: 'rgba(220,38,38,0.12)',  border: 'rgba(220,38,38,0.3)',  text: '#F87171' },
    amber:  { bg: 'rgba(217,119,6,0.12)', border: 'rgba(217,119,6,0.3)', text: '#FCD34D' },
    yellow: { bg: 'rgba(234,179,8,0.12)', border: 'rgba(234,179,8,0.3)', text: '#FDE68A' },
    green:  { bg: 'rgba(22,163,74,0.12)', border: 'rgba(22,163,74,0.3)', text: '#4ADE80' },
  };
  const c = colors[color] || colors.amber;
  return (
    <div style={{
      background: c.bg, border: `1px solid ${c.border}`,
      borderRadius: 12, padding: '16px 20px', flex: 1, minWidth: 180,
    }}>
      <p style={{ fontSize: 11, color: 'var(--text-muted)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 6 }}>{label}</p>
      <p style={{ fontSize: 26, fontWeight: 700, color: c.text, lineHeight: 1 }}>{value}</p>
      {sub && <p style={{ fontSize: 11, color: 'var(--text-secondary)', marginTop: 4 }}>{sub}</p>}
    </div>
  );
}

// ── Expiry Badge ─────────────────────────────────────────────────────────────
function ExpiryBadge({ daysLeft, daysOverdue }) {
  if (daysOverdue !== undefined) {
    return (
      <span style={{ background: 'rgba(220,38,38,0.18)', color: '#F87171', padding: '2px 8px', borderRadius: 20, fontSize: 11, fontWeight: 700 }}>
        {daysOverdue === 0 ? 'Expires TODAY' : `${daysOverdue}d overdue`}
      </span>
    );
  }
  if (daysLeft === 0) return <span style={{ background: 'rgba(220,38,38,0.18)', color: '#F87171', padding: '2px 8px', borderRadius: 20, fontSize: 11, fontWeight: 700 }}>Expires TODAY</span>;
  if (daysLeft === 1) return <span style={{ background: 'rgba(220,38,38,0.15)', color: '#FCA5A5', padding: '2px 8px', borderRadius: 20, fontSize: 11, fontWeight: 700 }}>Tomorrow</span>;
  if (daysLeft <= 3) return <span style={{ background: 'rgba(217,119,6,0.15)', color: '#FCD34D', padding: '2px 8px', borderRadius: 20, fontSize: 11, fontWeight: 700 }}>{daysLeft}d left</span>;
  return <span style={{ background: 'rgba(234,179,8,0.12)', color: '#FDE68A', padding: '2px 8px', borderRadius: 20, fontSize: 11, fontWeight: 700 }}>{daysLeft}d left</span>;
}

// ── Product Card ─────────────────────────────────────────────────────────────
function ProductCard({ item, type, onApplyDiscount, onMarkDisposed }) {
  const { product, batch, daysLeft, daysOverdue, originalPrice, discountedPrice, discountPercent } = item;

  const borderColor = type === 'expired' ? 'rgba(220,38,38,0.3)'
    : type === 'today' ? 'rgba(220,38,38,0.25)'
    : 'rgba(217,119,6,0.25)';

  return (
    <div style={{
      background: 'var(--bg-card)',
      border: `1px solid ${borderColor}`,
      borderRadius: 10,
      padding: 14,
      marginBottom: 8,
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <p style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)', marginBottom: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {product.name}
          </p>
          <p style={{ fontSize: 11, color: 'var(--text-muted)' }}>{product.category} · Qty: <strong style={{ color: 'var(--text-secondary)' }}>{batch.quantity}</strong></p>
        </div>
        <ExpiryBadge daysLeft={daysLeft} daysOverdue={daysOverdue} />
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
        <p style={{ fontSize: 11, color: 'var(--text-muted)' }}>
          Expires: <strong style={{ color: 'var(--text-secondary)' }}>{dayjs(batch.expiryDate).format('DD MMM YYYY')}</strong>
        </p>
      </div>

      {originalPrice > 0 && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
          <span style={{ fontSize: 13, color: 'var(--text-secondary)', textDecoration: discountedPrice && discountedPrice < originalPrice ? 'line-through' : 'none' }}>
            {fmt(originalPrice)}
          </span>
          {discountedPrice && discountedPrice < originalPrice && (
            <>
              <span style={{ fontSize: 16, fontWeight: 700, color: 'var(--green-light)' }}>{fmt(discountedPrice)}</span>
              <span style={{ fontSize: 11, background: 'rgba(22,163,74,0.15)', color: 'var(--green-light)', padding: '2px 6px', borderRadius: 6, fontWeight: 600 }}>-{discountPercent}%</span>
            </>
          )}
        </div>
      )}

      <div style={{ display: 'flex', gap: 6 }}>
        {type !== 'expired' && discountedPrice && (
          <button
            onClick={() => onApplyDiscount(item)}
            style={{
              flex: 1, background: 'rgba(22,163,74,0.15)', border: '1px solid rgba(22,163,74,0.3)',
              color: 'var(--green-light)', borderRadius: 6, padding: '6px 0', fontSize: 11, fontWeight: 600, cursor: 'pointer',
            }}
          >
            Apply Discount
          </button>
        )}
        <button
          onClick={() => onMarkDisposed(item)}
          style={{
            flex: type === 'expired' ? 2 : 1,
            background: 'rgba(220,38,38,0.1)', border: '1px solid rgba(220,38,38,0.25)',
            color: '#F87171', borderRadius: 6, padding: '6px 0', fontSize: 11, fontWeight: 600, cursor: 'pointer',
          }}
        >
          {type === 'expired' ? 'Remove / Dispose' : 'Mark Disposed'}
        </button>
      </div>
    </div>
  );
}

// ── Column Header ─────────────────────────────────────────────────────────────
function Column({ title, count, color, children }) {
  const colors = {
    red:    { header: 'rgba(220,38,38,0.15)', border: 'rgba(220,38,38,0.2)', dot: '#F87171' },
    amber:  { header: 'rgba(217,119,6,0.12)', border: 'rgba(217,119,6,0.2)', dot: '#FCD34D' },
    yellow: { header: 'rgba(234,179,8,0.10)', border: 'rgba(234,179,8,0.2)', dot: '#FDE68A' },
  };
  const c = colors[color] || colors.amber;
  return (
    <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column' }}>
      <div style={{
        background: c.header, border: `1px solid ${c.border}`,
        borderRadius: '10px 10px 0 0', padding: '12px 16px',
        display: 'flex', alignItems: 'center', gap: 8, marginBottom: 1,
      }}>
        <span style={{ width: 8, height: 8, borderRadius: '50%', background: c.dot, display: 'inline-block' }} />
        <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-primary)' }}>{title}</span>
        {count > 0 && (
          <span style={{
            marginLeft: 'auto', background: c.dot, color: '#000', fontSize: 11, fontWeight: 700,
            borderRadius: 10, padding: '1px 7px',
          }}>{count}</span>
        )}
      </div>
      <div style={{
        border: `1px solid ${c.border}`, borderTop: 'none',
        borderRadius: '0 0 10px 10px', padding: '10px 10px',
        flex: 1, overflowY: 'auto', maxHeight: 'calc(100vh - 300px)',
        minHeight: 120,
      }}>
        {count === 0
          ? <p style={{ fontSize: 12, color: 'var(--text-muted)', textAlign: 'center', padding: '20px 0' }}>All clear</p>
          : children}
      </div>
    </div>
  );
}

// ── Add Expiry Batch Modal ────────────────────────────────────────────────────
function AddBatchModal({ onClose, onSaved }) {
  const [barcode, setBarcode] = useState('');
  const [product, setProduct] = useState(null);
  const [quantity, setQuantity] = useState('');
  const [expiryDate, setExpiryDate] = useState('');
  const [loading, setLoading] = useState(false);
  const [searching, setSearching] = useState(false);

  const searchProduct = async () => {
    if (!barcode.trim()) return;
    setSearching(true);
    try {
      const res = await api.get(`/products/barcode/${barcode.trim()}`);
      setProduct(res.product || res);
    } catch {
      toast.error('Product not found');
      setProduct(null);
    } finally { setSearching(false); }
  };

  const handleSave = async () => {
    if (!product || !quantity || !expiryDate) return toast.error('All fields required');
    setLoading(true);
    try {
      await api.post(`/expiry/${product._id}/batch`, {
        quantity: Number(quantity),
        expiryDate: new Date(expiryDate).toISOString(),
      });
      toast.success('Expiry batch added');
      onSaved();
      onClose();
    } catch (e) {
      toast.error(e.response?.data?.error || 'Failed to add batch');
    } finally { setLoading(false); }
  };

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', zIndex: 50, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ background: 'var(--bg-card)', borderRadius: 14, padding: 24, width: 400, border: '1px solid var(--border)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 18 }}>
          <h3 style={{ fontSize: 15, fontWeight: 700, color: 'var(--text-primary)' }}>Add Expiry Batch</h3>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', fontSize: 18 }}>✕</button>
        </div>

        <div style={{ marginBottom: 12 }}>
          <label style={{ fontSize: 11, color: 'var(--text-muted)', display: 'block', marginBottom: 4 }}>BARCODE / PRODUCT</label>
          <div style={{ display: 'flex', gap: 8 }}>
            <input
              className="vd-input"
              style={{ flex: 1 }}
              placeholder="Scan or type barcode..."
              value={barcode}
              onChange={e => setBarcode(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && searchProduct()}
            />
            <button
              onClick={searchProduct}
              style={{ background: 'var(--blue)', color: '#fff', border: 'none', borderRadius: 8, padding: '0 14px', cursor: 'pointer', fontSize: 12 }}
            >{searching ? '...' : 'Find'}</button>
          </div>
          {product && <p style={{ fontSize: 12, color: 'var(--green-light)', marginTop: 6 }}>✓ {product.name}</p>}
        </div>

        <div style={{ marginBottom: 12 }}>
          <label style={{ fontSize: 11, color: 'var(--text-muted)', display: 'block', marginBottom: 4 }}>QUANTITY IN THIS BATCH</label>
          <input className="vd-input" style={{ width: '100%' }} type="number" min="1" placeholder="e.g. 24" value={quantity} onChange={e => setQuantity(e.target.value)} />
        </div>

        <div style={{ marginBottom: 20 }}>
          <label style={{ fontSize: 11, color: 'var(--text-muted)', display: 'block', marginBottom: 4 }}>EXPIRY DATE</label>
          <input className="vd-input" style={{ width: '100%' }} type="date" value={expiryDate} onChange={e => setExpiryDate(e.target.value)} />
        </div>

        <div style={{ display: 'flex', gap: 8 }}>
          <button onClick={onClose} style={{ flex: 1, background: 'var(--bg-hover)', border: '1px solid var(--border)', color: 'var(--text-secondary)', borderRadius: 8, padding: '10px 0', cursor: 'pointer', fontWeight: 600 }}>Cancel</button>
          <button onClick={handleSave} disabled={loading || !product} style={{ flex: 2, background: 'var(--blue)', color: '#fff', border: 'none', borderRadius: 8, padding: '10px 0', cursor: 'pointer', fontWeight: 600, opacity: (!product || loading) ? 0.5 : 1 }}>
            {loading ? 'Saving...' : 'Add Batch'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────
export default function ExpiryDashboardPage() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [showAddModal, setShowAddModal] = useState(false);
  const [applying, setApplying] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.get('/expiry/dashboard');
      setData(res.data);
    } catch (e) {
      toast.error('Failed to load expiry data');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const handleApplyDiscount = async (item) => {
    if (!item.discountedPrice) return;
    try {
      await api.put(`/products/${item.product._id}`, {
        'pricing.salePrice': item.discountedPrice,
        'pricing.saleStartDate': new Date(),
        'pricing.saleEndDate': new Date(item.batch.expiryDate),
      });
      toast.success(`Discount applied to ${item.product.name}`);
      load();
    } catch {
      toast.error('Failed to apply discount');
    }
  };

  const handleMarkDisposed = async (item) => {
    if (!window.confirm(`Mark batch of ${item.product.name} as disposed?`)) return;
    try {
      await api.delete(`/expiry/${item.product._id}/batch/${item.batch.batchId}`);
      toast.success('Batch marked as disposed');
      load();
    } catch {
      toast.error('Failed to dispose batch');
    }
  };

  const handleApplyAll = async () => {
    if (!data) return;
    const items = [...(data.expiringSoon || []), ...(data.expiringThisWeek || [])].filter(i => i.discountedPrice);
    if (items.length === 0) return toast('No discounts to apply');
    setApplying(true);
    let count = 0;
    for (const item of items) {
      try {
        await api.put(`/products/${item.product._id}`, {
          'pricing.salePrice': item.discountedPrice,
          'pricing.saleStartDate': new Date(),
          'pricing.saleEndDate': new Date(item.batch.expiryDate),
        });
        count++;
      } catch { /* skip */ }
    }
    setApplying(false);
    toast.success(`Applied discounts to ${count} products`);
    load();
  };

  if (loading) return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: 300 }}>
      <div style={{ width: 32, height: 32, border: '3px solid var(--blue-dim)', borderTopColor: 'var(--blue)', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
    </div>
  );

  const expired = data?.expired || [];
  const expiringSoon = data?.expiringSoon || [];
  const thisWeek = data?.expiringThisWeek?.filter(i => !expiringSoon.find(e => e.batch?.batchId === i.batch?.batchId)) || [];

  return (
    <div style={{ padding: '20px 24px', height: '100%', display: 'flex', flexDirection: 'column', gap: 16 }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div>
          <h1 style={{ fontSize: 20, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 2 }}>Expiry Tracker</h1>
          <p style={{ fontSize: 12, color: 'var(--text-muted)' }}>Monitor and manage products approaching their expiry date</p>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button
            onClick={handleApplyAll}
            disabled={applying}
            style={{
              background: 'rgba(22,163,74,0.15)', border: '1px solid rgba(22,163,74,0.3)',
              color: 'var(--green-light)', borderRadius: 8, padding: '8px 16px',
              fontSize: 12, fontWeight: 600, cursor: 'pointer',
            }}
          >
            {applying ? 'Applying...' : 'Apply All Discounts'}
          </button>
          <button
            onClick={() => setShowAddModal(true)}
            style={{
              background: 'var(--blue)', color: '#fff', border: 'none',
              borderRadius: 8, padding: '8px 16px', fontSize: 12, fontWeight: 600, cursor: 'pointer',
            }}
          >
            + Add Expiry Batch
          </button>
        </div>
      </div>

      {/* Summary Cards */}
      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
        <SummaryCard
          label="Expired Stock Value"
          value={fmt(expired.reduce((s, i) => s + (i.product.pricing?.retailPrice || 0) * i.batch.quantity, 0))}
          sub={`${expired.length} batch${expired.length !== 1 ? 'es' : ''} — remove from sale immediately`}
          color="red"
        />
        <SummaryCard
          label="Expiring Today / Tomorrow"
          value={expiringSoon.filter(i => (i.daysLeft || 0) <= 1).length}
          sub="Apply 40–50% discount now"
          color="amber"
        />
        <SummaryCard
          label="Expiring This Week"
          value={thisWeek.length + expiringSoon.length}
          sub={`${fmt(data?.totalValue || 0)} total at risk`}
          color="yellow"
        />
        <SummaryCard
          label="Potential Revenue Saved"
          value={fmt(data?.potentialSaving || 0)}
          sub="vs. full waste if not discounted"
          color="green"
        />
      </div>

      {/* 3-Column Layout */}
      <div style={{ display: 'flex', gap: 12, flex: 1 }}>
        <Column title="Expired — Remove from Sale" count={expired.length} color="red">
          {expired.map((item, i) => (
            <ProductCard key={i} item={item} type="expired" onApplyDiscount={handleApplyDiscount} onMarkDisposed={handleMarkDisposed} />
          ))}
        </Column>

        <Column title="Expiring Today / Tomorrow" count={expiringSoon.filter(i => (i.daysLeft || 0) <= 1).length} color="amber">
          {expiringSoon.filter(i => (i.daysLeft || 0) <= 1).map((item, i) => (
            <ProductCard key={i} item={item} type="today" onApplyDiscount={handleApplyDiscount} onMarkDisposed={handleMarkDisposed} />
          ))}
        </Column>

        <Column title="Expiring This Week" count={thisWeek.length + expiringSoon.filter(i => (i.daysLeft || 0) > 1).length} color="yellow">
          {[...expiringSoon.filter(i => (i.daysLeft || 0) > 1), ...thisWeek].map((item, i) => (
            <ProductCard key={i} item={item} type="week" onApplyDiscount={handleApplyDiscount} onMarkDisposed={handleMarkDisposed} />
          ))}
        </Column>
      </div>

      {showAddModal && (
        <AddBatchModal onClose={() => setShowAddModal(false)} onSaved={load} />
      )}
    </div>
  );
}
