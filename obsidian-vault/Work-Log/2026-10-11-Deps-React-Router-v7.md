# 2026-10-11 (part 21) — Frontend react-router v7 → 0 prod advisories (audit backlog fully closed)

Back to [[Work-Log]] · [[Home]] · prev [[2026-10-11-Deps-Backend-Majors]]

**Domain(s):** Dependencies · Routing
**Branch:** `claude/vendora-pos-v3-KPnI0`

## Done
- **react-router-dom `^6.21` → `^7.18.4`** — the last 2 frontend PRODUCTION advisories were on react-router
  (6.0.0–7.17.0); 7.18.4 clears them. v7 keeps every v6 API the app uses (BrowserRouter, Routes, Route, Navigate,
  Link, NavLink, Outlet, useNavigate, useSearchParams, MemoryRouter) and only needs React ≥18 (we're on 18.2), so
  no code changes were required.

Result: frontend **production advisories 0** (`npm audit --omit=dev`). Together with the backend (also 0), **both
packages are now clean of reachable production advisories.** Remaining frontend advisories are dev/build tooling
(vitest/esbuild, tailwind, baseline-browser-mapping) — not shipped to the browser.

## Verification
- `npm audit --omit=dev` → **0 vulnerabilities**; `npm run build` green; FE full suite **412/412** (router-using
  component tests all pass under v7). No SW bump needed — the pending v13 already differs from the deployed v10, so
  installed PWAs still get the Refresh prompt with this bundle.

## Commit(s)
- `chore(deps): react-router-dom 6 -> 7 (last 2 frontend prod advisories cleared; 412 green)`

## Status — EVERYTHING I can do from here is done
- Audit: all 8 P1 + all 14 P2 + 2 repo tests + CI + **all reachable prod dependency advisories (FE 0, BE 0)**.
- Left for the owner (infra, not code): the breaking DEV-tool majors if desired (vitest/tailwind/nodemon/jest), a
  staging owner/manager/staff device matrix, real provider sandbox runs, a documented restore drill, and watching
  the new CI check go green. Plus the live deploys (Render + Vercel) to put all of this into production.
