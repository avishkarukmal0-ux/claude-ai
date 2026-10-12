// Business/compliance profile captured at onboarding — the facts that decide which compliance tools and
// deadlines actually apply to THIS shop. Workspace-scoped + synced (business_profile_v1). Framework-free core
// (pure helpers unit-tested) with a thin React hook.
//
// Fields (all optional; null = "not told us yet"):
//   entity        'sole-trader' | 'ltd'
//   turnoverBand  'under-30k' | '30k-50k' | 'over-50k'
//   region        'england' | 'scotland' | 'wales' | 'ni'
import { useEffect, useState } from 'react';
import { readJSON, writeJSON } from './storage';

const NAME = 'business_profile_v1';

export const ENTITIES = [
  { id: 'sole-trader', label: 'Sole trader' },
  { id: 'ltd', label: 'Limited company' },
];
export const TURNOVER_BANDS = [
  { id: 'under-30k', label: 'Under £30k' },
  { id: '30k-50k', label: '£30k–£50k' },
  { id: 'over-50k', label: 'Over £50k' },
];
export const REGIONS = [
  { id: 'england', label: 'England' },
  { id: 'scotland', label: 'Scotland' },
  { id: 'wales', label: 'Wales' },
  { id: 'ni', label: 'Northern Ireland' },
];

// MTD for Income Tax Self Assessment (MTD ITSA). It applies to SOLE TRADERS and landlords by qualifying
// income — NOT to limited companies (those are Corporation Tax, a separate regime). Phased mandation:
//   • from 6 Apr 2026: qualifying income over £50,000
//   • from 6 Apr 2027: over £30,000
//   • from 6 Apr 2028: over £20,000 (announced; the 'under-30k' band stays out until confirmed/closer)
// Source: https://www.gov.uk/guidance/sign-up-your-business-for-making-tax-digital-for-income-tax
export const MTD_50K_FROM = Date.UTC(2026, 3, 6); // 6 Apr 2026
export const MTD_30K_FROM = Date.UTC(2027, 3, 6); // 6 Apr 2027

/** Does MTD for Income Tax apply to this shop yet? Pure — the single source of truth for every MTD gate. */
export function mtdApplies(profile, now = new Date()) {
  if (!profile || profile.entity !== 'sole-trader') return false; // Ltd / unknown → no MTD ITSA
  const t = (now instanceof Date ? now : new Date(now)).getTime();
  if (profile.turnoverBand === 'over-50k') return t >= MTD_50K_FROM;
  if (profile.turnoverBand === '30k-50k') return t >= MTD_30K_FROM;
  return false; // under-30k or band unknown → not mandated yet
}

/** Short reason the MTD tool is/ isn't shown — surfaced inside the tool if it is opened directly. */
export function mtdReason(profile, now = new Date()) {
  if (!profile || !profile.entity) return 'Add your tax details (sole trader / company + turnover) to see if MTD applies.';
  if (profile.entity === 'ltd') return 'MTD for Income Tax is for sole traders — a limited company files Corporation Tax instead.';
  if (profile.turnoverBand === 'under-30k') return 'MTD for Income Tax starts at £30k turnover (from Apr 2027). Below that it isn’t mandated yet.';
  if (profile.turnoverBand === '30k-50k' && !mtdApplies(profile, now)) return 'At £30k–£50k you’re mandated from 6 April 2027.';
  return null;
}

// Yes/No/unknown — a tri-state so we can tell "said no" from "hasn't answered".
function bool3(v) { return v === true || v === false ? v : null; }

function normalise(raw) {
  const p = raw && typeof raw === 'object' ? raw : {};
  const pick = (v, allow) => (allow.some((a) => a.id === v) ? v : null);
  return {
    entity: pick(p.entity, ENTITIES),
    turnoverBand: pick(p.turnoverBand, TURNOVER_BANDS),
    region: pick(p.region, REGIONS), // the shop's UK nation
    employees50: bool3(p.employees50), // 50+ employees incl. any group (HFSS volume promos)
    sellsAnimals: bool3(p.sellsAnimals), // sells live animals as pets
    importsFood: bool3(p.importsFood), // imports food directly (legally responsible party)
    festivalsOn: bool3(p.festivalsOn), // owner opted into cultural-festival nudges (null = family default)
  };
}

export function getBusinessProfile() { return normalise(readJSON(NAME, null)); }

/** Merge a patch into the saved profile. Returns the storage write result. */
export function saveBusinessProfile(patch) {
  const next = normalise({ ...getBusinessProfile(), ...patch });
  return writeJSON(NAME, next);
}

export function useBusinessProfile() {
  const [profile, setProfile] = useState(getBusinessProfile);
  useEffect(() => {
    const refresh = () => setProfile(getBusinessProfile());
    window.addEventListener('storage', refresh);
    window.addEventListener('vendora:workspace', refresh);
    return () => { window.removeEventListener('storage', refresh); window.removeEventListener('vendora:workspace', refresh); };
  }, []);
  const update = (patch) => { const res = saveBusinessProfile(patch); if (res.ok) setProfile(getBusinessProfile()); return res; };
  return { profile, update };
}
