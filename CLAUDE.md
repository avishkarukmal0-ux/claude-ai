# Vendora POS — Project Instructions

UK retail point-of-sale system. React+Vite frontend, Node/Express+MongoDB backend, real-time via Socket.io, billing via Stripe. Code lives in `vendora-pos/`. Active branch: `claude/vendora-pos-v3-KPnI0`.

## 📔 ALWAYS: keep the Obsidian vault updated

There is a living project map in **`obsidian-vault/`** (an Obsidian vault of interlinked markdown notes). Treat it as the source of truth for how the project fits together, and **keep it current as part of every task** — this is not optional:

1. **Before non-trivial work**, skim the relevant vault note(s) to orient. Start from `obsidian-vault/Home.md`.
2. **After making changes**, update the vault in the SAME session, before finishing:
   - Add/append a dated entry in `obsidian-vault/Work-Log/` (copy `_Template.md`). One entry per working session: goal, files changed, decisions, gotchas, commit hash, follow-ups.
   - Update the relevant domain/architecture note if the change alters structure, routes, models, or behaviour (e.g. edits to Accounting → update `Domains/Accounting.md`; new route → update `Backend/API-Routes.md`).
   - Promote durable lessons into `obsidian-vault/Conventions.md`.
   - Keep `Work-Log/Work-Log.md` (index + standing backlog) in sync: link the new entry, tick/close backlog items.
   - Use `[[wikilinks]]` so the graph stays connected. Keep note filenames unique.
3. **Commit vault updates alongside the code change** (or in an adjacent `docs:` commit) and push.

If a task is trivial (typo, one-liner) a Work-Log entry is optional, but structural changes must always be reflected.

## Working agreements
- Commit style: `feat:` / `fix:` / `chore:` / `docs:`. Push to `claude/vendora-pos-v3-KPnI0` with `git push -u origin claude/vendora-pos-v3-KPnI0`.
- Don't commit incidental `package-lock.json` churn from verification installs.
- Verify before committing: frontend `npm run build`; backend `node -e "require('./src/app.js')"` (JWT warnings are expected locally).
- Thin routes, fat services. Scope every query by `store`. Throw `AppError`. Responses `{ success, ... }`.
- UK tax constants (payroll/VAT/NI/NMW) are in `backend/src/services/payrollService.js` and mirrored client-side — keep both in sync. See `obsidian-vault/Domains/Accounting.md`.
- Never put `flex` directly on a `<td>` — wrap children in a `<div>`.

## Where things are
- Full map: `obsidian-vault/Home.md`
- Backend entry: `vendora-pos/backend/server.js` → `src/app.js` → `src/routes/index.js`
- Frontend entry: `vendora-pos/frontend/src/main.jsx` → `App.jsx`
- Active feature area: Accounting (`AccountingPage.jsx`, `accountingRoutes.js`, `payrollService.js`)
