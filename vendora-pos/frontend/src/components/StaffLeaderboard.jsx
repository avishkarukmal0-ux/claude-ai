import React, { useState, useEffect, useRef } from 'react';
import api from '../services/api';
import { useAuth } from '../context/AuthContext';
import { Loader2, TrendingUp } from 'lucide-react';

const PERIODS = [
  { value: 'today', label: 'Today' },
  { value: 'week', label: 'Week' },
  { value: 'month', label: 'Month' },
];

const MEDALS = ['🥇', '🥈', '🥉'];

const MEDAL_STYLES = [
  'bg-yellow-50 border-yellow-200',
  'bg-gray-50 border-gray-200',
  'bg-orange-50 border-orange-100',
];

function SkeletonRow() {
  return (
    <div className="flex items-center gap-3 px-3 py-3 animate-pulse">
      <div className="w-8 h-8 rounded-full bg-gray-200 shrink-0" />
      <div className="flex-1 space-y-1.5">
        <div className="h-3.5 bg-gray-200 rounded w-32" />
        <div className="h-3 bg-gray-100 rounded w-20" />
      </div>
      <div className="text-right space-y-1">
        <div className="h-4 bg-gray-200 rounded w-16" />
        <div className="h-3 bg-gray-100 rounded w-10 ml-auto" />
      </div>
    </div>
  );
}

function CompactCard({ entry, rank }) {
  return (
    <div className={`flex flex-col items-center justify-center rounded-xl p-3 border ${rank < 3 ? MEDAL_STYLES[rank] : 'bg-white border-gray-100'} min-w-[90px]`}>
      <span className="text-2xl mb-1">{rank < 3 ? MEDALS[rank] : `#${rank + 1}`}</span>
      <p className="text-sm font-bold text-gray-800 text-center leading-tight truncate max-w-full">{entry.name || entry.displayName}</p>
      <p className="text-xs font-black text-green-700 mt-0.5">£{Number(entry.revenue || 0).toFixed(2)}</p>
    </div>
  );
}

export default function StaffLeaderboard({ showTitle = true, compact = false }) {
  const { user } = useAuth();
  const [leaderboard, setLeaderboard] = useState([]);
  const [period, setPeriod] = useState('today');
  const [loading, setLoading] = useState(true);
  const intervalRef = useRef(null);

  const load = async (p = period) => {
    setLoading(true);
    try {
      const res = await api.get(`/staff/leaderboard?period=${p}`);
      const list = Array.isArray(res) ? res : (res.leaderboard || res.data || []);
      setLeaderboard(list.slice(0, 5));
    } catch {
      setLeaderboard([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load(period);
    intervalRef.current = setInterval(() => load(period), 60000);
    return () => clearInterval(intervalRef.current);
  }, [period]);

  const topRevenue = leaderboard.length > 0 ? (leaderboard[0]?.revenue || 1) : 1;

  const isCurrentUser = entry =>
    user && (entry.staffId === user._id || entry._id === user._id || entry.displayName === user.displayName);

  // ── Compact mode: horizontal top-3 ─────────────────────────────────────────
  if (compact) {
    return (
      <div className="w-full">
        {showTitle && (
          <div className="flex items-center gap-2 mb-3">
            <TrendingUp size={16} className="text-blue-600" />
            <p className="text-sm font-bold text-gray-700">Top Performers</p>
          </div>
        )}
        {loading ? (
          <div className="flex gap-2">
            {[0, 1, 2].map(i => (
              <div key={i} className="flex-1 h-20 bg-gray-100 rounded-xl animate-pulse" />
            ))}
          </div>
        ) : leaderboard.length === 0 ? (
          <p className="text-sm text-gray-400 text-center py-4">No sales data yet</p>
        ) : (
          <div className="flex gap-2 overflow-x-auto">
            {leaderboard.slice(0, 3).map((entry, idx) => (
              <div key={idx} className="flex-1">
                <CompactCard entry={entry} rank={idx} />
              </div>
            ))}
          </div>
        )}
      </div>
    );
  }

  // ── Full mode ───────────────────────────────────────────────────────────────
  return (
    <div className="w-full">
      <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
        {showTitle && (
          <div className="flex items-center gap-2">
            <TrendingUp size={18} className="text-blue-600" />
            <h3 className="font-bold text-gray-900">Staff Leaderboard</h3>
          </div>
        )}
        <div className="flex bg-gray-100 rounded-xl p-1 gap-1">
          {PERIODS.map(p => (
            <button
              key={p.value}
              onClick={() => setPeriod(p.value)}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                period === p.value
                  ? 'bg-white text-gray-900 shadow-sm'
                  : 'text-gray-500 hover:text-gray-700'
              }`}
            >
              {p.label}
            </button>
          ))}
        </div>
      </div>

      <div className="space-y-1">
        {loading ? (
          [0, 1, 2, 3, 4].map(i => <SkeletonRow key={i} />)
        ) : leaderboard.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-10 text-gray-400">
            <TrendingUp size={32} className="mb-2 opacity-30" />
            <p className="text-sm font-medium">No sales data for this period</p>
          </div>
        ) : (
          leaderboard.map((entry, idx) => {
            const barWidth = Math.max(4, Math.round((entry.revenue / topRevenue) * 100));
            const isSelf = isCurrentUser(entry);
            return (
              <div
                key={entry._id || idx}
                className={`relative rounded-xl p-3 overflow-hidden transition-all ${
                  isSelf
                    ? 'bg-blue-50 border-2 border-blue-400'
                    : idx < 3
                    ? `border ${MEDAL_STYLES[idx]}`
                    : 'bg-white border border-gray-100'
                }`}
              >
                {/* Revenue bar background */}
                <div
                  className={`absolute inset-y-0 left-0 rounded-xl opacity-20 transition-all duration-700 ${
                    idx === 0 ? 'bg-yellow-400' : idx === 1 ? 'bg-gray-400' : idx === 2 ? 'bg-orange-400' : 'bg-blue-300'
                  }`}
                  style={{ width: `${barWidth}%` }}
                />
                <div className="relative flex items-center gap-3">
                  {/* Medal / rank */}
                  <div className="w-9 h-9 shrink-0 flex items-center justify-center text-xl">
                    {idx < 3 ? MEDALS[idx] : (
                      <span className="text-sm font-black text-gray-400">#{idx + 1}</span>
                    )}
                  </div>

                  {/* Name & avg basket */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <p className={`font-bold text-sm truncate ${isSelf ? 'text-blue-800' : 'text-gray-800'}`}>
                        {entry.name || entry.displayName || 'Staff Member'}
                      </p>
                      {isSelf && (
                        <span className="text-xs bg-blue-600 text-white px-1.5 py-0.5 rounded-full font-semibold shrink-0">You</span>
                      )}
                    </div>
                    <p className="text-xs text-gray-400 mt-0.5">
                      Avg basket: £{Number(entry.avgBasket || 0).toFixed(2)}
                    </p>
                  </div>

                  {/* Revenue & transactions */}
                  <div className="text-right shrink-0">
                    <p className={`font-black text-base ${idx === 0 ? 'text-yellow-700' : 'text-gray-900'}`}>
                      £{Number(entry.revenue || 0).toFixed(2)}
                    </p>
                    <p className="text-xs text-gray-400">
                      {entry.transactions || entry.txnCount || 0} txns
                    </p>
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
