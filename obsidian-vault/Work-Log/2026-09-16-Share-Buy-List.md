# 2026-09-16 — Share buy list (order anywhere) + Stock→Suppliers shortcut

Back to [[Work-Log]] · Related: [[2026-09-16-Suppliers]] · [[Positioning]] · [[Winning-Strategy]]

## Goal
Two things: (1) Suppliers wasn't discoverable from the Stock tab — add a shortcut. (2) Some suppliers have their own ordering apps — make Vendora the **brain across all suppliers** without competing on the actual order: a per-supplier **Share** so shops fire each list to any wholesaler/rep.

## What changed (files)
- ✏️ `frontend/src/components/inventory/InventoryView.jsx` + `pages/HomePage.jsx` — a **Suppliers** button in the Stock header opens the suppliers screen (`onOpenSuppliers`). *(commit cbdef59)*
- ✏️ `frontend/src/components/reorder/ReorderView.jsx` — per-supplier **Share** button: builds a plain-text order of that group's un-bought items and uses the Web Share API (phone → WhatsApp/text share sheet) with a **clipboard-copy fallback** (desktop / no share API). *(this commit)*

## Strategy captured (why this beats supplier apps)
Supplier apps sell one supplier and want you to buy more; Vendora is the shop's brain across **all** suppliers and wants you to waste less / make more. We don't fight their ordering — we **feed** it: Vendora decides *what* to buy across everyone, Share sends it to whatever channel they use. Full argument lives in this session's chat; key line: *"A supplier's app helps the supplier sell. Vendora helps the shop keep more of what it makes — across all its suppliers at once."*

## Verification (headless Chromium @ 390×844)
- `npm run build` ✓.
- Stock tab shows a Suppliers button → opens Suppliers screen.
- Buy list Share (no navigator.share in headless → clipboard) copied exactly:
  `Order — Booker\n• Coca-Cola 330ml x5\n• Walkers Crisps x3\n\n— via Vendora`. No page errors.

## Follow-ups / future
- Later: proper API "punch-out" to big wholesalers (Booker/Bestway) so the order goes straight through; cross-supplier **price comparison** (the neutral edge only Vendora can do).

## Commit
- feat(app): share buy list per supplier (order via any channel)
