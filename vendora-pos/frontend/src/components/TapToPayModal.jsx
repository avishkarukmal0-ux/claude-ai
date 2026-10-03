import React, { useState, useEffect, useRef } from 'react';
import api from '../services/api';
import { CreditCard, CheckCircle, XCircle, Loader2, X } from 'lucide-react';

const styles = `
@keyframes nfcRing {
  0%   { transform: scale(0.5); opacity: 1; }
  100% { transform: scale(2.8); opacity: 0; }
}
.tap-ring {
  position: absolute;
  border-radius: 9999px;
  border: 3px solid #22c55e;
  animation: nfcRing 2s ease-out infinite;
}
.tap-ring:nth-child(2) { animation-delay: 0.65s; }
.tap-ring:nth-child(3) { animation-delay: 1.3s; }
@keyframes checkBounce {
  0%   { transform: scale(0) rotate(-10deg); opacity: 0; }
  60%  { transform: scale(1.2) rotate(3deg); }
  100% { transform: scale(1) rotate(0); opacity: 1; }
}
.check-bounce { animation: checkBounce 0.5s cubic-bezier(.36,.07,.19,.97) forwards; }
@keyframes xShake {
  0%, 100% { transform: translateX(0); }
  20%, 60%  { transform: translateX(-6px); }
  40%, 80%  { transform: translateX(6px); }
}
.x-shake { animation: xShake 0.4s ease-in-out; }
`;

export default function TapToPayModal({ amount, onSuccess, onCancel }) {
  const [status, setStatus] = useState('waiting'); // waiting|processing|success|failed
  const [sessionId, setSessionId] = useState(null);
  const pollRef = useRef(null);
  const successCalled = useRef(false);

  // Initiate session on mount
  useEffect(() => {
    let cancelled = false;
    const initiate = async () => {
      try {
        const res = await api.post('/payments/tap-to-pay/initiate', { amount });
        if (!cancelled) {
          setSessionId(res?.sessionId || res?.id || null);
        }
      } catch {
        // ignore — we still show the UI
      }
    };
    initiate();
    return () => { cancelled = true; };
  }, [amount]);

  // Poll for status when we have a sessionId
  useEffect(() => {
    if (!sessionId || status !== 'waiting') return;

    pollRef.current = setInterval(async () => {
      try {
        const res = await api.get(`/payments/tap-to-pay/status/${sessionId}`);
        if (res?.status === 'success' || res?.completed === true) {
          clearInterval(pollRef.current);
          setStatus('success');
        } else if (res?.status === 'failed' || res?.declined === true) {
          clearInterval(pollRef.current);
          setStatus('failed');
        } else if (res?.status === 'processing') {
          setStatus('processing');
        }
      } catch {
        // ignore poll errors
      }
    }, 1500);

    return () => clearInterval(pollRef.current);
  }, [sessionId, status]);

  // Auto-call onSuccess after brief delay
  useEffect(() => {
    if (status === 'success' && !successCalled.current) {
      successCalled.current = true;
      const t = setTimeout(() => onSuccess(), 1500);
      return () => clearTimeout(t);
    }
  }, [status, onSuccess]);

  const handleSimulateSuccess = async () => {
    try {
      if (sessionId) {
        await api.post('/payments/tap-to-pay/complete', { sessionId, success: true });
      }
      setStatus('success');
    } catch {
      setStatus('success'); // simulate locally anyway
    }
  };

  const handleTryAgain = () => {
    setStatus('waiting');
    successCalled.current = false;
  };

  return (
    <>
      <style>{styles}</style>
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
        <div className="bg-gray-900 rounded-3xl w-full max-w-sm overflow-hidden shadow-2xl border border-white/10">
          {/* Header */}
          <div className="flex items-center justify-between px-6 pt-6 pb-2">
            <div>
              <p className="text-white/50 text-sm">Amount to pay</p>
              <p className="text-green-400 text-3xl font-black">£{Number(amount || 0).toFixed(2)}</p>
            </div>
            <button
              onClick={onCancel}
              className="w-9 h-9 rounded-full bg-white/10 flex items-center justify-center text-white/60 hover:text-white hover:bg-white/20"
            >
              <X size={18} />
            </button>
          </div>

          <div className="px-6 pb-8 pt-4 flex flex-col items-center text-center">

            {/* ── WAITING ── */}
            {status === 'waiting' && (
              <>
                <div className="relative flex items-center justify-center w-36 h-36 my-6">
                  <div className="tap-ring w-20 h-20" />
                  <div className="tap-ring w-20 h-20" />
                  <div className="tap-ring w-20 h-20" />
                  <div className="relative z-10 w-20 h-20 rounded-full bg-gray-800 border-2 border-green-500 flex items-center justify-center">
                    <CreditCard size={32} className="text-green-400" />
                  </div>
                </div>

                <h2 className="text-white text-xl font-bold mb-2">Tap to Pay</h2>
                <p className="text-white/50 text-base leading-relaxed">
                  Hold your card, phone, or watch<br />to the payment screen
                </p>

                {import.meta.env.DEV && (
                  <button
                    onClick={handleSimulateSuccess}
                    className="mt-6 text-xs text-white/25 hover:text-white/50 underline"
                  >
                    [DEV] Simulate Success
                  </button>
                )}

                <button
                  onClick={onCancel}
                  className="mt-5 border border-white/20 text-white/60 font-semibold px-8 py-2.5 rounded-xl hover:bg-white/5 text-sm w-full"
                >
                  Cancel
                </button>
              </>
            )}

            {/* ── PROCESSING ── */}
            {status === 'processing' && (
              <>
                <div className="my-8">
                  <Loader2 size={56} className="text-blue-400 animate-spin mx-auto" />
                </div>
                <h2 className="text-white text-xl font-bold mb-2">Processing payment…</h2>
                <p className="text-white/40 text-sm">Please keep your card still</p>
              </>
            )}

            {/* ── SUCCESS ── */}
            {status === 'success' && (
              <>
                <div className="my-8 check-bounce">
                  <CheckCircle size={72} className="text-green-400 mx-auto" />
                </div>
                <h2 className="text-white text-2xl font-bold mb-2">Payment Accepted!</h2>
                <p className="text-green-300 text-lg font-semibold">£{Number(amount || 0).toFixed(2)}</p>
                <p className="text-white/30 text-sm mt-2">Thank you</p>
              </>
            )}

            {/* ── FAILED ── */}
            {status === 'failed' && (
              <>
                <div className="my-8 x-shake">
                  <XCircle size={72} className="text-red-400 mx-auto" />
                </div>
                <h2 className="text-white text-xl font-bold mb-2">Payment Declined</h2>
                <p className="text-white/50 text-sm mb-6">Please try another card or payment method</p>
                <div className="flex gap-3 w-full">
                  <button
                    onClick={handleTryAgain}
                    className="flex-1 bg-blue-600 text-white font-bold py-3 rounded-xl hover:bg-blue-500"
                  >
                    Try Again
                  </button>
                  <button
                    onClick={onCancel}
                    className="flex-1 border border-white/20 text-white/60 font-semibold py-3 rounded-xl hover:bg-white/5"
                  >
                    Cancel
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    </>
  );
}
