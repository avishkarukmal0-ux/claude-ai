import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
import { CartProvider } from './context/CartContext';
import { SettingsProvider } from './context/SettingsContext';
import { SubscriptionProvider } from './context/SubscriptionContext';
import { OfflineProvider } from './context/OfflineContext';
import { NotificationProvider } from './context/NotificationContext';
import Layout from './components/Layout';
import LoginPage from './pages/LoginPage';
import SubscriptionPage from './pages/SubscriptionPage';
import SubscriptionSuccessPage from './pages/SubscriptionSuccessPage';
import POSPage from './pages/POSPage';
import ProductsPage from './pages/ProductsPage';
import CustomersPage from './pages/CustomersPage';
import StaffPage from './pages/StaffPage';
import ReportsPage from './pages/ReportsPage';
import SettingsPage from './pages/SettingsPage';
import CashManagementPage from './pages/CashManagementPage';
import LossPreventionPage from './pages/LossPreventionPage';
import SuppliersPage from './pages/SuppliersPage';
import PurchaseOrdersPage from './pages/PurchaseOrdersPage';
import PromotionsPage from './pages/PromotionsPage';
import GiftCardsPage from './pages/GiftCardsPage';
import SmartReorderPage from './pages/SmartReorderPage';
import TransactionHistoryPage from './pages/TransactionHistoryPage';
import StockTakePage from './pages/StockTakePage';
import SchedulePage from './pages/SchedulePage';
import InvoicesPage from './pages/InvoicesPage';
import LoyaltyPage from './pages/LoyaltyPage';
import LabelPrintingPage from './pages/LabelPrintingPage';
import OfflineQueuePage from './pages/OfflineQueuePage';
import TrainingModePage from './pages/TrainingModePage';
import Challenge25Page from './pages/Challenge25Page';
import CustomerDisplayPage from './pages/CustomerDisplayPage';
import CollectionOrdersPage from './pages/CollectionOrdersPage';
import SelfCheckoutPage from './pages/SelfCheckoutPage';
import QueueBustPage from './pages/QueueBustPage';
import ExpiryDashboardPage from './pages/ExpiryDashboardPage';
import InvoiceReaderPage from './pages/InvoiceReaderPage';
import MarketIntelPage from './pages/MarketIntelPage';

function ProtectedRoute({ children, requiredRole }) {
  const { user, loading, hasRole } = useAuth();
  if (loading) return <div className="flex h-screen items-center justify-center bg-gray-50"><div className="animate-spin rounded-full h-12 w-12 border-4 border-primary border-t-transparent"></div></div>;
  if (!user) return <Navigate to="/login" replace />;
  if (requiredRole && !hasRole(requiredRole)) return <Navigate to="/" replace />;
  return children;
}

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <SubscriptionProvider>
          <SettingsProvider>
            <CartProvider>
              <OfflineProvider>
                <NotificationProvider>
                  <Routes>
                    <Route path="/login" element={<LoginPage />} />
                    <Route path="/" element={<ProtectedRoute><Layout /></ProtectedRoute>}>
                      <Route index element={<Navigate to="/pos" replace />} />
                      <Route path="pos" element={<POSPage />} />
                      <Route path="products" element={<ProductsPage />} />
                      <Route path="customers" element={<CustomersPage />} />
                      <Route path="staff" element={<ProtectedRoute requiredRole="manager"><StaffPage /></ProtectedRoute>} />
                      <Route path="reports" element={<ProtectedRoute requiredRole="supervisor"><ReportsPage /></ProtectedRoute>} />
                      <Route path="cash-management" element={<CashManagementPage />} />
                      <Route path="loss-prevention" element={<ProtectedRoute requiredRole="supervisor"><LossPreventionPage /></ProtectedRoute>} />
                      <Route path="suppliers" element={<SuppliersPage />} />
                      <Route path="purchase-orders" element={<PurchaseOrdersPage />} />
                      <Route path="promotions" element={<PromotionsPage />} />
                      <Route path="gift-cards" element={<GiftCardsPage />} />
                      <Route path="smart-reorder" element={<SmartReorderPage />} />
                      <Route path="transactions" element={<TransactionHistoryPage />} />
                      <Route path="stock-take" element={<StockTakePage />} />
                      <Route path="expiry" element={<ExpiryDashboardPage />} />
                      <Route path="invoice-reader" element={<InvoiceReaderPage />} />
                      <Route path="market" element={<MarketIntelPage />} />
                      <Route path="schedule" element={<SchedulePage />} />
                      <Route path="invoices" element={<ProtectedRoute requiredRole="supervisor"><InvoicesPage /></ProtectedRoute>} />
                      <Route path="loyalty" element={<LoyaltyPage />} />
                      <Route path="label-printing" element={<LabelPrintingPage />} />
                      <Route path="offline-queue" element={<OfflineQueuePage />} />
                      <Route path="training" element={<TrainingModePage />} />
                      <Route path="challenge25" element={<ProtectedRoute requiredRole="supervisor"><Challenge25Page /></ProtectedRoute>} />
                      <Route path="settings" element={<ProtectedRoute requiredRole="manager"><SettingsPage /></ProtectedRoute>} />
                      <Route path="collection-orders" element={<CollectionOrdersPage />} />
                      <Route path="subscription" element={<SubscriptionPage />} />
                      <Route path="subscription/success" element={<SubscriptionSuccessPage />} />
                    </Route>
                    <Route path="customer-display" element={<CustomerDisplayPage />} />
                    <Route path="self-checkout" element={<ProtectedRoute><SelfCheckoutPage /></ProtectedRoute>} />
                    <Route path="queue-bust" element={<ProtectedRoute><QueueBustPage /></ProtectedRoute>} />
                    <Route path="*" element={<Navigate to="/" replace />} />
                  </Routes>
                </NotificationProvider>
              </OfflineProvider>
            </CartProvider>
          </SettingsProvider>
        </SubscriptionProvider>
      </AuthProvider>
    </BrowserRouter>
  );
}
