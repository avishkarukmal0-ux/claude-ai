# 2026-07-15 — Atlas connection setup for local launcher

Back to [[Work-Log]] · [[Home]]

**Domain(s):** [[Running-Locally]] · [[Deployment]]
**Branch:** `claude/vendora-pos-v3-KPnI0`

## Goal
User asked me to fetch their `MONGODB_URI` "on their behalf". I can't — it's behind their private Atlas login. So instead: do everything on the code side and reduce their part to a 2-click copy-paste with an in-context guide.

## Changes
- `GET-DATABASE-LINK.txt` (new, repo root) — plain-English, 5-step guide to copy the connection string from MongoDB Atlas (login → allow network access 0.0.0.0/0 → Connect → Drivers/Node.js → fix `<db_password>` → paste into `.env`), plus the "empty shop = wrong DB name, append it before `?`" fix.
- `StartVendora.bat` — on first run now opens `GET-DATABASE-LINK.txt` in a second Notepad window next to `backend/.env`, and the messaging points at **Atlas** (not Railway) as the source of `MONGODB_URI`.
- `obsidian-vault/Running-Locally.md` — launcher section updated to reference the guide + Atlas; added an "Getting `MONGODB_URI` from Atlas" subsection.

## Decisions
- **Atlas, not Railway, is now the documented source** of the URI — the user is rebuilding locally and their data cluster (project `cornershop-pos`, Cluster0) is the durable thing; Railway compute trial has lapsed.
- Won't ask the user to paste their real DB password into chat — they keep it in their own local `.env`. Documented as a security note.

## Gotchas
- New PC's IP isn't in Atlas Network Access (old laptop was) → connection refused until they add 0.0.0.0/0. This is the #1 thing people miss.
- Atlas "Get connection string" omits the database name; connecting without it lands on the default DB and the shop looks empty. Fix: append the real DB name before `?`.

## Verification
- Docs/launcher-text change only; no app code touched. `StartVendora.bat` is Windows-only (can't exercise here).

## Commit(s)
- _(to be filled after push)_

## Follow-ups
- [ ] User to run through `GET-DATABASE-LINK.txt`, then confirm the POS loads their real data at localhost:5173.
- [ ] If app loads empty, capture the actual DB name from Browse Collections and bake a default into docs.
