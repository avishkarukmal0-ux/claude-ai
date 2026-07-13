# 🏪 Vendora POS — Project Map

> **Start here.** This vault is the living map of the Vendora POS project. Every note links to related notes with `[[wikilinks]]` — open this folder as an Obsidian vault and use the Graph view to navigate.

**Vendora POS v3** is a multi-tenant, subscription-gated **UK retail point-of-sale system** for convenience stores. React + Vite frontend, Node/Express + MongoDB backend, real-time via Socket.io, billing via Stripe.

---

## 🗺️ Map of Content

### Foundations
- [[Architecture]] — how the whole system fits together
- [[Tech-Stack]] — languages, frameworks, libraries
- [[Deployment]] — Railway, Vercel, Docker
- [[Conventions]] — coding patterns, git workflow, house style

### Backend (`vendora-pos/backend`)
- [[Backend-Overview]] — server, middleware chain, request lifecycle
- [[Data-Models]] — the 60+ Mongoose models
- [[API-Routes]] — every route group and what it does
- [[Services]] — business-logic layer

### Frontend (`vendora-pos/frontend`)
- [[Frontend-Overview]] — app shell, providers, build
- [[Routing-and-Pages]] — every page and its route
- [[State-and-Contexts]] — React contexts, hooks, services

### Strategy 🎯
- [[Positioning]] — how Vendora wins vs Square/Shopify/Epos Now & AI clones ⭐
- [[Competitor-Teardown]] — UK POS landscape, July 2026

### Feature Domains
- [[Domains-Index]] — all feature areas at a glance
- [[Overview-Dashboard]] — owner's "This Week" command centre ⭐ *new flagship*
- [[Accounting]] — VAT, Payroll, Expenses, P&L
- [[POS-and-Checkout]] — the core till

### 📓 Work Log
- [[Work-Log]] — **everything we do from here onwards**, newest first

---

## 🎯 Current Focus

See [[Work-Log]] for the running journal. Most recent work has been in [[Accounting]] (payroll hours entry, edit/delete for payroll/VAT/expenses).

## 🚦 Quick Status
- Branch: `claude/vendora-pos-v3-KPnI0`
- Frontend build: ✅ passing
- Backend routes: ✅ loading
- See [[2026-07-13-Recovery-and-Setup]] for the last verified state
