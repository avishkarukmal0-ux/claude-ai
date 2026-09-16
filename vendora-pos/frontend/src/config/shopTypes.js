// Shop-type registry — the single source of truth for Vendora's verticals.
//
// Organised as 4 FAMILIES, each defined by the module bundle it needs (not by the
// shop's name). Recognisable shop names live inside each family as `members` — a shop
// picks a family, then optionally its exact type. This is the `shopType` dial from the
// Go-To-Market plan: modules key off `family.id` (+ optional `member.id`), never on
// if/else in components. Add a vertical = add a member (or a family).

import {
  Store, Scale, Globe, Tag,
  Wine, Newspaper, Cloud, ShoppingBasket,
  Carrot, Beef, Croissant,
  Leaf, Truck, BadgePercent, PawPrint,
  LayoutDashboard, ScanLine, Package, CalendarClock, FileText,
  ShieldCheck, ClipboardList, CalendarHeart, AlertTriangle, Banknote, ShoppingCart, Coins, Hourglass,
} from 'lucide-react';

export const SHOP_FAMILIES = [
  {
    id: 'grocery-age',
    label: 'Grocery & age-restricted',
    tagline: 'Everyday retail with age checks',
    icon: Store,
    accent: '#2563EB', // brand blue
    // Shared: barcode grocery + goods-in + margins + age-verification + PMP.
    // Burden-first value promises shown when this family is picked.
    promises: [
      'Your HMRC (MTD) filing just happens',
      'Scan the cash-&-carry trolley — stock’s done',
      'Age checks logged for you',
    ],
    moduleIds: ['age-check'],
    supplierIdeas: ['Cash & carry (Booker / Bestway)', 'Soft-drinks wholesaler', 'Tobacco / vape supplier', 'Newspaper distributor', 'Bread & milk roundsman'],
    members: [
      { id: 'convenience', label: 'Convenience / Mini-mart', icon: ShoppingBasket, extra: 'Everyday grocery & chilled' },
      { id: 'off-licence', label: 'Off-licence', icon: Wine, extra: 'Alcohol duty & MUP' },
      { id: 'newsagent', label: 'Newsagent / CTN', icon: Newspaper, extra: 'News sale-or-return & tobacco' },
      { id: 'vape-cbd', label: 'Vape & CBD', icon: Cloud, extra: 'Nicotine strength & compliance' },
    ],
  },
  {
    id: 'fresh-weighed',
    label: 'Fresh & weighed',
    tagline: 'Loose goods, scales & short shelf-life',
    icon: Scale,
    accent: '#16A34A', // green
    // Shared: scale/loose-weight + expiry/use-by + markdown + traceability/PPDS + production.
    promises: [
      'Stop paying twice for waste',
      'Weigh, price & label in one tap',
      'Use-by dates & traceability handled',
    ],
    moduleIds: ['scale-labels', 'allergens'],
    supplierIdeas: ['Fruit & veg market', 'Meat / fish supplier', 'Bakery ingredients wholesaler', 'Packaging supplier'],
    members: [
      { id: 'greengrocer', label: 'Greengrocer', icon: Carrot, extra: 'Loose produce & daily repricing' },
      { id: 'butcher', label: 'Butcher / Fishmonger', icon: Beef, extra: 'Cuts, scale & traceability' },
      { id: 'bakery-deli', label: 'Bakery / Deli', icon: Croissant, extra: 'Bake-to-demand & PPDS labels' },
    ],
  },
  {
    id: 'world-specialist',
    label: 'World & specialist foods',
    tagline: 'International & health-focused ranges',
    icon: Globe,
    accent: '#EA580C', // orange
    // Shared: perishables + suppliers + allergen/compliance + cultural-calendar demand.
    promises: [
      'Order ahead for Eid, Diwali & peak weeks',
      'Allergens & labels done right',
      'Every supplier’s prices in one place',
    ],
    moduleIds: ['festival', 'allergens'],
    supplierIdeas: ['Ethnic cash & carry', 'Import wholesaler', 'Halal meat supplier', 'Spice & dry-goods supplier'],
    members: [
      { id: 'ethnic-grocer', label: 'International grocer', icon: Globe, extra: 'World foods & fresh produce' },
      { id: 'health-food', label: 'Health-food', icon: Leaf, extra: 'Batch, expiry & allergens' },
    ],
  },
  {
    id: 'mobile-value',
    label: 'Mobile & value',
    tagline: 'Market stalls, value & specialist retail',
    icon: Tag,
    accent: '#7C3AED', // violet
    // Shared: ad-hoc/no-barcode pricing + phone-first + dead-stock reporting.
    promises: [
      'Price anything in seconds — no barcode needed',
      'Cash & card totals reconciled on your phone',
      'See what’s not selling',
    ],
    moduleIds: ['reconcile'],
    supplierIdeas: ['General cash & carry', 'Clearance / wholesale', 'Pet-food wholesaler'],
    members: [
      { id: 'market-trader', label: 'Market trader', icon: Truck, extra: 'Phone-first cash & card' },
      { id: 'discount-pound', label: 'Discount / Pound', icon: BadgePercent, extra: 'Ad-hoc pricing & dead-stock' },
      { id: 'pet-shop', label: 'Pet shop', icon: PawPrint, extra: 'Repeat orders & dated stock' },
    ],
  },
];

