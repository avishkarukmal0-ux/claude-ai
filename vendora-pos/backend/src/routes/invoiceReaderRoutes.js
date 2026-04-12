'use strict';
const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const ScannedInvoice = require('../models/ScannedInvoice');
const Product = require('../models/Product');
const Supplier = require('../models/Supplier');
const { matchItem, logPriceHistory } = require('../services/invoiceMatchService');
const logger = require('../utils/logger');

const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;

// ── Multer (memory storage for AI processing) ─────────────────────────────────
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 20 * 1024 * 1024 }, // 20MB
  fileFilter(req, file, cb) {
    const ext = path.extname(file.originalname).toLowerCase();
    if (['.jpg', '.jpeg', '.png', '.webp', '.pdf'].includes(ext)) cb(null, true);
    else cb(new Error('Only JPG, PNG, WEBP, or PDF allowed'));
  },
});

// ── Claude Vision / Text prompt ───────────────────────────────────────────────
const INVOICE_PROMPT = `You are reading a supplier invoice for a UK convenience store / off-licence.

Extract ALL line items from this invoice and return ONLY a JSON object with this exact structure:
{
  "supplierName": "string or null",
  "invoiceNumber": "string or null",
  "invoiceDate": "DD/MM/YYYY or null",
  "items": [
    {
      "barcode": "string or null",
      "productName": "string",
      "quantity": number,
      "unitCost": number,
      "totalCost": number,
      "unit": "each"
    }
  ]
}

Rules:
- UK prices are in pounds (£). Return as plain numbers e.g. 1.20 not "£1.20"
- If barcode is shown, include it exactly as printed
- quantity should be number of units ordered
- unitCost is cost per unit (NOT case cost unless clearly stated as per-unit)
- Return ONLY valid JSON, no markdown, no explanation
- If you cannot read a field, use null`;

async function callClaudeVision(base64Image, mediaType) {
  if (!ANTHROPIC_API_KEY) throw new Error('ANTHROPIC_API_KEY not configured');
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: 'claude-opus-4-6',
      max_tokens: 4096,
      messages: [{
        role: 'user',
        content: [
          { type: 'image', source: { type: 'base64', media_type: mediaType, data: base64Image } },
          { type: 'text', text: INVOICE_PROMPT },
        ],
      }],
    }),
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Claude API error: ${err}`);
  }
  const data = await res.json();
  return data.content?.[0]?.text || '';
}

async function callClaudeText(invoiceText) {
  if (!ANTHROPIC_API_KEY) throw new Error('ANTHROPIC_API_KEY not configured');
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: 'claude-opus-4-6',
      max_tokens: 4096,
      messages: [{
        role: 'user',
        content: `Here is the text extracted from a supplier invoice:\n\n${invoiceText}\n\n${INVOICE_PROMPT}`,
      }],
    }),
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Claude API error: ${err}`);
  }
  const data = await res.json();
  return data.content?.[0]?.text || '';
}

function parseClaudeResponse(raw) {
  // Strip markdown fences if Claude wraps response
  const clean = raw.replace(/^```(?:json)?\n?/m, '').replace(/\n?```$/m, '').trim();
  return JSON.parse(clean);
}

async function detectSupplier(supplierName, storeId) {
  if (!supplierName) return null;
  const suppliers = await Supplier.find({ store: storeId }, 'name').lean();
  const nameLower = supplierName.toLowerCase();
  return suppliers.find(s => nameLower.includes(s.name.toLowerCase()) || s.name.toLowerCase().includes(nameLower)) || null;
}

async function processInvoiceData(parsed, storeId) {
  const rawItems = parsed.items || [];
  const matchedItems = await Promise.all(rawItems.map(item => matchItem(item, storeId)));

  const summary = {
    totalItems: matchedItems.length,
    matchedItems: matchedItems.filter(i => i.matchMethod !== 'none' && !i.isNewProduct).length,
    unmatchedItems: matchedItems.filter(i => i.matchMethod === 'none').length,
    priceIncreases: matchedItems.filter(i => i.changeDirection === 'up').length,
    priceDecreases: matchedItems.filter(i => i.changeDirection === 'down').length,
    newProducts: matchedItems.filter(i => i.isNewProduct).length,
    totalValue: matchedItems.reduce((s, i) => s + (i.totalCost || 0), 0),
  };

  return { items: matchedItems, summary };
}

