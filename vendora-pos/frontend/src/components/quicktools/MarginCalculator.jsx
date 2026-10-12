import React, { useState } from 'react';
import { Percent } from 'lucide-react';

// Glance-and-go margin calculator. No VAT assumptions — cost and price as entered.
export default function MarginCalculator() {
  const [cost, setCost] = useState('');
  const [price, setPrice] = useState('');

  const c = parseFloat(cost);
  const p = parseFloat(price);
  // Margin is a share of the SELL price, so we need a sell price > 0 to compute anything. Flag the
  // zero/empty case explicitly so we can tell the user what's missing instead of just showing dashes.
  const needSell = price.trim() === '' || !(p > 0);
  const valid = Number.isFinite(c) && Number.isFinite(p) && p > 0;

  const profit = valid ? p - c : null;
  const margin = valid ? ((p - c) / p) * 100 : null;   // % of sell price
  const markup = valid && c > 0 ? ((p - c) / c) * 100 : null; // % of cost

  // £ with the sign OUTSIDE the symbol: a loss reads -£0.20, not £-0.20.
  const money = (v) => (v < 0 ? `-£${Math.abs(v).toFixed(2)}` : `£${v.toFixed(2)}`);

  return (
    <div>
      <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-primary-50 text-primary">
        <Percent className="h-7 w-7" strokeWidth={1.75} />
      </div>

      <div className="space-y-3">
        <Field label="Cost price (£)" value={cost} onChange={setCost} placeholder="e.g. 0.80" />
        <Field label="Sell price (£)" value={price} onChange={setPrice} placeholder="e.g. 1.20" />
      </div>

      <div className="mt-5 grid grid-cols-3 gap-2">
        <Stat label="Profit" value={profit === null ? '—' : money(profit)} tone={profit !== null && profit < 0 ? 'bad' : 'good'} />
        <Stat label="Margin" value={margin === null ? '—' : `${margin.toFixed(1)}%`} tone={margin !== null && margin < 0 ? 'bad' : 'good'} />
        <Stat label="Markup" value={markup === null ? '—' : `${markup.toFixed(1)}%`} />
      </div>

      {needSell && (
        <p className="mt-3 text-center text-sm font-medium text-gray-500">Enter a sell price to see the margin.</p>
      )}

      {profit !== null && profit < 0 && (
        <div className="mt-3 rounded-xl bg-danger-light p-3 text-sm font-medium text-danger-dark">
          You’d be selling below cost — losing {money(profit).replace('-', '')} per unit.
        </div>
      )}

      <p className="mt-4 text-xs leading-snug text-gray-400">
        Margin = profit as a share of the sell price. Markup = profit as a share of cost. Enter
        prices as you buy/sell them (before or after VAT — just be consistent).
      </p>
    </div>
  );
}

function Field({ label, value, onChange, placeholder }) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-medium text-gray-500">{label}</span>
      <input
        type="number"
        inputMode="decimal"
        min="0"
        step="0.01"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full rounded-xl border border-gray-200 px-3 py-2.5 text-base text-gray-900 focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
      />
    </label>
  );
}

function Stat({ label, value, tone }) {
  const color = tone === 'bad' ? 'text-danger' : tone === 'good' ? 'text-success' : 'text-gray-900';
  return (
    <div className="rounded-xl bg-gray-50 p-3 text-center">
      <div className={`text-lg font-bold tabular-nums ${color}`}>{value}</div>
      <div className="mt-0.5 text-xs font-medium uppercase tracking-wide text-gray-400">{label}</div>
    </div>
  );
}
