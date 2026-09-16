# 2026-09-14 — M0: PWA installability foundation

Back to [[Work-Log]] · Related: [[Implementation-Roadmap]] · [[App-Kickoff]] · [[Frontend-Overview]]

## Goal
Start **M0 (Foundations)** from [[Implementation-Roadmap]]: make the existing Vite/React frontend an **installable PWA** so Vendora can be added to a phone home screen and open offline — the shell the whole Phase-1 app sits on.

## What changed (files)
- 🆕 `frontend/public/manifest.webmanifest` — name/short_name, `standalone`, portrait, brand `#2563EB`, `start_url=/?source=pwa`, 3 icons (192, 512, 512-maskable).
- 🆕 `frontend/public/sw.js` — service worker. `/api` + `/socket.io` always network (live data/realtime never cached); navigations network-first with offline `/index.html` fallback; other same-origin GETs stale-while-revalidate. `CACHE_VERSION='vendora-v1'`.
- 🆕 `frontend/public/icon-192.png`, `icon-512.png`, `apple-touch-icon.png` (180, rounded) — Vendora chevron-"V" mark on brand blue, generated with a no-dependency Node/zlib PNG encoder (script in scratchpad; **no npm dep added**).
- 🆕 `frontend/src/pwa.js` — `registerServiceWorker()`; **production-only** (guards `import.meta.env.PROD`) so dev never serves stale cache; toasts when a new version is waiting.
- ✏️ `frontend/index.html` — manifest link, apple-touch-icon, `apple-mobile-web-app-*` + `mobile-web-app-capable` meta, `viewport-fit=cover`.
- ✏️ `frontend/src/main.jsx` — import + call `registerServiceWorker()` after render.

## Decisions / gotchas
- **Manual PWA, no `vite-plugin-pwa`.** Keeps zero new build deps (no-capital rule) and the SW logic explicit. Reconsider the plugin only if precache-manifest hashing becomes painful.
- **PNG icons hand-generated** (no ImageMagick/sharp/converters in env). iOS Safari needs PNG (ignores SVG + manifest icons), and iPad-first is the device story — so PNG matters.
- Reverted incidental `package-lock.json` churn from the verify install (no dep changed).

## Verification
- `npm run build` ✓ (pre-existing api.js dynamic-import warning only, unrelated).
- Served the prod build via `vite preview` and confirmed: `/manifest.webmanifest` → `application/manifest+json`, standalone, 3 icons; `/sw.js` → `text/javascript`; all 3 icons → `200 image/png`; index head carries manifest + apple-touch + apple-mobile meta. **Install criteria met** (manifest + 192/512 icons + standalone + start_url + service worker).

## Follow-ups (rest of M0)
- Mobile-first shell/nav (owner vs worker) + an app-home landing route.
- Confirm auth + store-picker (already built) feel right at phone width.
- Nice-to-have: an in-app "Add to Home Screen" prompt (capture `beforeinstallprompt`).
- Later polish: richer maskable icon padding; screenshots in manifest for the install dialog.

## Commit
- feat(pwa): installable PWA foundation — manifest, service worker, icons (M0)
