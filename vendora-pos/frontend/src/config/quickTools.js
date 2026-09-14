// Quick-tools registry — glance-and-go utilities on the home screen.
// These are HELPERS ONLY: no sales, no payments, no backend, work offline.
// Universal tools show for every shop; gated tools show only when the family's
// module set qualifies (e.g. age-check for age-restricted shops).

import { FileClock, Percent, ShieldCheck } from 'lucide-react';
import MtdCountdown from '../components/quicktools/MtdCountdown';
import MarginCalculator from '../components/quicktools/MarginCalculator';
import AgeCheckHelper from '../components/quicktools/AgeCheckHelper';
import { getFamily } from './shopTypes';

export const QUICK_TOOLS = {
  'mtd-countdown': {
    id: 'mtd-countdown',
    label: 'MTD countdown',
    tagline: 'Days to your next filing',
    icon: FileClock,
    component: MtdCountdown,
    universal: true,
  },
  'margin-calc': {
    id: 'margin-calc',
    label: 'Margin calculator',
    tagline: 'Cost + price → margin',
    icon: Percent,
    component: MarginCalculator,
    universal: true,
  },
  'age-check': {
    id: 'age-check',
    label: 'Age check',
    tagline: 'Challenge 25 helper',
    icon: ShieldCheck,
    component: AgeCheckHelper,
    // Shown only for families whose module set includes age verification.
    requiresModule: 'age-check',
  },
};

/** Tools to show for a family: all universal ones + any whose required module the family has. */
export function getQuickToolsForFamily(familyId) {
  const fam = getFamily(familyId);
  const famModules = fam?.moduleIds || [];
  return Object.values(QUICK_TOOLS).filter(
    (t) => t.universal || (t.requiresModule && famModules.includes(t.requiresModule))
  );
}
