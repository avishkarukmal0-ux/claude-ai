# Vendora PWA — Phase 1 Delivery Report

_Branch: `claude/vendora-pos-v3-KPnI0` · Convenience-store shop-management PWA (React + Vite)._

This is the consolidated record of what was built, what it does for a shop owner, how it's put
together, what's proven to work, and — honestly — what is **not** built yet and why. The "not built"
section is the roadmap for the next phase ("infra").

---

## 1. What Vendora is now

A **phone-first, offline-capable app that helps an independent UK convenience-store owner run the
shop day to day** — receive and check deliveries, know what's in stock, cut waste, buy the right
quantities, recover money owed by suppliers, and coordinate staff. It runs entirely on the owner's
device today (no login required), works with no signal, and never loses data silently.

It is deliberately **separate from the till/EPOS product**. The till was set aside to make this a
dependable standalone product; the two share nothing that would make one break the other
(see `obsidian-vault/ADR-002-App-Till-Separation`).

**Design principle throughout: honesty over flattering numbers.** Unknown cost is never shown as
£0 profit; estimated figures are labelled as estimates and kept separate from confirmed actuals;
the retail price is never changed behind the owner's back.

---

## 2. What it does — the workflows (Stages 1–7 + later additions)

Navigation is a simple 5‑tab layout: **Today · Scan · Stock · Buy · More**.

