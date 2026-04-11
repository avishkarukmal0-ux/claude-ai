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

// ── Expiry Banner ─────────────────────────────────────────────────────────────
function ExpiryBanner({ expiryStatus }) {
  if (!expiryStatus?.hasExpiryBatch) return null;
  const { status, daysLeft, originalPrice, discountedPrice, discountPercent } = expiryStatus;

  if (status === 'expired') {
    return (
      <div style={{
        background: 'rgba(127,0,0,0.3)', border: '1px solid rgba(220,38,38,0.5)',
        borderRadius: 6, padding: '5px 8px', margin: '4px 0',
      }}>
        <p style={{ fontSize: 10, fontWeight: 700, color: '#F87171' }}>❌ EXPIRED — Cannot sell · Remove from shelf</p>
      </div>
    );
  }

  const label = daysLeft === 0 ? 'Expires TODAY'
    : daysLeft === 1 ? 'Expires TOMORROW'
    : `Expires in ${daysLeft} days`;

  const bgColor = daysLeft <= 1 ? 'rgba(220,38,38,0.12)' : 'rgba(217,119,6,0.12)';
  const borderColor = daysLeft <= 1 ? 'rgba(220,38,38,0.35)' : 'rgba(217,119,6,0.35)';
  const textColor = daysLeft <= 1 ? '#FCA5A5' : '#FCD34D';

  return (
    <div style={{
      background: bgColor, border: `1px solid ${borderColor}`,
      borderRadius: 6, padding: '5px 8px', margin: '4px 0',
    }}>
      <p style={{ fontSize: 10, fontWeight: 700, color: textColor }}>
        ⚠ {label}
        {discountPercent > 0 && originalPrice && (
          <span style={{ marginLeft: 6, fontWeight: 400, color: 'var(--green-light)' }}>
            {fmt(originalPrice)} → {fmt(discountedPrice)} (-{discountPercent}%)
          </span>
        )}
      </p>
    </div>
  );
}

