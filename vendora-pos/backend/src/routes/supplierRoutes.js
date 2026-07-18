'use strict';
const express = require('express');
const router = express.Router();
const Supplier = require('../models/Supplier');
const PriceHistory = require('../models/PriceHistory');
const PurchaseOrder = require('../models/PurchaseOrder');
const AppError = require('../utils/AppError');
const { requireRole } = require('../middleware/permissions');

router.get('/', async (req, res, next) => { try { const suppliers = await Supplier.find({ store: req.storeId }); res.json({ success: true, suppliers }); } catch (err) { next(err); } });

// GET /api/suppliers/compare/:barcode — price comparison across suppliers (#91, #92)
router.get('/compare/:barcode', async (req, res, next) => {
  try {
    const history = await PriceHistory.find({ barcode: req.params.barcode })
      .sort({ recordedAt: -1 })
      .limit(100)
      .lean();

    // Group by supplier, pick latest price per supplier
    const bySupplier = {};
    for (const h of history) {
      const key = h.supplierId?.toString() || h.supplierName;
      if (!key) continue;
      if (!bySupplier[key]) {
        bySupplier[key] = { supplierId: h.supplierId, supplierName: h.supplierName, price: h.price, recordedAt: h.recordedAt, unit: h.unit };
      }
    }

    const prices = Object.values(bySupplier).sort((a, b) => a.price - b.price);
    const cheapest = prices[0] || null;

    res.json({ success: true, barcode: req.params.barcode, prices, cheapest, history: history.slice(0, 30) });
  } catch (err) { next(err); }
});

// GET /api/suppliers/:id/performance — supplier performance report (#103)
router.get('/:id/performance', requireRole('supervisor'), async (req, res, next) => {
  try {
    const supplier = await Supplier.findOne({ _id: req.params.id, store: req.storeId });
    if (!supplier) return next(AppError.notFound('Supplier'));

    const ninetyDaysAgo = new Date(Date.now() - 90 * 24 * 3600 * 1000);

    const orders = await PurchaseOrder.find({
      store: req.storeId,
      supplier: supplier._id,
      createdAt: { $gte: ninetyDaysAgo },
    }).sort({ createdAt: -1 }).lean();

    // Calculate delivery time stats
    const deliveredOrders = orders.filter(o => o.status === 'received' && o.expectedDelivery && o.receivedAt);
    const deliveryDays = deliveredOrders.map(o => {
      const diff = new Date(o.receivedAt) - new Date(o.expectedDelivery);
      return Math.round(diff / (24 * 3600 * 1000));
    });
    const avgDeliveryVariance = deliveryDays.length
      ? (deliveryDays.reduce((s, d) => s + d, 0) / deliveryDays.length).toFixed(1)
      : null;
    const onTimeRate = deliveryDays.length
      ? ((deliveryDays.filter(d => d <= 0).length / deliveryDays.length) * 100).toFixed(0)
      : null;

    // Price increase tracking
    const priceHistory = await PriceHistory.find({ supplierId: supplier._id })
      .sort({ recordedAt: -1 })
      .limit(50)
      .lean();

    // Group by barcode, detect price increases
    const priceChanges = {};
    for (const h of priceHistory) {
      if (!priceChanges[h.barcode]) priceChanges[h.barcode] = [];
      priceChanges[h.barcode].push(h);
    }
    const increases = [];
    for (const [barcode, records] of Object.entries(priceChanges)) {
      if (records.length >= 2) {
        const latest = records[0].price;
        const previous = records[1].price;
        if (latest > previous) {
          increases.push({ barcode, productName: records[0].productName, from: previous, to: latest, pct: (((latest - previous) / previous) * 100).toFixed(1) });
        }
      }
    }

    res.json({
      success: true,
      supplier,
      performance: {
        totalOrders: orders.length,
        deliveredOrders: deliveredOrders.length,
        pendingOrders: orders.filter(o => o.status === 'sent').length,
        avgDeliveryVarianceDays: avgDeliveryVariance !== null ? Number(avgDeliveryVariance) : null,
        onTimeDeliveryRate: onTimeRate !== null ? Number(onTimeRate) : null,
        recentPriceIncreases: increases,
      },
      recentOrders: orders.slice(0, 20),
    });
  } catch (err) { next(err); }
});

router.get('/:id', async (req, res, next) => { try { const s = await Supplier.findOne({ _id: req.params.id, store: req.storeId }); if (!s) return next(AppError.notFound('Supplier')); res.json({ success: true, supplier: s }); } catch (err) { next(err); } });
router.post('/', requireRole('manager'), async (req, res, next) => { try { const s = await Supplier.create({ store: req.storeId, ...req.body }); res.status(201).json({ success: true, supplier: s }); } catch (err) { next(err); } });
router.put('/:id', requireRole('manager'), async (req, res, next) => { try { const s = await Supplier.findOneAndUpdate({ _id: req.params.id, store: req.storeId }, req.body, { new: true }); if (!s) return next(AppError.notFound('Supplier')); res.json({ success: true, supplier: s }); } catch (err) { next(err); } });
router.post('/import-pricelist', requireRole('manager'), async (req, res, next) => { try { res.json({ success: true, message: 'Price list import queued' }); } catch (err) { next(err); } });
module.exports = router;
