// Conflict recovery (Phase 1.1g) — never silently lose a device's edit to last-write-wins.
//
// Sync resolves a genuine two-device conflict last-write-wins at whole-store granularity (see sync.js /
// pwaSyncService.js). The winner's blob replaces the loser's, so the losing device's edits to OTHER items
// in that same store would otherwise vanish without trace. Before we overwrite a local value we were
// trying to keep, we stash a copy here so the owner can review/recover it — and the UI tells them it
// happened. This store is workspace-local: it is NOT in STORE_NAMES, so it never syncs and never lands in
// a backup; it is purged with the workspace on sign-out.
import { readJSON, writeJSON, getActiveWorkspace } from './storage';

const KEY = 'conflict_backup_v1';
const CAP = 20; // keep the most recent N; a convenience safety net, not an archive

/** Save the local value that just lost a conflict, so it can be recovered. */
export function stashConflict(ws, { name, value, at } = {}) {
  if (!ws || !name) return;
  const list = readJSON(KEY, [], ws) || [];
  list.unshift({ name, value: value == null ? '' : String(value), at: at || Date.now() });
  writeJSON(KEY, list.slice(0, CAP), ws);
}

/** The stashed, not-yet-cleared replaced-by-another-device edits for a workspace (newest first). */
export function listConflicts(ws = getActiveWorkspace()) {
  return readJSON(KEY, [], ws) || [];
}

export function conflictCount(ws = getActiveWorkspace()) {
  return listConflicts(ws).length;
}

/** Forget the stashed copies (after the owner has reviewed/downloaded them). */
export function clearConflicts(ws = getActiveWorkspace()) {
  writeJSON(KEY, [], ws);
}
