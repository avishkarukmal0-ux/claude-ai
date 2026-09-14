import React, { useState } from 'react';
import { Link, Navigate } from 'react-router-dom';
import { Home as HomeIcon, ScanLine, Package2, MoreHorizontal, Settings, LogIn, ChevronRight, X } from 'lucide-react';
import {
  getSavedShopType, getFamily, getMember, getModulesForFamily,
} from '../config/shopTypes';
import { getQuickToolsForFamily } from '../config/quickTools';
import TodayAtShop from '../components/home/TodayAtShop';
import InventoryView from '../components/inventory/InventoryView';
import GoodsInView from '../components/inventory/GoodsInView';
import WasteView from '../components/waste/WasteView';

/**
 * HomePage — the mobile app-home (M0). Public shell reflecting the chosen shop type:
 * a tailored module grid (the shopType dial, visible) + a bottom-nav shell.
 * Live data arrives once the backend is wired; tiles show a "Soon" badge until then.
 */
export default function HomePage() {
  const saved = getSavedShopType();
  const [tab, setTab] = useState('home');
  const [screen, setScreen] = useState(null); // full-page module screen (e.g. 'waste')
  const [activeTool, setActiveTool] = useState(null);

  // No shop type picked yet → send them to the front door.
  if (!saved) return <Navigate to="/" replace />;

  const family = getFamily(saved.familyId);
  const member = saved.memberId ? getMember(saved.familyId, saved.memberId) : null;
  const shopLabel = member?.label || family.label;
  const modules = getModulesForFamily(saved.familyId);
  const tools = getQuickToolsForFamily(saved.familyId);
  const accent = family.accent;
  const ToolComponent = activeTool?.component || null;

  return (
    <div className="flex min-h-screen flex-col bg-gray-50">
      {/* Top bar */}
      <header
        className="sticky top-0 z-10 flex items-center gap-3 bg-white px-4 py-3 shadow-sm"
        style={{ paddingTop: 'max(env(safe-area-inset-top), 0.75rem)' }}
      >
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-primary">
          <svg viewBox="0 0 48 48" className="h-6 w-6" aria-hidden="true">
            <path d="M13 15 L24 35 L35 15" fill="none" stroke="white" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round" />
            <circle cx="24" cy="15" r="4.5" fill="white" />
          </svg>
        </span>
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-semibold text-gray-900">{shopLabel}</div>
          <div className="text-xs text-gray-400">Your Vendora</div>
        </div>
        <Link to="/" className="text-xs font-medium text-primary hover:underline">Change</Link>
      </header>

      {/* Scrollable content */}
      <main className="flex-1 overflow-y-auto px-4 pb-24 pt-4">
        {screen === 'waste' && <WasteView onBack={() => setScreen(null)} />}

        {!screen && tab === 'home' && (
          <>
            {/* Today at the shop — the morning glance, tailored to this family */}
            <TodayAtShop familyId={saved.familyId} />

            {/* What Vendora does — burden-first promises for this family */}
            {family.promises?.length > 0 && (
              <section className="mb-5 rounded-2xl border border-gray-100 bg-white p-4 shadow-sm">
                <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-400">What Vendora does for you</h2>
                <ul className="space-y-1.5">
                  {family.promises.map((p) => (
                    <li key={p} className="flex items-start gap-2 text-sm text-gray-700">
                      <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full" style={{ backgroundColor: accent }} />
                      {p}
                    </li>
                  ))}
                </ul>
              </section>
            )}

            {/* Quick tools — glance-and-go helpers that work right now (no login, no backend) */}
            {tools.length > 0 && (
              <section className="mb-5">
                <h2 className="mb-3 text-xs font-semibold uppercase tracking-wide text-gray-400">Quick tools</h2>
                <div className="flex gap-3 overflow-x-auto pb-1">
                  {tools.map((t) => {
                    const Icon = t.icon;
                    return (
                      <button
                        key={t.id}
                        type="button"
                        onClick={() => setActiveTool(t)}
                        className="flex w-32 shrink-0 flex-col items-start rounded-2xl border border-gray-100 bg-white p-3 text-left shadow-sm transition hover:border-primary/40 hover:shadow-md active:scale-[0.98] focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2"
                      >
                        <span
                          className="mb-2 flex h-9 w-9 items-center justify-center rounded-lg"
                          style={{ backgroundColor: `${accent}1A`, color: accent }}
                        >
                          <Icon className="h-5 w-5" strokeWidth={1.75} />
                        </span>
                        <span className="text-sm font-semibold leading-tight text-gray-900">{t.label}</span>
                        <span className="mt-0.5 text-[11px] leading-snug text-gray-500">{t.tagline}</span>
                      </button>
                    );
                  })}
                </div>
              </section>
            )}

            {/* Module grid — tailored to this shop type */}
            <h2 className="mb-3 text-xs font-semibold uppercase tracking-wide text-gray-400">Your tools</h2>
            <div className="grid grid-cols-2 gap-3">
              {modules.map((m) => {
                const Icon = m.icon;
                const clickable = m.live && (m.tab || m.screen);
                const Tag = clickable ? 'button' : 'div';
                const open = () => { if (m.tab) setTab(m.tab); else if (m.screen) setScreen(m.screen); };
                return (
                  <Tag
                    key={m.id}
                    type={clickable ? 'button' : undefined}
                    onClick={clickable ? open : undefined}
                    className={`relative flex flex-col rounded-2xl border border-gray-100 bg-white p-4 text-left shadow-sm ${
                      clickable ? 'transition hover:border-primary/40 hover:shadow-md active:scale-[0.98] focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2' : ''
                    }`}
                  >
                    <span className={`absolute right-2 top-2 rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${m.live ? 'bg-success-light text-success-dark' : 'bg-gray-100 text-gray-400'}`}>
                      {m.live ? 'Ready' : 'Soon'}
                    </span>
                    <span
                      className="mb-3 flex h-11 w-11 items-center justify-center rounded-xl"
                      style={{ backgroundColor: `${accent}1A`, color: accent }}
                    >
                      <Icon className="h-6 w-6" strokeWidth={1.75} />
                    </span>
                    <span className="text-sm font-semibold leading-tight text-gray-900">{m.label}</span>
                    <span className="mt-1 text-[11px] leading-snug text-gray-500">{m.desc}</span>
                  </Tag>
                );
              })}
            </div>
          </>
        )}

        {!screen && tab === 'scan' && <GoodsInView />}

        {!screen && tab === 'stock' && <InventoryView />}

        {!screen && tab === 'more' && (
          <section className="space-y-2">
            <Link to="/" className="flex items-center gap-3 rounded-2xl border border-gray-100 bg-white p-4 shadow-sm">
              <Settings className="h-5 w-5 text-gray-400" />
              <span className="flex-1 text-sm font-medium text-gray-900">Change shop type</span>
              <ChevronRight className="h-4 w-4 text-gray-300" />
            </Link>
            <Link to="/login" className="flex items-center gap-3 rounded-2xl border border-gray-100 bg-white p-4 shadow-sm">
              <LogIn className="h-5 w-5 text-gray-400" />
              <span className="flex-1 text-sm font-medium text-gray-900">Log in to your shop</span>
              <ChevronRight className="h-4 w-4 text-gray-300" />
            </Link>
            <p className="px-1 pt-2 text-center text-xs text-gray-400">
              Set up as {shopLabel} · Vendora
            </p>
          </section>
        )}
      </main>

      {/* Bottom nav shell */}
      <nav
        className="fixed inset-x-0 bottom-0 z-10 mx-auto flex max-w-2xl items-stretch justify-around border-t border-gray-200 bg-white"
        style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
      >
        <NavTab label="Home"  icon={HomeIcon} active={!screen && tab === 'home'}  onClick={() => { setScreen(null); setTab('home'); }} accent={accent} />
        <NavTab label="Scan"  icon={ScanLine} active={!screen && tab === 'scan'}  onClick={() => { setScreen(null); setTab('scan'); }} accent={accent} />
        <NavTab label="Stock" icon={Package2} active={!screen && tab === 'stock'} onClick={() => { setScreen(null); setTab('stock'); }} accent={accent} />
        <NavTab label="More"  icon={MoreHorizontal} active={!screen && tab === 'more'} onClick={() => { setScreen(null); setTab('more'); }} accent={accent} />
      </nav>

      {/* Quick-tool modal */}
      {activeTool && (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-0 sm:items-center sm:p-4"
          onClick={() => setActiveTool(null)}
          role="dialog"
          aria-modal="true"
          aria-label={activeTool.label}
        >
          <div
            className="flex max-h-[88vh] w-full max-w-md flex-col overflow-hidden rounded-t-3xl bg-white shadow-xl sm:rounded-3xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-gray-100 px-5 py-4">
              <h3 className="text-base font-bold text-gray-900">{activeTool.label}</h3>
              <button
                type="button"
                onClick={() => setActiveTool(null)}
                className="flex h-8 w-8 items-center justify-center rounded-full text-gray-400 hover:bg-gray-100"
                aria-label="Close"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <div
              className="overflow-y-auto px-5 pt-5"
              style={{ paddingBottom: 'max(env(safe-area-inset-bottom), 1.25rem)' }}
            >
              {ToolComponent && <ToolComponent />}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function NavTab({ label, icon: Icon, active, onClick, accent }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex flex-1 flex-col items-center gap-0.5 py-2 text-[11px] font-medium focus:outline-none"
      style={{ color: active ? accent : '#9CA3AF' }}
      aria-current={active ? 'page' : undefined}
    >
      <Icon className="h-5 w-5" strokeWidth={active ? 2.25 : 1.75} />
      {label}
    </button>
  );
}

