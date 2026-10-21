# 2026-10-21 — POS slice 2: "Connect your till" screen

Back to [[Work-Log]] · [[Home]] · builds on [[2026-10-21-pos-integration-foundation]]

**Domain(s):** [[Frontend-Overview]] · [[Backend/API-Routes]] · [[Integrations/Sales-Ingestion-Design]]
**Branch:** `claude/vendora-pos-v3-KPnI0`
**Commit:** `e96ed5b`

## Goal
Give the shopkeeper a visible, honest entry point for till/POS sales import (slice 1 built the
provider framework backend-only — there was **no UI**). Show each provider's REAL status and route to
the one path that actually works today: the manual item-level CSV pilot. Never imply a live cloud
connection; never touch stock.

## What changed
**Backend**
- `backend/src/routes/pwaPosRoutes.js` (NEW) — `GET /api/pwa-pos/providers`. Read-only, secret-free
  projection of `posProviders/registry.listProviders()`: `availability`, `connectionMethods`,
  `csvCapable`, `itemLevel`, `requiresApproval`, `docsUrl/docsCheckedAt`, `itemLevelNote`, `blockers`.
  Response flags `liveMethods:['csv']`. PWA-token gated (`verifyAccess` + `assertMemberActive`), same as
  the other PWA data routes. Reveals nothing shop-specific, so any role may read it.
- `backend/src/routes/index.js` — mounted at `/pwa-pos`.

**Frontend**
- `frontend/src/lib/posClient.js` (NEW) — mirrors `insightsClient` (VITE_API_BASE + bearer token,
  `__setPosTransport` for tests). `getProviders()` resolves `{ ok:false, error, needsLogin }` on failure
  rather than throwing or faking a success — the screen degrades, it never shows a false "connected".
- `frontend/src/components/till/TillConnectView.jsx` (NEW) — phone-first. Intro states CSV is the only
  live method and that direct links are still being built/tested. Per provider: a green "CSV import works
  now" badge (or "payment-level only" for SumUp) + an honest, **non-tappable** cloud-status badge
  (in testing / needs partner approval / not built / can't read item-level). CSV button → `onOpenCsv`.
- `frontend/src/pages/HomePage.jsx` — new `screen === 'till-connect'` render + `SCREEN_TITLES` entry;
  the Data group's "Import till sales" row became **"Connect your till"** (Plug icon) → `till-connect`;
  its CSV button routes on to the existing `sales-import` screen (`SalesImportView` unchanged).
- `frontend/public/sw.js` — `CACHE_VERSION` v66 → **v67**.

## Decisions
- **Honesty over polish (per brief).** No faked connections. Cloud rows are deliberately not interactive
  — a disabled-looking badge, not a "Connect" button that would lie. CSV is the sole call-to-action.
- **Reuse, don't rebuild.** The screen is a router to the existing, working `SalesImportView`; no new
  ingestion logic. Deductions remain out of scope here (that's slice 3, Comparison Mode).
- **Server is the only status authority.** The client never derives a provider's availability; it renders
  what `/pwa-pos/providers` returns, and shows "catalogue unavailable" if the fetch fails.

## Gotchas
- Backend tests are **Jest** (`npx jest`), frontend tests are **vitest** — don't cross them (a vitest run
  of a jest file fails with "describe is not defined"). Noted in [[Conventions]].

## Verify
- `npm run build` (frontend) ✓ · `npx vitest run src/lib/__tests__/posClient.test.js` → 3 ✓
- `npx jest src/__tests__/posProviders.test.js` → 16 ✓ · route returns **401** without a token ✓

## Follow-ups
- [ ] Slice 3: Comparison Mode (opening baseline / cut-off) + opt-in deducting CSV.
- [ ] Backend cloud scaffolding (OAuth/webhook-verify stubs, disabled) once a provider is approved.
- [ ] Owner sign-off to send the 9 provider enquiries ([[Integrations/Provider-Enquiries]]) — unblocks
  the `approval_required` providers.
