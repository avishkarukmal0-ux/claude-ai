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
| 3.9f | Preserve unsaved forms on navigate / error | delivery + stocktake autosave to stores ✅; **invoice review, add/edit product, scan "add unknown" LOSE input on tab/screen switch** (unmount drops local state) | 🟡→ | a `useFormDraft` hook persisting to a local-only key; wire the three losing forms | switch away + back keeps typed input (test) |
| 3.9g | Test on Android Chrome + iPhone Safari/PWA | — | 🟡 | report what's verifiable in code/CI (jsdom) + a manual-check list; true device testing is out-of-sandbox | documented |
| 3.9h | Keep large doc/image processing off the UI | OCR/AI run on the **backend** ✅; but no web worker; invoice keeps full ≤8MB base64 on the main thread, no client downscale; delivery downscales on main thread | 🟡→ | async image downscale (shared `lib/image.js`, `createImageBitmap` when available) before storing/sending the invoice image | invoice image downscaled off the critical path |

## 3.10 Operational monitoring & support

| # | Requirement | Existing evidence | Status | Change | Acceptance |
|---|---|---|---|---|---|
| 3.10a | Monitor failed saves / sync / doc-processing / reminder failures | failed-save → persistent strip (`saveStatus`); sync error → indicator; **OCR error silently dropped** (`InvoiceCaptureView` discards `res.error`); reminder failure not surfaced; **no persisted counter/log** | 🟡→ | `lib/diagnostics.js` persisted failure counters + recent-events ring (no sensitive data); hook save/sync/OCR/reminder failures in; stop dropping OCR error | failures counted + visible (test) |
| 3.10b | Internal diagnostics without exposing shop data | scattered live signals (`getSaveStatus`/`getSyncState`); `ErrorBoundary` console-only; **no version string in FE** (`VITE_APP_VERSION` unused) | 🟡→ | a Diagnostics view: app version, last-sync, pending, conflict + failure counts — counts only, no shop data | diagnostics view shows safe signals |
| 3.10c | Problem-reporting flow with a reference number | **MISSING** entirely (no support/feedback UI or route) | 🔲→ | a "Report a problem" screen that generates a local **reference number** + a copyable summary (version + counts + recent error *types*), guidance to send it; auto-transmits nothing | report gives a reference + copyable summary (test on the ref generator) |
| 3.10d | Don't auto-transmit documents / personal data with reports | no telemetry/error channel exists; nothing is sent | ✅ (preserve) | the new report is copy-to-send only — never auto-uploads documents or personal data | report sends nothing automatically |
| 3.10e | Document how operators investigate | backend `/health` + central `errorHandler` + winston ✅ | 🟡→ | document the diagnostics + report flow + backend signals in [[Deployment-Config]] | documented |

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
- ⏳ **In progress.** Per-area commits (3.9b a11y → 3.9a mobile/forms → 3.10 ops), each with tests where
  unit-testable; this checklist updated as each lands.
</content>
