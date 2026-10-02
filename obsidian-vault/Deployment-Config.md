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
| `SYNC_HISTORY` | backend | off | `true` keeps a server-side version history of each synced store so a bad overwrite / lost conflict is recoverable (owner → More → Data → Cloud version history → Restore). Off → latest-only, exactly as before. |
| `DOC_BACKUP` | backend | off | `true` enables cross-device backup of invoice photos/PDFs over `/api/pwa-docs` (stored in GridFS, NOT the JSON sync blobs). Off → the endpoints report `enabled:false` and files stay device-local, exactly as before. Needs accounts/sync in use. |
| `DOC_BACKUP_PROVIDER` | backend | gridfs | Storage provider for `DOC_BACKUP`. `gridfs` needs no extra service or secret (uses the existing Mongo). |
| `DOC_MAX_FILE_MB` | backend | 10 | Per-file size cap for document backup. |
| `VITE_DOC_BACKUP` | frontend | off | `true` shows the per-invoice "Back up" control (owner/manager). Must match the backend `DOC_BACKUP`; the UI also checks the server's `/status` before offering it. |
| `PRODUCT_IMAGES` | backend | off | `true` enables cross-device product-picture backup over `/api/pwa-images` (GridFS, shop-scoped, all roles). Off → photos stay on-device (still fully usable). |
| `PRODUCT_IMAGE_MAX_MB` | backend | 5 | Per-image size cap (after client compression). |
| `VITE_PRODUCT_IMAGES` | frontend | off | `true` lets the app back up/fetch product photos cross-device (needs backend `PRODUCT_IMAGES`). Off → taking/showing photos still works on the device that took them. Product pictures are a CORE feature, never behind the paid add-on. |
| `INSIGHTS_ENABLED` | backend | off | `true` mounts the `/api/pwa-insights` routes (the paid add-on). Off → the whole add-on is absent and the core PWA is unaffected. |
| `INSIGHTS_DATA_PROVIDER` | backend | off | The census DATA source (`nomis` once OA centroids + table ids are in place). Unset → profiles return `configured:false` (never fabricated numbers). |
| `INSIGHTS_BILLING_PROVIDER` (+ `INSIGHTS_BILLING_WEBHOOK_SECRET`, `INSIGHTS_PRICE_*`) | backend | off | Entitlement/billing source. Unset → purchasing is unavailable and no account is entitled. |
| `VITE_INSIGHTS_ENABLED` | frontend | off | `true` shows the Neighbourhood Insights tile/screen (owner/manager). Must match backend `INSIGHTS_ENABLED`. |
| `SYNC_HISTORY_KEEP` | backend | 10 | Revisions kept per store when history is on. |
| `SYNC_HISTORY_TTL_DAYS` | backend | 30 | History older than this self-expires (TTL index backstop). |

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

## Backup & recovery (Phase 1.3)

Vendora keeps data safe at three independent levels — know which is which:

| Level | What it is | Where | Recovers from |
|---|---|---|---|
| **On-device** | the live local-first copy (localStorage + IndexedDB mirror) | the phone | app restart, offline, eviction (restored on boot) |
| **Local export** | a manual, versioned `.json` file the owner saves/shares | wherever they save it | lost/replaced device; a bad local change (Restore from backup) |
| **Cross-device sync** | the latest value of each store, per shop account | the backend (`SyncBlob`) | setting up a new device (re-pulls everything) |
| **Server version history** | last N revisions of each store (opt-in) | the backend (`SyncBlobHistory`) | a bad overwrite / lost two-device conflict (owner restores a prior version) |

**Sync is not a backup.** Cross-device sync holds only the *latest* value; without `SYNC_HISTORY` a bad
overwrite replaces the server copy. The app says so in More → Data, and the **local export** is the always-
available restore point. Turn on `SYNC_HISTORY` for recoverable server-side versions.

- **Last successful backup** is shown on the Export row (More → Data) per device.
- **Local restore** validates the file, previews per-store counts, auto-downloads a recovery copy of current
  data first, and is atomic (snapshot + rollback) — an interrupted restore leaves data unchanged.
