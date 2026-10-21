# 2026-10-21 — POS slice 4: backend cloud scaffolding (inert)

Back to [[Work-Log]] · [[Home]] · builds on [[2026-10-21-pos-comparison-deduct]]

**Domain(s):** [[Backend/API-Routes]] · [[Integrations/Sales-Ingestion-Design]] · [[Integrations/POS-Compatibility-Matrix]]
**Branch:** `claude/vendora-pos-v3-KPnI0`
**Commit:** `c0df428`

## Goal
Lay the server-side plumbing a real cloud till connection will need — connection records, an idempotent durable
sale-event queue, encrypted token storage, and the connect/callback/webhook entry points — **all disabled and
honest by default**. Nothing is accredited or credentialed, so every live path says "not available yet" rather
than faking a connection, inventing an endpoint, or representing a fixture as real. Ships OFF; not deploy-enabled.

## What changed (backend only — no frontend, no SW bump)
- `config/index.js` — new `posCloud` gate: `enabled` (`POS_CLOUD_ENABLED`, default **false**), `tokenKey`
  (`POS_TOKEN_KEY`), `callbackBaseUrl`. Per-provider creds read from `POS_<PROVIDER>_CLIENT_ID/_CLIENT_SECRET/
  _WEBHOOK_SECRET` (none shipped).
- `utils/secretBox.js` (NEW) — AES-256-GCM authenticated encryption for tokens at rest. Random IV + auth tag
  (tamper → throw, never garbage), versioned `v1.iv.tag.ct` format, key from `POS_TOKEN_KEY` only. No key →
  `isAvailable()` false and `encrypt()` throws, so a caller can never fall back to plaintext.
- `models/PosConnection.js` (NEW) — one per (account, provider). Stores status/scopes/externalMerchantId and an
  **encrypted** `tokenCipher` (never plaintext); `toJSON`/`toClient` strip the cipher so it can't leak to a
  response. Unique (account, provider).
- `models/PosSaleEvent.js` (NEW) — durable ingestion queue. Unique (account, `dedupeKey`) = salesModel
  sale/line key → exactly-once capture across re-delivery/replay. Verified payload only; **no stock mutation**,
  **no card data**.
- `services/posCloudService.js` (NEW) — `cloudEnabled()`/`providerConfigured()` gating (needs flag + key +
  adapter.canConnect() + creds → false for every provider today); `startConnect`/`handleCallback` throw an
  honest 503 `POS_NOT_AVAILABLE` (or delegate to the adapter, which itself throws until sandbox-verified —
  never a fabricated authorize URL); `receiveWebhook` returns `not_configured` until live; `enqueueEvent`
  (idempotent on the unique index — a duplicate is a no-op, not an error) + `markProcessed`.
- `routes/pwaPosRoutes.js` — added `GET /connections`, `POST /connect/:provider/start`,
  `GET /connect/:provider/callback` (owner/manager only; staff can read the catalogue but not connect).
- `routes/pwaPosWebhookRoutes.js` (NEW) — `POST /pwa-pos/webhooks/:provider`, raw-body, **no PWA token**
  (providers don't carry one — authenticity is by signature in the adapter). Mounted BEFORE the token-gated
  `/pwa-pos`. Returns 404 while inert (looks like a non-existent endpoint; never accepts unverified data),
  400 on a rejected/failed verification.

## Decisions
- **Inert, not absent.** The endpoints exist and are wired so the shape is reviewable and testable, but they
  cannot do anything real until `POS_CLOUD_ENABLED=true` + `POS_TOKEN_KEY` + a provider's credentials — which
  only happens after accreditation. Verified end-to-end: webhook → 404, connect → 401 without a token.
- **Secrets never in the clear, never to the client.** secretBox or nothing; `tokenCipher` is stripped from
  every serialisation.
- **Delegates to the adapters** (slice 1) for every would-be live call, so "we never fake a connection" is
  enforced in one place — the adapter throws `ProviderNotAvailableError` until implemented + sandbox-verified.
- **No new dependencies** (built-in `crypto`, existing `mongoose`), so the CI prod-audit gate is unaffected.

## Verify
- `node -e "require('./src/app.js')"` boots ✓ · `jest secretBox posCloud` → **21 passed** ✓ ·
  HTTP smoke: webhook **404**, connect/start & connections **401** ✓.

## Follow-ups
- [ ] Slice 5: connection status/recovery screens (client), pilot feedback capture, sandbox tests per provider.
- [ ] When a provider IS accredited: implement that adapter's `connect`/`verifyWebhook`/`normalizeSale` against
  its sandbox, add its creds, set `POS_TOKEN_KEY`, then flip `POS_CLOUD_ENABLED` — the queue→deduction bridge
  (server-side) is the remaining piece and must respect the same owner opt-in as the CSV deduct path.
- [ ] Ops: generate `POS_TOKEN_KEY` (`secretBox.generateKeyHex()`), store as a Render secret, document in
  [[Deployment]] — do NOT commit it.
