# 2026-09-30 — Audit F10: user-controlled service-worker updates

Back to [[Work-Log]] · Related: [[2026-09-30-Accounts-Live]] (SW v1→v2 + auto-reload)

## Problem
The SW called `self.skipWaiting()` on install and the client force-reloaded on `controllerchange`, so a
new deploy could reload the page **out from under a shopkeeper mid-form**. That auto-reload was added to
stop shops getting stuck on a stale cached build — but it traded one problem for another (F10).

## Fix — the standard non-disruptive "Refresh to update" flow
- `public/sw.js`: removed `skipWaiting()` from `install`. The new worker now **waits** instead of taking
  over immediately. Kept the `SKIP_WAITING` message handler and `clients.claim()` on activate. Bumped
  `CACHE_VERSION` v2 → **v3**.
- `src/pwa.js`: replaced the unconditional reload with a **user-controlled prompt**. A persistent,
  dismissible toast ("New version of Vendora is ready" + **Refresh** button) appears when an update is
  installed and waiting. Tapping Refresh posts `SKIP_WAITING` to the waiting worker → it activates →
  `controllerchange` → one guarded reload. Also checks `registration.waiting` on load (an update from a
  previous visit). Built with `React.createElement` so the `.js` file needs no JSX transform.
- Guard: reload on `controllerchange` only when a controller already existed at load (`hadController`),
  so the very first install (which claims the page) does **not** trigger a spurious reload/loop.

## Result
Updates are prompt-driven — they never interrupt work — and can't get stuck stale: if the user ignores
the prompt, the waiting worker still activates naturally the next time the app is fully reopened.

## Verification
Build clean. (SW update behaviour is runtime/browser-only — not unit-tested; verified by build + code
review. Founder can confirm on the live site: after this deploy, a subsequent deploy should show the
Refresh toast rather than an abrupt reload.)

## Commit
`fix(pwa): audit F10 — user-controlled SW update prompt instead of forced reload`
