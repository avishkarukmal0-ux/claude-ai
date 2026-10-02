import React, { useState, useRef, useEffect } from 'react';
import { Link, Navigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import {
  ListChecks, ScanLine, Package2, ShoppingCart, MoreHorizontal,
  Settings, LogIn, ChevronRight, X, Download, Upload,
  PackageCheck, ClipboardCheck, CalendarClock, PackageOpen, Hourglass,
  Truck, Building2, Receipt, BadgePercent, Coins, LayoutDashboard, Users, Inbox, ClipboardList, MessageSquarePlus,
  FileSpreadsheet, TrendingUp, UserCog, Bell, GitMerge, CloudCog, Sparkles, LifeBuoy,
} from 'lucide-react';
import { downloadBackup, shareBackup, readBackup, restoreBackup, getLastBackupAt } from '../lib/backup';
import { getSavedShopType, getFamily, getMember } from '../config/shopTypes';
import { getQuickToolsForFamily } from '../config/quickTools';
import TodayAtShop from '../components/home/TodayAtShop';
import TodayActions from '../components/home/TodayActions';
import FirstRunCard from '../components/home/FirstRunCard';
import InstallCard from '../components/account/InstallCard';
import { isDemoActive, exitDemo } from '../lib/demo';
import InventoryView from '../components/inventory/InventoryView';
import DeliveryReceivingView from '../components/delivery/DeliveryReceivingView';
import WasteView from '../components/waste/WasteView';
import ReorderView from '../components/reorder/ReorderView';
import SuppliersView from '../components/suppliers/SuppliersView';
import TakingsView from '../components/takings/TakingsView';
import OverviewView from '../components/overview/OverviewView';
import DeadStockView from '../components/deadstock/DeadStockView';
import StocktakeView from '../components/stocktake/StocktakeView';
import RefillView from '../components/refill/RefillView';
import OrdersView from '../components/orders/OrdersView';
import ClaimsView from '../components/claims/ClaimsView';
import PriceAlertsView from '../components/pricealerts/PriceAlertsView';
import TasksView from '../components/tasks/TasksView';
import ImportView from '../components/import/ImportView';
import RequestsView from '../components/requests/RequestsView';
import MonthlyOutcomesView from '../components/outcomes/MonthlyOutcomesView';
import SalesImportView from '../components/salesimport/SalesImportView';
import ScanIdentifyView from '../components/scan/ScanIdentifyView';
import CategoryInsightsView from '../components/insights/CategoryInsightsView';
import InvoiceCaptureView from '../components/invoices/InvoiceCaptureView';
import CreditNotesView from '../components/invoices/CreditNotesView';
import PriceHistoryView from '../components/invoices/PriceHistoryView';
import WeeklyReportView from '../components/report/WeeklyReportView';
import { ACCOUNTS_ENABLED, isLoggedIn, useSession } from '../lib/account';
import { INVOICES_ENABLED } from '../lib/features';
import { canSeeScreen, can } from '../lib/permissions';
import StaffView from '../components/account/StaffView';
import NotificationsView from '../components/account/NotificationsView';
import { maybeNotify } from '../lib/notifications';
import SaveSyncStatus from '../components/account/SaveSyncStatus';
import ConflictRecovery from '../components/account/ConflictRecovery';
import CloudBackups from '../components/account/CloudBackups';
import SupportView from '../components/account/SupportView';
import { useSyncStatus, CONFLICT_EVENT } from '../lib/sync';
import WorkerBoard from '../components/worker/WorkerBoard';
import SuggestionsInbox from '../components/worker/SuggestionsInbox';
import { getOpenSuggestionCount } from '../lib/suggestionsStore';
import { getOpenExceptionCount } from '../lib/taskStore';
import ErrorBoundary from '../components/ErrorBoundary';
import BuyingJourneyView from '../components/buy/BuyingJourneyView';
import SupplierInsightsView from '../components/buy/SupplierInsightsView';
import PaymentCalendarView from '../components/buy/PaymentCalendarView';
import { Route, Scale, CalendarClock as CalClock } from 'lucide-react';

const ONBOARDED_KEY = 'vendora:onboarded';
function isOnboarded() { try { return localStorage.getItem(ONBOARDED_KEY) === '1'; } catch { return true; } }

/**
 * HomePage — the phone app shell. Five tabs (Today / Scan / Stock / Buy / More) group the workflows
 * so the shop floor has one obvious place for each job. Reuses the workflow screens built in earlier
 * stages. The shop type tailors quick tools + the morning glance.
 */
export default function HomePage() {
  const saved = getSavedShopType();
  const { role } = useSession(); // 'owner' for guest/accounts-off; 'manager'/'staff' for signed-in members
  const isStaff = role === 'staff';
  const syncState = useSyncStatus();
  const conflicts = syncState.conflicts || 0; // edits replaced by another device, kept for recovery
  const [, bumpWs] = useState(0); // re-render on workspace switch (e.g. entering/leaving demo)
  useEffect(() => {
    const h = () => bumpWs((n) => n + 1);
    window.addEventListener('vendora:workspace', h);
    return () => window.removeEventListener('vendora:workspace', h);
  }, []);
  const demo = isDemoActive();
  const [tab, setTab] = useState('today');
  const [screen, setScreen] = useState(null); // full-page workflow screen
  const [activeTool, setActiveTool] = useState(null);
  const [showPromises, setShowPromises] = useState(() => !isOnboarded());
  const [lastBackupAt, setLastBackupAt] = useState(getLastBackupAt);
  const restoreInputRef = useRef(null);

  function go(target) {
    if (!target) return;
    if (target.tab) { setScreen(null); setTab(target.tab); }
    else if (target.screen) setScreen(target.screen);
  }
  function dismissPromises() { try { localStorage.setItem(ONBOARDED_KEY, '1'); } catch { /* ignore */ } setShowPromises(false); }

  // Opportunistic device digest — at most once/day, only in the chosen window, only if something's due.
  // The reliable channel is the server email; this just surfaces the same summary when the app is opened.
  useEffect(() => { maybeNotify().catch(() => {}); }, []);

  // Two-device conflict: a newer change from another device replaced one of ours. Sync kept the replaced
  // copy; tell the owner so it's never a silent loss (Phase 1.1g). They can review it in More → Data.
  useEffect(() => {
    const onConflict = () => {
      toast('A newer change from another device replaced one of yours. Your copy is saved — see More → Data → Recovered changes.',
        { id: 'sync-conflict', icon: '🔀', duration: 7000 });
    };
    window.addEventListener(CONFLICT_EVENT, onConflict);
    return () => window.removeEventListener(CONFLICT_EVENT, onConflict);
  }, []);

  async function onExport() {
    const shared = await shareBackup();
    if (shared) { setLastBackupAt(getLastBackupAt()); return; }
    const ok = downloadBackup();
    if (ok) setLastBackupAt(getLastBackupAt());
    toast[ok ? 'success' : 'error'](ok ? 'Backup downloaded' : 'Couldn’t create the backup');
  }
  function onRestoreFile(e) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const parsed = readBackup(String(reader.result || ''));
      if (!parsed.ok) { toast.error(parsed.error || 'That file isn’t a valid backup'); return; }
      const lines = Object.entries(parsed.summary).map(([k, n]) => `• ${k.replace(/_v1$/, '')}: ${n}`).join('\n');
      const when = parsed.meta.exportedAt ? new Date(parsed.meta.exportedAt).toLocaleString('en-GB') : 'unknown date';
      if (!window.confirm(`Restore this backup (from ${when})?\n\n${lines}\n\nThis REPLACES the data in your current view. A recovery copy of your current data will be downloaded first so you can undo.`)) return;
      downloadBackup(undefined, 'vendora-recovery');
      const res = restoreBackup(parsed.data, { mode: 'replace' });
      if (res.ok) { toast.success(`Restored ${res.restored} item groups — reloading…`); setTimeout(() => window.location.reload(), 900); }
      else toast.error(res.error || 'Restore failed — your data was left unchanged');
    };
    reader.onerror = () => toast.error('Couldn’t read that file');
    reader.readAsText(file);
  }

  if (!saved) return <Navigate to="/" replace />;

  const family = getFamily(saved.familyId);
  const member = saved.memberId ? getMember(saved.familyId, saved.memberId) : null;
  const shopLabel = member?.label || family.label;
  const tools = getQuickToolsForFamily(saved.familyId);
  const accent = family.accent;
  const suggestionCount = getOpenSuggestionCount();
  const taskExceptions = getOpenExceptionCount();
  const ToolComponent = activeTool?.component || null;

  return (
    <div className="flex min-h-screen flex-col bg-gray-50">
      <a href="#main-content" className="skip-link">Skip to content</a>
      {demo && (
        <div className="flex items-center justify-between gap-2 bg-amber-100 px-4 py-2 text-xs font-medium text-amber-900" style={{ paddingTop: 'max(env(safe-area-inset-top), 0.5rem)' }}>
          <span className="flex items-center gap-1.5"><Sparkles className="h-3.5 w-3.5" /> Demo data — a pretend shop. Your real data is safe.</span>
          <button type="button" onClick={() => { exitDemo(); window.location.reload(); }} className="shrink-0 font-semibold underline">Exit demo</button>
        </div>
      )}
      <header className="sticky top-0 z-10 flex items-center gap-3 bg-white px-4 py-3 shadow-sm" style={{ paddingTop: 'max(env(safe-area-inset-top), 0.75rem)' }}>
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

      <main id="main-content" tabIndex={-1} className="flex-1 overflow-y-auto px-4 pb-24 pt-4 focus:outline-none">
        {/* Screen-level error recovery: a crash in any one screen shows a recovery card (and "Back to
            home") instead of blanking the whole app. Keyed by screen/tab so navigating away clears it. */}
        <ErrorBoundary key={screen || `tab:${tab}`} onReset={() => setScreen(null)}>
        {/* Full-page workflow screens. Money/cost + staff-admin screens are role-gated (defence in depth —
            staff never see the entry tiles either). The real guard is server-side. */}
        {screen && !canSeeScreen(role, screen) && (
          <div className="rounded-2xl border border-gray-100 bg-white p-6 text-center shadow-sm">
            <p className="text-sm font-semibold text-gray-700">Not available for your role</p>
            <p className="mt-1 text-xs text-gray-400">This section is for the shop owner or a manager.</p>
            <button type="button" onClick={() => setScreen(null)} className="mt-3 rounded-xl bg-primary px-4 py-2 text-xs font-semibold text-white">Back</button>
          </div>
        )}
        {screen === 'receive' && <DeliveryReceivingView />}
        {screen === 'waste' && <WasteView onBack={() => setScreen(null)} />}
        {screen === 'reorder' && <ReorderView onBack={() => setScreen(null)} />}
        {screen === 'deadstock' && <DeadStockView onBack={() => setScreen(null)} />}
        {screen === 'stocktake' && <StocktakeView onBack={() => setScreen(null)} />}
        {screen === 'refill' && <RefillView onBack={() => setScreen(null)} />}
        {screen === 'journey' && canSeeScreen(role, 'journey') && <BuyingJourneyView onBack={() => setScreen(null)} onGo={go} />}
        {screen === 'supplier-insights' && canSeeScreen(role, 'supplier-insights') && <SupplierInsightsView onBack={() => setScreen(null)} />}
        {screen === 'payments' && canSeeScreen(role, 'payments') && <PaymentCalendarView onBack={() => setScreen(null)} />}
        {screen === 'orders' && <OrdersView onBack={() => setScreen(null)} />}
        {screen === 'claims' && canSeeScreen(role, 'claims') && <ClaimsView onBack={() => setScreen(null)} />}
        {screen === 'price-alerts' && canSeeScreen(role, 'price-alerts') && <PriceAlertsView onBack={() => setScreen(null)} />}
        {screen === 'tasks' && <TasksView onBack={() => setScreen(null)} />}
        {screen === 'worker' && <WorkerBoard onBack={() => setScreen(null)} />}
        {screen === 'suggestions' && <SuggestionsInbox onBack={() => setScreen(null)} />}
        {screen === 'suppliers' && <SuppliersView onBack={() => setScreen(null)} familyId={saved.familyId} />}
        {screen === 'takings' && canSeeScreen(role, 'takings') && <TakingsView onBack={() => setScreen(null)} />}
        {screen === 'import' && <ImportView onBack={() => setScreen(null)} onDone={() => { setScreen(null); setTab('stock'); }} />}
        {screen === 'requests' && <RequestsView onBack={() => setScreen(null)} />}
        {screen === 'outcomes' && canSeeScreen(role, 'outcomes') && <MonthlyOutcomesView onBack={() => setScreen(null)} />}
        {screen === 'sales-import' && <SalesImportView onBack={() => setScreen(null)} />}
        {screen === 'scan-identify' && <ScanIdentifyView onBack={() => setScreen(null)} />}
        {screen === 'category-insights' && <CategoryInsightsView onBack={() => setScreen(null)} />}
        {screen === 'invoices' && INVOICES_ENABLED && canSeeScreen(role, 'invoices') && <InvoiceCaptureView onBack={() => setScreen(null)} />}
        {screen === 'credit-notes' && INVOICES_ENABLED && canSeeScreen(role, 'credit-notes') && <CreditNotesView onBack={() => setScreen(null)} />}
        {screen === 'price-history' && INVOICES_ENABLED && canSeeScreen(role, 'price-history') && <PriceHistoryView onBack={() => setScreen(null)} />}
        {screen === 'weekly-report' && canSeeScreen(role, 'weekly-report') && <WeeklyReportView onBack={() => setScreen(null)} />}
        {screen === 'staff-admin' && canSeeScreen(role, 'staff-admin') && <StaffView onBack={() => setScreen(null)} />}
        {screen === 'notifications' && <NotificationsView onBack={() => setScreen(null)} />}
        {screen === 'recovered' && <ConflictRecovery onBack={() => setScreen(null)} />}
        {screen === 'cloud-backups' && !isStaff && <CloudBackups onBack={() => setScreen(null)} />}
        {screen === 'support' && <SupportView onBack={() => setScreen(null)} />}
        {screen === 'overview' && canSeeScreen(role, 'overview') && (
          <OverviewView onBack={() => setScreen(null)} onOpen={(t) => { if (t === 'stock') { setScreen(null); setTab('stock'); } else setScreen(t); }} />
        )}

        {/* ── TODAY ── */}
        {!screen && tab === 'today' && (
          <>
            <FirstRunCard onGo={go} />
            <TodayActions onGo={go} />
            <TodayAtShop familyId={saved.familyId} />

            {showPromises && family.promises?.length > 0 && (
              <section className="mb-5 rounded-2xl border border-gray-100 bg-white p-4 shadow-sm">
                <div className="mb-2 flex items-center justify-between">
                  <h2 className="text-xs font-semibold uppercase tracking-wide text-gray-400">What Vendora helps with</h2>
                  <button type="button" onClick={dismissPromises} className="text-[11px] font-semibold text-primary">Got it</button>
                </div>
                <ul className="space-y-1.5">
                  {family.promises.map((p) => (
                    <li key={p} className="flex items-start gap-2 text-sm text-gray-700">
                      <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full" style={{ backgroundColor: accent }} />{p}
                    </li>
                  ))}
                </ul>
              </section>
            )}

            {tools.length > 0 && (
              <section className="mb-5">
                <h2 className="mb-3 text-xs font-semibold uppercase tracking-wide text-gray-400">Quick tools</h2>
                <div className="flex gap-3 overflow-x-auto pb-1">
                  {tools.map((t) => {
                    const Icon = t.icon;
                    return (
                      <button key={t.id} type="button" onClick={() => setActiveTool(t)} className="flex w-32 shrink-0 flex-col items-start rounded-2xl border border-gray-100 bg-white p-3 text-left shadow-sm transition hover:border-primary/40 hover:shadow-md active:scale-[0.98] focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2">
                        <span className="mb-2 flex h-9 w-9 items-center justify-center rounded-lg" style={{ backgroundColor: `${accent}1A`, color: accent }}><Icon className="h-5 w-5" strokeWidth={1.75} /></span>
                        <span className="text-sm font-semibold leading-tight text-gray-900">{t.label}</span>
                        <span className="mt-0.5 text-[11px] leading-snug text-gray-500">{t.tagline}</span>
                      </button>
                    );
                  })}
                </div>
              </section>
            )}
          </>
        )}

        {/* ── SCAN (hub) ── */}
        {!screen && tab === 'scan' && (
          <Hub title="Scan & check" subtitle="Identify a product, book in, count, or record waste.">
            <HubTile icon={ScanLine} accent={accent} label="Scan to identify" desc="What is it? Price, stock, single or case" onClick={() => setScreen('scan-identify')} />
            <HubTile icon={PackageCheck} accent={accent} label="Receive a delivery" desc="Cases/units, discrepancies, drafts" onClick={() => setScreen('receive')} />
            <HubTile icon={ClipboardCheck} accent={accent} label="Count stock" desc="Quick counts, catch shrinkage" onClick={() => setScreen('stocktake')} />
            <HubTile icon={CalendarClock} accent={accent} label="Expiry & waste" desc="Sell-first, bin the right batch" onClick={() => setScreen('waste')} />
          </Hub>
        )}

        {/* ── STOCK ── */}
        {!screen && tab === 'stock' && (
          <>
            <div className="mb-3 flex gap-2 overflow-x-auto pb-1">
              <Chip icon={ClipboardCheck} label="Count" onClick={() => setScreen('stocktake')} />
              <Chip icon={PackageOpen} label="Refill" onClick={() => setScreen('refill')} />
              <Chip icon={Hourglass} label="Slow stock" onClick={() => setScreen('deadstock')} />
              <Chip icon={BadgePercent} label="By category" onClick={() => setScreen('category-insights')} />
            </div>
            <InventoryView onOpenSuppliers={() => setScreen('suppliers')} onOpenImport={() => setScreen('import')} />
          </>
        )}

        {/* ── BUY (hub) ── */}
        {!screen && tab === 'buy' && (
          <Hub title="Buy & suppliers" subtitle="What to order, track orders, and recover credit.">
            {!isStaff && <HubTile icon={Route} accent={accent} label="Buying journey" desc="Order → delivery → invoice → claim → credit" onClick={() => setScreen('journey')} />}
            <HubTile icon={ShoppingCart} accent={accent} label="Buy list" desc="Low stock → cash-&-carry list" onClick={() => setScreen('reorder')} />
            <HubTile icon={Truck} accent={accent} label="Orders" desc="Track what you’ve ordered" onClick={() => setScreen('orders')} />
            <HubTile icon={Building2} accent={accent} label="Suppliers" desc="Your regular buying places" onClick={() => setScreen('suppliers')} />
            {INVOICES_ENABLED && !isStaff && <HubTile icon={FileSpreadsheet} accent={accent} label="Supplier invoices" desc="Capture & check vs delivery" onClick={() => setScreen('invoices')} />}
            {!isStaff && <HubTile icon={Receipt} accent={accent} label="Supplier claims" desc="Recover credit for bad goods" onClick={() => setScreen('claims')} />}
            {INVOICES_ENABLED && !isStaff && <HubTile icon={Coins} accent={accent} label="Credit notes" desc="Match supplier credits to claims" onClick={() => setScreen('credit-notes')} />}
            {!isStaff && <HubTile icon={BadgePercent} accent={accent} label="Price changes" desc="Cost moved? Review the margin" onClick={() => setScreen('price-alerts')} />}
            {INVOICES_ENABLED && !isStaff && <HubTile icon={TrendingUp} accent={accent} label="Price history" desc="Confirmed costs from invoices" onClick={() => setScreen('price-history')} />}
            {!isStaff && <HubTile icon={Scale} accent={accent} label="Compare suppliers" desc="Unit costs & reliability" onClick={() => setScreen('supplier-insights')} />}
            {!isStaff && <HubTile icon={CalClock} accent={accent} label="Payments due" desc="Bills, due dates & expected credits" onClick={() => setScreen('payments')} />}
            <HubTile icon={MessageSquarePlus} accent={accent} label="Customer requests" desc="What shoppers ask for" onClick={() => setScreen('requests')} />
          </Hub>
        )}

        {/* ── MORE ── */}
        {!screen && tab === 'more' && (
          <div className="space-y-5">
            {!isStaff && (
              <MoreGroup title="Money">
                <Row icon={Coins} label="Takings & cash-up" onClick={() => setScreen('takings')} />
                <Row icon={LayoutDashboard} label="Owner glance" onClick={() => setScreen('overview')} />
                <Row icon={CalendarClock} label="This month" sub="Actual credits, tasks & coverage" onClick={() => setScreen('outcomes')} />
                <Row icon={FileSpreadsheet} label="Weekly report" sub="Checking, waste, claims & price changes" onClick={() => setScreen('weekly-report')} />
              </MoreGroup>
            )}
            <MoreGroup title="Team">
              <Row icon={ClipboardList} label="Team tasks" onClick={() => setScreen('tasks')} badge={taskExceptions} />
              <Row icon={Users} label="Staff view" onClick={() => setScreen('worker')} />
              <Row icon={Inbox} label="From the team" onClick={() => setScreen('suggestions')} badge={suggestionCount} />
            </MoreGroup>
            <MoreGroup title="Data">
              <Row icon={FileSpreadsheet} label="Import till sales" sub="Turn estimates into confirmed sales (optional)" onClick={() => setScreen('sales-import')} />
              <Row icon={Download} label="Export backup" sub={lastBackupAt ? `Last saved ${new Date(lastBackupAt).toLocaleDateString('en-GB')} · a file you can restore` : 'Save your data to a file you can restore — no backup yet'} onClick={onExport} />
              <Row icon={Upload} label="Restore from backup" sub="Load a backup file — replaces current data" onClick={() => restoreInputRef.current?.click()} />
              <input ref={restoreInputRef} type="file" accept="application/json,.json" onChange={onRestoreFile} hidden />
              {ACCOUNTS_ENABLED && isLoggedIn() && !isStaff && (
                <Row icon={CloudCog} label="Cloud version history" sub="Roll a store back to an earlier saved version" onClick={() => setScreen('cloud-backups')} />
              )}
              {conflicts > 0 && (
                <Row icon={GitMerge} label="Recovered changes" sub="Edits replaced by another device — kept safe" onClick={() => setScreen('recovered')} badge={conflicts} />
              )}
            </MoreGroup>
            <MoreGroup title="Settings">
              <InstallCard />
              <Row icon={Bell} label="Notifications" sub="Daily heads-up: expiry, claims, tasks" onClick={() => setScreen('notifications')} />
              <Row icon={LifeBuoy} label="Help & diagnostics" sub="App status + report a problem" onClick={() => setScreen('support')} />
              <RowLink to="/" icon={Settings} label="Change shop type" />
              {ACCOUNTS_ENABLED && <RowLink to="/account" icon={LogIn} label="Your shop account" />}
              {ACCOUNTS_ENABLED && isLoggedIn() && can(role, 'manageStaff') && (
                <Row icon={UserCog} label="Staff access" sub="Give your team their own logins" onClick={() => setScreen('staff-admin')} />
              )}
              <SaveSyncStatus />
            </MoreGroup>
            <p className="px-1 text-center text-xs text-gray-400">Set up as {shopLabel} · Vendora</p>
          </div>
        )}
        </ErrorBoundary>
      </main>

      <nav className="fixed inset-x-0 bottom-0 z-10 mx-auto flex max-w-2xl items-stretch justify-around border-t border-gray-200 bg-white" style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}>
        <NavTab label="Today" icon={ListChecks} active={!screen && tab === 'today'} onClick={() => go({ tab: 'today' })} accent={accent} />
        <NavTab label="Scan" icon={ScanLine} active={!screen && tab === 'scan'} onClick={() => go({ tab: 'scan' })} accent={accent} />
        <NavTab label="Stock" icon={Package2} active={!screen && tab === 'stock'} onClick={() => go({ tab: 'stock' })} accent={accent} />
        <NavTab label="Buy" icon={ShoppingCart} active={!screen && tab === 'buy'} onClick={() => go({ tab: 'buy' })} accent={accent} />
        <NavTab label="More" icon={MoreHorizontal} active={!screen && tab === 'more'} onClick={() => go({ tab: 'more' })} accent={accent} badge={taskExceptions + suggestionCount} />
      </nav>

      {activeTool && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-0 sm:items-center sm:p-4" onClick={() => setActiveTool(null)} role="dialog" aria-modal="true" aria-label={activeTool.label}>
          <div className="flex max-h-[88vh] w-full max-w-md flex-col overflow-hidden rounded-t-3xl bg-white shadow-xl sm:rounded-3xl" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between border-b border-gray-100 px-5 py-4">
              <h3 className="text-base font-bold text-gray-900">{activeTool.label}</h3>
              <button type="button" onClick={() => setActiveTool(null)} className="flex h-11 w-11 items-center justify-center rounded-full text-gray-500 hover:bg-gray-100" aria-label="Close"><X className="h-5 w-5" /></button>
            </div>
            <div className="overflow-y-auto px-5 pt-5" style={{ paddingBottom: 'max(env(safe-area-inset-bottom), 1.25rem)' }}>
              {ToolComponent && <ToolComponent />}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function Hub({ title, subtitle, children }) {
  return (
    <div>
      <h2 className="mb-1 text-base font-bold text-gray-900">{title}</h2>
      <p className="mb-4 text-xs text-gray-400">{subtitle}</p>
      <div className="space-y-2">{children}</div>
    </div>
  );
}

function HubTile({ icon: Icon, label, desc, onClick, accent }) {
  return (
    <button type="button" onClick={onClick} className="flex w-full items-center gap-3 rounded-2xl border border-gray-100 bg-white p-4 text-left shadow-sm transition hover:border-primary/40 hover:shadow-md active:scale-[0.99] focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2">
      <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl" style={{ backgroundColor: `${accent}1A`, color: accent }}><Icon className="h-6 w-6" strokeWidth={1.75} /></span>
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-semibold text-gray-900">{label}</span>
        <span className="block text-[11px] text-gray-500">{desc}</span>
      </span>
      <ChevronRight className="h-4 w-4 shrink-0 text-gray-300" />
    </button>
  );
}

function Chip({ icon: Icon, label, onClick }) {
  return (
    <button type="button" onClick={onClick} className="flex shrink-0 items-center gap-1.5 rounded-full border border-gray-200 bg-white px-3 py-1.5 text-xs font-semibold text-gray-700 active:scale-95">
      <Icon className="h-3.5 w-3.5 text-gray-400" /> {label}
    </button>
  );
}

function MoreGroup({ title, children }) {
  return (
    <section>
      <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-400">{title}</h3>
      <div className="space-y-2">{children}</div>
    </section>
  );
}

function Row({ icon: Icon, label, sub, onClick, badge = 0 }) {
  return (
    <button type="button" onClick={onClick} className="flex w-full items-center gap-3 rounded-2xl border border-gray-100 bg-white p-4 text-left shadow-sm active:scale-[0.99]">
      <Icon className="h-5 w-5 text-gray-400" />
      <span className="flex-1">
        <span className="block text-sm font-medium text-gray-900">{label}</span>
        {sub && <span className="block text-[11px] text-gray-400">{sub}</span>}
      </span>
      {badge > 0 && <span className="flex h-5 min-w-[1.25rem] items-center justify-center rounded-full bg-danger px-1 text-[10px] font-bold text-white">{badge}</span>}
      <ChevronRight className="h-4 w-4 text-gray-300" />
    </button>
  );
}

function RowLink({ to, icon: Icon, label }) {
  return (
    <Link to={to} className="flex items-center gap-3 rounded-2xl border border-gray-100 bg-white p-4 shadow-sm">
      <Icon className="h-5 w-5 text-gray-400" />
      <span className="flex-1 text-sm font-medium text-gray-900">{label}</span>
      <ChevronRight className="h-4 w-4 text-gray-300" />
    </Link>
  );
}

function NavTab({ label, icon: Icon, active, onClick, accent, badge = 0 }) {
  return (
    <button type="button" onClick={onClick} className="relative flex flex-1 flex-col items-center gap-0.5 py-2 text-[11px] font-medium" style={{ color: active ? accent : '#4b5563' }} aria-current={active ? 'page' : undefined}>
      {badge > 0 && <span className="absolute right-1/2 top-1 translate-x-3 rounded-full bg-danger px-1 text-[9px] font-bold text-white">{badge > 9 ? '9+' : badge}</span>}
      <Icon className="h-5 w-5" strokeWidth={active ? 2.25 : 1.75} />
      {label}
    </button>
  );
}
