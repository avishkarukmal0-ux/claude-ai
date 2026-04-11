import React from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useSubscription } from '../context/SubscriptionContext';
import toast from 'react-hot-toast';

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
    { to: '/expiry',          icon: '⏰', label: 'Expiry Tracker' },
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

function SubscriptionWidget() {
  const { subscription, trialDaysLeft } = useSubscription();
  const navigate = useNavigate();
  if (!subscription) return null;

  const planName =
    subscription.plan
      ? subscription.plan.charAt(0).toUpperCase() + subscription.plan.slice(1)
      : 'Trial';

  const isWarning = subscription.status === 'trial' && trialDaysLeft !== null && trialDaysLeft <= 7;

  return (
    <div
      style={{
        margin: '8px 8px 4px',
        padding: '10px 12px',
        background: isWarning ? 'rgba(217,119,6,0.12)' : 'rgba(255,255,255,0.04)',
        borderRadius: 10,
        border: isWarning ? '1px solid rgba(217,119,6,0.3)' : '1px solid var(--border)',
        cursor: 'pointer',
        transition: 'var(--transition)',
      }}
      onClick={() => navigate('/subscription')}
    >
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
        <span style={{
          fontSize: 10, fontWeight: 700, padding: '2px 7px', borderRadius: 10,
          background: subscription.plan === 'pro' ? 'var(--purple-dim)' : subscription.plan === 'plus' ? 'var(--blue-dim)' : 'rgba(255,255,255,0.08)',
          color: subscription.plan === 'pro' ? 'var(--purple-light)' : subscription.plan === 'plus' ? 'var(--blue-light)' : 'var(--text-secondary)',
        }}>
          {planName}
        </span>
        {subscription.status === 'trial' && trialDaysLeft !== null && (
          <span style={{ fontSize: 10, fontWeight: 600, color: trialDaysLeft <= 7 ? 'var(--amber-light)' : 'var(--text-muted)' }}>
            {trialDaysLeft}d left
          </span>
        )}
        {subscription.status === 'active' && (
          <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>Active</span>
        )}
      </div>
      <p style={{ fontSize: 10, color: 'var(--text-muted)' }}>Manage Subscription →</p>
    </div>
  );
}

export default function Sidebar({ onClose }) {
  const { user, logout, hasRole } = useAuth();
  const navigate = useNavigate();

  React.useEffect(() => {
    const style = document.createElement('style');
    style.id = 'sidebar-styles';
    if (!document.getElementById('sidebar-styles')) {
      style.textContent = `
        .sidebar-item {
          display: flex; align-items: center; gap: 8px;
          padding: 6px 10px; margin: 1px 6px;
          border-radius: 8px; text-decoration: none;
          color: var(--text-secondary); transition: var(--transition);
          cursor: pointer;
        }
        .sidebar-item:hover { background: rgba(255,255,255,0.04); color: var(--text-primary); }
        .sidebar-item-active { background: var(--blue-dim) !important; color: var(--blue-light) !important; }
      `;
      document.head.appendChild(style);
    }
  }, []);

  const handleLogout = async () => {
    await logout();
    navigate('/login');
    toast.success('Logged out');
  };

  return (
    <div className="flex flex-col h-full" style={{
      width: 200, background: 'var(--bg-primary)',
      borderRight: '1px solid var(--border)'
    }}>
      {/* Logo */}
      <div style={{ padding: '16px 12px 12px', borderBottom: '1px solid var(--border)' }}>
        <div className="flex items-center gap-2.5">
          <div style={{
            width: 30, height: 30, borderRadius: 8,
            background: 'var(--blue)', display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 14
          }}>🛒</div>
          <div>
            <p style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-primary)', lineHeight: 1.2 }}>Vendora POS</p>
            <p style={{ fontSize: 10, color: 'var(--text-muted)', letterSpacing: '0.05em' }}>v3.0</p>
          </div>
        </div>
      </div>

      {/* Nav */}
      <nav className="flex-1 overflow-y-auto pos-scroll" style={{ padding: '8px 0' }}>
        {navSections.map((section) => {
          if (!hasRole(section.minRole || 'cashier')) return null;
          const visibleItems = section.items.filter(item => !item.minRole || hasRole(item.minRole));
          if (visibleItems.length === 0) return null;
          return (
            <div key={section.label} style={{ marginBottom: 4 }}>
              <p style={{
                fontSize: 9, fontWeight: 600, letterSpacing: '0.1em',
                textTransform: 'uppercase', color: 'var(--text-muted)',
                padding: '8px 14px 3px'
              }}>{section.label}</p>
              {visibleItems.map(item => (
                <NavLink
                  key={item.to}
                  to={item.to}
                  onClick={onClose}
                  className={({ isActive }) => isActive ? 'sidebar-item sidebar-item-active' : 'sidebar-item'}
                >
                  <span style={{ fontSize: 13 }}>{item.icon}</span>
                  <span style={{ fontSize: 12, fontWeight: 500 }}>{item.label}</span>
                </NavLink>
              ))}
            </div>
          );
        })}
        {/* Subscription widget */}
        <SubscriptionWidget />
      </nav>

      {/* User */}
      <div style={{ padding: '10px 10px', borderTop: '1px solid var(--border)' }}>
        <div className="flex items-center gap-2.5" style={{ padding: '6px 8px' }}>
          <div style={{
            width: 28, height: 28, borderRadius: '50%',
            background: 'var(--blue)', color: 'white',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 11, fontWeight: 700, flexShrink: 0
          }}>
            {user?.displayName?.charAt(0)}
          </div>
          <div className="flex-1 min-w-0">
            <p style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-primary)', lineHeight: 1.2 }} className="truncate">{user?.displayName}</p>
            <p style={{ fontSize: 10, color: 'var(--text-muted)', textTransform: 'capitalize' }}>{user?.role}</p>
          </div>
          <button onClick={handleLogout} style={{ color: 'var(--text-muted)', fontSize: 14 }} title="Logout">⏏</button>
        </div>
      </div>
    </div>
  );
}
