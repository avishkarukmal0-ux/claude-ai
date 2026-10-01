# 2026-10-01 — Scan auto-fill: barcode → name/category

Back to [[Work-Log]] · Builds on [[2026-10-01-Scan-Identify]] · [[Backend/API-Routes]]

## Why
Founder: "today a scan identified only the barcode, not the other fields." Expectation-setting first — the
product fields split in two:
- **Never from a barcode (shop-specific):** cost, price, qty, min, supplier, expiry. These are the shop's
  own numbers; no database knows them — always entered by the shop.
- **Can be looked up by barcode:** name, category (+ brand). Not on the label, but resolvable from a public
  product DB. This is what was missing — an unknown scan only kept the number.

So: add an opt-in auto-fill that pulls **name + category** for an unknown scan. Explicitly a *setup
accelerator*, not magic; coverage is patchy for tobacco/news/alcohol/vape.

## Design — proxy server-side (not from the browser)
- **Backend** `services/productLookupService.js`: `lookup(barcode)` calls Open Food Facts
  (`/api/v2/product/<ean>.json`) with a 4 s timeout + proper User-Agent; `mapOffProduct()` (pure) →
  `{ found, name, category, brand, source }` (category = most-specific `categories_tags`, humanised).
  Never throws — any failure = `{ found:false }`. Returns ONLY name/category/brand.
- **Backend** `routes/pwaLookupRoutes.js`: `GET /api/pwa-lookup/:barcode`, token-gated (PWA access token)
  so it isn't an open proxy. Mounted always in `routes/index.js`.
- Why server-side: keeps the call off the client (CORS + our strict CSP only allows our own API host — so
  **no CSP change needed**), lets us set a User-Agent, and gives one place to cache/swap later. Node 22 has
  global `fetch`; no new dependency.
- **Frontend** `lib/productLookup.js`: `lookupBarcode(code)` → our backend; guards (accounts on, online,
  signed in, code ≥6 digits), 401-refresh-retry, never throws. Guests (no token) just type manually.
- **Frontend** `ScanIdentifyView` → `AddUnknown`: on an unknown scan, auto-looks-up and pre-fills *empty*
  name/category only (never overwrites typed input); shows "Looking up…" then "Found online — please check…
  You still set the price & stock," or stays silent on a miss.

## Honest limits (documented in UI + code)
- Only name/category/brand; never price/cost/stock/supplier/expiry.
- Patchy for c-store non-food lines; a miss falls straight back to manual entry.
- Requires a signed-in account (endpoint token-gated); guests type manually.

## Verification
- Backend: app boots; `test:unit` **56/56** (+6 new `productLookup.test.js` for the pure mapper/label —
  no network). Live lookup only works from the deployed Render backend (sandbox egress is blocked), so the
  real OFF call is verifiable there, not here.
- Frontend: full **126/126**; build clean. Client is thin/guarded (logic lives in the tested backend mapper).

## Follow-ups
- Founder to test on-device: scan an unknown packaged item (e.g. a chocolate bar) → name/category should
  pre-fill; scan a cigarette pack → likely "not found," type it in.
- Optional later: small server-side cache; a "look up" button in the Stock add-form too.

## Commit
`feat(pwa): barcode auto-fill (name/category) via Open Food Facts backend proxy`
