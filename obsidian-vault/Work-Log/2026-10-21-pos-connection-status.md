# 2026-10-21 — POS slice 5: connection status/recovery + adapter contract tests

Back to [[Work-Log]] · [[Home]] · builds on [[2026-10-21-pos-cloud-scaffolding]]

**Domain(s):** [[Frontend-Overview]] · [[Integrations/Sales-Ingestion-Design]] · [[Integrations/POS-Compatibility-Matrix]]
**Branch:** `claude/vendora-pos-v3-KPnI0`
**Commit:** `4dc3832`

## Goal
Close out the POS build slices: surface each till's REAL connection status on the "Connect your till" screen
(reading the slice-4 `/connections` endpoint), give a recovery affordance for a connection that needs
attention, and lock in the adapters' honesty with a contract test suite. Everything stays truthful while the
cloud feature is inert — the screen never shows a fabricated "Connected".

## What changed
**Client**
- `lib/posClient.js`: `getConnections()` (→ `{ ok, cloudEnabled, connections }`, degrades to empty on failure —
  never a fake connection), `startConnect(providerId)` (POST connect/start; marks a 503 as `notAvailable` and
  keeps the server's honest message), and a pure `describeConnection(status)` status→label/tone mapping.
- `components/till/TillConnectView.jsx`: fetches catalogue + connections in parallel; a provider with a real
  connection shows its ACTUAL status badge (connected / needs reconnect / paused) in place of the availability
  badge; `needs_attention` gets a **Reconnect** button (→ `startConnect`, which today surfaces the honest
  "not available yet"). With the cloud off and no connections, behaviour is unchanged from slice 2.
- `public/sw.js`: `CACHE_VERSION` v68 → **v69**.

**Tests**
- `backend/.../posAdapterContract.test.js` (NEW) — for all 9 adapters: every live op
  (`connect/disconnect/fetchSales/verifyWebhook`) throws `ProviderNotAvailableError`, `normalizeSale` throws
  `ProviderNotImplementedError`, `capabilities()`/`availability()`/`canConnect()` match the registry (no
  drift), and exactly `eposnow, shopify, square, zettle` are ready-for-testing. This is what makes the slice-4
  cloud scaffolding safe to ship: the adapters are the only place a live call could happen, and they all refuse.
- `frontend/.../posClient.test.js` — extended for `getConnections` (pass-through + degrade), `startConnect`
  (503 → notAvailable), `describeConnection` (pure mapping).

## Decisions
- **Status is read, never invented.** The screen renders whatever `/connections` returns; an empty list (the
  reality today) just leaves the availability badges as they were. No placeholder connected state ever.
- **Recovery is wired, not faked.** Reconnect calls the real endpoint and shows the real answer (honest 503
  while inert) — latent but correct, exactly like the backend it talks to.
- **Pilot feedback capture — deliberately deferred, not faked.** There's no backend channel to collect it and
  fabricating telemetry would violate the honesty rule; when a real channel exists it routes through the
  existing support/diagnostics path rather than a bolted-on store. Noted as a follow-up.

## Verify
- `npm run build` ✓ · full vitest **604 passed (84 files)** ✓ · adapter contract jest **29 passed** ✓.

## Follow-ups
- [ ] Pilot feedback: capture via the existing support/diagnostics path once a shop is live on the CSV pilot.
- [ ] Per-provider sandbox tests become real only when an adapter's `normalizeSale`/`verifyWebhook` is
  implemented against that provider's sandbox (after accreditation) — the contract suite is the placeholder
  until then.
- [ ] Owner sign-off to send the 9 provider enquiries ([[Integrations/Provider-Enquiries]]) — still the gate
  that unblocks everything cloud.

## POS slices — status
1. ✅ Foundation · 2. ✅ Connect-your-till UI · 3. ✅ Comparison Mode + opt-in deduction ·
4. ✅ Cloud scaffolding (inert) · 5. ✅ Status/recovery + contract tests. **The CSV pilot is the only live
ingestion path; all cloud paths remain honestly "not available yet" until a provider is accredited.**
