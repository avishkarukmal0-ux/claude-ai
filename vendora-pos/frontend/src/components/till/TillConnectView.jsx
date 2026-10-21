import React, { useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import {
  Plug, FileSpreadsheet, Upload, Clock, ShieldCheck, Ban, ChevronRight, Info, RefreshCw, ExternalLink,
  CheckCircle2, AlertTriangle, PauseCircle,
} from 'lucide-react';
import ScreenBack from '../common/ScreenBack';
import { getProviders, getConnections, startConnect, describeConnection } from '../../lib/posClient';

// "Connect your till" (sales-import slice 2). Shows the HONEST provider catalogue from the server and routes the
// shopkeeper to the ONE path that actually works today: the manual item-level CSV pilot (SalesImportView). It
// NEVER shows a provider as "Connected" — no cloud connection exists yet — and it never touches stock. Direct
// cloud connections are shown truthfully as in-testing / needs-approval / not-built, and are not tappable.

// How each provider's DIRECT (cloud) connection reads today. CSV is handled separately — it's the live method.
// Honest wording (audit P2): every adapter's live operations still throw, so "in testing" would overstate
// real progress. We say "planned — not built yet" for a provider we could build against, and keep the
// approval / unsupported states explicit.
const CLOUD_STATUS = {
  ready_for_testing: { label: 'Direct link: planned — not built yet', tone: 'gray', Icon: Clock },
  approval_required: { label: 'Direct link: needs partner approval', tone: 'gray', Icon: ShieldCheck },
  not_configured: { label: 'Direct link: not built yet', tone: 'gray', Icon: Clock },
  unsupported_setup: { label: "Direct link: can't read item-level sales", tone: 'gray', Icon: Ban },
};
const TONE = {
  amber: 'bg-amber-50 text-amber-800 border-amber-100',
  gray: 'bg-gray-50 text-gray-500 border-gray-100',
  green: 'bg-emerald-50 text-emerald-700 border-emerald-100',
};

function Badge({ tone = 'gray', Icon, children }) {
  return (
    <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-medium ${TONE[tone] || TONE.gray}`}>
      {Icon && <Icon className="h-3 w-3 shrink-0" />}
      <span>{children}</span>
    </span>
  );
}

const CONN_ICON = { connected: CheckCircle2, needs_attention: AlertTriangle, paused: PauseCircle };

function ProviderCard({ p, onOpenCsv, connection, onReconnect, reconnecting }) {
  const cloud = CLOUD_STATUS[p.availability] || CLOUD_STATUS.not_configured;
  // A real connection (if one ever exists) overrides the availability badge with the shop's actual status.
  const conn = connection ? describeConnection(connection.status) : null;
  return (
    <div className="rounded-2xl border border-gray-100 bg-white p-4 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="text-sm font-semibold text-gray-900">{p.name}</div>
          {p.product && <div className="truncate text-xs text-gray-400">{p.product}</div>}
        </div>
      </div>
      <div className="mt-3 flex flex-wrap gap-1.5">
        {p.csvCapable
          ? <Badge tone="green" Icon={FileSpreadsheet}>Item-level CSV — check your export</Badge>
          : <Badge tone="gray" Icon={Ban}>CSV not usable (payment-level only)</Badge>}
        {conn
          ? <Badge tone={conn.tone} Icon={CONN_ICON[connection.status]}>{conn.label}</Badge>
          : <Badge tone={cloud.tone} Icon={cloud.Icon}>{cloud.label}</Badge>}
      </div>
      {connection && connection.status === 'needs_attention' && (
        <button
          type="button"
          onClick={() => onReconnect(p.id)}
          disabled={reconnecting}
          className="mt-3 flex min-h-[44px] w-full items-center justify-center gap-2 rounded-xl border border-amber-300 bg-amber-50 px-3 text-sm font-semibold text-amber-900 active:scale-[0.99] disabled:opacity-50"
        >
          <RefreshCw className={`h-4 w-4 ${reconnecting ? 'animate-spin' : ''}`} /> Reconnect {p.name}
        </button>
      )}
      {p.csvCapable ? (
        <button
          type="button"
          onClick={onOpenCsv}
          className="mt-3 flex min-h-[44px] w-full items-center justify-center gap-2 rounded-xl bg-primary px-3 text-sm font-semibold text-white active:scale-[0.99] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2"
        >
          <Upload className="h-4 w-4" /> Import a sales CSV
        </button>
      ) : (
        <p className="mt-3 text-xs text-gray-500">
          This till reports card payments, not the items sold, so a CSV can’t update your product sales.
        </p>
      )}
      {p.docsUrl && (
        <a
          href={p.docsUrl} target="_blank" rel="noopener noreferrer"
          className="mt-2 inline-flex min-h-[44px] items-center gap-1 text-xs font-medium text-primary hover:underline"
        >
          Provider API docs <ExternalLink className="h-3 w-3" />
        </a>
      )}
    </div>
  );
}

export default function TillConnectView({ onBack, onOpenCsv }) {
  const [state, setState] = useState({ loading: true });
  const [conns, setConns] = useState({ cloudEnabled: false, connections: [] });
  const [reconnecting, setReconnecting] = useState(null); // providerId currently reconnecting

  async function load() {
    setState({ loading: true });
    // Catalogue + this shop's real connections in parallel. Connections are empty until the cloud feature is
    // switched on and a provider is actually connected — we show the truth, never a placeholder "Connected".
    const [providersRes, connRes] = await Promise.all([getProviders(), getConnections()]);
    setState({ loading: false, ...providersRes });
    setConns({ cloudEnabled: !!connRes.cloudEnabled, connections: connRes.connections || [] });
  }
  useEffect(() => { load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, []);

  async function onReconnect(providerId) {
    setReconnecting(providerId);
    const res = await startConnect(providerId);
    setReconnecting(null);
    // Today this is always the honest "not available yet"; surface the server's own message.
    if (res.ok) { toast.success('Reconnecting…'); load(); }
    else toast.error(res.error || 'That till can’t be connected yet.');
  }

  const providers = state.providers || [];
  const connByProvider = Object.fromEntries((conns.connections || []).map((c) => [c.provider, c]));

  return (
    <div>
      <ScreenBack onBack={onBack} label="Home" />

      <div className="rounded-2xl border border-gray-100 bg-white p-4 shadow-sm">
        <div className="flex items-center gap-2">
          <Plug className="h-5 w-5 text-primary" />
          <h2 className="text-base font-semibold text-gray-900">Connect your till</h2>
        </div>
        <p className="mt-2 text-sm text-gray-600">
          Turn your till’s sales into confirmed figures in Vendora. Today the one way that works is uploading a
          sales export (CSV) from your till — it records what sold as evidence and <strong>never changes your
          stock numbers on its own</strong>.
        </p>
        <p className="mt-2 flex items-start gap-1.5 text-xs text-gray-500">
          <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          Direct “always-on” connections to the tills below are still being built and tested. We’ll switch each
          on only once it’s proven — nothing here connects to your till account yet.
        </p>
        <button
          type="button"
          onClick={onOpenCsv}
          className="mt-3 flex min-h-[44px] w-full items-center justify-center gap-2 rounded-xl bg-primary px-3 text-sm font-semibold text-white active:scale-[0.99] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2"
        >
          <FileSpreadsheet className="h-4 w-4" /> Import a sales CSV
          <ChevronRight className="h-4 w-4" />
        </button>
      </div>

      <h3 className="mb-2 mt-5 text-xs font-semibold uppercase tracking-wide text-gray-400">Tills we’re working on</h3>

      {state.loading && (
        <div className="rounded-2xl border border-gray-100 bg-white p-4 text-sm text-gray-500 shadow-sm">Loading…</div>
      )}

      {!state.loading && state.ok === false && (
        <div className="rounded-2xl border border-gray-100 bg-white p-4 shadow-sm">
          <p className="text-sm text-gray-600">
            {state.needsLogin
              ? 'Sign in to your Vendora account to see the full list of tills. You can still import a CSV above.'
              : 'Couldn’t load the till list just now. You can still import a CSV above.'}
          </p>
          <button
            type="button" onClick={load}
            className="mt-3 inline-flex min-h-[44px] items-center gap-2 rounded-xl border border-gray-200 px-3 text-sm font-medium text-gray-700 active:scale-[0.99]"
          >
            <RefreshCw className="h-4 w-4" /> Try again
          </button>
        </div>
      )}

      {!state.loading && state.ok && (
        <div className="space-y-2">
          {providers.map((p) => (
            <ProviderCard
              key={p.id}
              p={p}
              onOpenCsv={onOpenCsv}
              connection={connByProvider[p.id]}
              onReconnect={onReconnect}
              reconnecting={reconnecting === p.id}
            />
          ))}
          {state.docsCheckedAt && (
            <p className="px-1 pt-1 text-[11px] text-gray-400">
              Provider details checked {new Date(state.docsCheckedAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}.
            </p>
          )}
        </div>
      )}
    </div>
  );
}
