// Sign-out orchestration (Phase 1.4 / 1.1) — the one place that safely ends a session.
//
// This sits ABOVE account.js and sync.js (it imports both) so neither of those has to depend on the
// other (account.js stays sync-engine-free; sync.js depends only on account). Keeping the orchestration
// here avoids an import cycle and makes the "flush → final push → purge" flow unit-testable on its own.
//
// Why it matters:
//  - Pending work: before we wipe this device's copy of the shop data, we flush durable writes and try a
//    final sync so unsynced changes reach the cloud rather than being lost (the mandate: "explain and
//    safely handle pending changes before logout").
//  - Shared device: by default sign-out PURGES the shop's cached data from this device so the next person
//    can't recover it. "Keep data on this device" opts out for a personal phone.
import { flushDurable } from './storage';
import { logout } from './account';
import { getSyncState, syncNow } from './sync';

/** How many local changes are still waiting to reach the server. 0 when accounts/sync are off. */
export function pendingCount() {
  try { return getSyncState().pending || 0; }
  catch { return 0; }
}

/**
 * Best-effort durability + push: flush in-flight IndexedDB writes, then attempt one sync. Returns the
 * number of changes STILL unsynced afterwards (0 = everything is safely in the cloud). Never throws.
 */
export async function flushAndSync() {
  try { await flushDurable(); } catch { /* ignore */ }
  try { await syncNow(); } catch { /* ignore */ }
  return pendingCount();
}

/**
 * Safely sign out.
 *  - `trySync` (default true): flush + attempt a final push first when there are unsynced changes.
 *  - `purge` (default true): wipe this device's copy of the shop data after signing out (shared-device
 *    safety). Pass false to keep the local cache on a personal device.
 * Returns { remaining, purged }: `remaining` = unsynced changes that could NOT be pushed (e.g. offline),
 * so the caller can warn honestly that those will be dropped from this device if it purges.
 */
export async function signOut({ purge = true, trySync = true } = {}) {
  let remaining = pendingCount();
  if (trySync && remaining > 0) remaining = await flushAndSync();
  logout({ purge });
  return { remaining, purged: purge };
}
