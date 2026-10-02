# 2026-10-02 — Product pictures (core feature)

Back to [[Work-Log]] · [[Home]] · config in [[Deployment-Config]]

**Domain(s):** Scan, Inventory, Product lookup, File storage
**Branch:** `claude/vendora-pos-v3-KPnI0`

## Goal
Show a product picture immediately after a successful scan, with selection order owner → catalogue →
provider suggestion → placeholder. Core app (not the paid add-on). Reuse existing lookup + GridFS storage +
`image.downscaleImage`.

## Reused
- `lib/image.downscaleImage` for compression + thumbnail (canvas re-encode also strips EXIF/GPS).
- The Phase-3 GridFS pattern (`pwaDocService`) — mirrored as a separate `productImageService` (own bucket,
  flag, image-only validation, all-roles) so invoice backup is untouched.
- `productLookup` / `productLookupService` (Open Food Facts proxy) extended to also return a suggested image.
- Scan result (`ScanIdentifyView`) and inventory rows for display.

## Changes
**Backend**
- `services/productLookupService.js` — lookup now returns `size` + a suggested `image`/`imageLarge` with
  `imageLicence`/`imageAttribution` (https OFF only); new `fetchImage` + `isAllowedImageUrl` (SSRF-guarded
  proxy of allow-listed OFF image hosts).
- `routes/pwaLookupRoutes.js` — `GET /api/pwa-lookup/image?url=` CSP-safe image proxy (before `/:barcode`).
- `services/productImageService.js` + `routes/pwaImageRoutes.js` (new) — GridFS `pwa_product_images`,
  shop-scoped upload/download/delete/list, any role, OFF unless `PRODUCT_IMAGES=true`. `config.productImages`.
**Frontend**
- `lib/productImages.js` (new) — local-first owner photos (full+thumb, per-image keys, never synced),
  `resolveImage` selection order, recoverable `removeImage`/`restoreImage`, `confirmSuggested` (fetch proxy →
  compress → store as attributed catalogue image), flag-gated cloud backup + offline thumb cache.
- `components/common/ProductImage.jsx` (new) — editable picture (Take/Upload/Replace/Remove/Use-suggested,
  attribution, non-blocking placeholder) + `ProductThumb` for lists.
- `ScanIdentifyView` — picture beside name/size/single-case on the scan result; `InventoryView` — row thumb.

## Honesty / safety
- Suggested images are labelled + attributed (CC BY-SA 3.0), never stored or shown as the shop's own until
  confirmed; owner photos never auto-overwritten; no fabricated packaging / arbitrary web images.
- Picture bytes never enter the JSON sync blobs (only a small `product.image` ref syncs). Shop-scoped GridFS;
  validated types/sizes; metadata stripped by the canvas re-encode.

## Verification
- `productimages.test.js` (9, FE): selection order, save, recoverable delete, confirm-suggested. Backend
  `productLookup.test.js` +4 (image mapping, https-only, image-only found, SSRF allowlist). DB-gated
  `pwaImage.integration.test.js` (5: round-trip, **cross-shop isolation**, bad-type, auth) — **skipped here
  (no sandbox Mongo).** Full FE suite **336/336**; build clean; backend loads.

## Commit(s)
- (this commit) — feat(pwa): product pictures after scan — core, shop-scoped, attributed (Phase 1 of 2)

## Limitations / follow-ups
- Delivery-screen thumbnail not yet added (inventory + scan done) — minor, "where helpful".
- Cross-device recovery not verified end-to-end (needs a test Mongo / live `PRODUCT_IMAGES`).
