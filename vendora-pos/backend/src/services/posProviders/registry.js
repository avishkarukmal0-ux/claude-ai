'use strict';

// POS provider catalogue — PROVIDER AVAILABILITY (what Vendora can offer), kept strictly separate from a
// shop's own CONNECTION status (see connection statuses below; a shop is never "Connected" just because a
// provider is "Ready for testing"). Every fact here was checked against current public docs on the
// `docsCheckedAt` date; where a fact could not be verified it is `null` / 'not confirmed' — we never assume a
// provider offers access, item-level data, free integration or a particular event.
//
// itemLevel: 'confirmed' = provider documents per-line product+qty; 'none' = only payment/receipt totals
// (CANNOT drive stock deductions on its own); 'unconfirmed' = not verifiable from public docs.

// Provider-level availability (what we can offer today):
const AVAIL = Object.freeze({
  NOT_CONFIGURED: 'not_configured',       // nothing wired for this provider yet
  APPROVAL_REQUIRED: 'approval_required', // needs partner accreditation / credentials we don't have
  READY_FOR_TESTING: 'ready_for_testing', // documented API; adapter can be built + sandbox-tested
  UNSUPPORTED_SETUP: 'unsupported_setup', // this setup can't give usable item-level data for stock
});
// Per-shop connection status (NOT provider availability):
const CONNECTION = Object.freeze({
  NOT_CONNECTED: 'not_connected',
  CONNECTED: 'connected',
  NEEDS_ATTENTION: 'needs_attention',
  PAUSED: 'paused',
});

const DOCS_CHECKED = '2026-10-21';

