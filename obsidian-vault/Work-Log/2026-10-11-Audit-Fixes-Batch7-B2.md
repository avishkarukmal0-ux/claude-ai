# 2026-10-11 (part 15) — Audit batch 7: concurrent-backup safety (B2)

Back to [[Work-Log]] · [[Home]] · prev [[2026-10-11-Audit-Fixes-Batch6-B1]]

**Domain(s):** Cloud backup (GridFS) — invoice docs + product images
**Branch:** `claude/vendora-pos-v3-KPnI0`

## Fixed (P1 — last of the 8)
- **B2 — two simultaneous cloud replacements could delete BOTH new backups.** After uploading a new copy, the
  cleanup (`removeAllExcept`) deleted every version EXCEPT *this* upload's — so with two concurrent uploads of the
  same (account,fileId), each deleted the other's just-committed file → **zero surviving backups**. Replaced with
  **`removeOlderThan`**: using the GridFS `_id` (ObjectId) as a deterministic version pointer, cleanup deletes only
  versions ordered strictly BEFORE the one just committed — never a competing newer one. All concurrent writers
  agree on the greatest `_id`, so it always survives; a same-instant tie just leaves a harmless duplicate the next
  upload tidies — never zero. `findOwned` now returns the greatest-`_id` version (the authoritative one). Applied
  to **both** `pwaDocService` (invoices) and `productImageService` (images). (`remove` / explicit delete unchanged.)

## Verification
- Backend **app loads**; the backup integration suites load cleanly (16 tests, DB-gated → skipped here).
- **New DB-gated test** (`pwaDoc.integration`): two concurrent `upload`s of the same file → both ok → `download`
  returns a surviving copy (was 0 before). Runs on a real DB / CI (needs `VENDORA_TEST_URI`), not this sandbox.

## Rollback
- `git revert <sha>` — isolated (two services, same pattern).

## Status — ALL 8 audit P1s now addressed
F7, F10, D2, D3, F1, F3, B1, **B2** ✅ (+ the 2 repo-test blockers). Next: the P2 backlog + CI + dependency advisories.

## Commit(s)
- `fix(audit B2): concurrent backups keep the newest version (removeOlderThan, not removeAllExcept)`

## Follow-ups
- [ ] P2: D4, D5, F2, F4, F5, F6, B3, B4, B5.
- [ ] CI workflow (build + FE tests + DB-backed PWA integration); reachable dependency advisories.
