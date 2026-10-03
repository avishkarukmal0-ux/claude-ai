# State & Contexts

Back to [[Home]] · Related: [[Frontend-Overview]] · [[Routing-and-Pages]]

## Contexts (`src/context/`)
| Context | Holds | Key consumers |
|---|---|---|
| `AuthContext` | current `user`, login/logout, `hasRole` | route guards, everything |
| `CartContext` | live basket for POS | [[POS-and-Checkout]] |
| `SettingsContext` | store settings | most pages |
| `SubscriptionContext` | tier + feature flags | `LockedFeature`, gated pages |
| `OfflineContext` | online/offline status, queue | POS, offline queue |
| `NotificationContext` | toast/alert stream | app-wide |

Provider nesting order is in [[Frontend-Overview]].

## Hooks (`src/hooks/`)
| Hook | Purpose |
|---|---|
| `useAuth` | access AuthContext |
| `useCart` | access CartContext |
| `usePermissions` | role checks |
| `useFeatureFlags` | subscription feature checks |
| `useProducts` | product data/search |
| `useSocket` | socket.io connection |
| `useOffline` | offline state |
| `useHardware` | printers/scanner/scale |

## Services (`src/services/`)
Thin axios wrappers, one per API domain. Each maps to a group in [[API-Routes]].
| Service | Backend group |
|---|---|
| `api.js` | axios base (baseURL, JWT header, interceptors) |
| `auth.js` | `/auth` |
| `sales.js` | `/sales` |
| `products.js` | `/products` |
| `customers.js` | `/customers` |
| `staff.js` | `/staff` |
| `cashDrawer.js` | `/cash-drawer` |
| `lossPrevention.js` | `/loss-prevention` |
| `reports.js` | `/reports` |
| `suppliers.js` | `/suppliers` |
| `purchaseOrders.js` | `/purchase-orders` |
| `invoices.js` | `/invoices` |
| `promotions.js` | `/promotions` |
| `giftCards.js` | `/gift-cards` |
| `margins.js` | `/margins` |
| `hardware.js` | `/hardware` |
| `accounting.js` | `/accounting` ⭐ → [[Accounting]] |

## Pattern
`api.js` is the shared axios instance (base URL from env, attaches JWT, handles 401). Domain services import it and expose named functions. Pages call services in `useEffect`, hold results in `useState`, and `toast` on error. See [[Conventions]].
