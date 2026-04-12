import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import toast from 'react-hot-toast';
import logo from '../assets/logo.svg';

const DEFAULT_STORE_ID = import.meta.env.VITE_STORE_ID || '';

export default function LoginPage() {
  const [mode, setMode] = useState('pin'); // 'pin' | 'password'
  const [storeId, setStoreId] = useState(DEFAULT_STORE_ID);
  const [employeeId, setEmployeeId] = useState('');
  const [email, setEmail] = useState('');
  const [pin, setPin] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const { login } = useAuth();
  const navigate = useNavigate();

  const handlePinPress = (digit) => {
    if (pin.length < 8) setPin((p) => p + digit);
  };

  const handleSubmit = async (e) => {
    e?.preventDefault();
    if (!storeId) { toast.error('Please enter Store ID'); return; }
    setLoading(true);
    try {
      const credentials = mode === 'pin'
        ? { storeId, employeeId, pin }
        : { storeId, email, password };
      await login(credentials);
      navigate('/pos');
      toast.success('Welcome back!');
    } catch (err) {
      toast.error(err.message || 'Login failed');
      setPin('');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-pos-bg flex flex-col items-center justify-center p-4">
      <div className="w-full max-w-sm">
        {/* Logo */}
        <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 32 }}>
          <img src={logo} alt="Vendora POS" style={{ height: 40, width: 'auto' }} />
        </div>

        <div className="bg-pos-panel rounded-2xl p-6 shadow-2xl">
          {/* Store ID */}
          <div className="mb-4">
            <label className="block text-pos-muted text-xs mb-1 font-medium uppercase tracking-wider">Store ID</label>
            <input
              className="w-full bg-pos-card text-pos-text border border-slate-600 rounded-lg px-3 py-2.5 focus:outline-none focus:border-blue-400 placeholder-slate-500 text-sm"
              placeholder="Enter Store ID (from seed output)"
              value={storeId}
              onChange={(e) => setStoreId(e.target.value)}
            />
          </div>

          {/* Mode toggle */}
          <div className="flex bg-pos-bg rounded-lg p-1 mb-5">
            <button className={`flex-1 py-2 text-sm font-semibold rounded-md transition-all ${mode === 'pin' ? 'bg-primary text-white' : 'text-pos-muted'}`} onClick={() => { setMode('pin'); setPin(''); }}>PIN Login</button>
            <button className={`flex-1 py-2 text-sm font-semibold rounded-md transition-all ${mode === 'password' ? 'bg-primary text-white' : 'text-pos-muted'}`} onClick={() => { setMode('password'); setPin(''); }}>Password Login</button>
          </div>

          {mode === 'pin' ? (
            <>
              <div className="mb-4">
                <label className="block text-pos-muted text-xs mb-1 font-medium uppercase tracking-wider">Employee ID</label>
                <input className="w-full bg-pos-card text-pos-text border border-slate-600 rounded-lg px-3 py-2.5 focus:outline-none focus:border-blue-400 text-sm placeholder-slate-500" placeholder="EMP001" value={employeeId} onChange={(e) => setEmployeeId(e.target.value)} />
              </div>
              {/* PIN display */}
              <div className="flex justify-center gap-3 mb-5 h-10 items-center">
                {[...Array(8)].map((_, i) => (
                  <div key={i} className={`w-4 h-4 rounded-full border-2 transition-all ${i < pin.length ? 'bg-blue-400 border-blue-400' : 'border-slate-500'}`} />
                ))}
              </div>
              {/* Numpad */}
              <div className="grid grid-cols-3 gap-3">
                {[1,2,3,4,5,6,7,8,9,'',0,'⌫'].map((key, idx) => (
                  <button
                    key={idx}
                    onClick={() => { if (key === '⌫') setPin(p => p.slice(0,-1)); else if (key !== '') handlePinPress(String(key)); }}
                    className={`py-4 text-xl font-bold rounded-xl transition-all active:scale-95 ${key === '' ? 'invisible' : 'bg-pos-card text-pos-text hover:bg-slate-500'}`}
                  >{key}</button>
                ))}
              </div>
              <button onClick={handleSubmit} disabled={loading || !pin || !employeeId || !storeId} className="w-full mt-4 py-3.5 bg-primary text-white font-bold rounded-xl hover:bg-primary-600 disabled:opacity-50 disabled:cursor-not-allowed transition-all">
                {loading ? 'Signing in...' : 'Sign In'}
              </button>
            </>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-pos-muted text-xs mb-1 font-medium uppercase tracking-wider">Email</label>
                <input type="email" className="w-full bg-pos-card text-pos-text border border-slate-600 rounded-lg px-3 py-2.5 focus:outline-none focus:border-blue-400 text-sm" value={email} onChange={(e) => setEmail(e.target.value)} />
              </div>
              <div>
                <label className="block text-pos-muted text-xs mb-1 font-medium uppercase tracking-wider">Password</label>
                <input type="password" className="w-full bg-pos-card text-pos-text border border-slate-600 rounded-lg px-3 py-2.5 focus:outline-none focus:border-blue-400 text-sm" value={password} onChange={(e) => setPassword(e.target.value)} />
              </div>
              <button type="submit" disabled={loading} className="w-full py-3.5 bg-primary text-white font-bold rounded-xl hover:bg-primary-600 disabled:opacity-50 transition-all">
                {loading ? 'Signing in...' : 'Sign In'}
              </button>
            </form>
          )}
        </div>

        <p className="text-center text-pos-muted text-xs mt-6">Demo PINs: Owner 1111 · Manager 2222 · Supervisor 3333 · Cashier 4444</p>
      </div>
    </div>
  );
}
