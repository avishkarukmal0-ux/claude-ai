# 2026-07-13 — Fix broken /payroll route mount + auto-update setup

Back to [[Work-Log]] · [[Home]]

**Domain(s):** [[API-Routes]] · [[Backend-Overview]]
**Branch:** `claude/vendora-pos-v3-KPnI0`

## Goal
Fix the flagged `routes/index.js` payroll-mount issue, and set up the vault to stay updated automatically going forward.

## What we found
Worse than a "quirk" — an actual **boot-crash bug**. `backend/src/routes/payrollRoutes.js` was a 4-line stub that only exported `{ asyncHandler }`, not a router. The line `router.use('/payroll', payrollRoutes)` would throw `Router.use() requires a middleware function but got a Object` on server startup. It sat after `module.exports` but still executed on require.

The real payroll API is served under `/accounting/payroll` (`accountingRoutes.js`) — which is what the frontend actually calls (`services/accounting.js`). Nothing used a top-level `/payroll`.

## Changes
- `backend/src/routes/index.js` — removed the dead `/payroll` mount; added a comment noting payroll lives under `/accounting`; all mounts now sit before `module.exports`.
- **Deleted** `backend/src/routes/payrollRoutes.js` (stray stub).
- `CLAUDE.md` (repo root) — NEW. Project instructions that auto-load every session, including the standing directive to keep `obsidian-vault/` updated as part of every task.
- Vault: updated [[API-Routes]] (removed the quirk note), this entry, [[Work-Log]] backlog.

## Decisions
- Removed rather than "fixed forward" the stub — no code or frontend referenced a top-level `/payroll`; it was incomplete/abandoned wiring.
- Chose `CLAUDE.md` as the auto-update mechanism: it's loaded at the start of every Claude Code session in this repo, is committed to git (survives laptop loss), and can carry judgement-based instructions a shell hook cannot.

## Gotchas
- CommonJS runs the whole module body on `require`, so code after `module.exports` still executes — a mount error there still crashes boot.

## Verification
- `node -e "require('./src/routes/index.js')"` → ✅ 43 layers
- `node -e "require('./src/app.js')"` → ✅ assembles clean (JWT warnings expected locally)

## Commit(s)
- _(pending)_ — `fix: remove broken /payroll route mount that crashed server boot`

## Follow-ups
- [ ] End-to-end manual test of Accounting flow
- [ ] Confirm Railway + Vercel deploy configs current
