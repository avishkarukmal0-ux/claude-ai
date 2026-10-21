# 2026-10-21 — Boot watchdog: blank screen → visible error + self-heal

Back to [[Work-Log]] · [[Home]]

**Domain(s):** [[Frontend-Overview]] — app shell / PWA boot
**Branch:** `claude/vendora-pos-v3-KPnI0`

## Problem
Owner reported the app showing **nothing** (blank, no icons), still blank on a fresh/incognito load. I could
not reproduce: the production build renders the full flow (front door → onboarding → Today home) with **zero
errors**, with AND without the exact production CSP applied; Vercel production is READY on the latest commit
`0196272`; the built `index.html` is CSP-clean. The sandbox proxy blocks the live `*.vercel.app` and
`*.onrender.com` hosts, so I cannot load the owner's actual live instance or see their console — the one piece
of ground truth needed.

## Fix shipped (make the blank screen diagnose itself)
`public/boot-check.js` — a tiny dependency-free **classic** script (CSP-safe: 'self', no inline) referenced in
`index.html` BEFORE the app module, so its handlers arm first. It captures the first `error`/`unhandledrejection`
and runs a 10s watchdog; if the React app never mounts (`#root` stays empty) or an error fires, it renders the
captured **error message + stack** into the page plus two buttons: **Reload** and **Clear app data & reload**
(unregisters the service worker + clears Cache Storage, then reloads). Does nothing once the app mounts.

Verified headlessly with the production CSP applied:
- Normal load → app mounts, panel never shows.
- Broken entry chunk (simulated) → panel shows "Vendora couldn't start · resource: Failed to load …index-….js"
  with the two buttons.

This converts a blank screen into (a) the actual error, visible on the owner's phone (screenshot-able), and
(b) a one-tap self-heal that fixes a stuck/stale service-worker or corrupt-cache case directly.

SW `CACHE_VERSION` v65 → **v66** (index.html + new asset changed).

## Still unknown (needs the owner's device)
Root cause of the owner's blank screen is not yet identified — everything reproducible is healthy. Once this
deploys, the owner should see either a normal app or the new error panel; the panel's text (or tapping
"Clear app data & reload") tells us which: a stale SW/cache (self-heals) vs a live-only runtime/asset error
(the stack points at it).

## Commit(s)
- `3a0a530` — feat(pwa) boot watchdog.

## Follow-ups
- [ ] Owner: report what the panel says, or whether "Clear app data & reload" fixes it.
