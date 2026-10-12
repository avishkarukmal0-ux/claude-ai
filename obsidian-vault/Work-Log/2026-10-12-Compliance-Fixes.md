# 2026-10-12 — Compliance fixes (sourced review): MTD gating, vape/CBD, off-licence, fresh group

Back to [[Work-Log]] · [[Home]] · related: [[2026-10-12-Flows-Audit-Batch2]]

**Domain(s):** onboarding, quick tools, compliance config, shop types, markdown/use-by safety
**Branch:** `claude/vendora-pos-v3-KPnI0` · base: `a72a917`

## What & why
A sourced compliance review flagged that some tools/claims applied regardless of the shop's actual
circumstances (MTD shown to everyone; MUP to England shops; vape duty misstated as a retailer liability). Fixed
so Vendora only shows what actually applies, with the official source and a "last verified" date on every item.

### New foundation
- **`lib/businessProfile.js`** — entity (sole trader / Ltd), turnover band, nation. Pure `mtdApplies(profile)`
  is the single source of truth for MTD gating: **sole traders only**, over £50k from Apr 2026, over £30k from
  Apr 2027; Ltd (Corporation Tax) and unknown/under-£30k → never. Captured in onboarding ([[NichePickerPage]]).
- **`lib/temperatureLog.js`** + **`lib/refusalsLog.js`** — local-first, workspace-scoped stores (added to
  `STORE_NAMES` + backup `STORE_SHAPE`).
- Quick-tool gating upgraded: `getQuickToolsForShop({ familyId, memberId, profile })` with `hideForMembers`,
  `gate(ctx)` and module eligibility (a tool with no module requirement is shown subject to its gate).

### The six fixes
1. **MTD** — entity + turnover captured at onboarding; `mtd-countdown` tool and the `mtd-q` compliance item
   only show when `mtdApplies`. Welcome copy "MTD-ready" → "Tracks your key deadlines". The tool, if opened
   directly, explains who it's for instead of showing a deadline.
2. **Vape duty** — duty stated as paid **upstream** (manufacturers/importers/warehousekeepers), not the shop;
   output relabelled **"Est. pass-through"**; copy: unstamped stock before 1 Oct 2026 sellable to 31 Mar 2027,
   stamps required from 1 Apr 2027.
3. **Vape & CBD** — disposable-vape **ban** notice (illegal since 1 Jun 2025) + duty-stamp **countdown** to
   31 Mar 2027 in the tool; **MUP hidden** for the `vape-cbd` member.
4. **Off-licence** — nation picker (England/Scotland/Wales/NI) gates **MUP** (hidden in England/NI); new
   **Refusals log** tool (age-restricted families); **Vape duty hidden** for the `off-licence` member.
5. **Fresh group** — new **PPDS label** tool (Natasha's Law: name + ingredients + 14 allergens emphasised,
   print/share) and **Temperature log** (chilled ≤8°C / frozen ≤−18°C, out-of-range flagged); markdown now
   **refuses a past use-by from expiry+dateType itself** (not just the caller's `mustPull`) so expired
   hard-stop stock can never be marked down/sold.
6. **Last verified + official link** — shared `ComplianceNote` on every tool; `compliance.js` carries a
   `source` per item + `COMPLIANCE_VERIFIED` date, surfaced in the Compliance radar.

## Verification
- **FE 495/495 (+20 new) + production build green.** New suites: `businessProfile`, `compliance-gating`,
  `complianceLogs`; extended `markdown` (past-use-by block) and `quicktools-audit`.
- **SW v15→v16** so installed PWAs get the Refresh prompt for these changes.
- **Not performed here:** the live 375px / screen-reader re-audit (browser-only, no Playwright).

## Gotchas
- Same-tab store writes don't fire the `storage` event → new hooks must `setState` on write (persistAll),
  like `useMarkdownStore`. `Number('')` is `0`, so a blank temperature field had to be rejected explicitly.
- A quick tool with a `gate` but no `requiresModule` must still pass the module check (gate decides).

## Follow-ups
- [ ] Owner: redeploy Vercel (SW v16), then re-audit. Dates/links are indicative — re-confirm against GOV.UK/FSA
      each quarter and bump `COMPLIANCE_VERIFIED`.
