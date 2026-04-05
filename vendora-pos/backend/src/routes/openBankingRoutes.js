'use strict';
const express = require('express'); const router = express.Router();
router.post('/initiate', async (req, res) => { res.json({ success: false, message: 'Open Banking not configured' }); });
router.get('/status/:id', async (req, res) => { res.json({ success: false, status: 'unknown' }); });
module.exports = router;
