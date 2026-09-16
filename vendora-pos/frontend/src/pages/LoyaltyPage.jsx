import React, { useState, useEffect, useCallback } from 'react';
import { Star, Users, Gift, TrendingUp, Search, RefreshCw, Award } from 'lucide-react';
import api from '../services/api';
import toast from 'react-hot-toast';
import dayjs from 'dayjs';

const TIERS = [
  { name: 'Bronze',   minPoints: 0,    color: 'text-amber-700 bg-amber-50 border-amber-200' },
  { name: 'Silver',   minPoints: 500,  color: 'text-gray-600 bg-gray-50 border-gray-200' },
  { name: 'Gold',     minPoints: 1500, color: 'text-yellow-600 bg-yellow-50 border-yellow-200' },
  { name: 'Platinum', minPoints: 5000, color: 'text-purple-600 bg-purple-50 border-purple-200' },
];

function getTier(points) {
  return [...TIERS].reverse().find(t => points >= t.minPoints) || TIERS[0];
}

function MemberCard({ member, onAdjust }) {
  const tier = getTier(member.loyaltyPoints || 0);
  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4 hover:shadow-md transition">
      <div className="flex items-start justify-between mb-3">
        <div>
          <p className="font-semibold text-gray-900">{member.firstName} {member.lastName}</p>
          <p className="text-xs text-gray-400">{member.customerCode || member._id?.slice(-8)}</p>
        </div>
        <span className={`text-xs font-medium px-2 py-0.5 rounded-full border ${tier.color}`}>{tier.name}</span>
      </div>
      <div className="flex items-end justify-between">
        <div>
          <p className="text-xs text-gray-500">Points Balance</p>
          <p className="text-2xl font-black text-gray-900">{(member.loyaltyPoints || 0).toLocaleString()}</p>
        </div>
        <button onClick={() => onAdjust(member)}
          className="text-xs bg-blue-50 hover:bg-blue-100 text-blue-700 font-medium px-3 py-1.5 rounded-lg transition">
          Adjust Points
        </button>
      </div>
      {member.email && <p className="text-xs text-gray-400 mt-2 truncate">{member.email}</p>}
      {member.phone && <p className="text-xs text-gray-400">{member.phone}</p>}
    </div>
  );
}

function AdjustModal({ member, onClose, onSaved }) {
  const [amount, setAmount] = useState('');
  const [reason, setReason] = useState('');
  const [saving, setSaving] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    if (!amount || !reason) { toast.error('Enter amount and reason'); return; }
    setSaving(true);
    try {
      await api.post(`/customers/${member._id}/loyalty`, {
        points: parseInt(amount),
        reason,
      });
      toast.success(`Points adjusted for ${member.firstName}`);
      onSaved();
    } catch { } finally { setSaving(false); }
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl w-full max-w-sm shadow-xl">
        <div className="flex items-center justify-between p-5 border-b">
          <h2 className="font-bold text-gray-900">Adjust Points — {member.firstName}</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl">×</button>
        </div>
        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          <div>
            <label className="block text-xs font-semibold text-gray-600 mb-1">Points (use negative to deduct)</label>
            <input type="number" value={amount} onChange={e => setAmount(e.target.value)} placeholder="e.g. 100 or -50"
              className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
          </div>
          <div>
            <label className="block text-xs font-semibold text-gray-600 mb-1">Reason</label>
            <input value={reason} onChange={e => setReason(e.target.value)} placeholder="e.g. Goodwill, Correction…"
              className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
          </div>
          <button type="submit" disabled={saving}
            className="w-full bg-blue-600 hover:bg-blue-700 text-white font-semibold py-2.5 rounded-xl transition disabled:opacity-50">
            {saving ? 'Saving…' : 'Apply Adjustment'}
          </button>
        </form>
      </div>
    </div>
  );
}

