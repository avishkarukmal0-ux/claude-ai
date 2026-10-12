import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Sparkles, Check, ChevronLeft, ArrowRight } from 'lucide-react';
import { SHOP_FAMILIES, getFamily, getMember, saveShopType, getSavedShopType } from '../config/shopTypes';
import { useBusinessProfile, ENTITIES, TURNOVER_BANDS, REGIONS } from '../lib/businessProfile';
import { onboardingQuestionsFor } from '../config/niche';
import { reloadDemoData } from '../lib/demo';

/**
 * NichePickerPage — the public front door (replaces login as the entry for now).
 * Two steps: pick one of the 4 shop-type families, then optionally its exact type.
 * Mobile-first: 1-up families on phones, 2-up on larger screens.
 */
export default function NichePickerPage() {
  const navigate = useNavigate();
  const saved = getSavedShopType();
  const [familyId, setFamilyId] = useState(saved?.familyId || null);
  const [memberId, setMemberId] = useState(saved?.memberId || null);
  const { profile, update } = useBusinessProfile();

  const family = familyId ? getFamily(familyId) : null;
  const questions = familyId ? onboardingQuestionsFor(familyId) : [];

  function pickFamily(id) {
    setFamilyId(id);
    setMemberId(null);
    saveShopType(id); // a family on its own is a valid choice
    // Clear answers that don't apply to the new family, so a Pet-shop "sells animals" (etc.) doesn't linger
    // after switching to, say, a greengrocer. Universal answers (entity/turnover/nation/employees) are kept.
    const q = onboardingQuestionsFor(id);
    const clear = {};
    for (const f of ['sellsAnimals', 'importsFood', 'festivalsOn']) if (!q.includes(f)) clear[f] = null;
    if (Object.keys(clear).length) update(clear);
    reloadDemoData();  // in demo, refresh the sample so it fits the new type (no-op otherwise)
  }

  function pickMember(id) {
    setMemberId(id);
    saveShopType(familyId, id);
    reloadDemoData();
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
              Built for UK shops · Tracks your key deadlines · Works alongside your till
            </p>
          )}
        </header>

        {/* STEP 1 — the 4 families. Centre vertically so a short list doesn't leave a big gap above the footer
            on tall phones (welcome-audit fix 4); the footer stays pinned to the bottom. */}
        {!family && (
          <div className="flex flex-1 flex-col justify-center py-6">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {SHOP_FAMILIES.map((f) => {
              const Icon = f.icon;
              return (
                <button
                  key={f.id}
                  type="button"
                  onClick={() => pickFamily(f.id)}
                  className="flex items-center gap-4 rounded-2xl border border-gray-200 bg-white p-4 text-left shadow-sm
                    transition hover:border-primary/40 hover:shadow-md active:scale-[0.99] active:border-primary/60
                    focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2"
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
                    <span className="mt-1 block text-xs leading-snug text-gray-500">
                      {f.members.slice(0, 2).map((m) => m.label).join(' · ')}{f.members.length > 2 ? ` +${f.members.length - 2} more` : ''}
                    </span>
                  </span>
                </button>
              );
            })}
          </div>
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
                    className={`relative flex flex-col items-center rounded-2xl border bg-white p-4 text-center transition active:scale-[0.98]
                      focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2
                      ${isSelected ? 'border-primary shadow-md ring-1 ring-primary' : 'border-gray-200 shadow-sm hover:border-primary/40 hover:shadow-md'}`}
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
                    <span className="mt-1 text-xs leading-snug text-gray-500">{m.extra}</span>
                  </button>
                );
              })}
            </div>

            {/* A few tax/region details (optional) — they decide which compliance tools actually apply to this
                shop (MTD for Income Tax, Minimum Unit Pricing), so we don't show deadlines that aren't yours. */}
            <div className="mt-6 rounded-2xl border border-gray-200 bg-white p-4 shadow-sm">
              <p className="mb-1 text-sm font-semibold text-gray-900">A few tax details <span className="font-normal text-gray-400">(optional)</span></p>
              <p className="mb-3 text-xs text-gray-500">So we only show the deadlines that apply to you.</p>

              <p className="mb-1.5 text-xs font-medium uppercase tracking-wide text-gray-400">Business type</p>
              <Segment options={ENTITIES} value={profile.entity} onChange={(v) => update({ entity: v })} />

              {profile.entity === 'sole-trader' && (
                <>
                  <p className="mb-1.5 mt-3 text-xs font-medium uppercase tracking-wide text-gray-400">Yearly turnover</p>
                  <Segment options={TURNOVER_BANDS} value={profile.turnoverBand} onChange={(v) => update({ turnoverBand: v })} />
                </>
              )}

              <p className="mb-1.5 mt-3 text-xs font-medium uppercase tracking-wide text-gray-400">Your nation</p>
              <Segment options={REGIONS} value={profile.region} onChange={(v) => update({ region: v })} />

              {questions.includes('employees50') && (
                <YesNo label="50+ employees (including any group)?" value={profile.employees50} onChange={(v) => update({ employees50: v })} />
              )}
              {questions.includes('sellsAnimals') && (
                <YesNo label="Do you sell live animals as pets?" value={profile.sellsAnimals} onChange={(v) => update({ sellsAnimals: v })} />
              )}
              {questions.includes('importsFood') && (
                <YesNo label="Do you import food directly?" value={profile.importsFood} onChange={(v) => update({ importsFood: v })} />
              )}
              {questions.includes('festivalsOn') && (
                <YesNo label="Show cultural-festival reminders (Diwali, Eid…)?" value={profile.festivalsOn} onChange={(v) => update({ festivalsOn: v })} />
              )}
            </div>
          </div>
        )}

        {/* Footer / confirmation */}
        <div className="mt-auto pt-6">
          {family ? (
            <div className="space-y-3">
              <div className="flex items-center justify-center gap-2 rounded-xl bg-success-light px-4 py-3 text-center text-sm font-medium text-success-dark">
                <Sparkles className="h-4 w-4 shrink-0" />
                Vendora is set up for {memberId ? getMember(familyId, memberId)?.label : family.label}.
              </div>
              <button
                type="button"
                onClick={() => navigate('/home')}
                className="flex min-h-[44px] w-full items-center justify-center gap-2 rounded-xl bg-primary px-4 py-3.5 text-sm font-semibold text-white shadow-lg shadow-primary/30 transition hover:bg-primary-600 active:scale-[0.99] active:bg-primary-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2"
              >
                Continue <ArrowRight className="h-4 w-4" />
              </button>
            </div>
          ) : (
            <p className="text-center text-sm text-gray-500">Tap the category that fits your shop.</p>
          )}

          {/* Welcome-audit fix 1: "Log in" is a full-width secondary BUTTON (>= 44px tap target), not a tiny link. */}
          <div className="mt-4 text-center">
            <p className="mb-2 text-sm text-gray-500">Already using Vendora?</p>
            <Link
              to="/login"
              className="flex min-h-[44px] w-full items-center justify-center rounded-xl border border-gray-300 bg-white px-4 py-3 text-sm font-semibold text-primary transition hover:bg-gray-50 active:scale-[0.99] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2"
            >
              Log in
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}

