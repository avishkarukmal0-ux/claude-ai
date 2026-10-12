# 2026-10-12 — Re-audit (v24) batch: add-form, barcode, scanner polyfill, self-host fonts, manifest

Back to [[Work-Log]] · [[Home]] · related: [[2026-10-12-Reaudit-v24-Final-Small]]

**Domain(s):** Stock add/edit forms, barcode scanner, fonts, manifest
**Branch:** `claude/vendora-pos-v3-KPnI0` · base: `d0e6ed7`

The re-audit was against **v24**; items 1, 7, 8 and the listed 44px targets were already fixed in **v25**
(`d0e6ed7`). The genuinely-new items in this batch:

- **Add-product form (items 2+3)** — a `ScreenBack` (44px "Back") at the top; all fields, the supplier select
  and Save/Cancel raised to ≥44px with 16px text; the **Undo toast button** raised to 44px.
- **Scan-to-identify (item 3)** — inline back link replaced with the 44px `ScreenBack`.
- **Barcode validation (item 4)** — a barcode is optional but, if entered, must be **8–14 digits**
  (`validBarcode`, enforced + hinted on both Add and Edit forms; unit-tested).
- **Scanner polyfill (item 5)** — `BarcodeScanner` now uses the native `BarcodeDetector` where present and
  otherwise **lazy-loads the `barcode-detector` WASM ponyfill**, so iPhone Safari / Firefox can scan. The
  ponyfill is a separate 43 KB chunk (loaded only on those browsers when scanning), not in the main bundle;
  manual entry still works if the decoder can't load offline.
- **Self-hosted fonts (item 6)** — Poppins + IBM Plex Mono now ship via **Fontsource** (latin woff2, the 4+3
  weights used), imported in `main.jsx`; the `fonts.googleapis.com` / `gstatic` `<link>`s are removed from
  `index.html`. 7 woff2 files are emitted and runtime-cached by the SW (offline after first load).
- **Manifest (item 9)** — added `lang: "en-GB"` + `dir: "ltr"`.

## Verification
- **FE 521/521 (+2) + build green.** New test: `barcode-validation`. New deps: `barcode-detector@2`,
  `@fontsource/poppins@5`, `@fontsource/ibm-plex-mono@5` (package.json + lockfile committed). **SW v25→v26.**
- **Not performed here:** live camera scan on iPhone/Firefox (browser/WASM-only) and the 375px/console re-audit.

## Could not do here / flagged
- **Manifest screenshots (item 9)** — need real on-device captures; I can't take them in this environment, so
  I added `lang`/`dir` and left screenshots for a device capture (adding fake ones would mislead the install UI).

## Follow-ups
- [ ] Owner: redeploy Vercel (SW v26); test the camera scan on an iPhone/Firefox; add real manifest screenshots.
