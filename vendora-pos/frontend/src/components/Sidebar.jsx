import React from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useSubscription } from '../context/SubscriptionContext';
import toast from 'react-hot-toast';
import clsx from 'clsx';

const navSections = [
  { label: 'POS', minRole: 'cashier', items: [
    { to: '/pos',               icon: '🛒', label: 'POS Terminal' },
    { to: '/transactions',      icon: '📜', label: 'Transactions' },
    { to: '/collection-orders', icon: '📦', label: 'Click & Collect' },
    { to: '/queue-bust',        icon: '🏃', label: 'Queue Busting' },
    { to: '/self-checkout',     icon: '🤳', label: 'Self-Checkout' },
    { to: '/training',          icon: '🎓', label: 'Training Mode' },
    { to: '/offline-queue',     icon: '📶', label: 'Offline Queue' },
  ]},
  { label: 'Stock', minRole: 'cashier', items: [
    { to: '/products',        icon: '📦', label: 'Products' },
    { to: '/promotions',      icon: '🏷️', label: 'Promotions' },
    { to: '/smart-reorder',   icon: '🔁', label: 'Smart Reorder' },
    { to: '/stock-take',      icon: '📋', label: 'Stock Take' },
    { to: '/label-printing',  icon: '🖨️', label: 'Label Printing' },
  ]},
  { label: 'People', minRole: 'cashier', items: [
    { to: '/customers',       icon: '👥', label: 'Customers' },
    { to: '/loyalty',         icon: '⭐', label: 'Loyalty' },
    { to: '/staff',           icon: '👤', label: 'Staff', minRole: 'manager' },
    { to: '/schedule',        icon: '📅', label: 'Schedule' },
  ]},
  { label: 'Finance', minRole: 'supervisor', items: [
    { to: '/cash-management', icon: '💷', label: 'Cash Management' },
    { to: '/suppliers',       icon: '🚛', label: 'Suppliers' },
    { to: '/purchase-orders', icon: '📋', label: 'Purchase Orders' },
    { to: '/invoices',        icon: '🧾', label: 'Invoices' },
    { to: '/gift-cards',      icon: '🎁', label: 'Gift Cards' },
  ]},
  { label: 'Security', minRole: 'supervisor', items: [
    { to: '/loss-prevention', icon: '🔒', label: 'Loss Prevention' },
    { to: '/challenge25',     icon: '🔞', label: 'Challenge 25' },
  ]},
  { label: 'Insights', minRole: 'supervisor', items: [
    { to: '/reports',         icon: '📊', label: 'Reports' },
  ]},
  { label: 'System', minRole: 'manager', items: [
    { to: '/settings',        icon: '⚙️', label: 'Settings' },
  ]},
];

const PLAN_COLORS = {
  trial: 'bg-orange-100 text-orange-700',
  starter: 'bg-gray-100 text-gray-600',
  plus: 'bg-blue-100 text-blue-700',
  pro: 'bg-purple-100 text-purple-700',
};

function SubscriptionWidget() {
  const { subscription, trialDaysLeft } = useSubscription();
  const navigate = useNavigate();
  if (!subscription) return null;

  const planName =
    subscription.plan
      ? subscription.plan.charAt(0).toUpperCase() + subscription.plan.slice(1)
      : 'Trial';

  return (
    <div
      className="mx-3 mb-2 p-3 bg-gray-50 rounded-xl border border-gray-200 cursor-pointer hover:bg-gray-100 transition-all"
      onClick={() => navigate('/subscription')}
    >
      <div className="flex items-center justify-between mb-1">
        <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${PLAN_COLORS[subscription.plan] || PLAN_COLORS.trial}`}>
          {planName}
        </span>
        {subscription.status === 'trial' && trialDaysLeft !== null && (
          <span className={`text-xs font-medium ${trialDaysLeft <= 7 ? 'text-orange-600' : 'text-gray-500'}`}>
            {trialDaysLeft}d left
          </span>
        )}
        {subscription.status === 'active' && (
          <span className="text-xs text-gray-400">Active</span>
        )}
      </div>
      <p className="text-xs text-gray-500">Manage Subscription →</p>
    </div>
  );
}

export default function Sidebar({ onClose }) {
  const { user, logout, hasRole } = useAuth();
  const navigate = useNavigate();

  const handleLogout = async () => {
    await logout();
    navigate('/login');
    toast.success('Logged out');
  };

  return (
    <div className="flex flex-col h-full bg-white border-r border-gray-200 w-64">
      {/* Header */}
      <div className="p-4 border-b border-gray-100">
        <div className="flex items-center gap-3">
          <span className="text-2xl">🛒</span>
          <div>
            <p className="font-black text-gray-900 text-sm">Vendora POS</p>
            <p className="text-xs text-gray-500">v3.0</p>
          </div>
        </div>
      </div>

      {/* Nav */}
      <nav className="flex-1 overflow-y-auto p-3 space-y-4">
        {navSections.map((section) => {
          if (!hasRole(section.minRole || 'cashier')) return null;
          const visibleItems = section.items.filter((item) => !item.minRole || hasRole(item.minRole));
          if (visibleItems.length === 0) return null;
          return (
            <div key={section.label}>
              <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider px-3 mb-1">{section.label}</p>
              {visibleItems.map((item) => (
                <NavLink
                  key={item.to}
                  to={item.to}
                  onClick={onClose}
                  className={({ isActive }) => clsx(
                    'flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-all',
                    isActive ? 'bg-primary-50 text-primary font-semibold' : 'text-gray-700 hover:bg-gray-50'
                  )}
                >
                  <span>{item.icon}</span>
                  <span>{item.label}</span>
                </NavLink>
              ))}
            </div>
          );
        })}

        {/* Subscription widget */}
        <SubscriptionWidget />
      </nav>

      {/* User */}
      <div className="p-3 border-t border-gray-100">
        <div className="flex items-center gap-3 px-3 py-2 rounded-lg bg-gray-50">
          <div className="w-8 h-8 rounded-full bg-primary text-white flex items-center justify-center text-xs font-bold">
            {user?.displayName?.charAt(0)}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-gray-900 truncate">{user?.displayName}</p>
            <p className="text-xs text-gray-500 capitalize">{user?.role}</p>
          </div>
          <button onClick={handleLogout} className="text-gray-400 hover:text-gray-600 text-lg" title="Logout">⏏</button>
        </div>
      </div>
    </div>
  );
}
