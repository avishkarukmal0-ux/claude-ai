'use strict';
const express = require('express'); const router = express.Router();
const DigitalReceipt = require('../models/DigitalReceipt');
const Customer = require('../models/Customer');
const { send, resend } = require('../services/digitalReceiptService');
const smsService = require('../services/smsService');
const AppError = require('../utils/AppError');

router.post('/send', async (req, res, next) => { try { const { saleId } = req.body; const Sale = require('../models/Sale'); const sale = await Sale.findById(saleId); if (!sale) return next(AppError.notFound('Sale')); const receipt = await send(sale, req.storeId); res.json({ success: true, receipt }); } catch (err) { next(err); } });
router.post('/resend/:id', async (req, res, next) => { try { const receipt = await resend(req.params.id); res.json({ success: true, receipt }); } catch (err) { next(err); } });
router.put('/preferences/:customerId', async (req, res, next) => { try { const { emailOptIn, smsOptIn } = req.body; const c = await Customer.findOneAndUpdate({ _id: req.params.customerId, store: req.storeId }, { 'marketing.emailOptIn': emailOptIn, 'marketing.smsOptIn': smsOptIn }, { new: true }); res.json({ success: true, customer: c }); } catch (err) { next(err); } });

// POST /api/digital-receipts/sms — send SMS receipt (#165)
router.post('/sms', async (req, res, next) => {
  try {
    const { saleId, phone } = req.body;
    if (!phone) return next(new AppError('Phone number required', 400, 'VALIDATION_ERROR'));
    const Sale = require('../models/Sale');
    const Store = require('../models/Store');
    const [sale, store] = await Promise.all([
      Sale.findById(saleId).populate('items.productId', 'name'),
      Store.findById(req.storeId).select('name'),
    ]);
    if (!sale) return next(AppError.notFound('Sale'));
    const items = (sale.items || []).map(i => ({ name: i.productId?.name || i.name || 'Item', quantity: i.quantity, lineTotal: i.lineTotal }));
    await smsService.sendReceiptSMS({ to: phone, storeName: store?.name, receiptNumber: sale.receiptNumber, total: sale.total, items });
    res.json({ success: true, message: `SMS receipt sent to ${phone}` });
  } catch (err) { next(err); }
});

module.exports = router;
