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
