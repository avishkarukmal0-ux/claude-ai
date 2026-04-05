'use strict';
const express = require('express'); const router = express.Router();
const { applyPromotions, validatePromoCode } = require('../services/promotionsEngine');
router.post('/apply', async (req, res, next) => { try { const r = await applyPromotions(req.body.items||[], null, req.body.promoCode, req.storeId); res.json({ success: true, ...r }); } catch (err) { next(err); } });
router.post('/validate', async (req, res, next) => { try { const p = await validatePromoCode(req.body.code, req.storeId); res.json({ success: true, promotion: p }); } catch (err) { next(err); } });
module.exports = router;
