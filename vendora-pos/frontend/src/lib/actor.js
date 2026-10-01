// Action attribution — who did this, from the signed-in session. Records in this local-first app are
// written on the device, so attribution is a best-effort audit trail (who was signed in when the action
// was taken), not a forensic guarantee. The authoritative identity is the signed-in member; a guest /
// accounts-off session attributes to "Owner" (there's only one person on that device).
import { currentMember, currentRole } from './account';

/** { id, name, role } for whoever is signed in right now. */
export function currentActor() {
  const m = currentMember();
  if (m && m.name) return { id: m.id || null, name: m.name, role: m.role || currentRole() };
  return { id: null, name: 'Owner', role: currentRole() };
}

/** Display name only (what the weekly report and cards show). */
export function actorName() { return currentActor().name; }

/**
 * Attach attribution fields to a record. Adds a generic `actor`/`actorId`/`actorRole` plus, optionally,
 * a domain-specific field name the existing readers expect (e.g. `receivedBy`, `by`). Never overwrites a
 * value already present, so re-stamping an existing record is safe.
 */
export function stamp(record = {}, { field } = {}) {
  const a = currentActor();
  const out = { ...record };
  if (out.actor == null) out.actor = a.name;
  if (out.actorId == null) out.actorId = a.id;
  if (out.actorRole == null) out.actorRole = a.role;
  if (field && out[field] == null) out[field] = a.name;
  return out;
}
