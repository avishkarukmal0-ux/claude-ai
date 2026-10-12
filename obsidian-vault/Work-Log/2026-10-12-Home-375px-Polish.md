# 2026-10-12 — /home 375px polish (live audit)

Back to [[Work-Log]] · [[Home]] · related: [[2026-10-12-Tokens-Reskin]]

**Domain(s):** home shell (HomePage), TodayActions, manifest
**Branch:** `claude/vendora-pos-v3-KPnI0` · base: `5b829b9`

## Changes (owner's live-audit list, phone 375px; no logic changes)
1. **Tap targets ≥ 44px** via padding/hit-area, visuals kept: Snooze `w-9→w-11`; header `Change` + new `Account`
   links `min-h-44` + px; promises `Got it` `-m-2 p-2 min-h-44`; demo-banner `Exit demo` and
   `Log in / Create shop` `min-h-44`.
2. **No ellipsis on action cards** — `TodayActions` title/detail `truncate` → `line-clamp-2` (wrap to 2 lines).
3. **Authenticated header** shows an `Account` link (sign out lives on `/account`); the signed-out
   `Log in / Create shop` CTA is already hidden when logged in.
4. **Min content font ≥ 12px** (`text-xs`): Hub tile descriptions, More row subtitles, Quick-tool taglines,
   TodayActions detail + money chip. Numeric COUNT badges (NavTab `9px`, Row `10px`) left as decorative
   indicators (not readable prose) — documented exception.
5. **Quick Tools "See all"** — a `See all / Show less` toggle switches the horizontal carousel to a 2-col grid
   so every tool is reachable without side-scrolling.
6. **manifest shortcuts** — Scan / Stock check / Buy (real PWA tabs; `HomePage` reads `?tab=`). `New sale` from
   the audit list was NOT added: the sale/till flow is deferred, so a shortcut would dead-end.
7. **Visually-hidden `<h1>`** ("Vendora — <shop> home") added to `/home` (was heading-less; sections are h2).

Touched controls also moved to `focus-visible` rings.

## Verification
- **FE 463/463 + production build green.**
- **Not performed here:** the acceptance's live 375px re-audit + runtime console check — needs a real browser
  (no `playwright` npm in this project). Do it on production/preview after deploy. Everything else verified by
  source + build.

## Follow-ups
- [ ] Owner: redeploy Vercel, then re-run the 375px audit + console check in a browser.
- [ ] Optional: raise the two numeric count badges if a stricter "no text <12px" rule is wanted (layout check).
