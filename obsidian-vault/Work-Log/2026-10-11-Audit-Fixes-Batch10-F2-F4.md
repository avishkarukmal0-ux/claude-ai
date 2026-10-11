# 2026-10-11 (part 18) — Audit batch 10: image pipeline P2s (F2, F4)

Back to [[Work-Log]] · [[Home]] · prev [[2026-10-11-Audit-Fixes-Batch9-FE-P2]]

**Domain(s):** Product images (capture / trash / restore)
**Branch:** `claude/vendora-pos-v3-KPnI0`

## Fixed (P2)
- **F2 — a pending photo save could recreate a shop's private data after logout.** `saveImage` pinned the
  workspace (FE1) but didn't re-check the session after the async processing, so a save completing AFTER a
  logout/account-switch (which purges that shop's workspace) recreated the photo there. Now it pins the SESSION
  (token + shop id) at entry and CANCELS the write if the session changed (signed out / switched). A bare
  workspace change with the SAME session (guest/demo) still writes to the pinned ws (FE1 preserved — no leak, no
  lost photo).
- **F4 — a failed trash write deleted the originals; a partial restore discarded the only full copy.**
  `removeImage` now COMMITS-BEFORE-DELETE: it removes the originals ONLY after the trash copy persisted; on a
  failed trash write it keeps the originals and returns `ok:false` (and `ProductImage.doRemove` honours that —
  keeps the ref + server copy, tells the owner). `restoreImage` keeps the trash unless the FULL (the only
  full-quality copy) actually restored, so a partial restore (thumb ok, full failed) no longer loses the full image.

## Verification
- `productimages.test` +2 (F2 sign-out-mid-save cancels; F4 failed-trash keeps originals) → **17/17**; FE1 pin test
  still passes. FE full suite **412/412** + build green.

## Commit(s)
- `fix(audit F2/F4): cancel photo save on session change; commit-before-delete in image trash/restore`

## Status — audit backlog nearly clear
All 8 P1s + all P2s (D1,D4,D5,D6,D7,F2,F4,F5,F6,F8,F9,B3,B4,B5) now addressed. Remaining: the CI workflow + the
reachable dependency advisories (audit §"Dependency and release observations").
