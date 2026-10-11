# 2026-10-11 (part 17) — Audit batch 9: frontend P2s (D4, D5, F5, F6)

Back to [[Work-Log]] · [[Home]] · prev [[2026-10-11-Audit-Fixes-Batch8-B3-B4-B5]]

**Domain(s):** Claims/credit · Orders · Form drafts · Images
**Branch:** `claude/vendora-pos-v3-KPnI0`

## Fixed (P2; all offline-verified)
- **D4 — credit-note allocation could succeed on the note while the claim write failed.** `claimStore.persistAll`
  discarded the `persist` result and `applyCredit` returned the claim object regardless, so the view's `if (!applied)`
  rollback never fired → the note showed credited while the claim never recorded it. `persistAll` now returns the
  write result and `applyCredit` returns `null` on a failed write (the view then rolls the allocation back).
- **D5 — duplicate order rows double-counted one receipt.** `receiveAgainst` matched the SAME receipt for every
  duplicate line (`receipts.find`), so two rows of 5 + a receipt of 5 recorded 10. Now each receipt's qty is
  **consumed once** across matching lines (fill up to ordered; negative un-receives), so it records 5 / remaining 5.
- **F5 — a mounted form kept shop A's typing across an account switch and could save it into shop B.** The draft
  key is workspace-scoped, but the autosave used the *live* workspace, so A's in-memory state got written under B's
  key. `useFormDraft` now listens for `WORKSPACE_EVENT` and resets the mounted state to the NEW workspace's draft
  (or initial) on a switch; A's draft stays under A's key.
- **F6 — a failed modern decode returned the ORIGINAL bytes (EXIF/GPS retained).** Added an `<img>`+2D-canvas
  fallback that also strips metadata, used when `createImageBitmap`/`OffscreenCanvas` aren't available, before
  degrading to the original. Bails early (and never hangs) when 2D canvas is unusable (jsdom), preserving the
  graceful-degrade contract.

## Verification
- `claims.test` +1 (D4 null on failed write), `orders.test` +1 (D5 single-consume), `formdraft.test` +1 (F5 reset),
  `image.test` unchanged-contract (F6). FE full suite **410/410** + build green.

## Commit(s)
- `fix(audit D4/D5/F5/F6): credit rollback, receipt no double-count, form reset on switch, image fallback strips metadata`

## Remaining audit backlog
- [ ] **F2/F4 (P2)** — image pipeline: pending photo work recreating data after logout (session-pin, like F1);
      photo trash/restore durability (commit-before-delete, like F3).
- [ ] CI workflow (build + FE tests + DB-backed PWA integration) + reachable dependency advisories.
