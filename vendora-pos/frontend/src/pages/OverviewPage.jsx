import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  RefreshCw, ShieldAlert, Trash2, TrendingUp, TrendingDown,
  ArrowRight, AlertTriangle, Receipt, Percent,
  CheckCircle2, ShoppingCart, Banknote, Undo2, PackagePlus, Users,
} from 'lucide-react';
import toast from 'react-hot-toast';
import * as overview from '../services/overview';

const fmt = (n) => `£${Number(n || 0).toFixed(2)}`;
const fmt0 = (n) => `£${Math.round(Number(n || 0)).toLocaleString('en-GB')}`;

// Trend pill: for cost metrics (theft) a rise is BAD (red); for sales a rise is GOOD (green).
function Trend({ pct, goodWhenUp = true }) {
  if (pct === null || pct === undefined) return <span className="text-xs text-gray-400">—</span>;
  const up = pct >= 0;
  const good = goodWhenUp ? up : !up;
  const Icon = up ? TrendingUp : TrendingDown;
  return (
    <span className={`inline-flex items-center gap-1 text-xs font-semibold ${good ? 'text-green-600' : 'text-red-600'}`}>
      <Icon size={13} /> {Math.abs(pct).toFixed(1)}% vs last week
    </span>
  );
}

// Big, thumb-friendly action button for the "everything at your fingertip" row.
function QuickAction({ icon: Icon, label, onClick }) {
  return (
    <button
      onClick={onClick}
      className="flex flex-col items-center justify-center gap-2 rounded-2xl border bg-white p-4 hover:bg-gray-50 active:scale-95 transition min-h-[92px]"
    >
      <Icon size={24} className="text-gray-700" />
      <span className="text-sm font-medium text-gray-800 text-center leading-tight">{label}</span>
    </button>
  );
}

