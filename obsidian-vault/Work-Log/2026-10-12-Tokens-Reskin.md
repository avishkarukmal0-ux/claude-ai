# 2026-10-12 — Tokens-only re-skin ("Professional") + welcome fixes

Back to [[Work-Log]] · [[Home]] · related: [[Conventions]] · [[2026-10-11-UX-CX-Pass]]

**Domain(s):** design tokens (Tailwind theme), fonts, welcome screen (NichePicker), manifest
**Branch:** `claude/vendora-pos-v3-KPnI0` · base: `86c2c34`

## Scope
Owner supplied a precise tokens-only re-skin spec (their `design-references` folder was on a local Windows
drive, unreachable from this cloud session). Applied the spec's tokens + the 6 named welcome-screen fixes.
**No layout or business-logic changes; accent system + AA rules preserved.**

## Tokens
- **Fonts** (`tailwind.config.js` sans/mono, `index.html` Google Fonts): Poppins 400/500/600/700 for
  display/UI; IBM Plex Mono for labels/SKUs/prices. `display=swap` + system fallbacks so text is readable
  offline / pre-swap.
- **Semantic colours split FILL vs TEXT for AA** (the `-dark` variant is the text shade the app already uses
  via `text-*-dark`): success fill `#16A34A` / text `#15803D` (~5.0:1); warning fill `#D97706` / text
  `#B45309` (~5.0:1); danger `#DC2626` (~4.8:1); primary `#2563EB` kept (~5.2:1, pressed `#1D4ED8`). Added a
  promo `highlight #FECE14` (badges only; `#111827` text; never text on white).
- `src/styles/design-tokens.css` deliberately left untouched — it's the deferred **till's dark theme**, not the
  PWA's light Tailwind surface; the PWA's token system is the Tailwind config.

## Welcome screen (`NichePickerPage`)
1. "Log in" → full-width secondary button, `min-h 44px` (was a 41×17 link).
2. Category example lines: removed `truncate`; show first 2 members + "+N more".
3. Smallest welcome text 11px → 12px (`text-xs`).
4. Step-1 list centres vertically (`flex flex-1 justify-center`) so tall phones don't leave a big gap above
   the footer; footer stays pinned.
5. Cards/buttons → `focus-visible` rings (keyboard-only) + explicit `active:` states.
6. `manifest.webmanifest`: Scan / Stock / Buy shortcuts; `HomePage` reads an optional `?tab=` (additive,
   no-ops without it) so the shortcuts land on the right tab.

## Verification
- **FE 463/463 tests + production build green.** Contrast computed ≥ 4.5:1 for every text shade.
- **Not performed:** live 375px/desktop screenshots + runtime console-error check — the `playwright` npm
  package isn't installed in this project (only the Chromium binary), so I can't drive the live app here. The
  acceptance's screenshot/console re-check should be done in a browser after deploy (or on preview).

## Scope boundaries / notes
- Fix #3 ("nothing below 12px") applied to the **welcome screen** as specified; a blanket `text-[10/11px]` sweep
  across 40+ components is layout-risk and was NOT done this pass (flagged as future work).
- Radius/spacing scale in the spec: the app already uses a consistent `rounded-2xl` card system; I did not
  mass-rewrite component radii (would be a layout change). Tokens set where they apply.
- The welcome header still reads "MTD-ready" (launch audit L-review flagged this as a product-claims point) —
  left unchanged; it's a marketing-copy decision, not a token/UI fix.

## Follow-ups
- [ ] Owner: redeploy Vercel; then re-check 375px + desktop screenshots + console in a real browser.
- [ ] Decide on the "MTD-ready" wording; optional global ≥12px sweep.
