// Minimal promise-based IndexedDB key/value store — the durable backing for storage.js.
//
// Why: localStorage has a ~5MB per-origin cap, no transactions, and is the first thing browsers
// evict under storage pressure. IndexedDB is large, transactional, and more resilient. We use it
// as a durable mirror beneath the existing synchronous storage API (see storage.js): every write
// is mirrored here, and on boot any data missing from localStorage (evicted, or too big to fit)
// is restored from here.
//
// Best-effort by design: every method is guarded so a browser without IndexedDB, or a private-mode
// failure, simply reports `available() === false` and the caller falls back to localStorage alone.
// No external dependencies.

const DB_NAME = 'vendora';
const STORE = 'kv';
const VERSION = 1;
let _dbPromise = null;

function impl() {
  try { return typeof indexedDB !== 'undefined' && indexedDB ? indexedDB : null; }
  catch { return null; }
}

/** True when this environment has a usable IndexedDB. */
export function available() { return !!impl(); }

function openDB() {
  if (_dbPromise) return _dbPromise;
  const idb = impl();
  if (!idb) return Promise.reject(new Error('no-indexeddb'));
  _dbPromise = new Promise((resolve, reject) => {
    let req;
    try { req = idb.open(DB_NAME, VERSION); }
    catch (e) { reject(e); return; }
    req.onupgradeneeded = () => {
      try {
        const db = req.result;
        if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE);
      } catch { /* store may already exist */ }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error || new Error('idb-open-failed'));
    req.onblocked = () => reject(new Error('idb-blocked'));
  });
  // If opening fails, allow a later retry rather than caching the rejection forever.
  _dbPromise.catch(() => { _dbPromise = null; });
  return _dbPromise;
}

/** All entries as [{ key, value }]. */
export async function getAll() {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const out = [];
    let tx;
    try { tx = db.transaction(STORE, 'readonly'); }
    catch (e) { reject(e); return; }
    const req = tx.objectStore(STORE).openCursor();
    req.onsuccess = () => {
      const cur = req.result;
      if (cur) { out.push({ key: cur.key, value: cur.value }); cur.continue(); }
      else resolve(out);
    };
    req.onerror = () => reject(req.error);
  });
}

/** Store a raw string under a full key. Resolves true on commit. */
export async function set(key, value) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    let tx;
    try { tx = db.transaction(STORE, 'readwrite'); }
    catch (e) { reject(e); return; }
    tx.objectStore(STORE).put(value, key);
    tx.oncomplete = () => resolve(true);
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error || new Error('idb-abort'));
  });
}

/** Delete a full key. */
export async function del(key) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    let tx;
    try { tx = db.transaction(STORE, 'readwrite'); }
    catch (e) { reject(e); return; }
    tx.objectStore(STORE).delete(key);
    tx.oncomplete = () => resolve(true);
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error || new Error('idb-abort'));
  });
}

/** Test hook: drop the cached DB handle. */
export function _resetForTest() { _dbPromise = null; }