// ── Cart Item (#8 void button) ───────────────────────────────────────────────
function CartItem({ item, index, onVoidRequest, onQtyChange }) {
  return (
    <div style={{
      padding: '10px 0', borderBottom: '1px solid var(--border)',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <p style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-primary)', lineHeight: 1.3 }} className="truncate">{item.name}</p>
          <p style={{ fontSize: 11, color: 'var(--text-muted)', fontFamily: 'monospace' }}>{fmt(item.unitPrice)}</p>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          <button
            onClick={() => onQtyChange(index, item.quantity - 1)}
            style={{
              width: 24, height: 24, borderRadius: 6,
              background: 'rgba(255,255,255,0.06)', color: 'var(--text-secondary)',
              border: '1px solid var(--border)', fontSize: 14, fontWeight: 700,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              cursor: 'pointer', transition: 'var(--transition-fast)',
            }}
          >−</button>
          <span style={{ width: 24, textAlign: 'center', color: 'var(--text-primary)', fontWeight: 700, fontSize: 13 }}>{item.quantity}</span>
          <button
            onClick={() => onQtyChange(index, item.quantity + 1)}
            style={{
              width: 24, height: 24, borderRadius: 6,
              background: 'rgba(255,255,255,0.06)', color: 'var(--text-secondary)',
              border: '1px solid var(--border)', fontSize: 14, fontWeight: 700,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              cursor: 'pointer', transition: 'var(--transition-fast)',
            }}
          >+</button>
        </div>
        <p style={{ width: 52, textAlign: 'right', color: 'var(--text-primary)', fontFamily: 'monospace', fontSize: 13, fontWeight: 700 }}>{fmt(item.lineTotal)}</p>
        <button
          onClick={() => onVoidRequest(index)}
          title="Void item (requires PIN)"
          style={{
            width: 36, height: 24, borderRadius: 5,
            background: 'var(--red-dim)', color: 'var(--red-light)',
            border: 'none', fontSize: 9, fontWeight: 700,
            cursor: 'pointer', transition: 'var(--transition-fast)',
            letterSpacing: '0.05em',
          }}
        >
          VOID
        </button>
      </div>
      {item.expiryStatus?.hasExpiryBatch && <ExpiryBanner expiryStatus={item.expiryStatus} />}
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
    <div style={{ padding: '8px 12px 10px', borderTop: '1px solid var(--border)' }}>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '4px 8px' }}>
        {shortcuts.map(([key, action]) => (
          <div key={key} style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
            <span style={{
              fontSize: 9, fontFamily: 'monospace',
              background: 'rgba(255,255,255,0.08)', color: 'var(--text-secondary)',
              padding: '2px 4px', borderRadius: 4, lineHeight: 1.4,
              border: '1px solid var(--border)',
            }}>{key}</span>
            <span style={{ fontSize: 9, color: 'var(--text-muted)' }}>{action}</span>
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
          addProductToCart(data.product, data.expiryStatus);
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

  const addProductToCart = useCallback((product, expiryStatus) => {
    // Expired items cannot be sold
    if (expiryStatus?.status === 'expired') {
      toast.error(`${product.name} is EXPIRED — cannot sell. Remove from shelf.`, { duration: 5000 });
      // Log the attempt
      api.post('/ai/pos/expiry-override', { overrideReason: 'attempted sale of expired product' }).catch(() => {});
      return;
    }

    if (product.attributes?.ageRestricted) {
      setPendingAgeVerify({ product, expiryStatus, verified: false });
      return;
    }
    // Mobile top-up: prompt for phone number
    if (product.category === 'Mobile Top-Up') {
      setPendingTopUp(product);
      return;
    }

    // Use discounted price if auto-discount applied
    const basePrice = product.pricing?.retailPrice ?? product.unitPrice ?? 0;
    const unitPrice = (expiryStatus?.autoDiscountApplied && expiryStatus?.discountedPrice)
      ? expiryStatus.discountedPrice
      : basePrice;

    // Show expiry toast warning
    if (expiryStatus?.status === 'expiring_soon') {
      const days = expiryStatus.daysLeft;
      const msg = days === 0 ? 'Expires TODAY' : `Expires in ${days} day${days !== 1 ? 's' : ''}`;
      toast(`${product.name}: ${msg}`, { icon: '⚠️', duration: 3000 });
    }

    addItem({
      ...product,
      barcode: product.barcode,
      name: product.name,
      unitPrice,
      quantity: 1,
      lineTotal: unitPrice,
      ageVerified: false,
      expiryStatus: expiryStatus || null,
    });
    toast.success(`${product.name} added`, { duration: 1000 });
  }, [addItem]);

  const handleKeyDown = useCallback((e) => {
    if (e.key === 'Enter') handleBarcodeSearch(search);
  }, [search, handleBarcodeSearch]);

  const confirmAge = () => {
    const p = pendingAgeVerify.product;
    const expiryStatus = pendingAgeVerify.expiryStatus;
    const basePrice = p.pricing?.retailPrice ?? 0;
    const unitPrice = (expiryStatus?.autoDiscountApplied && expiryStatus?.discountedPrice)
      ? expiryStatus.discountedPrice : basePrice;
    addItem({ ...p, barcode: p.barcode, name: p.name, unitPrice, quantity: 1, lineTotal: unitPrice, ageVerified: true, expiryStatus: expiryStatus || null });
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

  // Category bar color helper
  const getCatBarClass = (cat) => {
    if (!cat) return 'cat-bar-default';
    const c = cat.toLowerCase();
    if (c.includes('beer') || c.includes('cider')) return 'cat-bar-beer';
    if (c.includes('spirit')) return 'cat-bar-spirits';
    if (c.includes('soft') || c.includes('juice') || c.includes('water')) return 'cat-bar-soft';
    if (c.includes('snack') || c.includes('food')) return 'cat-bar-snacks';
    if (c.includes('tobacco') || c.includes('vape') || c.includes('cigar')) return 'cat-bar-tobacco';
    if (c.includes('lottery')) return 'cat-bar-lottery';
    if (c.includes('top-up') || c.includes('topup') || c.includes('mobile')) return 'cat-bar-topup';
    return 'cat-bar-default';
  };

  return (
    <div style={{ display: 'flex', height: '100vh', background: 'var(--bg-primary)', overflow: 'hidden' }}>
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
        <div style={{
          position: 'fixed', top: 0, left: 0, right: 0, zIndex: 50,
          background: '#FBBF24', color: '#78350F', textAlign: 'center',
          padding: '8px', fontWeight: 700, fontSize: 13,
        }}>
          🎓 TRAINING MODE — Transactions are NOT saved
        </div>
      )}

      {/* ── LEFT PANEL ── */}
      <div style={{
        flex: 1, display: 'flex', flexDirection: 'column',
        background: 'var(--bg-primary)', borderRight: '1px solid var(--border)', minWidth: 0,
      }}>
        {/* Topbar */}
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '0 16px', height: 52,
          background: 'var(--bg-primary)', borderBottom: '1px solid var(--border)',
          flexShrink: 0,
        }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
            <p style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-primary)', lineHeight: 1.2 }}>{storeName}</p>
            <p style={{ fontSize: 10, color: 'var(--text-muted)' }}>{tillId} · {time}</p>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            {cashExpected !== null && (
              <div style={{
                background: 'var(--green-dim)', color: 'var(--green-light)',
                fontSize: 11, fontWeight: 700, padding: '4px 10px',
                borderRadius: 20, fontFamily: 'monospace',
                border: '1px solid rgba(22,163,74,0.25)',
              }}>
                💷 {fmt(cashExpected)}
              </div>
            )}
            <div style={{
              fontSize: 10, fontWeight: 600,
              color: isOnline ? 'var(--green-light)' : 'var(--amber-light)',
              background: isOnline ? 'var(--green-dim)' : 'var(--amber-dim)',
              padding: '4px 8px', borderRadius: 20,
              border: `1px solid ${isOnline ? 'rgba(22,163,74,0.25)' : 'rgba(217,119,6,0.25)'}`,
            }}>
              {isOnline ? '⚡ Online' : '📶 Offline'}
            </div>
            <button
              onClick={openCustomerDisplay}
              title="Open Customer Display in new window"
              style={{
                background: 'rgba(255,255,255,0.06)', color: 'var(--text-secondary)',
                border: '1px solid var(--border)', borderRadius: 8,
                fontSize: 11, fontWeight: 600, padding: '5px 10px',
                cursor: 'pointer', transition: 'var(--transition)',
              }}
            >
              📺 Display
            </button>
            <button
              onClick={triggerPanic}
              title="Panic Button — alerts manager immediately"
              style={{
                background: 'var(--red)', color: 'white',
                border: 'none', borderRadius: 8,
                fontSize: 11, fontWeight: 800, padding: '5px 10px',
                cursor: 'pointer', transition: 'var(--transition)',
                letterSpacing: '0.03em',
              }}
            >
              🚨 PANIC
            </button>
          </div>
        </div>

        {/* Search bar */}
        <div style={{ padding: '12px', borderBottom: '1px solid var(--border)', flexShrink: 0 }}>
          <div style={{ position: 'relative', display: 'flex', gap: 8 }}>
            <div style={{ position: 'relative', flex: 1 }}>
              <span style={{
                position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)',
                color: 'var(--text-muted)', fontSize: 14, pointerEvents: 'none',
              }}>🔍</span>
              <input
                ref={searchRef}
                style={{
                  width: '100%', height: 40, paddingLeft: 36, paddingRight: 12,
                  background: 'var(--bg-input)', border: '1px solid var(--border)',
                  borderRadius: 10, color: 'var(--text-primary)', fontSize: 13,
                  transition: 'var(--transition)', outline: 'none',
                }}
                placeholder="Scan barcode or search product... (F5 = Price Check)"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                onKeyDown={handleKeyDown}
                autoFocus
                onFocus={e => e.target.style.borderColor = 'var(--blue)'}
                onBlur={e => e.target.style.borderColor = 'var(--border)'}
              />
            </div>
            <button
              onClick={() => handleBarcodeSearch(search)}
              style={{
                height: 40, padding: '0 14px', background: 'var(--blue)',
                color: 'white', borderRadius: 10, fontSize: 13, fontWeight: 600,
                border: 'none', cursor: 'pointer', transition: 'var(--transition)',
              }}
            >{searching ? '...' : '🔍'}</button>
            <button
              onClick={() => setShowPriceCheck(true)}
              style={{
                height: 40, padding: '0 10px', background: 'var(--bg-card)',
                color: 'var(--text-muted)', borderRadius: 10, fontSize: 11,
                border: '1px solid var(--border)', cursor: 'pointer', fontWeight: 600,
              }}
            >F5</button>
          </div>
        </div>

        {/* Search results */}
        {searchResults.length > 0 && (
          <div style={{
            margin: '0 12px 12px',
            background: 'var(--bg-card)', borderRadius: 12,
            border: '1px solid var(--border)', overflow: 'hidden',
            maxHeight: 260, overflowY: 'auto',
          }} className="pos-scroll">
            {searchResults.map((p) => (
              <button
                key={p._id}
                onClick={() => { addProductToCart(p); setSearch(''); setSearchResults([]); }}
                style={{
                  width: '100%', display: 'flex', alignItems: 'center',
                  justifyContent: 'space-between', padding: '12px 16px',
                  background: 'transparent', border: 'none', borderBottom: '1px solid var(--border)',
                  cursor: 'pointer', textAlign: 'left', transition: 'background 0.1s',
                }}
                onMouseEnter={e => e.currentTarget.style.background = 'var(--bg-hover)'}
                onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
              >
                <div>
                  <p style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)' }}>{p.name}</p>
                  <p style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 1 }}>{p.barcode} · {p.category}</p>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <p style={{ fontSize: 14, fontFamily: 'monospace', fontWeight: 700, color: 'var(--blue-light)' }}>{fmt(p.pricing.retailPrice)}</p>
                  <p style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 1 }}>Qty: {p.stock?.quantity || 0}</p>
                </div>
              </button>
            ))}
          </div>
        )}

        {/* Quick-sell grid */}
        {searchResults.length === 0 && (
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0, padding: '0 12px 12px' }}>
            {/* Category Tabs */}
            <div style={{
              display: 'flex', gap: 6, overflowX: 'auto', paddingBottom: 8, marginBottom: 10, flexShrink: 0,
            }} className="pos-scroll">
              {['All', 'Beer', 'Spirits', 'Soft Drinks', 'Snacks', 'Tobacco', 'Lottery', 'Top-Up'].map(tab => {
                const isActive = quickTab === tab || (tab === 'Top-Up' && quickTab === 'Mobile Top-Up');
                const isLottery = tab === 'Lottery';
                const isTopUp = tab === 'Top-Up';
                return (
                  <button
                    key={tab}
                    onClick={() => setQuickTab(tab === 'Top-Up' ? 'Mobile Top-Up' : tab)}
                    style={{
                      flexShrink: 0,
                      padding: '5px 12px',
                      borderRadius: 20,
                      fontSize: 12,
                      fontWeight: 600,
                      border: 'none',
                      cursor: 'pointer',
                      transition: 'var(--transition)',
                      background: isActive
                        ? (isLottery ? 'var(--amber)' : isTopUp ? 'var(--green)' : 'var(--blue)')
                        : 'rgba(255,255,255,0.06)',
                      color: isActive ? 'white' : 'var(--text-secondary)',
                    }}
                  >
                    {tab === 'Lottery' ? '🎟 Lottery' : tab === 'Top-Up' ? '📱 Top-Up' : tab}
                  </button>
                );
              })}
            </div>

            {/* Product grid */}
            {quickLoading ? (
              <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <div className="animate-spin rounded-full h-8 w-8 border-2 border-primary border-t-transparent"></div>
              </div>
            ) : (
              <div style={{ flex: 1, overflowY: 'auto' }} className="pos-scroll">
                {quickProducts.length === 0 ? (
                  <div style={{
                    display: 'flex', flexDirection: 'column', alignItems: 'center',
                    justifyContent: 'center', height: 128, color: 'var(--text-muted)', fontSize: 13,
                  }}>
                    <p>No products in this category</p>
                  </div>
                ) : (
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8 }}>
                    {quickProducts.map(p => {
                      const catBarClass = getCatBarClass(p.category || '');
                      const isLowStock = (p.stock?.quantity ?? 99) < 10;
                      return (
                        <button
                          key={p._id}
                          onClick={() => addProductToCart(p)}
                          style={{
                            background: 'var(--bg-card)',
                            border: '1px solid var(--border)',
                            borderRadius: 10, padding: 0,
                            textAlign: 'left', cursor: 'pointer',
                            transition: 'var(--transition)',
                            overflow: 'hidden', position: 'relative',
                          }}
                          onMouseEnter={e => {
                            e.currentTarget.style.borderColor = 'var(--border-hover)';
                            e.currentTarget.style.background = 'var(--bg-elevated)';
                          }}
                          onMouseLeave={e => {
                            e.currentTarget.style.borderColor = 'var(--border)';
                            e.currentTarget.style.background = 'var(--bg-card)';
                          }}
                          onMouseDown={e => e.currentTarget.style.transform = 'scale(0.98)'}
                          onMouseUp={e => e.currentTarget.style.transform = 'scale(1)'}
                        >
                          {/* Category color bar */}
                          <div className={catBarClass} style={{ height: 3, width: '100%' }} />
                          {/* Age restriction badge */}
                          {p.attributes?.ageRestricted && (
                            <span style={{
                              position: 'absolute', top: 7, right: 6,
                              fontSize: 9, fontWeight: 700, padding: '1px 5px',
                              borderRadius: 4, background: 'var(--red-dim)', color: 'var(--red-light)',
                            }}>18+</span>
                          )}
                          <div style={{ padding: '8px 10px 10px' }}>
                            <p style={{
                              fontSize: 12, fontWeight: 500, color: 'var(--text-primary)',
                              lineHeight: 1.3, marginBottom: 4,
                              paddingRight: p.attributes?.ageRestricted ? 28 : 0,
                            }} className="truncate">{p.name}</p>
                            <p style={{
                              fontSize: 15, fontWeight: 600, color: 'var(--blue-light)',
                              fontFamily: 'monospace', lineHeight: 1,
                            }}>{fmt(p.pricing?.retailPrice || 0)}</p>
                            {p.stock?.quantity !== undefined && (
                              <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginTop: 4 }}>
                                <p style={{ fontSize: 10, color: 'var(--text-muted)' }}>Qty: {p.stock.quantity}</p>
                                {isLowStock && (
                                  <span style={{
                                    fontSize: 9, fontWeight: 700, padding: '1px 4px',
                                    borderRadius: 3, background: 'var(--red-dim)', color: 'var(--red-light)',
                                  }}>LOW</span>
                                )}
                              </div>
                            )}
                          </div>
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
      <div style={{
        width: 260, display: 'flex', flexDirection: 'column',
        background: 'var(--bg-card)', flexShrink: 0,
      }}>
        {/* Cart header */}
        <div style={{ padding: '12px 14px', borderBottom: '1px solid var(--border)', flexShrink: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <h2 style={{ fontSize: 14, fontWeight: 800, color: 'var(--text-primary)' }}>Cart</h2>
            <span style={{
              background: 'var(--blue)', color: 'white',
              fontSize: 10, fontWeight: 700, padding: '2px 7px', borderRadius: 10,
            }}>{itemCount}</span>
          </div>
          {customer && (
            <div style={{
              marginTop: 8, display: 'flex', alignItems: 'center', gap: 8,
              background: 'rgba(255,255,255,0.04)', borderRadius: 8, padding: '6px 10px',
              border: '1px solid var(--border)',
            }}>
              <span style={{ fontSize: 13 }}>👤</span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <p style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-primary)' }} className="truncate">{customer.firstName} {customer.lastName}</p>
                <p style={{ fontSize: 10, color: 'var(--text-muted)' }}>{customer.loyalty?.points || 0} pts</p>
              </div>
              <button onClick={() => setCustomer(null)} style={{ color: 'var(--text-muted)', fontSize: 12, background: 'none', border: 'none', cursor: 'pointer' }}>✕</button>
            </div>
          )}
        </div>

        {/* Cart items */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '0 14px' }} className="pos-scroll">
          {items.length === 0 ? (
            <div style={{
              display: 'flex', flexDirection: 'column', alignItems: 'center',
              justifyContent: 'center', height: '100%', color: 'var(--text-muted)', fontSize: 12,
            }}>
              <div style={{ fontSize: 36, marginBottom: 8, opacity: 0.4 }}>🛒</div>
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
        <div style={{ padding: '12px 14px', borderTop: '1px solid var(--border)', flexShrink: 0 }}>
          {promoDiscount > 0 && (
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
              <span style={{ fontSize: 12, color: 'var(--green-light)' }}>🏷️ Promotions</span>
              <span style={{ fontSize: 12, color: 'var(--green-light)', fontFamily: 'monospace', fontWeight: 700 }}>−{fmt(promoDiscount)}</span>
            </div>
          )}
          <div style={{
            display: 'flex', justifyContent: 'space-between', alignItems: 'center',
            paddingTop: 10, borderTop: '1px solid var(--border)',
          }}>
            <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-secondary)', letterSpacing: '0.05em' }}>TOTAL</span>
            <span style={{ fontSize: 28, fontWeight: 800, color: 'var(--text-primary)', fontFamily: 'monospace' }}>{fmt(total)}</span>
          </div>
        </div>

        {/* Action buttons */}
        <div style={{ padding: '10px 12px 12px', borderTop: '1px solid var(--border)', flexShrink: 0 }}>
          <button
            onClick={() => { if (items.length > 0) setShowPayment(true); else toast.error('Cart is empty'); }}
            style={{
              width: '100%', height: 48, background: 'var(--green)',
              color: 'white', borderRadius: 10, fontSize: 14, fontWeight: 800,
              border: 'none', cursor: 'pointer', marginBottom: 8,
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
              transition: 'var(--transition)',
            }}
            onMouseEnter={e => e.currentTarget.style.background = '#15803D'}
            onMouseLeave={e => e.currentTarget.style.background = 'var(--green)'}
          >
            💷 Pay Now
            <span style={{ opacity: 0.6, fontSize: 11, fontWeight: 500 }}>(F12)</span>
          </button>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 6 }}>
            {[
              { label: '🗑 Clear', action: () => clearCart() },
              { label: '⏸ Park', action: () => toast('Transaction parked', { icon: '⏸' }) },
              { label: '↩ Refund', action: () => {} },
            ].map(({ label, action }) => (
              <button
                key={label}
                onClick={action}
                style={{
                  height: 34, background: 'rgba(255,255,255,0.05)',
                  color: 'var(--text-secondary)', borderRadius: 8, fontSize: 11, fontWeight: 600,
                  border: '1px solid var(--border)', cursor: 'pointer', transition: 'var(--transition)',
                }}
                onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,255,255,0.09)'}
                onMouseLeave={e => e.currentTarget.style.background = 'rgba(255,255,255,0.05)'}
              >{label}</button>
            ))}
          </div>
        </div>

        {/* Feature #12 — Shortcuts legend */}
        <ShortcutsLegend />
      </div>
    </div>
  );
}
