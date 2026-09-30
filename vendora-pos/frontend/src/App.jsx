import React, { useEffect, lazy, Suspense } from 'react';
import toast from 'react-hot-toast';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { STORAGE_ERROR_EVENT } from './lib/storage';
import { AuthProvider, useAuth } from './context/AuthContext';

// ── Standalone PWA (the product) — eager, tiny initial path ───────────────────
import NichePickerPage from './pages/NichePickerPage';
import HomePage from './pages/HomePage';
import AccountPage from './pages/AccountPage';

// ── Till / back-office (deferred product) — lazy so NONE of it is in the PWA's ──
// initial dependency path. Each page is its own chunk; providers are code-split too.
const TillProviders = lazy(() => import('./TillProviders'));
const Layout = lazy(() => import('./components/Layout'));
const LoginPage = lazy(() => import('./pages/LoginPage'));
const SubscriptionPage = lazy(() => import('./pages/SubscriptionPage'));
const SubscriptionSuccessPage = lazy(() => import('./pages/SubscriptionSuccessPage'));
const POSPage = lazy(() => import('./pages/POSPage'));
const ProductsPage = lazy(() => import('./pages/ProductsPage'));
const CustomersPage = lazy(() => import('./pages/CustomersPage'));
const StaffPage = lazy(() => import('./pages/StaffPage'));
const ReportsPage = lazy(() => import('./pages/ReportsPage'));
const SettingsPage = lazy(() => import('./pages/SettingsPage'));
const CashManagementPage = lazy(() => import('./pages/CashManagementPage'));
const LossPreventionPage = lazy(() => import('./pages/LossPreventionPage'));
const SuppliersPage = lazy(() => import('./pages/SuppliersPage'));
const PurchaseOrdersPage = lazy(() => import('./pages/PurchaseOrdersPage'));
const PromotionsPage = lazy(() => import('./pages/PromotionsPage'));
const GiftCardsPage = lazy(() => import('./pages/GiftCardsPage'));
const SmartReorderPage = lazy(() => import('./pages/SmartReorderPage'));
const TransactionHistoryPage = lazy(() => import('./pages/TransactionHistoryPage'));
const StockTakePage = lazy(() => import('./pages/StockTakePage'));
const SchedulePage = lazy(() => import('./pages/SchedulePage'));
const InvoicesPage = lazy(() => import('./pages/InvoicesPage'));
const LoyaltyPage = lazy(() => import('./pages/LoyaltyPage'));
const LabelPrintingPage = lazy(() => import('./pages/LabelPrintingPage'));
const OfflineQueuePage = lazy(() => import('./pages/OfflineQueuePage'));
const TrainingModePage = lazy(() => import('./pages/TrainingModePage'));
const Challenge25Page = lazy(() => import('./pages/Challenge25Page'));
const CustomerDisplayPage = lazy(() => import('./pages/CustomerDisplayPage'));
const CollectionOrdersPage = lazy(() => import('./pages/CollectionOrdersPage'));
const SelfCheckoutPage = lazy(() => import('./pages/SelfCheckoutPage'));
const QueueBustPage = lazy(() => import('./pages/QueueBustPage'));
const ExpiryDashboardPage = lazy(() => import('./pages/ExpiryDashboardPage'));
const InvoiceReaderPage = lazy(() => import('./pages/InvoiceReaderPage'));
const MarketIntelPage = lazy(() => import('./pages/MarketIntelPage'));
const AccountingPage = lazy(() => import('./pages/AccountingPage'));
const MarginSettingsPage = lazy(() => import('./pages/MarginSettingsPage'));
const OverviewPage = lazy(() => import('./pages/OverviewPage'));

function Spinner() {
  return (
    <div className="flex h-screen items-center justify-center bg-gray-50">
      <div className="h-12 w-12 animate-spin rounded-full border-4 border-primary border-t-transparent" />
    </div>
  );
}

function ProtectedRoute({ children, requiredRole }) {
  const { user, loading, hasRole } = useAuth();
  if (loading) return <Spinner />;
  if (!user) return <Navigate to="/login" replace />;
  if (requiredRole && !hasRole(requiredRole)) return <Navigate to="/" replace />;
  return children;
}

// Deferred till/back-office UI. OFF by default so the PWA-only pilot never mounts till routes; the
// catch-all redirect sends /pos, /self-checkout, /staff etc. back to home. Turn on with
// VITE_TILL_ENABLED=true only once the till's audit findings are fixed.
const TILL_ENABLED = (() => {
  try { return String(import.meta.env.VITE_TILL_ENABLED) === 'true'; } catch { return false; }
})();

