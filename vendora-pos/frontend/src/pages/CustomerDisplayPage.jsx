import React, { useState, useEffect } from 'react';

const fmt = (n) => `£${(Number(n) || 0).toFixed(2)}`;

export default function CustomerDisplayPage() {
  const [cart, setCart] = useState({ items: [], total: 0, subtotal: 0, customer: null, storeName: "Raj's Off-Licence" });
  const [lastUpdate, setLastUpdate] = useState(null);

  useEffect(() => {
    // Listen via BroadcastChannel (same-origin, multi-window)
    let bc;
    if (typeof BroadcastChannel !== 'undefined') {
      bc = new BroadcastChannel('vendora_customer_display');
      bc.onmessage = (e) => {
        if (e.data?.type === 'cart_update') {
          setCart(e.data.payload);
          setLastUpdate(new Date());
        }
      };
    }

    // Also poll localStorage as fallback
    const pollStorage = () => {
      const raw = localStorage.getItem('vendora_customer_display');
      if (raw) {
        try {
          const data = JSON.parse(raw);
          setCart(data);
          setLastUpdate(new Date());
        } catch {}
      }
    };
    pollStorage();
    const poller = setInterval(pollStorage, 1000);

    return () => {
      bc?.close();
      clearInterval(poller);
    };
  }, []);

  const isEmpty = !cart.items || cart.items.length === 0;

  return (
    <div className="min-h-screen bg-slate-900 text-white flex flex-col" style={{ fontFamily: 'system-ui, sans-serif' }}>
      {/* Header */}
      <div className="bg-slate-800 px-8 py-4 flex items-center justify-between border-b border-slate-700">
        <div className="flex items-center gap-3">
          <span className="text-3xl">🛒</span>
          <div>
            <p className="text-xl font-black text-white">{cart.storeName || "Raj's Off-Licence"}</p>
            <p className="text-slate-400 text-sm">Customer Display</p>
          </div>
        </div>
        <div className="text-right">
          <p className="text-slate-400 text-xs">{lastUpdate ? `Updated ${lastUpdate.toLocaleTimeString()}` : 'Waiting for items…'}</p>
        </div>
      </div>

      {/* Main content */}
      <div className="flex-1 flex">
        {/* Items list */}
        <div className="flex-1 p-8">
          {isEmpty ? (
            <div className="flex flex-col items-center justify-center h-full text-slate-500">
              <div className="text-8xl mb-6">🛍️</div>
              <p className="text-2xl font-semibold">Welcome!</p>
              <p className="text-lg mt-2">Please present your items to the cashier</p>
            </div>
          ) : (
            <>
              <h2 className="text-slate-400 text-sm font-semibold uppercase tracking-wider mb-4">Your Items</h2>
              <div className="space-y-2 max-h-96 overflow-y-auto">
                {cart.items.map((item, idx) => (
                  <div key={idx} className="flex items-center justify-between bg-slate-800 rounded-xl px-5 py-3">
                    <div className="flex items-center gap-3">
                      <span className="w-8 h-8 bg-primary rounded-lg flex items-center justify-center text-sm font-bold">{item.quantity}</span>
                      <div>
                        <p className="font-semibold text-white">{item.name}</p>
                        <p className="text-slate-400 text-sm font-mono">{fmt(item.unitPrice)} each</p>
                      </div>
                    </div>
                    <p className="font-bold font-mono text-white text-lg">{fmt(item.lineTotal)}</p>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>

        {/* Totals panel */}
        <div className="w-72 bg-slate-800 p-8 flex flex-col justify-between border-l border-slate-700">
          <div>
            {cart.customer && (
              <div className="bg-blue-900 border border-blue-700 rounded-xl p-4 mb-6">
                <p className="text-blue-300 text-xs font-semibold uppercase tracking-wider mb-1">Loyalty Member</p>
                <p className="text-white font-bold">{cart.customer.firstName} {cart.customer.lastName}</p>
                <p className="text-blue-300 text-sm">{cart.customer.loyalty?.points || 0} points</p>
              </div>
            )}

            <div className="space-y-3">
              {cart.promoDiscount > 0 && (
                <div className="flex justify-between items-center">
                  <span className="text-green-400 text-sm">🏷️ Discount</span>
                  <span className="text-green-400 font-mono font-bold">−{fmt(cart.promoDiscount)}</span>
                </div>
              )}
              <div className="flex justify-between items-center pt-2 border-t border-slate-600">
                <span className="text-slate-300 text-lg">Subtotal</span>
                <span className="text-white font-mono text-xl">{fmt(cart.subtotal || cart.total)}</span>
              </div>
            </div>
          </div>

          <div className="text-center">
            <p className="text-slate-400 text-sm mb-2">TOTAL</p>
            <p className="text-6xl font-black text-white font-mono">{fmt(cart.total)}</p>
            {cart.items.length > 0 && (
              <p className="text-slate-400 text-sm mt-2">{cart.items.reduce((s, i) => s + i.quantity, 0)} item(s)</p>
            )}
          </div>
        </div>
      </div>

      {/* Footer */}
      <div className="bg-slate-800 border-t border-slate-700 px-8 py-3 text-center">
        <p className="text-slate-500 text-xs">Powered by Vendora POS · Challenge 25 in operation · We ID everyone who looks under 25</p>
      </div>
    </div>
  );
}
