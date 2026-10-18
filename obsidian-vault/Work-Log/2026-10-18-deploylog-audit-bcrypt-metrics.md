# 2026-10-18 — Deploy-log follow-ups: prod audit, native bcrypt, traffic/mem metrics

Back to [[Work-Log]] · [[Home]]

**Domain(s):** [[Backend-Overview]] — deps/CI, password hashing, observability
**Branch:** `claude/vendora-pos-v3-KPnI0`

Three findings from the `c81938c` Render deploy log.

## 1 — Prod dependency vuln + CI gate
`npm audit --omit=dev` flagged **compression ≤1.8.1 (high, DoS memory leak, GHSA-vc2v-76pw-4v95)** and
**on-headers <1.1.0 (GHSA-76c9-3jph-rj3q)**. `npm audit fix` bumped compression 1.7.5 → **1.8.2** (pulls the
fixed on-headers; the nested vulnerable copy is gone) — prod audit now **0 vulnerabilities**. Added a CI step
**`npm audit --omit=dev --audit-level=high`** to the backend job so a shipping build with a HIGH runtime vuln
fails the check (dev-only advisories, e.g. jest's tree, are excluded).

## 2 — Native bcrypt (login no longer stalls the event loop)
`bcryptjs` is pure JS: its ~142ms/hash runs ON the single worker's event loop, so a morning burst of ~500 staff
logins stalls sync. Switched **Account + Member** hashing to **native `bcrypt`**, whose `hash`/`compare` run on
libuv's threadpool — the event loop stays free for sync during a login burst. Hash format is identical
(`$2a`/`$2b`), verified both ways (a bcryptjs `$2a` hash verifies under native bcrypt and vice-versa), so every
existing password still logs in. `bcryptjs` stays a dep (the dormant till `Staff` model still uses it).
- **bcrypt@6.0.0, not 5.1.1:** 5.1.1 drags in `@mapbox/node-pre-gyp` → vulnerable `tar` (critical), which the
  new CI gate would fail; 6.0.0 uses the fixed node-pre-gyp 2.x. "Breaking" only means Node ≥18 (we're on 20).
  Prebuilt linux-x64 binaries exist for Node 20/22, so Render + CI install without compiling.

## 3 — Observability
- **RSS after the OA-centroid warm** (188,880 entries): the warm line now ends `· rss=NNNMB` so headroom on the
  512MB instance is visible right after the big load.
- **Periodic traffic line** (`requestLogger.js`): aggregates every request and emits ONE info line per window
  (`METRICS_WINDOW_MINUTES`, default 5): `traffic: N req / 5m · p95=Xms · 4xx=.. 5xx=.. · rss=NNNMB`. So the
  ping/traffic and memory are visible without logging every 200 (2xx/3xx stay at debug). Buffer capped at 50k
  samples/window; the interval is `unref()`'d and disabled under the test runner.

## Verification
- Backend boots clean (native bcrypt loads). **`npm audit --omit=dev --audit-level=high` → exit 0.**
- Unit: new `requestMetrics.test.js` (2) + `scaleHardening`/`pwaStoreAccess`/`pwaNotify` → **31** green. DB-gated
  pwa-auth integration (login via native bcrypt) runs in CI with Mongo. Frontend untouched.
- ⚠️ Native bcrypt build: verified it installs on linux-x64 here; Render/CI are the same platform, but watch
  the first Render deploy log to confirm the prebuilt binary resolves (falls back to a compile if not).

## Commit(s)
- `9eb8e9f` — fix(backend) + CI + docs.

## Follow-ups
- [ ] Confirm the next Render deploy installs bcrypt's prebuilt binary cleanly (no compile failure).
- [ ] After a day live, read a `traffic:` line to size the instance / confirm p95 under load.
