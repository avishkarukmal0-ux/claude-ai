# 2026-10-11 (part 3) — Radius figures working; made the calculation faster

Back to [[Work-Log]] · [[Home]]

**Domain(s):** Neighbourhood Insights · Frontend
**Branch:** `claude/vendora-pos-v3-KPnI0`

## Context
Radius figures now compute and sync (owner confirmed). Complaint: the calculation takes time. Each NEW radius
does: postcode → **scan ~190k centroids** → **several Nomis API round-trips** → aggregate (plus Render's ~50s
cold start on the first hit).

## Changes (perf — same results, never fabricates)
- `backend/src/services/insightsGeo.js` `selectAreasInRadius`: added a cheap **bounding-box prefilter** (a 5%
  margin box around the point) so the haversine runs only on nearby candidates instead of all ~190k centroids.
  Identical output, far fewer trig calls per request.
- `frontend` `NeighbourhoodAreaCard`: a per-`{postcode,radiusM}` **session cache** (useRef Map) → revisiting a
  radius is **instant** (no round-trip); and the debounce went 450 → **650 ms** so dragging the slider fires
  fewer requests. A `403` (locked) is cached too; transient errors are not (so an outage retries).
- Server-side, the existing per-(point,radius) Nomis cache (1-day TTL) already makes a repeated radius fast; the
  frontend cache avoids even the round-trip within a session.

## Not changed (deliberately, to stay minimal)
- Still fetches all 4 Nomis tables per profile (the free card shows only population/households, but `buildProfile`
  is shared with the paid full profile). A "headline-only" fast path (2 tables) is a possible later optimisation.
- Render cold start (~50s on the first request after sleep) is a free-tier trait, not something code fixes.

## Verification
- BE insightsGeo/data/service **34/34** (prefilter gives identical selection) + app loads.
- FE full suite **385/385** + build green.
- **Not verified live** (sandbox can't reach Nomis/Render); the speedup is logic-level — owner redeploys the
  backend for the centroid-scan win (frontend cache/debounce auto-deploys via Vercel).

## Rollback
- `git revert <sha>` — isolated.

## Next step for the owner
- **Redeploy the Render backend** (for the centroid-scan prefilter). The frontend cache/debounce is already on
  Vercel after reload. First visit to each radius is still a Nomis fetch (slower once, then cached); moving back
  to a radius you've already seen is instant.

## Commit(s)
- `perf(insights): bounding-box prefilter + frontend radius cache/debounce (faster radius figures)`

## Follow-ups
- [ ] Optional: a headline-only fast path (fetch just the 2 tables the free card shows) to cut first-visit time.
- [ ] Optional: a keep-warm ping so the first radius request doesn't hit Render's cold start.
