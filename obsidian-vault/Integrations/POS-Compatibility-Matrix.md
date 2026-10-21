# POS / till integration — provider compatibility matrix

Back to [[Home]] · see [[Sales-Ingestion-Design]] · [[Provider-Enquiries]]

**Docs checked:** 2026-10-21 (public documentation only). **No provider approval or commercial agreement is in
place.** No live provider connection has been verified — everything below is from public docs + unit tests with
fixtures. `itemLevel`: **confirmed** = provider documents per-line product+qty; **none** = payment/receipt
totals only (cannot deduct stock on its own); **unconfirmed** = not verifiable from public docs.

| Provider / product | Method(s) | Item-level | Availability | Access / approval | Known fees | Implemented | Actually tested |
|---|---|---|---|---|---|---|---|
| **Square** POS (Orders API) | Cloud (webhook+poll), CSV | confirmed | Ready for testing | Square OAuth app; shop authorises `read orders`. No special partner approval for basic order read. | Merchant's card fees; Orders API free | Adapter stub (live ops disabled) + registry + shared model | Unit/fixtures only — **no live Square call** |
| **Shopify POS** (Admin Orders) | Cloud (webhook), CSV | confirmed | Ready for testing | Shopify app with `read_orders`: custom app per shop, or reviewed public app for many shops | Merchant's Shopify plan; custom app free | Adapter stub + registry + model | Unit/fixtures only |
| **Lightspeed Retail** X-Series | Cloud (webhook+poll), CSV | confirmed | **Approval required** | OAuth2 / personal token; **access tier + fees unconfirmed** (third-party reports of paywalled API) | not confirmed | Adapter stub + registry + model | Unit/fixtures only |
| **Zettle** by PayPal (Purchases) | Cloud (push), CSV | confirmed | Ready for testing (single-merchant) | OAuth2; developer signup free. **Multi-merchant app needs PayPal/Zettle partner approval** | Merchant's card fees; API free | Adapter stub + registry + model | Unit/fixtures only |
| **Epos Now** (Transactions) | Cloud (poll; webhooks beta), CSV | confirmed | Ready for testing | HTTP Basic creds from an **API Device** the shop creates in Back Office / AppStore | Via Back Office/AppStore; paid tier not confirmed | Adapter stub + registry + model | Unit/fixtures only |
| **SumUp** (Transactions/Receipts) | CSV only | **none** | **Unsupported setup** (for item-level stock) | OAuth2; API free | Merchant's card fees | Adapter stub (cloud deliberately absent) | Unit/fixtures only |
| **PayPoint One** (Mini + Connect) | CSV only (interim) | unconfirmed | **Approval required** | **No public API** — PayPoint partner accreditation | not confirmed | Adapter stub (disabled) | Unit/fixtures only |
| **ShopMate** (Retail Data Partnership) | File/partner feed, CSV | unconfirmed | **Approval required** | **No public API** — data-sharing agreement with RDP/ShopMate | not confirmed | Adapter stub (disabled) | Unit/fixtures only |
| **EDGEPoS** (Henderson Technology) | Cloud/partner, CSV | unconfirmed | **Approval required** | **Partner-only API** — integration agreement with Henderson | not confirmed | Adapter stub (disabled) | Unit/fixtures only |

## What "implemented" means right now (honest)
- A provider **registry** (availability catalogue, no secrets), a shared **normalized sales model** (money in
  integer pence, decimal weighted quantities, stable dedupe keys, returns kept separate from sales), an
  **adapter interface** and **nine adapter modules**. Live cloud operations (`connect`/`fetchSales`/
  `verifyWebhook`) **throw "not available"** on every adapter — no endpoint is invented, no connection is faked.
- `normalizeSale` (provider-native → shared model) is **not implemented** on any adapter yet — it throws until
  the native shape is verified against that provider's sandbox. We do not guess field names.
- Tests: `backend/src/__tests__/posProviders.test.js` (16) — registry truthfulness, availability≠connection,
  SumUp-unsupported-for-item-level, adapters reject honestly, and the sales-model numeric/dedupe/returns rules.
  **All are unit tests with fixtures. None verify a real provider.**

## Per-provider notes & blockers
- **Square** — `order.created/updated` webhooks are metadata-only → `RetrieveOrder` for `line_items`; item
  returns are return line items; monetary `refund.*` events are **not** restocks. Line items can lag just
  after `payment.*` (retrieve-with-retry). Blocker: OAuth app + shop authorisation.
- **Shopify POS** — POS sales are Orders; `orders/create` (+ `refunds/create`) webhooks carry line items;
  verify HMAC. Blocker: a Shopify app (custom per shop, or public-app review for scale).
- **Lightspeed** — X-Series Sales API returns closed sales with line items. Blocker: confirm access
  tier/fees/rate limits + partner terms before building.
- **Zettle** — use **Purchases** as the single sales source; do **not** also apply Inventory-change events
  (double-count). Blocker: multi-merchant app → PayPal/Zettle partner approval.
- **SumUp** — Transactions/Receipts are **payment-level** (amount/VAT/tip/status), no documented product
  lines. Per the brief, a payment amount must never deduct stock → **no cloud stock path**. Only route to
  item-level is a shop-side item CSV export.
- **Epos Now** — Transactions API (list/get) with item detail; webhooks beta → poll + reconcile first.
  Blocker: shop creates an API Device and shares its credentials.
- **PayPoint One / ShopMate / EDGEPoS** — UK symbol-group EPOS with **no public developer API**; integration
  is by partner accreditation / data-sharing / integration agreement. Item-level availability unconfirmed.
  Interim route for pilots: a shop-side item-level CSV export, if the till can produce one.

## Sources (accessed 2026-10-21)
- Square Orders API & webhooks — developer.squareup.com/docs/orders-api
- Shopify Admin API / orders webhooks — shopify.dev (API 2026-10 line-item changes)
- Lightspeed X-Series Sales API — x-series-api.lightspeedhq.com (+ third-party API reviews)
- Zettle developer (Purchases/Products/Inventory, Pusher) — developer.zettle.com (+ Codat/Supergood summaries)
- SumUp Receipts/Transactions — developer.sumup.com/api
- Epos Now developer — developer.eposnowhq.com (+ API Evangelist/Supergood listings)
- PayPoint One (Mini/Connect) — paypointbusiness.com (partner-accreditation model; Booker link press)
- ShopMate / RDP — retaildata.co.uk; betterretailing/asiantrader (partner data-feed press)
- EDGEPoS / Henderson — henderson-technology.com; betterretailing/forecourttrader (partner-integration press)

> Several facts rest partly on secondary sources and are marked "not confirmed". Verify each against the
> provider's own current docs + partner terms before relying on it. See [[Provider-Enquiries]] for the drafts
> that would establish the unconfirmed items (access, item-level fields, fees, sandbox).
