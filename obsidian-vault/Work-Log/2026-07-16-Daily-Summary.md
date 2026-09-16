# 2026-07-16 — End-of-day "shop closed fine" summary (Phase 3)

Back to [[Work-Log]] · [[Home]]

**Domain(s):** [[Overview-Dashboard]] · [[API-Routes]]
**Branch:** `claude/vendora-pos-v3-KPnI0`

## Goal
Phase 3 of "everything at your fingertip" (after [[2026-07-16-Owner-Home]]): the real anxiety-killer for when the owner is *away* from the shop — a short "shop closed fine" recap they can glance at and **one-tap send to their own phone**.

## Reality check on delivery
There's **no backend notification model** and the frontend `NotificationContext` is in-memory only — so a true automated SMS/WhatsApp push would need infra that isn't wired (Twilio etc.). Rather than fake it, this ships an honest version: compute the recap server-side and let the owner **share it themselves** via the Web Share API (`navigator.share`) → WhatsApp/SMS/etc., with a clipboard-copy fallback on desktop. Automated scheduled push is the documented follow-up.

## Changes
- **`backend/src/routes/overviewRoutes.js`** — new `GET /overview/daily-summary` (`requireRole('supervisor')`, `?date=YYYY-MM-DD`, defaults to today up to now). Returns takings, transactions, gross profit, margin, `theftToday`, `lowStockCount` (`stock.quantity <= lowStockThreshold`), `expiredCount`/`expiredValue`, an `issues[]` list, an `allGood` flag + friendly `headline`, and a ready-to-send plain-text `shareText`.
- **`frontend/src/services/overview.js`** — `getDailySummary()`.
- **`frontend/src/pages/OverviewPage.jsx`** — `DaySummaryModal` (mobile bottom-sheet): green "Shop closed fine 👍" / amber "N things to check", takings + profit tiles, a "Worth a look" list, and a **"Send to my phone"** button (`navigator.share`, clipboard fallback). Opened by a CTA under the "Today so far" strip.

## Decisions
- **Share, not push** — honest to the infra we have; still delivers the "peace of mind on my day off" outcome (owner taps → sends to their own WhatsApp).
- **`shareText` built server-side** so the wording stays consistent and the client stays dumb.
- Low stock uses the existing `stock.lowStockThreshold` (default 5); no new config.

## Gotchas
- `navigator.share` rejects when the user dismisses the share sheet — swallow that (it's not an error).
- Same Mongoose `aggregate` ObjectId-cast caveat as the `today` block — `store` must be cast in `$match`.
- `getMarginAnalysis(store, dayStart, dayEnd)` reused for a single-day window; profit shows £0 gracefully when there are no sales yet.

## Verification
- Backend: `node -e "require('./src/routes/overviewRoutes.js')"` ✅.
- Frontend: `npm run build` ✅ (pre-existing `api.js` dynamic-import warning only).

## Commit(s)
- _(to be filled after push)_

## Follow-ups
- [ ] **Automated** end-of-day push: needs a Notification model + a scheduler (cron at store close) + a channel (SMS/WhatsApp via Twilio, or web-push). This turns "tap to send" into "arrives on its own".
- [ ] Let the owner pick close time / opt in per store.
- [ ] Optionally include cash-up variance once multi-till drawer selection is settled.
