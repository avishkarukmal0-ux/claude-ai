# ADR-002 — Separate the App (PWA) from the Till, without a rewrite

Back to [[Home]] · Supersedes framing of [[ADR-001-Shared-Backend]] · Related: [[2026-09-30-Reliability-Review]]

**Status:** Accepted (2026-09-30) · **Context:** reliability review + PWA-only pivot ([[2026-09-29-Smarter-Brain]])

## Decision
The **phone-first PWA is an independent product** a shop can use with no till. The **till/back-office is a
separate, deferred product**: its code and data are preserved, but removed from the PWA's initial dependency
path. **One data model, not two databases** — separation is of *experience, navigation, runtime dependencies
and release responsibility*, not of storage.

## Boundary (as implemented)
```
                         BrowserRouter
                              │
                         AuthProvider            (lightweight; no-ops for guests)
                              │
                 ┌────────────┴─────────────┐
        Standalone PWA (eager)        Till / back-office (LAZY)
        /  NichePicker                <TillProviders> (subscription/settings/
        /home  HomePage                 cart/offline/notification) — scoped here only
        (local-first stores)            └ ProtectedRoute → Layout → POS, Products,
                                           Reports, Accounting, … (~45 lazy chunks)
```
- **PWA initial JS: 642.82 kB → 151.98 kB** (gzip 139.85 → 39.69). The 399 kB charts vendor and all
  till screens load on demand only. The guest PWA never mounts till providers or calls
  `GET /subscriptions/current`.
- Deferred functionality is gated by **route + lazy boundary** (feature-flag equivalent): the till is
  simply not reachable/loaded from the PWA product surface.

## Data ownership (authoritative source per type)
| Data | Authoritative today | Maps to (backend, when connected) |
|---|---|---|
| Products / stock levels | PWA local store (`inventory_v1`), scoped per workspace | `Product`, `StockMovement` |
| Stock movements (typed) | PWA `movements_v1` | `StockMovement` (type ↔ type) |
| Suppliers, buy list, waste, takings, suggestions, stocktake | PWA local stores | v3 back-office models |
| Sales, refunds, accounting, staff, customers, loyalty | **Till backend** (Mongo) — dormant until Phase 2 | existing v3 models |

There is **one source of truth per type** — inventory is owned by the PWA locally now, and will sync to the
same `Product`/`StockMovement` records (never duplicated into a competing store).

## Shop-scoped access
- Frontend: `lib/storage.js` namespaces every key to a **workspace** (`local` guest, or `shop:<id>`).
- Backend: `authenticate → storeContext` populates `req.store`; every query is `store`-scoped; refunds are
  fetched shop-scoped so no shop can touch another's sale.

## Stable IDs & migration mapping
- Local records use stable ids (`crypto.randomUUID()`), preserved across the scoping migration.
- **Legacy → scoped migration** (`migrateLegacyToLocalOnce`): pre-scoping keys `vendora_<name>` are **copied**
  (not moved) into `vendora:local:<name>` once, guarded by `vendora:legacy_migrated_v1`. Originals are
  **retained** as a safety net. Existing users keep seeing their data with zero action.
- **Guest → shop** is **explicit only** (`copyWorkspace`, user-triggered) — on-device guest data is never
  silently attached to whichever account logs in next.

## Migration verification & rollback
- **Verify:** unit tests (`storage.test.js`) prove copy-once, non-destructive, no-clobber, and no-silent-attach.
  Manual: after upgrading, open `/home` — data still present; DevTools shows both `vendora_*` (legacy, intact)
  and `vendora:local:*` (scoped) keys.
- **Rollback:** the migration only *adds* scoped keys; to revert, delete `vendora:*` keys — the untouched
  `vendora_*` legacy keys remain. Backups: restore takes an in-memory snapshot and rolls back on any write
  failure; a recovery backup is downloaded before any replace. **No destructive/production migration is run.**

## Offline sync & conflict resolution — NOT implemented
The PWA is **local-first and single-device**. There is **no multi-device sync today** and none is claimed in
the UI. When the backend is connected, the plan is: push typed `movements_v1` as `StockMovement` (idempotent
by movement id), reconcile `Product.stock.quantity` server-side, and resolve conflicts last-write-wins per
field with movement replay for stock. Until then, cross-device data moves only via **export/restore backup**.

## Future integration seam
- `inventoryStore.sellUnits()` is the honest sales entry point for a future quick-sell or till link.
- Movement ids + types make imports **idempotent** and let integration events map 1:1 to `StockMovement`.

## Pilot readiness
The PWA is **ready for a supervised single-shop pilot** (local-first, offline, data-safe). Not yet ready for
multi-device or unattended multi-shop use until backend sync is built.
