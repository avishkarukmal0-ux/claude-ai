'use strict';
const express = require('express');
const router = express.Router();
const PurchaseOrder = require('../models/PurchaseOrder');
const Product = require('../models/Product');
const StockMovement = require('../models/StockMovement');
const AppError = require('../utils/AppError');
const { generatePONumber } = require('../utils/helpers');

router.get('/', async (req, res, next) => { try { const { status, supplier } = req.query; const q = { store: req.storeId }; if (status) q.status = status; if (supplier) q.supplier = supplier; const pos = await PurchaseOrder.find(q).sort({ createdAt: -1 }).populate('supplier', 'name code'); res.json({ success: true, purchaseOrders: pos }); } catch (err) { next(err); } });
router.get('/pending', async (req, res, next) => { try { const pos = await PurchaseOrder.find({ store: req.storeId, status: { $in: ['sent','confirmed','partial'] } }); res.json({ success: true, purchaseOrders: pos }); } catch (err) { next(err); } });
router.get('/:id', async (req, res, next) => { try { const po = await PurchaseOrder.findOne({ _id: req.params.id, store: req.storeId }).populate('supplier'); if (!po) return next(AppError.notFound('PurchaseOrder')); res.json({ success: true, purchaseOrder: po }); } catch (err) { next(err); } });
router.post('/', async (req, res, next) => { try { const po = await PurchaseOrder.create({ store: req.storeId, orderNumber: generatePONumber(), sentBy: req.user._id, ...req.body }); res.status(201).json({ success: true, purchaseOrder: po }); } catch (err) { next(err); } });
router.put('/:id', async (req, res, next) => { try { const po = await PurchaseOrder.findOneAndUpdate({ _id: req.params.id, store: req.storeId }, req.body, { new: true }); if (!po) return next(AppError.notFound('PurchaseOrder')); res.json({ success: true, purchaseOrder: po }); } catch (err) { next(err); } });
router.post('/:id/send', async (req, res, next) => { try { const po = await PurchaseOrder.findOneAndUpdate({ _id: req.params.id, store: req.storeId }, { status: 'sent', sentAt: new Date(), sentBy: req.user._id }, { new: true }); res.json({ success: true, purchaseOrder: po }); } catch (err) { next(err); } });
router.post('/:id/receive', async (req, res, next) => { try {
  const po = await PurchaseOrder.findOne({ _id: req.params.id, store: req.storeId });
  if (!po) return next(AppError.notFound('PurchaseOrder'));
  for (const item of po.items) {
    if (item.product) { await Product.findByIdAndUpdate(item.product, { $inc: { 'stock.quantity': item.quantity } }); await StockMovement.create({ store: req.storeId, product: item.product, barcode: item.barcode, productName: item.name, type: 'purchase_order', quantity: item.quantity, reference: po.orderNumber, staff: req.user._id, staffName: req.user.displayName }); }
    item.quantityReceived = item.quantity; item.receivedAt = new Date();
  }
  po.status = 'received'; po.delivery.actualDate = new Date(); po.receivedBy = req.user._id;
  await po.save();
  res.json({ success: true, purchaseOrder: po });
} catch (err) { next(err); } });
router.delete('/:id', async (req, res, next) => { try { await PurchaseOrder.findOneAndUpdate({ _id: req.params.id, store: req.storeId }, { status: 'cancelled' }); res.json({ success: true }); } catch (err) { next(err); } });
module.exports = router;
