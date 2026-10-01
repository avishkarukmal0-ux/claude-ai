import React, { useState } from 'react';
import { Download, Share, Plus, X } from 'lucide-react';
import { useInstallState, promptInstall, dismissInstall } from '../../lib/install';

/**
 * Contextual "Add Vendora to your home screen" card (Phase 2.6d). Shows a real Install button where the
 * browser supports it (Android/desktop Chrome), or step-by-step Add-to-Home-Screen instructions on iOS
 * Safari (which has no install event). Hidden once installed/standalone or dismissed. Never nags twice.
 */
export default function InstallCard() {
  const { canInstall, standalone, ios, dismissed } = useInstallState();
  const [hidden, setHidden] = useState(false);
  if (standalone || dismissed || hidden) return null;
  if (!canInstall && !ios) return null; // nothing actionable on this browser

  const close = () => { dismissInstall(); setHidden(true); };

  return (
    <div className="relative rounded-2xl border border-primary/20 bg-primary-50/50 p-4">
      <button type="button" onClick={close} className="absolute right-2 top-2 text-gray-400 hover:text-gray-600" aria-label="Dismiss install prompt">
        <X className="h-4 w-4" />
      </button>
      <div className="flex items-start gap-3">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-primary text-white"><Download className="h-5 w-5" /></span>
        <div className="min-w-0">
          <p className="text-sm font-semibold text-gray-900">Add Vendora to your home screen</p>
          {canInstall ? (
            <>
              <p className="mt-0.5 text-[11px] text-gray-500">Opens like an app and works offline on the shop floor.</p>
              <button
                type="button"
                onClick={async () => { const r = await promptInstall(); if (r.ok) setHidden(true); }}
                className="mt-2 inline-flex items-center gap-1.5 rounded-xl bg-primary px-3 py-2 text-xs font-semibold text-white active:scale-95"
              >
                <Download className="h-3.5 w-3.5" /> Install
              </button>
            </>
          ) : (
            <p className="mt-1 text-[11px] leading-relaxed text-gray-600">
              In Safari, tap <Share className="inline h-3.5 w-3.5 align-text-bottom" /> <span className="font-semibold">Share</span>,
              then <Plus className="inline h-3.5 w-3.5 align-text-bottom" /> <span className="font-semibold">Add to Home Screen</span>.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
