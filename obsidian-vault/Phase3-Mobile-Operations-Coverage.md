# Phase 3 — Mobile Quality & Operations: Coverage Checklist

Back to [[Home]] · [[Work-Log/Work-Log]] · [[Phase1-Reliability-Security-Coverage]] · [[Phase2-Faster-Daily-Work-Coverage]]

Living map of the **Phase 3 mandate** → existing implementation (file:line) → change → acceptance. Status:
✅ done · 🟡 partial/gap · 🔲 to build · ⏳ in progress. Verified against the code (three read-only audits,
2026-10-02). Harden-and-close-gaps; report what was actually checked (no invented audit numbers).

---

## 3.9 Mobile usability & accessibility

| # | Requirement | Existing evidence | Status | Change | Acceptance |
|---|---|---|---|---|---|
| 3.9a | Scanning responsiveness + manual-entry fallback | every PWA scan flow has an always-reachable type-it-in path (`ScanIdentifyView`, `DeliveryReceivingView`, `StocktakeView`, `InvoiceCaptureView`); shared `BarcodeScanner` | ✅ | — | — |
| 3.9b | Handle camera denial / unavailable / unsupported | `BarcodeScanner` feature-detects + primer + clear denied/unsupported messaging → manual entry; callers gate on `barcodeScanSupported` | ✅ | — | camera-denied scenario |
| 3.9c | Readable text, touch targets, contrast | secondary-text `text-gray-400` globally lifted to ~#5b6472 (≈5:1) in `index.css`; NavTab inactive `#9CA3AF`→`#4b5563`; modal close 32→44px, InventoryView row actions 24→~32px (above the 24px AA minimum) | ✅ (3.9b) | — | **done** — AA contrast + comfortable targets |
| 3.9d | Accessible labels / focus / validation | global `:focus-visible` ring in `index.css` (beats stray `focus:outline-none`); NumericKeyboard backspace `aria-label`; AddForm inputs `aria-label`led; AccountView already `aria-invalid`+`role=alert` | ✅ (3.9b) | — | **done** — visible focus app-wide; labelled controls |
| 3.9e | WCAG 2.2 AA — report what's checked | `lang=en` ✅ + landmarks ✅; added a skip link + `#main-content`; added a `prefers-reduced-motion` block (was none — infinite pulse/spin now stilled) | ✅ (3.9b) | — | **done** — checks reported in Work-Log; device testing below |
| 3.9f | Preserve unsaved forms on navigate / error | delivery + stocktake autosave ✅; new `useFormDraft` (local-only) now keeps add-product input across a tab/screen switch; invoice capture already has an explicit **Save draft**; scan "add unknown" is a short in-camera flow (noted) | ✅ (3.9a) | — | **done** — `formdraft.test.js`: remount restores typed input, clear() wipes it |
| 3.9g | Test on Android Chrome + iPhone Safari/PWA | — | 🟡 (honest) | code/CI (jsdom + build) covers logic; true device testing is outside the sandbox — a manual device-check list is in the Work-Log | documented, not device-run here |
| 3.9h | Keep large doc/image processing off the UI | OCR/AI run on the **backend** ✅; now `lib/image.downscaleImage` (createImageBitmap + OffscreenCanvas when available, graceful fallback) shrinks the invoice photo before it's held/sent — no more full ≤8MB base64 on the critical path | ✅ (3.9a) | — | **done** — `image.test.js` (graceful fallback); wired in `InvoiceCaptureView` |

## 3.10 Operational monitoring & support

| # | Requirement | Existing evidence | Status | Change | Acceptance |
|---|---|---|---|---|---|
| 3.10a | Monitor failed saves / sync / doc-processing / reminder failures | `lib/diagnostics.js` persists failure counts + a capped recent-events ring (kind + short code + time only); self-captures save + sync from app events; OCR now records a real failure (`invoiceOcr` returns `failed`, `InvoiceCaptureView` records + prompts manual entry instead of dropping it); reminder failure recorded in `notifications.maybeNotify` | ✅ (3.10) | — | **done** — `diagnostics.test.js` (counts, self-wired save, clear) |
| 3.10b | Internal diagnostics without exposing shop data | `SupportView` shows app version (`VITE_APP_VERSION`), sync state, last-sync, failure counts + recent types — counts/metadata only, no shop data | ✅ (3.10) | — | **done** — More→Settings→Help & diagnostics |
| 3.10c | Problem-reporting flow with a reference number | `SupportView` "Report a problem" → `makeReference()` `VEN-YYYYMMDD-XXXX` + a copyable summary (version + counts + recent types) | ✅ (3.10) | — | **done** — `diagnostics.test.js` ref format |
| 3.10d | Don't auto-transmit documents / personal data with reports | copy-to-send only; summary carries no shop data/documents; no telemetry channel exists | ✅ (3.10) | — | **done** — report transmits nothing automatically |
| 3.10e | Document how operators investigate | backend `/health` + central `errorHandler` + winston ✅; now a Monitoring & support section in [[Deployment-Config]] covering the owner diagnostics/report flow + backend signals + reference correlation | ✅ (3.10) | — | **done** |

---

## Acceptance scenarios (Phase 3)
| Scenario | Plan | Status |
|---|---|---|
| Camera & notification permissions denied | `BarcodeScanner` denied→manual entry (✅ existing); notifications default-off + graceful deny (✅ existing) | ✅ (existing) — re-stated here |
| (reliability/daily scenarios in Phase 1/2 checklists) | — | — |

## Feature flags & disablement
- No new always-on backend workflow. Diagnostics + problem-report are local, user-opened, and transmit
  nothing. Any flag added is listed in [[Deployment-Config]].

## Phase gate status
- ✅ **Phase 3 complete.** Per-area commits, each with tests where unit-testable:
  - **3.9b accessibility** (`4b5d388`) — reduced-motion, global focus-visible, contrast, touch targets,
    labels, skip link.
  - **3.9a mobile** (`701695e`) — unsaved-form drafts (add-product) + async invoice image downscale.
  - **3.10 operations** (this commit) — diagnostics counters, Help & diagnostics view, problem-report with a
    reference number (copy-to-send only), OCR failures no longer dropped, frontend version surfaced, docs.
- **Verification:** FE **267/267**; build clean. No backend code changes (health/handler/logging already in
  place; docs updated). Device testing (Android Chrome / iPhone Safari) is outside the sandbox — a manual
  check list is in the Work-Log; everything logic-level is covered by vitest + the production build.
- **Deployment** left to the operator (mandate). Optional: set `VITE_APP_VERSION` for exact build triage.
</content>
