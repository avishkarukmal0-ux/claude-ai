import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  RefreshCw, ShieldAlert, Trash2, TrendingUp, TrendingDown,
  ArrowRight, AlertTriangle, Receipt, Percent,
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

  const { theft, waste, sales, alerts } = data;
  const alertItems = [
    { n: alerts.openIncidents,  label: 'open incidents',      to: '/loss-prevention' },
    { n: alerts.pendingPatterns, label: 'scan alerts to review', to: '/loss-prevention' },
    { n: alerts.expired,         label: 'expired lines on shelf', to: '/expiry' },
    { n: alerts.expiringSoon,    label: 'lines expiring ≤7 days', to: '/expiry' },
  ].filter(a => a.n > 0);

  return (
    <div className="max-w-5xl mx-auto space-y-5 p-1">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">This Week</h1>
          <p className="text-sm text-gray-500">Last 7 days · where your money is going</p>
        </div>
        <button onClick={load} className="text-gray-400 hover:text-gray-600 p-2" title="Refresh">
          <RefreshCw size={18} className={loading ? 'animate-spin' : ''} />
        </button>
      </div>

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

        {/* Waste / expiry */}
        <div className="rounded-2xl border border-amber-200 bg-gradient-to-br from-amber-50 to-white p-5">
          <div className="flex items-center gap-2 text-amber-700 mb-3">
            <Trash2 size={18} />
            <h2 className="font-semibold">Stock at risk of waste</h2>
          </div>
          <p className="text-4xl font-bold text-amber-700">{fmt(waste.atRiskSoon)}</p>
          <p className="text-xs text-gray-500 mt-1">expiring within 7 days — mark down to recover it</p>
          <div className="mt-4 grid grid-cols-2 gap-2 text-center">
            <div className="bg-white/70 rounded-lg p-2">
              <p className="text-lg font-bold text-red-600">{fmt(waste.expired)}</p>
              <p className="text-[11px] text-gray-500">already expired ({waste.expiredCount})</p>
            </div>
            <div className="bg-white/70 rounded-lg p-2">
              <p className="text-lg font-bold text-gray-900">{waste.expiringSoonCount}</p>
              <p className="text-[11px] text-gray-500">lines expiring soon</p>
            </div>
          </div>
          <button onClick={() => navigate('/expiry')}
            className="mt-4 inline-flex items-center gap-1 text-sm font-medium text-amber-700 hover:underline">
            Mark down now <ArrowRight size={14} />
          </button>
        </div>
      </div>

      {/* Sales & margin */}
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

      {/* Attention needed */}
      {alertItems.length > 0 && (
        <div className="rounded-xl border bg-white p-4">
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
