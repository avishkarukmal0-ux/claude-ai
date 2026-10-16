# Sync load test (`sync-load.js`)

k6 load test for `/api/pwa-sync`, sized for scale readiness: ~100 shops × 5–7 devices (~500–700 virtual
devices) doing the real poll/push cycle.

## ⚠️ Staging only

This **registers accounts and writes sync blobs**. Point `BASE_URL` at a **staging** deployment, never
production. The script's init guard refuses the known production host (`vendora-api-5pyt.onrender.com`) and
aborts before spinning any VUs.

## Install k6

k6 is a single static binary (not an npm package) — see https://grafana.com/docs/k6/latest/set-up/install-k6/
(`brew install k6`, `choco install k6`, the Docker image `grafana/k6`, or the Linux apt repo).

## Run

```bash
# full target: 140 shops × 5 devices = 700 virtual devices, hold 3 minutes
k6 run -e BASE_URL=https://YOUR-STAGING.onrender.com \
  vendora-pos/backend/scripts/loadtest/sync-load.js

# smaller smoke run first
k6 run -e BASE_URL=https://YOUR-STAGING.onrender.com -e SHOPS=20 -e DURATION=1m \
  vendora-pos/backend/scripts/loadtest/sync-load.js
```

Env knobs: `SHOPS` (default 140), `DEVICES_PER_SHOP` (5), `DURATION` (3m), `ITEMS` (200 inventory items per
shop — payload realism), `PUSH_PROB` (0.2 — ~1 edit per 5 cycles). VUs = `SHOPS × DEVICES_PER_SHOP`.

If your k6 version needs a longer setup window for the registration loop, add `--setup-timeout 180s`.

## What it does

- **setup**: registers `SHOPS` shops and seeds each with one `inventory_v1` blob (so pulls transfer realistic
  data and the delta/304 path engages). All devices of a shop share the shop's token → they share the one
  per-shop rate-limit bucket, exactly as in production.
- **per device (VU)**: every cycle does a **delta pull** (`?revs=…` + `If-None-Match`, so idle polls return a
  tiny 304), and with `PUSH_PROB` an **inventory push** (concurrent across a shop's devices → exercises
  last-write-wins). Sleeps 1.5–3s between cycles, which keeps each shop well under the 300 req/min sync cap.

## Pass criteria (thresholds, enforced by k6)

| Metric | Threshold |
| --- | --- |
| `http_req_duration` | p(95) < 500ms |
| `http_req_failed` | rate < 1% |
| `sync_429s` (custom) | count < 1 (zero 429s for normal use) |
| `checks` | > 99% pass |

k6 exits non-zero if any threshold fails, so this is CI-able against staging.

## Cleanup

The run leaves `loadtest+<run>@example.com` accounts and their blobs on staging. Remove them with a
staging-only script matching `/^loadtest\+/`. **Never run cleanup against production.**
