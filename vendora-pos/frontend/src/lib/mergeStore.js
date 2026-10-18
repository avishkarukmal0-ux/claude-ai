// Per-item merge for the id-keyed sync stores — so two staff editing the SAME shop on two devices don't
// clobber each other's work the way whole-store last-write-wins does.
//
// The stores this applies to are JSON arrays of `{ id, … }` items:
//   orders_v1, deliveries_v1, claims_v1, credit_notes_v1  → mergeById (metadata, with delete tombstones)
//   movements_v1                                           → mergeMovements (append-only union; immutable rows)
//   inventory_v1                                           → mergeInventory (metadata by mtime; qty from the
//                                                            union-merged movement ledger, NOT last-write-wins)
//
// Rules (a small, explicit CRDT):
//  - Union by `id`. An item present on only one side is kept.
//  - For the same id, the copy with the newer modification time (`updatedAt`, falling back to `createdAt`)
//    wins. Ties keep the server's copy so every device converges to the same deterministic result.
//  - DELETES are tombstones — `{ id, _deleted: true, updatedAt }` — not removals, so a delete on one device
//    out-votes (by mtime) a stale live copy on another instead of being resurrected by the next merge.
//  - Tombstones older than TOMBSTONE_TTL_DAYS are garbage-collected during merge so they can't pile up.
//  - Items with no `id` are dropped (can't be merged safely).
//
// Pure + framework-free; the sync engine (sync.js) does the JSON parse/stringify and feeds these the arrays.

export const TOMBSTONE_TTL_DAYS = 90;
const DAY = 86400000;

// Stores that merge per-item instead of whole-store last-write-wins. Keep in lockstep with the strategy map.
export const MERGE_STORES = new Set([
  'inventory_v1', 'orders_v1', 'deliveries_v1', 'claims_v1', 'credit_notes_v1', 'movements_v1',
]);

const asArray = (v) => (Array.isArray(v) ? v : []);
const mtimeOf = (item) => Number(item && (item.updatedAt != null ? item.updatedAt : item.createdAt)) || 0;

export const isTombstone = (item) => !!(item && item._deleted);

/** Live (non-deleted, id-bearing) items — for display and all the existing derivations. */
export function liveItems(arr) {
  return asArray(arr).filter((x) => x && x.id != null && !x._deleted);
}

/** A tombstone marking an item id deleted at `now`. Carries only id + marker + mtime (the body is gone). */
export function tombstone(id, now = Date.now()) {
  return { id, _deleted: true, updatedAt: now };
}

/**
 * Merge two arrays of `{ id, updatedAt?/createdAt?, _deleted? }` by id. Newest mtime wins per id; a tie keeps
 * the `preferOnTie` side (default 'server'). Tombstones participate in the vote and are GC'd past `ttlDays`.
 * @returns merged array (still containing any live tombstones newer than the GC cutoff)
 */
export function mergeById(localArr, serverArr, { now = Date.now(), ttlDays = TOMBSTONE_TTL_DAYS, preferOnTie = 'server' } = {}) {
  const byId = new Map(); // id -> { item, side }
  const consider = (item, side) => {
    if (!item || item.id == null) return;
    const cur = byId.get(item.id);
    if (!cur) { byId.set(item.id, { item, side }); return; }
    const a = mtimeOf(cur.item);
    const b = mtimeOf(item);
    if (b > a || (b === a && side === preferOnTie)) byId.set(item.id, { item, side });
  };
  // Server first, then local, so the explicit tie rule (preferOnTie) decides equal-mtime collisions.
  for (const it of asArray(serverArr)) consider(it, 'server');
  for (const it of asArray(localArr)) consider(it, 'local');

  const cutoff = Number.isFinite(ttlDays) ? now - ttlDays * DAY : -Infinity;
  const out = [];
  for (const { item } of byId.values()) {
    if (isTombstone(item) && mtimeOf(item) < cutoff) continue; // GC an old tombstone
    out.push(item);
  }
  return out;
}

/**
 * Merge an append-only, immutable ledger (movements) by union of ids — rows are never edited or deleted, so
 * any copy of a given id is identical and first-seen wins. No tombstones, no GC (the ledger self-prunes by
 * age elsewhere). This is what makes stock quantities conflict-free: both devices' deltas survive the merge.
 */
