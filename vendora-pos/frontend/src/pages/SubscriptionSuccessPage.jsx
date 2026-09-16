import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { CheckCircle, Sparkles } from 'lucide-react';
import { useSubscription } from '../context/SubscriptionContext';

const PLAN_COLORS = {
  starter: { badge: 'bg-gray-100 text-gray-700', ring: 'ring-gray-300', bg: 'from-gray-50 to-white' },
  plus: { badge: 'bg-blue-100 text-blue-700', ring: 'ring-blue-300', bg: 'from-blue-50 to-white' },
  pro: { badge: 'bg-purple-100 text-purple-700', ring: 'ring-purple-300', bg: 'from-purple-50 to-white' },
};

const CONFETTI_COLORS = [
  'bg-blue-400', 'bg-purple-400', 'bg-green-400', 'bg-yellow-400',
  'bg-pink-400', 'bg-indigo-400', 'bg-orange-400', 'bg-teal-400',
];

// Simple CSS confetti pieces
function Confetti() {
  const pieces = Array.from({ length: 40 }, (_, i) => ({
    id: i,
    color: CONFETTI_COLORS[i % CONFETTI_COLORS.length],
    left: `${Math.random() * 100}%`,
    delay: `${Math.random() * 2}s`,
    duration: `${2 + Math.random() * 2}s`,
    size: Math.random() > 0.5 ? 'w-2 h-2' : 'w-3 h-1',
    rotate: `${Math.random() * 360}deg`,
  }));

  return (
    <div className="fixed inset-0 pointer-events-none overflow-hidden z-10">
      {pieces.map((p) => (
        <div
          key={p.id}
          className={`absolute top-0 ${p.color} ${p.size} rounded-sm opacity-80`}
          style={{
            left: p.left,
            transform: `rotate(${p.rotate})`,
            animation: `confettiFall ${p.duration} ${p.delay} ease-in forwards`,
          }}
        />
      ))}
      <style>{`
        @keyframes confettiFall {
          0%   { transform: translateY(-20px) rotate(0deg); opacity: 1; }
          100% { transform: translateY(100vh) rotate(720deg); opacity: 0; }
        }
      `}</style>
    </div>
  );
}

export default function SubscriptionSuccessPage() {
  const navigate = useNavigate();
  const { subscription, refresh } = useSubscription();
  const [countdown, setCountdown] = useState(5);
  const [showConfetti, setShowConfetti] = useState(true);

  // Refresh subscription data on mount
  useEffect(() => {
    refresh();
  }, [refresh]);

  // Auto-redirect countdown
  useEffect(() => {
    if (countdown <= 0) {
      navigate('/subscription');
      return;
    }
    const timer = setTimeout(() => setCountdown((c) => c - 1), 1000);
    return () => clearTimeout(timer);
  }, [countdown, navigate]);

  // Stop confetti after a few seconds
  useEffect(() => {
    const timer = setTimeout(() => setShowConfetti(false), 5000);
    return () => clearTimeout(timer);
  }, []);

  const plan = subscription?.plan || 'plus';
  const planLabel = plan.charAt(0).toUpperCase() + plan.slice(1);
  const colors = PLAN_COLORS[plan] || PLAN_COLORS.plus;

  return (
    <div className={`min-h-screen bg-gradient-to-br ${colors.bg} flex items-center justify-center p-4 relative`}>
      {showConfetti && <Confetti />}

      <div className="relative z-20 max-w-md w-full">
        <div className={`bg-white rounded-3xl shadow-2xl ring-4 ${colors.ring} ring-offset-4 p-8 text-center`}>

          {/* Animated success icon */}
          <div className="flex items-center justify-center mb-6">
            <div className="relative">
              <div className="w-24 h-24 bg-green-100 rounded-full flex items-center justify-center animate-bounce">
                <CheckCircle className="w-12 h-12 text-green-600" />
              </div>
              <div className="absolute -top-2 -right-2">
                <Sparkles className="w-8 h-8 text-yellow-500 animate-pulse" />
              </div>
            </div>
          </div>

          {/* Main heading */}
          <h1 className="text-3xl font-black text-gray-900 mb-2">
            Welcome to {planLabel}!
          </h1>
          <p className="text-gray-500 text-sm mb-6">
            Your subscription is now active. All new features are ready to use.
          </p>

          {/* Plan badge */}
          <div className="inline-flex items-center gap-2 mb-6">
            <span className={`px-4 py-2 rounded-full text-sm font-black ${colors.badge}`}>
              {planLabel} Plan — Active
            </span>
          </div>

          {/* Feature highlights */}
          <div className="bg-gray-50 rounded-2xl p-4 mb-6 text-left space-y-2">
            <p className="text-xs font-bold text-gray-700 uppercase tracking-wide mb-3">
              What's unlocked
            </p>
            {plan === 'pro' ? (
              <>
                <FeatureItem>Unlimited tills &amp; staff</FeatureItem>
                <FeatureItem>Xero / QuickBooks sync</FeatureItem>
                <FeatureItem>Multi-store management (up to 5)</FeatureItem>
                <FeatureItem>API access &amp; custom reports</FeatureItem>
                <FeatureItem>Priority support</FeatureItem>
              </>
            ) : plan === 'plus' ? (
              <>
                <FeatureItem>2 Tills &amp; 10 staff accounts</FeatureItem>
                <FeatureItem>Loss prevention suite</FeatureItem>
                <FeatureItem>Loyalty &amp; gift cards</FeatureItem>
                <FeatureItem>Smart reorder AI</FeatureItem>
                <FeatureItem>Click &amp; collect + self-checkout</FeatureItem>
              </>
            ) : (
              <>
                <FeatureItem>1 Till &amp; 3 staff accounts</FeatureItem>
                <FeatureItem>500 products</FeatureItem>
                <FeatureItem>Cash management</FeatureItem>
                <FeatureItem>WhatsApp &amp; QR receipts</FeatureItem>
              </>
            )}
          </div>

          {/* Action buttons */}
          <button
            onClick={() => navigate('/subscription')}
            className="w-full py-3 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-xl transition-all mb-3"
          >
            Go to Subscription →
          </button>
          <button
            onClick={() => navigate('/pos')}
            className="w-full py-2.5 border border-gray-200 text-gray-700 font-medium rounded-xl hover:bg-gray-50 transition-all"
          >
            Back to POS Terminal
          </button>

          {/* Countdown */}
          <p className="text-xs text-gray-400 mt-4">
            Redirecting automatically in {countdown}s...
          </p>
        </div>
      </div>
    </div>
  );
}

function FeatureItem({ children }) {
  return (
    <div className="flex items-center gap-2 text-sm text-gray-700">
      <CheckCircle className="w-4 h-4 text-green-500 flex-shrink-0" />
      <span>{children}</span>
    </div>
  );
}
