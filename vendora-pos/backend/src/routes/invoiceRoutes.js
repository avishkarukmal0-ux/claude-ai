'use strict';
const express = require('express');
const router = express.Router();
const Invoice = require('../models/Invoice');
const AppError = require('../utils/AppError');

router.get('/', async (req, res, next) => { try { const invoices = await Invoice.find({ store: req.storeId }).sort({ invoiceDate: -1 }).populate('supplier', 'name'); res.json({ success: true, invoices }); } catch (err) { next(err); } });
router.get('/needs-review', async (req, res, next) => { try { const invoices = await Invoice.find({ store: req.storeId, 'verification.status': 'discrepancies' }); res.json({ success: true, invoices }); } catch (err) { next(err); } });
router.get('/:id', async (req, res, next) => { try { const inv = await Invoice.findOne({ _id: req.params.id, store: req.storeId }); if (!inv) return next(AppError.notFound('Invoice')); res.json({ success: true, invoice: inv }); } catch (err) { next(err); } });
router.post('/', async (req, res, next) => { try { const inv = await Invoice.create({ store: req.storeId, ...req.body }); res.status(201).json({ success: true, invoice: inv }); } catch (err) { next(err); } });
router.put('/:id', async (req, res, next) => { try { const inv = await Invoice.findOneAndUpdate({ _id: req.params.id, store: req.storeId }, req.body, { new: true }); if (!inv) return next(AppError.notFound('Invoice')); res.json({ success: true, invoice: inv }); } catch (err) { next(err); } });
router.post('/:id/verify', async (req, res, next) => { try { const inv = await Invoice.findOne({ _id: req.params.id, store: req.storeId }); if (!inv) return next(AppError.notFound('Invoice')); inv.verification.status = 'verified'; inv.verification.verifiedAt = new Date(); inv.verification.verifiedBy = req.user._id; await inv.save(); res.json({ success: true, invoice: inv }); } catch (err) { next(err); } });
router.post('/:id/pay', async (req, res, next) => { try { const inv = await Invoice.findOneAndUpdate({ _id: req.params.id, store: req.storeId }, { paymentStatus: 'paid' }, { new: true }); res.json({ success: true, invoice: inv }); } catch (err) { next(err); } });
module.exports = router;
