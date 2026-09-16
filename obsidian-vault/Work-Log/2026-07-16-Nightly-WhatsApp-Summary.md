# 2026-07-16 — Automatic nightly WhatsApp summary (Phase 3b)

Back to [[Work-Log]] · [[Home]]

**Domain(s):** [[Overview-Dashboard]] · [[API-Routes]] · [[Services]] · [[Data-Models]]
**Branch:** `claude/vendora-pos-v3-KPnI0`

## Goal
Turn the share-initiated "shop closed fine" recap ([[2026-07-16-Daily-Summary]]) into one that **arrives on the owner's phone by itself** at closing time. User picked **WhatsApp**. Build the full pipeline: notification record + scheduler + send channel, gated so it ships and runs now and just needs Twilio keys to go live.

## The three parts (as explained to the user)
1. **Notification record** — idempotent outbox. `models/Notification.js`: store, type, channel, recipient, text, status (`pending|sent|failed|skipped`), providerId, error, `sentAt`, and a **unique `dedupeKey`** so it can never double-send.
2. **Scheduler** — hooked into the existing `jobs/` cron system. `jobs/dailySummary.js` runs **every minute**; for each store with `ownerSummary.enabled`, if the current HH:mm in the **store's timezone** equals `sendAt`, it builds + delivers the recap. Exact-minute match + dedupeKey = exactly once/day, restart-safe. Registered in `jobs/index.js`.
3. **Send channel** — `services/notificationService.js`. WhatsApp via **Twilio**, **lazy-required** and gated on `whatsappConfigured()` (env vars present). No creds → recorded `skipped`, never crashes boot or cron.

## Changes
- **New:** `models/Notification.js`, `services/ownerSummaryService.js` (extracted the recap builder — one source of truth for screen + message), `services/notificationService.js`, `jobs/dailySummary.js`.
- **`models/Store.js`** — added `ownerSummary { enabled, channel, whatsappTo, sendAt }`.
- **`routes/overviewRoutes.js`** — `/daily-summary` now thin (calls `ownerSummaryService`). New manager-only `GET/PUT /overview/summary-settings` and `POST /overview/summary-settings/test` (send now).
- **`jobs/index.js`** — registered the every-minute `dailySummary` job.
- **`.env.example`** — `TWILIO_ACCOUNT_SID / TWILIO_AUTH_TOKEN / TWILIO_WHATSAPP_FROM`.
- **`package.json`** — added `twilio` (^6).
- **Frontend** — `services/overview.js` (`getSummarySettings/saveSummarySettings/testSummary`); `OverviewPage.jsx` `AutoDeliverySetup` panel inside the summary modal (toggle, WhatsApp number, closing time, Save, **Send test**).

## Decisions
- **Gated, not blocked** — full pipeline ships without Twilio keys; absence = `skipped`. Lets the user run everything today and flip WhatsApp on later with no code change.
- **Every-minute cron + per-store tz** rather than one cron per store — simplest way to honour each store's `sendAt`/timezone; dedupe guarantees single send.
- **Recap builder extracted** so the WhatsApp text and the on-screen modal can never drift.
- Settings live on the **Store** (manager-gated), surfaced in the same modal the owner already opens — no separate settings trek.

## Gotchas / notes
- **Twilio WhatsApp needs a sender + (for production, business-initiated) a Meta-approved template.** The **Twilio sandbox** works immediately for testing once the owner joins it; production sending outside the 24h window needs template approval. Documented for the user.
- **In-process cron only fires while the backend is running.** With Railway compute lapsed, the 9pm job won't fire unless the backend is hosted always-on. The share button remains the manual fallback.
- Same Mongoose `aggregate` ObjectId-cast caveat carried into `ownerSummaryService`.
- `Notification.create` relies on the unique `dedupeKey` index (Mongoose autoIndex) for idempotency — a duplicate throws `11000` → treated as skip.

## Verification
- Backend: `require('./src/app.js')` + all new modules load ✅; `twilio@^6.0.2` installed.
- Frontend: `npm run build` ✅ (pre-existing `api.js` warning only).
- Not exercised live (no Twilio creds / not running against Atlas here) — send path returns `skipped` until keys added.

## Commit(s)
- _(to be filled after push)_

## Follow-ups
- [ ] Host backend always-on (Railway/again) so the nightly job actually fires unattended.
- [ ] Production WhatsApp template approval (or start on the Twilio sandbox).
- [ ] Add SMS/email as alternate `channel` values (pipeline already supports it — just add a branch in `notificationService`).
- [ ] Surface a "notifications history" view from the `Notification` outbox.
