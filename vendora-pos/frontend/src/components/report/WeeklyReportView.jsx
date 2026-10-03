import React, { useMemo } from 'react';
import toast from 'react-hot-toast';
import { ArrowLeft, Download, PackageCheck, ClipboardCheck, Trash2, Receipt, Coins, TrendingUp } from 'lucide-react';
import { useInventory } from '../../lib/inventoryStore';
import { useDeliveries } from '../../lib/deliveryStore';
import { useClaims } from '../../lib/claimStore';
import { useInvoices } from '../../lib/invoiceStore';
import { readJSON } from '../../lib/storage';
import { weeklyReport, reportToText } from '../../lib/report';

// Weekly owner report (Phase 3). Readable + downloadable. Separates pending claims from recovered money,
// states the period + freshness, and makes no compliance guarantee.
const gbp = (v) => `£${(Number(v) || 0).toFixed(2)}`;
const d = (ts) => (ts ? new Date(ts).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : '—');

export default function WeeklyReportView({ onBack }) {
  const { products } = useInventory();
  const { deliveries } = useDeliveries();
  const { claims } = useClaims();
  const { invoices } = useInvoices();

  const rep = useMemo(() => weeklyReport({
    deliveries,
    stocktakeHistory: readJSON('stocktake_history_v1', []),
    movements: readJSON('movements_v1', []),
    claims, invoices, products, periodDays: 7, now: Date.now(),
  }), [deliveries, claims, invoices, products]);

  function download() {
    try {
      const blob = new Blob([reportToText(rep)], { type: 'text/plain' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url; a.download = `vendora-weekly-${new Date().toISOString().slice(0, 10)}.txt`;
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      toast.success('Report downloaded');
    } catch { toast.error('Couldn’t create the file'); }
  }

  return (
    <div>
      <button type="button" onClick={onBack} className="mb-4 inline-flex items-center gap-1 text-sm font-medium text-primary hover:underline">
        <ArrowLeft className="h-4 w-4" /> Home
      </button>
      <div className="mb-3 flex items-start justify-between gap-2">
        <div>
          <h2 className="text-base font-bold text-gray-900">Weekly report</h2>
          <p className="text-xs text-gray-400">{d(rep.period.from)} – {d(rep.period.to)} · generated {new Date(rep.generatedAt).toLocaleString('en-GB')}</p>
        </div>
        <button type="button" onClick={download} className="flex shrink-0 items-center gap-1 rounded-xl bg-primary px-3 py-2 text-xs font-semibold text-white active:scale-95"><Download className="h-3.5 w-3.5" /> Download</button>
      </div>

      <Section icon={PackageCheck} title="Checking activity">
        <Row label="Deliveries received" value={rep.checking.deliveriesReceived.length} />
        {rep.checking.deliveriesReceived.map((x, i) => <Sub key={i}>{x.supplierName}{x.reference ? ` · ${x.reference}` : ''} — {d(x.at)}{x.by ? ` · ${x.by}` : ''}</Sub>)}
        <Row icon={ClipboardCheck} label="Stock counts" value={rep.checking.stocktakes.length} />
      </Section>

      <Section icon={Trash2} title="Expiry & waste">
        <Row label="Waste recorded" value={`${rep.expiry.wasteUnits} unit(s) · ${gbp(rep.expiry.wasteCost)}`} />
        <Row label="Past use-by right now" value={rep.expiry.pastUseBy} tone={rep.expiry.pastUseBy > 0 ? 'danger' : undefined} />
      </Section>

      <Section icon={Receipt} title="Supplier claims">
        <Row label="Open claims" value={rep.claims.openCount} />
        <Row label="Outstanding (pending — not received)" value={gbp(rep.claims.outstanding)} tone="warn" />
        <Row icon={Coins} label="Credits received (recovered)" value={gbp(rep.claims.creditsReceived)} tone="success" />
      </Section>

      <Section icon={TrendingUp} title="Purchase-price changes">
        {rep.priceChanges.length === 0 ? <Sub>None this period</Sub>
          : rep.priceChanges.map((x, i) => <Sub key={i}>{x.name}: {gbp(x.from)} → {gbp(x.to)} ({x.changePct > 0 ? '+' : ''}{x.changePct}%){x.marginPressure ? ' ⚠ margin pressure' : ''}</Sub>)}
      </Section>

      <p className="mt-4 text-center text-[11px] text-gray-400">Pending amounts are what you’ve asked for, not money received. This is an operational summary, not a guarantee of regulatory compliance.</p>
    </div>
  );
}

function Section({ icon: Icon, title, children }) {
  return (
    <section className="mb-3 rounded-2xl border border-gray-100 bg-white p-3 shadow-sm">
      <h3 className="mb-2 flex items-center gap-1.5 text-xs font-bold uppercase tracking-wide text-gray-400">{Icon && <Icon className="h-3.5 w-3.5" />} {title}</h3>
      {children}
    </section>
  );
}
function Row({ icon: Icon, label, value, tone }) {
  const toneCls = tone === 'danger' ? 'text-danger' : tone === 'warn' ? 'text-warning-dark' : tone === 'success' ? 'text-success' : 'text-gray-900';
  return (
    <div className="flex items-center justify-between py-0.5 text-sm">
      <span className="flex items-center gap-1.5 text-gray-600">{Icon && <Icon className="h-3.5 w-3.5 text-gray-400" />}{label}</span>
      <span className={`font-bold tabular-nums ${toneCls}`}>{value}</span>
    </div>
  );
}
function Sub({ children }) { return <div className="ml-1 py-0.5 text-[11px] text-gray-500">• {children}</div>; }
