# 2026-10-12 — Re-audit (v24) final small fixes

Back to [[Work-Log]] · [[Home]] · related: [[2026-10-12-Reaudit-v22-Residuals]]

**Domain(s):** temperature log, tap targets, demo stock, onboarding profile, delete-undo
**Branch:** `claude/vendora-pos-v3-KPnI0` · base: `3491b43`

1. **Temperature** — an out-of-range reading now **requires a corrective-action note** (save is blocked until
   it's filled) and shows a persistent **"OUT of range" badge** in Recent readings.
2. **≥44px** — Expiry & waste "What is it?", Team tasks "Handover note", Vet medicines "SQP name", Import
   label check rows, Traceability select, Weigh & label select; PPDS & Traceability mode tabs 36→44.
3. **Demo stock** — **Off-licence** now shows drinks (lager/wine/vodka/tonic, with `abv`); **Vape & CBD** shows
   a full vape/CBD set (e-liquid, nic salt, pod kit, CBD oil) — no bread/milk. New per-member demo sets.
4. **Onboarding answers** — switching family now **clears answers that don't apply** to the new type
   (sellsAnimals / importsFood / festivalsOn), keeping the universal ones (entity/turnover/nation/employees).
5. **Delete → Undo** — verified: the delete toast's Undo calls `restoreProduct()` (id preserved); covered by the
   `batches` test "delete is undoable".

## Verification
- **FE 519/519 (+1) + build green.** New/updated tests: off-licence drinks + vape set, delete-undo (existing).
  **SW v24→v25.**
- **Not performed here:** live 375px/console re-audit — browser-only.

## Follow-ups
- [ ] Owner: redeploy Vercel (SW v25); re-audit v25.
- [ ] Optional leftover: per-product persistence of beef/fish/produce origin fields.
