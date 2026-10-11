# 2026-10-11 — Launch-readiness audit: three P2 defects closed

Back to [[Work-Log]] · [[Home]] · related: [[2026-10-11-UX-CX-Pass]] · [[2026-10-11-PWA-Polish-Pass]]

**Domain(s):** PWA service worker, invoices/credit-note recovery, orders/delivery
**Branch:** `claude/vendora-pos-v3-KPnI0` · base audited: `0f5b800`

## Goal
A launch-readiness audit reproduced 3 P2 defects (no P0/P1). Two were regressions from this session's own
work (L-D1 in the new recovery screen, L-D2 in the delivery/order completion touched for R10); L-F1 was a
long-standing SW-update edge. Validated each against the exact source, fixed each with a test.

## Fixes
| ID | Problem | Fix | Commit |
| --- | --- | --- | --- |
| **L-F1** | `pwa.js` captured `hadController` once; an update ACCEPTED in a first-visit tab hit the warm-only branch → Refresh never reloaded | extracted pure `decideControllerChange()` — consent reloads even a first-visit tab, first control warms, a controlled tab w/o consent is left alone; handler now flips `controlled` after first control | `5860f7a` |
| **L-D1** | recovery `reconcile` reapplied EVERY allocated row incl. already-consistent credits; `applyCredit` restamps the receipt date → money shifts month in period reports | `if (row.consistent) continue` — only correct mismatched rows, leaving good credits' id/date/period intact | `5860f7a` |
| **L-D2** | `receiveAgainst` persisted blindly + ran only in the fresh-apply branch → a failed `orders_v1` write left the order at receivedQty 0 while the delivery marked itself received, no repair on retry | `receiveAgainst` returns checked `{ok}` + idempotent by delivery id (`appliedDeliveries`); caller runs it every attempt, reports pending on failure (delivery stays draft), retry completes the order exactly once | `5860f7a` |

## Tests (fail on pre-fix code)
- `pwa-controllerchange.test.js` — 4 lifecycle cases incl. the L-F1 first-visit-tab-consent reload.
- recovery: a consistent credit's receipt `at` is unchanged after repairing a sibling row (L-D1).
- delivery repair: a failed order write leaves the delivery a draft + order at 0; a retry applies stock once,
  completes the delivery, and fulfils the order exactly once (L-D2).

## Verification
- **Frontend: 68 files, 463 tests** (was 457; +6) + production build green. Backend untouched.
- R10 document-retry behaviour and all rounds 1–5 audit fixes preserved.

## Launch gates still open (owner/infra — unchanged by this pass, recorded by the audit)
Signed-in production owner/manager/staff + isolation; real phone install/camera/offline-sync/update matrix;
billing/add-on provider test checkout + webhook secret confirmation; notifications/OCR/census provider
delivery; cross-device backup/disaster-restore; a small shop-owner pilot. Also: investigate the one-off ~25s
health-probe timeout (cold start) before rollout; substantiate or narrow the "MTD-ready" welcome claim; the
notification-worker crash-between-claim-and-send caveat remains documented.

## Follow-ups
- [ ] Owner: redeploy Vercel (no CACHE_VERSION change).
- [ ] Confirm CI green after push.
