import React from 'react';
import { useNavigate } from 'react-router-dom';
import { Lock } from 'lucide-react';
import { useSubscription } from '../../context/SubscriptionContext';

const FEATURE_INFO = {
  lossPrevention: {
    title: 'Loss Prevention Suite',
    description: 'Protect your business with advanced monitoring tools',
    bullets: [
      'Scan pattern detection',
      'Incident logging & tracking',
      'Panic button & duress PIN',
      'Customer watchlist',
      'Exception reporting',
    ],
    requiredPlan: 'plus',
    price: '£59/month',
  },
  loyaltyGiftCards: {
    title: 'Loyalty & Gift Cards',
    description: 'Reward customers and drive repeat business',
    bullets: [
      'Points earning & redemption',
      'Tier rewards (Bronze/Silver/Gold)',
      'Gift card issuing & redemption',
      'Customer segmentation',
      'Loyalty analytics',
    ],
    requiredPlan: 'plus',
    price: '£59/month',
  },
  smartReorder: {
    title: 'Smart Reorder AI',
    description: 'Never run out of stock with AI-powered reordering',
    bullets: [
      'AI demand forecasting',
      'Auto purchase order generation',
      'Supplier integration',
      'Stock level optimization',
      'Seasonal trend analysis',
    ],
    requiredPlan: 'plus',
    price: '£59/month',
  },
  xeroSync: {
    title: 'Xero / QuickBooks Sync',
    description: 'Seamless accounting integration',
    bullets: [
      'Real-time sales sync',
      'Automatic VAT filing',
      'Bank reconciliation',
      'P&L reporting',
      'Multi-currency support',
    ],
    requiredPlan: 'pro',
    price: '£99/month',
  },
  multiStore: {
    title: 'Multi-Store Management',
    description: 'Manage up to 5 locations from one dashboard',
    bullets: [
      'Centralised inventory',
      'Cross-store transfers',
      'Store performance comparison',
      'Unified staff management',
      'Consolidated reporting',
    ],
    requiredPlan: 'pro',
    price: '£99/month',
  },
};

const PLAN_BADGE = {
  plus: 'bg-blue-100 text-blue-700',
  pro: 'bg-purple-100 text-purple-700',
};

export default function LockedFeature({
  feature,
  requiredPlan,
  children,
  featureTitle,
  featureDescription,
  bulletPoints,
}) {
  const { hasFeature } = useSubscription();
  const navigate = useNavigate();

  const isUnlocked = hasFeature(feature);

  if (isUnlocked) {
    return <>{children}</>;
  }

  const info = FEATURE_INFO[feature] || {};
  const title = featureTitle || info.title || feature;
  const description = featureDescription || info.description || '';
  const bullets = bulletPoints || info.bullets || [];
  const plan = requiredPlan || info.requiredPlan || 'plus';
  const price = info.price || (plan === 'pro' ? '£99/month' : '£59/month');
  const planLabel = plan.charAt(0).toUpperCase() + plan.slice(1);

  return (
    <div className="relative">
      {/* Blurred children behind overlay */}
      <div className="pointer-events-none select-none filter blur-sm opacity-50">
        {children}
      </div>

      {/* Lock overlay */}
      <div className="absolute inset-0 flex items-center justify-center bg-white/80 rounded-xl z-10">
        <div className="max-w-sm w-full mx-auto p-6 text-center">
          {/* Lock icon */}
          <div className="flex items-center justify-center w-16 h-16 bg-gray-100 rounded-full mx-auto mb-4">
            <Lock className="w-8 h-8 text-gray-500" />
          </div>

          {/* Title */}
          <h3 className="text-xl font-bold text-gray-900 mb-1">Feature Locked</h3>
          <p className="text-sm text-gray-600 mb-3">
            {title} requires the{' '}
            <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-bold ${PLAN_BADGE[plan] || 'bg-blue-100 text-blue-700'}`}>
              {planLabel}
            </span>{' '}
            plan or higher
          </p>

          {description && (
            <p className="text-xs text-gray-500 mb-4">{description}</p>
          )}

          {/* Bullets */}
          {bullets.length > 0 && (
            <ul className="text-left space-y-1 mb-5 bg-gray-50 rounded-lg p-3">
              {bullets.map((b) => (
                <li key={b} className="text-xs text-gray-700 flex items-start gap-2">
                  <span className="text-green-500 font-bold mt-0.5">✓</span>
                  <span>{b}</span>
                </li>
              ))}
            </ul>
          )}

          {/* Price + CTA */}
          <p className="text-sm font-semibold text-gray-700 mb-3">
            From {price}
          </p>

          <button
            onClick={() => navigate('/subscription')}
            className="w-full py-2.5 bg-blue-600 hover:bg-blue-700 text-white text-sm font-bold rounded-xl transition-all mb-2"
          >
            View Plans &amp; Upgrade
          </button>
          <button
            onClick={() => navigate('/subscription')}
            className="w-full py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 text-sm font-medium rounded-xl transition-all"
          >
            Upgrade now — {price}
          </button>
        </div>
      </div>
    </div>
  );
}
