require('dotenv').config();

module.exports = {
  env: process.env.NODE_ENV || 'development',
  port: parseInt(process.env.PORT, 10) || 3001,
  corsOrigin: process.env.CORS_ORIGIN || 'http://localhost:5173',
  frontendUrl: process.env.FRONTEND_URL || 'http://localhost:5173',

  // Deferred till / back-office product. OFF by default so the PWA-only pilot never exposes the till's
  // routes or sockets (all its financial/auth surface is 404 / rejected). Set TILL_ENABLED=true only
  // after the till's audit findings are fixed and verified.
  till: { enabled: process.env.TILL_ENABLED === 'true' },

  // Invoice OCR is OPTIONAL and off unless a provider is configured. With none, the PWA uses manual
  // review (no fabricated data). Supported provider: 'ocrspace' (needs OCR_SPACE_API_KEY). Secrets stay
  // server-side; the client only ever learns whether OCR is `configured`.
  invoiceOcr: {
    provider: process.env.INVOICE_OCR_PROVIDER || null,
    ocrSpaceKey: process.env.OCR_SPACE_API_KEY || null,
  },

  // PWA owner/staff daily digest notifications (optional, off by default). Email is the reliable,
  // not-app-open-dependent channel — it reads the shop's synced data server-side. It only sends when a
  // provider is configured; otherwise the service reports `configured:false` and never claims it works.
  //   NOTIFY_EMAIL_PROVIDER=sendgrid  + SENDGRID_API_KEY   → turns the email channel on
  //   NOTIFY_RUN_TOKEN=<secret>       → protects POST /api/pwa-notify/run for an external scheduler
  //   NOTIFY_CRON=true                → also run an in-process 15-min sweep (only reliable if the
  //                                     instance stays awake; on a sleeping dyno use the external trigger)
  notify: {
    emailProvider: process.env.NOTIFY_EMAIL_PROVIDER || null,
    from: process.env.NOTIFY_FROM_EMAIL || process.env.SENDGRID_FROM_EMAIL || 'noreply@vendora.co.uk',
    runToken: process.env.NOTIFY_RUN_TOKEN || null,
    cronEnabled: process.env.NOTIFY_CRON === 'true',
  },

  // Server-side sync-blob version history (optional, off by default). When on, every accepted sync write
  // also snapshots the committed revision into a capped, TTL'd history collection, so a bad overwrite or a
  // lost last-write-wins conflict is RECOVERABLE from the server (the owner can restore a prior revision).
  // Off → behaviour is exactly as before (latest value only). See obsidian-vault/Deployment-Config.md.
  //   SYNC_HISTORY=true            → enable server version history + the restore endpoints
  //   SYNC_HISTORY_KEEP=<n>        → revisions kept per store (default 10)
  //   SYNC_HISTORY_TTL_DAYS=<n>    → also expire history older than this many days (default 30)
  sync: {
    historyEnabled: process.env.SYNC_HISTORY === 'true',
    historyKeep: parseInt(process.env.SYNC_HISTORY_KEEP, 10) || 10,
    historyTtlDays: parseInt(process.env.SYNC_HISTORY_TTL_DAYS, 10) || 30,
  },

  // Document backup (Phase 3): cross-device backup of invoice photos/PDFs. OFF by default.
  //   DOC_BACKUP=true           → enable the /api/pwa-docs upload/download/delete endpoints
  //   DOC_BACKUP_PROVIDER       → 'gridfs' (default; stores in MongoDB, no extra secret/provider needed)
  //   DOC_MAX_FILE_MB=<n>       → per-file size cap (default 10)
  docBackup: {
    enabled: process.env.DOC_BACKUP === 'true',
    provider: process.env.DOC_BACKUP_PROVIDER || 'gridfs',
    maxBytes: (parseInt(process.env.DOC_MAX_FILE_MB, 10) || 10) * 1024 * 1024,
    allowedTypes: ['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'application/pdf'],
  },

  // Product pictures (core feature — NOT the paid add-on). Owner photos are kept on-device and, when this is
  // on, backed up cross-device to GridFS (shop-scoped). OFF by default (local-only until configured).
  //   PRODUCT_IMAGES=true     → enable the /api/pwa-images upload/download/delete endpoints
  //   PRODUCT_IMAGE_MAX_MB    → per-image cap after client compression (default 5)
  productImages: {
    enabled: process.env.PRODUCT_IMAGES === 'true',
    provider: process.env.PRODUCT_IMAGES_PROVIDER || 'gridfs',
    maxBytes: (parseInt(process.env.PRODUCT_IMAGE_MAX_MB, 10) || 5) * 1024 * 1024,
    allowedTypes: ['image/jpeg', 'image/png', 'image/webp'],
  },

  // Neighbourhood Insights — optional PAID add-on (aggregate ONS Census 2021 area profiles). Two independent
  // switches, both default OFF; the add-on is unusable (and purchasing unavailable) until configured:
  //   INSIGHTS_ENABLED=true        → mount the /api/pwa-insights routes at all
  //   INSIGHTS_DATA_PROVIDER       → the census DATA source: 'nomis' (ONS Census 2021 via Nomis API) once the
  //                                  Output-Area centroid data is in place; null = no data → `configured:false`
  //   INSIGHTS_BILLING_PROVIDER    → entitlement/billing source (e.g. 'stripe'); null = purchasing unavailable
  //   INSIGHTS_LOCATION_PROVIDER   → postcode→location ('postcodes_io', open/OGL); default on when enabled
  // Pricing is configurable and NOT set here — no commercial terms are invented. See [[Deployment-Config]].
  neighbourhoodInsights: {
    enabled: process.env.INSIGHTS_ENABLED === 'true',
    dataProvider: process.env.INSIGHTS_DATA_PROVIDER || null,
    billingProvider: process.env.INSIGHTS_BILLING_PROVIDER || null,
    locationProvider: process.env.INSIGHTS_LOCATION_PROVIDER || 'postcodes_io',
    // Supported radii (metres) and the verified coverage — England & Wales only (ONS Census 2021).
    radii: [500, 1000, 3000],
    coverage: 'England and Wales',
    dataSource: 'ONS Census 2021',
    referenceYear: 2021,
    licence: 'Open Government Licence v3.0',
    attribution: 'Source: Office for National Statistics licensed under the Open Government Licence v.3.0',
    // Census DATA source wiring (used by the 'nomis' provider). All optional; with no centroids file the
    // provider reports it isn't set up (configured:false) rather than inventing numbers.
    //   INSIGHTS_CENTROIDS_PATH   → path to the ONS OA (2021) population-weighted centroids file (CSV/NDJSON)
    //   NOMIS_API_BASE            → Nomis API base (default the public endpoint)
    //   INSIGHTS_NOMIS_TABLES_PATH→ optional JSON overriding the dataset-id / dimension map (verify-first)
    //   INSIGHTS_CACHE_TTL        → seconds to cache a built profile (default 1 day)
    //   INSIGHTS_FETCH_TIMEOUT_MS → per-request timeout to Nomis (default 15s)
    //   INSIGHTS_MAX_OA           → safety cap on Output Areas per profile (default 2000)
    data: {
      centroidsPath: process.env.INSIGHTS_CENTROIDS_PATH || null,
      nomisBase: (process.env.NOMIS_API_BASE || 'https://www.nomisweb.co.uk/api/v01').replace(/\/+$/, ''),
      tablesPath: process.env.INSIGHTS_NOMIS_TABLES_PATH || null,
      cacheTtlSeconds: parseInt(process.env.INSIGHTS_CACHE_TTL, 10) || 86400,
      fetchTimeoutMs: parseInt(process.env.INSIGHTS_FETCH_TIMEOUT_MS, 10) || 15000,
      maxOutputAreas: parseInt(process.env.INSIGHTS_MAX_OA, 10) || 2000,
    },
    // Configurable price (minor units, e.g. pence) + interval — unset until the operator decides commercial terms.
    priceMinor: process.env.INSIGHTS_PRICE_MINOR ? parseInt(process.env.INSIGHTS_PRICE_MINOR, 10) : null,
    priceCurrency: process.env.INSIGHTS_PRICE_CURRENCY || 'GBP',
    priceInterval: process.env.INSIGHTS_PRICE_INTERVAL || null, // 'month' | 'year' | 'once' — operator sets
    // Shared secret the billing provider adapter signs its normalised webhook with. Unset → the webhook is 404.
    webhookSecret: process.env.INSIGHTS_BILLING_WEBHOOK_SECRET || null,
  },

  // Billing for the PWA (Stripe). SEPARATE from the deferred till subscription (subscriptionRoutes, behind
  // TILL_ENABLED) — different endpoint, different webhook secret, its own prices. Nothing here activates live
  // charges: a live (sk_live_) key is REFUSED unless BILLING_ALLOW_LIVE=true, and the whole surface is inert
  // until INSIGHTS_BILLING_PROVIDER=stripe. Prices are configurable (test-mode price ids) and NOT hard-coded,
  // so no commercial terms are baked in. saleMode decides what (if anything) is on sale:
  //   'off'          → purchasing unavailable (default)
  //   'one_off'      → a single paid area report (Checkout in 'payment' mode)
  //   'subscription' → Vendora Shop (core) + optional Neighbourhood Insights add-on item on one subscription
  // If the census DATA provider isn't configured, a 'subscription' sale is DOWNGRADED to one_off (or off) so a
  // recurring charge is never taken for data that isn't being delivered yet. See [[Deployment-Config]].
  billing: {
    provider: process.env.INSIGHTS_BILLING_PROVIDER || null, // 'stripe' | null
    stripeSecretKey: process.env.STRIPE_SECRET_KEY || null,
    stripeWebhookSecret: process.env.INSIGHTS_STRIPE_WEBHOOK_SECRET || null,
    allowLive: process.env.BILLING_ALLOW_LIVE === 'true', // guard: never use an sk_live_ key unless this is set
    saleMode: process.env.INSIGHTS_SALE_MODE || 'off',    // 'off' | 'one_off' | 'subscription'
    currency: (process.env.INSIGHTS_PRICE_CURRENCY || 'GBP').toLowerCase(),
    prices: {
      core: process.env.INSIGHTS_STRIPE_PRICE_CORE || null,     // Vendora Shop (proposed £19/mo)
      addon: process.env.INSIGHTS_STRIPE_PRICE_ADDON || null,   // Neighbourhood Insights add-on (proposed £5/mo)
      oneoff: process.env.INSIGHTS_STRIPE_PRICE_ONEOFF || null, // single area report (one-off)
    },
    reportValidDays: parseInt(process.env.INSIGHTS_REPORT_VALID_DAYS, 10) || 30, // one-off report access window
    successUrl: process.env.INSIGHTS_BILLING_SUCCESS_URL || null,
    cancelUrl: process.env.INSIGHTS_BILLING_CANCEL_URL || null,
  },

  // Neighbourhood area data (real, official): store postcode → postcodes.io area codes → ONS/Nomis Census 2021
  // figure, cached server-side with full provenance. OFF by default; never invents numbers. The browser never
  // calls these upstreams directly — only this backend does (CORS, rate limits, User-Agent, secret Nomis UID).
  //   NEIGHBOURHOOD_ENABLED=true   → mount the /api/pwa-insights/area route
  //   ONS_USER_AGENT               → descriptive UA ONS asks for, e.g. "vendora/1.0.0 (ops@example.com +url)"
  //   NOMIS_UID                    → optional secret; removes Nomis' 25k-cell guest limit (never in repo/chat)
  //   NEIGHBOURHOOD_SOURCE         → 'ons' (api.beta.ons.gov.uk) | 'nomis'; default 'ons'
  //   NEIGHBOURHOOD_POP_DATASET    → dataset id for the population figure (unset → runtime discovery; we do NOT
  //                                  hardcode an unverified id). For Nomis this is NM_xxxx_1; for ONS the slug.
  //   NEIGHBOURHOOD_TTL_HOURS      → re-fetch when the cached record is older than this (default 168 = 7 days)
  neighbourhood: {
    enabled: process.env.NEIGHBOURHOOD_ENABLED === 'true',
    source: process.env.NEIGHBOURHOOD_SOURCE || 'ons',
    onsBase: (process.env.ONS_API_BASE || 'https://api.beta.ons.gov.uk/v1').replace(/\/+$/, ''),
    nomisBase: (process.env.NOMIS_API_BASE || 'https://www.nomisweb.co.uk/api/v01').replace(/\/+$/, ''),
    postcodesBase: (process.env.POSTCODES_IO_BASE || 'https://api.postcodes.io').replace(/\/+$/, ''),
    userAgent: process.env.ONS_USER_AGENT || 'vendora-pos/1.0.0 (neighbourhood data; +https://claude-ai-indol.vercel.app)',
    nomisUid: process.env.NOMIS_UID || null,
    populationDataset: process.env.NEIGHBOURHOOD_POP_DATASET || null,
    // Step 2 figures — each dataset id is configurable and VERIFIED before use (we never hardcode a guess).
    // Confirm each NM_ id with scripts/neighbourhood-live-check.js, then set these. Blank = figure skipped.
    //   households     TS041  NEIGHBOURHOOD_DS_HOUSEHOLDS
    //   age            TS007A NEIGHBOURHOOD_DS_AGE
    //   economic       TS066  NEIGHBOURHOOD_DS_ECON
    //   deprivation    TS011  NEIGHBOURHOOD_DS_DEPRIVATION
    //   qualifications TS067  NEIGHBOURHOOD_DS_QUALS
    figuresConfig: {
      households: process.env.NEIGHBOURHOOD_DS_HOUSEHOLDS || null,
      age: process.env.NEIGHBOURHOOD_DS_AGE || null,
      economicActivity: process.env.NEIGHBOURHOOD_DS_ECON || null,
      deprivation: process.env.NEIGHBOURHOOD_DS_DEPRIVATION || null,
      qualifications: process.env.NEIGHBOURHOOD_DS_QUALS || null,
    },
    ttlHours: parseInt(process.env.NEIGHBOURHOOD_TTL_HOURS, 10) || 168,
    timeoutMs: parseInt(process.env.NEIGHBOURHOOD_TIMEOUT_MS, 10) || 55000, // Render cold start can be ~50s
    maxConcurrent: parseInt(process.env.NEIGHBOURHOOD_MAX_CONCURRENT, 10) || 2,
    staleMaxDays: parseInt(process.env.NEIGHBOURHOOD_STALE_MAX_DAYS, 10) || 400, // beyond this, show "out of date"
  },

  mongodb: {
    uri: process.env.MONGODB_URI || 'mongodb://localhost:27017/vendora-dev',
  },

  redis: {
    url: process.env.REDIS_URL || 'redis://localhost:6379',
  },

  jwt: {
    // Dev/test fallbacks are convenience ONLY and never apply in production (app.js refuses to
    // start there if a real secret is absent). This keeps insecure defaults out of prod entirely.
    secret: process.env.JWT_SECRET || (process.env.NODE_ENV === 'production' ? undefined : 'vendora-dev-secret-fallback'),
    expiresIn: process.env.JWT_EXPIRES_IN || '15m',
    refreshSecret: process.env.JWT_REFRESH_SECRET || (process.env.NODE_ENV === 'production' ? undefined : 'vendora-refresh-secret-fallback'),
    refreshExpiresIn: process.env.JWT_REFRESH_EXPIRES_IN || '7d',
  },

  bcrypt: {
    rounds: parseInt(process.env.BCRYPT_ROUNDS, 10) || 12,
  },

  sendgrid: {
    apiKey: process.env.SENDGRID_API_KEY,
    fromEmail: process.env.SENDGRID_FROM_EMAIL || 'noreply@vendora.co.uk',
  },

  twilio: {
    accountSid: process.env.TWILIO_ACCOUNT_SID,
    authToken: process.env.TWILIO_AUTH_TOKEN,
    phoneNumber: process.env.TWILIO_PHONE_NUMBER,
  },

  stripe: {
    secretKey: process.env.STRIPE_SECRET_KEY,
    webhookSecret: process.env.STRIPE_WEBHOOK_SECRET,
  },

  upload: {
    path: process.env.UPLOAD_PATH || './uploads',
    maxFileSizeMB: parseInt(process.env.MAX_FILE_SIZE_MB, 10) || 10,
  },

  logging: {
    level: process.env.LOG_LEVEL || 'info',
  },

  features: {
    openBanking: process.env.ENABLE_OPEN_BANKING === 'true',
    walletPasses: process.env.ENABLE_WALLET_PASSES === 'true',
    accountingSync: process.env.ENABLE_ACCOUNTING_SYNC === 'true',
  },
};
