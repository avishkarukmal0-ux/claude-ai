import React from 'react';
import { Check, AlertTriangle } from 'lucide-react';
import { useSaveStatus } from '../../lib/saveStatus';
import { ACCOUNTS_ENABLED, isLoggedIn } from '../../lib/account';
import SyncStatus from './SyncStatus';

/**
 * The honest "is my work safe?" strip (Phase 1.1). ALWAYS shows the device-save state — "Saved on this
 * phone", or a persistent "couldn't save" when the device rejected a write — so even the accounts-off
 * pilot gets a clear status (it previously showed nothing). When a shop is signed in, the cross-device
 * sync line sits beneath it, and a one-liner makes clear that sync is not the same as a recoverable backup.
 */
export default function SaveSyncStatus() {
  const save = useSaveStatus();
  const signedIn = ACCOUNTS_ENABLED && isLoggedIn();
  const failed = (save.failed || []).length > 0;

  return (
    <div>
      <div className="flex w-full items-center gap-2 px-3 py-2 text-xs font-medium">
        {failed ? (
          <>
            <AlertTriangle className="h-3.5 w-3.5 shrink-0 text-danger" />
            <span className="text-danger">Couldn’t save on this device — free some space or export a backup, then retry</span>
          </>
        ) : (
          <>
            <Check className="h-3.5 w-3.5 shrink-0 text-success-dark" />
            <span className="text-success-dark">Saved on this phone</span>
          </>
        )}
      </div>

      {signedIn ? (
        <>
          <SyncStatus />
          <p className="px-3 pb-1 text-[11px] text-gray-400">Cross-device sync keeps your other devices up to date. For a restore point, use Export backup below.</p>
        </>
      ) : (
        <p className="px-3 pb-1 text-[11px] text-gray-400">Your data lives on this device. Use Export backup below to keep a copy you can restore.</p>
      )}
    </div>
  );
}
