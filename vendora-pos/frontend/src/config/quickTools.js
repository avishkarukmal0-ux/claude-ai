// Quick-tools registry — glance-and-go utilities on the home screen.
// These are HELPERS ONLY: no sales, no payments, no backend, work offline.
// Universal tools show for every shop; gated tools show only when the shop qualifies:
//   • requiresModule — the family's module set must include it (e.g. age-check for age-restricted shops)
//   • hideForMembers — hidden for specific shop-type members (e.g. MUP makes no sense for a vape-only shop)
//   • gate(ctx, now)  — a predicate over { familyId, memberId, profile } for rules that depend on the business
//                       profile (MTD only for a qualifying sole trader; MUP only in Scotland/Wales).
import { FileClock, Percent, ShieldCheck, ShieldAlert, Wine, Cloud, ShieldX, Thermometer, Tags, PackageCheck, Scale, BadgeCheck, Beef, Globe2, HeartPulse, Pill, MapPin, PawPrint, Syringe, AlertOctagon } from 'lucide-react';
import MtdCountdown from '../components/quicktools/MtdCountdown';
import MarginCalculator from '../components/quicktools/MarginCalculator';
import AgeCheckHelper from '../components/quicktools/AgeCheckHelper';
import ComplianceRadar from '../components/quicktools/ComplianceRadar';
import MupCalculator from '../components/quicktools/MupCalculator';
import VpdCalculator from '../components/quicktools/VpdCalculator';
import RefusalsLogTool from '../components/quicktools/RefusalsLogTool';
import VapeProductCheck from '../components/quicktools/VapeProductCheck';
import TemperatureLogTool from '../components/quicktools/TemperatureLogTool';
import PpdsLabelTool from '../components/quicktools/PpdsLabelTool';
import WeighLabelTool from '../components/quicktools/WeighLabelTool';
import FoodRegistrationTool from '../components/quicktools/FoodRegistrationTool';
import TraceabilityTool from '../components/quicktools/TraceabilityTool';
import ImportLabelCheck from '../components/quicktools/ImportLabelCheck';
import HealthClaimCheck from '../components/quicktools/HealthClaimCheck';
import SupplementCheck from '../components/quicktools/SupplementCheck';
import TradingPermitsTool from '../components/quicktools/TradingPermitsTool';
import AnimalLicenceTool from '../components/quicktools/AnimalLicenceTool';
import VetMedCheck from '../components/quicktools/VetMedCheck';
import RecallLogTool from '../components/quicktools/RecallLogTool';
import { getFamily } from './shopTypes';
import { mtdApplies } from '../lib/businessProfile';

const sellsAnimals = (ctx) => ctx.profile?.sellsAnimals === true;

