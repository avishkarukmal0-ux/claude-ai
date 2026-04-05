'use strict';
const express = require('express'); const router = express.Router();
const { getRedis } = require('../config/redis');
router.get('/state/:tillId', async (req, res, next) => { try { const redis = getRedis(); const state = await redis.get(`display:${req.storeId}:${req.params.tillId}`); res.json({ success: true, state: state ? JSON.parse(state) : { status: 'idle', items: [], total: 0 } }); } catch (err) { next(err); } });
router.post('/state/:tillId', async (req, res, next) => { try { const redis = getRedis(); await redis.set(`display:${req.storeId}:${req.params.tillId}`, JSON.stringify(req.body), 'EX', 3600); if (req.io) req.io.to(`store:${req.storeId}`).emit('display:update', { tillId: req.params.tillId, ...req.body }); res.json({ success: true }); } catch (err) { next(err); } });
router.delete('/state/:tillId', async (req, res, next) => { try { const redis = getRedis(); await redis.del(`display:${req.storeId}:${req.params.tillId}`); if (req.io) req.io.to(`store:${req.storeId}`).emit('display:update', { tillId: req.params.tillId, status: 'idle', items: [], total: 0 }); res.json({ success: true }); } catch (err) { next(err); } });
module.exports = router;
