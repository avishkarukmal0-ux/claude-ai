import React, { useState, useEffect } from 'react';
import { Outlet, useNavigate } from 'react-router-dom';
import Sidebar from './Sidebar';
import { useAuth } from '../context/AuthContext';
import { useSubscription } from '../context/SubscriptionContext';
import api from '../services/api';

// Challenge 25 Training Reminder (#24)
function C25TrainingReminder({ onDismiss }) {
  async function acknowledge() {
    api.post('/challenge25/training-reminder/acknowledge').catch(() => {});
    onDismiss();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-8 text-center">
        <div className="text-6xl mb-4">🔞</div>
        <h2 className="text-2xl font-black text-gray-900 mb-2">Challenge 25 Reminder</h2>
        <p className="text-gray-600 mb-4 text-sm">
          Remember — if a customer looks under 25, ask for ID before selling age-restricted products.
        </p>
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 mb-6 text-sm text-left space-y-1">
          <p className="font-semibold text-amber-800">Accepted ID:</p>
          <p className="text-amber-700">✅ Passport</p>
          <p className="text-amber-700">✅ Driving licence (photo card)</p>
          <p className="text-amber-700">✅ PASS-accredited card (with hologram)</p>
          <p className="text-amber-700">✅ Military ID</p>
        </div>
        <p className="text-xs text-gray-500 mb-6">If in doubt, refuse the sale and log the refusal.</p>
        <button
          onClick={acknowledge}
          className="w-full py-3 bg-primary text-white font-bold rounded-xl hover:bg-primary/90 transition-all"
        >
          I understand — start my shift
        </button>
      </div>
    </div>
  );
}

export default function Layout() {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [showC25Reminder, setShowC25Reminder] = useState(false);
  const { user } = useAuth();
  const { subscription, trialDaysLeft } = useSubscription();
  const navigate = useNavigate();

  useEffect(() => {
    if (!user) return;
    // Check if staff needs today's C25 reminder
    api.get('/challenge25/training-reminder')
      .then(r => { if (r?.needsReminder) setShowC25Reminder(true); })
      .catch(() => {}); // Non-blocking
  }, [user]);

  return (
    <div className="flex h-screen overflow-hidden bg-gray-50">
      {showC25Reminder && <C25TrainingReminder onDismiss={() => setShowC25Reminder(false)} />}

      {/* Desktop sidebar */}
      <div className="hidden lg:flex lg:flex-shrink-0">
        <Sidebar />
      </div>

      {/* Mobile sidebar overlay */}
      {sidebarOpen && (
        <div className="fixed inset-0 z-40 flex lg:hidden">
          <div className="fixed inset-0 bg-gray-600 bg-opacity-75" onClick={() => setSidebarOpen(false)} />
          <div className="relative flex-1 flex flex-col max-w-xs w-full bg-white z-50">
            <Sidebar onClose={() => setSidebarOpen(false)} />
          </div>
        </div>
      )}

      {/* Main content */}
      <div className="flex flex-col flex-1 overflow-hidden">
        {/* Mobile topbar */}
        <div className="lg:hidden bg-white border-b border-gray-200 px-4 py-3 flex items-center gap-3">
          <button onClick={() => setSidebarOpen(true)} className="text-gray-600 text-xl">☰</button>
          <span className="font-bold text-gray-900">Vendora POS</span>
        </div>

        {/* Trial expiry banner */}
        {subscription?.status === 'trial' &&
          trialDaysLeft !== null &&
          trialDaysLeft <= 7 &&
          trialDaysLeft > 0 && (
            <div
              className={`px-4 py-2 text-sm font-medium text-center ${
                trialDaysLeft <= 3 ? 'bg-red-500 text-white' : 'bg-orange-400 text-white'
              }`}
            >
              ⚠️ {trialDaysLeft} day{trialDaysLeft !== 1 ? 's' : ''} left in your free trial
              <button
                onClick={() => navigate('/subscription')}
                className="ml-3 underline font-bold"
              >
                Choose a plan →
              </button>
            </div>
          )}

        <main className="flex-1 overflow-auto">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
