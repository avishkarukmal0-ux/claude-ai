import React, { useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import { ArrowLeft, CloudCog, RotateCcw, Loader2, RefreshCw } from 'lucide-react';
import { getCloudHistory, restoreCloudVersion } from '../../lib/cloudBackup';
import { syncNow } from '../../lib/sync';

const STORE_LABEL = {
  inventory_v1: 'Stock', suppliers_v1: 'Suppliers', buylist_v1: 'Buy list', waste_v1: 'Waste',
  takings_v1: 'Takings', movements_v1: 'Stock movements', stocktake_v1: 'Stock count',
  deliveries_v1: 'Deliveries', orders_v1: 'Orders', claims_v1: 'Claims', tasks_v1: 'Tasks',
  requests_v1: 'Customer requests', invoices_v1: 'Invoices', credit_notes_v1: 'Credit notes',
  price_alerts_v1: 'Price changes', shop_type: 'Shop type', suggestions_v1: 'Team suggestions',
  handovers_v1: 'Handovers', sales_imports_v1: 'Till imports', stocktake_history_v1: 'Count history',
};
const label = (n) => STORE_LABEL[n] || n.replace(/_v1$/, '');
const when = (ts) => { try { return new Date(ts).toLocaleString('en-GB', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }); } catch { return ''; } };

/**
 * Cloud version history + restore (Phase 1.3b). Lists the recent server-kept revisions of each store and
 * lets the owner/manager roll one back after a bad change — recovering from an overwrite that cross-device
 * sync would otherwise have made permanent. Real data from /api/pwa-sync/history; needs the backend's
 * SYNC_HISTORY switched on (otherwise it says so honestly rather than pretending).
 */
export default function CloudBackups({ onBack }) {
  const [state, setState] = useState({ loading: true, enabled: false, history: {}, error: null });
  const [restoring, setRestoring] = useState(null); // `${name}:${rev}` in progress

  async function load() {
    setState((s) => ({ ...s, loading: true, error: null }));
    try {
      const res = await getCloudHistory();
      setState({ loading: false, enabled: !!res.enabled, history: res.history || {}, error: null });
    } catch (e) {
      setState({ loading: false, enabled: false, history: {}, error: e?.message || 'Couldn’t load cloud history' });
    }
  }
  useEffect(() => { load(); }, []);

  async function restore(name, rev) {
    if (!window.confirm(`Restore ${label(name)} to version ${rev}?\n\nThis replaces the current ${label(name)} on every device. The current version stays in history, so you can undo.`)) return;
    setRestoring(`${name}:${rev}`);
    try {
      await restoreCloudVersion(name, rev);
      await syncNow().catch(() => {});       // pull the restored value down to this device
      toast.success(`${label(name)} restored`);
      await load();
    } catch (e) {
      toast.error(e?.message || 'Restore failed');
    } finally {
      setRestoring(null);
    }
  }

  const stores = Object.keys(state.history).sort((a, b) => label(a).localeCompare(label(b)));

  return (
    <div>
      {onBack && (
        <button type="button" onClick={onBack} className="mb-4 inline-flex items-center gap-1 text-sm font-medium text-primary hover:underline">
          <ArrowLeft className="h-4 w-4" /> Back
        </button>
      )}
      <div className="mb-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="flex h-10 w-10 items-center justify-center rounded-2xl bg-primary-50 text-primary"><CloudCog className="h-5 w-5" /></span>
          <div>
            <h2 className="text-base font-bold text-gray-900">Cloud version history</h2>
            <p className="text-xs text-gray-400">Roll a store back to an earlier saved version</p>
          </div>
        </div>
        <button type="button" onClick={load} className="flex h-9 w-9 items-center justify-center rounded-xl border border-gray-200 bg-white text-gray-500" aria-label="Refresh">
          <RefreshCw className="h-4 w-4" />
        </button>
      </div>

      {state.loading ? (
        <div className="flex justify-center py-10"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>
      ) : state.error ? (
        <p className="rounded-2xl border border-danger/20 bg-danger/5 p-4 text-sm text-danger">{state.error}</p>
      ) : !state.enabled ? (
        <p className="rounded-2xl border border-gray-100 bg-white p-6 text-center text-sm text-gray-500 shadow-sm">
          Server version history isn’t switched on for your shop. Your data still syncs across devices and you
          can Export a local backup any time. (An operator can enable it — see the deployment guide.)
        </p>
      ) : stores.length === 0 ? (
        <p className="rounded-2xl border border-gray-100 bg-white p-6 text-center text-sm text-gray-500 shadow-sm">
          No saved versions yet. As you make changes, recent versions are kept here so you can roll back.
        </p>
      ) : (
        <div className="space-y-4">
          {stores.map((name) => (
            <div key={name}>
              <h3 className="mb-1.5 px-1 text-[11px] font-bold uppercase tracking-wide text-gray-400">{label(name)}</h3>
              <ul className="space-y-2">
                {state.history[name].map((h) => (
                  <li key={h.rev} className="flex items-center gap-3 rounded-2xl border border-gray-100 bg-white p-3 shadow-sm">
                    <div className="min-w-0 flex-1">
                      <div className="text-sm font-semibold text-gray-900">
                        {when(h.mtime || h.at)}{h.kind === 'restore' ? ' · restored' : ''}
                      </div>
                      <div className="text-[11px] text-gray-400">version {h.rev} · {Math.max(1, Math.round((h.size || 0) / 1024))} KB</div>
                    </div>
                    <button
                      type="button"
                      onClick={() => restore(name, h.rev)}
                      disabled={!!restoring}
                      className="flex shrink-0 items-center gap-1.5 rounded-xl border border-gray-200 bg-white px-3 py-2 text-xs font-semibold text-gray-700 active:scale-95 disabled:opacity-50"
                    >
                      {restoring === `${name}:${h.rev}` ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RotateCcw className="h-3.5 w-3.5" />} Restore
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
