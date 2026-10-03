# 2026-09-14 — Niche picker replaces login as the front door

Back to [[Work-Log]] · Related: [[Implementation-Roadmap]] · [[Go-To-Market]] · [[Frontend-Overview]] · [[2026-09-14-M0-PWA-Foundation]]

## Goal
Per the founder: **remove the login screen as the entry for now** and make the first screen the **9 shop-type ("niche") icons** — the visible form of the `shopType` dial from [[Go-To-Market]].

## What changed (files)
- 🆕 `frontend/src/config/shopTypes.js` — the **shop-type registry** (single source of truth for verticals). 9 niches, each `{ id, label, tagline, icon (lucide), accent }` + `getSavedShopType`/`saveShopType` (localStorage) + `getShopType`. This is the config-driven seed for M3 (modules key off `id`; **no `if (shopType===…)`**).
- 🆕 `frontend/src/pages/NichePickerPage.jsx` — public, mobile-first grid (2-up phone / 3-up larger); tap selects a niche (accent icon, check badge, confirmation bar) and persists it.
- ✏️ `frontend/src/App.jsx` — routing rework: `/` is now the **public** `NichePickerPage`; the authenticated app moved behind a **path-less** `ProtectedRoute><Layout>` with the **same absolute paths** (`/pos`, `/products`, …) so nothing else changed. Removed `HomeRedirect` (index no longer redirects). `/login` still exists (reachable, not forced); catch-all `*` → `/` (picker).

## The 9 niches (edit `shopTypes.js` to change any)
Off-licence · Convenience/Mini-mart · Newsagent/CTN · International grocer · Vape & CBD · Greengrocer · Butcher/Fishmonger · Bakery/Deli · Health-food.

## Decisions / notes
- **Login not deleted, just not the front door.** Deep app pages stay protected (they need auth + a store for data); only the *entry* changed. When we wire "tap niche → into the app," we'll resolve how a picked shopType flows into onboarding/auth.
- Registry pattern deliberately matches the M3 architecture rule so this screen *is* the start of the shopType dial, not throwaway demo code.

## Verification (headless Chromium @ 390×844)
- `npm run build` ✓.
- Rendered `/`: heading "Welcome to Vendora", **9 tiles** with exact labels; no page errors (only a sandbox-blocked Google Fonts fetch → system-font fallback).
- Interaction: tap → exactly 1 tile pressed + "Vendora is set up for Off-licence."; **survives reload** (localStorage). Screenshot in scratchpad.

## Follow-ups
- Decide what happens after a niche is picked (continue into the app? short onboarding? still-later: login/create-account).
- Persist shopType to the store on the backend (currently per-device only) when auth is back in the flow.
- Rest of M0: mobile shell/nav for the authenticated app; app-home landing.

## Commit
- feat(app): niche-picker front door + shopType registry (M0)
