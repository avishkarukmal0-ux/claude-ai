// Client for the optional invoice-OCR proxy (Phase 1). All calls go to OUR backend; the provider + its
// key stay server-side. If OCR isn't configured (or offline / not signed in), callers fall back to manual
// review — we never fabricate extracted data. Returns raw text only; structured fields stay the user's job.
import { currentSession, ACCOUNTS_ENABLED } from './account';

const API_BASE = (() => {
  try { return (import.meta.env.VITE_API_BASE || '').replace(/\/+$/, ''); }
  catch { return ''; }
})();
const BASE = `${API_BASE}/api/pwa-invoice-ocr`;

function token() { const s = currentSession(); return s && s.token; }
function isOffline() { try { return typeof navigator !== 'undefined' && navigator.onLine === false; } catch { return false; } }

/** Whether OCR is available right now. Safe: resolves { configured:false } on any problem. */
export async function ocrStatus() {
  if (!ACCOUNTS_ENABLED || isOffline() || !token()) return { configured: false };
  try {
    const res = await fetch(`${BASE}/status`, { headers: { Authorization: `Bearer ${token()}` } });
    if (!res.ok) return { configured: false };
    const d = await res.json();
    return { configured: !!d.configured };
  } catch { return { configured: false }; }
}

/**
 * Extract raw text from an invoice image data URL. Returns { configured, text?, failed?, error? }; never
 * throws. `failed:true` marks a genuine attempt that errored (signed in + online but the request failed),
 * so the caller can tell a real failure apart from "OCR simply isn't switched on" and surface/record it
 * instead of silently dropping it (Phase 3.10). Not-signed-in/offline is unavailability, not a failure.
 */
export async function extractInvoiceText(dataUrl) {
  if (!ACCOUNTS_ENABLED || isOffline() || !token()) return { configured: false };
  try {
    const res = await fetch(BASE, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token()}` },
      body: JSON.stringify({ dataUrl }),
    });
    if (!res.ok) return { configured: false, failed: true, error: `HTTP ${res.status}` };
    return await res.json();
  } catch (e) { return { configured: false, failed: true, error: (e && e.message) || 'network error' }; }
}
