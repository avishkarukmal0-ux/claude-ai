import React, { useState, useEffect, useRef, useCallback } from 'react';
import api from '../services/api';
import toast from 'react-hot-toast';
import dayjs from 'dayjs';
import { Wifi, ShoppingCart, CreditCard, CheckCircle, XCircle, AlertTriangle, HelpCircle, Loader2, X, Minus, Plus } from 'lucide-react';

const MANAGER_PIN = '1234';

// ── NFC Wave animation (CSS-in-JS) ────────────────────────────────────────────
const nfcStyles = `
@keyframes nfcWave {
  0%   { transform: scale(0.6); opacity: 0.8; }
  100% { transform: scale(2.2); opacity: 0; }
}
.nfc-ring {
  position: absolute;
  border-radius: 9999px;
  border: 3px solid #22c55e;
  animation: nfcWave 2s ease-out infinite;
}
.nfc-ring:nth-child(2) { animation-delay: 0.6s; }
.nfc-ring:nth-child(3) { animation-delay: 1.2s; }
@keyframes ageFlash {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.6; }
}
.age-flash { animation: ageFlash 1s ease-in-out infinite; }
@keyframes checkPop {
  0% { transform: scale(0); opacity: 0; }
  70% { transform: scale(1.2); }
  100% { transform: scale(1); opacity: 1; }
}
.check-pop { animation: checkPop 0.5s ease-out forwards; }
`;

// ── PIN Modal ─────────────────────────────────────────────────────────────────
function PinModal({ title, onSuccess, onCancel }) {
  const [pin, setPin] = useState('');
  const [error, setError] = useState('');

  const handleDigit = d => {
    if (pin.length >= 4) return;
    const next = pin + d;
    setPin(next);
    if (next.length === 4) {
      if (next === MANAGER_PIN) {
        onSuccess();
      } else {
        setError('Incorrect PIN');
        setTimeout(() => { setPin(''); setError(''); }, 800);
      }
    }
  };

  const handleBackspace = () => setPin(p => p.slice(0, -1));

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80">
      <div className="bg-gray-900 rounded-3xl p-8 w-80 text-center">
        <h2 className="text-white text-xl font-bold mb-2">{title || 'Manager PIN Required'}</h2>
        <p className="text-gray-400 text-sm mb-6">Enter 4-digit PIN to continue</p>

        <div className="flex justify-center gap-3 mb-6">
          {[0, 1, 2, 3].map(i => (
            <div
              key={i}
              className={`w-4 h-4 rounded-full border-2 transition-all ${
                pin.length > i ? 'bg-green-400 border-green-400' : 'border-gray-500'
              }`}
            />
          ))}
        </div>

        {error && <p className="text-red-400 text-sm mb-3">{error}</p>}

        <div className="grid grid-cols-3 gap-3 mb-4">
          {['1','2','3','4','5','6','7','8','9','','0','⌫'].map((d, i) => (
            <button
              key={i}
              onClick={() => d === '⌫' ? handleBackspace() : d ? handleDigit(d) : null}
              disabled={!d && d !== '0'}
              className={`py-4 rounded-2xl text-xl font-bold transition-all ${
                d
                  ? 'bg-gray-700 text-white hover:bg-gray-600 active:scale-95'
                  : 'invisible'
              }`}
            >
              {d}
            </button>
          ))}
        </div>

        {onCancel && (
          <button onClick={onCancel} className="text-gray-500 text-sm hover:text-gray-400">
            Cancel
          </button>
        )}
      </div>
    </div>
  );
}