// ── POST /api/invoice-reader/scan-image ──────────────────────────────────────
router.post('/scan-image', upload.single('invoice'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'No file uploaded' });

    const ext = path.extname(req.file.originalname).toLowerCase();
    let mediaType = 'image/jpeg';
    if (ext === '.png') mediaType = 'image/png';
    else if (ext === '.webp') mediaType = 'image/webp';

    const base64 = req.file.buffer.toString('base64');

    // Check for duplicate detection (same invoice number) later — scan first
    let parsed;
    try {
      const rawText = await callClaudeVision(base64, mediaType);
      parsed = parseClaudeResponse(rawText);
    } catch (aiErr) {
      return res.status(502).json({ error: `AI reading failed: ${aiErr.message}` });
    }

    // Check for duplicate invoice number
    if (parsed.invoiceNumber) {
      const existing = await ScannedInvoice.findOne({
        store: req.storeId,
        invoiceNumber: parsed.invoiceNumber,
        status: { $ne: 'rejected' },
      }).lean();
      if (existing) {
        return res.json({
          duplicate: true,
          existingId: existing._id,
          existingDate: existing.createdAt,
          invoiceNumber: parsed.invoiceNumber,
          parsed,
        });
      }
    }

    const supplier = await detectSupplier(parsed.supplierName, req.storeId);
    const { items, summary } = await processInvoiceData(parsed, req.storeId);

    const record = await ScannedInvoice.create({
      store: req.storeId,
      supplier: supplier?._id,
      supplierName: parsed.supplierName || supplier?.name,
      invoiceNumber: parsed.invoiceNumber,
      invoiceDate: parsed.invoiceDate ? parseDateDMY(parsed.invoiceDate) : new Date(),
      uploadedBy: req.user._id,
      source: 'image',
      status: 'review',
      items,
      summary,
    });

    res.status(201).json({ invoice: record });
  } catch (err) {
    logger.error('Invoice scan-image error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ── POST /api/invoice-reader/scan-pdf ────────────────────────────────────────
router.post('/scan-pdf', upload.single('invoice'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'No file uploaded' });

    let pdfText = '';
    try {
      const pdfParse = require('pdf-parse');
      const pdfData = await pdfParse(req.file.buffer);
      pdfText = pdfData.text;
    } catch (pdfErr) {
      return res.status(422).json({ error: `PDF parsing failed: ${pdfErr.message}` });
    }

    if (!pdfText.trim()) {
      return res.status(422).json({ error: 'Could not extract text from PDF. The file may be image-based — try uploading as an image instead.' });
    }

    let parsed;
    try {
      const rawText = await callClaudeText(pdfText);
      parsed = parseClaudeResponse(rawText);
    } catch (aiErr) {
      return res.status(502).json({ error: `AI reading failed: ${aiErr.message}` });
    }

    if (parsed.invoiceNumber) {
      const existing = await ScannedInvoice.findOne({
        store: req.storeId,
        invoiceNumber: parsed.invoiceNumber,
        status: { $ne: 'rejected' },
      }).lean();
      if (existing) {
        return res.json({ duplicate: true, existingId: existing._id, existingDate: existing.createdAt, invoiceNumber: parsed.invoiceNumber, parsed });
      }
    }

    const supplier = await detectSupplier(parsed.supplierName, req.storeId);
    const { items, summary } = await processInvoiceData(parsed, req.storeId);

    const record = await ScannedInvoice.create({
      store: req.storeId,
      supplier: supplier?._id,
      supplierName: parsed.supplierName || supplier?.name,
      invoiceNumber: parsed.invoiceNumber,
      invoiceDate: parsed.invoiceDate ? parseDateDMY(parsed.invoiceDate) : new Date(),
      uploadedBy: req.user._id,
      source: 'pdf',
      rawText: pdfText.slice(0, 5000),
      status: 'review',
      items,
      summary,
    });

    res.status(201).json({ invoice: record });
  } catch (err) {
    logger.error('Invoice scan-pdf error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ── POST /api/invoice-reader/:id/apply ───────────────────────────────────────
router.post('/:id/apply', async (req, res) => {
  try {
    const invoice = await ScannedInvoice.findOne({ _id: req.params.id, store: req.storeId });
    if (!invoice) return res.status(404).json({ error: 'Invoice not found' });
    if (invoice.status === 'applied') return res.status(409).json({ error: 'Already applied' });

    const { approvedItems } = req.body; // [{ itemIndex, applyUpdate, applyRetailUpdate, newRetailPrice }]
    const approvalMap = {};
    if (approvedItems) {
      for (const a of approvedItems) approvalMap[a.itemIndex] = a;
    }

    // Load store margin settings for threshold checks
    const { getOrCreate: getMarginSettings, getRule, calcBreakdown } = require('../services/marginService');
    const marginSettings = await getMarginSettings(req.storeId);

    let applied = 0;
    let marginsBreached = [];
    let retailUpdated = 0;
    const supplierInfo = { supplierId: invoice.supplier, supplierName: invoice.supplierName };

    for (let i = 0; i < invoice.items.length; i++) {
      const item = invoice.items[i];
      const approval = approvalMap[i];
      const shouldApply = approval?.applyUpdate !== undefined ? approval.applyUpdate : item.applyUpdate;
      if (!shouldApply || !item.matchedProduct || !item.priceChanged) continue;

      const product = await Product.findOne({ _id: item.matchedProduct, store: req.storeId });
      if (!product) continue;

      // Log price change before updating
      await logPriceHistory(product, item.unitCost, supplierInfo);

      // Update cost price
      product.pricing.costPrice = item.unitCost;

      // Add stock for received quantity
      if (item.quantity > 0) product.stock.quantity += item.quantity;

      // Optionally update retail price
      if (approval?.applyRetailUpdate) {
        const newRetail = parseFloat(approval.newRetailPrice);
        if (newRetail > 0) {
          product.pricing.retailPrice = newRetail;
          retailUpdated++;
        } else {
          // Use margin suggestion
          const rule = getRule(marginSettings, product.category || '');
          const breakdown = calcBreakdown(item.unitCost, rule);
          product.pricing.retailPrice = breakdown.suggestedRetailIncVat;
          retailUpdated++;
        }
      }

      // Check margin warning against store min margin
      const retail = product.pricing.retailPrice || 0;
      if (retail > 0) {
        const rule = getRule(marginSettings, product.category || '');
        const excVat = retail / (1 + (rule.vatRate || 20) / 100);
        const newMargin = excVat > 0 ? (excVat - item.unitCost) / excVat * 100 : 0;
        if (newMargin < (rule.minMargin || 10)) {
          marginsBreached.push({ name: product.name, margin: Math.round(newMargin), minMargin: rule.minMargin });
        }
      }

      await product.save();
      applied++;
    }

    invoice.status = 'applied';
    await invoice.save();

    // Emit socket notification
    if (req.io) {
      req.io.to(`store:${req.storeId}`).emit('invoice:applied', {
        invoiceId: invoice._id,
        supplierName: invoice.supplierName,
        applied,
        marginsBreached,
      });
    }

    res.json({
      success: true,
      applied,
      retailUpdated,
      marginsBreached,
      invoice,
    });
  } catch (err) {
    logger.error('Invoice apply error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ── GET /api/invoice-reader ──────────────────────────────────────────────────
router.get('/', async (req, res) => {
  try {
    const { status, supplier, limit = 50, page = 1 } = req.query;
    const query = { store: req.storeId };
    if (status) query.status = status;
    if (supplier) query.supplier = supplier;

    const [invoices, total] = await Promise.all([
      ScannedInvoice.find(query)
        .sort({ createdAt: -1 })
        .skip((page - 1) * parseInt(limit))
        .limit(parseInt(limit))
        .select('-rawText -items.rawText')
        .lean(),
      ScannedInvoice.countDocuments(query),
    ]);

    res.json({ invoices, total });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── GET /api/invoice-reader/:id ──────────────────────────────────────────────
router.get('/:id', async (req, res) => {
  try {
    const invoice = await ScannedInvoice.findOne({ _id: req.params.id, store: req.storeId })
      .populate('items.matchedProduct', 'name barcode pricing category')
      .lean();
    if (!invoice) return res.status(404).json({ error: 'Not found' });
    res.json({ invoice });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── DELETE /api/invoice-reader/:id ───────────────────────────────────────────
router.delete('/:id', async (req, res) => {
  try {
    const invoice = await ScannedInvoice.findOneAndUpdate(
      { _id: req.params.id, store: req.storeId },
      { status: 'rejected' },
      { new: true }
    );
    if (!invoice) return res.status(404).json({ error: 'Not found' });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── PUT /api/invoice-reader/:id/item/:index/match ────────────────────────────
// Manual re-match: staff searches for product and assigns it
router.put('/:id/item/:index/match', async (req, res) => {
  try {
    const { productId } = req.body;
    const idx = parseInt(req.params.index);
    const invoice = await ScannedInvoice.findOne({ _id: req.params.id, store: req.storeId });
    if (!invoice) return res.status(404).json({ error: 'Not found' });
    if (!invoice.items[idx]) return res.status(400).json({ error: 'Invalid item index' });

    const product = await Product.findOne({ _id: productId, store: req.storeId }).lean();
    if (!product) return res.status(404).json({ error: 'Product not found' });

    const item = invoice.items[idx];
    const priceInfo = require('../services/invoiceMatchService').detectPriceChange(product, item.unitCost);

    invoice.items[idx].matchedProduct = product._id;
    invoice.items[idx].matchConfidence = 1.0;
    invoice.items[idx].matchMethod = 'manual';
    invoice.items[idx].productName = product.name;
    invoice.items[idx].barcode = product.barcode;
    invoice.items[idx].isNewProduct = false;
    invoice.items[idx].previousCost = priceInfo.previousCost;
    invoice.items[idx].priceChanged = priceInfo.changed;
    invoice.items[idx].changePercent = priceInfo.changePercent;
    invoice.items[idx].changeDirection = priceInfo.direction;
    invoice.items[idx].applyUpdate = priceInfo.changed;

    // Recalculate summary
    invoice.summary.matchedItems = invoice.items.filter(i => i.matchMethod !== 'none' && !i.isNewProduct).length;
    invoice.summary.unmatchedItems = invoice.items.filter(i => i.matchMethod === 'none').length;

    await invoice.save();
    res.json({ invoice });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── Helpers ───────────────────────────────────────────────────────────────────
function parseDateDMY(str) {
  if (!str) return new Date();
  const m = str.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (!m) return new Date(str);
  const [, d, mo, y] = m;
  return new Date(Number(y), Number(mo) - 1, Number(d));
}

module.exports = router;
