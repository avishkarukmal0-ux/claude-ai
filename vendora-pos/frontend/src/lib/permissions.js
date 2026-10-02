// Role permissions — the CLIENT mirror of the backend's rules (pwaSyncService). This only decides which
// screens and controls the app shows; the real guard is server-side, so a tampered client still can't
// write or read a store its role isn't allowed. Three roles:
//   owner   — everything, including managing staff.
//   manager — everything operational + money, but cannot manage staff.
//   staff   — the shop floor: stock, deliveries, counts, waste, tasks, buy lists. No money records.
// Guest/legacy sessions have no role and are treated as the owner of their own on-device workspace.

export const ROLES = ['owner', 'manager', 'staff'];

// Money/financial stores a staff role may neither read nor write (mirrors backend FINANCIAL_STORES).
export const FINANCIAL_STORES = new Set(['takings_v1', 'claims_v1', 'credit_notes_v1', 'invoices_v1']);

// Workflow screens that deal with money or cost intelligence — hidden from the staff role.
export const MONEY_SCREENS = new Set([
  'takings', 'overview', 'outcomes', 'weekly-report',
  'claims', 'credit-notes', 'invoices', 'price-history', 'price-alerts',
  'journey', // buying journey surfaces claim/credit figures → owner/manager only
  'supplier-insights', 'payments', // costs, spend, bills → owner/manager only
]);

function norm(role) { return ROLES.includes(role) ? role : 'owner'; }

/** Can this role WRITE this store? (mirror of the backend) */
export function canWriteStore(role, name) {
  if (norm(role) === 'staff') return !FINANCIAL_STORES.has(name);
  return true;
}

/** Can this role open this workflow screen? */
export function canSeeScreen(role, screen) {
  const r = norm(role);
  if (screen === 'staff-admin') return r === 'owner';
  if (MONEY_SCREENS.has(screen)) return r === 'owner' || r === 'manager';
  return true;
}

/** Capability checks for discrete controls. */
export function can(role, capability) {
  const r = norm(role);
  switch (capability) {
    case 'manageStaff': return r === 'owner';
    case 'money': return r === 'owner' || r === 'manager';
    case 'notificationsEmail': return r === 'owner' || r === 'manager'; // who edits the shop email digest
    case 'ops': return true;
    default: return r === 'owner';
  }
}

export function roleLabel(role) {
  const r = norm(role);
  return r === 'owner' ? 'Owner' : r === 'manager' ? 'Manager' : 'Staff';
}
