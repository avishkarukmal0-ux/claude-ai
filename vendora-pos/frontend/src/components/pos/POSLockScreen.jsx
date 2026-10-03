import React, { useState, useEffect, useRef } from 'react';
import api from '../../services/api';
import dayjs from 'dayjs';

export default function POSLockScreen({ onUnlock }) {
  const [pin, setPin] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [time, setTime] = useState(dayjs().format('HH:mm'));
  const submitRef = useRef(false);

  useEffect(() => {
    const t = setInterval(() => setTime(dayjs().format('HH:mm')), 10000);
    return () => clearInterval(t);
  }, []);

  const handleDigit = (d) => {
    if (loading || submitRef.current) return;
    if (pin.length >= 4) return;
    const next = pin + d;
    setPin(next);
    setError('');
    if (next.length === 4) verifyPin(next);
  };

  const handleBackspace = () => {
    if (!loading) setPin(p => p.slice(0, -1));
  };

  const verifyPin = async (p) => {
    submitRef.current = true;
    setLoading(true);
    try {
      await api.post('/auth/verify-pin', { pin: p });
      onUnlock();
    } catch {
      setError('Wrong PIN — try again');
      setPin('');
    } finally {
      setLoading(false);
      submitRef.current = false;
    }
  };

  const digits = ['1','2','3','4','5','6','7','8','9','','0','⌫'];

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 9999,
      background: '#0B1120',
      display: 'flex', flexDirection: 'column',
      alignItems: 'center', justifyContent: 'center',
      gap: 28,
    }}>
      {/* Logo */}
      <svg width={148} height={34} viewBox="0 0 220 52" xmlns="http://www.w3.org/2000/svg">
        <rect x="0" y="2" width="48" height="48" rx="11" fill="#2563EB" />
        <path d="M13 17 L24 37 L35 17" fill="none" stroke="white" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
        <circle cx="24" cy="17" r="4" fill="white" />
        <text x="62" y="24" fontFamily="-apple-system,BlinkMacSystemFont,Segoe UI,sans-serif" fontSize="20" fontWeight="600" fill="white" letterSpacing="-0.5">Vendora</text>
        <text x="63" y="42" fontFamily="-apple-system,BlinkMacSystemFont,Segoe UI,sans-serif" fontSize="12" fontWeight="400" fill="rgba(255,255,255,0.4)" letterSpacing="2">POS</text>
      </svg>

      {/* Clock */}
      <p style={{ fontSize: 52, fontWeight: 800, color: 'white', fontVariantNumeric: 'tabular-nums', lineHeight: 1, margin: 0 }}>
        {time}
      </p>

      {/* Lock label */}
      <p style={{ color: 'rgba(255,255,255,0.45)', fontSize: 13, letterSpacing: '0.06em', margin: 0 }}>
        TILL LOCKED — ENTER PIN TO CONTINUE
      </p>

      {/* PIN dots */}
      <div style={{ display: 'flex', gap: 14 }}>
        {[0,1,2,3].map(i => (
          <div key={i} style={{
            width: 14, height: 14, borderRadius: '50%',
            background: pin.length > i ? '#2563EB' : 'rgba(255,255,255,0.15)',
            transition: 'background 0.12s',
          }} />
        ))}
      </div>

      {error && (
        <p style={{ color: '#F87171', fontSize: 13, margin: 0 }}>{error}</p>
      )}

      {/* Numpad */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 72px)', gap: 10 }}>
        {digits.map((d, i) => (
          <button
            key={i}
            disabled={loading || d === ''}
            onClick={() => d === '⌫' ? handleBackspace() : d !== '' ? handleDigit(d) : null}
            style={{
              height: 60, borderRadius: 12,
              background: d === '' ? 'transparent' : 'rgba(255,255,255,0.07)',
              border: d === '' ? 'none' : '1px solid rgba(255,255,255,0.1)',
              color: 'white',
              fontSize: d === '⌫' ? 20 : 22,
              fontWeight: 600,
              cursor: d === '' ? 'default' : 'pointer',
              transition: 'background 0.1s',
              opacity: loading ? 0.5 : 1,
            }}
          >
            {d}
          </button>
        ))}
      </div>
    </div>
  );
}
