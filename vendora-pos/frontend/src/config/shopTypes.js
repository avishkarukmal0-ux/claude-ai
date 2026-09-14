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
    members: [
      { id: 'market-trader', label: 'Market trader', icon: Truck, extra: 'Phone-first cash & card' },
      { id: 'discount-pound', label: 'Discount / Pound', icon: BadgePercent, extra: 'Ad-hoc pricing & dead-stock' },
      { id: 'pet-shop', label: 'Pet shop', icon: PawPrint, extra: 'Repeat orders & dated stock' },
    ],
  },
];

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
