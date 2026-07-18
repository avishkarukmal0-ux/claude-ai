'use strict';
const express = require('express');
const router = express.Router();
const Product = require('../models/Product');
const { Types: { ObjectId } } = require('mongoose');

const msPerDay = 1000 * 60 * 60 * 24;

// ── POST /api/ai/scan-expiry ─────────────────────────────────────────────────
// Send a base64 product image to Claude Vision and extract the expiry date.
// Body: { image: string (base64), productId?: string }
router.post('/scan-expiry', async (req, res) => {
  try {
    const { image, productId } = req.body;
    if (!image) return res.status(400).json({ error: 'image (base64) required' });

    const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
    if (!ANTHROPIC_API_KEY) {
      return res.status(503).json({ error: 'AI scanning requires ANTHROPIC_API_KEY to be configured' });
    }

    // Determine image media type from base64 header or default to jpeg
    let mediaType = 'image/jpeg';
    if (image.startsWith('data:image/png')) mediaType = 'image/png';
    else if (image.startsWith('data:image/webp')) mediaType = 'image/webp';
    else if (image.startsWith('data:image/gif')) mediaType = 'image/gif';

    // Strip data URI prefix if present
    const base64Data = image.replace(/^data:image\/\w+;base64,/, '');

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 100,
        messages: [{
          role: 'user',
          content: [
            {
              type: 'image',
              source: { type: 'base64', media_type: mediaType, data: base64Data },
            },
            {
              type: 'text',
              text: 'What is the expiry date, best before date, or use by date shown on this product packaging? Return ONLY the date in DD/MM/YYYY format. If you cannot find a date, return "NOT_FOUND". No other text.',
            },
          ],
        }],
      }),
    });

    if (!response.ok) {
      const errText = await response.text();
      return res.status(502).json({ error: `Claude API error: ${errText}` });
    }

    const data = await response.json();
    const rawDate = data.content?.[0]?.text?.trim();

    if (!rawDate || rawDate === 'NOT_FOUND') {
      return res.json({ expiryDate: null, confidence: 'none', raw: rawDate });
    }

    // Parse DD/MM/YYYY
    const parts = rawDate.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
    if (!parts) {
      return res.json({ expiryDate: null, confidence: 'low', raw: rawDate });
    }

    const [, day, month, year] = parts;
    const expiryDate = new Date(Number(year), Number(month) - 1, Number(day));

    // Optionally auto-save to product batch
    let savedBatch = null;
    if (productId) {
      const daysLeft = Math.floor((expiryDate - new Date()) / msPerDay);
      let status = 'ok';
      if (daysLeft < 0) status = 'expired';
      else if (daysLeft <= 3) status = 'expiring_soon';

      const newBatch = {
        batchId: new ObjectId().toHexString(),
        quantity: 1,
        expiryDate,
        receivedDate: new Date(),
        status,
      };

      await Product.findOneAndUpdate(
        { _id: productId, store: req.store._id },
        { $push: { expiryBatches: newBatch } }
      );
      savedBatch = newBatch;
    }

    res.json({
      expiryDate: expiryDate.toISOString(),
      expiryDateFormatted: rawDate,
      confidence: 'high',
      raw: rawDate,
      savedBatch,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── POST /api/pos/expiry-override ────────────────────────────────────────────
// Manager override for expired item in cart
// Body: { saleId, itemId, overrideReason, managerPin }
router.post('/pos/expiry-override', async (req, res) => {
  try {
    const { overrideReason } = req.body;
    // Log the override — in production this would check manager PIN
    // and write to audit log. For now, approve if user has supervisor role.
    if (!['manager', 'owner', 'supervisor'].includes(req.user?.role)) {
      return res.status(403).json({ error: 'Manager authorisation required' });
    }
    res.json({
      approved: true,
      overrideReason: overrideReason || 'Manager override',
      approvedBy: req.user._id,
      approvedAt: new Date(),
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
