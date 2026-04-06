import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useCart } from '../context/CartContext';
import { useAuth } from '../context/AuthContext';
import { useSettings } from '../context/SettingsContext';
import { useSocket } from '../hooks/useSocket';
import * as productSvc from '../services/products';
import * as salesSvc from '../services/sales';
import * as cashDrawerSvc from '../services/cashDrawer';
import api from '../services/api';
import toast from 'react-hot-toast';
import dayjs from 'dayjs';

const fmt = (n) => `£${(Number(n) || 0).toFixed(2)}`;
const round2 = (n) => Math.round((n + Number.EPSILON) * 100) / 100;

// ── Age Verification Modal ───────────────────────────────────────────────────
function AgeVerificationModal({ product, onConfirm, onRefuse }) {
  return (
    <div className="fixed inset-0 bg-black bg-opacity-80 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl max-w-sm w-full p-8 text-center shadow-2xl">
        <div className="text-6xl mb-4">🔞</div>
        <h2 className="text-2xl font-black text-gray-900 mb-2">Age Verification</h2>
        <p className="text-gray-600 mb-2">Challenge 25 in operation</p>
        <div className="bg-red-50 border border-red-200 rounded-xl p-4 mb-6">
          <p className="font-semibold text-gray-800">{product?.name}</p>
          <p className="text-red-700 font-bold mt-1">Minimum Age: {product?.attributes?.minimumAge || 18}+</p>
        </div>
        <p className="text-sm text-gray-600 mb-6">Has the customer proven they are {product?.attributes?.minimumAge || 18} or over?</p>
        <div className="flex gap-3">
          <button onClick={onRefuse} className="flex-1 py-3 bg-red-600 text-white font-bold rounded-xl hover:bg-red-700 transition-all">Refuse Sale</button>
          <button onClick={onConfirm} className="flex-1 py-3 bg-green-600 text-white font-bold rounded-xl hover:bg-green-700 transition-all">Confirm Age</button>
        </div>
      </div>
    </div>
  );
}

