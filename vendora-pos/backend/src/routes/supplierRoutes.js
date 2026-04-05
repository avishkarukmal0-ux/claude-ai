'use strict';
const express = require('express');
const router = express.Router();
const Supplier = require('../models/Supplier');
const PriceHistory = require('../models/PriceHistory');
const AppError = require('../utils/AppError');
const { requireRole } = require('../middleware/permissions');

router.get('/', async (req, res, next) => { try { const suppliers = await Supplier.find({ store: req.storeId }); res.json({ success: true, suppliers }); } catch (err) { next(err); } });
router.get('/compare/:barcode', async (req, res, next) => { try { const history = await PriceHistory.find({ barcode: req.params.barcode }).sort({ recordedAt: -1 }).limit(30); res.json({ success: true, history }); } catch (err) { next(err); } });
router.get('/:id', async (req, res, next) => { try { const s = await Supplier.findOne({ _id: req.params.id, store: req.storeId }); if (!s) return next(AppError.notFound('Supplier')); res.json({ success: true, supplier: s }); } catch (err) { next(err); } });
router.post('/', requireRole('manager'), async (req, res, next) => { try { const s = await Supplier.create({ store: req.storeId, ...req.body }); res.status(201).json({ success: true, supplier: s }); } catch (err) { next(err); } });
router.put('/:id', requireRole('manager'), async (req, res, next) => { try { const s = await Supplier.findOneAndUpdate({ _id: req.params.id, store: req.storeId }, req.body, { new: true }); if (!s) return next(AppError.notFound('Supplier')); res.json({ success: true, supplier: s }); } catch (err) { next(err); } });
router.post('/import-pricelist', requireRole('manager'), async (req, res, next) => { try { res.json({ success: true, message: 'Price list import queued' }); } catch (err) { next(err); } });
module.exports = router;
