# 2026-10-13 — Fix "Your area" (POST/GET + typed errors) + signed-in screen polish

Back to [[Work-Log]] · [[Home]]

**Domain(s):** [[Buying]] · [[API-Routes]] · [[Account]]
**Branch:** `claude/vendora-pos-v3-KPnI0`

## Goal
Fix Buy → "Your area" (showing only "unavailable"), and clear the signed-in-screen audit items.

## Root cause (confirmed from the repo; Render unreachable from the sandbox)
`origin/main` still has `router.get('/area', …)`; this branch (deployed to Vercel) sends **POST**. Render deploys the backend from main, so the live backend has **no POST handler** → a signed-in POST → **404** (auth passes, no matching method). It is a deploy mismatch, not a bad postcode. I could not `curl` Render (egress policy blocks `vendora-api-5pyt.onrender.com`) nor deploy it.

## Changes
**Backend** `backend/src/routes/pwaNeighbourhoodRoutes.js`
- `/area` now accepts **both POST and GET** (shared handler): POST reads the postcode from the body (preferred — out of URLs/logs), GET from the query (fallback for an out-of-step client). Distinct statuses: 400 invalid · **404 `{error:"no_data"}`** · 401 (auth middleware) · 5xx upstream.

**Frontend client** `src/lib/neighbourhoodClient.js`
- `getArea` returns a **typed outcome** (`{ok, kind}`): `invalid`/`no_data`/`auth`/`network`/`offline`, or success with figures. 30s `AbortController` timeout. **POST first, GET fallback** on a plain 404 (so it works against the un-updated Render backend today). Caches a success per shop (storage.js is workspace-scoped, not per-device). New `isValidUkPostcode`.

**Card** `src/components/insights/NeighbourhoodAreaCard.jsx`
- Distinct messages in a `role="alert"` region per case; `network` shows a 44px **Retry**. Loading: Get disabled + `aria-busy`, "Looking up…", after 5s adds "The server may be waking up (up to 30s)". Client-side postcode validation before sending. Visible `<label>`, `autoComplete="postal-code"`, `autoCapitalize="characters"`, clearable (×). Offline banner "Saved <date>, offline copy". No figure rendered without a `source`. Privacy line: used only to look up figures, saved on this device for the shop, change/clear any time. No hard-coded "SW1A 1AA".

**Signed-in screens**
- `account/AccountView.jsx` — `<h1>Your shop account</h1>` (#5); both back buttons → `ScreenBack` (82×44, aria-label Back) (#2).
- `account/StaffView.jsx`, `account/CloudBackups.jsx` — back → `ScreenBack` (#2).
- `account/SyncStatus.jsx` — row → min-h-44 (#4). `inventory` Stock empty-state buttons → 44px (#4).
- `account/CloudBackups.jsx` (#3) — Refresh 36→44px; Restore 44px + aria-label "Restore version N, <date>" + **ConfirmDialog** (states what's replaced) instead of `window.confirm`; **hide the `shop_type` ("Shop type") store** from the list; **merge versions within the same minute** (keep newest rev).

## Verification
- `npx vitest run` → 80 files, **536** pass (+ neighbourhood typed-outcome/validation/GET-fallback tests). `npm run build` green; 375px headless public flow = **0 console errors**. Backend `app.js` loads; integration suite parses.
- **COULD NOT verify end-to-end:** a real POST returning figures — the sandbox egress blocks the Render host and I can't deploy Render. The POST route + GET fallback are in place; once the backend is deployed (merge to main / Render redeploy), POST returns figures, and until then the client's GET fallback uses the live GET route.

## Commit(s)
- `<hash>` — SW v33→v34.

## Follow-ups / questions
- [ ] Deploy the backend to Render (merge branch → main, or point Render at this branch) so POST /area is live; then I can confirm a real request/response.
- [ ] Should the backend be merged to main now, or do you deploy Render from a different branch?
