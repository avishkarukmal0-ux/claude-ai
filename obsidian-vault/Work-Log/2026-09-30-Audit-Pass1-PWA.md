# 2026-09-30 — Audit pass 1: PWA pilot fixes (F1, F6, D4, D2, F11)

Back to [[Work-Log]] · Related: [[2026-09-30-Till-Disabled-Pilot]] · audit: `uploads/6cbe3ee6-Vendora-Audit-2026-09-30.md`

## Scope
After gating the till off (pass 0), fix the audit's genuinely PWA-pilot-relevant items — the highest-value,
lowest-risk set. Verified each against code first.

## Fixes
- **F1 (High) — logout no longer undone by IndexedDB.** `storage.js`: added `NEVER_DURABLE` = {`vendora:auth`}.
  `initStorage` now (0) purges any stale auth key already in IDB, (1) never seeds it, (2) never restores it;
  `durableSet` skips it too. Auth lives in localStorage only, so a logout that clears localStorage stays
  logged out across reloads. 2 new regression tests (stale IDB auth purged + not restored; auth never
  seeded). FE durability suite 10/10.
- **F6 (High) — honest copy.** `AccountView.jsx`: "safe if you change phones" → "Your shop data is saved on
  this device. Cross-device sync is coming soon." (no false cloud-recovery promise; sync is Stage 3).
- **D4 (Med) — accurate compliance copy.**
  - `shopTypes.js`: promise "Age checks logged for you" → "Age-check & minimum-price tools at a tap" (the PWA
    age-check is a prompt tool, it does not log; the refusal log lives in the deferred till).
  - `MupCalculator.jsx`: now jurisdiction- + date-aware. Scotland 65p; **Wales 50p until 1 Oct 2026, then
    65p** (was hard-coded 65p — wrong for Wales on the audit date). Added a Scotland/Wales toggle, shows the
    current rate, and states England has no MUP. Still labelled a guide.
- **D2 (Med) — frontend security headers.** `vercel.json`: added CSP (default-src 'self'; frame-ancestors
  'none'; script-src 'self'; connect-src 'self' + Render API; style/font allow Google Fonts; img data:/blob:),
  X-Frame-Options DENY, X-Content-Type-Options nosniff, Referrer-Policy strict-origin-when-cross-origin,
  Permissions-Policy (camera=self for the scanner, others off). Verified the built index.html has only an
  external module script + Google Fonts, so strict script-src won't white-screen.
- **F11 (Med) — a11y.** AccountView inputs got `aria-label`s + `aria-invalid`; the error is `role="alert"
  aria-live`.

## Verification
FE full suite **110/110** (2 new); build clean. Not deployed by this session (auto-deploys on push).

## Deliberately deferred
- **F2–F5** storage robustness (make IDB authoritative, await commits, surface save failures, cross-tab) —
  bigger refactor; next pass.
- **F10** SW auto-reload can interrupt a form — accepted for now (it's what delivers fresh builds to the
  founder during the pilot; PWA forms are small/local-saved). Refine when convenient.
- All **till** findings (S/T) — till is gated off; fixed only if/when it's re-enabled.

## Commit
`fix(pwa): audit pass 1 — logout/IDB (F1), honest copy (F6/D4), CSP headers (D2), a11y (F11)`