// Every provider supports the manual item-level CSV pilot as a fallback IF the shop can export line-item
// sales (not a totals-only report). SumUp is the exception the brief warns about — its data is payment-level.
const PROVIDERS = [
  {
    id: 'square', name: 'Square', product: 'Square POS (Orders API)',
    availability: AVAIL.READY_FOR_TESTING,
    connectionMethods: ['cloud', 'csv'], itemLevel: 'confirmed',
    auth: 'oauth2', realtime: 'webhook+polling', requiresApproval: false,
    docsUrl: 'https://developer.squareup.com/docs/orders-api/what-it-does', docsCheckedAt: DOCS_CHECKED,
    fees: "Square's card-processing fees are the merchant's; the Orders API itself is free",
    itemLevelNote: 'Catalog-based order line items carry name/qty/unit; order.created/updated webhooks are metadata-only → RetrieveOrder. Item returns appear as return line items; monetary refunds are separate refund.* events.',
    blockers: ['Needs a Square OAuth app + the shop to authorise (read orders)', 'Line items can be briefly absent immediately after payment.* → retrieve-with-retry'],
  },
  {
    id: 'shopify', name: 'Shopify POS', product: 'Shopify POS (Admin Orders API + webhooks)',
    availability: AVAIL.READY_FOR_TESTING,
    connectionMethods: ['cloud', 'csv'], itemLevel: 'confirmed',
    auth: 'oauth2', realtime: 'webhook', requiresApproval: false,
    docsUrl: 'https://shopify.dev/docs/api/admin', docsCheckedAt: DOCS_CHECKED,
    fees: "Merchant's Shopify subscription; a custom app is free to create",
    itemLevelNote: 'POS sales are Orders; orders/create webhooks include line_items (product, qty). API version is dated (e.g. 2026-10).',
    blockers: ['Needs a Shopify app with read_orders — a custom app per shop, or a reviewed public app (approval) for many shops'],
  },
  {
    id: 'lightspeed', name: 'Lightspeed Retail', product: 'Lightspeed Retail X-Series (Sales API)',
    availability: AVAIL.APPROVAL_REQUIRED,
    connectionMethods: ['cloud', 'csv'], itemLevel: 'confirmed',
    auth: 'oauth2', realtime: 'webhook+polling', requiresApproval: true,
    docsUrl: 'https://x-series-api.lightspeedhq.com/', docsCheckedAt: DOCS_CHECKED,
    fees: 'not confirmed — third-party reports of paywalled/tiered API access',
    itemLevelNote: 'X-Series Sales API returns closed sales with line items; OAuth2 or personal token; date-based API versioning (since 2026).',
    blockers: ['Confirm X-Series API access tier, rate limits and any fees', 'Confirm partner-program terms'],
  },
  {
    id: 'zettle', name: 'Zettle', product: 'Zettle by PayPal (Purchases API)',
    availability: AVAIL.READY_FOR_TESTING,
    connectionMethods: ['cloud', 'csv'], itemLevel: 'confirmed',
    auth: 'oauth2', realtime: 'push', requiresApproval: false,
    docsUrl: 'https://developer.zettle.com/', docsCheckedAt: DOCS_CHECKED,
    fees: "Merchant's PayPal/Zettle card fees; developer signup is free",
    itemLevelNote: 'OAuth2 REST at developer.zettle.com covers Purchases (item level), Products and Inventory; real-time via a Pusher API. Single-merchant (self-hosted) app is free.',
    blockers: ['A MULTI-merchant app (one Vendora app for many shops) needs PayPal/Zettle partner approval', 'Use Purchases as the single sales source — do NOT also apply Inventory-change events (double-count)'],
  },
  {
    id: 'sumup', name: 'SumUp', product: 'SumUp (Transactions / Receipts API)',
    availability: AVAIL.UNSUPPORTED_SETUP,
    connectionMethods: ['csv'], itemLevel: 'none',
    auth: 'oauth2', realtime: null, requiresApproval: false,
    docsUrl: 'https://developer.sumup.com/api', docsCheckedAt: DOCS_CHECKED,
    fees: "Merchant's SumUp card fees; API free",
    itemLevelNote: 'Transactions/Receipts expose PAYMENT-level data (amount, VAT, tip, status, entry mode). No documented per-line PRODUCT data → a payment amount alone must never deduct stock (brief). Item-level stock only if the shop can export product lines from SumUp (e.g. an item-sales CSV), which is then the CSV pilot route.',
    blockers: ['No documented item-level (line-item) product data in the API → cannot auto-deduct stock', 'Would need SumUp to expose purchase line items, or a shop-side item-level export'],
  },
  {
    id: 'eposnow', name: 'Epos Now', product: 'Epos Now (Transactions API)',
    availability: AVAIL.READY_FOR_TESTING,
    connectionMethods: ['cloud', 'csv'], itemLevel: 'confirmed',
    auth: 'basic', realtime: 'polling', requiresApproval: false,
    docsUrl: 'https://developer.eposnowhq.com/', docsCheckedAt: DOCS_CHECKED,
    fees: 'API access is enabled per registered API Device via the Back Office / AppStore; paid tier not confirmed',
    itemLevelNote: 'Transactions API (list/get) with item detail; HTTP Basic auth with credentials from an API Device created in the Back Office. Webhooks are in beta (limited events) → poll first.',
    blockers: ['Shop must create an API Device in their Epos Now Back Office and share its credentials', 'Webhooks beta → start with scheduled polling + reconciliation'],
  },
  {
    id: 'paypoint', name: 'PayPoint One', product: 'PayPoint One / PayPoint Mini + Connect (EPOS)',
    availability: AVAIL.APPROVAL_REQUIRED,
    connectionMethods: ['csv'], itemLevel: 'unconfirmed',
    auth: 'partner', realtime: null, requiresApproval: true,
    docsUrl: 'https://www.paypointbusiness.com/solutions/mini', docsCheckedAt: DOCS_CHECKED,
    fees: 'not confirmed',
    itemLevelNote: 'No public developer API found. PayPoint accredits EPOS vendors (partner model); existing links (e.g. Booker) are retailer-facing, not a self-serve sales API.',
    blockers: ['No public API — requires PayPoint partner accreditation', 'Item-level sales availability unconfirmed', 'Interim route: shop-side item-level CSV export if available'],
  },
  {
    id: 'shopmate', name: 'ShopMate', product: 'ShopMate (The Retail Data Partnership)',
    availability: AVAIL.APPROVAL_REQUIRED,
    connectionMethods: ['file', 'csv'], itemLevel: 'unconfirmed',
    auth: 'partner', realtime: null, requiresApproval: true,
    docsUrl: 'https://www.retaildata.co.uk/', docsCheckedAt: DOCS_CHECKED,
    fees: 'not confirmed',
    itemLevelNote: 'No public API found. RDP/ShopMate pushes daily price/product/promotion data and point-of-sale purchases to APPROVED PARTNERS (e.g. Snappy Shopper) under a data-sharing agreement — not a self-serve developer API.',
    blockers: ['Requires a data-sharing agreement with RDP/ShopMate', 'Feed format/fees unconfirmed', 'Interim route: shop-side item-level CSV export if available'],
  },
  {
    id: 'edgepos', name: 'EDGEPoS', product: 'EDGEPoS (Henderson Technology)',
    availability: AVAIL.APPROVAL_REQUIRED,
    connectionMethods: ['cloud', 'csv'], itemLevel: 'unconfirmed',
    auth: 'partner', realtime: null, requiresApproval: true,
    docsUrl: 'https://www.henderson-technology.com/', docsCheckedAt: DOCS_CHECKED,
    fees: 'not confirmed',
    itemLevelNote: 'An EDGEPoS API exists and powers partner integrations (Snappy Shopper, Nisa link, dashboards), but it is partner-only — no public documentation. Access is via a direct integration agreement with Henderson Technology.',
    blockers: ['Partner-only API — requires an integration agreement with Henderson Technology', 'Endpoints/auth/item-level fields unconfirmed', 'Interim route: shop-side item-level CSV export if available'],
  },
];

const BY_ID = new Map(PROVIDERS.map((p) => [p.id, p]));

/** The public catalogue (availability), safe to serve to the client — it contains NO secrets. */
function listProviders() { return PROVIDERS.map((p) => ({ ...p })); }
function getProvider(id) { const p = BY_ID.get(id); return p ? { ...p } : null; }
/** Providers whose documented API lets us actually build + sandbox-test a cloud adapter now. */
function testableProviders() { return PROVIDERS.filter((p) => p.availability === AVAIL.READY_FOR_TESTING).map((p) => p.id); }
/** Providers that can accept the manual item-level CSV pilot (everyone who could export product lines). */
function csvCapableProviders() { return PROVIDERS.filter((p) => p.connectionMethods.includes('csv')).map((p) => p.id); }

module.exports = { AVAIL, CONNECTION, DOCS_CHECKED, PROVIDERS, listProviders, getProvider, testableProviders, csvCapableProviders };
