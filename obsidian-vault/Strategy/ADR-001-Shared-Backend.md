# 🧭 ADR-001 — One shared v3 backend (not a separate app backend) ⭐

Back to [[Home]] · Related: [[Architecture]] · [[Go-To-Market]] · [[Connect-Backend-MongoDB]] · [[Implementation-Roadmap]]

> **Decision locked 2026-09-16.** The Phase-1 **App** and the Phase-2 **Till** share **one v3 codebase, one backend, and one database**. We do **not** build a separate backend for the app. This is settled — don't re-litigate it.

## Context
The app (goods-in, inventory, waste — currently local-first) and the till (sales, payments) could each have their own backend. Question raised: should they be separated?

## Decision
**Shared.** The app is the front-of-house of the *same* Vendora POS v3 system. Its data is written onto the **existing v3 models** — never a parallel copy:

| App feature | v3 model (already exists) |
|---|---|
| Inventory | `Product` |
| Goods-in "Receive" | `StockMovement` |
| Stock-take | `StockTake` / `StockTakeItem` |
| Expiry & waste | `ExpiryMarkdownRule` |
| Suppliers | `Supplier` |
| Shop | `Store` |
| *(Phase-2 only)* sales/tills | `Sale`, tills, loss-prevention — **dormant until Phase 2** |

## Why (the reasoning)
1. **No capital** — one backend, one DB, one bill, one thing to maintain. A solo founder can't run two.
2. **Land-and-expand depends on it** — the app's stock/margin data *is* the warm upsell into the till. Separate systems would force a data migration/merge later — the exact switching friction the whole plan avoids.
3. **Models already exist** — nothing to rebuild.
4. **One source of truth** — one store, one login, one dataset; no drift or double-entry bugs.

## How we keep the app light despite a big backend (the mitigations)
- **App uses only a slice** of the API (products / stock / expiry / suppliers). Till/sales code stays dormant, present but unused — foundation, not baggage.
- **Client is local-first** — inventory + waste run on the phone, offline, instantly; they *sync* to the backend, never block on it.
- **shopType × plan feature flags** already scope each shop to its own surface.

## The rule going forward
> Add the app's data onto the **existing v3 models**, never a parallel copy. Goods-in → `StockMovement`; inventory → `Product`; waste → `Expiry`. One shape, one truth.

## When would separate ever make sense? (so we know it doesn't here)
- Different product, different market from the till → **no**, same shop + same data.
- Legacy/unstable till backend we don't want to couple to → **no**, it's the same fresh v3 code we own.
- Hyperscale (millions of users) → not our situation; and even then you'd split by *service*, not duplicate the whole thing.

## Status
Locked. Next implementation step: once Mongo is connected ([[Connect-Backend-MongoDB]]), map the local-first inventory/waste stores onto the existing `Product` / `StockMovement` / `Expiry` endpoints.