export function mergeMovements(localArr, serverArr) {
  const byId = new Map();
  for (const it of asArray(serverArr)) if (it && it.id != null && !byId.has(it.id)) byId.set(it.id, it);
  for (const it of asArray(localArr)) if (it && it.id != null && !byId.has(it.id)) byId.set(it.id, it);
  return [...byId.values()];
}

/** Signed sum of movement deltas for one product. */
export function ledgerSum(records, productId) {
  return asArray(records).reduce((n, r) => (r && r.productId === productId ? n + (Number(r.delta) || 0) : n), 0);
}

const indexById = (arr) => {
  const m = new Map();
  for (const it of asArray(arr)) if (it && it.id != null) m.set(it.id, it);
  return m;
};

/**
 * Merge inventory. Metadata (name, price, category, …) merges by mtime per product id with tombstones, like
 * any other store. QUANTITY is the exception: last-write-wins on an absolute qty would silently drop the
 * other device's concurrent sales/waste. Instead each surviving product's qty is reconstructed as:
 *
 *     opening(winner side) + ledgerSum(mergedMovements, id)
 *
 * where opening = (winner.qty − ledgerSum(that side's movements, id)) is the pre-tracking baseline not
 * explained by movements (see movementStore.reconcileQty). Because `mergedMovements` is the UNION of both
 * devices' ledgers, this adds BOTH sides' recent stock deltas rather than letting one overwrite the other.
 *
 * Safety fallback: when we don't have a coherent movement picture (`movementsAvailable` false — e.g. a delta
 * pull that returned inventory but not the movements store), qty keeps the winner's absolute value, i.e. no
 * worse than today's last-write-wins for that product until the next sync that carries both stores.
 *
 * @param local            local inventory array
 * @param server           server inventory array
 * @param ctx.localMovements   local movement rows BEFORE the movements merge
 * @param ctx.serverMovements  server movement rows from this pull ([] if not returned)
 * @param ctx.mergedMovements  union of the two (defaults to mergeMovements(local, server))
 * @param ctx.movementsAvailable  whether to use movement-derived qty (default: true when server sent movements)
 */
export function mergeInventory(local, server, ctx = {}) {
  const {
    localMovements = [], serverMovements = [],
    mergedMovements = mergeMovements(localMovements, serverMovements),
    movementsAvailable = asArray(serverMovements).length > 0,
    now = Date.now(), ttlDays = TOMBSTONE_TTL_DAYS,
  } = ctx;

  const merged = mergeById(local, server, { now, ttlDays });
  if (!movementsAvailable) return merged; // safe fallback: keep winner's absolute qty

  const localById = indexById(local);
  const serverById = indexById(server);
  return merged.map((p) => {
    if (isTombstone(p)) return p;
    const l = localById.get(p.id);
    const s = serverById.get(p.id);
    // Which side's object won `p`? (p is a reference to the winning item from mergeById.)
    const winnerIsServer = p === s || (!l && !!s);
    const winnerQty = Number((winnerIsServer ? s : l) && (winnerIsServer ? s : l).qty) || 0;
    const sideMovements = winnerIsServer ? serverMovements : localMovements;
    const opening = winnerQty - ledgerSum(sideMovements, p.id);
    return { ...p, qty: opening + ledgerSum(mergedMovements, p.id) };
  });
}

/**
 * Strategy dispatcher: merge the parsed ARRAY values of a known store. Unknown stores return `server`
 * unchanged (the sync layer only calls this for MERGE_STORES). `ctx` carries movement context for inventory.
 */
export function mergeStoreArrays(name, localArr, serverArr, ctx = {}) {
  if (name === 'inventory_v1') return mergeInventory(localArr, serverArr, ctx);
  if (name === 'movements_v1') return mergeMovements(localArr, serverArr);
  if (name === 'orders_v1' || name === 'deliveries_v1' || name === 'claims_v1' || name === 'credit_notes_v1') {
    return mergeById(localArr, serverArr, ctx);
  }
  return asArray(serverArr);
}
