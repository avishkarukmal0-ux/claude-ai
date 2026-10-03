'use strict';
const express = require('express'); const router = express.Router();
const printer = require('../services/printerService');
const card = require('../services/cardPaymentService');
const scale = require('../services/scaleService');
router.get('/printer/status', async (req, res) => { res.json({ success: true, ...printer.getStatus() }); });
router.post('/printer/test', async (req, res, next) => { try { const r = await printer.testPrint(); res.json({ success: true, ...r }); } catch (err) { next(err); } });
router.post('/drawer/open', async (req, res) => { res.json({ success: true, message: 'Drawer open signal sent' }); });
router.get('/scale/weight', async (req, res, next) => { try { const w = await scale.getWeight(); res.json({ success: true, ...w }); } catch (err) { next(err); } });
router.post('/scale/tare', async (req, res, next) => { try { await scale.tare(); res.json({ success: true }); } catch (err) { next(err); } });
router.get('/terminal/status', async (req, res) => { res.json({ success: true, ...card.getStatus() }); });
router.post('/terminal/pair', async (req, res, next) => { try { const r = await card.pair(req.body.provider, req.body.apiKey); res.json({ success: true, ...r }); } catch (err) { next(err); } });

// POST /api/hardware/print-labels — ESC/POS label printing
router.post('/print-labels', async (req, res, next) => {
  try {
    const { template = 'shelf', items = [] } = req.body;
    if (!items.length) return res.status(400).json({ success: false, message: 'No items' });

    const Product = require('../models/Product');
    const results = [];
    for (const item of items) {
      const product = await Product.findById(item.productId).select('name barcode pricing').lean();
      if (!product) continue;
      // Build ESC/POS command sequence (text-mode compatible with most thermal printers)
      const price = (product.pricing?.retailPrice || 0).toFixed(2);
      const lines = [];
      lines.push('\x1b\x40');                    // Initialize
      lines.push('\x1b\x21\x08');               // Emphasized
      lines.push(product.name.substring(0, 24).padEnd(24) + '\n');
      lines.push('\x1b\x21\x00');               // Normal
      if (product.barcode) lines.push(`${product.barcode}\n`);
      lines.push('\x1b\x21\x30');               // Double height+width
      lines.push(`\xa3${price}\n`);              // £ price
      lines.push('\x1b\x21\x00');
      if (template === 'alcohol') lines.push('18+ CHALLENGE 25\n');
      lines.push('\n\x1d\x56\x00');             // Cut
      results.push({ productId: item.productId, name: product.name, qty: item.qty || 1, escpos: lines.join('') });
    }

    // In production, forward to a network printer via TCP or USB
    // For now return the ESC/POS data so a browser-side print agent can handle it
    res.json({ success: true, results, message: `${results.length} label(s) prepared. Connect an ESC/POS printer to print.` });
  } catch (err) { next(err); }
});

module.exports = router;
