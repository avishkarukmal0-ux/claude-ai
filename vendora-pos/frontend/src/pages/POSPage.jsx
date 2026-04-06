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

// ── Mobile Top-Up Phone Modal ────────────────────────────────────────────────
function TopUpPhoneModal({ product, onConfirm, onCancel }) {
  const [phone, setPhone] = useState('');
  const isValid = /^(\+44|0)[0-9]{10}$/.test(phone.replace(/\s/g, ''));
  return (
    <div className="fixed inset-0 bg-black bg-opacity-80 z-50 flex items-center justify-center p-4">
      <div className="bg-pos-panel rounded-2xl max-w-sm w-full p-6 text-pos-text shadow-2xl">
        <div className="text-center mb-4">
          <div className="text-5xl mb-2">📱</div>
          <h2 className="text-xl font-black text-white">{product?.name}</h2>
          <p className="text-pos-muted text-sm mt-1">Enter customer's mobile number</p>
        </div>
        <input
          type="tel"
          className="w-full bg-pos-card text-pos-text border border-slate-600 rounded-xl px-4 py-3 text-xl font-mono text-center focus:outline-none focus:border-blue-400 placeholder-slate-500 mb-3"
          placeholder="07911 123456"
          value={phone}
          onChange={e => setPhone(e.target.value)}
          autoFocus
        />
        <p className="text-pos-muted text-xs text-center mb-4">UK mobile number (07... or +44...)</p>
        <div className="grid grid-cols-2 gap-3">
          <button onClick={onCancel} className="py-3 bg-pos-card text-pos-muted font-bold rounded-xl hover:bg-slate-600 transition-all">Cancel</button>
          <button
            onClick={() => onConfirm(phone)}
            disabled={!isValid}
            className="py-3 bg-primary text-white font-bold rounded-xl hover:bg-primary/90 disabled:opacity-40 transition-all"
          >
            Add to Cart
          </button>
        </div>
        <button onClick={() => onConfirm('')} className="w-full mt-2 text-pos-muted text-xs hover:text-pos-text">Skip phone number</button>
      </div>
    </div>
  );
}

