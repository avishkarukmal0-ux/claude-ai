import React, { useState, useEffect, useCallback } from 'react';
import { GraduationCap, Play, Square, RefreshCw, AlertTriangle, CheckCircle, BookOpen, Trash2 } from 'lucide-react';
import api from '../services/api';
import { useAuth } from '../context/AuthContext';
import toast from 'react-hot-toast';
import dayjs from 'dayjs';

const TRAINING_KEY = 'vendora_training_mode';
const TRAINING_SALES_KEY = 'vendora_training_sales';

function TrainingBanner() {
  return (
    <div className="bg-amber-400 text-amber-900 rounded-2xl px-5 py-3 flex items-center gap-3 font-bold">
      <GraduationCap className="w-5 h-5" />
      TRAINING MODE ACTIVE — All transactions are simulated and will NOT affect inventory or reports
    </div>
  );
}

export default function TrainingModePage() {
  const { user, hasRole } = useAuth();
  const [isActive, setIsActive] = useState(() => localStorage.getItem(TRAINING_KEY) === 'true');
  const [trainingSales, setTrainingSales] = useState([]);
  const [toggling, setToggling] = useState(false);
  const [stats, setStats] = useState({ sessions: 0, transactions: 0, errors: 0 });

  const loadTrainingSales = useCallback(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(TRAINING_SALES_KEY) || '[]');
      setTrainingSales(saved.slice(-50).reverse()); // last 50, newest first
      setStats({
        sessions: 1,
        transactions: saved.length,
        errors: saved.filter(s => s.hadError).length,
      });
    } catch { }
  }, []);

  useEffect(() => {
    loadTrainingSales();
    const interval = setInterval(loadTrainingSales, 3000);
    return () => clearInterval(interval);
  }, [loadTrainingSales]);

  const handleToggle = async () => {
    if (!hasRole('manager')) {
      toast.error('Manager permission required to toggle training mode');
      return;
    }
    setToggling(true);
    try {
      const newState = !isActive;
      localStorage.setItem(TRAINING_KEY, String(newState));
      setIsActive(newState);
      if (newState) {
        toast.success('Training mode ON — POS transactions are now simulated', { duration: 5000 });
      } else {
        toast.success('Training mode OFF — POS returned to live mode');
      }
      // Notify backend for audit log
      await api.post('/pos/training/toggle', { active: newState }).catch(() => {});
    } finally { setToggling(false); }
  };

  const handleClearHistory = () => {
    localStorage.removeItem(TRAINING_SALES_KEY);
    loadTrainingSales();
    toast.success('Training history cleared');
  };

  const SCENARIOS = [
    {
      title: 'Basic Cash Sale',
      desc: 'Scan 3 items, accept cash payment, give change.',
      steps: ['Scan barcode or search product', 'Add 3 items to cart', 'Press Pay → Cash', 'Enter £20 tendered', 'Check change amount', 'Complete sale'],
    },
    {
      title: 'Age Verification (18+)',
      desc: 'Trigger Challenge 25 for an alcohol product.',
      steps: ['Scan an alcohol product (ageRestricted = true)', 'Age verification prompt appears', 'Press "Verified 18+" to continue', 'Process sale normally', 'Check transaction shows AV confirmed'],
    },
    {
      title: 'Void / Refund',
      desc: 'Process a sale then void it with supervisor PIN.',
      steps: ['Complete any cash sale', 'Go to Transactions', 'Find the sale → Void', 'Enter supervisor PIN', 'Confirm stock is restored'],
    },
    {
      title: 'Split Payment',
      desc: 'Take partial cash and rest on card.',
      steps: ['Add items to cart', 'Press Pay → Split Payment', 'Enter cash amount', 'Remainder auto-sets to card', 'Process card (simulated)', 'Receipt generated'],
    },
    {
      title: 'Discount & Promotion',
      desc: 'Apply a manual discount and a promotion.',
      steps: ['Scan a product on promotion', 'Check promotion auto-applies', 'Manually add a 10% discount', 'Verify totals update correctly', 'Complete sale'],
    },
    {
      title: 'Safe Drop',
      desc: 'Simulate a cash overflow safe drop.',
      steps: ['Go to Cash Management (training)', 'Check float — add £500 to simulate overflow', 'Run Safe Drop', 'Enter denominations', 'Confirm amount and submit'],
    },
  ];

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-black text-gray-900">Training Mode</h1>
          <p className="text-sm text-gray-500 mt-0.5">Safe practice environment — no real transactions</p>
        </div>
        <button onClick={loadTrainingSales} className="flex items-center gap-2 text-sm text-gray-500 hover:text-gray-700">
          <RefreshCw className="w-4 h-4" /> Refresh
        </button>
      </div>

      {isActive && <TrainingBanner />}

      {/* Toggle */}
      <div className={`rounded-2xl p-5 border ${isActive
        ? 'bg-amber-50 border-amber-200'
        : 'bg-white border-gray-100 shadow-sm'}`}>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className={`w-14 h-14 rounded-2xl flex items-center justify-center ${isActive ? 'bg-amber-100' : 'bg-gray-100'}`}>
              <GraduationCap className={`w-7 h-7 ${isActive ? 'text-amber-600' : 'text-gray-400'}`} />
            </div>
            <div>
              <p className="font-bold text-gray-900 text-lg">Training Mode is {isActive ? 'ON' : 'OFF'}</p>
              <p className="text-sm text-gray-500">
                {isActive
                  ? 'POS is in simulation — no inventory or revenue is affected'
                  : 'POS is live — all transactions are real'}
              </p>
            </div>
          </div>
          <button onClick={handleToggle} disabled={toggling || !hasRole('manager')}
            className={`flex items-center gap-2 px-5 py-3 rounded-xl font-bold text-sm transition disabled:opacity-50 ${isActive
              ? 'bg-red-600 hover:bg-red-700 text-white'
              : 'bg-amber-500 hover:bg-amber-600 text-white'}`}>
            {isActive ? <Square className="w-4 h-4" /> : <Play className="w-4 h-4" />}
            {toggling ? 'Please wait…' : isActive ? 'Stop Training' : 'Start Training'}
          </button>
        </div>
        {!hasRole('manager') && (
          <p className="text-xs text-gray-400 mt-3 flex items-center gap-1">
            <AlertTriangle className="w-3 h-3" /> Manager login required to enable/disable training mode
          </p>
        )}
      </div>

      {/* Stats */}
      {isActive && (
        <div className="grid grid-cols-3 gap-4">
          <div className="bg-white rounded-2xl p-4 border border-gray-100 shadow-sm text-center">
            <p className="text-3xl font-black text-gray-900">{stats.transactions}</p>
            <p className="text-xs text-gray-500">Practice Sales</p>
          </div>
          <div className="bg-white rounded-2xl p-4 border border-green-100 shadow-sm text-center">
            <p className="text-3xl font-black text-green-600">{stats.transactions - stats.errors}</p>
            <p className="text-xs text-gray-500">Completed OK</p>
          </div>
          <div className="bg-white rounded-2xl p-4 border border-red-100 shadow-sm text-center">
            <p className="text-3xl font-black text-red-600">{stats.errors}</p>
            <p className="text-xs text-gray-500">Had Errors</p>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Training scenarios */}
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <BookOpen className="w-4 h-4 text-gray-500" />
            <p className="font-semibold text-gray-900">Training Scenarios</p>
          </div>
          <div className="space-y-2">
            {SCENARIOS.map((s, i) => (
              <details key={i} className="bg-white rounded-xl border border-gray-100 shadow-sm group">
                <summary className="flex items-center justify-between px-4 py-3 cursor-pointer list-none">
                  <div>
                    <p className="text-sm font-semibold text-gray-900">{s.title}</p>
                    <p className="text-xs text-gray-400">{s.desc}</p>
                  </div>
                  <span className="text-gray-400 group-open:rotate-90 transition-transform text-lg leading-none">›</span>
                </summary>
                <div className="px-4 pb-4">
                  <ol className="space-y-1.5">
                    {s.steps.map((step, j) => (
                      <li key={j} className="flex items-start gap-2.5 text-sm text-gray-600">
                        <span className="w-5 h-5 rounded-full bg-blue-100 text-blue-700 text-xs font-bold flex items-center justify-center flex-shrink-0 mt-0.5">{j + 1}</span>
                        {step}
                      </li>
                    ))}
                  </ol>
                </div>
              </details>
            ))}
          </div>
        </div>

        {/* Training history */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <CheckCircle className="w-4 h-4 text-gray-500" />
              <p className="font-semibold text-gray-900">Practice History</p>
            </div>
            {trainingSales.length > 0 && (
              <button onClick={handleClearHistory} className="text-xs text-red-500 hover:text-red-700 flex items-center gap-1">
                <Trash2 className="w-3 h-3" /> Clear
              </button>
            )}
          </div>
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
            {trainingSales.length === 0 ? (
              <div className="text-center py-12 text-gray-400">
                <GraduationCap className="w-10 h-10 mx-auto mb-2 opacity-30" />
                <p className="text-sm">No practice transactions yet</p>
                {isActive
                  ? <p className="text-xs mt-1">Go to the POS terminal to start practicing</p>
                  : <p className="text-xs mt-1">Enable training mode above to begin</p>}
              </div>
            ) : (
              <div className="divide-y divide-gray-50 max-h-96 overflow-y-auto">
                {trainingSales.map((sale, i) => (
                  <div key={i} className="flex items-center gap-3 px-4 py-3">
                    <div className={`w-2 h-2 rounded-full flex-shrink-0 ${sale.hadError ? 'bg-red-400' : 'bg-green-400'}`} />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-gray-900">
                        {sale.items?.length || 0} item{(sale.items?.length || 0) !== 1 ? 's' : ''} ·{' '}
                        £{((sale.totalAmount || 0)).toFixed(2)}
                      </p>
                      <p className="text-xs text-gray-400">{dayjs(sale.timestamp || sale.createdAt).format('HH:mm:ss')}</p>
                    </div>
                    <span className={`text-xs font-medium ${sale.hadError ? 'text-red-500' : 'text-green-600'}`}>
                      {sale.hadError ? 'Error' : 'OK'}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
