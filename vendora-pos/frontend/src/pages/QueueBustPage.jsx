import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../services/api';
import toast from 'react-hot-toast';
import { useCart } from '../context/CartContext';
import { useAuth } from '../context/AuthContext';
import {
  Search, X, Minus, Plus, CreditCard, CheckCircle, Loader2,
  QrCode, AlertTriangle, ShoppingCart, Zap
} from 'lucide-react';

const nfcStyles = `
@keyframes tapPulse {
  0%, 100% { opacity: 1; transform: scale(1); }
  50% { opacity: 0.6; transform: scale(1.05); }
}
.tap-pulse { animation: tapPulse 1.5s ease-in-out infinite; }
@keyframes nfcExpand {
  0%   { transform: scale(0.5); opacity: 0.9; }
  100% { transform: scale(2.5); opacity: 0; }
}
.nfc-wave {
  position: absolute;
  border-radius: 9999px;
  border: 2px solid #22c55e;
  animation: nfcExpand 2s ease-out infinite;
}
.nfc-wave:nth-child(2) { animation-delay: 0.7s; }
.nfc-wave:nth-child(3) { animation-delay: 1.4s; }
`;

function ConfirmExitModal({ onConfirm, onCancel }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
      <div className="bg-[#1E293B] rounded-2xl p-6 w-full max-w-sm text-center border border-white/10">
        <AlertTriangle size={40} className="text-yellow-400 mx-auto mb-3" />
        <h3 className="text-white text-xl font-bold mb-2">Exit Queue Bust?</h3>
        <p className="text-white/50 text-sm mb-6">The current till session will end. Any unsaved cart will be cleared.</p>
        <div className="flex gap-3">
          <button onClick={onCancel} className="flex-1 border border-white/20 text-white font-semibold py-3 rounded-xl hover:bg-white/5">
            Stay
          </button>
          <button onClick={onConfirm} className="flex-1 bg-red-600 text-white font-bold py-3 rounded-xl hover:bg-red-700">
            Exit
          </button>
        </div>
      </div>
    </div>
  );
}

function QRModal({ saleId, onClose }) {
  const [qrUrl, setQrUrl] = useState(null);

  useEffect(() => {
    if (!saleId) return;
    api.get(`/receipts/qr/${saleId}`)
      .then(res => setQrUrl(res?.qrCodeUrl || res?.qr || null))
      .catch(() => {});
  }, [saleId]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4">
      <div className="bg-[#1E293B] rounded-3xl p-8 w-full max-w-xs text-center border border-white/10">
        <QrCode size={32} className="text-white/60 mx-auto mb-3" />
        <h3 className="text-white text-xl font-bold mb-2">Digital Receipt</h3>
        <p className="text-white/40 text-sm mb-4">Scan to get your receipt</p>
        {qrUrl ? (
          <img src={qrUrl} alt="Receipt QR" className="w-48 h-48 mx-auto rounded-xl bg-white p-2" />
        ) : (
          <div className="w-48 h-48 mx-auto rounded-xl bg-white/10 flex items-center justify-center">
            <p className="text-white/30 text-sm">QR not available</p>
          </div>
        )}
        <p className="text-white/30 text-xs mt-3 mb-6">Sale ref: {saleId}</p>
        <button onClick={onClose} className="w-full bg-white/10 text-white font-bold py-3 rounded-xl hover:bg-white/20">
          Close
        </button>
      </div>
    </div>
  );
}

