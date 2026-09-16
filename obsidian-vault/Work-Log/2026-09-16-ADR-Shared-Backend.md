# 2026-09-16 — ADR: one shared v3 backend (App + Till)

Back to [[Work-Log]] · Related: [[ADR-001-Shared-Backend]] · [[Architecture]] · [[Connect-Backend-MongoDB]]

## Goal
Founder asked whether the app should have a **separate** backend from the till, or stay **shared** as built. Lock the decision so it isn't re-litigated.

## Decision
**Shared** — one v3 codebase, one backend, one database. App is the front-of-house of the same Vendora POS v3; its data writes onto existing models (`Product`, `StockMovement`, `ExpiryMarkdownRule`, `Supplier`, `Store`). Till/sales (`Sale`, tills) stay dormant until Phase 2. Full reasoning + mitigations (app uses a slice, client is local-first, shopType×plan flags) in [[ADR-001-Shared-Backend]].

## What changed (files)
- 🆕 `obsidian-vault/Strategy/ADR-001-Shared-Backend.md` — the decision record.
- ✏️ `Home.md` — linked ADR-001 at top of Strategy.

## Note (not committed anywhere)
Generated two fresh random JWT secrets for the founder to paste into Railway (`JWT_SECRET`, `JWT_REFRESH_SECRET`). Delivered in chat only — **never committed** to the repo.

## Next
Once Mongo is connected ([[Connect-Backend-MongoDB]]): map local-first inventory/waste stores onto the existing `Product`/`StockMovement`/`Expiry` endpoints. Meanwhile: local-first reorder suggestions.

## Commit
- docs: ADR-001 — one shared v3 backend for App + Till
