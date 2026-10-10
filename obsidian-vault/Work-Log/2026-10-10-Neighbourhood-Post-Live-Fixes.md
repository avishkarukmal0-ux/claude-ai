# 2026-10-10 — Neighbourhood: post-live fixes (attribution, qualifications, mid-year pop) + records

Back to [[Work-Log]] · [[Home]]

**Domain(s):** [[Deployment-Config]] · Neighbourhood ([[2026-10-03-Audit-Remediation-Final-P2-P3]], [[2026-10-02-Neighbourhood-Real-Data]])
**Branch:** `claude/vendora-pos-v3-KPnI0`

## Goal
Small, evidence-based fixes after the neighbourhood feature went live (verified 10 Oct 2026). Three issues
spotted on the live card + record the live-verification, IMD import process, and Atlas rotation. No redesign, no
new features; auth/Brevo/billing untouched.

## Live verification (owner-run; sandbox can't reach the upstreams)
- Render on `58deaa3`, `NEIGHBOURHOOD_ENABLED=true`, `source=nomis`, `/health` db connected.
- RM10 8AA → **E01000036**: 1,470 residents (TS001), 471 households (TS041), age (TS007A), economic activity
  (TS066), qualifications (TS067), **IMD 2025 decile 4** (rank 10,874 of 33,755, score 25.385).
- IMD 2025 imported to **vendora_test** and **vendora_pilot** (33,755 rows; sample line matched).

## Changes
- `frontend/src/components/insights/NeighbourhoodAreaCard.jsx`
  - **Task 2 — qualifications summed to 97.1%.** Root cause: the parser returns all 7 TS067 categories, but
    `BreakdownFigure` did `.slice(0, 6)`, dropping the smallest real category ("Other qualifications"). Removed
    the slice → every category shows and shares sum to ~100%. (Verified it was the UI, not the parser: the
    hierarchical top-level filter keeps all flat TS067 categories; backend `parseBreakdown` test still green.)
  - **Task 1 — attribution.** Replaced the single ONS-only footer (which also hardcoded "· Census 2021", wrong
    for the IMD-2025 and mid-year figures) with a `SourcesNote` block that credits each source actually shown:
    ONS (Census 2021), MHCLG (English Indices of Deprivation 2025, © Crown copyright 2025, shown only when the
    IMD figure is present), and the ONS Postcode Directory (OS + Royal Mail + National Statistics) for the
    postcode→area lookup. Each figure already shows its own reference date in its provenance line. Exact wording
    + sources + confirmed/unconfirmed notes recorded in [[Deployment-Config]] (LIVE 2026-10-10 section).
- **Task 3 — mid-year population (NM_2014_1) not on the card: config, not code.** `configuredFigureDefs()` only
  includes a figure whose dataset id is set; the live Render env has the six census/IMD ids but **not**
  `NEIGHBOURHOOD_DS_POP_MID`, so the figure is never fetched. The dual-population rendering (`d96adb9`) is
  correct. Fix is owner-side: set `NEIGHBOURHOOD_DS_POP_MID=NM_2014_1` + redeploy, then confirm the period label.
  Also noted: `NEIGHBOURHOOD_DS_DEPRIVATION=NM_2031_1` (TS011) is now a no-op (deprivation comes from IMD).

## Decisions
- Fixed Task 2 by **showing all rows** rather than adding a "% of residents aged 16+" base label: the dropped
  category is real data that belongs on the card, and showing it makes the percentages self-consistent without a
  base label I couldn't live-verify per table.
- Did **not** add a `.gitattributes`: the CRLF/LF churn is local to the Windows clone and this sandbox shows a
  clean tree; a renormalisation would add noise to this focused change. Flagged as an optional separate step.

## Gotchas (promoted to [[Deployment-Config]])
- IMD import needs the machine's IP on the **Atlas IP Access List**, and on some networks the `mongodb+srv` SRV
  lookup needs `NODE_OPTIONS=--require ./scripts/dns-8888.js` (public resolver shim).
- **Atlas password rotated 2026-10-10** → Render `MONGODB_URI` updated in the dashboard (no secret in any file).
- OGL requires crediting each source shown; the ONSPD needs three owner credits (OS/Royal Mail/National
  Statistics). The strict ONSPD form carries a `[year]` on the OS/Royal Mail lines (edition year) — left out
  rather than guessed; marked unconfirmed.

## Verification
- `frontend`: neighbourhood client tests **4/4**; `npm run build` green.
- `backend`: neighbourhood tests **16/16** (parseBreakdown, dual-population dims, configuredFigureDefs gating).
- Live upstream checks (postcodes.io/ONS/Nomis) remain owner-run — sandbox egress is blocked.

## Commit(s)
- `fix(neighbourhood): credit each source in the card + show all qualification categories` (this entry's commit)

## Follow-ups
- [ ] Owner: add `NEIGHBOURHOOD_DS_POP_MID=NM_2014_1` on Render to surface the mid-year population figure; confirm
      its returned period matches the label.
- [ ] Owner (optional): add the ONSPD edition `[year]` to the OS/Royal Mail attribution lines once known; remove
      the no-op `NEIGHBOURHOOD_DS_DEPRIVATION`.
- [ ] Optional: `.gitattributes` (`* text=auto eol=lf`) to stop CRLF churn on the Windows clone (separate commit).
