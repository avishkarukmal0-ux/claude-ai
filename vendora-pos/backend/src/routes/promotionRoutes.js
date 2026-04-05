'use strict';
const express = require('express');
const router = express.Router();
const Promotion = require('../models/Promotion');
const { syncActivePromotions, validatePromoCode, applyPromotions } = require('../services/promotionsEngine');
const AppError = require('../utils/AppError');
const { requireRole } = require('../middleware/permissions');

router.get('/', async (req, res, next) => { try { const promos = await Promotion.find({ store: req.storeId }).sort({ createdAt: -1 }); res.json({ success: true, promotions: promos }); } catch (err) { next(err); } });
router.get('/active', async (req, res, next) => { try { const now = new Date(); const promos = await Promotion.find({ store: req.storeId, isActive: true, startDate: { $lte: now }, endDate: { $gte: now } }); res.json({ success: true, promotions: promos }); } catch (err) { next(err); } });
router.get('/:id', async (req, res, next) => { try { const p = await Promotion.findOne({ _id: req.params.id, store: req.storeId }); if (!p) return next(AppError.notFound('Promotion')); res.json({ success: true, promotion: p }); } catch (err) { next(err); } });
router.post('/', requireRole('manager'), async (req, res, next) => { try { const p = await Promotion.create({ store: req.storeId, ...req.body }); if (p.isActive) await syncActivePromotions(req.storeId); res.status(201).json({ success: true, promotion: p }); } catch (err) { next(err); } });
router.put('/:id', requireRole('manager'), async (req, res, next) => { try { const p = await Promotion.findOneAndUpdate({ _id: req.params.id, store: req.storeId }, req.body, { new: true }); if (!p) return next(AppError.notFound('Promotion')); await syncActivePromotions(req.storeId); res.json({ success: true, promotion: p }); } catch (err) { next(err); } });
router.post('/:id/activate', requireRole('manager'), async (req, res, next) => { try { const p = await Promotion.findOneAndUpdate({ _id: req.params.id, store: req.storeId }, { isActive: true }, { new: true }); await syncActivePromotions(req.storeId); res.json({ success: true, promotion: p }); } catch (err) { next(err); } });
router.post('/:id/pause', requireRole('manager'), async (req, res, next) => { try { const p = await Promotion.findOneAndUpdate({ _id: req.params.id, store: req.storeId }, { isActive: false }, { new: true }); await syncActivePromotions(req.storeId); res.json({ success: true, promotion: p }); } catch (err) { next(err); } });
router.delete('/:id', requireRole('manager'), async (req, res, next) => { try { await Promotion.findOneAndDelete({ _id: req.params.id, store: req.storeId }); await syncActivePromotions(req.storeId); res.json({ success: true }); } catch (err) { next(err); } });
router.post('/validate-code', async (req, res, next) => { try { const promo = await validatePromoCode(req.body.code, req.storeId); res.json({ success: true, promotion: promo }); } catch (err) { next(err); } });
router.post('/apply', async (req, res, next) => { try { const result = await applyPromotions(req.body.items || [], null, req.body.promoCode, req.storeId); res.json({ success: true, ...result }); } catch (err) { next(err); } });
module.exports = router;
