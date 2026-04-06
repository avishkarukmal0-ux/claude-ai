import React, { useState, useEffect, useRef, useCallback } from 'react';
import api from '../services/api';
import { Loader2 } from 'lucide-react';

const TABS = [
  { key: 'all',            label: 'All',              color: 'blue' },
  { key: 'Beer & Cider',   label: 'Beer & Cider',     color: 'amber' },
  { key: 'Spirits',        label: 'Spirits',           color: 'purple' },
  { key: 'Wine',           label: 'Wine',              color: 'rose' },
  { key: 'Soft Drinks',    label: 'Soft Drinks',       color: 'cyan' },
  { key: 'Snacks',         label: 'Snacks',            color: 'orange' },
  { key: 'Tobacco',        label: 'Tobacco',           color: 'gray' },
  { key: 'Confectionery',  label: 'Confectionery',     color: 'pink' },
  { key: 'Lottery',        label: 'Lottery',           color: 'yellow' },
  { key: 'Mobile Top-Up',  label: 'Top-Up',            color: 'green' },
];

const TAB_ACTIVE = {
  blue:   'bg-blue-600 text-white',
  amber:  'bg-amber-500 text-white',
  purple: 'bg-purple-600 text-white',
  rose:   'bg-rose-500 text-white',
  cyan:   'bg-cyan-600 text-white',
  orange: 'bg-orange-500 text-white',
  gray:   'bg-gray-600 text-white',
  pink:   'bg-pink-500 text-white',
  yellow: 'bg-yellow-500 text-black',
  green:  'bg-green-600 text-white',
};

// Top-Up brand color scheme
const TOPUP_BRAND_COLORS = {
  ee:       'bg-green-600 hover:bg-green-500',
  vodafone: 'bg-red-600 hover:bg-red-500',
  o2:       'bg-blue-600 hover:bg-blue-500',
  three:    'bg-purple-600 hover:bg-purple-500',
  giffgaff: 'bg-pink-600 hover:bg-pink-500',
  sky:      'bg-sky-500 hover:bg-sky-400',
  virgin:   'bg-red-700 hover:bg-red-600',
  bt:       'bg-blue-800 hover:bg-blue-700',
};

function getTopUpBrandColor(name = '') {
  const lower = name.toLowerCase();
  for (const [brand, cls] of Object.entries(TOPUP_BRAND_COLORS)) {
    if (lower.includes(brand)) return cls;
  }
  return 'bg-green-700 hover:bg-green-600';
}

function ProductButton({ product, category, onAddItem }) {
  const isLottery = category === 'Lottery' || product.category === 'Lottery';
  const isTopUp = category === 'Mobile Top-Up' || product.category === 'Mobile Top-Up';
  const isBeer = category === 'Beer & Cider' || product.category === 'Beer & Cider';

  let btnClass = 'bg-slate-700 hover:bg-slate-600 text-white';
  if (isLottery) btnClass = 'bg-yellow-500 hover:bg-yellow-400 text-black';
  else if (isTopUp) btnClass = getTopUpBrandColor(product.name) + ' text-white';
  else if (isBeer) btnClass = 'bg-amber-700 hover:bg-amber-600 text-white';

  const handleClick = () => {
    if (isTopUp) {
      onAddItem({ ...product, _requiresPhone: true });
    } else {
      onAddItem(product);
    }
  };

  return (
    <button
      onClick={handleClick}
      className={`${btnClass} rounded-xl p-3 flex flex-col justify-between min-h-[64px] text-left transition-all active:scale-95 relative overflow-hidden`}
    >
      {product.ageRestricted && (
        <span className="absolute top-1.5 right-1.5 bg-red-600 text-white text-[9px] font-black px-1.5 py-0.5 rounded-full leading-none">
          18+
        </span>
      )}
      <p className="text-xs font-semibold leading-tight line-clamp-2 pr-5">
        {product.name}
      </p>
      <p className="text-sm font-black mt-1">
        £{Number(product.retailPrice).toFixed(2)}
      </p>
    </button>
  );
}

function SkeletonButton() {
  return (
    <div className="rounded-xl bg-slate-700/40 animate-pulse min-h-[64px]" />
  );
}

export default function QuickSellGrid({ onAddItem, storeId }) {
  const [activeTab, setActiveTab] = useState('all');
  const [productsMap, setProductsMap] = useState({}); // category → products[]
  const [loading, setLoading] = useState(false);
  const cache = useRef({});

  const loadCategory = useCallback(async (cat) => {
    if (cache.current[cat]) {
      setProductsMap(m => ({ ...m, [cat]: cache.current[cat] }));
      return;
    }
    setLoading(true);
    try {
      const params = new URLSearchParams({ active: 'true', limit: '50' });
      if (cat !== 'all') params.set('category', cat);
      if (storeId) params.set('storeId', storeId);
      const res = await api.get(`/products?${params.toString()}`);
      const list = Array.isArray(res) ? res : (res.products || res.data || []);
      cache.current[cat] = list;
      setProductsMap(m => ({ ...m, [cat]: list }));
    } catch {
      cache.current[cat] = [];
      setProductsMap(m => ({ ...m, [cat]: [] }));
    } finally {
      setLoading(false);
    }
  }, [storeId]);

  useEffect(() => {
    loadCategory(activeTab);
  }, [activeTab, loadCategory]);

  const currentTab = TABS.find(t => t.key === activeTab) || TABS[0];
  const products = productsMap[activeTab] || [];

  return (
    <div className="flex flex-col h-full">
      {/* Tab bar */}
      <div className="flex gap-1.5 overflow-x-auto pb-2 shrink-0 scrollbar-hide">
        {TABS.map(tab => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className={`px-3 py-1.5 rounded-xl text-xs font-bold whitespace-nowrap transition-all shrink-0 ${
              activeTab === tab.key
                ? TAB_ACTIVE[tab.color] + ' shadow-sm'
                : 'bg-white/10 text-white/60 hover:bg-white/20 hover:text-white'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Product grid */}
      <div className="flex-1 overflow-y-auto mt-2">
        {loading ? (
          <div className="grid grid-cols-3 gap-2">
            {Array.from({ length: 12 }).map((_, i) => <SkeletonButton key={i} />)}
          </div>
        ) : products.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-32 text-white/30">
            <p className="text-sm font-medium">No products in this category</p>
          </div>
        ) : (
          <div className="grid grid-cols-3 gap-2">
            {products.map(p => (
              <ProductButton
                key={p._id}
                product={p}
                category={activeTab}
                onAddItem={onAddItem}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
