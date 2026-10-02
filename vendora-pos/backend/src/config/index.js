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
    // Configurable price (minor units, e.g. pence) + interval — unset until the operator decides commercial terms.
    priceMinor: process.env.INSIGHTS_PRICE_MINOR ? parseInt(process.env.INSIGHTS_PRICE_MINOR, 10) : null,
    priceCurrency: process.env.INSIGHTS_PRICE_CURRENCY || 'GBP',
    priceInterval: process.env.INSIGHTS_PRICE_INTERVAL || null, // 'month' | 'year' | 'once' — operator sets
    // Shared secret the billing provider adapter signs its normalised webhook with. Unset → the webhook is 404.
    webhookSecret: process.env.INSIGHTS_BILLING_WEBHOOK_SECRET || null,
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
