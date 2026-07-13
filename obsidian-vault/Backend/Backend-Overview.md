# Backend Overview

Back to [[Home]] · Related: [[Architecture]] · [[Data-Models]] · [[API-Routes]] · [[Services]]

Location: `vendora-pos/backend/`

## Entry chain
```
server.js          → boots HTTP + Socket.io, connects Mongo/Redis, starts jobs
  └─ src/app.js       → Express app, middleware chain, mounts /api
       └─ src/routes/index.js → mounts every route group
```

## Folder map

| Folder | Purpose | Note |
|---|---|---|
| `src/routes/` | HTTP endpoints (55+ groups) | [[API-Routes]] |
| `src/services/` | Business logic (48 services) | [[Services]] |
| `src/models/` | Mongoose schemas (60+) | [[Data-Models]] |
| `src/middleware/` | auth, permissions, rate-limit, audit, store context, validation | below |
| `src/jobs/` | node-cron scheduled tasks | below |
| `src/config/` | database, redis, index config | |
| `src/utils/` | AppError, logger, formatters, validators, helpers, seedData | |
| `src/__tests__/` | Jest tests | |
| `src/scripts/` | one-off scripts (e.g. `hashExistingPins.js`) | |

## Middleware (`src/middleware/`)

| File | Role |
|---|---|
| `auth.js` | `authenticate` — verifies JWT, attaches `req.user` |
| `permissions.js` | `requireRole(role)` — staff/supervisor/manager gate |
| `storeContext.js` | loads the tenant store doc → `req.storeId` |
| `checkFeature.js` | subscription feature gating |
| `rateLimit.js` | `generalLimiter` + specific limiters |
| `auditLog.js` | records sensitive actions |
| `requestLogger.js` | morgan-style request logs |
| `validation.js` | joi request validation |
| `errorHandler.js` | central error formatter |

## Jobs (`src/jobs/`) — node-cron

| Job | What it does |
|---|---|
| `dailyReset.js` | daily counters/state reset |
| `expireParked.js` | expire stale parked transactions |
| `expiryCheck.js` | product expiry alerts |
| `priceSync.js` | supplier price sync |
| `scheduledReports.js` | email scheduled reports |
| `trendUpdateJob.js` | refresh market trends |
| `index.js` | registers all jobs |

## Config (`src/config/`)
- `database.js` — Mongoose connection
- `redis.js` — ioredis client
- `index.js` — env-driven config surface

## Conventions
See [[Conventions]] — thin routes, fat services, `AppError`, store-scoped queries, `{ success }` responses.
