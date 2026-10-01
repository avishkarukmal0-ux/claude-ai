# 2026-10-01 — Invoice mandate #6: daily digest notifications (email + device)

Back to [[Work-Log]] · Builds on [[2026-10-01-Staff-Access]] · routes in [[Backend/API-Routes]]

The second deferred mandate item, and the last of the 8. An opt-in **daily digest** of what needs
attention — stock expiring soon, overdue supplier claims, urgent/overdue team tasks — on two channels.

## Two channels, honestly separated
- **Email (reliable, server-sent, not app-open-dependent).** The server can parse the shop's already-synced
  blobs, so a scheduled job computes the digest and emails it — works with the app closed. **Off unless a
  provider is configured** (`NOTIFY_EMAIL_PROVIDER=sendgrid` + `SENDGRID_API_KEY`); otherwise every call
  reports `configured:false` and nothing is sent — never a fake "it works".
- **Device (best-effort, on-device).** The client computes the *same* digest from local stores and raises a
  local `Notification` when the app is opened in the send window. Permission is requested explicitly and
  denial is handled gracefully (falls back to the in-app line + the email channel). Clearly labelled as
  device-local so nobody mistakes it for guaranteed delivery.

## Backend
- `config.notify` (emailProvider / from / runToken / cronEnabled). `Account.notify` subdoc (opt-in, all off):
  email.enabled, categories, expiryDays, sendHour, quiet hours, snoozeUntil, recipient, lastSentDay.
- `services/pwaNotifyService.js` (pure helpers exported for tests): `buildDigest` (parses inventory/claims/
  tasks blobs → expiring ≤N days, overdue open claims w/ outstanding, high/overdue tasks; caps lists;
  tolerates corrupt JSON), `isDue` (enabled + snooze + quiet hours + send window + once-per-day via London
  time), `londonParts`, `digestToText/Html`, and DB orchestration `previewForAccount` / `runForAccount`
  (marks lastSentDay in-window; sends via the existing `emailService`) / `runDue` (sweep).
- `routes/pwaNotifyRoutes.js`: `GET/PUT /prefs` (PUT is owner/manager — staff 403; values clamped), `GET
  /preview` (compute, no send), `POST /run` (shared-secret `x-notify-token`; **404 unless NOTIFY_RUN_TOKEN
  set** so an external scheduler drives reliable delivery on a dyno that can sleep). Mounted in routes index.
- `jobs/index.js`: opt-in in-process 15-min sweep when `NOTIFY_CRON=true` (only reliable while awake).

## Frontend
- `lib/notifications.js` (pure core tested): device prefs (local, not synced), `ensurePermission`,
  `summarise`/`buildLocalDigest` (reuses `worstExpiry`, `claimOutstanding`, OPEN_* statuses so both channels
  agree), `shouldShow` (same due logic, device-local time), `maybeNotify` (once/day, in-window, non-empty →
  `registration.showNotification`). Called on app open from `HomePage`.
- `lib/notifyClient.js` (transport-injectable): email prefs/preview over the API.
- `components/account/NotificationsView.jsx`: two sections — This device (toggle w/ permission, categories,
  send time, quiet hours, snooze, "right now would show…") and Email digest (owner/manager; shows a
  **not-configured** notice honestly; recipient, categories, time, quiet hours, live preview).
- `sw.js` v4→v5: `notificationclick` focuses/opens the app.
- HomePage: "Notifications" row in Settings (all roles — device prefs are per-person).

## Verification
- FE **195/195** (+7: summarise, category toggles/empty, shouldShow window/quiet/snooze, prefs round-trip).
  Build clean; cache v5.
- BE: app + jobs load; `pwaNotify.test.js` (pure, 11) green offline. DB-gated `pwaNotify.integration`
  (prefs default/update/clamp, staff-403, preview, /run 404-without-token, 401) runs on the founder's Mongo.

## Setup / deploy (explained, not assumed)
- Email channel: set `NOTIFY_EMAIL_PROVIDER=sendgrid` + `SENDGRID_API_KEY` (+ `NOTIFY_FROM_EMAIL`) on Render.
- Reliable scheduling: set `NOTIFY_RUN_TOKEN` and point an external scheduler (Render Cron / cron-job.org /
  GitHub Action) at `POST /api/pwa-notify/run` with header `x-notify-token`. `NOTIFY_CRON=true` is the
  in-process alternative (only if the instance stays awake). Device notifications need no server config.

## Not built (stated plainly)
- **Web Push (VAPID)** — true push to a closed browser — is deliberately not included; it's a separate infra
  surface (VAPID keys, subscription storage, push encryption). Email is the reliable closed-app channel; the
  device channel is opportunistic. A clean follow-up if the pilot wants browser push.

## Commit
`feat(pwa): daily digest notifications — email (server) + device (#6)`