// ---- Module catalog ----------------------------------------------------------
// Every module a shop can see. Which set a shop gets = CORE + its family's extras.
// `live: false` = not built on mobile yet (shows a "Soon" badge on the home screen).
export const MODULES = {
  'goods-in':  { id: 'goods-in',    label: 'Goods-in scan',  icon: ScanLine,        desc: 'Scan the trolley on arrival', live: true, tab: 'scan' },
  inventory:   { id: 'inventory',   label: 'Inventory',      icon: Package,         desc: 'Products, prices & stock', live: true, tab: 'stock' },
  expiry:      { id: 'expiry',      label: 'Expiry & waste', icon: CalendarClock,   desc: 'Stop paying twice for waste', live: true, screen: 'waste' },
  reorder:     { id: 'reorder',     label: 'Buy list',       icon: ShoppingCart,    desc: 'Low stock → cash-&-carry list', live: true, screen: 'reorder' },
  deadstock:   { id: 'deadstock',   label: 'Slow stock',     icon: Hourglass,       desc: 'Money not moving', live: true, screen: 'deadstock' },
  suppliers:   { id: 'suppliers',   label: 'Suppliers',      icon: Truck,           desc: 'Your regular buying places', live: true, screen: 'suppliers' },
  takings:     { id: 'takings',     label: 'Takings & cash-up', icon: Coins,        desc: 'Day takings + drawer count', live: true, screen: 'takings' },
  overview:    { id: 'overview',    label: 'Owner glance',   icon: LayoutDashboard, desc: 'Takings, waste & margin', live: true, screen: 'overview' },
  mtd:         { id: 'mtd',         label: 'MTD books',      icon: FileText,        desc: 'HMRC filing, sorted', live: false },
  'age-check': { id: 'age-check',   label: 'Age checks',     icon: ShieldCheck,     desc: 'Logged & audit-ready', live: false },
  'scale-labels': { id: 'scale-labels', label: 'Scale & labels', icon: ClipboardList, desc: 'Weigh, price & PPDS', live: false },
  'festival':  { id: 'festival',    label: 'Festival planner', icon: CalendarHeart, desc: 'Order ahead for peak weeks', live: false },
  allergens:   { id: 'allergens',   label: 'Allergens',      icon: AlertTriangle,   desc: 'PPDS & Natasha’s Law', live: false },
  reconcile:   { id: 'reconcile',   label: 'Cash & card',    icon: Banknote,        desc: 'Totals reconciled on your phone', live: false },
};

// Core modules every shop gets, in display order.
export const CORE_MODULE_IDS = ['goods-in', 'inventory', 'reorder', 'deadstock', 'expiry', 'suppliers', 'takings', 'mtd', 'overview'];

/** All modules for a family, in display order: core + that family's extras. */
export function getModulesForFamily(familyId) {
  const fam = getFamily(familyId);
  const extraIds = fam?.moduleIds || [];
  return [...CORE_MODULE_IDS, ...extraIds].map((id) => MODULES[id]).filter(Boolean);
}

export const SHOP_TYPE_STORAGE_KEY = 'vendora_shop_type'; // stores "familyId" or "familyId:memberId"

export function getFamily(familyId) {
  return SHOP_FAMILIES.find((f) => f.id === familyId) || null;
}

export function getMember(familyId, memberId) {
  const fam = getFamily(familyId);
  return fam ? fam.members.find((m) => m.id === memberId) || null : null;
}

/** Read the shop type last picked on this device: { familyId, memberId } or null. */
export function getSavedShopType() {
  try {
    const raw = localStorage.getItem(SHOP_TYPE_STORAGE_KEY);
    if (!raw) return null;
    const [familyId, memberId = null] = raw.split(':');
    return getFamily(familyId) ? { familyId, memberId } : null;
  } catch {
    return null;
  }
}

/** Remember the picked shop type on this device. memberId is optional. */
export function saveShopType(familyId, memberId = null) {
  try {
    localStorage.setItem(SHOP_TYPE_STORAGE_KEY, memberId ? `${familyId}:${memberId}` : familyId);
  } catch {
    /* ignore — private mode / blocked storage */
  }
}
