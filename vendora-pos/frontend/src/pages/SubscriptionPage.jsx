import React, { useState, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { CheckCircle, XCircle, Lock, AlertTriangle, CreditCard, RefreshCw } from 'lucide-react';
import toast from 'react-hot-toast';
import dayjs from 'dayjs';
import api from '../services/api';
import { useSubscription } from '../context/SubscriptionContext';

// ─── Plan definitions ────────────────────────────────────────────────────────

const PLANS = [
  {
    key: 'starter',
    name: 'Starter',
    monthlyPrice: 29,
    annualPrice: 23,
    color: 'border-gray-200',
    badgeColor: 'bg-gray-100 text-gray-700',
    popular: false,
    features: [
      { label: '1 Till', included: true },
      { label: '3 Staff accounts', included: true },
      { label: '500 Products', included: true },
      { label: 'Challenge 25', included: true },
      { label: 'Cash management', included: true },
      { label: 'WhatsApp & QR receipts', included: true },
      { label: 'Lottery & top-up', included: true },
      { label: '5 Wholesalers', included: true },
      { label: 'Loss prevention', included: false },
      { label: 'Loyalty & gift cards', included: false },
      { label: 'Smart reorder AI', included: false },
      { label: 'Click & collect', included: false },
      { label: 'Self-checkout', included: false },
      { label: 'Staff scheduling', included: false },
      { label: 'Xero / QB sync', included: false },
      { label: 'Multi-store up to 5', included: false },
      { label: 'Custom reports', included: false },
      { label: 'API access', included: false },
      { label: 'Priority support', included: false },
    ],
  },
  {
    key: 'plus',
    name: 'Plus',
    monthlyPrice: 59,
    annualPrice: 47,
    color: 'border-blue-400',
    badgeColor: 'bg-blue-100 text-blue-700',
    popular: true,
    features: [
      { label: '2 Tills', included: true },
      { label: '10 Staff accounts', included: true },
      { label: 'Unlimited products', included: true },
      { label: 'Challenge 25', included: true },
      { label: 'Cash management', included: true },
      { label: 'WhatsApp & QR receipts', included: true },
      { label: 'Lottery & top-up', included: true },
      { label: '33 Wholesalers', included: true },
      { label: 'Loss prevention', included: true },
      { label: 'Loyalty & gift cards', included: true },
      { label: 'Smart reorder AI', included: true },
      { label: 'Click & collect', included: true },
      { label: 'Self-checkout', included: true },
      { label: 'Staff scheduling', included: true },
      { label: 'Xero / QB sync', included: false },
      { label: 'Multi-store up to 5', included: false },
      { label: 'Custom reports', included: false },
      { label: 'API access', included: false },
      { label: 'Priority support', included: false },
    ],
  },
  {
    key: 'pro',
    name: 'Pro',
    monthlyPrice: 99,
    annualPrice: 79,
    color: 'border-purple-400',
    badgeColor: 'bg-purple-100 text-purple-700',
    popular: false,
    features: [
      { label: 'Unlimited tills', included: true },
      { label: 'Unlimited staff', included: true },
      { label: 'Unlimited products', included: true },
      { label: 'Challenge 25', included: true },
      { label: 'Cash management', included: true },
      { label: 'WhatsApp & QR receipts', included: true },
      { label: 'Lottery & top-up', included: true },
      { label: '33 Wholesalers', included: true },
      { label: 'Loss prevention', included: true },
      { label: 'Loyalty & gift cards', included: true },
      { label: 'Smart reorder AI', included: true },
      { label: 'Click & collect', included: true },
      { label: 'Self-checkout', included: true },
      { label: 'Staff scheduling', included: true },
      { label: 'Xero / QB sync', included: true },
      { label: 'Multi-store up to 5', included: true },
      { label: 'Custom reports', included: true },
      { label: 'API access', included: true },
      { label: 'Priority support', included: true },
    ],
  },
];

const PLAN_ORDER = { trial: 0, starter: 1, plus: 2, pro: 3 };

const LOCKED_TEASERS = [
  {
    feature: 'lossPrevention',
    title: 'Loss Prevention Suite',
    description: 'Scan pattern detection, incident logging, panic button, and more.',
    requiredPlan: 'plus',
    price: '£59/month',
  },
  {
    feature: 'loyaltyGiftCards',
    title: 'Loyalty & Gift Cards',
    description: 'Points, tier rewards, gift card issuing, and customer segmentation.',
    requiredPlan: 'plus',
    price: '£59/month',
  },
  {
    feature: 'smartReorder',
    title: 'Smart Reorder AI',
    description: 'AI demand forecasting, auto purchase orders, supplier integration.',
    requiredPlan: 'plus',
    price: '£59/month',
  },
  {
    feature: 'xeroSync',
    title: 'Xero / QuickBooks Sync',
    description: 'Real-time sales sync, VAT filing, bank reconciliation.',
    requiredPlan: 'pro',
    price: '£99/month',
  },
  {
    feature: 'multiStore',
    title: 'Multi-Store Management',
    description: 'Centralised inventory, cross-store transfers, unified reporting.',
    requiredPlan: 'pro',
    price: '£99/month',
  },
];

// ─── Sub-components ───────────────────────────────────────────────────────────

function UsageBar({ label, used, limit, unit = '' }) {
  if (!limit || limit === Infinity) return null;
  const pct = Math.min(100, Math.round((used / limit) * 100));
  const isHigh = pct > 80;
  return (
    <div>
      <div className="flex justify-between text-xs text-gray-600 mb-1">
        <span>{label}</span>
        <span className={isHigh ? 'text-red-600 font-semibold' : ''}>
          {used}{unit} / {limit}{unit}
        </span>
      </div>
      <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
        <div
          className={`h-full rounded-full transition-all ${isHigh ? 'bg-red-500' : 'bg-blue-500'}`}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}

function ConfirmModal({ plan, billing, price, onConfirm, onCancel, loading }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-6">
        <h3 className="text-xl font-bold text-gray-900 mb-2">
          Upgrade to {plan.charAt(0).toUpperCase() + plan.slice(1)} — £{price}/{billing === 'annual' ? 'month' : 'month'}
        </h3>
        {billing === 'annual' && (
          <p className="text-xs text-green-600 font-semibold mb-3">Billed annually — save 20%</p>
        )}
        <p className="text-sm text-gray-600 mb-6">
          You'll be charged £{price} today. Cancel anytime.
        </p>
        <div className="flex gap-3">
          <button
            onClick={onCancel}
            disabled={loading}
            className="flex-1 py-2.5 border border-gray-200 text-gray-700 font-medium rounded-xl hover:bg-gray-50 transition-all disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            disabled={loading}
            className="flex-1 py-2.5 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-xl transition-all disabled:opacity-50 flex items-center justify-center gap-2"
          >
            {loading && <RefreshCw className="w-4 h-4 animate-spin" />}
            Confirm &amp; Pay
          </button>
        </div>
      </div>
    </div>
  );
}

function CancelModal({ onConfirm, onCancel, loading }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-6">
        <div className="flex items-center gap-3 mb-4">
          <AlertTriangle className="w-6 h-6 text-orange-500 flex-shrink-0" />
          <h3 className="text-lg font-bold text-gray-900">Cancel your plan?</h3>
        </div>
        <p className="text-sm text-gray-600 mb-6">
          Your plan will remain active until the end of the current billing period. You can reactivate at any time.
        </p>
        <div className="flex gap-3">
          <button
            onClick={onCancel}
            disabled={loading}
            className="flex-1 py-2.5 border border-gray-200 text-gray-700 font-medium rounded-xl hover:bg-gray-50 transition-all disabled:opacity-50"
          >
            Keep Plan
          </button>
          <button
            onClick={onConfirm}
            disabled={loading}
            className="flex-1 py-2.5 bg-red-600 hover:bg-red-700 text-white font-bold rounded-xl transition-all disabled:opacity-50 flex items-center justify-center gap-2"
          >
            {loading && <RefreshCw className="w-4 h-4 animate-spin" />}
            Cancel Plan
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function SubscriptionPage() {
  const { subscription, loading, refresh, hasFeature } = useSubscription();
  const navigate = useNavigate();
  const [billing, setBilling] = useState('monthly');
  const [confirmPlan, setConfirmPlan] = useState(null);
  const [showCancel, setShowCancel] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);
  const plusCardRef = useRef(null);

  const currentPlan = subscription?.plan || 'trial';
  const currentPlanLevel = PLAN_ORDER[currentPlan] ?? 0;

  // ── Handlers ───────────────────────────────────────────────────────────────

  const handleUpgrade = async () => {
    if (!confirmPlan) return;
    setActionLoading(true);
    try {
      const data = await api.post('/subscriptions/create-checkout', {
        plan: confirmPlan,
        billing,
      });
      if (data?.checkoutUrl) {
        window.location.href = data.checkoutUrl;
      } else {
        toast.error('Could not create checkout session.');
      }
    } catch {
      // error shown by interceptor
    } finally {
      setActionLoading(false);
      setConfirmPlan(null);
    }
  };

  const handleManageBilling = async () => {
    try {
      const data = await api.post('/subscriptions/billing-portal');
      if (data?.portalUrl) {
        window.location.href = data.portalUrl;
      } else {
        toast.error('Could not open billing portal.');
      }
    } catch {
      // error shown by interceptor
    }
  };

  const handleCancelPlan = async () => {
    setActionLoading(true);
    try {
      await api.post('/subscriptions/cancel');
      toast.success('Your plan has been cancelled.');
      await refresh();
      setShowCancel(false);
    } catch {
      // error shown by interceptor
    } finally {
      setActionLoading(false);
    }
  };

  const handleReactivate = async () => {
    setActionLoading(true);
    try {
      await api.post('/subscriptions/reactivate');
      toast.success('Your plan has been reactivated!');
      await refresh();
    } catch {
      // error shown by interceptor
    } finally {
      setActionLoading(false);
    }
  };

  const scrollToPlus = () => {
    plusCardRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  };

  // ── Derived values ─────────────────────────────────────────────────────────

  const trialDaysLeft =
    subscription?.trialDaysLeft ??
    (subscription?.trialEndsAt
      ? Math.max(0, Math.ceil((new Date(subscription.trialEndsAt) - Date.now()) / 86400000))
      : null);

  const trialPct = trialDaysLeft !== null ? Math.round(((30 - trialDaysLeft) / 30) * 100) : 0;
  const isPastDue = subscription?.status === 'past_due';
  const cancelAtEnd = subscription?.cancelAtPeriodEnd;

  const nextBilling =
    subscription?.currentPeriodEnd
      ? dayjs(subscription.currentPeriodEnd).format('D MMM YYYY')
      : null;

  const staffUsed = subscription?.usage?.staffCount ?? 0;
  const staffLimit = subscription?.features?.maxStaff ?? null;
  const productsUsed = subscription?.usage?.productCount ?? 0;
  const productsLimit = subscription?.features?.maxProducts ?? null;

  const PLAN_BADGE_COLORS = {
    trial: 'bg-orange-100 text-orange-700',
    starter: 'bg-gray-100 text-gray-700',
    plus: 'bg-blue-100 text-blue-700',
    pro: 'bg-purple-100 text-purple-700',
  };

  // ── Render ─────────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center">
        <RefreshCw className="w-8 h-8 animate-spin text-blue-600" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 p-4 md:p-8">
      {confirmPlan && (
        <ConfirmModal
          plan={confirmPlan}
          billing={billing}
          price={billing === 'annual'
            ? PLANS.find((p) => p.key === confirmPlan)?.annualPrice
            : PLANS.find((p) => p.key === confirmPlan)?.monthlyPrice}
          onConfirm={handleUpgrade}
          onCancel={() => setConfirmPlan(null)}
          loading={actionLoading}
        />
      )}
      {showCancel && (
        <CancelModal
          onConfirm={handleCancelPlan}
          onCancel={() => setShowCancel(false)}
          loading={actionLoading}
        />
      )}

      <div className="max-w-5xl mx-auto space-y-8">

        {/* ── Page Header ─────────────────────────────────────────────────── */}
        <div>
          <h1 className="text-2xl font-black text-gray-900">Subscription</h1>
          <p className="text-gray-500 text-sm mt-1">Manage your plan, billing, and features.</p>
        </div>

        {/* ── SECTION A: Current Plan Banner ──────────────────────────────── */}
        <div
          className={`bg-white rounded-2xl border-2 p-6 shadow-sm transition-all ${
            subscription?.status === 'trial' && trialDaysLeft !== null && trialDaysLeft <= 7
              ? 'border-orange-400 animate-pulse'
              : 'border-gray-200'
          }`}
          style={
            subscription?.status === 'trial' && trialDaysLeft !== null && trialDaysLeft <= 7
              ? { animationDuration: '2s' }
              : {}
          }
        >
          {/* Past due alert */}
          {isPastDue && (
            <div className="flex items-center gap-3 bg-red-50 border border-red-200 rounded-xl p-4 mb-4">
              <AlertTriangle className="w-5 h-5 text-red-600 flex-shrink-0" />
              <div>
                <p className="text-sm font-bold text-red-700">Payment failed — update your payment method</p>
                <p className="text-xs text-red-600 mt-0.5">Your subscription may be suspended if payment is not received.</p>
              </div>
              <button
                onClick={handleManageBilling}
                className="ml-auto px-4 py-2 bg-red-600 hover:bg-red-700 text-white text-xs font-bold rounded-lg transition-all"
              >
                Update Card
              </button>
            </div>
          )}

          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-3 mb-2">
                <span className={`px-3 py-1 rounded-full text-sm font-bold ${PLAN_BADGE_COLORS[currentPlan] || PLAN_BADGE_COLORS.trial}`}>
                  {currentPlan.charAt(0).toUpperCase() + currentPlan.slice(1)} Plan
                </span>
                {subscription?.status === 'active' && !cancelAtEnd && (
                  <span className="text-xs text-green-600 font-semibold">Active</span>
                )}
                {cancelAtEnd && (
                  <span className="text-xs text-orange-600 font-semibold">Cancels at period end</span>
                )}
              </div>

              {/* Trial progress */}
              {subscription?.status === 'trial' && trialDaysLeft !== null && (
                <div className="mb-4">
                  <p className="text-sm font-medium text-gray-700 mb-2">
                    {trialDaysLeft > 0
                      ? `${trialDaysLeft} day${trialDaysLeft !== 1 ? 's' : ''} left in your trial`
                      : 'Your trial has expired'}
                  </p>
                  <div className="h-2 bg-gray-100 rounded-full overflow-hidden max-w-xs">
                    <div
                      className={`h-full rounded-full transition-all ${
                        trialDaysLeft <= 7 ? 'bg-orange-500' : 'bg-blue-500'
                      }`}
                      style={{ width: `${trialPct}%` }}
                    />
                  </div>
                  <p className="text-xs text-gray-400 mt-1">{trialPct}% of trial used</p>
                </div>
              )}

              {/* Next billing */}
              {nextBilling && subscription?.status === 'active' && (
                <p className="text-sm text-gray-600">
                  Next billing: <span className="font-semibold text-gray-800">{nextBilling}</span>
                  {subscription?.price && (
                    <span className="text-gray-500"> · £{subscription.price}/month</span>
                  )}
                </p>
              )}

              {/* Usage bars */}
              {(staffLimit || productsLimit) && (
                <div className="mt-4 space-y-3 max-w-sm">
                  {staffLimit && (
                    <UsageBar label="Staff" used={staffUsed} limit={staffLimit} />
                  )}
                  {productsLimit && (
                    <UsageBar label="Products" used={productsUsed} limit={productsLimit} />
                  )}
                </div>
              )}
            </div>

            {/* Action buttons */}
            <div className="flex flex-col gap-2 min-w-fit">
              {subscription?.status === 'active' && (
                <button
                  onClick={handleManageBilling}
                  className="flex items-center gap-2 px-4 py-2.5 bg-gray-900 hover:bg-gray-800 text-white text-sm font-semibold rounded-xl transition-all"
                >
                  <CreditCard className="w-4 h-4" />
                  Manage Billing
                </button>
              )}
              {cancelAtEnd ? (
                <button
                  onClick={handleReactivate}
                  disabled={actionLoading}
                  className="px-4 py-2.5 bg-green-600 hover:bg-green-700 text-white text-sm font-semibold rounded-xl transition-all disabled:opacity-50"
                >
                  Reactivate
                </button>
              ) : (
                subscription?.status === 'active' && (
                  <button
                    onClick={() => setShowCancel(true)}
                    className="px-4 py-2.5 border border-gray-200 text-gray-600 text-sm font-medium rounded-xl hover:bg-gray-50 transition-all"
                  >
                    Cancel Plan
                  </button>
                )
              )}
            </div>
          </div>
        </div>

        {/* ── SECTION B: Plan Cards ────────────────────────────────────────── */}
        <div>
          {/* Billing toggle */}
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-lg font-bold text-gray-900">Choose a Plan</h2>
            <div className="flex items-center gap-1 bg-gray-100 p-1 rounded-xl">
              <button
                onClick={() => setBilling('monthly')}
                className={`px-4 py-1.5 rounded-lg text-sm font-medium transition-all ${
                  billing === 'monthly' ? 'bg-white shadow text-gray-900' : 'text-gray-500 hover:text-gray-700'
                }`}
              >
                Monthly
              </button>
              <button
                onClick={() => setBilling('annual')}
                className={`px-4 py-1.5 rounded-lg text-sm font-medium transition-all flex items-center gap-1.5 ${
                  billing === 'annual' ? 'bg-white shadow text-gray-900' : 'text-gray-500 hover:text-gray-700'
                }`}
              >
                Annual
                <span className="text-xs bg-green-100 text-green-700 px-1.5 py-0.5 rounded-full font-semibold">
                  Save 20%
                </span>
              </button>
            </div>
          </div>

          {/* Cards grid */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {PLANS.map((plan) => {
              const isCurrent = currentPlan === plan.key;
              const planLevel = PLAN_ORDER[plan.key] ?? 0;
              const isUpgrade = planLevel > currentPlanLevel;
              const isDowngrade = planLevel < currentPlanLevel;
              const price = billing === 'annual' ? plan.annualPrice : plan.monthlyPrice;

              return (
                <div
                  key={plan.key}
                  ref={plan.key === 'plus' ? plusCardRef : null}
                  className={`bg-white rounded-2xl border-2 p-6 flex flex-col transition-all ${
                    plan.popular ? 'border-blue-400 shadow-lg shadow-blue-100' : 'border-gray-200'
                  } ${isCurrent ? 'ring-2 ring-offset-2 ring-blue-500' : ''}`}
                >
                  {/* Card header */}
                  <div className="flex items-start justify-between mb-4">
                    <div>
                      <div className="flex items-center gap-2 mb-1">
                        <h3 className="text-lg font-black text-gray-900">{plan.name}</h3>
                        {plan.popular && (
                          <span className="text-xs bg-blue-600 text-white px-2 py-0.5 rounded-full font-bold">
                            Most Popular
                          </span>
                        )}
                      </div>
                      <div className="flex items-baseline gap-1">
                        <span className="text-3xl font-black text-gray-900">£{price}</span>
                        <span className="text-gray-500 text-sm">/month</span>
                      </div>
                      {billing === 'annual' && (
                        <p className="text-xs text-green-600 font-semibold mt-0.5">
                          Billed annually
                        </p>
                      )}
                    </div>
                    {isCurrent && (
                      <span className="text-xs bg-blue-50 text-blue-700 border border-blue-200 px-2 py-1 rounded-lg font-semibold">
                        Current
                      </span>
                    )}
                  </div>

                  {/* Feature list */}
                  <ul className="space-y-2 flex-1 mb-6">
                    {plan.features.map((feat) => (
                      <li key={feat.label} className="flex items-start gap-2 text-sm">
                        {feat.included ? (
                          <CheckCircle className="w-4 h-4 text-green-500 flex-shrink-0 mt-0.5" />
                        ) : (
                          <XCircle className="w-4 h-4 text-gray-300 flex-shrink-0 mt-0.5" />
                        )}
                        <span className={feat.included ? 'text-gray-800' : 'text-gray-400'}>
                          {feat.label}
                        </span>
                      </li>
                    ))}
                  </ul>

                  {/* CTA button */}
                  {isCurrent ? (
                    <button
                      disabled
                      className="w-full py-3 bg-gray-100 text-gray-500 font-semibold rounded-xl cursor-not-allowed text-sm"
                    >
                      Current Plan
                    </button>
                  ) : isUpgrade ? (
                    <button
                      onClick={() => setConfirmPlan(plan.key)}
                      className="w-full py-3 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-xl transition-all text-sm"
                    >
                      Upgrade to {plan.name} →
                    </button>
                  ) : (
                    <button
                      onClick={() => setConfirmPlan(plan.key)}
                      className="w-full py-3 bg-gray-100 hover:bg-gray-200 text-gray-700 font-semibold rounded-xl transition-all text-sm"
                    >
                      Downgrade to {plan.name}
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* ── SECTION C: Locked Feature Teasers ───────────────────────────── */}
        {LOCKED_TEASERS.some((t) => !hasFeature(t.feature)) && (
          <div>
            <h2 className="text-lg font-bold text-gray-900 mb-4">
              Unlock More Features
            </h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {LOCKED_TEASERS.filter((t) => !hasFeature(t.feature)).map((teaser) => (
                <div
                  key={teaser.feature}
                  className="bg-white rounded-2xl border border-gray-200 p-5 flex flex-col gap-3"
                >
                  <div className="flex items-center gap-2">
                    <div className="w-8 h-8 bg-gray-100 rounded-lg flex items-center justify-center">
                      <Lock className="w-4 h-4 text-gray-500" />
                    </div>
                    <div>
                      <p className="text-sm font-bold text-gray-900">{teaser.title}</p>
                      <span
                        className={`text-xs font-semibold px-1.5 py-0.5 rounded-full ${
                          teaser.requiredPlan === 'pro'
                            ? 'bg-purple-100 text-purple-700'
                            : 'bg-blue-100 text-blue-700'
                        }`}
                      >
                        {teaser.requiredPlan.charAt(0).toUpperCase() + teaser.requiredPlan.slice(1)} plan
                      </span>
                    </div>
                  </div>
                  <p className="text-xs text-gray-500 flex-1">{teaser.description}</p>
                  <button
                    onClick={scrollToPlus}
                    className="w-full py-2 bg-blue-50 hover:bg-blue-100 text-blue-700 text-xs font-bold rounded-xl transition-all"
                  >
                    Unlock with {teaser.requiredPlan.charAt(0).toUpperCase() + teaser.requiredPlan.slice(1)} →
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
