import React, { useState, useEffect } from 'react';
import { ClipboardList, Plus } from 'lucide-react';
import api from '../services/api';
import toast from 'react-hot-toast';
import dayjs from 'dayjs';
import CameraExpiryScanner from '../components/CameraExpiryScanner';

const STATUS_COLORS = { draft:'bg-gray-100 text-gray-600', in_progress:'bg-blue-100 text-blue-700', completed:'bg-green-100 text-green-700', cancelled:'bg-red-100 text-red-600' };

// ── Quick Expiry Scan Panel ────────────────────────────────────────────────────
function QuickExpiryScan() {
  const [barcode, setBarcode] = useState('');
  const [product, setProduct] = useState(null);
  const [searching, setSearching] = useState(false);
  const [showCamera, setShowCamera] = useState(false);
  const [scannedDate, setScannedDate] = useState('');
  const [quantity, setQuantity] = useState('');
  const [saving, setSaving] = useState(false);
  const [history, setHistory] = useState([]);

  const findProduct = async () => {
    if (!barcode.trim()) return;
    setSearching(true);
    try {
      const res = await api.get(`/products/barcode/${barcode.trim()}`);
      setProduct(res.data.product);
      setScannedDate('');
      setQuantity('');
    } catch {
      toast.error('Product not found');
      setProduct(null);
    } finally { setSearching(false); }
  };

  const handleDateDetected = (isoDate, formatted) => {
    setScannedDate(formatted || dayjs(isoDate).format('DD/MM/YYYY'));
    toast.success(`AI detected: ${formatted}`);
  };

  const saveBatch = async () => {
    if (!product || !quantity || !scannedDate) return toast.error('Scan or enter expiry date and quantity first');
    setSaving(true);
    try {
      // Parse DD/MM/YYYY → ISO
      const parts = scannedDate.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
      if (!parts) return toast.error('Invalid date format (use DD/MM/YYYY)');
      const [, d, m, y] = parts;
      const isoDate = new Date(Number(y), Number(m) - 1, Number(d)).toISOString();
      await api.post(`/expiry/${product._id}/batch`, { quantity: Number(quantity), expiryDate: isoDate });
      toast.success(`Saved: ${product.name} — ${quantity} units exp ${scannedDate}`);
      setHistory(prev => [{ name: product.name, quantity, date: scannedDate, time: dayjs().format('HH:mm') }, ...prev.slice(0, 9)]);
      setBarcode('');
      setProduct(null);
      setScannedDate('');
      setQuantity('');
    } catch (e) {
      toast.error(e.response?.data?.error || 'Failed to save');
    } finally { setSaving(false); }
  };

  return (
    <div style={{ background: 'var(--bg-card)', borderRadius: 12, border: '1px solid var(--border)', padding: 20, marginTop: 20 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}>
        <span style={{ fontSize: 20 }}>📅</span>
        <div>
          <h2 style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-primary)' }}>Quick Expiry Scan</h2>
          <p style={{ fontSize: 11, color: 'var(--text-muted)' }}>Scan 5 expiry dates in 30 seconds — AI reads dates automatically</p>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
        {/* Left: Scanner form */}
        <div>
          <div style={{ marginBottom: 10 }}>
            <label style={{ fontSize: 11, color: 'var(--text-muted)', display: 'block', marginBottom: 4 }}>PRODUCT BARCODE</label>
            <div style={{ display: 'flex', gap: 6 }}>
              <input
                className="vd-input"
                style={{ flex: 1 }}
                placeholder="Scan barcode..."
                value={barcode}
                onChange={e => setBarcode(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && findProduct()}
              />
              <button
                onClick={findProduct}
                style={{ background: 'var(--blue)', color: '#fff', border: 'none', borderRadius: 8, padding: '0 14px', cursor: 'pointer', fontSize: 12, fontWeight: 600 }}
              >{searching ? '...' : 'Find'}</button>
            </div>
            {product && (
              <p style={{ fontSize: 11, color: 'var(--green-light)', marginTop: 4 }}>✓ {product.name}</p>
            )}
          </div>

          <div style={{ marginBottom: 10 }}>
            <label style={{ fontSize: 11, color: 'var(--text-muted)', display: 'block', marginBottom: 4 }}>EXPIRY DATE (DD/MM/YYYY)</label>
            <div style={{ display: 'flex', gap: 6 }}>
              <input
                className="vd-input"
                style={{ flex: 1 }}
                placeholder="e.g. 15/08/2026"
                value={scannedDate}
                onChange={e => setScannedDate(e.target.value)}
              />
              <button
                onClick={() => product ? setShowCamera(true) : toast.error('Find a product first')}
                style={{
                  background: 'rgba(96,165,250,0.15)', border: '1px solid rgba(96,165,250,0.3)',
                  color: 'var(--blue-light)', borderRadius: 8, padding: '0 12px', cursor: 'pointer', fontSize: 12, fontWeight: 600,
                  whiteSpace: 'nowrap',
                }}
                title="Scan expiry date using camera"
              >📷 AI Scan</button>
            </div>
          </div>

          <div style={{ marginBottom: 14 }}>
            <label style={{ fontSize: 11, color: 'var(--text-muted)', display: 'block', marginBottom: 4 }}>QUANTITY IN THIS BATCH</label>
            <input
              className="vd-input"
              style={{ width: '100%' }}
              type="number"
              min="1"
              placeholder="e.g. 24"
              value={quantity}
              onChange={e => setQuantity(e.target.value)}
            />
          </div>

          <button
            onClick={saveBatch}
            disabled={saving || !product}
            style={{
              width: '100%', background: 'var(--green)', color: '#fff', border: 'none',
              borderRadius: 8, padding: '10px 0', fontSize: 13, fontWeight: 600, cursor: 'pointer',
              opacity: (!product || saving) ? 0.5 : 1,
            }}
          >{saving ? 'Saving...' : 'Save Expiry Batch'}</button>
        </div>

        {/* Right: Recent history */}
        <div>
          <p style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 8 }}>RECENT SCANS THIS SESSION</p>
          {history.length === 0
            ? <p style={{ fontSize: 12, color: 'var(--text-muted)', padding: '12px 0' }}>No scans yet</p>
            : history.map((h, i) => (
              <div key={i} style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', borderBottom: '1px solid var(--border)', fontSize: 12 }}>
                <span style={{ color: 'var(--text-secondary)', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{h.name}</span>
                <span style={{ color: 'var(--text-muted)', marginLeft: 8 }}>{h.quantity}×</span>
                <span style={{ color: 'var(--amber-light)', marginLeft: 8, fontFamily: 'monospace' }}>{h.date}</span>
              </div>
            ))
          }
        </div>
      </div>

      {showCamera && (
        <CameraExpiryScanner
          productId={product?._id}
          productName={product?.name}
          onDetected={handleDateDetected}
          onClose={() => setShowCamera(false)}
        />
      )}
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────
export default function StockTakePage() {
  const [stockTakes, setStockTakes] = useState([]);
  const [loading, setLoading] = useState(true);

  async function load() {
    setLoading(true);
    try {
      const r = await api.get('/stock-take');
      setStockTakes(r.stockTakes || r.data || r || []);
    } catch {} finally { setLoading(false); }
  }

  useEffect(() => { load(); }, []);

  async function createNew() {
    try {
      await api.post('/stock-take/create', {});
      toast.success('Stock take created');
      load();
    } catch {}
  }

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Stock Take</h1>
          <p className="text-sm text-gray-500 mt-1">Periodic inventory counts</p>
        </div>
        <button onClick={createNew} className="flex items-center gap-2 bg-primary text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-primary/90">
          <Plus size={18} />New Stock Take
        </button>
      </div>

      <div className="bg-white rounded-xl border overflow-hidden">
        {loading
          ? <div className="flex justify-center py-12"><div className="animate-spin rounded-full h-8 w-8 border-2 border-primary border-t-transparent" /></div>
          : stockTakes.length === 0
            ? <div className="flex flex-col items-center justify-center py-16 text-gray-400"><ClipboardList size={48} className="mb-3 opacity-30" /><p>No stock takes yet</p></div>
            : <table className="w-full text-sm">
                <thead className="bg-gray-50 border-b">
                  <tr>
                    <th className="text-left px-4 py-3 font-semibold text-gray-600">Reference</th>
                    <th className="text-center px-4 py-3 font-semibold text-gray-600">Status</th>
                    <th className="text-right px-4 py-3 font-semibold text-gray-600">Items</th>
                    <th className="text-right px-4 py-3 font-semibold text-gray-600">Variance (£)</th>
                    <th className="text-left px-4 py-3 font-semibold text-gray-600">Date</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {stockTakes.map(s => (
                    <tr key={s._id} className="hover:bg-gray-50">
                      <td className="px-4 py-3 font-medium text-gray-900">{s.reference || `ST-${s._id?.slice(-6)}`}</td>
                      <td className="px-4 py-3 text-center"><span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium capitalize ${STATUS_COLORS[s.status] || ''}`}>{s.status}</span></td>
                      <td className="px-4 py-3 text-right text-gray-500">{s.itemCount || 0}</td>
                      <td className={`px-4 py-3 text-right font-medium ${s.totalVarianceValue < 0 ? 'text-red-600' : s.totalVarianceValue > 0 ? 'text-green-600' : 'text-gray-500'}`}>
                        {s.totalVarianceValue != null ? `£${Number(s.totalVarianceValue).toFixed(2)}` : '—'}
                      </td>
                      <td className="px-4 py-3 text-gray-500 text-xs">{dayjs(s.createdAt).format('DD/MM/YYYY HH:mm')}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
        }
      </div>

      {/* AI Expiry Quick Scan */}
      <QuickExpiryScan />
    </div>
  );
}