export default function LoyaltyPage() {
  const [members, setMembers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filterTier, setFilterTier] = useState('all');
  const [adjustMember, setAdjustMember] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await api.get('/customers?hasLoyalty=true&limit=200');
      setMembers(Array.isArray(data) ? data : data?.customers || []);
    } catch {
      toast.error('Failed to load loyalty members');
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  const filtered = members.filter(m => {
    const q = search.toLowerCase();
    const matchSearch = !q ||
      `${m.firstName} ${m.lastName}`.toLowerCase().includes(q) ||
      (m.email || '').toLowerCase().includes(q) ||
      (m.phone || '').includes(q);
    const matchTier = filterTier === 'all' || getTier(m.loyaltyPoints || 0).name === filterTier;
    return matchSearch && matchTier;
  });

  const stats = {
    total: members.length,
    totalPoints: members.reduce((s, m) => s + (m.loyaltyPoints || 0), 0),
    gold: members.filter(m => getTier(m.loyaltyPoints || 0).name === 'Gold').length,
    platinum: members.filter(m => getTier(m.loyaltyPoints || 0).name === 'Platinum').length,
  };

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-black text-gray-900">Loyalty Programme</h1>
          <p className="text-sm text-gray-500 mt-0.5">Member points &amp; tier management</p>
        </div>
        <button onClick={load} className="flex items-center gap-2 text-sm text-gray-500 hover:text-gray-700">
          <RefreshCw className="w-4 h-4" /> Refresh
        </button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <div className="bg-white rounded-2xl p-4 border border-gray-100 shadow-sm text-center">
          <Users className="w-5 h-5 text-blue-500 mx-auto mb-1" />
          <p className="text-2xl font-black text-gray-900">{stats.total}</p>
          <p className="text-xs text-gray-500">Members</p>
        </div>
        <div className="bg-white rounded-2xl p-4 border border-gray-100 shadow-sm text-center">
          <Star className="w-5 h-5 text-yellow-500 mx-auto mb-1" />
          <p className="text-2xl font-black text-gray-900">{(stats.totalPoints / 1000).toFixed(1)}k</p>
          <p className="text-xs text-gray-500">Total Points</p>
        </div>
        <div className="bg-white rounded-2xl p-4 border border-gray-100 shadow-sm text-center">
          <Award className="w-5 h-5 text-yellow-600 mx-auto mb-1" />
          <p className="text-2xl font-black text-gray-900">{stats.gold}</p>
          <p className="text-xs text-gray-500">Gold Members</p>
        </div>
        <div className="bg-white rounded-2xl p-4 border border-gray-100 shadow-sm text-center">
          <Gift className="w-5 h-5 text-purple-500 mx-auto mb-1" />
          <p className="text-2xl font-black text-gray-900">{stats.platinum}</p>
          <p className="text-xs text-gray-500">Platinum Members</p>
        </div>
      </div>

      {/* Tier legend */}
      <div className="flex flex-wrap gap-2">
        {TIERS.map(t => (
          <span key={t.name} className={`text-xs font-medium px-3 py-1 rounded-full border ${t.color}`}>
            {t.name} — {t.minPoints.toLocaleString()}+ pts
          </span>
        ))}
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search name, email, phone…"
            className="w-full pl-9 pr-4 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
        </div>
        <select value={filterTier} onChange={e => setFilterTier(e.target.value)}
          className="border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
          <option value="all">All Tiers</option>
          {TIERS.map(t => <option key={t.name} value={t.name}>{t.name}</option>)}
        </select>
      </div>

      {/* Members grid */}
      {loading ? (
        <div className="flex justify-center py-16">
          <div className="animate-spin rounded-full h-8 w-8 border-4 border-blue-500 border-t-transparent" />
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-16 text-gray-400">
          <Star className="w-12 h-12 mx-auto mb-3 opacity-30" />
          <p className="font-medium">No loyalty members found</p>
          <p className="text-sm mt-1">Members earn points automatically at the POS</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {filtered.map(m => (
            <MemberCard key={m._id} member={m} onAdjust={setAdjustMember} />
          ))}
        </div>
      )}

      {adjustMember && (
        <AdjustModal member={adjustMember} onClose={() => setAdjustMember(null)}
          onSaved={() => { setAdjustMember(null); load(); }} />
      )}
    </div>
  );
}