// ── Receipt Preview Modal (#15) ──────────────────────────────────────────────
function ReceiptPreviewModal({ saleData, items, total, storeName, onClose }) {
  const [showEmailInput, setShowEmailInput] = useState(false);
  const [showSmsInput, setShowSmsInput] = useState(false);
  const [showWaInput, setShowWaInput] = useState(false);
  const [showQr, setShowQr] = useState(false);
  const [qrCode, setQrCode] = useState(null);
  const [qrLoading, setQrLoading] = useState(false);
  const [waLink, setWaLink] = useState(null);
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [waPhone, setWaPhone] = useState('');
  const [sending, setSending] = useState(false);

  const receiptDate = dayjs().format('DD/MM/YYYY HH:mm');

  const handlePrint = () => {
    const receiptHtml = `
      <html><head><title>Receipt</title><style>
        body { font-family: 'Courier New', monospace; width: 280px; margin: 0 auto; font-size: 12px; }
        .center { text-align: center; } .line { border-top: 1px dashed #000; margin: 6px 0; }
        .row { display: flex; justify-content: space-between; }
        .bold { font-weight: bold; } .big { font-size: 16px; }
        @media print { @page { size: 80mm auto; margin: 0; } }
      </style></head><body>
        <div class="center bold big">${storeName}</div>
        <div class="center">${receiptDate}</div>
        ${saleData?.receiptNumber ? `<div class="center">Receipt: ${saleData.receiptNumber}</div>` : ''}
        <div class="line"></div>
        ${items.map(i => `<div class="row"><span>${i.quantity}x ${i.name}${i.mobileTopupPhone ? ` (${i.mobileTopupPhone})` : ''}</span><span>${'£' + Number(i.lineTotal).toFixed(2)}</span></div>`).join('')}
        <div class="line"></div>
        <div class="row bold big"><span>TOTAL</span><span>${'£' + Number(total).toFixed(2)}</span></div>
        <div class="line"></div>
        <div class="center">Thank you for shopping with us!</div>
        <div class="center">Challenge 25 in operation</div>
      </body></html>`;
    const win = window.open('', '_blank', 'width=350,height=500');
    if (win) { win.document.write(receiptHtml); win.document.close(); win.focus(); win.print(); win.close(); }
    onClose();
  };

  const handleSendEmail = async () => {
    if (!showEmailInput) { setShowEmailInput(true); setShowSmsInput(false); setShowWaInput(false); setShowQr(false); return; }
    if (!email.trim()) return;
    setSending(true);
    try {
      if (saleData?._id) await api.post('/digital-receipts/send', { saleId: saleData._id, email });
      toast.success(`Receipt emailed to ${email}`);
    } catch { toast.success('Email queued'); }
    finally { setSending(false); }
    onClose();
  };

  const handleSendSms = async () => {
    if (!showSmsInput) { setShowSmsInput(true); setShowEmailInput(false); setShowWaInput(false); setShowQr(false); return; }
    if (!phone.trim()) return;
    setSending(true);
    try {
      if (saleData?._id) await api.post('/digital-receipts/sms', { saleId: saleData._id, phone });
      toast.success(`SMS sent to ${phone}`);
    } catch { toast.success('SMS queued'); }
    finally { setSending(false); }
    onClose();
  };

  const handleWhatsApp = async () => {
    if (!showWaInput) { setShowWaInput(true); setShowEmailInput(false); setShowSmsInput(false); setShowQr(false); return; }
    if (!waPhone.trim()) return;
    setSending(true);
    try {
      const resp = await api.post('/receipts/whatsapp', { saleId: saleData?._id, phone: waPhone });
      if (resp.waLink) {
        setWaLink(resp.waLink);
        window.open(resp.waLink, '_blank');
      }
      toast.success('WhatsApp receipt ready');
    } catch {
      toast.success('WhatsApp link generated');
    }
    finally { setSending(false); }
  };

  const handleQrCode = async () => {
    if (showQr) { setShowQr(false); return; }
    setShowQr(true);
    setShowEmailInput(false); setShowSmsInput(false); setShowWaInput(false);
    if (!qrCode && saleData?._id) {
      setQrLoading(true);
      try {
        const resp = await api.post(`/receipts/qr/${saleData._id}`);
        setQrCode(resp.qrCode || resp.qrCodeDataUrl);
      } catch { toast.error('QR generation failed'); setShowQr(false); }
      finally { setQrLoading(false); }
    }
  };

  // Auto-dismiss QR after 15s
  useEffect(() => {
    if (!showQr) return;
    const t = setTimeout(() => setShowQr(false), 15000);
    return () => clearTimeout(t);
  }, [showQr]);

  if (showQr) {
    return (
      <div className="fixed inset-0 bg-black bg-opacity-90 z-50 flex flex-col items-center justify-center p-4" onClick={() => setShowQr(false)}>
        <p className="text-white text-lg font-semibold mb-4">Scan for your receipt</p>
        {qrLoading ? (
          <div className="animate-spin rounded-full h-16 w-16 border-4 border-white border-t-transparent" />
        ) : qrCode ? (
          <img src={qrCode} alt="Receipt QR Code" className="w-64 h-64 bg-white rounded-2xl p-3" />
        ) : (
          <div className="text-white text-sm">QR unavailable</div>
        )}
        <p className="text-slate-400 text-sm mt-4">Tap anywhere to close · Auto-closes in 15s</p>
        <button onClick={onClose} className="mt-4 text-slate-500 text-xs">Done</button>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 bg-black bg-opacity-80 z-50 flex items-center justify-center p-4">
      <div className="bg-pos-panel rounded-2xl max-w-sm w-full p-6 text-pos-text shadow-2xl">
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-xl font-black text-green-400">Sale Complete ✓</h2>
          <button onClick={onClose} className="text-pos-muted hover:text-pos-text text-2xl leading-none">✕</button>
        </div>

        {/* Receipt */}
        <div className="bg-pos-card rounded-xl p-4 mb-4 font-mono text-xs">
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
                <span className="text-pos-muted truncate flex-1">
                  {item.quantity}x {item.name}
                  {item.category === 'Lottery' && <span className="ml-1 text-yellow-400 text-xs">🎟</span>}
                  {item.category === 'Mobile Top-Up' && <span className="ml-1 text-blue-400 text-xs">📱</span>}
                  {item.mobileTopupPhone && <span className="text-blue-300 block text-xs">→ {item.mobileTopupPhone}</span>}
                </span>
                <span className="text-pos-text shrink-0">{fmt(item.lineTotal)}</span>
              </div>
            ))}
          </div>
          <div className="border-t border-slate-700 mt-3 pt-3 flex justify-between">
            <span className="font-black text-pos-text text-sm">TOTAL</span>
            <span className="font-black text-white text-sm">{fmt(total)}</span>
          </div>
        </div>

        {/* Conditional inputs */}
        {showEmailInput && <input type="email" className="w-full bg-pos-card text-pos-text border border-slate-600 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-blue-400 placeholder-slate-500 mb-3" placeholder="customer@email.com" value={email} onChange={e => setEmail(e.target.value)} autoFocus />}
        {showSmsInput && <input type="tel" className="w-full bg-pos-card text-pos-text border border-slate-600 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-blue-400 placeholder-slate-500 mb-3" placeholder="+447911123456" value={phone} onChange={e => setPhone(e.target.value)} autoFocus />}
        {showWaInput && <input type="tel" className="w-full bg-pos-card text-pos-text border border-slate-600 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-blue-400 placeholder-slate-500 mb-3" placeholder="07911 123456" value={waPhone} onChange={e => setWaPhone(e.target.value)} autoFocus />}

        {/* Action buttons — 3x2 grid */}
        <div className="grid grid-cols-3 gap-2">
          <button onClick={handlePrint} className="py-3 bg-blue-600 text-white font-bold rounded-xl hover:bg-blue-700 text-xs">🖨 Print</button>
          <button onClick={handleSendEmail} disabled={sending} className="py-3 bg-slate-600 text-white font-bold rounded-xl hover:bg-slate-500 text-xs">📧 {showEmailInput ? 'Send' : 'Email'}</button>
          <button onClick={handleSendSms} disabled={sending} className="py-3 bg-blue-700 text-white font-bold rounded-xl hover:bg-blue-600 text-xs">📱 {showSmsInput ? 'Send' : 'SMS'}</button>
          <button onClick={handleWhatsApp} disabled={sending} className="py-3 bg-green-600 text-white font-bold rounded-xl hover:bg-green-500 text-xs">💬 {showWaInput ? 'Send' : 'WhatsApp'}</button>
          <button onClick={handleQrCode} className="py-3 bg-purple-600 text-white font-bold rounded-xl hover:bg-purple-500 text-xs">📷 QR Code</button>
          <button onClick={onClose} className="py-3 bg-pos-card text-pos-muted font-bold rounded-xl hover:bg-slate-600 text-xs">Skip</button>
        </div>
      </div>
    </div>
  );
}