- **Server restore** (owner/manager) writes the chosen revision as a new current revision (so it propagates
  to every device) and is itself snapshotted, so a restore can be undone. Staff cannot restore.
- **Two-device conflicts**: the losing device's edit is kept locally under More → Data → **Recovered changes**
  (download/clear), so last-write-wins is never a silent loss.
- **Retention**: server history keeps `SYNC_HISTORY_KEEP` revisions per store and expires anything older than
  `SYNC_HISTORY_TTL_DAYS`. Local exports are kept by the owner wherever they saved them (no server retention).

### Enabling server version history (operator)
1. **Render → the backend service → Environment**: set `SYNC_HISTORY=true` (optionally `SYNC_HISTORY_KEEP`,
   `SYNC_HISTORY_TTL_DAYS`). Redeploy. Needs accounts/sync in use (`VITE_ACCOUNTS_ENABLED=true`).
2. Verify: `GET /api/pwa-sync/history` (with a shop token) reports `enabled:true`; the owner sees
   More → Data → **Cloud version history**. Safe to turn off again — it simply stops recording new versions.

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

## Document backup (invoice photos/PDFs — Phase 3)

Invoice records (figures) already sync; the **raw files** (photos/PDFs) are device-local by default and were
excluded from backup. `DOC_BACKUP` adds an authorised, shop-isolated backup so a file can be recovered on
another device.

- **Storage:** GridFS (MongoDB) by default — multi-MB binaries stored chunked, **not** in the JSON sync
  blobs. No new provider or secret beyond the existing `MONGODB_URI`. The provider is a seam
  (`config.docBackup.provider`) for a future S3/object-store without changing callers.
- **Isolation:** every file is tagged with the authenticated account id; every download/delete filters on
  it, so one shop can never read another's document. Routes are owner/manager only (invoices are financial).
- **States:** the app shows per-file **pending / backed-up / failed** and a **Retry** on failure; the server
  list is authoritative for "Backed up". Re-upload replaces the prior copy (idempotent) so an interrupted
  upload is safe to retry.
- **Retention/deletion:** "Delete file" removes the local copy (keeps the invoice record); deleting the
  server backup is a separate authorised action. Nothing is auto-deleted.
- **Validation:** type (jpeg/png/webp/heic/pdf) and size (`DOC_MAX_FILE_MB`, default 10) are enforced
  server-side (and multer caps the request body).

### Enabling (operator)
1. **Render → backend → Environment:** `DOC_BACKUP=true` (optionally `DOC_MAX_FILE_MB`). Redeploy.
2. **Vercel → frontend → Environment:** `VITE_DOC_BACKUP=true`. Redeploy. Needs `VITE_ACCOUNTS_ENABLED=true`.
3. Verify: `GET /api/pwa-docs/status` (with a shop token) reports `enabled:true`; the owner sees a "Back up"
   control on each invoice that has a stored file.

### ⚠️ Recovery not yet verified end-to-end here
The upload→download **round-trip, isolation and delete are covered by a DB-gated integration test**
(`backend/src/__tests__/pwaDoc.integration.test.js`), which runs only with a real test Mongo
(`VENDORA_TEST_URI`). It was **not run in this environment** (no Mongo in the sandbox). Per the mandate, do
not tell owners a document is recoverable until you have run that test (or done a manual cross-device
restore) against your live storage. The UI only claims "Backed up" after the server confirms an upload — it
makes no cross-device recovery promise beyond what the server reports it holds.

## Product pictures (core feature)

Show a product photo after a scan, selection order: **owner photo → confirmed catalogue image → provider
suggestion → placeholder**.

- **On-device first:** an owner photo is compressed to a full image + thumbnail and kept on the device
  (`lib/productImages.js`, per-image local keys — never in the sync blobs; only a small `product.image` ref
  syncs). Works offline immediately; a canvas re-encode strips EXIF/GPS metadata.
