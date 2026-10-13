# 2026-10-13 — Your area: 4 verified risks (radius cache, Scotland, clear, offline label)

Back to [[Work-Log]] · [[Home]]

**Domain(s):** [[Buying]] · [[Services]]
**Branch:** `claude/vendora-pos-v3-KPnI0`

## Changes
1. **/radius stall for a new postcode** — `insightsService.buildProfile` now has a **server-side result cache**
   keyed by `(postcode, radius, headline?)`, 7-day TTL, LRU (max 500). Census is static, so a completed profile
   is reused — repeat visits are instant AND a Retry is fast (the first request may exceed the client's 30s
   timeout, but Node finishes + caches, so Retry is a cache hit). Unsupported-nation results cached too.
2. **Scotland/unsupported showed nothing** — the card now renders a block for `ok && !available`
   (`role="status"`): if `area.country` isn't England/Wales → "Official area figures aren't available for
   <nation> yet.", else the server's reason. (Census 2021 is England & Wales only.)
3. **Clear postcode now deletes the cache** — new `clearStored(postcode)` in the client; the × button calls it
   so "clear it any time" is true (removes the saved area copy for that postcode).
4. **Offline label** — "Showing your last saved copy from <date>" (was "Saved <date>, offline copy").

## Files
- `backend/src/services/insightsService.js` (+ `__clearResultCache`), `backend/src/__tests__/insightsService.test.js`
- `frontend/src/lib/neighbourhoodClient.js` (clearStored), `frontend/src/components/insights/NeighbourhoodAreaCard.jsx`
- `frontend/src/lib/__tests__/neighbourhood.test.js`, `public/sw.js` (v36→v37)

## Verification
- backend insights tests **18** (+ cache test); CI backend **210**. FE **539** (+ clearStored test) + build.
- **Backend cache needs the manual Render deploy.** First-ever load of a brand-new postcode is still bounded by
  Nomis latency (the fetch is already batched 150 OAs/call) — the cache makes Retry + repeats instant, which is
  the pragmatic fix for the >30s stall. Could not profile live (Render egress blocked).

## Commit(s)
- `<hash>` — SW v36→v37.

## Follow-ups
- [ ] Manual Render deploy for the radius cache. If first-load latency is still too high for new postcodes,
      consider a persisted (Mongo) radius cache or an async "computing…" response.
