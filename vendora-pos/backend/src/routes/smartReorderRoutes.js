'use strict';
const express = require('express'); const router = express.Router();
const srs = require('../services/smartReorderService');
const { requireRole } = require('../middleware/permissions');
router.get('/suggestions', async (req, res, next) => { try { const suggestions = await srs.getSuggestions(req.storeId); res.json({ success: true, suggestions }); } catch (err) { next(err); } });
router.get('/shopping-list/:supplierId', async (req, res, next) => { try { const list = await srs.getShoppingList(req.storeId, req.params.supplierId); res.json({ success: true, list }); } catch (err) { next(err); } });
router.post('/create-po', async (req, res, next) => { try { const po = await srs.createPO(req.storeId, req.body.suggestions, req.user._id); res.status(201).json({ success: true, purchaseOrder: po }); } catch (err) { next(err); } });
router.get('/analytics', async (req, res, next) => { try { const analytics = await srs.getAnalytics(req.storeId); res.json({ success: true, analytics }); } catch (err) { next(err); } });
module.exports = router;
