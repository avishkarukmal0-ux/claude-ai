# POS & Checkout

Back to [[Home]] · [[Domains-Index]] · Related: [[State-and-Contexts]] · [[API-Routes]]

The core till — the default screen (`/` redirects to `/pos`).

## Where it lives
| Layer | File(s) |
|---|---|
| Page | `frontend/src/pages/POSPage.jsx` |
| Components | `QuickSellGrid.jsx`, `TapToPayModal.jsx`, `pos/POSLockScreen.jsx` |
| State | `CartContext` (basket), `OfflineContext` |
| FE services | `sales.js`, `products.js`, `promotions.js` |
| Routes | `/sales`, `/pos/parked`, `/pos/promotions`, `/pos/quick-keys`, `/payments/tap-to-pay` |
| Services | `promotionsEngine`, `parkedTransactionsService`, `refundService`, `quickKeysService`, `offlineService` |
| Models | `Sale`, `Refund`, `ParkedTransaction`, `Product`, `QuickKey`, `OfflineQueue` |

## Capabilities
- Scan / search / quick-key to add items to `CartContext`
- Apply promotions via `promotionsEngine`
- Park & recall transactions
- **Refunds** — the `↩ Refund` button in the cart action row opens `RefundModal` (in `POSPage.jsx`): look up sale by receipt number (`GET /sales/receipt/:number`) → tick items + set quantities → pick method (original/cash/card) + reason → `POST /sales/:id/refund` (`salesSvc.refundSale`). Backend `refundService.processRefund` restores stock, updates the cash drawer, writes a `REF-…` refund receipt, and marks the sale `refunded`/`partially_refunded`. Gated by `requirePermission('canRefund')`.
- Tap-to-pay + card payment
- **Offline mode**: if backend unreachable, sale queues in `OfflineQueue`, syncs later via `offlineService` (see `OfflineQueuePage`)
- Real-time: emits/receives via `useSocket` (customer display mirrors cart)

## Related standalone screens
- `SelfCheckoutPage` (`/self-checkout`) — customer-operated
- `QueueBustPage` (`/queue-bust`) — roaming checkout
- `CustomerDisplayPage` (`/customer-display`) — second screen

## Notes
Not yet deep-documented beyond this. Expand when we next work here.
