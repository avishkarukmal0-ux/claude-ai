import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { Sparkles, Check, ChevronLeft } from 'lucide-react';
import { SHOP_FAMILIES, getFamily, getMember, saveShopType, getSavedShopType } from '../config/shopTypes';

/**
 * NichePickerPage — the public front door (replaces login as the entry for now).
 * Two steps: pick one of the 4 shop-type families, then optionally its exact type.
 * Mobile-first: 1-up families on phones, 2-up on larger screens.
 */
export default function NichePickerPage() {
  const saved = getSavedShopType();
  const [familyId, setFamilyId] = useState(saved?.familyId || null);
  const [memberId, setMemberId] = useState(saved?.memberId || null);

  const family = familyId ? getFamily(familyId) : null;

  function pickFamily(id) {
    setFamilyId(id);
    setMemberId(null);
    saveShopType(id); // a family on its own is a valid choice
  }

  function pickMember(id) {
    setMemberId(id);
    saveShopType(familyId, id);
  }

  function back() {
    setFamilyId(null);
    setMemberId(null);
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-primary-50 to-white">
      <div
        className="mx-auto flex min-h-screen w-full max-w-2xl flex-col px-4"
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
          <p className="mt-1 text-sm text-gray-500">
            {family ? 'Which one fits best? (optional)' : 'What kind of shop do you run?'}
          </p>
          {!family && (
            <p className="mt-2 text-xs font-medium text-gray-400">
              Built for UK shops · MTD-ready · Works alongside your till
            </p>
          )}
        </header>

        {/* STEP 1 — the 4 families */}
        {!family && (
          <div className="mt-6 grid grid-cols-1 gap-3 sm:grid-cols-2">
            {SHOP_FAMILIES.map((f) => {
              const Icon = f.icon;
              return (
                <button
                  key={f.id}
                  type="button"
                  onClick={() => pickFamily(f.id)}
                  className="flex items-center gap-4 rounded-2xl border border-gray-200 bg-white p-4 text-left shadow-sm
                    transition hover:border-primary/40 hover:shadow-md active:scale-[0.99]
                    focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2"
                >
                  <span
                    className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl"
                    style={{ backgroundColor: `${f.accent}1A`, color: f.accent }}
                  >
                    <Icon className="h-7 w-7" strokeWidth={1.75} />
                  </span>
                  <span className="min-w-0">
                    <span className="block text-base font-semibold leading-tight text-gray-900">{f.label}</span>
                    <span className="mt-0.5 block text-xs leading-snug text-gray-500">{f.tagline}</span>
                    <span className="mt-1 block truncate text-[11px] text-gray-400">
                      {f.members.map((m) => m.label).join(' · ')}
                    </span>
                  </span>
                </button>
              );
            })}
          </div>
        )}

        {/* STEP 2 — optional sub-type within the chosen family */}
        {family && (
          <div className="mt-6">
            <button
              type="button"
              onClick={back}
              className="mb-4 inline-flex items-center gap-1 text-sm font-medium text-primary hover:underline"
            >
              <ChevronLeft className="h-4 w-4" /> All shop types
            </button>

            <div className="mb-4 flex items-center gap-3 rounded-2xl border border-primary/20 bg-primary-50 p-4">
              <span
                className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl"
                style={{ backgroundColor: `${family.accent}1A`, color: family.accent }}
              >
                <family.icon className="h-6 w-6" strokeWidth={1.75} />
              </span>
              <div>
                <div className="text-base font-semibold text-gray-900">{family.label}</div>
                <div className="text-xs text-gray-500">{family.tagline}</div>
              </div>
            </div>

            {/* Burden-first value promises for this family */}
            {family.promises?.length > 0 && (
              <ul className="mb-5 space-y-2">
                {family.promises.map((p) => (
                  <li key={p} className="flex items-start gap-2.5 text-sm text-gray-700">
                    <span
                      className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full"
                      style={{ backgroundColor: `${family.accent}1A`, color: family.accent }}
                    >
                      <Check className="h-3.5 w-3.5" strokeWidth={3} />
                    </span>
                    {p}
                  </li>
                ))}
              </ul>
            )}

            <p className="mb-3 text-xs font-medium uppercase tracking-wide text-gray-400">
              Which one fits best? <span className="normal-case text-gray-400">(optional)</span>
            </p>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              {family.members.map((m) => {
                const Icon = m.icon;
                const isSelected = memberId === m.id;
                return (
                  <button
                    key={m.id}
                    type="button"
                    onClick={() => pickMember(m.id)}
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
                      className="mb-3 flex h-12 w-12 items-center justify-center rounded-full"
                      style={{ backgroundColor: `${family.accent}1A`, color: family.accent }}
                    >
                      <Icon className="h-6 w-6" strokeWidth={1.75} />
                    </span>
                    <span className="text-sm font-semibold leading-tight text-gray-900">{m.label}</span>
                    <span className="mt-1 text-[11px] leading-snug text-gray-500">{m.extra}</span>
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* Footer / confirmation */}
        <div className="mt-auto pt-6">
          {family ? (
            <div className="flex items-center justify-center gap-2 rounded-xl bg-success-light px-4 py-3 text-center text-sm font-medium text-success-dark">
              <Sparkles className="h-4 w-4 shrink-0" />
              Vendora is set up for {memberId ? getMember(familyId, memberId)?.label : family.label}.
            </div>
          ) : (
            <p className="text-center text-xs text-gray-400">Tap the category that fits your shop.</p>
          )}

          <p className="mt-4 text-center text-sm text-gray-500">
            Already using Vendora?{' '}
            <Link to="/login" className="font-semibold text-primary hover:underline">
              Log in
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}
