# 2026-09-30 — Stage 7: Simpler interface (Today/Scan/Stock/Buy/More)

Back to [[Work-Log]] · Related: [[2026-09-30-Staff-Tasks-Handover]] · [[ADR-002-App-Till-Separation]]

## Goal
Tie the six workflows into one coherent, one-handed app; remove marketing clutter and any promise
the app can't keep.

## What shipped
- **5-tab IA** (replaces the flat ~18-tile grid; reuses every workflow screen):
  - **Today** — "Do this today" actions + morning glance + quick tools.
  - **Scan** — hub: Receive delivery / Count stock / Expiry & waste.
  - **Stock** — inventory + quick chips (Count / Refill / Slow stock).
  - **Buy** — hub: Buy list / Orders / Suppliers / Supplier claims / Price changes.
  - **More** — grouped: Money (takings, owner glance) · Team (tasks, staff view, from-the-team) ·
    Data (backup export/restore) · Settings (change shop type, log in). Task/flag badges on the tab.
- **Onboarding promises** show once, dismiss with "Got it", stay gone.
- **Honest copy**: removed "Your HMRC (MTD) filing just happens" → "Never miss an MTD or licence
  deadline"; MTD tool now says it tracks dates (you still file); mtd module relabelled.
- **Unfinished (live:false) modules** no longer clutter the workflow — hubs list live screens only.
- **"Do this today" snooze**: per-day X hides a reminder for today WITHOUT changing any records; it
  returns tomorrow if the condition still holds.

## Verification (actual)
- Full FE suite **70/70**; build clean (PWA initial chunk 220 KB / 55 KB gzip; till stays lazy).
- E2E (headless Chromium 390×844, prod build): five tabs; promises dismiss & stay gone; snooze hides
  an action and leaves inventory untouched; Scan→Receive, Buy→Orders, More groups, Stock chips all
  work. No page errors.

## Data preserved
UI-only change + honest copy. New app-level flags `vendora:onboarded` and `vendora:today_dismissed`.
No business records touched.

## Status — Phase-1 core (Stages 1–7) complete
Six dependable, tested, E2E-verified workflows in one coherent app. Remaining: later additions
(customer requests, invoice extraction, till CSV import, monthly outcomes) and the infra blockers
(auth accounts, IndexedDB, multi-device sync, server reminders/push) — documented in
[[ADR-002-App-Till-Separation]], not faked.

## Commit
`feat(app): simpler interface — Today/Scan/Stock/Buy/More + honest copy (Stage 7)`