export default function QueueBustPage() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [cart, setCart] = useState([]);
  const [search, setSearch] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [searching, setSearching] = useState(false);
  const [showPayment, setShowPayment] = useState(false);
  const [paymentProcessing, setPaymentProcessing] = useState(false);
  const [paymentDone, setPaymentDone] = useState(false);
  const [tillId, setTillId] = useState('MOBILE-...');
  const tillIdRef = useRef(null); // ref so cleanup closure always has current tillId
  const [isActive, setIsActive] = useState(false);
  const [showExitConfirm, setShowExitConfirm] = useState(false);
  const [lastSaleId, setLastSaleId] = useState(null);
  const [showQR, setShowQR] = useState(false);
  const searchRef = useRef(null);
  const searchTimeout = useRef(null);

  // Start session on mount
  useEffect(() => {
    const startSession = async () => {
      try {
        const res = await api.post('/pos/queue-bust/start');
        const id = res?.tillId || `MOBILE-${Math.random().toString(36).slice(2, 6).toUpperCase()}`;
        tillIdRef.current = id;
        setTillId(id);
        setIsActive(true);
      } catch {
        const fallback = `MOBILE-${Math.random().toString(36).slice(2, 6).toUpperCase()}`;
        tillIdRef.current = fallback;
        setTillId(fallback);
        setIsActive(true);
      }
    };
    startSession();

    return () => {
      if (tillIdRef.current) {
        api.post('/pos/queue-bust/end', { tillId: tillIdRef.current }).catch(() => {});
      }
    };
  }, []);

  // Search products
  useEffect(() => {
    if (!search.trim()) { setSearchResults([]); return; }
    clearTimeout(searchTimeout.current);
    searchTimeout.current = setTimeout(async () => {
      setSearching(true);
      try {
        const res = await api.get(`/products?search=${encodeURIComponent(search.trim())}&active=true&limit=12`);
        const list = Array.isArray(res) ? res : (res.products || res.data || []);
        setSearchResults(list);
      } catch {
        setSearchResults([]);
      } finally {
        setSearching(false);
      }
    }, 300);
    return () => clearTimeout(searchTimeout.current);
  }, [search]);

  const addToCart = useCallback(product => {
    setCart(prev => {
      const idx = prev.findIndex(i => i._id === product._id);
      if (idx >= 0) {
        const updated = [...prev];
        updated[idx] = { ...updated[idx], qty: updated[idx].qty + 1 };
        return updated;
      }
      return [...prev, { ...product, qty: 1 }];
    });
    setSearch('');
    setSearchResults([]);
    if (searchRef.current) searchRef.current.focus();
  }, []);

  const updateQty = (id, delta) => {
    setCart(prev =>
      prev
        .map(item => item._id === id ? { ...item, qty: item.qty + delta } : item)
        .filter(item => item.qty > 0)
    );
  };

  const removeItem = id => setCart(prev => prev.filter(i => i._id !== id));

  const total = cart.reduce((sum, item) => sum + (item.retailPrice || 0) * item.qty, 0);
  const itemCount = cart.reduce((s, i) => s + i.qty, 0);

  const handlePayment = async () => {
    setPaymentProcessing(true);
    try {
      const res = await api.post('/sales', {
        items: cart.map(item => ({
          productId: item._id,
          name: item.name,
          qty: item.qty,
          unitPrice: item.retailPrice,
          vatRate: item.vatRate || 20,
          total: item.retailPrice * item.qty,
        })),
        total,
        paymentMethod: 'card',
        tillId,
        staffId: user?._id,
      });
      setLastSaleId(res?.saleId || res?._id || null);
      setPaymentDone(true);
    } catch (err) {
      toast.error(err?.response?.data?.message || 'Payment failed');
    } finally {
      setPaymentProcessing(false);
    }
  };

  const handleNewCustomer = () => {
    setCart([]);
    setSearch('');
    setSearchResults([]);
    setShowPayment(false);
    setPaymentDone(false);
    setLastSaleId(null);
    if (searchRef.current) searchRef.current.focus();
  };

  const handleExit = async () => {
    try {
      await api.post('/pos/queue-bust/end', { tillId });
    } catch {}
    navigate('/pos');
  };

  return (
    <>
      <style>{nfcStyles}</style>
      <div className="fixed inset-0 bg-[#0F172A] flex flex-col overflow-hidden">

        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 bg-[#1E293B] border-b border-white/10 shrink-0">
          <div className="flex items-center gap-3">
            <Zap size={20} className="text-yellow-400" />
            <div>
              <p className="text-white font-black text-sm leading-none">QUEUE BUST</p>
              <p className="text-white/40 text-xs font-mono">{tillId}</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            {itemCount > 0 && (
              <span className="bg-green-600 text-white text-xs font-bold px-2 py-1 rounded-full">
                {itemCount} item{itemCount !== 1 ? 's' : ''}
              </span>
            )}
            <button
              onClick={() => setShowExitConfirm(true)}
              className="border border-white/20 text-white/60 text-sm font-semibold px-3 py-1.5 rounded-lg hover:bg-white/5"
            >
              Exit
            </button>
          </div>
        </div>

        {/* Search */}
        <div className="p-3 bg-[#1E293B]/50 border-b border-white/10 shrink-0">
          <div className="relative">
            <Search size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-white/40" />
            <input
              ref={searchRef}
              className="w-full bg-white/10 border border-white/20 text-white text-lg placeholder-white/30 rounded-xl pl-11 pr-4 py-3 focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="Scan barcode or search product…"
              value={search}
              onChange={e => setSearch(e.target.value)}
              onKeyDown={e => {
                if (e.key === 'Enter' && searchResults.length > 0) {
                  addToCart(searchResults[0]);
                }
              }}
              autoFocus
              autoComplete="off"
            />
            {searching && (
              <Loader2 size={16} className="absolute right-4 top-1/2 -translate-y-1/2 text-white/40 animate-spin" />
            )}
          </div>

          {searchResults.length > 0 && (
            <div className="mt-2 bg-[#0F172A] rounded-xl border border-white/10 overflow-hidden">
              {searchResults.slice(0, 6).map(p => (
                <button
                  key={p._id}
                  onClick={() => addToCart(p)}
                  className="w-full flex items-center justify-between px-4 py-3 hover:bg-white/5 border-b border-white/5 last:border-0 text-left"
                >
                  <div className="min-w-0 flex-1">
                    <p className="text-white font-semibold truncate">{p.name}</p>
                    <p className="text-white/40 text-xs">{p.barcode || p.category}</p>
                  </div>
                  <div className="text-green-400 font-black text-lg ml-3">
                    £{Number(p.retailPrice).toFixed(2)}
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Cart */}
        <div className="flex-1 overflow-y-auto p-3 space-y-2">
          {cart.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-white/20 py-12">
              <ShoppingCart size={56} className="mb-3" />
              <p className="text-xl font-bold">Scan first item</p>
              <p className="text-sm mt-1">Use the search bar above</p>
            </div>
          ) : (
            cart.map(item => (
              <div key={item._id} className="bg-[#1E293B] rounded-xl p-3 flex items-center gap-3 border border-white/10">
                <div className="flex-1 min-w-0">
                  <p className="text-white font-bold truncate">{item.name}</p>
                  <p className="text-white/40 text-sm">£{Number(item.retailPrice).toFixed(2)} each</p>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => updateQty(item._id, -1)}
                    className="w-8 h-8 rounded-full bg-white/10 text-white flex items-center justify-center hover:bg-white/20"
                  >
                    <Minus size={14} />
                  </button>
                  <span className="text-white font-black text-lg w-6 text-center">{item.qty}</span>
                  <button
                    onClick={() => updateQty(item._id, 1)}
                    className="w-8 h-8 rounded-full bg-white/10 text-white flex items-center justify-center hover:bg-white/20"
                  >
                    <Plus size={14} />
                  </button>
                </div>
                <div className="w-16 text-right">
                  <p className="text-white font-black">£{(item.retailPrice * item.qty).toFixed(2)}</p>
                </div>
                <button
                  onClick={() => removeItem(item._id)}
                  className="w-8 h-8 rounded-full bg-red-900/30 text-red-400 flex items-center justify-center hover:bg-red-900/50 ml-1"
                >
                  <X size={14} />
                </button>
              </div>
            ))
          )}
        </div>

        {/* Total & Pay */}
        <div className="p-4 bg-[#1E293B] border-t border-white/10 shrink-0">
          <div className="flex items-center justify-between mb-3">
            <div>
              <p className="text-white/40 text-sm">{itemCount} items</p>
              <p className="text-green-400 text-4xl font-black">£{total.toFixed(2)}</p>
            </div>
            <button
              onClick={() => setShowPayment(true)}
              disabled={cart.length === 0}
              className="flex items-center gap-2 bg-green-600 disabled:opacity-30 text-white text-xl font-black py-5 px-8 rounded-2xl hover:bg-green-500 active:scale-95 transition-all"
            >
              <CreditCard size={22} /> PAY BY CARD
            </button>
          </div>
        </div>

        {/* Payment Modal */}
        {showPayment && !paymentDone && (
          <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/80 p-4">
            <div className="bg-[#1E293B] rounded-3xl p-8 w-full max-w-sm text-center border border-white/10">
              <p className="text-white/50 text-base mb-1">Total</p>
              <p className="text-green-400 text-5xl font-black mb-8">£{total.toFixed(2)}</p>

              <div className="relative flex items-center justify-center w-36 h-36 mx-auto mb-6">
                <div className="nfc-wave w-16 h-16" />
                <div className="nfc-wave w-16 h-16" />
                <div className="nfc-wave w-16 h-16" />
                <div className="relative z-10 w-16 h-16 rounded-full bg-[#0F172A] border-2 border-green-500 flex items-center justify-center tap-pulse">
                  <CreditCard size={28} className="text-green-400" />
                </div>
              </div>

              <p className="text-white text-xl font-bold mb-1">Tap card on reader</p>
              <p className="text-white/40 text-sm mb-8">Or insert / swipe card</p>

              {paymentProcessing ? (
                <div className="flex items-center justify-center gap-2 text-white/70">
                  <Loader2 size={20} className="animate-spin" />
                  Processing…
                </div>
              ) : (
                <div className="space-y-3">
                  <button
                    onClick={handlePayment}
                    className="w-full bg-green-600 hover:bg-green-500 text-white font-black py-4 rounded-2xl text-lg active:scale-95 transition-all"
                  >
                    Confirm Payment
                  </button>
                  <button
                    onClick={() => setShowPayment(false)}
                    className="w-full border border-white/20 text-white/60 font-semibold py-3 rounded-xl hover:bg-white/5"
                  >
                    Cancel
                  </button>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Payment Complete */}
        {paymentDone && (
          <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/90 p-4">
            <div className="bg-[#1E293B] rounded-3xl p-8 w-full max-w-sm text-center border border-green-500/30">
              <CheckCircle size={64} className="text-green-400 mx-auto mb-4" />
              <h2 className="text-white text-3xl font-black mb-2">Payment Complete!</h2>
              <p className="text-green-300 text-lg mb-1">£{total.toFixed(2)} received</p>
              {lastSaleId && (
                <p className="text-white/30 text-sm mb-6">Ref: {lastSaleId}</p>
              )}
              <div className="space-y-3">
                {lastSaleId && (
                  <button
                    onClick={() => setShowQR(true)}
                    className="w-full flex items-center justify-center gap-2 border border-white/20 text-white font-semibold py-3 rounded-xl hover:bg-white/5"
                  >
                    <QrCode size={18} /> Send QR Receipt
                  </button>
                )}
                <button
                  onClick={handleNewCustomer}
                  className="w-full bg-blue-600 hover:bg-blue-500 text-white font-black py-4 rounded-2xl text-lg active:scale-95 transition-all"
                >
                  Next Customer
                </button>
              </div>
            </div>
          </div>
        )}

        {showExitConfirm && (
          <ConfirmExitModal
            onConfirm={handleExit}
            onCancel={() => setShowExitConfirm(false)}
          />
        )}

        {showQR && (
          <QRModal saleId={lastSaleId} onClose={() => setShowQR(false)} />
        )}
      </div>
    </>
  );
}