export const QUICK_TOOLS = {
  'mtd-countdown': {
    id: 'mtd-countdown',
    label: 'MTD countdown',
    tagline: 'Days to your next filing',
    icon: FileClock,
    component: MtdCountdown,
    // MTD for Income Tax only applies to qualifying sole traders (see lib/businessProfile.mtdApplies).
    // Showing it to a limited company or a below-threshold trader would be misleading, so it's gated.
    gate: (ctx, now) => mtdApplies(ctx.profile, now),
  },
  'margin-calc': {
    id: 'margin-calc',
    label: 'Margin calculator',
    tagline: 'Cost + price → margin',
    icon: Percent,
    component: MarginCalculator,
    universal: true,
  },
  'compliance-radar': {
    id: 'compliance-radar',
    label: 'Compliance radar',
    tagline: 'Deadlines for your shop',
    icon: ShieldAlert,
    component: ComplianceRadar,
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
  'refusals-log': {
    id: 'refusals-log',
    label: 'Refusals log',
    tagline: 'Record a refused sale',
    icon: ShieldX,
    component: RefusalsLogTool,
    requiresModule: 'age-check',
  },
  'vape-check': {
    id: 'vape-check',
    label: 'Vape product check',
    tagline: 'Nicotine, bottle, tank & MHRA list',
    icon: PackageCheck,
    component: VapeProductCheck,
    requiresModule: 'age-check',
  },
  'mup': {
    id: 'mup',
    label: 'MUP floor',
    tagline: 'Min alcohol price check',
    icon: Wine,
    component: MupCalculator,
    requiresModule: 'age-check',
    hideForMembers: ['vape-cbd'], // no alcohol → MUP irrelevant
    // MUP is law in Scotland and Wales only. If the shop told us its region and it's England/NI, hide it;
    // if region is unknown we still show it (the tool itself lets you pick Scotland/Wales).
    gate: (ctx) => !ctx.profile?.region || ['scotland', 'wales'].includes(ctx.profile.region),
  },
  'vpd': {
    id: 'vpd',
    label: 'Vape duty',
    tagline: 'VPD reprice (Oct 2026)',
    icon: Cloud,
    component: VpdCalculator,
    requiresModule: 'age-check',
    hideForMembers: ['off-licence'], // an off-licence that doesn't sell vapes doesn't need this
  },
  'ppds-label': {
    id: 'ppds-label',
    label: 'PPDS label',
    tagline: "Natasha's Law allergen label",
    icon: Tags,
    component: PpdsLabelTool,
    requiresModule: 'allergens',
  },
  'temp-log': {
    id: 'temp-log',
    label: 'Temperature log',
    tagline: 'Fridge / freezer / hot-hold',
    icon: Thermometer,
    component: TemperatureLogTool,
    requiresModule: 'allergens',
  },
  'weigh-label': {
    id: 'weigh-label',
    label: 'Weigh & label',
    tagline: 'Weight → price → label',
    icon: Scale,
    component: WeighLabelTool,
    requiresModule: 'scale-labels', // fresh-weighed only
  },
  'food-registration': {
    id: 'food-registration',
    label: 'Registration & rating',
    tagline: 'Council registration & FHRS',
    icon: BadgeCheck,
    component: FoodRegistrationTool,
    requiresModule: 'allergens', // fresh-weighed + world-specialist
  },
  // --- Fresh & weighed: traceability ---
  'traceability': {
    id: 'traceability', label: 'Traceability', tagline: 'Origin card & licence log',
    icon: Beef, component: TraceabilityTool, requiresModule: 'scale-labels',
  },
  // --- World & specialist ---
  'import-label': {
    id: 'import-label', label: 'Import label check', tagline: 'Importer address, origin, allergens',
    icon: Globe2, component: ImportLabelCheck, families: ['world-specialist'],
  },
  'health-claim': {
    id: 'health-claim', label: 'Health-claim check', tagline: 'Flag unauthorised claims',
    icon: HeartPulse, component: HealthClaimCheck, families: ['world-specialist'],
  },
  'supplement-check': {
    id: 'supplement-check', label: 'Supplement check', tagline: 'Label + novel-food checklist',
    icon: Pill, component: SupplementCheck, families: ['world-specialist'],
  },
  // --- Mobile & value ---
  'trading-permits': {
    id: 'trading-permits', label: 'Trading permits', tagline: 'Consent, pitch & insurance',
    icon: MapPin, component: TradingPermitsTool, families: ['mobile-value'],
  },
  'recall-log': {
    id: 'recall-log', label: 'Recall log', tagline: 'Safety alerts you acted on',
    icon: AlertOctagon, component: RecallLogTool, families: ['mobile-value'],
  },
  'animal-licence': {
    id: 'animal-licence', label: 'Animal licence', tagline: 'Pet-selling licence & rules',
    icon: PawPrint, component: AnimalLicenceTool, families: ['mobile-value'], gate: sellsAnimals,
  },
  'vet-meds': {
    id: 'vet-meds', label: 'Vet medicines', tagline: 'AVM-GSL / NFA-VPS / POM-VPS',
    icon: Syringe, component: VetMedCheck, families: ['mobile-value'], gate: sellsAnimals,
  },
};

/**
 * Tools to show for a shop: universal ones + any whose required module the family has, minus those hidden for
 * this member or failing their gate. `shop` is { familyId, memberId?, profile? }.
 */
export function getQuickToolsForShop(shop = {}, now = new Date()) {
  const { familyId, memberId = null, profile = null } = shop;
  const fam = getFamily(familyId);
  const famModules = fam?.moduleIds || [];
  const ctx = { familyId, memberId, profile };
  return Object.values(QUICK_TOOLS).filter((t) => {
    // Eligible by: universal; an explicit family list; a required module the family has; or no constraint at
    // all (a `gate` decides, e.g. the MTD tool).
    let eligible;
    if (t.universal) eligible = true;
    else if (t.families) eligible = t.families.includes(familyId);
    else if (t.requiresModule) eligible = famModules.includes(t.requiresModule);
    else eligible = true;
    if (!eligible) return false;
    if (memberId && t.hideForMembers && t.hideForMembers.includes(memberId)) return false;
    if (t.gate && !t.gate(ctx, now)) return false;
    return true;
  });
}

/** Back-compat: tools for a family alone (no member/profile gating). Prefer getQuickToolsForShop. */
export function getQuickToolsForFamily(familyId) {
  return getQuickToolsForShop({ familyId });
}