- **Cross-device backup (opt-in):** with `PRODUCT_IMAGES=true` (+ `VITE_PRODUCT_IMAGES=true`) the full image
  is backed up to GridFS, shop-scoped (every read/delete filters on the account id), and cached as a thumb
  on other devices for offline use.
- **Provider suggestions:** Open Food Facts product photos, fetched through a CSP-safe, host-allowlisted
  backend proxy (`/api/pwa-lookup/image`). They are **labelled "SUGGESTED" and attributed** (CC BY-SA 3.0),
  never shown as the shop's own and never stored until the owner confirms. An owner photo is never
  overwritten automatically. No fabricated packaging, no arbitrary web images.
- **Validation:** image types + size enforced client-side and server-side; deletion is recoverable (undo).

## Neighbourhood Insights (optional PAID add-on)

Aggregate residential-area profiles (ONS Census 2021) within a radius of the shop, to plan small product
trials. **Entirely optional — the core PWA is fully usable without it.** Three independent switches, all
default OFF; nothing shows numbers or takes payment until configured.

### What it is / isn't
- Uses **official aggregate statistics only** — no individual, household, name, face or behaviour profiling;
  never infers an individual's ethnicity/religion/diet; nearby residents are **potential** customers, never
  proof of demand. Every profile is labelled **estimated** with source/year/coverage/method/limitations and
  the OGL attribution.

### Data sources + licences (verified, England & Wales first)
- **Location:** postcodes.io (`api.postcodes.io`) — postcode → lat/long + country + OA21/LSOA21 codes.
  Data under **OGL v3.0** (ONS Postcode Directory incl. OS + Royal Mail — show all three attribution lines).
- **Census counts:** **ONS Census 2021 via Nomis** (`nomisweb.co.uk`, bulk + REST API, free, OGL). Tables:
  TS001/TS041 (population/households), TS021 (ethnic group), TS024 (main language), TS007A (age), TS003
  (household composition). *The exact `NM_` ids + geography TYPE codes must be confirmed at
  `nomisweb.co.uk/api/v01/help` before enabling.*
- **Geography:** ONS Open Geography Portal — **Output Areas (Dec 2021) EW population-weighted centroids**
  (OGL) — the file that drives OA selection.
- **Scotland (NRS 2022) and NI (NISRA 2021) are SEPARATE** censuses/years/geographies — not derived from the
  E&W data; a non-E&W postcode is returned `supported:false`.

### Method (documented + defensible)
- **Centroid-in-radius ("best-fit"):** a whole Output Area is included when its population-weighted centroid
  is within the radius; counts are summed across included OAs. A circle never matches census areas, so the
  result is **always an estimate**, marked as such with the OA count. Disclosure control is preserved: ONS
  data is already perturbed (record swapping + cell-key perturbation), and small cells are shown as
  "fewer than N" — never a precise tiny figure.

### Enabling (operator)
1. **Data:** load the OA 2021 population-weighted centroids, confirm the Nomis table ids/TYPE codes, implement
   the provider adapter at `backend/src/services/insightsData/<name>.js` (exports `fetchAreaProfiles(point,
   radiusM)`), then set `INSIGHTS_DATA_PROVIDER=<name>`. Until then profiles honestly say "not configured".
2. **Billing (no commercial terms are set in code):** decide a price → set `INSIGHTS_BILLING_PROVIDER`,
   `INSIGHTS_PRICE_MINOR`/`_CURRENCY`/`_INTERVAL`, `INSIGHTS_BILLING_WEBHOOK_SECRET`, and build the provider
   adapter (checkout + normalised webhook events: purchased/renewed/payment_failed/cancelled/ended). Until
   then `/checkout` returns "purchasing unavailable" and no account is entitled.