export default function App() {
  // Surface storage-write failures instead of losing data silently (was swallowed before).
  useEffect(() => {
    const onErr = (e) => toast.error(e.detail?.error || 'Couldn’t save to this device.', { id: 'storage-error', duration: 6000 });
    window.addEventListener(STORAGE_ERROR_EVENT, onErr);
    return () => window.removeEventListener(STORAGE_ERROR_EVENT, onErr);
  }, []);

  return (
    <BrowserRouter>
      <AuthProvider>
        <Suspense fallback={<Spinner />}>
          <Routes>
            {/* ── Standalone PWA (the product) ── */}
            <Route path="/" element={<NichePickerPage />} />
            <Route path="/home" element={<HomePage />} />
            <Route path="/account" element={<AccountPage />} />
            <Route path="/login" element={<LoginPage />} />

            {/* ── Till / back-office (DEFERRED) — only mounted when VITE_TILL_ENABLED=true. Off in the
                   PWA-only pilot, so /pos, /self-checkout, /staff etc. fall through to the catch-all
                   redirect below instead of loading the till. Reversible via env. ── */}
            {TILL_ENABLED && (
            <Route element={<TillProviders />}>
              <Route element={<ProtectedRoute><Layout /></ProtectedRoute>}>
                <Route path="/overview" element={<ProtectedRoute requiredRole="supervisor"><OverviewPage /></ProtectedRoute>} />
                <Route path="/pos" element={<POSPage />} />
                <Route path="/products" element={<ProductsPage />} />
                <Route path="/customers" element={<CustomersPage />} />
                <Route path="/staff" element={<ProtectedRoute requiredRole="manager"><StaffPage /></ProtectedRoute>} />
                <Route path="/reports" element={<ProtectedRoute requiredRole="supervisor"><ReportsPage /></ProtectedRoute>} />
                <Route path="/cash-management" element={<CashManagementPage />} />
                <Route path="/loss-prevention" element={<ProtectedRoute requiredRole="supervisor"><LossPreventionPage /></ProtectedRoute>} />
                <Route path="/suppliers" element={<SuppliersPage />} />
                <Route path="/purchase-orders" element={<PurchaseOrdersPage />} />
                <Route path="/promotions" element={<PromotionsPage />} />
                <Route path="/gift-cards" element={<GiftCardsPage />} />
                <Route path="/smart-reorder" element={<SmartReorderPage />} />
                <Route path="/transactions" element={<TransactionHistoryPage />} />
                <Route path="/stock-take" element={<StockTakePage />} />
                <Route path="/expiry" element={<ExpiryDashboardPage />} />
                <Route path="/invoice-reader" element={<InvoiceReaderPage />} />
                <Route path="/market" element={<MarketIntelPage />} />
                <Route path="/schedule" element={<SchedulePage />} />
                <Route path="/invoices" element={<ProtectedRoute requiredRole="supervisor"><InvoicesPage /></ProtectedRoute>} />
                <Route path="/loyalty" element={<LoyaltyPage />} />
                <Route path="/label-printing" element={<LabelPrintingPage />} />
                <Route path="/offline-queue" element={<OfflineQueuePage />} />
                <Route path="/training" element={<TrainingModePage />} />
                <Route path="/challenge25" element={<ProtectedRoute requiredRole="supervisor"><Challenge25Page /></ProtectedRoute>} />
                <Route path="/accounting" element={<ProtectedRoute requiredRole="supervisor"><AccountingPage /></ProtectedRoute>} />
                <Route path="/settings/margins" element={<ProtectedRoute requiredRole="supervisor"><MarginSettingsPage /></ProtectedRoute>} />
                <Route path="/settings" element={<ProtectedRoute requiredRole="manager"><SettingsPage /></ProtectedRoute>} />
                <Route path="/collection-orders" element={<CollectionOrdersPage />} />
                <Route path="/subscription" element={<SubscriptionPage />} />
                <Route path="/subscription/success" element={<SubscriptionSuccessPage />} />
              </Route>
              <Route path="customer-display" element={<CustomerDisplayPage />} />
              <Route path="self-checkout" element={<ProtectedRoute><SelfCheckoutPage /></ProtectedRoute>} />
              <Route path="queue-bust" element={<ProtectedRoute><QueueBustPage /></ProtectedRoute>} />
            </Route>
            )}

            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </Suspense>
      </AuthProvider>
    </BrowserRouter>
  );
}
