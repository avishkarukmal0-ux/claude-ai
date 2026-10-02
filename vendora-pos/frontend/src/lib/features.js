// Feature flags for major new workflows (acceptance Phase 3). Follows the existing env-flag pattern
// (see ACCOUNTS_ENABLED in account.js and the server-side config.* gates): a Vite build-time env var,
// read defensively, with a safe default.
//
// Each flag is DEFAULT-ON so enabling the build changes nothing; set the env var to "false" to disable a
// workflow. Disabling only hides the UI — the underlying local data is retained and reappears when the flag
// is turned back on (no migration, no data loss). See obsidian-vault/Deployment-Config.md.
function flag(name, dflt = true) {
  try {
    const v = import.meta.env[name];
    if (v === undefined || v === null || v === '') return dflt;
    return String(v) !== 'false';
  } catch { return dflt; }
}

// The supplier-invoice reconciliation + credit workflow (capture → reconcile → claim → credit note →
// price history). Gate for the whole workflow's entry points.
export const INVOICES_ENABLED = flag('VITE_INVOICES_ENABLED', true);

// Neighbourhood Insights — optional PAID add-on. DEFAULT-OFF (opt-in): the tile/screen only appear when
// VITE_INSIGHTS_ENABLED=true AND the backend INSIGHTS_ENABLED is on. The core PWA is fully usable without it.
export const INSIGHTS_ENABLED = flag('VITE_INSIGHTS_ENABLED', false);
