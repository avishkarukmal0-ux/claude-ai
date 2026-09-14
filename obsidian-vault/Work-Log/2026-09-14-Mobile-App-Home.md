# 2026-09-14 — Mobile app-home + Continue flow (M0 complete)

Back to [[Work-Log]] · Related: [[Implementation-Roadmap]] · [[2026-09-14-Niche-Picker-Front-Door]] · [[Go-To-Market]]

## Goal
Finish M0: turn the picker from a dead end into a real flow — pick → **Continue** → a mobile **app-home** that reflects the chosen shop type, with a bottom-nav shell.

## What changed (files)
- 🆕 `frontend/src/pages/HomePage.jsx` — public mobile app-home. Sticky top bar (shop label + "Change"), "What Vendora does for you" (family promises), a **module grid tailored to the shop type**, and a **bottom-nav shell** (Home / Scan / Stock / More) switching local views. Redirects to `/` if no shop type is saved. Modules show a **"Soon"** badge until the backend/features land.
- ✏️ `frontend/src/config/shopTypes.js` — added a **MODULES catalog** + `CORE_MODULE_IDS` + per-family `moduleIds` + `getModulesForFamily(familyId)` → **shown = core + family extras** (the shopType dial made concrete). Grocery→age-check; Fresh→scale-labels+allergens; World→festival+allergens; Mobile→reconcile.
- ✏️ `frontend/src/pages/NichePickerPage.jsx` — a **Continue** button (appears once a family is picked) → `/home`.
- ✏️ `frontend/src/App.jsx` — public route `/home` → `HomePage`.

## Verification (headless Chromium @ 390×844)
- `npm run build` ✓.
- Flow: pick **Grocery & age-restricted → Off-licence → Continue** → lands on `/home`; header shows "Off-licence"; tools grid = 6 core + **Age checks** (family extra); Scan tab shows the "Goods-in scan — coming soon" panel; **no page errors**. Screenshots (`home.png`, `home-scan.png`) in scratchpad.

## Status
**M0 is functionally complete** — install → pick → tailored mobile home. What's intentionally *not* here: real login/store-scoping and live numbers on mobile — those need the backend connected (MongoDB Atlas URI + always-on host). Tiles are placeholders ("Soon") by design.

## Next (M1)
The daily hook: **goods-in scan** (~70% exists as the invoiceReader template). The Scan tab is already the slot it plugs into.

## Commit
- feat(app): mobile app-home + Continue flow; module catalog per shop type (M0)
