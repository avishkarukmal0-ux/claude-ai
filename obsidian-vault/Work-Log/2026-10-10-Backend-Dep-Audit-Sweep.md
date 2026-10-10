# 2026-10-10 (part 4) — Backend dependency security sweep (non-breaking)

Back to [[Work-Log]] · [[Home]]

**Domain(s):** [[Deployment-Config]] · Backend
**Branch:** `claude/vendora-pos-v3-KPnI0`

## Goal
Render build log flagged 18 prod-dep vulnerabilities (1 low, 8 moderate, 8 high, 1 critical). Clear everything a
**non-breaking** `npm audit fix` can, without `--force`; leave the breaking majors for separate, tested changes.

## Changes
- `vendora-pos/backend/package-lock.json` only (**`package.json` unchanged** — all bumps were within existing
  semver ranges). `npm audit fix` (no `--force`) applied:
  - **Critical:** `proxy-addr` 2.0.7 → 2.0.8 (IP-spoof via IPv4-mapped IPv6; reachable via Express `trust proxy`).
  - **High:** `ip-address` → 10.7.3, `joi` → 17.13.8 (reachable — request validation, 19 files), `engine.io` →
    6.6.11, `ws` → 8.21.3, `socket.io-parser` → 4.2.7, `form-data` → 4.0.6, `axios` 1.18.1 → 1.20.0.
  - **Moderate:** `qs` → 6.16.0, `mongoose` → 8.24.5, `moment` → 2.31.0, `morgan` → 1.12.1, `body-parser` → 1.20.8.
  - Result: **18 → 5** remaining, all requiring a breaking major (left for Step 2/3).

## Verification
- `package.json` diff: **none** (lockfile-only).
- `node -e "require('./src/app.js')"` → loads OK.
- Backend DB-free suites **pass** (neighbourhood 21, billing, imd, insights×3, money, pwaNotify, pwaStoreAccess,
  refundService, invoiceOcr, productLookup, utils, validateSecrets). The 5 failing suites (auth, cashDrawer,
  lossPrevention, products, sales) fail **only** because `mongodb-memory-server` can't download a mongod binary
  (`fastdl.mongodb.org` egress blocked in the sandbox) — a pre-existing environment limitation, unrelated to the
  bumps. **Not fully verified yet:** those DB-backed suites + a live Render boot are owner-run.
- Frontend untouched (backend-only lockfile change).

## Remaining (breaking — NOT done; need review + tests, owner approval)
- **`nodemailer` 6.9.8 → 10.x (HIGH)** — the SMTP sender (Brevo). Major jump across v7–v10 with API changes;
  can't live-test email from the sandbox, so pending a tested branch + owner send check.
- **`csv-parse` 5 → 7 (moderate)** — used by the IMD import + sales import; API change.
- **`uuid` 9 → 14 / `node-cron` 3 → 4 (moderate)** — API changes.
- **`qs`** moderate advisory still shows via a held parent path even after the sweep.

## Commit(s)
- `chore(backend): npm audit fix (non-breaking) — clear critical proxy-addr + 7 highs + moderates`

## Follow-ups
- [ ] Owner: redeploy Render; confirm the build-log vuln count drops to 5 and the app boots.
- [ ] Step 2 (nodemailer major) and Step 3 (csv-parse/uuid/node-cron) as separate tested changes on approval.