| # | Workflow | What it does for the owner |
|---|----------|----------------------------|
| **Foundations** | Reliable local storage + typed stock history | Every stock change is logged with a reason (sale / waste / delivery / correction …). Saves are per‑shop, survive offline, and show an error if a save ever fails instead of losing data quietly. |
| **1. Receive deliveries** | Delivery receiving & discrepancies | Check a delivery in cases or units, record what was ordered vs delivered vs accepted, flag missing/damaged/extra/wrong‑price items with a note + photo, and receive it once (re‑submitting can't double‑count). Draft autosaves; "repeat last order" speeds regulars. |
| **2. Know your stock** | Quick counts, locations, refill | Snapshot‑safe stock counts that catch shrinkage without overwriting fresher data; optional shelf‑vs‑back split; a refill list that says "the shelf is empty, move stock from the back" (which is different from "buy more"). |
| **3. Cut waste** | Expiry & waste with batches | Optional dated batches, sell‑oldest‑first (FEFO) guidance, bin the right batch once, and an honest split between "at risk" (estimate) and "saved" (actual). |
| **4. Buy right** | Orders + buy list | Track what you've ordered (draft → ordered → partially received → received), subtract what's already incoming so you don't over‑order, and link a delivery back to its order. |
| **5. Recover money** | Supplier claims | Raise a credit claim straight from a bad delivery with evidence, track it (requested → approved → received), and share it with the supplier — so credits owed don't get forgotten. |
| **5b. Protect margin** | Purchase‑price alerts | When a supplier's cost changes materially, flag the margin impact and queue a suggested retail change **for the owner to approve** — never auto‑applied. Keeps a cost history. |
| **6. Coordinate staff** | Tasks & shift handover | Assign tasks with priority/due dates, opening/closing checklists, and a shift handover that carries unresolved items forward. Owner/staff views; only genuine exceptions surface on the home screen (not every action). |
| **7. Simpler interface** | Today/Scan/Stock/Buy/More | The whole thing reorganised into hubs so it's usable one‑handed on a phone; first‑run guidance; a "do this today" list you can snooze per day. |
| **Later A** | Customer requests | Log "do you sell…?". Asking again bumps a repeat count so the most‑wanted lines rise to the top; one tap adds to the buy list. |
| **Later B** | Monthly outcomes | A monthly page of what **actually** happened — supplier credit received, claims resolved, tasks done, stock‑check coverage, waste cost — with estimated "rescued" savings shown separately, never mixed into the real numbers. |
| **Later C** | Optional till CSV sales import | Import a sales export from an existing till to turn *estimated* sell‑through into *confirmed* sales evidence. **Never changes stock counts.** Matches by barcode then name, blocks duplicate imports, and can be undone. |

---

## 3. How it's built (architecture & key decisions)

- **Local‑first.** Each feature is a small store backed by browser storage (`localStorage`) plus a
  React hook. It works with no connection; there is no backend dependency for the PWA today.
- **Per‑shop ("workspace") scoping.** Keys are namespaced (`vendora:<shop>:<store>`), so a future
  multi‑shop / multi‑login world drops in without a data migration nightmare. Legacy data is migrated
  non‑destructively.
- **Typed movement log** is the backbone: every quantity change records *why*. This is what lets
  reorder and insights count only real sales as "velocity" and clearly label estimates — the old
  approach treated every decrease as a sale and inflated the numbers.
- **Deterministic writes.** Read → compute → save → update UI → then log — so a change is never lost
  to React timing. Operations carry an `operationId` so re‑doing one (a re‑submitted delivery, a
  re‑imported CSV) is idempotent and can be undone.
- **App/till separation.** The heavy till pages are lazy‑loaded; the PWA's initial download stays
  small (≈152 kB vs 643 kB before). Documented in ADR‑002.
- **Backend (from the earlier reliability review, not used by the PWA yet):** middleware order fixed,
  refunds are shop‑scoped / idempotent / discount‑aware with a required void PIN, production refuses
  to start on weak secrets, and loyalty is deducted correctly.

Full map: `obsidian-vault/Home.md`; per‑session detail in `obsidian-vault/Work-Log/`.

---

## 4. What's proven to work

- **Frontend: 87 automated tests passing** across 14 files (storage, movements, inventory, delivery,
  counts/locations, batches, orders, claims, price alerts, tasks, requests/outcomes, sales‑import,
  insights, backup).
- **End‑to‑end journeys** run in a real headless browser at phone size (390×844) against the
  production build — every workflow above was walked through and verified, including offline
  persistence and the honest‑numbers behaviour.
- **Backend: unit tests** for auth, refunds, secret validation, products, sales, cash drawer, loss
  prevention. (DB‑integration tests are environment‑gated — see below.)
- **Production build is clean** on every stage.

---

## 5. What is deliberately NOT built yet (and why) — the "infra" roadmap

These were intentionally left out and **not faked**. Together they are the next phase.

| Gap | Why it matters | Why it needs "infra" |
|-----|----------------|----------------------|
| **Real accounts / login** | Data is currently tied to one device's browser, not to the owner. Lose/replace the phone → data is gone. The "Log in to your shop" link has nothing behind it. | Needs backend auth, secure sessions, per‑user data ownership. |
| **Bigger, safer local database (IndexedDB)** | `localStorage` has a ~5 MB ceiling and no transactions; a busy shop's history will outgrow it, and an interrupted write can corrupt data. | Needs a transactional client DB + a careful, tested migration from today's storage. |
| **Multi‑device** | Owner's phone, counter tablet, and staff device should see the *same* live data. Today each device is an island. | Requires accounts + sync. |
| **Sync with conflict resolution** | Two people editing the same product must reconcile without losing either change. | Needs server sync with retries, de‑duplication, and conflict rules. |
| **Server‑side reminders / push** | "Delivery due", "task overdue", "licence deadline" should reach the phone **even when the app is closed**. Today reminders only exist while the app is open. | Needs a server + web‑push infrastructure. |
| **Reviewed invoice extraction (OCR)** | Auto‑reading a paper/PDF invoice into a delivery would save real time. | Needs OCR infrastructure; a "draft" without real extraction would be fake, so it was deferred. |
| **Backend DB integration tests** | To fully prove refund/void flows against a real database. | The sandbox has no MongoDB binary and the download host is blocked; suites are written and skip cleanly until a DB is available. |

**Recommended sequencing for "infra"** (each a reviewable stage, nothing deployed without approval):

1. **IndexedDB + migration** — the biggest single reliability win, and it needs no server. Safe,
   self‑contained, benefits every existing user immediately.
2. **Accounts / auth** — real login backing the existing "log in to your shop" link.
3. **Sync + conflict resolution** — multi‑device, built on 1 + 2.
4. **Server reminders / push** — notifications when the app is closed.
5. (Later, separate track) **Invoice OCR.**

Starting with step 1 means real value lands before any backend work, and the risky, deploy‑bound
pieces come only after the foundations are solid and reviewed.

---

_Phase 1 (Stages 1–7 + three later additions) is complete, tested, and pushed. This report is the
springboard for Phase 2 ("infra")._
