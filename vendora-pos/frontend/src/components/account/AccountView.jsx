import React, { useState } from 'react';
import toast from 'react-hot-toast';
import { Store, LogIn, UserPlus, Loader2, ShieldCheck, LogOut, KeyRound, Mail, AtSign } from 'lucide-react';
import ScreenBack from '../common/ScreenBack';
import {
  login, register, guestDataExists, shopHasData, migrateGuestIntoShop, currentShop, useSession,
  currentRole, forgotPassword, resetPassword, changePassword, changeEmail,
} from '../../lib/account';
import { signOut, pendingCount } from '../../lib/session';
import SyncStatus from './SyncStatus';

const BLANK = { email: '', password: '', shopName: '', currentPassword: '', confirm: '' };

// Read a reset deep-link (/account?reset=<token>&email=<email>) once, so the emailed link lands on the
// set-new-password form.
function readResetCtx() {
  try {
    const q = new URLSearchParams(window.location.search);
    const token = q.get('reset');
    return token ? { token, email: q.get('email') || '' } : null;
  } catch { return null; }
}

// PWA shop-owner login / create-account, password recovery, and in-app credential changes, plus the explicit
// guest→shop data migration prompt. Self-contained (no router) so it's easy to test.
export default function AccountView({ onDone, onBack }) {
  const { loggedIn, shop } = useSession();
  const [mode, setMode] = useState('login'); // 'login' | 'register' | 'forgot'
  const [form, setForm] = useState(BLANK);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [step, setStep] = useState('auth'); // 'auth' | 'migrate'
  const [confirmOut, setConfirmOut] = useState(false); // sign-out confirm panel
  const [keepData, setKeepData] = useState(false);     // "keep this shop's data on this device"
  const [outBusy, setOutBusy] = useState(false);
  const [resetCtx, setResetCtx] = useState(readResetCtx); // set-new-password deep link
  const [forgotSent, setForgotSent] = useState(null);     // null | 'sent' | 'unavailable'
  const [acctSection, setAcctSection] = useState(null);   // logged-in: null | 'password' | 'email'

  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));
  const resetForm = () => { setForm(BLANK); setError(null); };

  async function doSignOut() {
    setOutBusy(true);
    try {
      const { remaining } = await signOut({ purge: !keepData });
      toast.success(remaining > 0 && !keepData
        ? `Signed out. ${remaining} unsynced change${remaining === 1 ? '' : 's'} couldn’t be backed up and were removed from this device.`
        : 'Signed out');
      setConfirmOut(false);
      onDone?.();
    } finally {
      setOutBusy(false);
    }
  }

  async function submitChangePassword(e) {
    e?.preventDefault?.();
    setError(null);
    if (!form.currentPassword) { setError('Enter your current password.'); return; }
    if (!form.password || form.password.length < 8) { setError('New password must be at least 8 characters.'); return; }
    if (form.password !== form.confirm) { setError('New passwords don’t match.'); return; }
    setBusy(true);
    try {
      await changePassword({ currentPassword: form.currentPassword, newPassword: form.password });
      toast.success('Password changed');
      setAcctSection(null); resetForm();
    } catch (err) {
      setError(err?.status === 401 ? 'Your current password is incorrect.' : 'Couldn’t change your password. Try again.');
    } finally { setBusy(false); }
  }

  async function submitChangeEmail(e) {
    e?.preventDefault?.();
    setError(null);
    if (!form.email.trim()) { setError('Enter the new email.'); return; }
    if (!form.currentPassword) { setError('Enter your password to confirm.'); return; }
    setBusy(true);
    try {
      await changeEmail({ password: form.currentPassword, newEmail: form.email.trim() });
      toast.success('Login email updated');
      setAcctSection(null); resetForm();
    } catch (err) {
      setError(err?.status === 401 ? 'Your password is incorrect.'
        : err?.status === 409 ? 'That email is already in use.'
          : 'Couldn’t change your email. Try again.');
    } finally { setBusy(false); }
  }

  // Already signed in → account panel: change password / email + safe sign-out.
  if (loggedIn && step === 'auth') {
    const pending = pendingCount();
    const isOwner = currentRole() === 'owner';
    return (
      <div>
        {onBack && <ScreenBack onBack={onBack} label="Back" />}
        <h1 className="mb-3 text-base font-bold text-gray-900">Your shop account</h1>
        <div className="mb-4 flex items-center gap-2">
          <span className="flex h-10 w-10 items-center justify-center rounded-2xl bg-primary-50 text-primary"><Store className="h-5 w-5" /></span>
          <div className="min-w-0">
            <h2 className="truncate text-base font-bold text-gray-900">{shop?.name || 'Your shop'}</h2>
            <p className="text-xs text-gray-400">Signed in on this device</p>
          </div>
        </div>

        <div className="mb-4 rounded-2xl border border-gray-100 bg-white shadow-sm">
          <SyncStatus />
        </div>

        {/* Security: change password / email */}
        <div className="mb-4 space-y-2">
          {acctSection !== 'password' ? (
            <button type="button" data-testid="open-change-password" onClick={() => { setAcctSection('password'); resetForm(); }} className="flex w-full items-center gap-3 rounded-2xl border border-gray-100 bg-white p-4 text-left shadow-sm active:scale-[0.99]">
              <KeyRound className="h-5 w-5 text-gray-400" /><span className="flex-1 text-sm font-medium text-gray-900">Change password</span>
            </button>
          ) : (
            <form onSubmit={submitChangePassword} className="space-y-2 rounded-2xl border border-gray-200 bg-white p-4 shadow-sm">
              <p className="text-sm font-semibold text-gray-900">Change password</p>
              <input value={form.currentPassword} onChange={set('currentPassword')} type="password" placeholder="Current password" aria-label="Current password" autoComplete="current-password" className="w-full rounded-xl border border-gray-200 px-3 py-2.5 text-sm focus:border-primary focus:outline-none" />
              <input value={form.password} onChange={set('password')} type="password" placeholder="New password (min 8)" aria-label="New password" autoComplete="new-password" className="w-full rounded-xl border border-gray-200 px-3 py-2.5 text-sm focus:border-primary focus:outline-none" />
              <input value={form.confirm} onChange={set('confirm')} type="password" placeholder="Confirm new password" aria-label="Confirm new password" autoComplete="new-password" className="w-full rounded-xl border border-gray-200 px-3 py-2.5 text-sm focus:border-primary focus:outline-none" />
              {error && <p role="alert" className="rounded-lg bg-danger/10 px-3 py-2 text-xs text-danger">{error}</p>}
              <div className="flex gap-2 pt-1">
                <button type="button" onClick={() => { setAcctSection(null); resetForm(); }} className="flex-1 rounded-xl border border-gray-200 bg-white px-4 py-2.5 text-sm font-semibold text-gray-700">Cancel</button>
                <button type="submit" disabled={busy} className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-60">{busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <KeyRound className="h-4 w-4" />} Save</button>
              </div>
            </form>
          )}

          {isOwner && (acctSection !== 'email' ? (
            <button type="button" data-testid="open-change-email" onClick={() => { setAcctSection('email'); resetForm(); }} className="flex w-full items-center gap-3 rounded-2xl border border-gray-100 bg-white p-4 text-left shadow-sm active:scale-[0.99]">
              <AtSign className="h-5 w-5 text-gray-400" /><span className="flex-1 text-sm font-medium text-gray-900">Change login email</span>
            </button>
          ) : (
            <form onSubmit={submitChangeEmail} className="space-y-2 rounded-2xl border border-gray-200 bg-white p-4 shadow-sm">
              <p className="text-sm font-semibold text-gray-900">Change login email</p>
              <input value={form.email} onChange={set('email')} type="email" placeholder="New email" aria-label="New email" autoComplete="email" className="w-full rounded-xl border border-gray-200 px-3 py-2.5 text-sm focus:border-primary focus:outline-none" />
              <input value={form.currentPassword} onChange={set('currentPassword')} type="password" placeholder="Your password (to confirm)" aria-label="Password" autoComplete="current-password" className="w-full rounded-xl border border-gray-200 px-3 py-2.5 text-sm focus:border-primary focus:outline-none" />
              {error && <p role="alert" className="rounded-lg bg-danger/10 px-3 py-2 text-xs text-danger">{error}</p>}
              <div className="flex gap-2 pt-1">
                <button type="button" onClick={() => { setAcctSection(null); resetForm(); }} className="flex-1 rounded-xl border border-gray-200 bg-white px-4 py-2.5 text-sm font-semibold text-gray-700">Cancel</button>
                <button type="submit" disabled={busy} className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-60">{busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <AtSign className="h-4 w-4" />} Save</button>
              </div>
            </form>
          ))}
        </div>

        {!confirmOut ? (
          <button type="button" data-testid="sign-out" onClick={() => { setKeepData(false); setConfirmOut(true); }} className="flex w-full items-center justify-center gap-2 rounded-2xl border border-danger/30 bg-white px-4 py-3 text-sm font-semibold text-danger active:scale-[0.99]">
            <LogOut className="h-4 w-4" /> Sign out
          </button>
        ) : (
          <div className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm">
            <p className="text-sm font-semibold text-gray-900">Sign out of {shop?.name || 'your shop'}?</p>
            {pending > 0 && (
              <p className="mt-1 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800" role="alert">
                You have {pending} change{pending === 1 ? '' : 's'} not yet backed up. We’ll try to back them up first.
              </p>
            )}
            <label className="mt-3 flex items-start gap-2 text-xs text-gray-600">
              <input type="checkbox" checked={keepData} onChange={(e) => setKeepData(e.target.checked)} className="mt-0.5" />
              <span>Keep this shop’s data on this device (only on your own phone). Leave unticked on a shared phone — we’ll remove it so the next person can’t see it.</span>
            </label>
            <div className="mt-3 flex gap-2">
              <button type="button" onClick={() => setConfirmOut(false)} className="flex-1 rounded-xl border border-gray-200 bg-white px-4 py-2.5 text-sm font-semibold text-gray-700">Cancel</button>
              <button type="button" data-testid="sign-out-confirm" onClick={doSignOut} disabled={outBusy} className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-danger px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-60">
                {outBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : <LogOut className="h-4 w-4" />} Sign out
              </button>
            </div>
          </div>
        )}
        <p className="mt-4 flex items-center justify-center gap-1.5 text-center text-xs text-gray-400">
          <ShieldCheck className="h-3.5 w-3.5" /> Your shop data is backed up to the cloud and returns when you sign back in.
        </p>
      </div>
    );
  }

  async function submit(e) {
    e?.preventDefault?.();
    setError(null);
    if (!form.email.trim() || !form.password) { setError('Enter your email and password.'); return; }
    if (mode === 'register' && !form.shopName.trim()) { setError('What’s your shop called?'); return; }
    setBusy(true);
    try {
      if (mode === 'register') await register({ email: form.email.trim(), password: form.password, shopName: form.shopName.trim() });
      else await login({ email: form.email.trim(), password: form.password });

      if (guestDataExists() && !shopHasData()) { setStep('migrate'); }
      else { toast.success('Signed in'); onDone?.(); }
    } catch (err) {
      setError(err?.status === 401 ? 'Email or password not recognised.'
        : 'Couldn’t sign in. Accounts may not be switched on yet — you can keep using Vendora on this device.');
    } finally {
      setBusy(false);
    }
  }

  async function submitForgot(e) {
    e?.preventDefault?.();
    setError(null);
    if (!form.email.trim()) { setError('Enter your email.'); return; }
    setBusy(true);
    try {
      const { emailConfigured } = await forgotPassword(form.email.trim());
      setForgotSent(emailConfigured ? 'sent' : 'unavailable');
    } catch {
      setError('Couldn’t start a reset. Accounts may not be switched on yet — you can keep using Vendora on this device.');
    } finally { setBusy(false); }
  }

  async function submitReset(e) {
    e?.preventDefault?.();
    setError(null);
    if (!form.password || form.password.length < 8) { setError('Password must be at least 8 characters.'); return; }
    if (form.password !== form.confirm) { setError('Passwords don’t match.'); return; }
    setBusy(true);
    try {
      await resetPassword({ email: resetCtx.email || form.email.trim(), token: resetCtx.token, password: form.password });
      try { window.history.replaceState({}, '', window.location.pathname); } catch { /* ignore */ }
      setResetCtx(null); resetForm();
      toast.success('Password updated — you’re signed in');
      onDone?.();
    } catch (err) {
      setError(err?.status === 400 ? 'This reset link is invalid or has expired. Request a new one.'
        : 'Couldn’t reset your password. Try again.');
    } finally { setBusy(false); }
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
    const s = currentShop();
    return (
      <div>
        <h2 className="mb-1 text-base font-bold text-gray-900">Bring your data in?</h2>
        <p className="mb-4 text-sm text-gray-500">
          You’ve got stock and settings saved on this device. Move them into
          {s?.name ? ` ${s.name}` : ' your shop'} so they’re tied to your account?
        </p>
        <div className="space-y-2">
          <button type="button" onClick={() => doMigrate(true)} className="w-full rounded-2xl bg-primary px-4 py-3 text-sm font-semibold text-white active:scale-[0.99]">
            Move my data into my shop
          </button>
          <button type="button" onClick={() => doMigrate(false)} className="w-full rounded-2xl border border-gray-200 bg-white px-4 py-3 text-sm font-semibold text-gray-700 active:scale-[0.99]">
            Keep it separate for now
          </button>
        </div>
        <p className="mt-3 text-center text-xs text-gray-400">Nothing is deleted either way. This won’t overwrite data already in your shop.</p>
      </div>
    );
  }

  // Set-new-password (reached from the emailed reset link).
  if (resetCtx) {
    return (
      <div>
        {onBack && <ScreenBack onBack={onBack} label="Back" />}
        <div className="mb-4 flex items-center gap-2">
          <span className="flex h-10 w-10 items-center justify-center rounded-2xl bg-primary-50 text-primary"><KeyRound className="h-5 w-5" /></span>
          <div>
            <h2 className="text-base font-bold text-gray-900">Set a new password</h2>
            <p className="text-xs text-gray-400">{resetCtx.email ? `for ${resetCtx.email}` : 'Choose a new password for your shop account.'}</p>
          </div>
        </div>
        <form onSubmit={submitReset} className="space-y-2">
          <input value={form.password} onChange={set('password')} type="password" placeholder="New password (min 8)" aria-label="New password" autoComplete="new-password" className="w-full rounded-xl border border-gray-200 px-3 py-2.5 text-sm focus:border-primary focus:outline-none" />
          <input value={form.confirm} onChange={set('confirm')} type="password" placeholder="Confirm new password" aria-label="Confirm new password" autoComplete="new-password" className="w-full rounded-xl border border-gray-200 px-3 py-2.5 text-sm focus:border-primary focus:outline-none" />
          {error && <p role="alert" aria-live="assertive" className="rounded-lg bg-danger/10 px-3 py-2 text-xs text-danger">{error}</p>}
          <button type="submit" data-testid="reset-submit" disabled={busy} className="flex w-full items-center justify-center gap-2 rounded-2xl bg-primary px-4 py-3 text-sm font-semibold text-white active:scale-[0.99] disabled:opacity-60">
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <KeyRound className="h-4 w-4" />} Set password & sign in
          </button>
        </form>
      </div>
    );
  }

  // Forgot password (request a reset email).
  if (mode === 'forgot') {
    return (
      <div>
        {onBack && <ScreenBack onBack={onBack} label="Back" />}
        <div className="mb-4 flex items-center gap-2">
          <span className="flex h-10 w-10 items-center justify-center rounded-2xl bg-primary-50 text-primary"><Mail className="h-5 w-5" /></span>
          <div>
            <h2 className="text-base font-bold text-gray-900">Reset your password</h2>
            <p className="text-xs text-gray-400">We’ll email you a link to set a new one.</p>
          </div>
        </div>
        {forgotSent === 'sent' ? (
          <div className="rounded-2xl border border-emerald-100 bg-emerald-50 p-4 text-sm text-emerald-800">
            If an account exists for that email, a reset link is on its way. It’s valid for 1 hour — check your inbox (and spam).
          </div>
        ) : forgotSent === 'unavailable' ? (
          <div className="rounded-2xl border border-amber-100 bg-amber-50 p-4 text-sm text-amber-800">
            Password reset by email isn’t switched on for this shop yet. Please contact support to reset your password.
          </div>
        ) : (
          <form onSubmit={submitForgot} className="space-y-2">
            <input value={form.email} onChange={set('email')} type="email" placeholder="Email" aria-label="Email" autoComplete="email" className="w-full rounded-xl border border-gray-200 px-3 py-2.5 text-sm focus:border-primary focus:outline-none" />
            {error && <p role="alert" aria-live="assertive" className="rounded-lg bg-danger/10 px-3 py-2 text-xs text-danger">{error}</p>}
            <button type="submit" data-testid="forgot-submit" disabled={busy} className="flex w-full items-center justify-center gap-2 rounded-2xl bg-primary px-4 py-3 text-sm font-semibold text-white active:scale-[0.99] disabled:opacity-60">
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Mail className="h-4 w-4" />} Send reset link
            </button>
          </form>
        )}
        <button type="button" onClick={() => { setMode('login'); setForgotSent(null); resetForm(); }} className="mt-3 w-full text-center text-xs font-semibold text-primary">
          Back to log in
        </button>
      </div>
    );
  }

  return (
    <div>
      {onBack && <ScreenBack onBack={onBack} label="Back" />}
      <div className="mb-4 flex items-center gap-2">
        <span className="flex h-10 w-10 items-center justify-center rounded-2xl bg-primary-50 text-primary"><Store className="h-5 w-5" /></span>
        <div>
          <h2 className="text-base font-bold text-gray-900">{mode === 'login' ? 'Log in to your shop' : 'Create your shop account'}</h2>
          <p className="text-xs text-gray-400">Log in to back up your shop and pick up where you left off on another device.</p>
        </div>
      </div>

      <div className="mb-3 flex rounded-xl bg-gray-100 p-1 text-sm font-semibold">
        <button type="button" data-testid="tab-login" onClick={() => { setMode('login'); resetForm(); }} className={`flex-1 rounded-lg py-2 ${mode === 'login' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500'}`}>Log in</button>
        <button type="button" data-testid="tab-register" onClick={() => { setMode('register'); resetForm(); }} className={`flex-1 rounded-lg py-2 ${mode === 'register' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500'}`}>Create account</button>
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

      {mode === 'login' && (
        <button type="button" data-testid="forgot-link" onClick={() => { setMode('forgot'); setForgotSent(null); resetForm(); }} className="mt-3 w-full text-center text-xs font-semibold text-primary">
          Forgot your password?
        </button>
      )}

      <p className="mt-4 flex items-center justify-center gap-1.5 text-center text-xs text-gray-400">
        <ShieldCheck className="h-3.5 w-3.5" /> Your shop data stays yours. Works offline on this device.
      </p>
    </div>
  );
}
