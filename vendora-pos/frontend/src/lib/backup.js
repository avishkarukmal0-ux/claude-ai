// Local data backup + restore. All app data lives in localStorage under
// "vendora_" keys; this bundles it into one JSON file the shop can save and
// restore on another device — peace of mind before the backend exists.

const PREFIX = 'vendora_';
const APP_KEYS = [
  'vendora_shop_type',
  'vendora_inventory_v1',
  'vendora_suppliers_v1',
  'vendora_buylist_v1',
  'vendora_waste_v1',
  'vendora_takings_v1',
];

export function buildBackup() {
  const data = {};
  try {
    // Grab known keys plus any future vendora_* keys, so backups stay complete.
    const keys = new Set(APP_KEYS);
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k && k.startsWith(PREFIX)) keys.add(k);
    }
    for (const k of keys) {
      const v = localStorage.getItem(k);
      if (v != null) data[k] = v;
    }
  } catch { /* storage blocked */ }
  return { app: 'vendora', version: 1, exportedAt: new Date().toISOString(), data };
}

export function backupFilename() {
  return `vendora-backup-${new Date().toISOString().slice(0, 10)}.json`;
}

/** Trigger a download of the backup JSON. Returns true if it started. */
export function downloadBackup() {
  try {
    const json = JSON.stringify(buildBackup(), null, 2);
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = backupFilename();
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    return true;
  } catch {
    return false;
  }
}

/** Share the backup as a file where supported (nice on iOS). Returns true if shared. */
export async function shareBackup() {
  try {
    const json = JSON.stringify(buildBackup(), null, 2);
    const file = new File([json], backupFilename(), { type: 'application/json' });
    if (navigator.canShare && navigator.canShare({ files: [file] })) {
      await navigator.share({ files: [file], title: 'Vendora backup' });
      return true;
    }
  } catch { /* fall through */ }
  return false;
}

/** Restore from a backup JSON string. Overwrites current data. Returns a result. */
export function restoreFromText(text) {
  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch {
    return { ok: false, error: 'That file isn’t a valid Vendora backup.' };
  }
  const data = parsed && parsed.data;
  if (!data || typeof data !== 'object' || parsed.app !== 'vendora') {
    return { ok: false, error: 'That doesn’t look like a Vendora backup.' };
  }
  try {
    let count = 0;
    for (const [k, v] of Object.entries(data)) {
      if (k.startsWith(PREFIX) && typeof v === 'string') { localStorage.setItem(k, v); count++; }
    }
    return { ok: true, count };
  } catch {
    return { ok: false, error: 'Couldn’t write the backup to this device.' };
  }
}
