// Shop-type registry — the single source of truth for Vendora's verticals.
//
// Organised as 4 FAMILIES, each defined by the module bundle it needs (not by the
// shop's name). Recognisable shop names live inside each family as `members` — a shop
// picks a family, then optionally its exact type. This is the `shopType` dial from the
// Go-To-Market plan: modules key off `family.id` (+ optional `member.id`), never on
// if/else in components. Add a vertical = add a member (or a family).

import {
  Store, Scale, Globe, Tag,
  Wine, Cloud, ShoppingBasket,
  Carrot, Beef, Croissant,
  Leaf, Truck, BadgePercent, PawPrint,
  LayoutDashboard, ScanLine, Package, CalendarClock, FileText,
  ShieldCheck, ClipboardList, ClipboardCheck, CalendarHeart, AlertTriangle, Banknote, ShoppingCart, Coins, Hourglass, Users, Inbox, PackageOpen, Receipt,
} from 'lucide-react';
import { read as storageRead, write as storageWrite } from '../lib/storage';

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
      'Never miss an MTD or licence deadline',
      'Scan the cash-&-carry trolley — stock’s done',
      'Age-check & minimum-price tools at a tap',
    ],
    moduleIds: ['age-check'],
    supplierIdeas: ['Cash & carry (Booker / Bestway)', 'Soft-drinks wholesaler', 'Tobacco / vape supplier', 'Newspaper distributor', 'Bread & milk roundsman'],
    members: [
      // Convenience covers mini-marts AND newsagents/CTNs (most "newsagents" are convenience shops
      // that also sell news/tobacco). Newsagent was merged in 2026-09-30 — see MEMBER_ALIASES below
      // and obsidian-vault/Niche-Market-Assessment-2026-09: shrinking category, claims already served
      // free by SNapp, so no dedicated roadmap.
      { id: 'convenience', label: 'Convenience / Newsagent', icon: ShoppingBasket, extra: 'Everyday grocery, chilled, news & tobacco' },
      { id: 'off-licence', label: 'Off-licence', icon: Wine, extra: 'Alcohol duty & MUP' },
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
  stocktake:   { id: 'stocktake',   label: 'Stocktake',      icon: ClipboardCheck,  desc: 'Count stock, catch shrinkage', live: true, screen: 'stocktake' },
  refill:      { id: 'refill',      label: 'Shelf refill',   icon: PackageOpen,     desc: 'Move back-room stock to the shelf', live: true, screen: 'refill' },
  expiry:      { id: 'expiry',      label: 'Expiry & waste', icon: CalendarClock,   desc: 'Stop paying twice for waste', live: true, screen: 'waste' },
  reorder:     { id: 'reorder',     label: 'Buy list',       icon: ShoppingCart,    desc: 'Low stock → cash-&-carry list', live: true, screen: 'reorder' },
  orders:      { id: 'orders',      label: 'Orders',         icon: Truck,           desc: 'Track what you’ve ordered', live: true, screen: 'orders' },
  deadstock:   { id: 'deadstock',   label: 'Slow stock',     icon: Hourglass,       desc: 'Money not moving', live: true, screen: 'deadstock' },
  suppliers:   { id: 'suppliers',   label: 'Suppliers',      icon: Truck,           desc: 'Your regular buying places', live: true, screen: 'suppliers' },
  claims:      { id: 'claims',      label: 'Supplier claims', icon: Receipt,    desc: 'Recover credit for bad goods', live: true, screen: 'claims' },
  'price-alerts': { id: 'price-alerts', label: 'Price changes', icon: BadgePercent, desc: 'Cost moved? Review the margin', live: true, screen: 'price-alerts' },
  takings:     { id: 'takings',     label: 'Takings & cash-up', icon: Coins,        desc: 'Day takings + drawer count', live: true, screen: 'takings' },
  overview:    { id: 'overview',    label: 'Owner glance',   icon: LayoutDashboard, desc: 'Takings, waste & margin', live: true, screen: 'overview' },
  worker:      { id: 'worker',      label: 'Staff view',     icon: Users,           desc: 'For staff on shift', live: true, screen: 'worker' },
  tasks:       { id: 'tasks',       label: 'Team tasks',     icon: ClipboardList,   desc: 'Jobs, checklists & handover', live: true, screen: 'tasks' },
  suggestions: { id: 'suggestions', label: 'From the team',  icon: Inbox,           desc: 'Staff flags & notes', live: true, screen: 'suggestions' },
  mtd:         { id: 'mtd',         label: 'MTD deadlines',  icon: FileText,        desc: 'Key dates tracked (figures soon)', live: false },
  'age-check': { id: 'age-check',   label: 'Age checks',     icon: ShieldCheck,     desc: 'Logged & audit-ready', live: false },
  'scale-labels': { id: 'scale-labels', label: 'Scale & labels', icon: ClipboardList, desc: 'Weigh, price & PPDS', live: false },
  'festival':  { id: 'festival',    label: 'Festival planner', icon: CalendarHeart, desc: 'Order ahead for peak weeks', live: false },
  allergens:   { id: 'allergens',   label: 'Allergens',      icon: AlertTriangle,   desc: 'PPDS & Natasha’s Law', live: false },
  reconcile:   { id: 'reconcile',   label: 'Cash & card',    icon: Banknote,        desc: 'Totals reconciled on your phone', live: false },
};

// Core modules every shop gets, in display order.
export const CORE_MODULE_IDS = ['goods-in', 'inventory', 'stocktake', 'refill', 'reorder', 'orders', 'deadstock', 'expiry', 'suppliers', 'claims', 'price-alerts', 'takings', 'overview', 'worker', 'tasks', 'suggestions', 'mtd'];

/** All modules for a family, in display order: core + that family's extras. */
export function getModulesForFamily(familyId) {
  const fam = getFamily(familyId);
  const extraIds = fam?.moduleIds || [];
  return [...CORE_MODULE_IDS, ...extraIds].map((id) => MODULES[id]).filter(Boolean);
}

export const SHOP_TYPE_NAME = 'shop_type'; // logical store name; value "familyId" or "familyId:memberId"

// Retired shop-type members mapped to their replacement, so existing setups still resolve after a
// merge (never strand a shop that already picked a now-removed type). Newsagent → Convenience (2026-09-30).
export const MEMBER_ALIASES = {
  'grocery-age': { newsagent: 'convenience' },
};
function resolveMemberId(familyId, memberId) {
  if (!memberId) return memberId;
  return MEMBER_ALIASES[familyId]?.[memberId] || memberId;
}

export function getFamily(familyId) {
  return SHOP_FAMILIES.find((f) => f.id === familyId) || null;
}

export function getMember(familyId, memberId) {
  const fam = getFamily(familyId);
  if (!fam) return null;
  const id = resolveMemberId(familyId, memberId);
  return fam.members.find((m) => m.id === id) || null;
}

/** Read the shop type last picked for the active workspace: { familyId, memberId } or null.
 *  Retired members (e.g. newsagent) are transparently mapped to their replacement. */
export function getSavedShopType() {
  const raw = storageRead(SHOP_TYPE_NAME, null);
  if (!raw) return null;
  const [familyId, rawMemberId = null] = raw.split(':');
  if (!getFamily(familyId)) return null;
  return { familyId, memberId: resolveMemberId(familyId, rawMemberId) };
}

/** Remember the picked shop type for the active workspace. memberId is optional. */
export function saveShopType(familyId, memberId = null) {
  return storageWrite(SHOP_TYPE_NAME, memberId ? `${familyId}:${memberId}` : familyId);
}