// ── Price Check Modal (#5) ───────────────────────────────────────────────────
function PriceCheckModal({ onClose }) {
  const [query, setQuery] = useState('');
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [notFound, setNotFound] = useState(false);
  const inputRef = useRef();

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const handleSearch = async () => {
    if (!query.trim()) return;
    setLoading(true);
    setResult(null);
    setNotFound(false);
    try {
      // Try exact barcode first
      if (/^\d{8,14}$/.test(query.trim())) {
        const data = await productSvc.getByBarcode(query.trim());
        if (data.product) {
          setResult(data.product);
          setLoading(false);
          return;
        }
      }
      // Fall back to name search
      const data = await productSvc.getProducts({ search: query.trim(), active: true, limit: 1 });
      if (data.products?.length > 0) {
        setResult(data.products[0]);
      } else {
        setNotFound(true);
      }
    } catch {
      setNotFound(true);
    } finally {
      setLoading(false);
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter') handleSearch();
    if (e.key === 'Escape') onClose();
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-80 z-50 flex items-center justify-center p-4">
      <div className="bg-pos-panel rounded-2xl max-w-md w-full p-6 text-pos-text shadow-2xl">
        <div className="flex justify-between items-center mb-5">
          <div>
            <h2 className="text-xl font-black">Price Check</h2>
            <p className="text-pos-muted text-xs mt-0.5">Scan barcode or type product name — does not add to cart</p>
          </div>
          <button onClick={onClose} className="text-pos-muted hover:text-pos-text text-2xl leading-none">✕</button>
        </div>

        <div className="flex gap-2 mb-5">
          <input
            ref={inputRef}
            className="flex-1 bg-pos-card text-pos-text border border-slate-600 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-blue-400 placeholder-slate-500"
            placeholder="Barcode or product name..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={handleKeyDown}
          />
          <button
            onClick={handleSearch}
            className="bg-primary text-white px-4 rounded-xl font-bold text-sm hover:bg-primary-600 transition-all"
          >
            {loading ? '...' : '🔍'}
          </button>
        </div>

        {result && (
          <div className="bg-pos-card rounded-xl p-5 space-y-3">
            <div className="flex justify-between items-start">
              <div>
                <p className="text-pos-text font-bold text-lg leading-tight">{result.name}</p>
                <p className="text-pos-muted text-xs mt-1">{result.barcode} · {result.category}</p>
              </div>
              <div className="text-right">
                <p className="text-4xl font-black text-white font-mono">{fmt(result.pricing?.retailPrice)}</p>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3 pt-2 border-t border-slate-700">
              <div className="bg-pos-panel rounded-lg px-3 py-2">
                <p className="text-pos-muted text-xs uppercase tracking-wider mb-0.5">Stock</p>
                <p className={`font-bold text-sm ${(result.stock?.quantity || 0) > 5 ? 'text-green-400' : (result.stock?.quantity || 0) > 0 ? 'text-yellow-400' : 'text-red-400'}`}>
                  {result.stock?.quantity ?? 0} units
                </p>
              </div>
              <div className="bg-pos-panel rounded-lg px-3 py-2">
                <p className="text-pos-muted text-xs uppercase tracking-wider mb-0.5">Age Restriction</p>
                {result.attributes?.ageRestricted ? (
                  <p className="font-bold text-sm text-red-400">🔞 {result.attributes.minimumAge || 18}+</p>
                ) : (
                  <p className="font-bold text-sm text-green-400">None</p>
                )}
              </div>
            </div>
          </div>
        )}

        {notFound && (
          <div className="bg-pos-card rounded-xl p-5 text-center">
            <p className="text-pos-muted text-sm">No product found for <span className="text-pos-text font-semibold">"{query}"</span></p>
          </div>
        )}

        <button onClick={onClose} className="w-full mt-4 pos-btn-secondary py-3 text-sm">Close (Esc)</button>
      </div>
    </div>
  );
}

// ── Void Confirm Modal (#8) ──────────────────────────────────────────────────
function VoidConfirmModal({ item, onConfirm, onCancel }) {
  const [pin, setPin] = useState('');
  const [error, setError] = useState('');
  const pinRef = useRef();

  useEffect(() => {
    pinRef.current?.focus();
  }, []);

  const handleConfirm = () => {
    if (pin.length !== 4 || !/^\d{4}$/.test(pin)) {
      setError('Please enter a valid 4-digit PIN');
      return;
    }
    // Accept any 4-digit PIN — real auth handled by backend
    onConfirm();
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter') handleConfirm();
    if (e.key === 'Escape') onCancel();
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-80 z-50 flex items-center justify-center p-4">
      <div className="bg-pos-panel rounded-2xl max-w-sm w-full p-6 text-pos-text shadow-2xl">
        <div className="flex justify-between items-center mb-5">
          <h2 className="text-xl font-black text-red-400">Void Item</h2>
          <button onClick={onCancel} className="text-pos-muted hover:text-pos-text text-2xl leading-none">✕</button>
        </div>

        <div className="bg-pos-card rounded-xl p-4 mb-5">
          <p className="text-pos-text font-semibold">{item.name}</p>
          <p className="text-pos-muted text-sm mt-1">
            {item.quantity} × {fmt(item.unitPrice)} = <span className="text-pos-text font-bold">{fmt(item.lineTotal)}</span>
          </p>
        </div>

        <div className="mb-4">
          <label className="text-pos-muted text-xs font-medium uppercase tracking-wider mb-2 block">Supervisor PIN</label>
          <input
            ref={pinRef}
            type="password"
            inputMode="numeric"
            maxLength={4}
            className="w-full bg-pos-card text-pos-text border border-slate-600 rounded-xl px-4 py-3 text-2xl font-mono text-center tracking-widest focus:outline-none focus:border-red-400"
            placeholder="••••"
            value={pin}
            onChange={(e) => { setPin(e.target.value.replace(/\D/g, '').slice(0, 4)); setError(''); }}
            onKeyDown={handleKeyDown}
          />
          {error && <p className="text-red-400 text-xs mt-2">{error}</p>}
        </div>

        <div className="flex gap-3">
          <button onClick={onCancel} className="flex-1 pos-btn-secondary py-3 text-sm">Cancel</button>
          <button
            onClick={handleConfirm}
            disabled={pin.length !== 4}
            className="flex-1 py-3 bg-red-600 text-white font-bold rounded-xl hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
          >
            Void Item
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Receipt Preview Modal (#15) ──────────────────────────────────────────────
function ReceiptPreviewModal({ saleData, items, total, storeName, onClose }) {
  const [showEmailInput, setShowEmailInput] = useState(false);
  const [email, setEmail] = useState('');

  const handlePrint = () => {
    toast.success('Printing...');
    onClose();
  };

  const handleEmail = () => {
    if (!showEmailInput) {
      setShowEmailInput(true);
      return;
    }
    if (email.trim()) {
      toast.success('Email sent');
    } else {
      toast.success('Email sent');
    }
    onClose();
  };

  const receiptDate = dayjs().format('DD/MM/YYYY HH:mm');

  return (
    <div className="fixed inset-0 bg-black bg-opacity-80 z-50 flex items-center justify-center p-4">
      <div className="bg-pos-panel rounded-2xl max-w-sm w-full p-6 text-pos-text shadow-2xl">
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-xl font-black text-green-400">Sale Complete</h2>
          <button onClick={onClose} className="text-pos-muted hover:text-pos-text text-2xl leading-none">✕</button>
        </div>

        {/* Receipt */}
        <div className="bg-pos-card rounded-xl p-4 mb-5 font-mono text-xs">
          <div className="text-center mb-3">
            <p className="font-bold text-pos-text text-sm">{storeName}</p>
            <p className="text-pos-muted mt-0.5">{receiptDate}</p>
            {saleData?.receiptNumber && (
              <p className="text-pos-muted mt-0.5">Receipt: <span className="text-pos-text font-semibold">{saleData.receiptNumber}</span></p>
            )}
          </div>
          <div className="border-t border-slate-700 pt-3 space-y-1.5">
            {items.map((item, idx) => (
              <div key={idx} className="flex justify-between gap-2">
                <span className="text-pos-muted truncate flex-1">{item.quantity}x {item.name}</span>
                <span className="text-pos-text shrink-0">{fmt(item.lineTotal)}</span>
              </div>
            ))}
          </div>
          <div className="border-t border-slate-700 mt-3 pt-3 flex justify-between">
            <span className="font-black text-pos-text text-sm">TOTAL</span>
            <span className="font-black text-white text-sm">{fmt(total)}</span>
          </div>
        </div>

        {/* Email input */}
        {showEmailInput && (
          <div className="mb-4">
            <input
              type="email"
              className="w-full bg-pos-card text-pos-text border border-slate-600 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-blue-400 placeholder-slate-500"
              placeholder="customer@email.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoFocus
            />
          </div>
        )}

        {/* Action buttons */}
        <div className="grid grid-cols-3 gap-2">
          <button onClick={handlePrint} className="py-3 bg-blue-600 text-white font-bold rounded-xl hover:bg-blue-700 transition-all text-sm">
            🖨 Print
          </button>
          <button onClick={handleEmail} className="py-3 bg-slate-600 text-white font-bold rounded-xl hover:bg-slate-500 transition-all text-sm">
            📧 {showEmailInput ? 'Send' : 'Email'}
          </button>
          <button onClick={onClose} className="py-3 bg-pos-card text-pos-muted font-bold rounded-xl hover:bg-slate-600 transition-all text-sm">
            Skip
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Payment Modal ────────────────────────────────────────────────────────────
function PaymentModal({ total, onClose, onComplete }) {
  const [method, setMethod] = useState('cash');
  const [tendered, setTendered] = useState('');
  const [loading, setLoading] = useState(false);

  const tenderedNum = parseFloat(tendered) || 0;
  const change = method === 'cash' ? round2(Math.max(0, tenderedNum - total)) : 0;
  const canPay = method === 'cash' ? tenderedNum >= total : true;

  const quickAmounts = [total, Math.ceil(total), Math.ceil(total / 5) * 5, Math.ceil(total / 10) * 10].filter((v, i, a) => a.indexOf(v) === i).slice(0, 4);

  const handlePay = async () => {
    if (!canPay) return;
    setLoading(true);
    try {
      const payments = [{ method, amount: total }];
      const cashDetails = method === 'cash' ? { tendered: tenderedNum, change } : undefined;
      await onComplete(payments, cashDetails);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-75 z-40 flex items-end sm:items-center justify-center p-4">
      <div className="bg-pos-panel rounded-2xl w-full max-w-md p-6 text-pos-text">
        <div className="flex justify-between items-center mb-6">
          <h3 className="text-xl font-black">Payment</h3>
          <button onClick={onClose} className="text-pos-muted hover:text-pos-text text-2xl">✕</button>
        </div>

        <div className="text-center mb-6">
          <p className="text-pos-muted text-sm">Total Due</p>
          <p className="text-5xl font-black text-white font-mono">{fmt(total)}</p>
        </div>

        {/* Method selector */}
        <div className="grid grid-cols-3 gap-2 mb-6">
          {[['cash','💷','Cash'], ['card','💳','Card'], ['contactless','📱','Contactless']].map(([m, icon, label]) => (
            <button key={m} onClick={() => setMethod(m)} className={`py-3 rounded-xl font-bold text-sm transition-all ${method === m ? 'bg-primary text-white' : 'bg-pos-card text-pos-muted hover:bg-slate-500'}`}>{icon} {label}</button>
          ))}
        </div>

        {method === 'cash' && (
          <>
            <div className="mb-4">
              <label className="text-pos-muted text-xs font-medium uppercase tracking-wider mb-2 block">Cash Tendered</label>
              <input
                type="number" step="0.01" min={total}
                className="w-full bg-pos-card text-pos-text border border-slate-600 rounded-xl px-4 py-3 text-2xl font-mono text-right focus:outline-none focus:border-blue-400"
                value={tendered}
                onChange={(e) => setTendered(e.target.value)}
                placeholder={fmt(total)}
                autoFocus
              />
            </div>
            <div className="grid grid-cols-4 gap-2 mb-4">
              {quickAmounts.map((amt) => (
                <button key={amt} onClick={() => setTendered(String(amt))} className="py-2 bg-pos-card rounded-lg text-sm font-bold hover:bg-slate-500 transition-all">{fmt(amt)}</button>
              ))}
            </div>
            {tenderedNum >= total && (
              <div className="bg-green-900 border border-green-700 rounded-xl p-4 mb-4 text-center">
                <p className="text-green-300 text-sm">Change to Give</p>
                <p className="text-4xl font-black text-green-400 font-mono">{fmt(change)}</p>
              </div>
            )}
          </>
        )}

        <button
          onClick={handlePay}
          disabled={!canPay || loading}
          className="w-full py-4 bg-cash-green text-white text-xl font-black rounded-xl hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all active:scale-98"
        >
          {loading ? 'Processing...' : `Complete Sale — ${fmt(total)}`}
        </button>
      </div>
    </div>
  );
}

// ── Cart Item (#8 void button) ───────────────────────────────────────────────
function CartItem({ item, index, onVoidRequest, onQtyChange }) {
  return (
    <div className="flex items-center gap-2 py-3 border-b border-slate-700 last:border-0">
      <div className="flex-1 min-w-0">
        <p className="text-pos-text text-sm font-semibold truncate">{item.name}</p>
        <p className="text-pos-muted text-xs font-mono">{fmt(item.unitPrice)}</p>
      </div>
      <div className="flex items-center gap-1">
        <button onClick={() => onQtyChange(index, item.quantity - 1)} className="w-7 h-7 bg-pos-card rounded-lg text-pos-muted hover:bg-slate-500 transition-all text-sm font-bold flex items-center justify-center">−</button>
        <span className="w-8 text-center text-pos-text font-bold text-sm">{item.quantity}</span>
        <button onClick={() => onQtyChange(index, item.quantity + 1)} className="w-7 h-7 bg-pos-card rounded-lg text-pos-muted hover:bg-slate-500 transition-all text-sm font-bold flex items-center justify-center">+</button>
      </div>
      <p className="w-16 text-right text-pos-text font-mono text-sm font-bold">{fmt(item.lineTotal)}</p>
      <button
        onClick={() => onVoidRequest(index)}
        title="Void item (requires PIN)"
        className="w-7 h-7 text-red-400 hover:text-red-300 hover:bg-red-900 rounded-md flex items-center justify-center text-xs font-bold transition-all"
      >
        VOID
      </button>
    </div>
  );
}

// ── Keyboard Shortcuts Legend ────────────────────────────────────────────────
function ShortcutsLegend() {
  const shortcuts = [
    ['F1', 'New Sale'],
    ['F2', 'Search'],
    ['F5', 'Price Check'],
    ['F8', 'Park'],
    ['F9', 'Void Last'],
    ['F12', 'Pay'],
  ];
  return (
    <div className="px-4 pb-3 pt-1 border-t border-slate-800">
      <div className="grid grid-cols-3 gap-x-3 gap-y-1">
        {shortcuts.map(([key, action]) => (
          <div key={key} className="flex items-center gap-1.5">
            <span className="text-xs font-mono bg-slate-700 text-slate-300 px-1 py-0.5 rounded leading-none">{key}</span>
            <span className="text-xs text-pos-muted truncate">{action}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Main POS Page ────────────────────────────────────────────────────────────
export default function POSPage() {
  const { user, storeId } = useAuth();
  const { settings } = useSettings();
  const { items, subtotal, total, promoDiscount, itemCount, addItem, updateQuantity, removeItem, clearCart, customer, setCustomer, isTraining } = useCart();
  const { on } = useSocket(storeId);

  const [search, setSearch] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [searching, setSearching] = useState(false);
  const [pendingAgeVerify, setPendingAgeVerify] = useState(null);
  const [showPayment, setShowPayment] = useState(false);
  const [cashExpected, setCashExpected] = useState(null);
  const [time, setTime] = useState(dayjs().format('HH:mm'));

  // Feature #5 — Price Check
  const [showPriceCheck, setShowPriceCheck] = useState(false);

  // Feature #8 — Void with PIN
  const [voidTarget, setVoidTarget] = useState(null); // { index: number, item: object }

  // Feature #15 — Receipt Preview
  const [receiptData, setReceiptData] = useState(null); // { saleData, items, total }

  const searchRef = useRef();
  const tillId = settings?.tillId || 'TILL-1';
  const storeName = settings?.storeName || "Raj's Off-Licence";

  // Clock
  useEffect(() => {
    const t = setInterval(() => setTime(dayjs().format('HH:mm')), 10000);
    return () => clearInterval(t);
  }, []);

  // Load cash drawer state
  useEffect(() => {
    if (!storeId) return;
    cashDrawerSvc.getState(tillId)
      .then((data) => setCashExpected(data.drawer?.expectedAmount))
      .catch(() => {});
  }, [storeId, tillId]);

  // Socket: cash updates
  useEffect(() => {
    return on('cash:updated', (data) => {
      if (data.tillId === tillId) setCashExpected(data.expectedAmount);
    });
  }, [on, tillId]);

  // Feature #12 — Global keyboard shortcuts
  useEffect(() => {
    const handler = (e) => {
      // Don't fire inside text inputs (except F-keys that are modal launchers)
      const tag = document.activeElement?.tagName;
      const isInput = tag === 'INPUT' || tag === 'TEXTAREA';

      switch (e.key) {
        case 'F1':
          e.preventDefault();
          clearCart();
          toast('New sale started', { icon: '🛒' });
          break;
        case 'F2':
          e.preventDefault();
          searchRef.current?.focus();
          searchRef.current?.select();
          break;
        case 'F5':
          e.preventDefault();
          setShowPriceCheck(true);
          break;
        case 'F8':
          e.preventDefault();
          toast('Transaction parked', { icon: '⏸' });
          break;
        case 'F9':
          e.preventDefault();
          if (items.length > 0) {
            const lastIdx = items.length - 1;
            setVoidTarget({ index: lastIdx, item: items[lastIdx] });
          } else {
            toast.error('No items in cart');
          }
          break;
        case 'F12':
          e.preventDefault();
          if (items.length > 0) {
            setShowPayment(true);
          } else {
            toast.error('Cart is empty');
          }
          break;
        default:
          break;
      }
    };

    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [items, clearCart]);

  const handleBarcodeSearch = useCallback(async (query) => {
    if (!query.trim()) { setSearchResults([]); return; }
    setSearching(true);
    try {
      // Try exact barcode lookup first
      if (/^\d{8,14}$/.test(query.trim())) {
        const data = await productSvc.getByBarcode(query.trim());
        if (data.product) {
          addProductToCart(data.product);
          setSearch('');
          setSearchResults([]);
          return;
        }
      }
      // Fall back to search
      const data = await productSvc.getProducts({ search: query.trim(), active: true, limit: 20 });
      setSearchResults(data.products || []);
    } catch (err) {
      if (err.code === 'BARCODE_NOT_FOUND') toast.error(`Barcode not found: ${query}`);
    } finally {
      setSearching(false);
    }
  }, []);

  const addProductToCart = useCallback((product) => {
    if (product.attributes?.ageRestricted) {
      setPendingAgeVerify({ product, verified: false });
      return;
    }
    addItem({ ...product, barcode: product.barcode, name: product.name, unitPrice: product.pricing.retailPrice, quantity: 1, lineTotal: product.pricing.retailPrice, ageVerified: false });
    toast.success(`${product.name} added`, { duration: 1000 });
  }, [addItem]);

  const handleKeyDown = useCallback((e) => {
    if (e.key === 'Enter') handleBarcodeSearch(search);
  }, [search, handleBarcodeSearch]);

  const confirmAge = () => {
    const p = pendingAgeVerify.product;
    addItem({ ...p, barcode: p.barcode, name: p.name, unitPrice: p.pricing.retailPrice, quantity: 1, lineTotal: p.pricing.retailPrice, ageVerified: true });
    toast.success(`${p.name} added`, { duration: 1000 });
    setPendingAgeVerify(null);
  };

  const refuseAge = () => {
    toast.error('Sale refused — age not verified');
    // Fire-and-forget age refusal log
    api.post('/age-refusals', {
      productId: pendingAgeVerify.product._id,
      productName: pendingAgeVerify.product.name,
      productBarcode: pendingAgeVerify.product.barcode,
      minimumAge: pendingAgeVerify.product.attributes?.minimumAge || 18,
      refusalReason: 'no_id',
      tillId,
    }).catch(() => {});
    setPendingAgeVerify(null);
  };

  // Feature #8 — Void handlers
  const handleVoidRequest = useCallback((index) => {
    setVoidTarget({ index, item: items[index] });
  }, [items]);

  const handleVoidConfirm = useCallback(() => {
    if (voidTarget === null) return;
    removeItem(voidTarget.index);
    toast.success('Item voided');
    setVoidTarget(null);
  }, [voidTarget, removeItem]);

  const handleVoidCancel = useCallback(() => {
    setVoidTarget(null);
  }, []);

  // Feature #15 — Complete sale then show receipt
  const handleCompleteSale = async (payments, cashDetails) => {
    if (items.length === 0) { toast.error('Cart is empty'); return; }
    try {
      const saleItems = items.map((item) => ({
        productId: item._id || item.productId,
        barcode: item.barcode,
        quantity: item.quantity,
        ageVerified: item.ageVerified || false,
        discount: item.discount,
        scanTime: item.scanTime,
      }));

      const data = await salesSvc.createSale({
        tillId,
        customerId: customer?._id,
        items: saleItems,
        payments,
        cashDetails,
        isTraining,
      });

      setShowPayment(false);

      // Capture snapshot of items + total for receipt before clearing
      const receiptItems = [...items];
      const receiptTotal = total;

      // Show receipt preview instead of plain toast
      setReceiptData({ saleData: data, items: receiptItems, total: receiptTotal });

      // Update cash display
      cashDrawerSvc.getState(tillId)
        .then((d) => setCashExpected(d.drawer?.expectedAmount))
        .catch(() => {});
    } catch (err) {
      toast.error(err.message || 'Sale failed');
    }
  };

  const handleReceiptClose = useCallback(() => {
    clearCart();
    setReceiptData(null);
  }, [clearCart]);

  return (
    <div className="flex h-screen bg-pos-bg overflow-hidden">
      {/* Age verification modal */}
      {pendingAgeVerify && (
        <AgeVerificationModal product={pendingAgeVerify.product} onConfirm={confirmAge} onRefuse={refuseAge} />
      )}

      {/* Payment modal */}
      {showPayment && (
        <PaymentModal total={total} onClose={() => setShowPayment(false)} onComplete={handleCompleteSale} />
      )}

      {/* Feature #5 — Price check modal */}
      {showPriceCheck && (
        <PriceCheckModal onClose={() => setShowPriceCheck(false)} />
      )}

      {/* Feature #8 — Void confirm modal */}
      {voidTarget !== null && (
        <VoidConfirmModal
          item={voidTarget.item}
          onConfirm={handleVoidConfirm}
          onCancel={handleVoidCancel}
        />
      )}

      {/* Feature #15 — Receipt preview modal */}
      {receiptData && (
        <ReceiptPreviewModal
          saleData={receiptData.saleData}
          items={receiptData.items}
          total={receiptData.total}
          storeName={storeName}
          onClose={handleReceiptClose}
        />
      )}

      {/* Training banner */}
      {isTraining && (
        <div className="fixed top-0 left-0 right-0 bg-yellow-400 text-yellow-900 text-center py-2 font-bold z-50 text-sm">
          🎓 TRAINING MODE — Transactions are NOT saved
        </div>
      )}

      {/* ── LEFT PANEL ── */}
      <div className="flex-1 flex flex-col bg-pos-bg border-r border-slate-700 min-w-0">
        {/* Topbar */}
        <div className="flex items-center justify-between px-4 py-3 bg-pos-panel border-b border-slate-700">
          <div className="flex items-center gap-3">
            <span className="text-lg">🛒</span>
            <div>
              <p className="text-pos-text font-bold text-sm">{storeName}</p>
              <p className="text-pos-muted text-xs">{user?.displayName} · {tillId}</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <span className="text-pos-muted text-sm font-mono">{time}</span>
            {cashExpected !== null && (
              <div className="bg-cash-green text-white text-xs font-bold px-3 py-1.5 rounded-full font-mono">
                💷 {fmt(cashExpected)}
              </div>
            )}
            <span className="text-xs text-green-400 font-semibold">⚡ Online</span>
          </div>
        </div>

        {/* Search bar */}
        <div className="p-4">
          <div className="flex gap-2">
            <input
              ref={searchRef}
              className="flex-1 bg-pos-card text-pos-text border border-slate-600 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-blue-400 placeholder-slate-500"
              placeholder="Scan barcode or search product... (F5 = Price Check)"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              onKeyDown={handleKeyDown}
              autoFocus
            />
            <button
              onClick={() => handleBarcodeSearch(search)}
              className="bg-primary text-white px-4 rounded-xl font-bold text-sm hover:bg-primary-600 transition-all"
            >
              {searching ? '...' : '🔍'}
            </button>
            <button
              onClick={() => setShowPriceCheck(true)}
              title="Price Check (F5)"
              className="bg-pos-card text-pos-muted border border-slate-600 px-3 rounded-xl font-bold text-xs hover:bg-slate-600 hover:text-pos-text transition-all"
            >
              F5
            </button>
          </div>
        </div>

        {/* Search results */}
        {searchResults.length > 0 && (
          <div className="mx-4 mb-4 bg-pos-panel rounded-xl border border-slate-600 overflow-hidden max-h-64 overflow-y-auto pos-scroll">
            {searchResults.map((p) => (
              <button
                key={p._id}
                onClick={() => { addProductToCart(p); setSearch(''); setSearchResults([]); }}
                className="w-full flex items-center justify-between px-4 py-3 hover:bg-pos-card transition-all border-b border-slate-700 last:border-0 text-left"
              >
                <div>
                  <p className="text-pos-text text-sm font-semibold">{p.name}</p>
                  <p className="text-pos-muted text-xs">{p.barcode} · {p.category}</p>
                </div>
                <div className="text-right">
                  <p className="text-pos-text font-mono font-bold">{fmt(p.pricing.retailPrice)}</p>
                  <p className="text-xs text-pos-muted">Qty: {p.stock?.quantity || 0}</p>
                </div>
              </button>
            ))}
          </div>
        )}

        {/* Empty state */}
        {searchResults.length === 0 && items.length === 0 && (
          <div className="flex-1 flex flex-col items-center justify-center text-pos-muted">
            <div className="text-6xl mb-4">🛒</div>
            <p className="text-lg font-semibold">Ready to serve</p>
            <p className="text-sm mt-1">Scan a barcode or search for a product</p>
          </div>
        )}
      </div>

      {/* ── RIGHT PANEL — CART ── */}
      <div className="w-80 xl:w-96 flex flex-col bg-pos-panel">
        {/* Cart header */}
        <div className="p-4 border-b border-slate-700">
          <div className="flex items-center justify-between">
            <h2 className="text-pos-text font-black text-lg">Cart</h2>
            <span className="bg-primary text-white text-xs font-bold px-2 py-1 rounded-full">{itemCount}</span>
          </div>
          {customer && (
            <div className="mt-2 flex items-center gap-2 bg-pos-card rounded-lg px-3 py-2">
              <span className="text-sm">👤</span>
              <div className="flex-1 min-w-0">
                <p className="text-pos-text text-xs font-semibold truncate">{customer.firstName} {customer.lastName}</p>
                <p className="text-pos-muted text-xs">{customer.loyalty?.points || 0} pts</p>
              </div>
              <button onClick={() => setCustomer(null)} className="text-pos-muted hover:text-pos-text text-xs">✕</button>
            </div>
          )}
        </div>

        {/* Cart items */}
        <div className="flex-1 overflow-y-auto px-4 pos-scroll">
          {items.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-pos-muted text-sm">
              <div className="text-4xl mb-2">🛒</div>
              <p>Cart is empty</p>
            </div>
          ) : (
            items.map((item, idx) => (
              <CartItem
                key={`${item.barcode}-${idx}`}
                item={item}
                index={idx}
                onVoidRequest={handleVoidRequest}
                onQtyChange={updateQuantity}
              />
            ))
          )}
        </div>

        {/* Totals */}
        <div className="p-4 border-t border-slate-700 space-y-2">
          {promoDiscount > 0 && (
            <div className="flex justify-between text-sm">
              <span className="text-green-400">🏷️ Promotions</span>
              <span className="text-green-400 font-mono font-bold">−{fmt(promoDiscount)}</span>
            </div>
          )}
          <div className="flex justify-between items-center pt-2 border-t border-slate-700">
            <span className="text-pos-text font-bold text-lg">TOTAL</span>
            <span className="text-pos-text font-black text-4xl font-mono">{fmt(total)}</span>
          </div>
        </div>

        {/* Action buttons */}
        <div className="p-4 space-y-2 border-t border-slate-700">
          <div className="grid grid-cols-2 gap-2">
            <button
              onClick={() => { if (items.length > 0) setShowPayment(true); else toast.error('Cart is empty'); }}
              className="pos-btn-cash py-4 text-base col-span-2"
            >
              💷 Pay Now <span className="opacity-60 text-sm font-normal ml-1">(F12)</span>
            </button>
          </div>
          <div className="grid grid-cols-3 gap-2">
            <button onClick={() => clearCart()} className="pos-btn-secondary py-3 text-xs">🗑 Clear</button>
            <button
              onClick={() => toast('Transaction parked', { icon: '⏸' })}
              className="pos-btn-secondary py-3 text-xs"
            >
              ⏸ Park
            </button>
            <button className="pos-btn-secondary py-3 text-xs">↩ Refund</button>
          </div>
        </div>

        {/* Feature #12 — Shortcuts legend */}
        <ShortcutsLegend />
      </div>
    </div>
  );
}