3. **Frontend:** `VITE_INSIGHTS_ENABLED=true` (+ a map tiles provider later for an interactive confirm map).
4. **Access policy:** entitlement is server-enforced on `/profile` (owner/manager, scoped to the shop account —
   a client can't self-grant). Cancel keeps access until the period end; a failed payment (`past_due`) denies
   access until a renewal restores it.

### ⚠️ Not live-verified here
No census data provider or billing provider is configured, and the sandbox can't reach ONS/Nomis/postcodes.io
or a test Mongo — so **no real profile or purchase has been run**. The DB-gated integration test
(`pwaInsights.integration.test.js`: entitlement enforcement, per-shop isolation, webhook lifecycle) and the
Nomis/centroid wiring must be run against configured services before telling owners the add-on is live. Do
not market a subscription as "continuously updated" data — the census updates only every ~10 years; the
recurring value is the ongoing **trial tracking + decision support**.

## Monitoring & support (Phase 3.10)

How an authorised operator investigates a problem — no sensitive shop data leaves the device unless the
owner chooses to send it.

- **What the owner sees:** More → Settings → **Help & diagnostics** shows a safe snapshot (app version, sync
  state, last-sync time, and counts of failed saves / sync / invoice-scan / reminder failures) plus recent
  issue *types* (kind + short code + time) — never stock, invoices or customer data. "Report a problem" mints
  a reference (`VEN-YYYYMMDD-XXXX`) and a **copyable** summary the owner sends to support themselves. Nothing
  is transmitted automatically; documents and personal data are never attached (there is no telemetry channel).
- **Where failures are recorded:** `frontend/src/lib/diagnostics.js` (device-local `vendora:diagnostics`,
  capped). It self-captures save + sync failures from the app's own events and is called explicitly for OCR
  and reminder failures. Cleared by the owner via "Clear recorded issues".
- **Backend signals:** `GET /health` and `GET /api/health` return `{status, db, version, env}`. All errors
  funnel through the central `errorHandler` (structured `{success,error:{code,message}}`) and Winston logs
  (`error.log` / `combined.log`, JSON in production) with per-request logging. To investigate a reported
  reference: match the time window in the logs; the reference itself is client-side (not sent to the server),
  so correlate by account + timestamp + the failure kinds the owner pasted.
- **App version for triage:** set `VITE_APP_VERSION` in the Vercel env so the diagnostics panel shows the
  exact build; it falls back to `3.0.0`.

## Verification commands (operator)

- Frontend: `cd vendora-pos/frontend && npm run build && npm run test`.
- Backend (DB-free): `cd vendora-pos/backend && npm run test:unit` (+ the pure `money`/`pwaNotify`/
  `pwaStoreAccess`/`invoiceOcr` suites run under a full `npx jest`).
- Backend (DB-gated integration, incl. isolation): set `VENDORA_TEST_URI` to a test Mongo and run
  `npx jest --testPathPattern="integration"`. These cover auth/roles, sync + role store-access, notify prefs
  and cross-tenant isolation.

---

## Real integrations — completed 2026-10-02 (test-mode / provider-gated; not deployed)

Turns the product-image and Neighbourhood Insights seams into real integrations. Everything stays OFF by
default; the core PWA is unaffected. See [[Work-Log/2026-10-02-Real-Integrations]].

### 1) Product-picture storage — now with durable backup + explicit states

- **Durability:** backup goes to **GridFS inside MongoDB/Atlas**, never the Render disk — it survives
  restart/redeploy. multer uses memory storage; nothing is written to local disk.
- **Backend flag:** `PRODUCT_IMAGES=true` (+ `PRODUCT_IMAGE_MAX_MB`, default 5). **Frontend flag:**
  `VITE_PRODUCT_IMAGES=true`. Local photos work with both off.
- **States (per device):** `local` → `pending` → `backed-up` / `failed`, shown on the photo. Failed uploads
  are queued and retried automatically on regaining network/focus, or via the "retry" affordance.
- **Catalogue (approved) images:** confirming an Open Food Facts suggestion stores it as a `catalogue`
  image (attributed) and backs it up like an owner photo.
- **Authorised retrieval + deletion:** every route is scoped by the shop token; delete removes the GridFS
  copy. A second authorised device recovers photos via `GET /api/pwa-images/:id`.

### 2) Neighbourhood Insights — real ONS Census 2021 (England & Wales) via Nomis

- **Flags/config:** `INSIGHTS_ENABLED=true`, `INSIGHTS_DATA_PROVIDER=nomis`, `INSIGHTS_CENTROIDS_PATH=<file>`.
  Optional: `NOMIS_API_BASE`, `INSIGHTS_NOMIS_TABLES_PATH`, `INSIGHTS_CACHE_TTL`, `INSIGHTS_FETCH_TIMEOUT_MS`,
  `INSIGHTS_MAX_OA`. Location via postcodes.io (`INSIGHTS_LOCATION_PROVIDER=postcodes_io`).
- **OA centroids (required, operator downloads once — ~190k rows, not bundled):** ONS Open Geography Portal,
  *"Output Areas (2021) Population Weighted Centroids"*, England & Wales, OGL v3.0. Export as CSV
  (`OA21CD,lat,long`) or NDJSON and point `INSIGHTS_CENTROIDS_PATH` at it.
- **Method:** centroid-in-radius ("best-fit") — a whole OA is included when its population-weighted centroid
  is within the radius. Different radii select different OAs → genuinely different totals. Population = Σ age
  breakdown; households = Σ household-composition. Small cells suppressed ("fewer than 10"); every figure
  labelled *estimated* with source/year/coverage/method + OGL attribution. Results cached per point+radius.
- **Tables:** TS021 ethnic group, TS024 main language, TS007A age, TS003 household composition. The Nomis
  dataset ids / dimension names in `services/insightsData/nomis.js` are **documented defaults to verify** —
  run the verify script against a known location and reconcile with the published ONS figures before trusting
  numbers; override via `INSIGHTS_NOMIS_TABLES_PATH` if the catalogue differs.
- **Verify script (operator env, needs network + centroids):**
  `INSIGHTS_DATA_PROVIDER=nomis INSIGHTS_CENTROIDS_PATH=/data/oa21_pwc.csv node scripts/verify-insights.js "EC1A 1BB" 1000`
- **Scotland/NI:** explicitly `supported:false` (separate censuses) until implemented.
- With no centroids file / no data provider the profile returns `configured:false` — honest "not set up",
  never fabricated numbers.

### 3) Billing — real Stripe (TEST MODE), add-on + optional core, idempotent signed webhook

- **Separate from the till subscription** (own endpoint, own webhook secret, own prices). Till stays disabled.
- **Flags/config:** `INSIGHTS_BILLING_PROVIDER=stripe`, `STRIPE_SECRET_KEY=sk_test_…`,
  `INSIGHTS_STRIPE_WEBHOOK_SECRET=whsec_…`, `INSIGHTS_SALE_MODE=off|one_off|subscription`, price ids
  `INSIGHTS_STRIPE_PRICE_CORE` / `_ADDON` / `_ONEOFF`, `INSIGHTS_PRICE_CURRENCY`, `INSIGHTS_REPORT_VALID_DAYS`,
  success/cancel URLs. **Safety:** an `sk_live_` key is refused unless `BILLING_ALLOW_LIVE=true`.
- **Model:** one Stripe subscription carries the Vendora Shop core item **and** the optional Insights add-on
  item → one invoice, one billing date. Cancelling the add-on item leaves the core subscription running.
- **Proposed prices (test):** core £19/mo, add-on £5/mo (combined £24), or a one-off report. Set as price ids
  in the Stripe dashboard — no commercial terms are hard-coded.
- **Recurring guard:** a recurring Insights subscription is only offered once the census data is configured;
  otherwise the sale falls back to a one-off report (or off). So we never take a recurring charge for data
  that isn't delivered yet.
- **Webhook:** `POST /api/pwa-insights/billing/stripe/webhook` — raw body, signature verified with the
  dedicated secret; entitlement is granted ONLY from the verified webhook reflecting the real subscription
  state (add-on item present), never from the checkout redirect. Duplicate deliveries are no-ops (idempotency
  ledger `ProcessedBillingEvent`), and out-of-order deliveries are ignored (created-time guard). Customer /
  subscription ids are mapped to the shop server-side.
- **Stripe dashboard steps (owner):** create the 3 test prices; add a webhook endpoint to the URL above and
  copy its signing secret into `INSIGHTS_STRIPE_WEBHOOK_SECRET`; set the price ids + `INSIGHTS_SALE_MODE`.

### Running the (previously skipped) integration tests — operator's disposable test DB

They are DB-gated and skip unless `VENDORA_TEST_URI` points at a **disposable** Mongo (never production):

```
cd vendora-pos/backend
VENDORA_TEST_URI=mongodb://localhost:27017/vendora_test npx jest --testPathPattern="integration"
```

Covered: product-image cross-shop isolation + second-device recovery + authorised delete; entitlement
enforcement (402 without it); the signed Stripe webhook granting access + rejecting a forged body; duplicate
and out-of-order webhook handling; payment-failure revocation; core PWA access remaining available without the
add-on. (They could not run in the build sandbox: no local Mongo + egress blocked — see the Work-Log.)

---

## Real neighbourhood area data (Step 1) — 2026-10-02 (OFF by default; not live-verified in sandbox)

One real figure (area population) for the store's postcode, from official data, cached with provenance and
offline-capable. The browser only calls OUR backend. See [[Work-Log/2026-10-02-Neighbourhood-Real-Data]].

**Flags/config (Render backend unless noted):**
- `NEIGHBOURHOOD_ENABLED=true` + frontend `VITE_NEIGHBOURHOOD_ENABLED=true`
- `ONS_USER_AGENT="vendora/1.0.0 (ops@yourdomain +https://claude-ai-indol.vercel.app)"` (ONS asks for this)
- `NEIGHBOURHOOD_SOURCE=ons` or `nomis`
- `NEIGHBOURHOOD_POP_DATASET=<id>` — **confirm from the live catalogue first; we do not hardcode a guess.**
  Nomis: `curl "https://www.nomisweb.co.uk/api/v01/dataset/def.sdmx.json" | grep -i population` →
  the `NM_xxxx_1` id. ONS: `curl "https://api.beta.ons.gov.uk/v1/datasets?limit=338"` → the population slug.
- `NOMIS_UID=<secret>` (optional; removes Nomis' 25k-cell guest cap) — env only, never in repo/chat.
- `NEIGHBOURHOOD_TTL_HOURS` (default 168), `NEIGHBOURHOOD_TIMEOUT_MS` (55000), `NEIGHBOURHOOD_STALE_MAX_DAYS` (400).

**Route:** `GET /api/pwa-neighbourhood/area?postcode=RM10%208AA` (PWA token, owner/manager) → figure + source,
datasetId, edition/version, referenceDate ("Census 2021"), the dataset's last_updated, fetchedAt, freshness,
OGL attribution. `GET /api/pwa-neighbourhood/status` → what's configured.

**Freshness/refresh:** on-demand — re-fetches when the cached record is older than the TTL or the dataset's
last_updated is newer. No in-process timer (Render free tier sleeps). A scheduled refresh would be a separate,
costed proposal — not added.

**Offline (PWA):** the client stores the last response per postcode in the durable localStorage+IndexedDB store;
offline it shows that copy labelled "Last updated <date> (offline)". The service worker is unchanged — it
intentionally bypasses `/api`, so offline is handled at the app layer (never blocks POS/till).

**Verify live (owner env — sandbox egress is blocked, so this was NOT run here):**
```
curl "https://api.postcodes.io/postcodes/RM10%208AA"                 # → lsoa21 E01000036 …
curl -H "User-Agent: $ONS_USER_AGENT" "https://api.beta.ons.gov.uk/v1/datasets?limit=1"
curl "<backend>/api/pwa-neighbourhood/area?postcode=RM10%208AA" -H "Authorization: Bearer <token>"
```
Then in the app: load the figure, turn DevTools → Network → Offline, reload → the stored figure still shows,
labelled offline.

**DB tests (disposable test DB only — never vendora_pilot):**
`VENDORA_TEST_URI=mongodb://localhost:27017/vendora_test npx jest --testPathPattern="pwaNeighbourhood"`