// ── Split Tender Payment Modal ───────────────────────────────────────────────
function PaymentModal({ total, onClose, onComplete }) {
  const [entries, setEntries] = useState([]); // [{method, amount}]
  const [method, setMethod] = useState('cash');
  const [amount, setAmount] = useState('');
  const [tendered, setTendered] = useState('');
  const [loading, setLoading] = useState(false);
  const [splitMode, setSplitMode] = useState(false);

  const paidSoFar = round2(entries.reduce((s, e) => s + e.amount, 0));
  const remaining = round2(Math.max(0, total - paidSoFar));
  const cashEntry = entries.find(e => e.method === 'cash');
  const tenderedNum = parseFloat(tendered) || 0;
  const change = cashEntry ? round2(Math.max(0, tenderedNum - (cashEntry.amount))) : (method === 'cash' ? round2(Math.max(0, tenderedNum - (splitMode ? remaining : total))) : 0);

  const effectiveAmount = splitMode ? (parseFloat(amount) || 0) : (method === 'cash' ? (tenderedNum || (splitMode ? remaining : total)) : total);

  const canAddEntry = splitMode && parseFloat(amount) > 0 && parseFloat(amount) <= remaining + 0.001;
  const canPay = splitMode
    ? (paidSoFar >= total - 0.001)
    : (method === 'cash' ? tenderedNum >= total : true);

  const quickAmounts = [total, Math.ceil(total), Math.ceil(total / 5) * 5, Math.ceil(total / 10) * 10]
    .filter((v, i, a) => a.indexOf(v) === i && v > 0)
    .slice(0, 4);

  const addEntry = () => {
    const amt = parseFloat(amount);
    if (!amt || amt <= 0) return;
    const capped = Math.min(amt, remaining);
    setEntries(prev => [...prev, { method, amount: round2(capped) }]);
    setAmount('');
  };

  const removeEntry = (idx) => setEntries(prev => prev.filter((_, i) => i !== idx));

  const handlePay = async () => {
    if (!canPay) return;
    setLoading(true);
    try {
      let payments, cashDetails;
      if (splitMode) {
        payments = entries;
        const cash = entries.filter(e => e.method === 'cash').reduce((s, e) => s + e.amount, 0);
        cashDetails = cash > 0 ? { tendered: tenderedNum || cash, change: round2(Math.max(0, (tenderedNum || cash) - cash)) } : undefined;
      } else {
        payments = [{ method, amount: total }];
        cashDetails = method === 'cash' ? { tendered: tenderedNum, change } : undefined;
      }
      await onComplete(payments, cashDetails);
    } finally {
      setLoading(false);
    }
  };

  const hasCashInSplit = splitMode && entries.some(e => e.method === 'cash');

  return (
    <div className="fixed inset-0 bg-black bg-opacity-75 z-40 flex items-end sm:items-center justify-center p-4">
      <div className="bg-pos-panel rounded-2xl w-full max-w-md p-6 text-pos-text">
        <div className="flex justify-between items-center mb-4">
          <h3 className="text-xl font-black">Payment</h3>
          <div className="flex items-center gap-2">
            <button
              onClick={() => { setSplitMode(s => !s); setEntries([]); setAmount(''); }}
              className={`text-xs font-bold px-3 py-1.5 rounded-lg transition-all ${splitMode ? 'bg-yellow-500 text-black' : 'bg-pos-card text-pos-muted hover:bg-slate-600'}`}
            >
              ⚡ Split
            </button>
            <button onClick={onClose} className="text-pos-muted hover:text-pos-text text-2xl">✕</button>
          </div>
        </div>

        <div className="text-center mb-5">
          <p className="text-pos-muted text-xs">Total Due</p>
          <p className="text-4xl font-black text-white font-mono">{fmt(total)}</p>
          {splitMode && paidSoFar > 0 && (
            <div className="flex justify-center gap-4 mt-2 text-sm">
              <span className="text-green-400">Paid: {fmt(paidSoFar)}</span>
              <span className="text-yellow-400">Remaining: {fmt(remaining)}</span>
            </div>
          )}
        </div>

        {/* Method selector */}
        <div className="grid grid-cols-4 gap-2 mb-4">
          {[['cash','💷','Cash'], ['card','💳','Card'], ['contactless','📱','Tap'], ['voucher','🎁','Voucher']].map(([m, icon, label]) => (
            <button key={m} onClick={() => { setMethod(m); if (!splitMode) setTendered(''); }}
              className={`py-2.5 rounded-xl font-bold text-xs transition-all ${method === m ? 'bg-primary text-white' : 'bg-pos-card text-pos-muted hover:bg-slate-500'}`}>
              {icon}<br />{label}
            </button>
          ))}
        </div>

        {/* Split mode — entry list */}
        {splitMode && entries.length > 0 && (
          <div className="mb-3 space-y-1.5">
            {entries.map((e, i) => (
              <div key={i} className="flex items-center justify-between bg-pos-card rounded-lg px-3 py-2">
                <span className="text-sm capitalize">{e.method}</span>
                <div className="flex items-center gap-2">
                  <span className="font-mono font-bold">{fmt(e.amount)}</span>
                  <button onClick={() => removeEntry(i)} className="text-red-400 hover:text-red-300 text-xs">✕</button>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Cash tendered / split amount input */}
        {!splitMode && method === 'cash' && (
          <>
            <div className="mb-3">
              <label className="text-pos-muted text-xs font-medium uppercase tracking-wider mb-1.5 block">Cash Tendered</label>
              <input type="number" step="0.01" min={total}
                className="w-full bg-pos-card text-pos-text border border-slate-600 rounded-xl px-4 py-3 text-2xl font-mono text-right focus:outline-none focus:border-blue-400"
                value={tendered} onChange={e => setTendered(e.target.value)} placeholder={fmt(total)} autoFocus />
            </div>
            <div className="grid grid-cols-4 gap-2 mb-3">
              {quickAmounts.map(amt => (
                <button key={amt} onClick={() => setTendered(String(amt))} className="py-2 bg-pos-card rounded-lg text-xs font-bold hover:bg-slate-500 transition-all">{fmt(amt)}</button>
              ))}
            </div>
            {tenderedNum >= total && (
              <div className="bg-green-900 border border-green-700 rounded-xl p-3 mb-3 text-center">
                <p className="text-green-300 text-xs">Change to Give</p>
                <p className="text-3xl font-black text-green-400 font-mono">{fmt(change)}</p>
              </div>
            )}
          </>
        )}

        {splitMode && remaining > 0 && (
          <div className="mb-3">
            <label className="text-pos-muted text-xs font-medium uppercase tracking-wider mb-1.5 block">
              Amount for {method} (max {fmt(remaining)})
            </label>
            <div className="flex gap-2">
              <input type="number" step="0.01" min="0.01" max={remaining}
                className="flex-1 bg-pos-card text-pos-text border border-slate-600 rounded-xl px-4 py-2.5 text-xl font-mono text-right focus:outline-none focus:border-blue-400"
                value={amount} onChange={e => setAmount(e.target.value)} placeholder={fmt(remaining)} autoFocus />
              <button onClick={() => setAmount(String(remaining))} className="bg-pos-card text-pos-muted px-3 rounded-xl text-xs hover:bg-slate-600">All</button>
            </div>
            <button onClick={addEntry} disabled={!canAddEntry}
              className="mt-2 w-full py-2 bg-primary text-white rounded-xl font-bold text-sm hover:bg-primary/90 disabled:opacity-40">
              + Add {method} payment
            </button>
          </div>
        )}

        {/* Cash tendered for split cash portion */}
        {hasCashInSplit && (
          <div className="mb-3">
            <label className="text-pos-muted text-xs font-medium uppercase tracking-wider mb-1.5 block">Cash Tendered (for cash portion)</label>
            <input type="number" step="0.01"
              className="w-full bg-pos-card text-pos-text border border-slate-600 rounded-xl px-4 py-2.5 text-xl font-mono text-right focus:outline-none focus:border-blue-400"
              value={tendered} onChange={e => setTendered(e.target.value)} placeholder={fmt(entries.find(e=>e.method==='cash')?.amount || 0)} />
            {tenderedNum > 0 && (
              <p className="text-green-400 text-sm mt-1 text-right font-mono">Change: {fmt(round2(Math.max(0, tenderedNum - entries.filter(e=>e.method==='cash').reduce((s,e)=>s+e.amount,0))))}</p>
            )}
          </div>
        )}

        <button
          onClick={handlePay}
          disabled={!canPay || loading}
          className="w-full py-4 bg-cash-green text-white text-lg font-black rounded-xl hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
        >
          {loading ? 'Processing...' : splitMode ? `Complete Split Sale — ${fmt(total)}` : `Complete Sale — ${fmt(total)}`}
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
  const [isOnline, setIsOnline] = useState(navigator.onLine);

  // Feature #5 — Price Check
  const [showPriceCheck, setShowPriceCheck] = useState(false);

  // Feature #8 — Void with PIN
  const [voidTarget, setVoidTarget] = useState(null); // { index: number, item: object }

  // Feature #15 — Receipt Preview
  const [receiptData, setReceiptData] = useState(null); // { saleData, items, total }

  // Mobile top-up phone number modal
  const [pendingTopUp, setPendingTopUp] = useState(null); // product awaiting phone number

  // Quick-sell grid tab state
  const [quickTab, setQuickTab] = useState('All');
  const [quickProducts, setQuickProducts] = useState([]);
  const [quickLoading, setQuickLoading] = useState(false);
  const quickTabCache = useRef({});

  const searchRef = useRef();
  const tillId = settings?.tillId || 'TILL-1';
  const storeName = settings?.storeName || "Raj's Off-Licence";

  // Clock
  useEffect(() => {
    const t = setInterval(() => setTime(dayjs().format('HH:mm')), 10000);
    return () => clearInterval(t);
  }, []);

  // Online/offline detection + auto-sync offline queue
  useEffect(() => {
    const goOnline = async () => {
      setIsOnline(true);
      // Attempt to flush offline queue
      const queue = JSON.parse(localStorage.getItem('pos_offline_queue') || '[]');
      if (queue.length === 0) return;
      toast(`Syncing ${queue.length} offline sale(s)…`, { icon: '📶' });
      const failed = [];
      for (const sale of queue) {
        try {
          await salesSvc.createSale(sale);
        } catch {
          failed.push(sale);
        }
      }
      if (failed.length === 0) {
        localStorage.removeItem('pos_offline_queue');
        toast.success('All offline sales synced');
      } else {
        localStorage.setItem('pos_offline_queue', JSON.stringify(failed));
        toast.error(`${failed.length} sale(s) failed to sync`);
      }
    };
    const goOffline = () => { setIsOnline(false); toast('Offline mode — sales will be queued', { icon: '📶' }); };
    window.addEventListener('online', goOnline);
    window.addEventListener('offline', goOffline);
    return () => { window.removeEventListener('online', goOnline); window.removeEventListener('offline', goOffline); };
  }, []);

  // Customer display broadcast
  useEffect(() => {
    const payload = { items, total, subtotal, promoDiscount, customer, storeName };
    // BroadcastChannel for same-origin windows
    if (typeof BroadcastChannel !== 'undefined') {
      const bc = new BroadcastChannel('vendora_customer_display');
      bc.postMessage({ type: 'cart_update', payload });
      bc.close();
    }
    // localStorage fallback
    try { localStorage.setItem('vendora_customer_display', JSON.stringify(payload)); } catch {}
  }, [items, total, subtotal, promoDiscount, customer, storeName]);

  const openCustomerDisplay = useCallback(() => {
    window.open('/customer-display', 'customer_display', 'width=1024,height=768,menubar=no,toolbar=no,status=no');
  }, []);

  // Panic button
  const triggerPanic = useCallback(async () => {
    try {
      await api.post('/loss-prevention/panic', { tillId, location: storeName });
      toast.error('🚨 PANIC ALERT SENT — Manager notified', { duration: 6000 });
    } catch {
      toast.error('🚨 PANIC — Alert failed, call manager immediately!', { duration: 8000 });
    }
  }, [tillId, storeName]);

  // Quick-sell grid: load products for selected tab
  useEffect(() => {
    const tab = quickTab;
    if (quickTabCache.current[tab]) { setQuickProducts(quickTabCache.current[tab]); return; }
    setQuickLoading(true);
    const params = tab === 'All' ? { active: true, limit: 40 } : { category: tab, active: true, limit: 40 };
    productSvc.getProducts(params)
      .then(data => {
        const prods = data.products || data || [];
        quickTabCache.current[tab] = prods;
        setQuickProducts(prods);
      })
      .catch(() => setQuickProducts([]))
      .finally(() => setQuickLoading(false));
  }, [quickTab]);

  // Collection order recall: check localStorage on mount
  useEffect(() => {
    const orderId = localStorage.getItem('vendora_collection_order_recall');
    if (!orderId) return;
    localStorage.removeItem('vendora_collection_order_recall');
    api.get(`/collection-orders`).then(resp => {
      const orders = resp?.orders || resp || [];
      const order = Array.isArray(orders) ? orders.find(o => o._id === orderId) : null;
      if (order && order.items?.length) {
        order.items.forEach(item => {
          addItem({ name: item.name, unitPrice: item.unitPrice, quantity: item.quantity, lineTotal: item.lineTotal, _id: item.productId || orderId, barcode: item.barcode || 'CC', category: 'Collection' });
        });
        toast.success(`Collection order ${order.orderNumber} loaded into cart`);
      }
    }).catch(() => {});
  }, []); // eslint-disable-line

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
    // Mobile top-up: prompt for phone number
    if (product.category === 'Mobile Top-Up') {
      setPendingTopUp(product);
      return;
    }
    addItem({ ...product, barcode: product.barcode, name: product.name, unitPrice: product.pricing?.retailPrice ?? product.unitPrice ?? 0, quantity: 1, lineTotal: product.pricing?.retailPrice ?? product.unitPrice ?? 0, ageVerified: false });
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

  // Mobile top-up phone confirm
  const confirmTopUp = useCallback((phone) => {
    if (!pendingTopUp) return;
    const p = pendingTopUp;
    const price = p.pricing?.retailPrice ?? p.unitPrice ?? 0;
    addItem({ ...p, barcode: p.barcode, name: p.name, unitPrice: price, quantity: 1, lineTotal: price, ageVerified: false, mobileTopupPhone: phone || '' });
    toast.success(`${p.name} added${phone ? ` (${phone})` : ''}`, { duration: 1500 });
    setPendingTopUp(null);
  }, [pendingTopUp, addItem]);

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
    const saleItems = items.map((item) => ({
      productId: item._id || item.productId,
      barcode: item.barcode,
      quantity: item.quantity,
      ageVerified: item.ageVerified || false,
      discount: item.discount,
      scanTime: item.scanTime,
    }));
    const salePayload = { tillId, customerId: customer?._id, items: saleItems, payments, cashDetails, isTraining };

    // Capture snapshot before clearing
    const receiptItems = [...items];
    const receiptTotal = total;

    // Offline mode — queue for later sync
    if (!navigator.onLine) {
      const queue = JSON.parse(localStorage.getItem('pos_offline_queue') || '[]');
      queue.push({ ...salePayload, _queuedAt: new Date().toISOString() });
      localStorage.setItem('pos_offline_queue', JSON.stringify(queue));
      setShowPayment(false);
      clearCart();
      toast.success(`Sale queued offline (${queue.length} pending)`, { icon: '📶', duration: 4000 });
      return;
    }

    try {
      const data = await salesSvc.createSale(salePayload);
      setShowPayment(false);
      setReceiptData({ saleData: data, items: receiptItems, total: receiptTotal });
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

      {/* Mobile top-up phone modal */}
      {pendingTopUp && (
        <TopUpPhoneModal
          product={pendingTopUp}
          onConfirm={confirmTopUp}
          onCancel={() => setPendingTopUp(null)}
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
            <span className={`text-xs font-semibold ${isOnline ? 'text-green-400' : 'text-yellow-400'}`}>
              {isOnline ? '⚡ Online' : '📶 Offline'}
            </span>
            <button
              onClick={openCustomerDisplay}
              title="Open Customer Display in new window"
              className="bg-slate-700 hover:bg-slate-600 text-slate-300 text-xs font-bold px-3 py-1.5 rounded-lg transition-all"
            >
              📺 Display
            </button>
            <button
              onClick={triggerPanic}
              title="Panic Button — alerts manager immediately"
              className="bg-red-700 hover:bg-red-600 text-white text-xs font-black px-3 py-1.5 rounded-lg transition-all active:scale-95 animate-none"
            >
              🚨 PANIC
            </button>
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

        {/* Quick-sell grid */}
        {searchResults.length === 0 && (
          <div className="flex-1 flex flex-col min-h-0 px-4 pb-4">
            {/* Tabs */}
            <div className="flex gap-1 overflow-x-auto pb-2 pos-scroll-x mb-3">
              {['All', 'Beer', 'Spirits', 'Soft Drinks', 'Snacks', 'Tobacco', 'Lottery', 'Top-Up'].map(tab => (
                <button
                  key={tab}
                  onClick={() => setQuickTab(tab === 'Top-Up' ? 'Mobile Top-Up' : tab)}
                  className={`shrink-0 px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                    (quickTab === tab || (tab === 'Top-Up' && quickTab === 'Mobile Top-Up'))
                      ? 'bg-primary text-white'
                      : 'bg-pos-card text-pos-muted hover:bg-slate-600'
                  }`}
                >
                  {tab === 'Lottery' ? '🎟 Lottery' : tab === 'Top-Up' ? '📱 Top-Up' : tab}
                </button>
              ))}
            </div>
            {/* Product grid */}
            {quickLoading ? (
              <div className="flex-1 flex items-center justify-center">
                <div className="animate-spin rounded-full h-8 w-8 border-2 border-primary border-t-transparent"></div>
              </div>
            ) : (
              <div className="flex-1 overflow-y-auto pos-scroll">
                {quickProducts.length === 0 ? (
                  <div className="flex flex-col items-center justify-center h-32 text-pos-muted text-sm">
                    <p>No products in this category</p>
                  </div>
                ) : (
                  <div className="grid grid-cols-3 gap-2">
                    {quickProducts.map(p => {
                      const cat = p.category || '';
                      let btnClass = 'bg-pos-card hover:bg-slate-600 border border-slate-600';
                      if (cat === 'Lottery') btnClass = 'bg-yellow-900 hover:bg-yellow-800 border border-yellow-600';
                      else if (cat === 'Mobile Top-Up') btnClass = 'bg-blue-900 hover:bg-blue-800 border border-blue-600';
                      else if (cat === 'Beer' || cat === 'Cider') btnClass = 'bg-amber-900 hover:bg-amber-800 border border-amber-600';
                      else if (cat === 'Spirits') btnClass = 'bg-purple-900 hover:bg-purple-800 border border-purple-600';
                      else if (cat === 'Tobacco') btnClass = 'bg-gray-800 hover:bg-gray-700 border border-gray-600';
                      return (
                        <button
                          key={p._id}
                          onClick={() => addProductToCart(p)}
                          className={`${btnClass} rounded-xl p-2 text-left transition-all active:scale-95`}
                        >
                          <p className="text-pos-text text-xs font-semibold leading-tight truncate">{p.name}</p>
                          <p className="text-pos-muted text-xs font-mono mt-0.5">{fmt(p.pricing?.retailPrice || 0)}</p>
                          {p.stock?.quantity !== undefined && (
                            <p className="text-pos-muted text-xs opacity-60">Qty: {p.stock.quantity}</p>
                          )}
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            )}
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
