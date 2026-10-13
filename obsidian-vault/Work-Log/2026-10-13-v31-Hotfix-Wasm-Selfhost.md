# 2026-10-13 — v31 hotfix: Add/Edit crash + self-host scanner WASM

Back to [[Work-Log]] · [[Home]]

**Domain(s):** [[Scan]] · [[Stock]] · [[PWA]]
**Branch:** `claude/vendora-pos-v3-KPnI0`

## Goal
Hotfix the Stock Add/Edit crash, self-host the scanner WASM so it loads under a strict CSP, and clear the small follow-ups (Orders copy, Your-area 44px).

## Changes
- **#1 crash (commit 9cccf23, shipped first):** `src/components/inventory/InventoryView.jsx` — `export { validBarcode } from '../../lib/barcode'` re-exported the helper but didn't bind it in module scope, so `AddForm`/`EditForm`'s `validBarcode(...)` threw `ReferenceError` and crashed Add/Edit. Now `import { validBarcode }` for local use + `export { validBarcode }`. Regression test `inventory/__tests__/addedit-render.test.jsx` opens both forms.
- **#2 self-host scanner WASM:** copied `zxing-wasm@1.3.4/dist/reader/zxing_reader.wasm` → `public/zxing_reader.wasm` (served at `/zxing_reader.wasm`, ~917 KB). `scan/BarcodeScanner.loadDetectorCtor` now calls `setZXingModuleOverrides({ locateFile })` so the ponyfill fetches the wasm from our own origin instead of `fastly.jsdelivr.net` (which CSP connect-src blocked). `public/sw.js` precaches it (offline scanning). `vercel.json` CSP: `script-src` gains `'wasm-unsafe-eval'` (the minimal grant to compile wasm — JS eval stays blocked); connect-src unchanged (`'self'` + API). CSP stays strict.
- **#3 demo barcodes:** already numeric EAN-13 via `demo.js` `P()`/`demoEan` (prior commit) — the Stock "D-BREAD/D-COLA" seen was stale cached demo data; a fresh demo load (or Reset sample data) now gives numeric codes. Verifiable in Edit now #1 is fixed.
- **#4 Orders copy:** reworded so it points to where the button is — "On a **draft** order, tap Mark as sent / Share…" (the button exists only on drafts).
- **#5 Your area:** postcode input + Get button → 44px (+ aria-label, text-base).
- **#6 manifest screenshots:** already present (narrow 390×844 + wide 1280×800) — verified in manifest + dist.

## Decisions
- `'wasm-unsafe-eval'` is the correct, minimal CSP source to run WebAssembly; it does not permit arbitrary JS `eval`, so the policy stays strict. Self-hosting removes the CDN dependency entirely (offline + privacy).
- WASM precached in SHELL_ASSETS (best-effort) so first offline scan works; it survives SW version bumps per cache policy.

## Verification
- `npx vitest run` → 80 files, **533** tests pass (+ addedit-render regression). `npm run build` green; `dist/zxing_reader.wasm` present; `locateFile('zxing_reader.wasm')` → `/zxing_reader.wasm`.
- COULD NOT verify headlessly: a real camera scan instantiating the self-hosted wasm on iPhone Safari / Firefox — needs a device. The path, CSP grant, and precache are all in place.

## Commit(s)
- `9cccf23` #1 hotfix (SW v31→v32, deployed). `<hash>` #2–#6 (SW v32→v33).

## Follow-ups
- [ ] Live device scan check (iPhone Safari / Firefox) to confirm the self-hosted wasm decodes.
- [ ] Existing demo sessions: tap "Reset sample data" to pick up numeric demo barcodes.
