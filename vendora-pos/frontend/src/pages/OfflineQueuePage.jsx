import React, { useState, useEffect, useCallback } from 'react';
import { Wifi, WifiOff, Clock, CheckCircle, AlertCircle, RefreshCw, Upload, Trash2 } from 'lucide-react';
import { useOffline } from '../context/OfflineContext';
import api from '../services/api';
import toast from 'react-hot-toast';
import dayjs from 'dayjs';
import relativeTime from 'dayjs/plugin/relativeTime';
dayjs.extend(relativeTime);

const QUEUE_KEY = 'vendora_offline_queue';

function getQueue() {
  try { return JSON.parse(localStorage.getItem(QUEUE_KEY) || '[]'); } catch { return []; }
}
function saveQueue(q) {
  localStorage.setItem(QUEUE_KEY, JSON.stringify(q));
}

export default function OfflineQueuePage() {
  const { isOnline } = useOffline();
  const [queue, setQueue] = useState([]);
  const [syncing, setSyncing] = useState(false);
  const [syncResults, setSyncResults] = useState([]);

  const refresh = useCallback(() => {
    setQueue(getQueue());
  }, []);

  useEffect(() => {
    refresh();
    const interval = setInterval(refresh, 5000);
    return () => clearInterval(interval);
  }, [refresh]);

  const handleSyncAll = async () => {
    if (!isOnline) { toast.error('No internet connection'); return; }
    const pending = queue.filter(t => t.status === 'pending');
    if (pending.length === 0) { toast('No pending transactions to sync'); return; }
    setSyncing(true);
    const results = [];

    for (const tx of pending) {
      try {
        await api.post('/sales', tx.payload);
        results.push({ id: tx.id, success: true });
        const current = getQueue();
        saveQueue(current.map(t => t.id === tx.id ? { ...t, status: 'synced', syncedAt: new Date().toISOString() } : t));
      } catch (err) {
        results.push({ id: tx.id, success: false, error: err.message });
        const current = getQueue();
        saveQueue(current.map(t => t.id === tx.id ? { ...t, status: 'failed', error: err.message } : t));
      }
    }

    setSyncResults(results);
    refresh();
    setSyncing(false);
    const succeeded = results.filter(r => r.success).length;
    const failed = results.filter(r => !r.success).length;
    if (failed === 0) toast.success(`All ${succeeded} transactions synced`);
    else toast.error(`${succeeded} synced, ${failed} failed`);
  };

  const handleDelete = (id) => {
    const current = getQueue();
    saveQueue(current.filter(t => t.id !== id));
    refresh();
    toast.success('Transaction removed from queue');
  };

  const handleClearSynced = () => {
    const current = getQueue();
    saveQueue(current.filter(t => t.status !== 'synced'));
    refresh();
    toast.success('Cleared synced transactions');
  };

  const stats = {
    total: queue.length,
    pending: queue.filter(t => t.status === 'pending').length,
    synced: queue.filter(t => t.status === 'synced').length,
    failed: queue.filter(t => t.status === 'failed').length,
  };

  const STATUS_STYLES = {
    pending: { bg: 'bg-yellow-50 border-yellow-200 text-yellow-700', icon: <Clock className="w-3.5 h-3.5" /> },
    synced:  { bg: 'bg-green-50 border-green-200 text-green-700',  icon: <CheckCircle className="w-3.5 h-3.5" /> },
    failed:  { bg: 'bg-red-50 border-red-200 text-red-700',        icon: <AlertCircle className="w-3.5 h-3.5" /> },
  };

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-black text-gray-900">Offline Queue</h1>
          <p className="text-sm text-gray-500 mt-0.5">Transactions captured while offline</p>
        </div>
        <div className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-sm font-medium ${
          isOnline ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'}`}>
          {isOnline ? <Wifi className="w-4 h-4" /> : <WifiOff className="w-4 h-4" />}
          {isOnline ? 'Online' : 'Offline'}
        </div>
      </div>

      {/* Status banner */}
      {!isOnline && (
        <div className="bg-red-50 border border-red-200 rounded-2xl p-4 flex items-start gap-3">
          <WifiOff className="w-5 h-5 text-red-500 mt-0.5 flex-shrink-0" />
          <div>
            <p className="font-semibold text-red-800">You are offline</p>
            <p className="text-sm text-red-600 mt-0.5">Sales are being queued locally and will sync when connectivity is restored.</p>
          </div>
        </div>
      )}
      {isOnline && stats.pending > 0 && (
        <div className="bg-yellow-50 border border-yellow-200 rounded-2xl p-4 flex items-start gap-3">
          <Clock className="w-5 h-5 text-yellow-500 mt-0.5 flex-shrink-0" />
          <div className="flex-1">
            <p className="font-semibold text-yellow-800">{stats.pending} pending transaction{stats.pending !== 1 ? 's' : ''} waiting to sync</p>
            <p className="text-sm text-yellow-600 mt-0.5">Connection restored — click Sync All to upload.</p>
          </div>
          <button onClick={handleSyncAll} disabled={syncing}
            className="flex items-center gap-2 bg-yellow-600 hover:bg-yellow-700 text-white text-sm font-semibold px-4 py-2 rounded-xl transition disabled:opacity-50">
            <Upload className="w-4 h-4" />
            {syncing ? 'Syncing…' : 'Sync All'}
          </button>
        </div>
      )}
      {isOnline && stats.pending === 0 && stats.failed === 0 && (
        <div className="bg-green-50 border border-green-200 rounded-2xl p-4 flex items-center gap-3">
          <CheckCircle className="w-5 h-5 text-green-500" />
          <p className="font-semibold text-green-800">All transactions are synced</p>
        </div>
      )}

      {/* Summary cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <div className="bg-white rounded-2xl p-4 border border-gray-100 shadow-sm text-center">
          <p className="text-3xl font-black text-gray-900">{stats.total}</p>
          <p className="text-xs text-gray-500">Total Queued</p>
        </div>
        <div className="bg-white rounded-2xl p-4 border border-yellow-100 shadow-sm text-center">
          <p className="text-3xl font-black text-yellow-600">{stats.pending}</p>
          <p className="text-xs text-gray-500">Pending</p>
        </div>
        <div className="bg-white rounded-2xl p-4 border border-green-100 shadow-sm text-center">
          <p className="text-3xl font-black text-green-600">{stats.synced}</p>
          <p className="text-xs text-gray-500">Synced</p>
        </div>
        <div className="bg-white rounded-2xl p-4 border border-red-100 shadow-sm text-center">
          <p className="text-3xl font-black text-red-600">{stats.failed}</p>
          <p className="text-xs text-gray-500">Failed</p>
        </div>
      </div>

      {/* Queue list */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-gray-100">
          <p className="font-semibold text-gray-900 text-sm">Transaction Queue</p>
          <div className="flex gap-2">
            <button onClick={refresh} className="text-xs text-gray-500 hover:text-gray-700 flex items-center gap-1">
              <RefreshCw className="w-3 h-3" /> Refresh
            </button>
            {stats.synced > 0 && (
              <button onClick={handleClearSynced} className="text-xs text-gray-500 hover:text-red-600 flex items-center gap-1">
                <Trash2 className="w-3 h-3" /> Clear synced
              </button>
            )}
          </div>
        </div>

        {queue.length === 0 ? (
          <div className="text-center py-16 text-gray-400">
            <CheckCircle className="w-12 h-12 mx-auto mb-3 opacity-30" />
            <p className="font-medium">Queue is empty</p>
            <p className="text-sm mt-1">Offline transactions will appear here automatically</p>
          </div>
        ) : (
          <div className="divide-y divide-gray-50">
            {queue.map(tx => {
              const style = STATUS_STYLES[tx.status] || STATUS_STYLES.pending;
              return (
                <div key={tx.id} className="flex items-center gap-4 px-5 py-3.5">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-semibold text-gray-900 font-mono">{tx.id?.slice(-8).toUpperCase()}</p>
                      <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium border ${style.bg}`}>
                        {style.icon} {tx.status}
                      </span>
                    </div>
                    <div className="flex items-center gap-3 mt-0.5">
                      <p className="text-xs text-gray-400">{dayjs(tx.createdAt).fromNow()}</p>
                      {tx.payload?.totalAmount && (
                        <p className="text-xs font-medium text-gray-600">£{tx.payload.totalAmount.toFixed(2)}</p>
                      )}
                      {tx.payload?.items?.length && (
                        <p className="text-xs text-gray-400">{tx.payload.items.length} item{tx.payload.items.length !== 1 ? 's' : ''}</p>
                      )}
                    </div>
                    {tx.error && <p className="text-xs text-red-500 mt-0.5">{tx.error}</p>}
                    {tx.syncedAt && <p className="text-xs text-green-600 mt-0.5">Synced {dayjs(tx.syncedAt).fromNow()}</p>}
                  </div>
                  {tx.status === 'failed' && (
                    <button onClick={() => handleDelete(tx.id)}
                      className="text-red-400 hover:text-red-600 p-1.5 rounded-lg hover:bg-red-50 transition">
                      <Trash2 className="w-4 h-4" />
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* How offline mode works */}
      <div className="bg-gray-50 rounded-2xl p-4 border border-gray-200">
        <p className="text-sm font-semibold text-gray-700 mb-2">How offline mode works</p>
        <ul className="text-xs text-gray-500 space-y-1 list-disc list-inside">
          <li>When internet is lost, sales are saved to local browser storage</li>
          <li>The POS continues operating normally — customers see no disruption</li>
          <li>When connectivity returns, transactions sync automatically in the background</li>
          <li>Synced transactions appear in Reports and Transaction History once uploaded</li>
          <li>Failed transactions can be reviewed and re-submitted manually</li>
        </ul>
      </div>
    </div>
  );
}
