import React, { useState } from 'react';
import { Sparkles, Check } from 'lucide-react';
import { SHOP_TYPES, saveShopType, getSavedShopType } from '../config/shopTypes';

/**
 * NichePickerPage — the public front door (replaces login as the entry for now).
 * Shows Vendora's 9 shop types. Picking one sets the shopType dial for this device.
 * Mobile-first: 2-up on phones, 3-up on larger screens.
 */
export default function NichePickerPage() {
  const [selected, setSelected] = useState(getSavedShopType());

  function pick(id) {
    setSelected(id);
    saveShopType(id);
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-primary-50 to-white">
      <div
        className="mx-auto flex min-h-screen w-full max-w-3xl flex-col px-4"
        style={{ paddingTop: 'max(env(safe-area-inset-top), 1.5rem)', paddingBottom: 'max(env(safe-area-inset-bottom), 1.5rem)' }}
      >
        {/* Header */}
        <header className="pt-2 text-center">
          <div className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-2xl bg-primary shadow-lg shadow-primary/30">
            <svg viewBox="0 0 48 48" className="h-9 w-9" aria-hidden="true">
              <path d="M13 15 L24 35 L35 15" fill="none" stroke="white" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round" />
              <circle cx="24" cy="15" r="4.5" fill="white" />
            </svg>
          </div>
          <h1 className="text-2xl font-extrabold tracking-tight text-gray-900">Welcome to Vendora</h1>
          <p className="mt-1 text-sm text-gray-500">What kind of shop do you run?</p>
        </header>

        {/* Grid of niches */}
        <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-3">
          {SHOP_TYPES.map((t) => {
            const Icon = t.icon;
            const isSelected = selected === t.id;
            return (
              <button
                key={t.id}
                type="button"
                onClick={() => pick(t.id)}
                aria-pressed={isSelected}
                className={`relative flex flex-col items-center rounded-2xl border bg-white p-4 text-center transition
                  focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2
                  ${isSelected ? 'border-primary shadow-md ring-1 ring-primary' : 'border-gray-200 shadow-sm hover:border-primary/40 hover:shadow-md active:scale-[0.98]'}`}
              >
                {isSelected && (
                  <span className="absolute right-2 top-2 flex h-5 w-5 items-center justify-center rounded-full bg-primary text-white">
                    <Check className="h-3.5 w-3.5" strokeWidth={3} />
                  </span>
                )}
                <span
                  className="mb-3 flex h-14 w-14 items-center justify-center rounded-full"
                  style={{ backgroundColor: `${t.accent}1A`, color: t.accent }}
                >
                  <Icon className="h-7 w-7" strokeWidth={1.75} />
                </span>
                <span className="text-sm font-semibold leading-tight text-gray-900">{t.label}</span>
                <span className="mt-1 text-[11px] leading-snug text-gray-500">{t.tagline}</span>
              </button>
            );
          })}
        </div>

        {/* Footer / selection confirmation */}
        <div className="mt-auto pt-6">
          {selected ? (
            <div className="flex items-center justify-center gap-2 rounded-xl bg-success-light px-4 py-3 text-sm font-medium text-success-dark">
              <Sparkles className="h-4 w-4" />
              Vendora is set up for {SHOP_TYPES.find((t) => t.id === selected)?.label}.
            </div>
          ) : (
            <p className="text-center text-xs text-gray-400">Tap your shop type to get started.</p>
          )}
        </div>
      </div>
    </div>
  );
}
