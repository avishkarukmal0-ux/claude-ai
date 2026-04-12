'use strict';

require('dotenv').config();

// ── Startup security checks ───────────────────────────────────────────────────
const WEAK_SECRETS = ['vendora-dev-secret-fallback', 'vendora-refresh-secret-fallback', 'change-me', 'secret'];
const jwtSecret        = process.env.JWT_SECRET || '';
const jwtRefreshSecret = process.env.JWT_REFRESH_SECRET || '';

if (!jwtSecret || jwtSecret.length < 32 || WEAK_SECRETS.some(w => jwtSecret.includes(w))) {
  console.error('\n╔══════════════════════════════════════════════════════════╗');
  console.error('║  FATAL: JWT_SECRET is missing or weak                   ║');
  console.error('║  Generate one with:                                     ║');
  console.error('║  node -e "console.log(require(\'crypto\')               ║');
  console.error('║           .randomBytes(64).toString(\'hex\'))"           ║');
  console.error('╚══════════════════════════════════════════════════════════╝\n');
  if (process.env.NODE_ENV === 'production') process.exit(1);
  else console.warn('  ⚠  Running with weak JWT_SECRET — NOT safe for production\n');
}
if (!jwtRefreshSecret || jwtRefreshSecret.length < 32 || WEAK_SECRETS.some(w => jwtRefreshSecret.includes(w))) {
  console.warn('  ⚠  JWT_REFRESH_SECRET is weak or missing\n');
  if (process.env.NODE_ENV === 'production') process.exit(1);
}

const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const requestLogger = require('./middleware/requestLogger');
const auditLog = require('./middleware/auditLog');
const errorHandler = require('./middleware/errorHandler');
const storeContext = require('./middleware/storeContext');
const { generalLimiter } = require('./middleware/rateLimit');
const routes = require('./routes');
const path = require('path');
const fs = require('fs');

const app = express();

// Trust proxy (for rate limiting behind nginx)
app.set('trust proxy', 1);

// Security headers
app.use(helmet({
  crossOriginEmbedderPolicy: false,
  hsts: process.env.NODE_ENV === 'production'
    ? { maxAge: 31536000, includeSubDomains: true, preload: true }
    : false,
  contentSecurityPolicy: {
    directives: {
      defaultSrc:  ["'self'"],
      scriptSrc:   ["'self'", "'unsafe-inline'"],
      styleSrc:    ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'],
      fontSrc:     ["'self'", 'https://fonts.gstatic.com', 'data:'],
      imgSrc:      ["'self'", 'data:', 'blob:'],
      connectSrc:  ["'self'",
        'https://*.mongodb.net',
        'https://*.upstash.io',
        'wss://localhost:*', 'ws://localhost:*',
        ...(process.env.CORS_ORIGIN ? process.env.CORS_ORIGIN.split(',').map(o => o.trim()) : []),
      ],
      objectSrc:   ["'none'"],
      frameSrc:    ["'none'"],
      upgradeInsecureRequests: process.env.NODE_ENV === 'production' ? [] : null,
    },
  },
}));

// HTTPS redirect in production (#178)
if (process.env.NODE_ENV === 'production') {
  app.use((req, res, next) => {
    if (!req.secure && req.get('x-forwarded-proto') !== 'https') {
      return res.redirect(301, 'https://' + req.headers.host + req.url);
    }
    next();
  });
}

// CORS
const allowedOrigins = (process.env.CORS_ORIGIN || 'http://localhost:5173')
  .split(',').map(o => o.trim());

app.use(cors({
  origin: (origin, callback) => {
    // Allow requests with no origin (curl, mobile apps, same-origin)
    if (!origin) return callback(null, true);
    // In development allow any localhost port
    if (process.env.NODE_ENV !== 'production' && /^http:\/\/localhost(:\d+)?$/.test(origin)) {
      return callback(null, true);
    }
    if (allowedOrigins.includes(origin)) return callback(null, true);
    callback(new Error(`CORS: origin ${origin} not allowed`));
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
}));

// Body parsing
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Request logging
app.use(requestLogger);

// Security audit log (sensitive routes)
app.use('/api', auditLog);

// Rate limiting
app.use('/api', generalLimiter);

// Health check (both paths for convenience)
const healthHandler = (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString(), version: '3.0.0' });
};
app.get('/health', healthHandler);
app.get('/api/health', healthHandler);

// Uploads directory
const uploadPath = process.env.UPLOAD_PATH || './uploads';
if (!fs.existsSync(uploadPath)) fs.mkdirSync(uploadPath, { recursive: true });
app.use('/uploads', express.static(path.resolve(uploadPath)));

// Attach io to every request (set after server.js creates io instance)
app.use((req, res, next) => {
  req.io = app.get('io');
  next();
});

// Store context (loads store doc for authenticated requests)
app.use('/api', storeContext);

// API routes
app.use('/api', routes);

// 404 handler
app.use((req, res) => {
  res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: `Route ${req.method} ${req.path} not found` } });
});

// Central error handler
app.use(errorHandler);

module.exports = app;
