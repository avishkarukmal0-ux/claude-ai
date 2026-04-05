'use strict';
const express = require('express'); const router = express.Router();
router.post('/generate', async (req, res) => { res.json({ success: false, message: 'Wallet passes not configured' }); });
module.exports = router;
