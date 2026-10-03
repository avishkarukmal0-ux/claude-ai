'use strict';
const express = require('express');
const router = express.Router();
const Product = require('../models/Product');
const ExpiryMarkdownRule = require('../models/ExpiryMarkdownRule');
const { Types: { ObjectId } } = require('mongoose');

const msPerDay = 1000 * 60 * 60 * 24;

function daysLeft(date) {
  return Math.floor((new Date(date) - new Date()) / msPerDay);
}

function batchStatus(expiryDate) {
  const d = daysLeft(expiryDate);
  if (d < 0) return 'expired';
  if (d <= 3) return 'expiring_soon';
  return 'ok';
}

// Apply best matching markdown rule
function applyMarkdown(retailPrice, days, rules) {
  if (!rules || !rules.length) return null;
  const applicable = rules
    .filter(r => r.active && days <= r.daysBeforeExpiry)
    .sort((a, b) => a.daysBeforeExpiry - b.daysBeforeExpiry);
  if (!applicable.length) return null;
  const rule = applicable[0];
  let discountedPrice, discountPercent;
  if (rule.discountType === 'percentage') {
    discountPercent = rule.discountAmount;
    discountedPrice = Math.round(retailPrice * (1 - rule.discountAmount / 100) * 100) / 100;
  } else {
    discountedPrice = Math.max(0, Math.round((retailPrice - rule.discountAmount) * 100) / 100);
    discountPercent = Math.round(((retailPrice - discountedPrice) / retailPrice) * 100);
  }
  return { discountedPrice, discountPercent };
}

