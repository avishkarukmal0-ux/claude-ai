# 2026-10-14 — 375px accessibility sweep: tap targets, landmarks, headings, layout

Goal: fix the auditor's 375px UI sweep (SW v44, bundle index-CAyETg14.js). Every interactive target ≥44px in both directions; real switches; accessible names; one "Back" label; proper `<main>` + h1; max-width on wide screens.

## BACK/HOME — one standard control, label "Back"
- The shared [[ScreenBack]] (`components/common/ScreenBack.jsx`, 44px, aria-label "Back") already existed; 15 screens still used an inline `<button>…<ArrowLeft/> Home|Back</button>` (~20px tall). Scripted the swap to `<ScreenBack onBack={…} />` across: RefillView, CreditNoteRecoveryView, SuggestionsInbox, SupportView, ConflictRecovery, NotificationsView, MergeView, ProductHistory, DeadStockView, ImportView, MonthlyOutcomesView, SalesImportView, NeighbourhoodInsightsView, CategoryInsightsView (dropped the now-unused `ArrowLeft` import each).
- Removed every `label="Home"` on existing ScreenBack usages (23 screens) so they fall back to the default **"Back"** — consistent label everywhere. StocktakeView's in-flow "Back to counting" kept its descriptive label but is now a 44px ScreenBack.
- Welcome screen (`pages/NichePickerPage.jsx`): inline "All shop types" (118×20) → `<ScreenBack onBack={back} />`.

## CONTROLS
- **NotificationsView** `Toggle`: already `role="switch"` + `aria-checked`; added `aria-label` (passed "Reminders on this device" / "Email digest") and a 44×44 tap area wrapping the 44×24 visual track.
- **RefillView** search input: added `aria-label="Search products"` + `min-h-[44px]`.
- **DeadStockView** 14d+/30d+/60d+ chips (28px): `min-h-[44px]` + `aria-pressed` + `aria-label`.
- **WasteView** quick-add name input: added `aria-label="Item name"` (the £/Qty inputs were already wrapped in `<label>`).
- **BuyingJourneyView** "Receive a delivery" (40px) and **SupportView** "Create a problem report" (40px): `min-h-[44px]`.
- **CloudBackups** Refresh: added `min-h/min-w-[44px]` belt-and-braces (was h-11/w-11, already labelled).
- **RefusalsLogTool**: the product input was the one unlabelled control → `aria-label="What they tried to buy"`; bumped it + initials/note/reason to `min-h-[44px]`.

## COMPLIANCE DIALOGS
- **ComplianceNote** (shared source-link footer, used by ~20 tools): the GOV.UK / Business Companion link is now its own `min-h-[44px]` row at 12px text; root `<p>`→`<div>` so the link block is valid.
- **ComplianceRadar**: `OfficialLink` (×8) → `min-h-[44px]` row; the 9px "days" badge label lifted to 12px ("d").
- **AgeCheckHelper** / **VapeProductCheck**: checkbox `<label>` rows → `min-h-[44px]` (checkbox stays 20px, the row is the target); vape "check" inline link → 44px + `stopPropagation` (so it doesn't tick the box); product/number/date fields → `min-h-[44px]`.
- **MupCalculator**: Scotland/Wales toggles (36px) → `min-h-[44px]`; fields → `min-h-[44px]`.

## LANDMARKS / HEADINGS
- `<main>` added to `pages/AccountPage.jsx` (was a bare `<div>`) and `pages/NichePickerPage.jsx` (wraps steps + footer).
- `HomePage` sr-only `<h1>` used the raw screen key (`screen.replace(/-/g,' ')` → "outcomes", "cloud backups"). Added a `SCREEN_TITLES` map so it announces the human title ("This month", "Staff view", "From the team", "Cloud version history", "Staff access", "Help & diagnostics", etc.), with a title-cased fallback.

## LAYOUT
- `HomePage` `<main>` had no max-width → full width at ≥768px. Added `mx-auto w-full max-w-2xl` (672px, within the 640–720 target), matching the bottom nav.

## Part 2 — data screens (same sweep, second pass)
- **ScreenBack** now sets `aria-label={label}` so the accessible name matches the visible text on every back button.
- **CreditNotesView**: "Match to claims"/"Close", Allocate/Update, Remove all → `min-h-[44px]`; the allocate amount field got `aria-label` (incl. claim name) + 44px; dropped the unused `ArrowLeft` import.
- **InventoryView** (Stock + Edit product): 17 EditForm fields/buttons (name/barcode/category/supplier/cost/price/pack/case, Add, Add supplier alias, Save changes, Cancel) scripted to `min-h-[44px]`; per-row supplier/expiry/date-type selects now name the product (`Supplier for <name>`); the "⋯" row menu has an accessible name, moves focus to the first item on open and Escape closes + returns focus to the trigger; new **"No products match …" empty state** with a Clear-search button.
- **DeliveryReceivingView**: the "receive against which order" select → 44px + `aria-label`.
- **OrdersView** copy: intro no longer implies a "Mark as sent" button is always present — it's framed as appearing on draft orders.
- **PriceAlertsView** copy: cost/margin now use a literal "→" (was an icon that scraped as "61% 49%") → reads "61% → 49%"; dropped the unused `ArrowRight` import.
- **CloudBackups**: mapped every remaining sync store key (business_profile_v1, markdowns_v1, temperature_log_v1, …) to readable names + prettified fallback (no more shouty "BUSINESS_PROFILE"); Restore button's accessible name now names the section.

## Verify
- `npm run build` ✓. Full vitest: **545 passed / 80 files** (both passes). SW bumped **v44→v46** (Vercel on push).

## Couldn't verify
- No headless 375px re-measure in this environment (no browser screenshot run); relied on the source (explicit `min-h-[44px]`/44px classes), build, and tests. The auditor's re-run is the acceptance gate.

Commit: see git log (branch `claude/vendora-pos-v3-KPnI0`).
