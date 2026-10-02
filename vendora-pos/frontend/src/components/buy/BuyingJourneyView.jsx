import React, { useMemo } from 'react';
import {
  ArrowLeft, Route, Building2, Check, Circle, AlertTriangle, ChevronRight, CheckCircle2,
} from 'lucide-react';
import { useOrders } from '../../lib/orderStore';
import { useDeliveries } from '../../lib/deliveryStore';
import { useInvoices } from '../../lib/invoiceStore';
import { useClaims } from '../../lib/claimStore';
import { buildJourneys } from '../../lib/buyingJourney';

const STAGE_LABEL = { order: 'Order', delivery: 'Delivery', invoice: 'Invoice', resolve: 'Resolve', claim: 'Claim', credit: 'Credit' };

// One compact stage pip in the stepper.
function Pip({ s }) {
  const map = {
    done: { cls: 'bg-success text-white', icon: Check },
    current: { cls: 'bg-primary text-white ring-2 ring-primary/30', icon: Circle },
    attention: { cls: 'bg-danger text-white', icon: AlertTriangle },
    optional: { cls: 'bg-gray-100 text-gray-400', icon: Circle },
    pending: { cls: 'bg-gray-100 text-gray-300', icon: Circle },
    skipped: { cls: 'bg-gray-50 text-gray-300', icon: Circle },
  };
  const m = map[s.status] || map.pending;
  const Icon = m.icon;
  return (
    <div className="flex min-w-[52px] flex-col items-center gap-1">
      <span className={`flex h-6 w-6 items-center justify-center rounded-full ${m.cls}`}>
        <Icon className="h-3.5 w-3.5" strokeWidth={2.5} />
      </span>
      <span className={`text-[9px] font-semibold ${s.status === 'current' || s.status === 'attention' ? 'text-gray-900' : 'text-gray-400'}`}>{STAGE_LABEL[s.key]}</span>
    </div>
  );
}

function JourneyCard({ j, onGo }) {
  const refs = [j.refs.orderRef && `Order: ${j.refs.orderRef}`, j.refs.deliveryRef && `Delivery: ${j.refs.deliveryRef}`, j.refs.invoiceRef && `Invoice: ${j.refs.invoiceRef}`].filter(Boolean);
  return (
    <li className="rounded-2xl border border-gray-100 bg-white p-3 shadow-sm">
      <div className="mb-2 flex items-center gap-2">
        <Building2 className="h-4 w-4 shrink-0 text-gray-400" />
        <span className="min-w-0 flex-1 truncate text-sm font-semibold text-gray-900">{j.supplierName || 'Supplier'}</span>
        {j.complete
          ? <span className="shrink-0 rounded-full bg-success-light px-2 py-0.5 text-[10px] font-semibold text-success-dark">Done</span>
          : j.attention
            ? <span className="shrink-0 rounded-full bg-danger/10 px-2 py-0.5 text-[10px] font-semibold text-danger">Needs attention</span>
            : <span className="shrink-0 rounded-full bg-primary-50 px-2 py-0.5 text-[10px] font-semibold text-primary">In progress</span>}
      </div>

      {/* Stage stepper */}
      <div className="mb-2 flex items-center gap-1 overflow-x-auto pb-1">
        {j.stages.map((s, i) => (
          <React.Fragment key={s.key}>
            {i > 0 && <span className="h-px w-3 shrink-0 bg-gray-200" />}
            <Pip s={s} />
          </React.Fragment>
        ))}
      </div>

      {refs.length > 0 && <p className="mb-2 truncate text-[11px] text-gray-400">{refs.join(' · ')}</p>}

      {j.nextAction ? (
        <button
          type="button"
          onClick={() => onGo(j.nextAction.go)}
          className="flex w-full items-center justify-between gap-2 rounded-xl bg-gray-900 px-3 py-2.5 text-left text-sm font-semibold text-white active:scale-[0.99]"
        >
          <span className="min-w-0">
            <span className="block truncate">{j.nextAction.cta}</span>
            {j.nextAction.detail && <span className="block truncate text-[11px] font-normal text-gray-300">{j.nextAction.detail}</span>}
          </span>
          <ChevronRight className="h-4 w-4 shrink-0" />
        </button>
      ) : (
        <p className="flex items-center gap-1.5 text-[12px] font-medium text-success-dark"><CheckCircle2 className="h-4 w-4" /> Nothing left to do on this one.</p>
      )}
    </li>
  );
}

// Guided buying journey — Order → delivery → invoice → resolve → claim → credit, derived from the stores
// the shop already keeps (lib/buyingJourney). Read-only overview; every CTA opens the EXISTING screen for
// that stage, so the direct shortcuts in the Buy hub still work for experienced users.
export default function BuyingJourneyView({ onBack, onGo }) {
  const { orders } = useOrders();
  const { deliveries } = useDeliveries();
  const { invoices } = useInvoices();
  const { claims } = useClaims();

  const journeys = useMemo(
    () => buildJourneys({ orders, deliveries, invoices, claims, now: Date.now() }),
    [orders, deliveries, invoices, claims],
  );
  const active = journeys.filter((j) => !j.complete);
  const done = journeys.filter((j) => j.complete).slice(0, 8);

  return (
    <div>
      <button type="button" onClick={onBack} className="mb-4 inline-flex items-center gap-1 text-sm font-medium text-primary hover:underline">
        <ArrowLeft className="h-4 w-4" /> Home
      </button>
      <h2 className="mb-1 text-base font-bold text-gray-900">Buying journey</h2>
      <p className="mb-4 text-xs text-gray-400">Follow each purchase from order to credit. Each step opens the normal screen — the shortcuts in Buy still work.</p>

      {journeys.length === 0 ? (
        <div className="mt-6 flex flex-col items-center text-center">
          <span className="mb-3 flex h-14 w-14 items-center justify-center rounded-2xl bg-primary-50 text-primary"><Route className="h-7 w-7" strokeWidth={1.75} /></span>
          <p className="text-sm font-semibold text-gray-900">No purchases in progress</p>
          <p className="mt-1 max-w-xs text-sm text-gray-500">Record an order or receive a delivery and it’ll show here, with the next step to take.</p>
          <button type="button" onClick={() => onGo({ screen: 'receive' })} className="mt-4 rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-white active:scale-95">Receive a delivery</button>
        </div>
      ) : (
        <>
          {active.length > 0 && (
            <section className="mb-5">
              <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-400">In progress</h3>
              <ul className="space-y-2">{active.map((j) => <JourneyCard key={j.id} j={j} onGo={onGo} />)}</ul>
            </section>
          )}
          {done.length > 0 && (
            <section>
              <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-400">Completed</h3>
              <ul className="space-y-2">{done.map((j) => <JourneyCard key={j.id} j={j} onGo={onGo} />)}</ul>
            </section>
          )}
        </>
      )}
    </div>
  );
}
