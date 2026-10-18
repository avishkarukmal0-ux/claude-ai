// Shared delete-tombstone store (per-item sync). Deletes in the id-keyed stores (inventory, orders,
// deliveries, claims, credit notes) stay HARD removals in those stores — their arrays and behaviour are
// unchanged — but the deleting device also records a tiny `{ k, store, id, at }` row here. This store syncs
// like any other, so other devices learn of the delete and the merge (lib/mergeStore) drops the item instead
// of resurrecting it from their still-live copy. Workspace-scoped via storage, same as every store.
import { readJSON, writeJSON } from './storage';
import { mergeTombstones, TOMBSTONE_TTL_DAYS } from './mergeStore';
import { now as clock } from './syncClock';

export const TOMBSTONES_STORE = 'sync_tombstones_v1';
const DAY = 86400000;

function load() {
  const a = readJSON(TOMBSTONES_STORE, []);
  return Array.isArray(a) ? a : [];
}

/** Read all tombstones for the active workspace. */
export function loadTombstones() { return load(); }

/**
 * Record that `id` in `store` was deleted at `at`. Replaces any earlier row for the same (store,id) with the
 * newer time, and prunes rows past the TTL so this can't grow without bound. Writing it fires the storage
 * write event, so the sync engine marks the tombstone store dirty and pushes it like any other store.
 */
export function recordTombstone(store, id, at = clock()) {
  if (!store || id == null) return { ok: false };
  const k = `${store}:${id}`;
  const cutoff = at - TOMBSTONE_TTL_DAYS * DAY;
  const kept = load().filter((t) => t && t.k !== k && (Number(t.at) || 0) >= cutoff);
  kept.push({ k, store, id, at });
  return writeJSON(TOMBSTONES_STORE, kept);
}

/** Undo support: forget a tombstone when its item is restored, so the merge won't re-delete it. */
export function clearTombstone(store, id) {
  if (!store || id == null) return { ok: false };
  const k = `${store}:${id}`;
  const cur = load();
  const next = cur.filter((t) => t && t.k !== k);
  if (next.length === cur.length) return { ok: true };
  return writeJSON(TOMBSTONES_STORE, next);
}

// Re-export so the sync engine has one import site for tombstone merging.
export { mergeTombstones };
