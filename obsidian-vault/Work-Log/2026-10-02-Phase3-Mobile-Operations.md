# 2026-10-02 — Phase 3: Mobile quality & operations

Back to [[Work-Log]] · Checklist: [[Phase3-Mobile-Operations-Coverage]] · follows [[2026-10-02-Phase2-Faster-Daily-Work]]

Final mandate phase (PWA-only). Three read-only audits (mobile robustness, accessibility, operational
monitoring) then close the verified gaps. Full map in [[Phase3-Mobile-Operations-Coverage]].

## 3.9b — Accessibility (WCAG 2.2 AA) ✅ (`4b5d388`)
Systemic fixes the per-component Tailwind classes missed:
- **prefers-reduced-motion** block (there was none) — stills the infinite pulse/spin + near-zeroes transitions.
- **Global `:focus-visible`** ring (beats the many `focus:outline-none` with no replacement — NavTab,
  NumericKeyboard, inputs, close buttons).
- **Contrast**: lift `text-gray-400` (~2.8:1 → ~5:1) + NavTab inactive colour.
- **Touch targets**: modal close 32→44px; Stock row actions 24→~32px (above the 24px AA minimum).
- **Labels**: NumericKeyboard backspace + AddForm inputs. **Skip link** + `#main-content`. `lang`/landmarks
  were already present.

## 3.9a — Mobile robustness ✅ (`701695e`)
Scan fallbacks + camera-denial handling were already solid. Closed:
- **Unsaved forms**: `useFormDraft` (device-local, non-synced) keeps a half-typed Add-product form across a
  tab/screen unmount. Delivery + stocktake already autosave; invoice capture already has explicit Save draft.
- **Heavy image off the critical path**: `lib/image.downscaleImage` (createImageBitmap + OffscreenCanvas when
  available, graceful fallback) shrinks the invoice photo before it's held/sent — no more full ~8MB base64.

## 3.10 — Operational monitoring & support ✅ (this commit)
- **Diagnostics** (`lib/diagnostics.js`): device-local failure counts + capped event ring (kind + short code
  + time only — never shop data). Self-captures save + sync failures; OCR failures now recorded (invoiceOcr
  returns `failed`; capture records + prompts manual entry instead of silently dropping); reminder failures
  recorded in `maybeNotify`.
- **Help & diagnostics view** (`SupportView`, More→Settings): safe status snapshot (version, sync, last-sync,
  failure counts/types) + a **Report a problem** flow that mints a reference (`VEN-YYYYMMDD-XXXX`) and a
  copyable summary. **Copy-to-send only — nothing is transmitted automatically; no documents/personal data.**
- **Frontend version** surfaced (`VITE_APP_VERSION`, fallback 3.0.0). Backend `/health` + central error
  handler + winston were already in place; added a Monitoring & support section to [[Deployment-Config]].

## Verification
FE **267/267** (vitest); build clean. No backend code changes. Acceptance scenario "camera & notification
permissions denied" is satisfied by existing handling (scanner → manual entry; notifications default-off +
graceful deny).

## Manual device-check list (not runnable in the sandbox)
Android Chrome + iPhone Safari/PWA: install prompt / A2HS; camera primer + denial → manual entry; reduced-
motion setting stills animations; focus ring visible via keyboard; demo load/exit; add-product draft survives
a tab switch; invoice photo capture stays responsive. (Logic is covered by vitest + build; true device runs
are outside this environment.)

## Outcome — mandate complete
Phases 1–3 all delivered. See the per-phase checklists + the final report in chat.
</content>
