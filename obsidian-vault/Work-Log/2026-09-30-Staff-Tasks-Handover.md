# 2026-09-30 — Stage 6: Staff tasks & shift handover

Back to [[Work-Log]] · Related: [[2026-09-30-Buying-Claims-PriceAlerts]] · [[ADR-002-App-Till-Separation]]

## Goal
Turn staff notes into a shared task workflow with checklists, handover and an audit trail — and let
owners see only the exceptions, not every action.

## What shipped
- **taskStore**: tasks (title/category/priority/assignee/due/product/location/note/photo) with an
  audit trail; state machine open→in_progress→completed→acknowledged (legal transitions only),
  each change stamped with actor + time. `isException` = still-open + high-priority or overdue.
  Opening/closing checklist templates (`config/checklists.js`) create task sets; `handover` stamps
  unresolved tasks and logs a note for the next shift. Scoped keys `tasks_v1` / `handovers_v1`.
- **TasksView**: exceptions-first list, create task, per-task status advance, **owner/staff role
  toggle** gating the owner-only Acknowledge, checklist buttons, handover panel + recent log.
- **Exceptions on Home**: the action engine now emits "N team tasks need attention"; the full
  stream stays inside Team tasks.

## Infra honesty
Server-side scheduled reminders + push (owner notified while the app is closed) are **not built**
(see [[ADR-002-App-Till-Separation]]). The spec's required fallback holds: important issues stay
visible in the app. Full role enforcement also needs backend auth — the role toggle is a local
convenience for now.

## Verification (actual)
- Vitest: 6 new (lifecycle + audit trail, illegal transitions, exceptions + sort, checklist apply,
  handover). Full FE suite **70/70**.
- E2E (headless Chromium 390×844, prod build): create (staff) → persists offline & app renders
  offline → owner sees exception on Home → complete → acknowledge (audit trail intact) → opening
  checklist adds 6 → handover logged. No page errors. Build clean.

## Data preserved
Additive: scoped keys `tasks_v1` / `handovers_v1`; app-level `vendora:role` for the toggle. No
existing records touched.

## Remaining
Stage 7 IA cleanup (Today/Scan/Stock/Buy/More; remove unimplemented promises; hide/merge
overlapping modules — worker/suggestions/tasks) · later additions. Heavy infra (auth accounts,
IndexedDB, multi-device sync, server reminders/push) still open — documented, not faked.

## Commit
`feat(app): staff tasks & shift handover (Stage 6)`
