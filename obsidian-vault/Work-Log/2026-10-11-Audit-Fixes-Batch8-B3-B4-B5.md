# 2026-10-11 (part 16) — Audit batch 8: billing/notify P2s (B3, B4, B5)

Back to [[Work-Log]] · [[Home]] · prev [[2026-10-11-Audit-Fixes-Batch7-B2]]

**Domain(s):** Billing · Notifications
**Branch:** `claude/vendora-pos-v3-KPnI0`

## Fixed (P2)
- **B3 — a paid checkout WITHOUT our marker could grant Insights.** The mapper only rejected a *present-but-wrong*
  `metadata.kind`; an ABSENT kind slipped through. Now it REQUIRES `metadata.kind === 'insights_report'` (our own
  checkout always sets it), so a legacy/other paid `payment` checkout carrying the shop reference can't grant.
  (`billing/stripeBilling.js mapEvent`.)
- **B4 — overlapping digest workers could send duplicate emails.** The once-a-day guard read `lastSentDay`, then
  sent, then marked the day — two concurrent workers both passed the check. Now the day is **claimed atomically**
  (`Account.updateOne` sets `lastSentDay=today` only if not already today; exactly one worker wins), and the claim
  is **released on a send failure** so a transient SMTP error still retries on the next sweep (keeps audit S5).
  (`pwaNotifyService.runForAccount`.)
- **B5 — the email sender ignored `NOTIFY_FROM_EMAIL`.** `emailService.send` hard-read `SENDGRID_FROM_EMAIL`, so an
  install that set only `NOTIFY_FROM_EMAIL` reported configured but sent with no From. Now it uses the configured
  address (`config.notifications.from` → `NOTIFY_FROM_EMAIL` → `SENDGRID_FROM_EMAIL` → default), with an optional
  `from` override. (`emailService.js`.)

## Verification
- `billing.test` +1 (B3: absent marker → no grant) → billing green; `pwaNotify`/`emailService` suites pass (37
  passed, 6 DB-skipped) + app loads.
- B4's atomic claim is DB-gated (needs a real Mongo for the concurrency path); the fix is a standard
  conditional-update claim-and-release.

## Commit(s)
- `fix(audit B3/B4/B5): require insights marker; atomic digest once-a-day claim; honour NOTIFY_FROM_EMAIL`

## Remaining audit backlog
- [ ] P2 (frontend): D4, D5, F5, F6, F2, F4.
- [ ] CI workflow + reachable dependency advisories.
