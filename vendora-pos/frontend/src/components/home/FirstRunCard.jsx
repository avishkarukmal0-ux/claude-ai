import React from 'react';
import toast from 'react-hot-toast';
import { PackageCheck, Sparkles, CalendarClock } from 'lucide-react';
import { useInventory } from '../../lib/inventoryStore';
import { isDemoActive, loadDemo } from '../../lib/demo';

/**
 * First useful win for a brand-new, empty shop (Phase 2.6a) — so an owner can do something real on day one
 * without first keying a whole catalogue. Offers a first delivery (which builds stock as a side effect), and
 * a clearly-separated "explore with sample data" that loads the demo workspace. Hidden once there's stock
 * or while already in the demo.
 */
export default function FirstRunCard({ onGo }) {
  const { products } = useInventory();
  if (isDemoActive() || products.length > 0) return null;

  function tryDemo() {
    loadDemo();
    toast('Loaded sample data — have a look around', { icon: '✨' });
    setTimeout(() => { window.location.reload(); }, 200); // re-read the demo workspace cleanly
  }

  return (
    <section className="mb-5 rounded-2xl border border-primary/20 bg-white p-4 shadow-sm">
      <h2 className="flex items-center gap-1.5 text-sm font-bold text-gray-900">
        <Sparkles className="h-4 w-4 text-primary" /> Get started
      </h2>
      <p className="mt-0.5 mb-3 text-xs text-gray-500">Do one real thing now — no need to type your whole stock list first.</p>
      <div className="space-y-2">
        <button type="button" onClick={() => onGo?.({ screen: 'receive' })} className="flex w-full items-center gap-3 rounded-xl border border-gray-100 bg-white p-3 text-left active:scale-[0.99]">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary-50 text-primary"><PackageCheck className="h-5 w-5" /></span>
          <span className="min-w-0 flex-1">
            <span className="block text-sm font-semibold text-gray-900">Receive your first delivery</span>
            <span className="block text-[11px] text-gray-500">Scan or type what arrived — it builds your stock as you go.</span>
          </span>
        </button>
        <button type="button" onClick={() => onGo?.({ screen: 'waste' })} className="flex w-full items-center gap-3 rounded-xl border border-gray-100 bg-white p-3 text-left active:scale-[0.99]">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary-50 text-primary"><CalendarClock className="h-5 w-5" /></span>
          <span className="min-w-0 flex-1">
            <span className="block text-sm font-semibold text-gray-900">Check your first dated product</span>
            <span className="block text-[11px] text-gray-500">Scan a short-dated item, mark it down or log the loss — no catalogue needed.</span>
          </span>
        </button>
        <button type="button" onClick={tryDemo} className="flex w-full items-center gap-3 rounded-xl border border-dashed border-gray-200 bg-gray-50 p-3 text-left active:scale-[0.99]">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-gray-200 text-gray-600"><Sparkles className="h-5 w-5" /></span>
          <span className="min-w-0 flex-1">
            <span className="block text-sm font-semibold text-gray-900">Explore with sample data</span>
            <span className="block text-[11px] text-gray-500">A pretend shop to try things out — kept separate from your real data.</span>
          </span>
        </button>
      </div>
    </section>
  );
}