// ── GET /products/expiry/dashboard ──────────────────────────────────────────
router.get('/dashboard', async (req, res) => {
  try {
    const storeId = req.storeId;
    const products = await Product.find({
      store: storeId,
      isActive: true,
      'expiryBatches.0': { $exists: true },
    }).lean();

    const rules = await ExpiryMarkdownRule.find({ store: storeId, active: true }).lean();

    const expired = [];
    const expiringSoon = [];
    const expiringThisWeek = [];
    let totalValue = 0;
    let potentialSaving = 0;

    for (const product of products) {
      const retailPrice = product.pricing?.retailPrice || 0;
      for (const batch of product.expiryBatches) {
        if (batch.quantity <= 0) continue;
        const days = daysLeft(batch.expiryDate);
        const status = batchStatus(batch.expiryDate);
        const batchValue = retailPrice * batch.quantity;

        if (status === 'expired') {
          totalValue += batchValue;
          expired.push({
            product: { _id: product._id, name: product.name, barcode: product.barcode, category: product.category, imageUrl: product.imageUrl },
            batch,
            daysOverdue: Math.abs(days),
          });
        } else if (status === 'expiring_soon') {
          const markdown = applyMarkdown(retailPrice, days, rules);
          totalValue += batchValue;
          if (markdown) potentialSaving += (retailPrice - markdown.discountedPrice) * batch.quantity;
          expiringSoon.push({
            product: { _id: product._id, name: product.name, barcode: product.barcode, category: product.category, imageUrl: product.imageUrl },
            batch,
            daysLeft: days,
            discountedPrice: markdown?.discountedPrice,
            discountPercent: markdown?.discountPercent,
            originalPrice: retailPrice,
          });
          if (days <= 7) {
            expiringThisWeek.push({
              product: { _id: product._id, name: product.name, barcode: product.barcode, category: product.category, imageUrl: product.imageUrl },
              batch,
              daysLeft: days,
              discountedPrice: markdown?.discountedPrice,
              discountPercent: markdown?.discountPercent,
              originalPrice: retailPrice,
            });
          }
        } else if (days <= 7) {
          const markdown = applyMarkdown(retailPrice, days, rules);
          expiringThisWeek.push({
            product: { _id: product._id, name: product.name, barcode: product.barcode, category: product.category, imageUrl: product.imageUrl },
            batch,
            daysLeft: days,
            discountedPrice: markdown?.discountedPrice,
            discountPercent: markdown?.discountPercent,
            originalPrice: retailPrice,
          });
        }
      }
    }

    res.json({
      expired,
      expiringSoon,
      expiringThisWeek,
      totalValue: Math.round(totalValue * 100) / 100,
      potentialSaving: Math.round(potentialSaving * 100) / 100,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── POST /products/:id/expiry-batch ─────────────────────────────────────────
router.post('/:id/batch', async (req, res) => {
  try {
    const { quantity, expiryDate, supplierId, costPrice } = req.body;
    if (!quantity || !expiryDate) return res.status(400).json({ error: 'quantity and expiryDate required' });

    const days = daysLeft(expiryDate);
    const status = batchStatus(expiryDate);

    const newBatch = {
      batchId: new ObjectId().toHexString(),
      quantity: Number(quantity),
      expiryDate: new Date(expiryDate),
      receivedDate: new Date(),
      supplierId: supplierId || undefined,
      costPrice: Number(costPrice) || 0,
      status,
    };

    const product = await Product.findOneAndUpdate(
      { _id: req.params.id, store: req.storeId },
      { $push: { expiryBatches: newBatch } },
      { new: true }
    );

    if (!product) return res.status(404).json({ error: 'Product not found' });
    res.json({ batch: newBatch, product });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── PUT /products/:id/expiry-batch/:batchId ─────────────────────────────────
router.put('/:id/batch/:batchId', async (req, res) => {
  try {
    const { quantity, expiryDate, status } = req.body;

    const updateFields = {};
    if (quantity !== undefined) updateFields['expiryBatches.$.quantity'] = Number(quantity);
    if (expiryDate !== undefined) {
      updateFields['expiryBatches.$.expiryDate'] = new Date(expiryDate);
      updateFields['expiryBatches.$.status'] = batchStatus(expiryDate);
    }
    if (status) updateFields['expiryBatches.$.status'] = status;

    const product = await Product.findOneAndUpdate(
      { _id: req.params.id, store: req.storeId, 'expiryBatches.batchId': req.params.batchId },
      { $set: updateFields },
      { new: true }
    );

    if (!product) return res.status(404).json({ error: 'Batch not found' });
    res.json({ product });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── DELETE /products/:id/expiry-batch/:batchId ──────────────────────────────
router.delete('/:id/batch/:batchId', async (req, res) => {
  try {
    const product = await Product.findOneAndUpdate(
      { _id: req.params.id, store: req.storeId },
      { $pull: { expiryBatches: { batchId: req.params.batchId } } },
      { new: true }
    );
    if (!product) return res.status(404).json({ error: 'Product not found' });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── GET /settings/expiry-rules ───────────────────────────────────────────────
router.get('/rules', async (req, res) => {
  try {
    const rules = await ExpiryMarkdownRule.find({ store: req.storeId }).sort({ daysBeforeExpiry: 1 });
    res.json({ rules });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── POST /settings/expiry-rules ─────────────────────────────────────────────
router.post('/rules', async (req, res) => {
  try {
    const { daysBeforeExpiry, discountType, discountAmount, active } = req.body;
    const rule = await ExpiryMarkdownRule.create({
      store: req.storeId,
      daysBeforeExpiry: Number(daysBeforeExpiry),
      discountType: discountType || 'percentage',
      discountAmount: Number(discountAmount),
      active: active !== false,
    });
    res.status(201).json({ rule });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── PUT /settings/expiry-rules/:id ──────────────────────────────────────────
router.put('/rules/:id', async (req, res) => {
  try {
    const rule = await ExpiryMarkdownRule.findOneAndUpdate(
      { _id: req.params.id, store: req.storeId },
      { $set: req.body },
      { new: true }
    );
    if (!rule) return res.status(404).json({ error: 'Rule not found' });
    res.json({ rule });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── DELETE /settings/expiry-rules/:id ───────────────────────────────────────
router.delete('/rules/:id', async (req, res) => {
  try {
    await ExpiryMarkdownRule.findOneAndDelete({ _id: req.params.id, store: req.storeId });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
