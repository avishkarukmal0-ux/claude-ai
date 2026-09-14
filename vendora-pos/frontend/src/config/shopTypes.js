// Shop-type registry — the single source of truth for Vendora's verticals ("niches").
//
// This is the `shopType` dial from the Go-To-Market plan (one app, per-shop-type
// interface). Everything vertical-specific keys off the `id` here: which modules a
// shop sees, its onboarding, its default settings. Add a niche = add one entry.
//
// Keep this list config-driven — never branch on shopType with if/else in components.

import { Wine, Store, Newspaper, Globe, Cloud, Carrot, Beef, Croissant, Leaf } from 'lucide-react';

export const SHOP_TYPES = [
  {
    id: 'off-licence',
    label: 'Off-licence',
    tagline: 'Alcohol, age checks & duty',
    icon: Wine,
    accent: '#7C3AED', // violet
  },
  {
    id: 'convenience',
    label: 'Convenience / Mini-mart',
    tagline: 'Everyday grocery & chilled',
    icon: Store,
    accent: '#2563EB', // brand blue
  },
  {
    id: 'newsagent',
    label: 'Newsagent / CTN',
    tagline: 'News, tobacco & confectionery',
    icon: Newspaper,
    accent: '#0891B2', // cyan
  },
  {
    id: 'ethnic-grocer',
    label: 'International grocer',
    tagline: 'World foods & fresh produce',
    icon: Globe,
    accent: '#EA580C', // orange
  },
  {
    id: 'vape-cbd',
    label: 'Vape & CBD',
    tagline: 'Age checks & compliance',
    icon: Cloud,
    accent: '#0D9488', // teal
  },
  {
    id: 'greengrocer',
    label: 'Greengrocer',
    tagline: 'Loose produce & daily repricing',
    icon: Carrot,
    accent: '#16A34A', // green
  },
  {
    id: 'butcher',
    label: 'Butcher / Fishmonger',
    tagline: 'Scale, cuts & traceability',
    icon: Beef,
    accent: '#DC2626', // red
  },
  {
    id: 'bakery-deli',
    label: 'Bakery / Deli',
    tagline: 'Bake-to-demand & PPDS labels',
    icon: Croissant,
    accent: '#D97706', // amber
  },
  {
    id: 'health-food',
    label: 'Health-food',
    tagline: 'Batch, expiry & allergens',
    icon: Leaf,
    accent: '#65A30D', // lime
  },
];

export const SHOP_TYPE_STORAGE_KEY = 'vendora_shop_type';

export function getShopType(id) {
  return SHOP_TYPES.find((t) => t.id === id) || null;
}

/** Read the shop type the user last picked (per-device convenience only). */
export function getSavedShopType() {
  try {
    return localStorage.getItem(SHOP_TYPE_STORAGE_KEY) || null;
  } catch {
    return null;
  }
}

/** Remember the picked shop type on this device. Safe if storage is unavailable. */
export function saveShopType(id) {
  try {
    localStorage.setItem(SHOP_TYPE_STORAGE_KEY, id);
  } catch {
    /* ignore — private mode / blocked storage */
  }
}