export default function OverviewPage() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await overview.getThisWeek();
      setData(res);
    } catch {
      toast.error('Failed to load overview');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  if (loading && !data) {
    return (
      <div className="flex justify-center items-center h-96">
        <RefreshCw className="animate-spin text-blue-600" size={28} />
      </div>
    );
  }
  if (!data) return null;

  const { theft, waste, sales, alerts, today } = data;
  const alertItems = [
    { n: alerts.openIncidents,  label: 'open incidents',      to: '/loss-prevention' },
    { n: alerts.pendingPatterns, label: 'scan alerts to review', to: '/loss-prevention' },
    { n: alerts.expired,         label: 'expired lines on shelf', to: '/expiry' },
    { n: alerts.expiringSoon,    label: 'lines expiring ≤3 weeks', to: '/expiry' },
  ].filter(a => a.n > 0);

  // The emotional payload: one glance = "it's fine" or "N things need you".
  const allGood = alertItems.length === 0;

  const quickActions = [
    { icon: ShoppingCart, label: 'Open till',      to: '/pos' },
    { icon: Banknote,     label: 'Cash up',        to: '/cash-management' },
    { icon: Undo2,        label: 'Refund',         to: '/pos?refund=1' },
    { icon: Receipt,      label: "Today's sales",  to: '/transactions' },
    { icon: PackagePlus,  label: 'Reorder stock',  to: '/smart-reorder' },
  ];

  return (
    <div className="max-w-5xl mx-auto space-y-5 p-1">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Your shop</h1>
          <p className="text-sm text-gray-500">Everything that matters, at a glance</p>
        </div>
        <button onClick={load} className="text-gray-400 hover:text-gray-600 p-2" title="Refresh">
          <RefreshCw size={18} className={loading ? 'animate-spin' : ''} />
        </button>
      </div>

      {/* Shop status — the "glance and breathe" banner */}
      {allGood ? (
        <div className="rounded-2xl border border-green-200 bg-gradient-to-br from-green-50 to-white p-5 flex items-center gap-3">
          <CheckCircle2 size={28} className="text-green-600 shrink-0" />
          <div>
            <p className="font-semibold text-green-800">Everything's looking good</p>
            <p className="text-sm text-green-700/80">Nothing needs your attention right now — you're on top of it.</p>
          </div>
        </div>
      ) : (
        <button
          onClick={() => document.getElementById('needs-attention')?.scrollIntoView({ behavior: 'smooth' })}
          className="w-full text-left rounded-2xl border border-amber-200 bg-gradient-to-br from-amber-50 to-white p-5 flex items-center gap-3 hover:from-amber-100"
        >
          <AlertTriangle size={28} className="text-amber-500 shrink-0" />
          <div className="flex-1">
            <p className="font-semibold text-amber-800">
              {alertItems.length} {alertItems.length === 1 ? 'thing needs' : 'things need'} a look
            </p>
            <p className="text-sm text-amber-700/80">Tap to see what — none of it is on fire, just worth a moment.</p>
          </div>
          <ArrowRight size={18} className="text-amber-500" />
        </button>
      )}

      {/* Today so far — "am I making money today?" */}
      {today && (
        <div className="rounded-2xl border bg-white p-5">
          <div className="flex items-center justify-between mb-3">
            <h2 className="font-semibold text-gray-800">Today so far</h2>
            {today.staffOnShift > 0 && (
              <span className="inline-flex items-center gap-1.5 text-xs text-gray-500">
                <Users size={13} /> {today.staffOnShift} on shift
              </span>
            )}
          </div>
          <div className="flex items-end gap-3 flex-wrap">
            <p className="text-4xl font-bold text-gray-900">{fmt(today.takings)}</p>
            <div className="mb-1"><Trend pct={today.changePct} goodWhenUp /></div>
          </div>
          <p className="text-xs text-gray-500 mt-1">
            {today.transactions.toLocaleString('en-GB')} {today.transactions === 1 ? 'sale' : 'sales'} today
            {today.prevTakings > 0 && <> · {fmt(today.prevTakings)} by this time last week</>}
          </p>
        </div>
      )}

      {/* Hero: the two numbers that hurt — theft & waste */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Theft / shrinkage */}
        <div className="rounded-2xl border border-red-200 bg-gradient-to-br from-red-50 to-white p-5">
          <div className="flex items-center gap-2 text-red-700 mb-3">
            <ShieldAlert size={18} />
            <h2 className="font-semibold">Lost to theft &amp; shrinkage</h2>
          </div>
          <p className="text-4xl font-bold text-red-700">{fmt(theft.lost)}</p>
          <div className="mt-1"><Trend pct={theft.changePct} goodWhenUp={false} /></div>
          <div className="mt-4 grid grid-cols-3 gap-2 text-center">
            <div className="bg-white/70 rounded-lg p-2">
              <p className="text-lg font-bold text-gray-900">{theft.incidents}</p>
              <p className="text-[11px] text-gray-500">logged</p>
            </div>
            <div className="bg-white/70 rounded-lg p-2">
              <p className="text-lg font-bold text-gray-900">{theft.openCases}</p>
              <p className="text-[11px] text-gray-500">open cases</p>
            </div>
            <div className="bg-white/70 rounded-lg p-2">
              <p className="text-lg font-bold text-gray-900">{fmt(theft.perTransaction)}</p>
              <p className="text-[11px] text-gray-500">per sale “tax”</p>
            </div>
          </div>
          <button onClick={() => navigate('/loss-prevention')}
            className="mt-4 inline-flex items-center gap-1 text-sm font-medium text-red-700 hover:underline">
            Investigate <ArrowRight size={14} />
          </button>
        </div>

        {/* Waste / expiry — 3-week horizon so there's time to act */}
        <div className="rounded-2xl border border-amber-200 bg-gradient-to-br from-amber-50 to-white p-5">
          <div className="flex items-center gap-2 text-amber-700 mb-3">
            <Trash2 size={18} />
            <h2 className="font-semibold">Stock at risk of waste</h2>
          </div>
          <p className="text-4xl font-bold text-amber-700">{fmt(waste.atRiskSoon)}</p>
          <p className="text-xs text-gray-500 mt-1">
            expiring within {Math.round((waste.windowDays || 21) / 7)} weeks — time to push sales or mark down
          </p>
          <div className="mt-4 grid grid-cols-3 gap-2 text-center">
            <div className="bg-red-50 rounded-lg p-2">
              <p className="text-lg font-bold text-red-600">{fmt(waste.atRiskUrgent)}</p>
              <p className="text-[11px] text-gray-500">urgent ≤7 days ({waste.urgentCount ?? 0})</p>
            </div>
            <div className="bg-white/70 rounded-lg p-2">
              <p className="text-lg font-bold text-gray-900">{waste.expiringSoonCount}</p>
              <p className="text-[11px] text-gray-500">lines in {Math.round((waste.windowDays || 21) / 7)}w</p>
            </div>
            <div className="bg-white/70 rounded-lg p-2">
              <p className="text-lg font-bold text-red-600">{fmt(waste.expired)}</p>
              <p className="text-[11px] text-gray-500">expired ({waste.expiredCount})</p>
            </div>
          </div>
          <button onClick={() => navigate('/expiry')}
            className="mt-4 inline-flex items-center gap-1 text-sm font-medium text-amber-700 hover:underline">
            Push &amp; mark down <ArrowRight size={14} />
          </button>
        </div>
      </div>

      {/* This week — sales & margin */}
      <div>
        <p className="text-xs font-medium text-gray-400 uppercase tracking-wide mb-2 px-1">This week</p>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <div className="rounded-xl border bg-white p-4">
            <p className="text-xs text-gray-500">Sales</p>
            <p className="text-2xl font-bold text-gray-900">{fmt0(sales.revenue)}</p>
            <div className="mt-1"><Trend pct={sales.changePct} goodWhenUp /></div>
          </div>
          <div className="rounded-xl border bg-white p-4">
            <p className="text-xs text-gray-500">Gross profit</p>
            <p className="text-2xl font-bold text-green-700">{fmt0(sales.grossProfit)}</p>
          </div>
          <div className="rounded-xl border bg-white p-4">
            <p className="text-xs text-gray-500 flex items-center gap-1"><Percent size={12} /> Margin</p>
            <p className="text-2xl font-bold text-gray-900">{sales.marginPct.toFixed(1)}%</p>
          </div>
          <div className="rounded-xl border bg-white p-4">
            <p className="text-xs text-gray-500 flex items-center gap-1"><Receipt size={12} /> Transactions</p>
            <p className="text-2xl font-bold text-gray-900">{sales.transactions.toLocaleString('en-GB')}</p>
          </div>
        </div>
      </div>

      {/* Quick actions — everything at your fingertip */}
      <div>
        <p className="text-xs font-medium text-gray-400 uppercase tracking-wide mb-2 px-1">Quick actions</p>
        <div className="grid grid-cols-3 md:grid-cols-5 gap-3">
          {quickActions.map((a) => (
            <QuickAction key={a.label} icon={a.icon} label={a.label} onClick={() => navigate(a.to)} />
          ))}
        </div>
      </div>

      {/* Attention needed */}
      {alertItems.length > 0 && (
        <div id="needs-attention" className="rounded-xl border bg-white p-4">
          <div className="flex items-center gap-2 mb-3">
            <AlertTriangle size={16} className="text-amber-500" />
            <h3 className="font-semibold text-gray-800">Needs attention</h3>
          </div>
          <div className="flex flex-wrap gap-2">
            {alertItems.map((a, i) => (
              <button key={i} onClick={() => navigate(a.to)}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-gray-100 hover:bg-gray-200 text-sm text-gray-700">
                <span className="font-bold text-gray-900">{a.n}</span> {a.label}
                <ArrowRight size={13} className="text-gray-400" />
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
