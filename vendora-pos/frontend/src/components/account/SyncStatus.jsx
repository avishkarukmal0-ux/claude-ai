import React from 'react';
import { RefreshCw, Check, CloudOff, AlertCircle } from 'lucide-react';
import { useSyncStatus, syncNow } from '../../lib/sync';
import { isLoggedIn } from '../../lib/account';

// Compact cross-device sync indicator (infra Stage 3). Shows only when a shop is signed in. Tapping it
// forces a sync. Copy is honest: when offline, it makes clear nothing is lost — the device keeps the data.
function relativeTime(ts) {
  if (!ts) return '';
  const secs = Math.round((Date.now() - ts) / 1000);
  if (secs < 10) return 'just now';
  if (secs < 60) return `${secs}s ago`;
  const mins = Math.round(secs / 60);
  if (mins < 60) return `${mins} min ago`;
  const hrs = Math.round(mins / 60);
  return `${hrs}h ago`;
}

export default function SyncStatus() {
  const s = useSyncStatus();
  if (!isLoggedIn()) return null;

  let icon = Check;
  let text = 'Synced';
  let tone = 'text-success-dark';
  if (s.status === 'syncing') { icon = RefreshCw; text = 'Syncing…'; tone = 'text-primary'; }
  else if (s.status === 'offline') { icon = CloudOff; text = 'Offline — saved on this device'; tone = 'text-gray-500'; }
  else if (s.status === 'error') { icon = AlertCircle; text = 'Sync paused — will retry'; tone = 'text-danger'; }
  else if (s.status === 'synced') { text = `Synced · ${relativeTime(s.lastSyncedAt)}`; }
  else { text = s.pending > 0 ? `${s.pending} change${s.pending === 1 ? '' : 's'} to sync` : 'Up to date'; }

  const Icon = icon;
  return (
    <button
      type="button"
      onClick={() => syncNow()}
      className="flex w-full items-center gap-2 px-3 py-2 text-left text-xs font-medium"
      aria-label="Cross-device sync status — tap to sync now"
    >
      <Icon className={`h-3.5 w-3.5 ${tone} ${s.status === 'syncing' ? 'animate-spin' : ''}`} />
      <span className={tone}>{text}</span>
      {s.pending > 0 && s.status !== 'syncing' && (
        <span className="ml-auto rounded-full bg-primary-50 px-2 py-0.5 text-[10px] text-primary">{s.pending} pending</span>
      )}
    </button>
  );
}
