// Backup + restore for the active workspace's data. Versioned, validated, and safe:
// a restore takes an in-memory recovery snapshot first and rolls back on any failure, so it
// can never leave the device half-written or claim success after a partial write.
//
// Format v2 stores LOGICAL store names (not raw keys) so a backup is portable across
// workspaces. v1 backups (raw `vendora_*` keys) are still accepted and mapped in.
import {
  STORE_NAMES, read, write, removeKey, getActiveWorkspace,
} from './storage';

const BACKUP_VERSION = 2;

// Device-level record of the last successful LOCAL export (Phase 1.3c — "show the last successful backup").
// Not workspace-scoped and not synced: it's about this device's export habit. Stored directly in
// localStorage so it never participates in sync or a backup file.
const LAST_BACKUP_KEY = 'vendora:last_backup';
function markBackupDone() {
  try { localStorage.setItem(LAST_BACKUP_KEY, String(Date.now())); } catch { /* ignore */ }
}
/** Epoch ms of the last successful local export on this device, or 0 if never. */
export function getLastBackupAt() {
  try { const n = Number(localStorage.getItem(LAST_BACKUP_KEY)); return Number.isFinite(n) ? n : 0; }
  catch { return 0; }
}

// --- build -----------------------------------------------------------------
export function buildBackup(ws = getActiveWorkspace()) {
  const data = {};
  for (const name of STORE_NAMES) {
    const v = read(name, null, ws);
    if (v != null) data[name] = v; // raw string, lossless
  }
  return { app: 'vendora', version: BACKUP_VERSION, exportedAt: new Date().toISOString(), workspace: ws, data };
}

export function backupFilename(prefix = 'vendora-backup') {
  return `${prefix}-${new Date().toISOString().slice(0, 10)}.json`;
}

export function downloadBackup(ws = getActiveWorkspace(), prefix) {
  try {
    const json = JSON.stringify(buildBackup(ws), null, 2);
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = backupFilename(prefix);
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    markBackupDone();
    return true;
  } catch {
    return false;
  }
}

export async function shareBackup(ws = getActiveWorkspace()) {
  try {
    const json = JSON.stringify(buildBackup(ws), null, 2);
    const file = new File([json], backupFilename(), { type: 'application/json' });
    if (navigator.canShare && navigator.canShare({ files: [file] })) {
      await navigator.share({ files: [file], title: 'Vendora backup' });
      markBackupDone();
      return true;
    }
  } catch { /* fall through */ }
  return false;
}

// --- parse + validate (no mutation) ---------------------------------------
const LEGACY_PREFIX = 'vendora_';

/** Normalise a backup's data into { logicalName: rawString } and validate. */
export function readBackup(text) {
  let parsed;
  try { parsed = JSON.parse(text); }
  catch { return { ok: false, error: 'That file isn’t valid JSON.' }; }

  if (!parsed || typeof parsed !== 'object' || parsed.app !== 'vendora' || !parsed.data || typeof parsed.data !== 'object') {
    return { ok: false, error: 'That doesn’t look like a Vendora backup.' };
  }
  if (typeof parsed.version !== 'number' || parsed.version > BACKUP_VERSION) {
    return { ok: false, error: 'This backup was made by a newer version of Vendora. Update the app first.' };
  }

  const known = new Set(STORE_NAMES);
  const data = {};
  const summary = {};
  const corrupt = [];
  for (const [rawKey, value] of Object.entries(parsed.data)) {
    if (typeof value !== 'string') continue; // we only store raw string values
    const name = rawKey.startsWith(LEGACY_PREFIX) ? rawKey.slice(LEGACY_PREFIX.length) : rawKey;
    if (!known.has(name)) continue; // ignore unknown/unrelated keys — never import them
    // Validate the SHAPE before we'd ever write it. Every store except shop_type holds JSON; a value that
    // doesn't parse is corrupt and must not silently replace real data (audit W17). shop_type is a plain
    // "family:member" token.
    if (name === 'shop_type') {
      if (!value.trim()) { corrupt.push(name); continue; }
      summary[name] = 1;
    } else {
      try {
        const v = JSON.parse(value);
        summary[name] = Array.isArray(v) ? v.length : 1;
      } catch { corrupt.push(name); continue; }
    }
    data[name] = value;
  }
  if (corrupt.length) {
    return { ok: false, error: `This backup is corrupt (bad data in: ${corrupt.join(', ')}). Nothing was changed.` };
  }
  if (Object.keys(data).length === 0) {
    return { ok: false, error: 'This backup has no recognisable Vendora data.' };
  }
  return { ok: true, meta: { version: parsed.version, exportedAt: parsed.exportedAt, workspace: parsed.workspace }, data, summary };
}

// --- restore (atomic w/ rollback) -----------------------------------------
/**
 * Restore normalised { name: rawString } into the active workspace.
 * mode 'replace' (default): our store keys not in the backup are CLEARED; unrelated keys
 *   (tokens/accounts/other) are never touched. mode 'merge': only writes backup keys.
 * Takes an in-memory snapshot of the affected keys first and rolls back if any write fails.
 * @returns { ok, restored, cleared, error? }
 */
export function restoreBackup(data, { mode = 'replace', ws = getActiveWorkspace() } = {}) {
  if (!data || typeof data !== 'object') return { ok: false, error: 'Nothing to restore.' };

  // 1. Snapshot the keys we may touch (only our STORE_NAMES — never anything else).
  const snapshot = {};
  for (const name of STORE_NAMES) snapshot[name] = read(name, null, ws);

  // Rollback reports whether it FULLY restored the snapshot — if storage is refusing writes, even the
  // rollback can fail, and we must say so honestly rather than claim "nothing changed" (audit W17).
  const rollback = () => {
    let fullyRestored = true;
    for (const name of STORE_NAMES) {
      const res = snapshot[name] == null ? removeKey(name, ws) : write(name, snapshot[name], ws);
      if (res && res.ok === false) fullyRestored = false;
    }
    return fullyRestored;
  };
  const failed = (reason) => {
    const rolledBack = rollback();
    return rolledBack
      ? { ok: false, error: `${reason} Your data was left unchanged.` }
      : { ok: false, rollbackFailed: true, error: `${reason} And the device then refused to restore the previous data — recover from the safety backup that was just downloaded.` };
  };

  try {
    let restored = 0; let cleared = 0;
    for (const name of STORE_NAMES) {
      if (Object.prototype.hasOwnProperty.call(data, name)) {
        const res = write(name, data[name], ws);
        if (!res.ok) return failed(res.error || 'Write failed.');
        restored += 1;
      } else if (mode === 'replace') {
        const res = removeKey(name, ws);
        if (!res.ok) return failed('Couldn’t clear old data.');
        cleared += 1;
      }
    }
    return { ok: true, restored, cleared };
  } catch (e) {
    return failed('Restore failed.');
  }
}

/**
 * Convenience: parse + validate + restore (replace) in one call, with rollback on failure.
 * Kept for existing callers. Returns { ok, count, error? }.
 */
export function restoreFromText(text, opts = {}) {
  const parsed = readBackup(text);
  if (!parsed.ok) return { ok: false, error: parsed.error };
  const res = restoreBackup(parsed.data, opts);
  if (!res.ok) return { ok: false, error: res.error };
  return { ok: true, count: res.restored };
}
