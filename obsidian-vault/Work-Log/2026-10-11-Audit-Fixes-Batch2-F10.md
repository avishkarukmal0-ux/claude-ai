# 2026-10-11 (part 10) — Audit batch 2: F10 offline precache (no more blank first reload)

Back to [[Work-Log]] · [[Home]] · prev [[2026-10-11-Audit-Fixes-Batch1]]

**Domain(s):** PWA / Service worker · Offline
**Branch:** `claude/vendora-pos-v3-KPnI0`

## Finding (audit F10, P1 — observed in production 2/2)
First offline reload could show a **completely blank PWA**: the service worker precached only the shell
(`index.html`, manifest, icons) but **not the hashed JS/CSS chunks**, so offline the entry chunks (vendor-react,
vendor-ui, vendor-forms) failed and nothing rendered. The old `CACHE_ASSETS` message relied on the page posting its
asset URLs *after* load — a race that loses to an immediate offline reload.

## Fix (`public/sw.js`)
- On **install**, after the shell, fetch `/index.html` and **precache every same-origin JS/CSS/font it references** —
  the module entry, its `<link rel="modulepreload">` vendor chunks and the stylesheet (`precacheBuiltAssets`). Install
  `waitUntil`s it, so the worker only becomes ready once the entry graph is cached ("confirm completion before
  claiming offline readiness").
- Caching is **best-effort per asset** (`cachePut` never throws), and the shell list is now cached individually too,
  so one missing icon can't abort the whole install (previously `cache.addAll` was atomic).
- Kept the `CACHE_ASSETS` message handler (belt-and-braces for lazily-loaded route chunks filled in at runtime) and
  the stale-while-revalidate fetch path (serves the precached hashed assets via `caches.match`, which searches all
  caches). Still **no `skipWaiting`** — updates stay prompt-driven (the F10-of-old / F24 Refresh toast).
- SW bumped **v12→v13**.

## Verification
- Built `dist/index.html` references exactly: `index-*.js`, `vendor-ui-*.js`, `vendor-react-*.js`, `vendor-forms-*.js`,
  `index-*.css` — the regex `(?:href|src)="…\.(js|css|woff2?)"` captures all 5 (confirmed against the real build),
  i.e. precisely the chunks the audit saw fail offline.
- FE suite unaffected (**400/400**) + build green; `dist/sw.js` has `vendora-v13`.
- **Runtime offline behaviour is owner-verified** (service-worker install/offline isn't exercised by jsdom/Vitest) —
  the audit's acceptance step: fresh first online visit, then immediately reopen offline, on Android + iPhone.

## Rollback
- `git revert <sha>` — isolated (sw.js only).

## Commit(s)
- `fix(audit F10): precache the full built entry asset graph at install (no blank first offline reload) (+SW v13)`

## Follow-ups (remaining audit backlog, in order)
- [ ] F1/F3/D2/D3 — session-generation binding + durable atomic/idempotent inventory ops.
- [ ] B1/B2 — same-second billing reconciliation + atomic backup version pointer.
- [ ] P2: D1/D4/D5/D6/D7 (claims/credit/report/orders), F2/F4/F5/F6 (photo/draft/identity), B3/B4/B5.
- [ ] CI workflow (build + FE tests + DB-backed PWA integration); reachable dependency advisories.
