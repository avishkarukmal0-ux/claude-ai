// PWA install guidance (Phase 2.6d). Captures the browser's `beforeinstallprompt` (Android/desktop Chrome)
// so we can offer a real "Install" button at a good moment, and detects iOS Safari (which gives no such
// event) so we can show Add-to-Home-Screen instructions instead. Nothing here installs anything on its own.
import { useEffect, useState } from 'react';

const INSTALLABLE_EVENT = 'vendora:installable';
const DISMISS_KEY = 'vendora:install-dismissed';
let deferred = null; // the saved beforeinstallprompt event

try {
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();          // stop Chrome's mini-infobar; we offer our own button
    deferred = e;
    try { window.dispatchEvent(new CustomEvent(INSTALLABLE_EVENT)); } catch { /* ignore */ }
  });
  window.addEventListener('appinstalled', () => { deferred = null; try { window.dispatchEvent(new CustomEvent(INSTALLABLE_EVENT)); } catch { /* ignore */ } });
} catch { /* non-browser */ }

export function canInstall() { return !!deferred; }

export function isStandalone() {
  try { return window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true; }
  catch { return false; }
}

export function isIOS() {
  try { return /iphone|ipad|ipod/i.test(navigator.userAgent || '') && !window.MSStream; }
  catch { return false; }
}

export function installDismissed() {
  try { return localStorage.getItem(DISMISS_KEY) === '1'; } catch { return false; }
}
export function dismissInstall() {
  try { localStorage.setItem(DISMISS_KEY, '1'); } catch { /* ignore */ }
}

/** Fire the native install prompt. Returns { ok, accepted }. */
export async function promptInstall() {
  if (!deferred) return { ok: false };
  try {
    deferred.prompt();
    const choice = await deferred.userChoice.catch(() => null);
    deferred = null;
    try { window.dispatchEvent(new CustomEvent(INSTALLABLE_EVENT)); } catch { /* ignore */ }
    return { ok: true, accepted: !!(choice && choice.outcome === 'accepted') };
  } catch {
    return { ok: false };
  }
}

/** Live install state for the UI. */
export function useInstallState() {
  const read = () => ({ canInstall: canInstall(), standalone: isStandalone(), ios: isIOS(), dismissed: installDismissed() });
  const [s, setS] = useState(read);
  useEffect(() => {
    const on = () => setS(read());
    window.addEventListener(INSTALLABLE_EVENT, on);
    return () => window.removeEventListener(INSTALLABLE_EVENT, on);
  }, []);
  return s;
}
