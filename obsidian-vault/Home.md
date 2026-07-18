# 🏪 Vendora POS — Project Map

> **Start here.** This vault is the living map of the Vendora POS project. Every note links to related notes with `[[wikilinks]]` — open this folder as an Obsidian vault and use the Graph view to navigate.

**Vendora POS v3** is a multi-tenant, subscription-gated **UK retail point-of-sale system** for convenience stores. React + Vite frontend, Node/Express + MongoDB backend, real-time via Socket.io, billing via Stripe.

---

## 🗺️ Map of Content

### Foundations
- [[Architecture]] — how the whole system fits together
- [[Tech-Stack]] — languages, frameworks, libraries
- [[Running-Locally]] — local dev setup + how to log into Railway 🔑
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
- [[App-Kickoff]] — 🚀 **START HERE in a fresh tab**: the one-page hand-off to begin building the Phase-1 app ⭐
- [[Winning-Strategy]] — 🏆 **how we win**: burden-first not feature-first; accuracy + trust beat AI clones ⭐
- [[Go-To-Market]] — ⭐ **the master plan**: land with the App, expand to the Till (land-and-expand) *locked 2026-07-18*
- [[Customer-Discovery]] — 🔎 **field kit**: how to talk to 5–10 shops and find the pain to build around
- [[Niche-Pain-Research]] — 🔬 per-niche pains (2025–26), evidence-backed: universal core vs vertical modules
- [[Features-To-Build]] — 🧱 **the ADD list**: net-new features to build (vs [[Feature-Inventory]] = already built)
- [[Two-Setups-Till-and-App]] — what goes in the Till (web) vs the App (mobile) *scope locked 2026-07-16; build order now reversed → see [[Go-To-Market]]*
- [[Positioning]] — how Vendora wins vs Square/Shopify/Epos Now & AI clones ⭐
- [[Competitor-Teardown]] — UK POS landscape, July 2026

### Feature Domains
- [[Feature-Inventory]] — **everything built, 100% coverage** (routes · models · services · pages · plan gates) ⭐ *the master list*
- [[Domains-Index]] — all feature areas at a glance
- [[Overview-Dashboard]] — owner's "This Week" command centre ⭐ *new flagship*
- [[Accounting]] — VAT, Payroll, Expenses, P&L
- [[POS-and-Checkout]] — the core till

### 📓 Work Log
- [[Work-Log]] — **everything we do from here onwards**, newest first

---

## 🎯 Current Focus

See [[Work-Log]] for the running journal. Recent work (2026-07-16) has been the **owner "fingertip" push**: the [[Overview-Dashboard]] is now the owner's landing screen (shop-status banner, "Today so far", quick actions), an end-of-day "shop closed fine" summary that **auto-sends on WhatsApp** at closing time ([[2026-07-16-Nightly-WhatsApp-Summary]]), and **independent per-product margins** ([[2026-07-16-Per-Product-Margins]]).

## 🚦 Quick Status
- Branch: `claude/vendora-pos-v3-KPnI0`
- Frontend build: ✅ passing
- Backend routes: ✅ loading
- **Open threads (not yet done):** connect live **MongoDB Atlas** URI for local real-data run; host backend **always-on** so the nightly WhatsApp job fires unattended; add **Twilio** creds to switch WhatsApp sending on (until then messages record as `skipped`).