// ── Main Component ────────────────────────────────────────────────────────────
export default function SelfCheckoutPage() {
  const [activated, setActivated] = useState(false);
  const [showActivatePin, setShowActivatePin] = useState(true);
  const [showDeactivatePin, setShowDeactivatePin] = useState(false);
  const [state, setState] = useState('idle'); // idle|scanning|age_check|payment|complete|error
  const [cart, setCart] = useState([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [searching, setSearching] = useState(false);
  const [paymentProcessing, setPaymentProcessing] = useState(false);
  const [saleId, setSaleId] = useState(null);
  const [countdown, setCountdown] = useState(10);
  const [ageItem, setAgeItem] = useState(null);
  const [time, setTime] = useState(dayjs());
  const searchRef = useRef(null);
  const countdownRef = useRef(null);
  const searchTimeout = useRef(null);

  // Tick clock
  useEffect(() => {
    const t = setInterval(() => setTime(dayjs()), 1000);
    return () => clearInterval(t);
  }, []);

  // Auto-return to idle after complete
  useEffect(() => {
    if (state === 'complete') {
      setCountdown(10);
      countdownRef.current = setInterval(() => {
        setCountdown(c => {
          if (c <= 1) {
            clearInterval(countdownRef.current);
            resetToIdle();
            return 0;
          }
          return c - 1;
        });
      }, 1000);
    }
    return () => clearInterval(countdownRef.current);
  }, [state]);

  // Focus search when in scanning state
  useEffect(() => {
    if (state === 'scanning' && searchRef.current) {
      searchRef.current.focus();
    }
  }, [state]);

  // Poll for age check approval
  useEffect(() => {
    if (state !== 'age_check') return;
    const poll = setInterval(async () => {
      try {
        const res = await api.get('/pos/self-checkout/age-check-status');
        if (res?.approved) {
          clearInterval(poll);
          setAgeItem(null);
          setState('scanning');
          toast.success('Age verified by staff');
        }
      } catch {
        // ignore poll errors
      }
    }, 2000);
    return () => clearInterval(poll);
  }, [state]);

  const resetToIdle = () => {
    setCart([]);
    setSearchQuery('');
    setSaleId(null);
    setState('idle');
  };

  const handleStartShopping = () => {
    setState('scanning');
  };

  const handleSearch = async query => {
    if (!query.trim()) return;
    setSearching(true);
    try {
      const res = await api.get(`/products?search=${encodeURIComponent(query.trim())}&active=true&limit=5`);
      const products = Array.isArray(res) ? res : (res.products || res.data || []);
      if (products.length === 0) {
        toast.error('Item not found');
        return;
      }
      const product = products[0];
      addToCart(product);
      setSearchQuery('');
    } catch {
      toast.error('Search failed — please try again');
    } finally {
      setSearching(false);
    }
  };

  const addToCart = product => {
    if (product.ageRestricted) {
      setAgeItem(product);
      setState('age_check');
      // still add to cart, staff will verify
    }
    setCart(prev => {
      const existing = prev.findIndex(i => i._id === product._id);
      if (existing >= 0) {
        return prev.map((item, idx) =>
          idx === existing ? { ...item, qty: item.qty + 1 } : item
        );
      }
      return [...prev, { ...product, qty: 1 }];
    });
  };

  const updateQty = (id, delta) => {
    setCart(prev =>
      prev
        .map(item => item._id === id ? { ...item, qty: item.qty + delta } : item)
        .filter(item => item.qty > 0)
    );
  };

  const removeItem = id => setCart(prev => prev.filter(i => i._id !== id));

  const total = cart.reduce((sum, item) => sum + (item.retailPrice || 0) * item.qty, 0);

  const handlePay = async () => {
    if (cart.length === 0) return;
    setState('payment');
  };

  const handleConfirmPayment = async () => {
    setPaymentProcessing(true);
    try {
      const res = await api.post('/pos/self-checkout/pay', {
        items: cart.map(item => ({
          productId: item._id,
          name: item.name,
          qty: item.qty,
          unitPrice: item.retailPrice,
          total: item.retailPrice * item.qty,
        })),
        total,
        paymentMethod: 'card',
      });
      setSaleId(res?.saleId || res?._id || 'SC-' + Date.now());
      setState('complete');
    } catch {
      setState('error');
    } finally {
      setPaymentProcessing(false);
    }
  };

  const handleStaffHelp = () => {
    toast('Staff assistance requested', { icon: '🔔', duration: 5000 });
  };

  const handleAgeApproved = () => {
    setAgeItem(null);
    setState('scanning');
  };

  if (!activated) {
    return (
      <>
        <style>{nfcStyles}</style>
        {showActivatePin && (
          <PinModal
            title="Activate Self-Checkout"
            onSuccess={() => { setActivated(true); setShowActivatePin(false); setState('idle'); }}
            onCancel={null}
          />
        )}
      </>
    );
  }

  return (
    <>
      <style>{nfcStyles}</style>
      <div className="fixed inset-0 bg-[#0F172A] flex flex-col overflow-hidden select-none">

        {/* Top Bar */}
        <div className="flex items-center justify-between px-6 py-3 bg-[#1E293B] border-b border-white/10">
          <div className="flex items-center gap-3">
            <ShoppingCart className="text-green-400" size={22} />
            <span className="text-white font-black text-lg tracking-wide">SELF CHECKOUT</span>
          </div>
          <div className="text-white/60 text-lg font-mono">{time.format('HH:mm')}</div>
          <button
            onClick={() => setShowDeactivatePin(true)}
            className="text-white/30 hover:text-white/60 text-xs px-3 py-1.5 rounded-lg border border-white/10 hover:border-white/30 transition-all"
          >
            Staff Exit
          </button>
        </div>

        {/* ── IDLE STATE ─────────────────────────────────────────────── */}
        {state === 'idle' && (
          <div className="flex-1 flex flex-col items-center justify-center gap-8 px-6">
            <div className="text-center">
              <div className="w-40 h-40 rounded-full bg-white/5 border-2 border-white/10 flex items-center justify-center mx-auto mb-6 hover:bg-white/10 transition-all cursor-pointer active:scale-95"
                onClick={handleStartShopping}>
                <ShoppingCart size={64} className="text-white/40" />
              </div>
              <h1 className="text-white text-5xl font-black mb-3">TAP TO START</h1>
              <p className="text-white/40 text-xl">Scan your items to begin</p>
            </div>
            <button
              onClick={handleStartShopping}
              className="bg-green-500 hover:bg-green-400 text-white text-2xl font-black py-8 px-20 rounded-3xl active:scale-95 transition-all shadow-2xl"
            >
              START SHOPPING
            </button>
            <button
              onClick={handleStaffHelp}
              className="flex items-center gap-3 border-2 border-yellow-500/50 text-yellow-400 text-xl font-bold py-4 px-10 rounded-2xl hover:bg-yellow-500/10 transition-all"
            >
              <HelpCircle size={24} /> STAFF HELP
            </button>
          </div>
        )}

        {/* ── SCANNING STATE ─────────────────────────────────────────── */}
        {state === 'scanning' && (
          <div className="flex-1 flex flex-col overflow-hidden">
            {/* Search bar */}
            <div className="p-4 bg-[#1E293B]/50 border-b border-white/10">
              <div className="flex gap-3">
                <div className="flex-1 relative">
                  <input
                    ref={searchRef}
                    className="w-full bg-white/10 border border-white/20 text-white text-xl placeholder-white/30 rounded-2xl px-6 py-4 focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent"
                    placeholder="Scan barcode or type item name…"
                    value={searchQuery}
                    onChange={e => setSearchQuery(e.target.value)}
                    onKeyDown={e => {
                      if (e.key === 'Enter') handleSearch(searchQuery);
                    }}
                    autoComplete="off"
                  />
                  {searching && (
                    <Loader2 size={20} className="absolute right-5 top-1/2 -translate-y-1/2 text-white/50 animate-spin" />
                  )}
                </div>
                <button
                  onClick={() => handleSearch(searchQuery)}
                  disabled={!searchQuery.trim() || searching}
                  className="bg-green-600 text-white rounded-2xl px-6 text-lg font-bold hover:bg-green-500 disabled:opacity-30 transition-all"
                >
                  Add
                </button>
              </div>
            </div>

            {/* Cart items */}
            <div className="flex-1 overflow-y-auto p-4 space-y-3">
              {cart.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-full text-white/20">
                  <ShoppingCart size={64} className="mb-4" />
                  <p className="text-2xl font-bold">Scan your first item</p>
                </div>
              ) : (
                cart.map(item => (
                  <div key={item._id} className="bg-[#1E293B] rounded-2xl p-4 flex items-center gap-4 border border-white/10">
                    <div className="flex-1 min-w-0">
                      <p className="text-white text-xl font-bold truncate">{item.name}</p>
                      <p className="text-white/50 text-base">£{Number(item.retailPrice).toFixed(2)} each</p>
                      {item.ageRestricted && (
                        <span className="inline-block mt-1 bg-red-900 text-red-300 text-xs font-bold px-2 py-0.5 rounded-full">18+</span>
                      )}
                    </div>
                    <div className="flex items-center gap-3">
                      <button
                        onClick={() => updateQty(item._id, -1)}
                        className="w-10 h-10 rounded-full bg-white/10 text-white flex items-center justify-center hover:bg-white/20 active:scale-90 transition-all text-xl font-bold"
                      >
                        <Minus size={18} />
                      </button>
                      <span className="text-white text-2xl font-black w-8 text-center">{item.qty}</span>
                      <button
                        onClick={() => updateQty(item._id, 1)}
                        className="w-10 h-10 rounded-full bg-white/10 text-white flex items-center justify-center hover:bg-white/20 active:scale-90 transition-all"
                      >
                        <Plus size={18} />
                      </button>
                    </div>
                    <div className="text-right w-24">
                      <p className="text-white text-xl font-black">£{(item.retailPrice * item.qty).toFixed(2)}</p>
                    </div>
                    <button
                      onClick={() => removeItem(item._id)}
                      className="w-10 h-10 rounded-full bg-red-900/40 text-red-400 flex items-center justify-center hover:bg-red-900/60 transition-all"
                    >
                      <X size={18} />
                    </button>
                  </div>
                ))
              )}
            </div>

            {/* Bottom panel */}
            <div className="p-4 bg-[#1E293B] border-t border-white/10">
              <div className="flex items-center justify-between mb-4">
                <div>
                  <p className="text-white/50 text-sm">{cart.reduce((s, i) => s + i.qty, 0)} items</p>
                  <p className="text-green-400 text-5xl font-black">£{total.toFixed(2)}</p>
                </div>
                <div className="flex flex-col gap-2">
                  <button
                    onClick={handlePay}
                    disabled={cart.length === 0}
                    className="bg-green-500 hover:bg-green-400 disabled:opacity-30 text-white text-2xl font-black py-5 px-10 rounded-2xl active:scale-95 transition-all"
                  >
                    PAY NOW
                  </button>
                  <button
                    onClick={handleStaffHelp}
                    className="flex items-center justify-center gap-2 border border-yellow-500/40 text-yellow-400 font-bold py-2 px-6 rounded-xl hover:bg-yellow-500/10 text-sm"
                  >
                    <HelpCircle size={16} /> Staff Help
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ── AGE CHECK STATE ────────────────────────────────────────── */}
        {state === 'age_check' && (
          <div className="flex-1 flex flex-col items-center justify-center bg-red-950 text-center px-8 age-flash">
            <div className="mb-6">
              <AlertTriangle size={80} className="text-red-400 mx-auto mb-4" />
              <h1 className="text-white text-4xl font-black mb-3">AGE VERIFICATION REQUIRED</h1>
              <p className="text-red-200 text-xl">
                {ageItem ? `"${ageItem.name}" requires age verification` : 'This item requires age verification'}
              </p>
            </div>
            <div className="bg-red-900/60 rounded-3xl p-8 max-w-md w-full mb-8 border border-red-700">
              <p className="text-white text-2xl font-bold mb-2">Please wait</p>
              <p className="text-red-200 text-lg">A member of staff will assist you shortly</p>
            </div>
            <button
              onClick={handleStaffHelp}
              className="flex items-center gap-3 bg-yellow-500 text-black text-xl font-black py-5 px-12 rounded-2xl hover:bg-yellow-400 active:scale-95 transition-all mb-4"
            >
              <HelpCircle size={24} /> CALL STAFF NOW
            </button>
            {/* Dev override */}
            {import.meta.env.DEV && (
              <button
                onClick={handleAgeApproved}
                className="text-white/30 text-sm hover:text-white/50 underline mt-2"
              >
                [DEV] Simulate Age Approved
              </button>
            )}
          </div>
        )}

        {/* ── PAYMENT STATE ──────────────────────────────────────────── */}
        {state === 'payment' && (
          <div className="flex-1 flex flex-col items-center justify-center gap-8 px-6">
            <div className="text-center mb-4">
              <p className="text-white/50 text-xl mb-2">Total to pay</p>
              <p className="text-green-400 text-7xl font-black">£{total.toFixed(2)}</p>
            </div>

            <div className="relative flex items-center justify-center w-48 h-48">
              <div className="nfc-ring w-24 h-24" />
              <div className="nfc-ring w-24 h-24" />
              <div className="nfc-ring w-24 h-24" />
              <div className="relative z-10 w-24 h-24 rounded-full bg-[#1E293B] border-2 border-green-500 flex items-center justify-center">
                <CreditCard size={36} className="text-green-400" />
              </div>
            </div>

            <div className="text-center">
              <p className="text-white text-2xl font-bold mb-2">Tap, insert or swipe your card</p>
              <p className="text-white/40 text-lg">Please present your payment card to the reader</p>
            </div>

            {paymentProcessing ? (
              <div className="flex items-center gap-3 text-white/70 text-lg">
                <Loader2 size={24} className="animate-spin" />
                Processing payment…
              </div>
            ) : (
              <div className="flex flex-col gap-3 w-full max-w-xs">
                <button
                  onClick={handleConfirmPayment}
                  className="bg-green-500 hover:bg-green-400 text-white text-xl font-black py-6 px-8 rounded-2xl active:scale-95 transition-all"
                >
                  CONFIRM PAYMENT
                </button>
                <button
                  onClick={() => setState('scanning')}
                  className="border border-white/20 text-white/60 font-bold py-3 px-8 rounded-xl hover:bg-white/5"
                >
                  Cancel Payment
                </button>
              </div>
            )}
          </div>
        )}

        {/* ── COMPLETE STATE ─────────────────────────────────────────── */}
        {state === 'complete' && (
          <div className="flex-1 flex flex-col items-center justify-center gap-6 px-6 text-center">
            <div className="check-pop">
              <CheckCircle size={100} className="text-green-400 mx-auto" />
            </div>
            <div>
              <h1 className="text-white text-5xl font-black mb-3">Payment Complete!</h1>
              <p className="text-green-300 text-2xl">Thank you for shopping with us</p>
              {saleId && (
                <p className="text-white/40 text-base mt-3">Receipt: {saleId}</p>
              )}
            </div>
            <div className="bg-[#1E293B] rounded-2xl p-6 border border-white/10 w-full max-w-sm">
              <p className="text-white/50 text-sm mb-1">Amount paid</p>
              <p className="text-green-400 text-4xl font-black">£{total.toFixed(2)}</p>
            </div>
            <p className="text-white/30 text-lg">Returning to start in <span className="text-white/60 font-bold">{countdown}s</span></p>
            <button
              onClick={resetToIdle}
              className="bg-blue-600 hover:bg-blue-500 text-white font-bold py-4 px-10 rounded-2xl text-lg active:scale-95 transition-all"
            >
              Done
            </button>
          </div>
        )}

        {/* ── ERROR STATE ────────────────────────────────────────────── */}
        {state === 'error' && (
          <div className="flex-1 flex flex-col items-center justify-center gap-6 px-6 text-center">
            <XCircle size={80} className="text-red-400" />
            <div>
              <h1 className="text-white text-4xl font-black mb-3">Payment Failed</h1>
              <p className="text-red-300 text-xl">Something went wrong. Please try again or ask for staff help.</p>
            </div>
            <div className="flex gap-4">
              <button
                onClick={() => setState('payment')}
                className="bg-blue-600 text-white font-bold py-4 px-8 rounded-2xl text-lg hover:bg-blue-500"
              >
                Try Again
              </button>
              <button
                onClick={handleStaffHelp}
                className="border-2 border-yellow-500/50 text-yellow-400 font-bold py-4 px-8 rounded-2xl text-lg hover:bg-yellow-500/10"
              >
                Staff Help
              </button>
            </div>
          </div>
        )}

        {/* Always-visible staff help button (bottom right) */}
        {state !== 'idle' && state !== 'age_check' && (
          <div className="absolute bottom-6 left-6 right-6 pointer-events-none flex justify-end">
            <button
              onClick={handleStaffHelp}
              className="pointer-events-auto flex items-center gap-2 bg-yellow-500/20 border border-yellow-500/40 text-yellow-400 font-bold py-3 px-5 rounded-xl text-sm hover:bg-yellow-500/30"
            >
              <HelpCircle size={16} /> Need help? Press here
            </button>
          </div>
        )}
      </div>

      {showDeactivatePin && (
        <PinModal
          title="Staff Exit"
          onSuccess={() => { setActivated(false); setShowDeactivatePin(false); setShowActivatePin(true); resetToIdle(); }}
          onCancel={() => setShowDeactivatePin(false)}
        />
      )}
    </>
  );
}
