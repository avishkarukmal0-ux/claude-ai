# 2026-10-12 — Neighbourhood "area" → POST (postcode out of the URL)

Back to [[Work-Log]] · [[Home]]

**Domain(s):** [[API-Routes]] · [[Services]]
**Branch:** `claude/vendora-pos-v3-KPnI0`

## Goal
Close the flagged follow-up from the Buy-tab audit: `/api/pwa-neighbourhood/area` carried the store's postcode in the query string (`?postcode=…`), so it landed in access logs, proxy logs and browser history. Move it into the POST body.

## Changes
- `backend/src/routes/pwaNeighbourhoodRoutes.js` — `/area` is now `POST` reading `req.body.postcode` + `req.body.force` (was `GET` with `req.query`). Same validation (400 `NO_POSTCODE`), same owner/manager gate, same response shape. `/status`, `/radius`, `/tiles` unchanged (`/radius` already paid-gated/test-only; tile coords aren't PII).
- `frontend/src/lib/neighbourhoodClient.js` — `getArea()` now `POST`s `{ postcode, force }` as JSON (Content-Type + bearer header) instead of a query string. Caching/offline fallback unchanged.
- `backend/src/__tests__/pwaNeighbourhood.integration.test.js` — area cases switched to `POST … .send({ postcode })`; added a "missing postcode in body → 400" case (6 tests, DB-gated/skipped without `VENDORA_TEST_URI`).
- `frontend/src/lib/__tests__/neighbourhood.test.js` — added a test asserting `getArea` hits `/area` with **no query string**, `method: POST`, JSON body `{ postcode: 'RM108AA', force: true }` (7 tests pass).
- `public/sw.js` — `CACHE_VERSION` v27 → v28.

## Decisions
- POST (not GET-with-header) because the postcode is the only sensitive field and a body keeps it off every URL-logging surface; `force` moved into the body too so there's one request shape.
- Only `/area` changed — it's the one free, always-called route that takes a postcode. `/radius` is test-unlock/paid and `/tiles` takes z/x/y, not PII.

## Verification
- Frontend: `npx vitest run src/lib/__tests__/neighbourhood.test.js` → 7/7; full `npm run build` green.
- Backend: `node -e "require('./src/app.js')"` loads (JWT dev warnings expected); integration test parses and skips cleanly without a DB URI.

## Commit(s)
- `<hash>` — fix(neighbourhood): POST /area with postcode in body, not the URL

## Follow-ups
- [ ] Manifest screenshots still need real device captures.
