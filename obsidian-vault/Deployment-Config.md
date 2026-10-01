# Deployment & Configuration

Back to [[Home]] · [[Invoice-Acceptance-Coverage]] · [[Backend/API-Routes]]

How the PWA-only product is configured, what each flag does, how to disable a workflow safely, and how to
recover. **Production deployment itself is out of scope for the acceptance task** — this is the reference the
operator uses. Nothing here turns anything on by itself.

## Feature flags (major new workflows)

Flags follow the existing pattern: a Vite build-time env var on the **frontend**, or a server env var on the
**backend**. All are **safe by default** (the new workflow is either default-on and purely additive, or
default-off until configured). Set a frontend flag in the Vercel project env and redeploy; set a backend
flag in the Render service env and redeploy.

| Flag | Where | Default | Effect |
|---|---|---|---|
| `VITE_INVOICES_ENABLED` | frontend | **on** | Supplier-invoice reconciliation + credit workflow (capture, reconcile, credit notes, price history). `false` hides those Buy-hub tiles + screens. |
| `VITE_ACCOUNTS_ENABLED` | frontend | off | Shows the shop-account login + cross-device sync + staff + email-prefs UI. Needs the backend accounts routes live. |
| `TILL_ENABLED` | backend | off | Mounts the deferred till/back-office API. Leave off for the PWA pilot. |
| `INVOICE_OCR_PROVIDER` (+ `OCR_SPACE_API_KEY`) | backend | off | Turns on optional OCR (`ocrspace`). Off → the capture screen is manual entry; `configured:false`. |
| `NOTIFY_EMAIL_PROVIDER` (+ `SENDGRID_API_KEY`, `NOTIFY_FROM_EMAIL`) | backend | off | Turns on the email digest channel. Off → `configured:false`, nothing sent. |
| `NOTIFY_RUN_TOKEN` | backend | off | Enables `POST /api/pwa-notify/run` for an external scheduler (header `x-notify-token`). Unset → that route is 404. |
| `NOTIFY_CRON` | backend | off | `true` also runs an in-process 15-min digest sweep (only reliable while the instance stays awake). |

## Migrations

All data changes this programme introduced are **additive and lazy** — there is no destructive migration
and no migration script to run:
- **`Account.notify`** — a sub-document with safe defaults (all off). Existing accounts get the defaults
  lazily on first read/write; nothing to backfill.
- **`PwaMember`** — a new collection; empty until an owner adds staff.
- **Client stores** — `invoices_v1`, `credit_notes_v1` are in the synced set; `invoice_files_v1` is
  device-local. New fields on existing records (claim `invoiceId`/line refs, `raisedBy`, delivery
  `receivedBy`, stocktake `by`) are optional and default sensibly when absent.
- **Money** — the shared pence-based helpers produce the same values as before for normal 2-dp inputs, so
  stored amounts are unaffected; only accumulation is made drift-free.

## Safe disablement

- **Invoice/credit workflow** — set `VITE_INVOICES_ENABLED=false` and redeploy the frontend. The tiles and
  screens disappear; **the data is retained** locally (and in sync) and simply isn't shown.
- **OCR / email digest / scheduler** — unset the relevant backend env var(s) and redeploy. Each degrades to
  its off state honestly (`configured:false`, no sends, `/run` → 404). No data is lost.
- **Staff access** — set a member inactive (owner → Staff access → Deactivate): they can't sign in or
  refresh; their past actions stay recorded. Turning `VITE_ACCOUNTS_ENABLED` off hides the whole
  account/sync/staff UI without deleting anything.

## Recovery

- **Re-enable a workflow** — set the flag back and redeploy; the retained data reappears. No reimport.
- **Role change gone wrong** — the owner changes a member's role/active state in Staff access; it takes
  effect on the member's next refresh. The owner account itself is never a member and can't be locked out
  this way.
- **Bad local state on a device** — the device is just a cache of synced blobs; signing in on a fresh device
  re-pulls the shop's data. A local backup export/restore (More → Data) is the offline fallback.
- **A mistaken credit / claim** — void the credit note (reverses its claim allocations, received recomputed)
  or remove the allocation; history is retained. Delete a stored invoice scan with **Delete file** while
  keeping the checked record.

## Enabling the optional channels (step-by-step)

These are **config/secret actions only** — the code is already deployed behind these flags. Nobody but the
account holder can do them (third-party keys + the Render dashboard).

### Email digest (#6)
1. **Render → the backend service → Environment**, add:
   - `NOTIFY_EMAIL_PROVIDER=sendgrid`
   - `SENDGRID_API_KEY=<your SendGrid key>`  (create at sendgrid.com → API Keys; needs "Mail Send")
   - `NOTIFY_FROM_EMAIL=<a verified sender>`  (verify it in SendGrid → Sender Authentication)
   - `NOTIFY_RUN_TOKEN=<a long random string you generate>`
   Redeploy. `GET /api/pwa-notify/prefs` then reports `configured:true`.
2. **Scheduling — pick ONE:**
   - *GitHub Action (recommended, already committed):* repo **Settings → Secrets and variables → Actions**,
     add `PWA_API_BASE=https://vendora-api-5pyt.onrender.com` and `NOTIFY_RUN_TOKEN=<same value as on Render>`.
     The hourly `.github/workflows/pwa-notify-digest.yml` then drives delivery; it skips safely until both
     secrets exist. (Run it once manually from the Actions tab to test.)
   - *In-process:* set `NOTIFY_CRON=true` on Render — only reliable while the dyno is awake (the free tier
     sleeps), so the GitHub Action is the robust choice.
3. In the app: **More → Notifications → Email digest** → turn on, set recipient/time/quiet hours.

### OCR (#1 capture aid)
1. **Render → Environment**, add `INVOICE_OCR_PROVIDER=ocrspace` and `OCR_SPACE_API_KEY=<your OCR.space key>`
   (free key at ocr.space/ocrapi). Redeploy. `GET /api/pwa-invoice-ocr/status` then reports `configured:true`.
2. No app change — the capture screen starts showing scanned text + "Fill lines from this text" (still
   review + commit). With no key it stays manual entry (`configured:false`), never fabricated.

## Verification commands (operator)

- Frontend: `cd vendora-pos/frontend && npm run build && npm run test`.
- Backend (DB-free): `cd vendora-pos/backend && npm run test:unit` (+ the pure `money`/`pwaNotify`/
  `pwaStoreAccess`/`invoiceOcr` suites run under a full `npx jest`).
- Backend (DB-gated integration, incl. isolation): set `VENDORA_TEST_URI` to a test Mongo and run
  `npx jest --testPathPattern="integration"`. These cover auth/roles, sync + role store-access, notify prefs
  and cross-tenant isolation.
