import React, { useState } from 'react';
import toast from 'react-hot-toast';
import { ArrowLeft, Store, LogIn, UserPlus, Loader2, ShieldCheck } from 'lucide-react';
import {
  login, register, guestDataExists, shopHasData, migrateGuestIntoShop, currentShop,
} from '../../lib/account';

// PWA shop-owner login / create-account, plus the explicit guest→shop data migration prompt.
// Self-contained (no router) so it's easy to test. `onDone` is called once the owner is signed in
// and any migration choice is made; `onBack` returns to where they came from.
export default function AccountView({ onDone, onBack }) {
  const [mode, setMode] = useState('login'); // 'login' | 'register'
  const [form, setForm] = useState({ email: '', password: '', shopName: '' });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [step, setStep] = useState('auth'); // 'auth' | 'migrate'

  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  async function submit(e) {
    e?.preventDefault?.();
    setError(null);
    if (!form.email.trim() || !form.password) { setError('Enter your email and password.'); return; }
    if (mode === 'register' && !form.shopName.trim()) { setError('What’s your shop called?'); return; }
    setBusy(true);
    try {
      if (mode === 'register') await register({ email: form.email.trim(), password: form.password, shopName: form.shopName.trim() });
      else await login({ email: form.email.trim(), password: form.password });

      // Signed in. Offer to bring on-device guest data into the shop, but only if there's data to move
      // and the shop doesn't already have its own (never overwrite silently).
      if (guestDataExists() && !shopHasData()) { setStep('migrate'); }
      else { toast.success('Signed in'); onDone?.(); }
    } catch (err) {
      // Backend not deployed yet, or bad credentials, or offline.
      setError(err?.status === 401 ? 'Email or password not recognised.'
        : 'Couldn’t sign in. Accounts may not be switched on yet — you can keep using Vendora on this device.');
    } finally {
      setBusy(false);
    }
  }

  function doMigrate(move) {
    if (move) {
      const res = migrateGuestIntoShop();
      if (res.error) { toast.error(res.error); }
      else { toast.success(`Moved ${res.copied} item${res.copied === 1 ? '' : 's'} into your shop`); }
    } else {
      toast('Kept your device data separate', { icon: '👍' });
    }
    onDone?.();
  }

  if (step === 'migrate') {
    const shop = currentShop();
    return (
      <div>
        <h2 className="mb-1 text-base font-bold text-gray-900">Bring your data in?</h2>
        <p className="mb-4 text-sm text-gray-500">
          You’ve got stock and settings saved on this device. Move them into
          {shop?.name ? ` ${shop.name}` : ' your shop'} so they’re tied to your account?
        </p>
        <div className="space-y-2">
          <button type="button" onClick={() => doMigrate(true)} className="w-full rounded-2xl bg-primary px-4 py-3 text-sm font-semibold text-white active:scale-[0.99]">
            Move my data into my shop
          </button>
          <button type="button" onClick={() => doMigrate(false)} className="w-full rounded-2xl border border-gray-200 bg-white px-4 py-3 text-sm font-semibold text-gray-700 active:scale-[0.99]">
            Keep it separate for now
          </button>
        </div>
        <p className="mt-3 text-center text-[11px] text-gray-400">Nothing is deleted either way. This won’t overwrite data already in your shop.</p>
      </div>
    );
  }

  return (
    <div>
      {onBack && (
        <button type="button" onClick={onBack} className="mb-4 inline-flex items-center gap-1 text-sm font-medium text-primary hover:underline">
          <ArrowLeft className="h-4 w-4" /> Back
        </button>
      )}
      <div className="mb-4 flex items-center gap-2">
        <span className="flex h-10 w-10 items-center justify-center rounded-2xl bg-primary-50 text-primary"><Store className="h-5 w-5" /></span>
        <div>
          <h2 className="text-base font-bold text-gray-900">{mode === 'login' ? 'Log in to your shop' : 'Create your shop account'}</h2>
          <p className="text-xs text-gray-400">Log in to back up your shop and pick up where you left off on another device.</p>
        </div>
      </div>

      <div className="mb-3 flex rounded-xl bg-gray-100 p-1 text-sm font-semibold">
        <button type="button" data-testid="tab-login" onClick={() => { setMode('login'); setError(null); }} className={`flex-1 rounded-lg py-2 ${mode === 'login' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500'}`}>Log in</button>
        <button type="button" data-testid="tab-register" onClick={() => { setMode('register'); setError(null); }} className={`flex-1 rounded-lg py-2 ${mode === 'register' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500'}`}>Create account</button>
      </div>

      <form onSubmit={submit} className="space-y-2">
        {mode === 'register' && (
          <input value={form.shopName} onChange={set('shopName')} placeholder="Shop name" aria-label="Shop name" autoComplete="organization" aria-invalid={!!error} className="w-full rounded-xl border border-gray-200 px-3 py-2.5 text-sm focus:border-primary focus:outline-none" />
        )}
        <input value={form.email} onChange={set('email')} type="email" placeholder="Email" aria-label="Email" autoComplete="email" aria-invalid={!!error} className="w-full rounded-xl border border-gray-200 px-3 py-2.5 text-sm focus:border-primary focus:outline-none" />
        <input value={form.password} onChange={set('password')} type="password" placeholder="Password" aria-label="Password" autoComplete={mode === 'login' ? 'current-password' : 'new-password'} aria-invalid={!!error} className="w-full rounded-xl border border-gray-200 px-3 py-2.5 text-sm focus:border-primary focus:outline-none" />

        {error && <p role="alert" aria-live="assertive" className="rounded-lg bg-danger/10 px-3 py-2 text-xs text-danger">{error}</p>}

        <button type="submit" data-testid="submit" disabled={busy} className="flex w-full items-center justify-center gap-2 rounded-2xl bg-primary px-4 py-3 text-sm font-semibold text-white active:scale-[0.99] disabled:opacity-60">
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : (mode === 'login' ? <LogIn className="h-4 w-4" /> : <UserPlus className="h-4 w-4" />)}
          {mode === 'login' ? 'Log in' : 'Create account'}
        </button>
      </form>

      <p className="mt-4 flex items-center justify-center gap-1.5 text-center text-[11px] text-gray-400">
        <ShieldCheck className="h-3.5 w-3.5" /> Your shop data stays yours. Works offline on this device.
      </p>
    </div>
  );
}
