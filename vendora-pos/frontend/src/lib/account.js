// PWA shop-owner account + session (infra Stage 2a).
//
// This is the PWA's OWN lightweight account layer — a shop owner logging into THEIR shop on their
// phone with email + password. It is deliberately separate from the till's Staff/PIN auth (ADR-002:
// App/Till separation): the till authenticates staff into a Store; the PWA authenticates an owner
// into a workspace. They share nothing that would let one break the other.
//
// What this module owns (all client-side, fully testable):
//  - the device-level session (token/refresh/shop), stored OUTSIDE the workspace-scoped stores so a
//    backup never carries credentials (backup.js explicitly skips token/account keys);
//  - switching the active workspace to the signed-in shop on login (via shopWorkspace());
//  - the EXPLICIT guest→shop data migration (copyWorkspace) — the owner's on-device guest data is
//    only ever moved into their shop when they choose to, never silently.
//
// The network transport is pluggable so the logic is unit-testable without a running backend. The
// backend endpoints (/api/pwa-auth/*) are Stage 2b and require a deploy + database to verify.
import { useEffect, useState } from 'react';
import {
  setActiveWorkspace, shopWorkspace, workspaceHasData, copyWorkspace, LOCAL_WORKSPACE,
} from './storage';

const AUTH_KEY = 'vendora:auth';        // device-level session (NOT workspace-scoped, NOT backed up)
// API base: set VITE_API_BASE (e.g. https://vendora-api.onrender.com) when the backend runs on a
// different host from the frontend. Empty = same-origin (relative), for local/all-in-one setups.
const API_BASE = (() => {
  try { return (import.meta.env.VITE_API_BASE || '').replace(/\/+$/, ''); }
  catch { return ''; }
})();
const BASE = `${API_BASE}/api/pwa-auth`;
const SESSION_EVENT = 'vendora:session';

// Accounts need the backend (/api/pwa-auth) deployed to actually work. The login entry stays hidden
// until BOTH the backend is live AND this is turned on — so nobody taps a login with no server behind
// it. Turn it on WITHOUT a code change: set VITE_ACCOUNTS_ENABLED=true in the hosting env and redeploy.
export const ACCOUNTS_ENABLED = (() => {
  try { return String(import.meta.env.VITE_ACCOUNTS_ENABLED) === 'true'; }
  catch { return false; }
})();

// --- pluggable transport (real fetch by default; injectable for tests) --------------------
async function fetchTransport(path, body, token) {
  const res = await fetch(`${BASE}${path}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  let data = null;
  try { data = await res.json(); } catch { /* non-JSON */ }
  if (!res.ok) {
    const err = new Error((data && data.message) || `Request failed (${res.status})`);
    err.status = res.status;
    throw err;
  }
  return data || {};
}
let _transport = fetchTransport;
/** Inject a transport (tests). Pass nothing to restore real fetch. */
export function __setTransport(t) { _transport = t || fetchTransport; }

// --- session persistence ------------------------------------------------------------------
function loadSession() {
  try { const r = localStorage.getItem(AUTH_KEY); return r ? JSON.parse(r) : null; }
  catch { return null; }
}
function saveSession(s) {
  try { localStorage.setItem(AUTH_KEY, JSON.stringify(s)); } catch { /* ignore */ }
}
function clearSession() {
  try { localStorage.removeItem(AUTH_KEY); } catch { /* ignore */ }
}
function announce() { try { window.dispatchEvent(new CustomEvent(SESSION_EVENT)); } catch { /* ignore */ } }

export function currentSession() { return loadSession(); }
export function isLoggedIn() { return !!(loadSession() && loadSession().token); }
export function currentShop() { const s = loadSession(); return s ? s.shop || null : null; }

function normalize(d) {
  return { token: d.token, refreshToken: d.refreshToken || null, shop: d.shop || d.store || null };
}
/** Persist a session and switch the active workspace to the signed-in shop. */
function activate(session) {
  saveSession(session);
  if (session && session.shop && session.shop.id) setActiveWorkspace(shopWorkspace(session.shop.id));
  announce();
  return session;
}

// --- auth actions -------------------------------------------------------------------------
export async function register({ email, password, shopName }) {
  const data = await _transport('/register', { email, password, shopName });
  return activate(normalize(data));
}
export async function login({ email, password }) {
  const data = await _transport('/login', { email, password });
  return activate(normalize(data));
}
/** Exchange the refresh token for a fresh access token. Keeps the same shop/session otherwise. */
export async function refresh() {
  const s = loadSession();
  if (!s || !s.refreshToken) throw new Error('no-refresh-token');
  const data = await _transport('/refresh', { refreshToken: s.refreshToken });
  // If the session ENDED (logout) or SWITCHED accounts while this request was in flight, do not resurrect
  // or cross-contaminate it (audit: a pending refresh could restore a logged-out/other account).
  const cur = loadSession();
  if (!cur || cur.refreshToken !== s.refreshToken) throw new Error('session-changed');
  const next = { ...cur, token: data.token };
  saveSession(next);
  announce();
  return next;
}
/** Sign out: clear the session and return to the on-device guest workspace. Data is NOT deleted. */
export function logout() {
  clearSession();
  setActiveWorkspace(LOCAL_WORKSPACE);
  announce();
}

// --- guest → shop migration (explicit, never silent) --------------------------------------
/** Does the on-device guest workspace hold any data worth offering to move into the shop? */
export function guestDataExists() { return workspaceHasData(LOCAL_WORKSPACE); }
/** Does the signed-in (or given) shop already have its own data? */
export function shopHasData(shopId) {
  const id = shopId || (currentShop() && currentShop().id);
  return id ? workspaceHasData(shopWorkspace(id)) : false;
}
/**
 * Copy the guest workspace's data into the shop workspace. By default it will NOT overwrite data the
 * shop already has (copyWorkspace enforces this). Returns { copied, skipped, error? }.
 */
export function migrateGuestIntoShop(shopId, { overwrite = false } = {}) {
  const id = shopId || (currentShop() && currentShop().id);
  if (!id) return { copied: 0, skipped: 0, error: 'No shop in session' };
  return copyWorkspace(LOCAL_WORKSPACE, shopWorkspace(id), { overwrite });
}

// --- React hook ---------------------------------------------------------------------------
export function useSession() {
  const [session, setSession] = useState(loadSession);
  useEffect(() => {
    const refreshState = () => setSession(loadSession());
    window.addEventListener(SESSION_EVENT, refreshState);
    window.addEventListener('storage', refreshState);
    return () => {
      window.removeEventListener(SESSION_EVENT, refreshState);
      window.removeEventListener('storage', refreshState);
    };
  }, []);
  return { session, shop: session ? session.shop : null, loggedIn: !!(session && session.token) };
}