// A Yes/No question stored as a tri-state boolean (null = unanswered). Tapping the chosen answer again clears.
function YesNo({ label, value, onChange }) {
  const opts = [{ id: true, label: 'Yes' }, { id: false, label: 'No' }];
  return (
    <>
      <p className="mb-1.5 mt-3 text-xs font-medium uppercase tracking-wide text-gray-400">{label}</p>
      <div className="flex gap-2">
        {opts.map((o) => {
          const on = value === o.id;
          return (
            <button key={String(o.id)} type="button" onClick={() => onChange(on ? null : o.id)} aria-pressed={on}
              className={`inline-flex min-h-[44px] min-w-[72px] items-center justify-center rounded-xl border px-3 text-sm font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 ${on ? 'border-primary bg-primary-50 text-primary' : 'border-gray-200 bg-white text-gray-600'}`}>
              {o.label}
            </button>
          );
        })}
      </div>
    </>
  );
}

// A small segmented control: wraps to multiple rows on narrow screens; each option is a ≥44px tap target.
// Tapping the selected option again clears it (optional fields).
function Segment({ options, value, onChange }) {
  return (
    <div className="flex flex-wrap gap-2">
      {options.map((o) => {
        const on = value === o.id;
        return (
          <button
            key={o.id}
            type="button"
            onClick={() => onChange(on ? null : o.id)}
            aria-pressed={on}
            className={`inline-flex min-h-[44px] items-center rounded-xl border px-3 text-sm font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 ${on ? 'border-primary bg-primary-50 text-primary' : 'border-gray-200 bg-white text-gray-600'}`}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}
