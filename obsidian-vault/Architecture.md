# Architecture

Back to [[Home]] · Related: [[Tech-Stack]] · [[Backend-Overview]] · [[Frontend-Overview]] · [[Deployment]]

---

## Big picture

```
┌─────────────────┐     HTTPS/REST      ┌──────────────────┐
│  React SPA       │ ──────────────────► │  Express API      │
│  (Vite, Vercel)  │ ◄────────────────── │  (Node, Railway)  │
│                  │     Socket.io       │                   │
└─────────────────┘     (real-time)      └────────┬─────────┘
                                                    │
                                    ┌───────────────┼───────────────┐
                                    ▼               ▼               ▼
                               ┌────────┐     ┌─────────┐     ┌──────────┐
                               │MongoDB │     │  Redis  │     │  Stripe  │
                               │(Atlas) │     │(Upstash)│     │ (billing)│
                               └────────┘     └─────────┘     └──────────┘
```

## Core architectural traits

### Multi-tenant by store
Every authenticated request carries a **store context** (`middleware/storeContext.js`). Data is scoped by `store` on essentially every model. One backend serves many stores.

### Role-based access
Three roles ascend in privilege: **staff → supervisor → manager**. Enforced in two places:
- Backend: `middleware/permissions.js` (`requireRole('supervisor')`)
- Frontend: `<ProtectedRoute requiredRole="...">` in [[Routing-and-Pages]]

### Subscription-gated features
Stripe subscription tier controls which features unlock. Frontend uses `SubscriptionContext` + `LockedFeature`; backend uses `middleware/checkFeature.js`.

### Real-time
Socket.io pushes live updates (cart, cash drawer, queue, notifications). `req.io` is attached to every request so any route can emit.

### Offline-capable
The POS can queue transactions offline (`OfflineContext`, `OfflineQueue` model, `offlineService`) and sync when back online.

## Request lifecycle (backend)

1. Health checks (`/health`) answered **before** any middleware
2. `helmet` security headers + CSP
3. HTTPS redirect (prod only)
4. CORS (explicit origins + Vercel/Railway wildcards)
5. Body parse (10 MB limit)
6. `requestLogger` → `auditLog` → `generalLimiter` (rate limit)
7. `storeContext` (loads store doc)
8. `authenticate` JWT gate (most routes)
9. Route handler → [[Services]] → [[Data-Models]]
10. `errorHandler` (central)

See [[Backend-Overview]] for detail.

## Layering (backend)

```
routes/      thin HTTP handlers, validation, auth
  └─ services/    business logic, calculations
       └─ models/     Mongoose schemas + persistence
utils/       cross-cutting helpers (AppError, logger, formatters)
middleware/  auth, permissions, rate-limit, audit, store context
jobs/        scheduled cron tasks (daily reset, expiry check, reports)
```

## Layering (frontend)

```
pages/       route-level screens
  └─ components/   reusable UI
context/     global state (auth, cart, settings, offline, notifications)
hooks/       reusable logic (useAuth, useCart, useSocket, ...)
services/    axios wrappers per API domain
```
