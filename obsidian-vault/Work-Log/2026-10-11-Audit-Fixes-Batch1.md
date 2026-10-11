# 2026-10-11 (part 9) — External audit response, batch 1 (quick/safe fixes)

Back to [[Work-Log]] · [[Home]]

**Domain(s):** Neighbourhood · Welcome/account · Tests
**Branch:** `claude/vendora-pos-v3-KPnI0`

## Context
Owner shared a third-party PWA audit (`Vendora-audit.md`) against snapshot `fea515b`: **22 findings (8 P1, 14 P2)** +
2 repo test failures + CI/dependency notes. Started with the quick, high-confidence, low-risk items; the heavier P1s
(F10 offline precache, F1/F3/D2/D3 durability/atomicity/session-binding, B1/B2 concurrency) are planned next.

## Fixed in this batch
- **F7 (P1 — data loss):** removed the **unconditional boot-time guest-data purge** from `main.jsx` (it could delete
  unmigrated guest data despite the account UI promising nothing is deleted — the fixture: a shop with only a shop_type
  set made `workspaceHasData` true and triggered the wipe). Not needed: `ensureSignedOutSampleMode` already keeps the
  welcome space on SAMPLE data, so no deletion is required. `purgeStaleGuestData` stays exported for a future EXPLICIT,
  user-confirmed migrate/discard flow. (guest-purge unit tests still pass — the function is unchanged, just not auto-run.)
- **F9 (P2):** `NeighbourhoodAreaCard` "Get" button was `onClick={load}`, passing the click event as the `force`
  argument → every lookup force-refreshed (bypassed cache). Now `onClick={() => load()}`.
- **F8 (P2):** `RadiusFigures` labelled the shown figures with the *current* radius even while the previous result was
  still on screen during a radius change. Now it labels with `profile.radiusM` (the radius the figures were actually
  computed for), falling back to the prop only when absent.
- **Repo test #2 (neighbourhood):** `pwaNeighbourhood.integration` expected `referenceDate === 'Census 2021'`, but the
  service builds the figure from its catalog as `'Census 2021 (21 Mar 2021)'`. Updated the expectation to the documented
  format (audit-recommended; data unaffected).
- **Repo test #1 (Stripe signed webhook):** the test sent `Buffer.from(payload)` under a JSON content type, so superagent
  re-serialised the bytes and the raw-body signature check failed spuriously (the real route returns 200 — a test
  transport defect, not a signing outage). Now sends the exact signed JSON string. *(DB-gated — not runnable in the
  sandbox; fix matches the audit's finding and keeps the positive + forged assertions.)*

## Verification
- FE full suite **400/400** + build green; SW bumped **v11→v12**.
- BE insightsData/service/geo/neighbourhood **63 passed** (+5 DB-skipped) + app loads.
- The two repo-test fixes target DB-gated suites (need `VENDORA_TEST_URI` + Stripe keys) — verified by inspection against
  the audit's evidence, not runnable here.

## NOT yet done (planned — see follow-ups / the audit's fix sequence)
- **F10 (P1):** first offline reload can be blank — the service worker precaches only the shell, not the hashed JS chunks
  / modulepreloads. Needs the SW to precache the full built asset graph (generate the list at build time).
- **F1/F3/D2/D3 (P1):** bind async ops to a session generation (cancel on logout/switch); make compound inventory
  operations durably atomic/idempotent; commit replacement before deleting the previous durable copy.
- **B1/B2 (P1):** same-second billing lifecycle reconciliation; atomic logical-file version pointer for cloud backups.
- **P2 domain:** D1 (wrong-price claim total), D4 (credit-note claim-leg rollback), D5 (duplicate order rows double-count),
  D6 (report ignores `finishedAt`), D7 (report counts reversed waste); F2/F4/F5/F6 (photo/draft/identity); B3/B4/B5.
- Dependency advisories + a CI workflow (build+tests+DB integration) — audit §"Dependency and release observations".

## Rollback
- `git revert <sha>` — isolated.

## Commit(s)
- `fix(audit): F7 remove unsafe boot guest-purge; F8/F9 radius display; fix 2 repo tests (+SW v12)`

## Follow-ups
- [ ] F10 offline precache (highest-impact P1, directly observed in production).
- [ ] Durability/atomicity/session-binding P1 batch (F1/F3/D2/D3).
- [ ] Concurrency P1 batch (B1/B2) + the P2 domain/report/claim fixes.
- [ ] Add CI (build + FE tests + DB-backed PWA integration); resolve reachable dependency advisories.
