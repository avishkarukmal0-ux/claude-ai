'use strict';

const express = require('express');
const crypto = require('crypto');
const qrcode = require('qrcode');
const router = express.Router();
const publicRouter = express.Router();

const Sale = require('../models/Sale');
const Store = require('../models/Store');
const ReceiptToken = require('../models/ReceiptToken');
const DigitalReceipt = require('../models/DigitalReceipt');
const AppError = require('../utils/AppError');
const smsService = require('../services/smsService');

// POST /api/receipts/qr/:saleId — authenticated
router.post('/qr/:saleId', async (req, res, next) => {
  try {
    const sale = await Sale.findOne({ _id: req.params.saleId, store: req.storeId });
    if (!sale) return next(AppError.notFound('Sale'));

    const token = crypto.randomBytes(16).toString('hex');
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);

    await ReceiptToken.create({ store: req.storeId, sale: sale._id, token, expiresAt });

    const receiptUrl = `${process.env.APP_URL || 'http://localhost:5173'}/receipt/${token}`;
    const qrBase64 = await qrcode.toDataURL(receiptUrl);

    res.json({ success: true, token, receiptUrl, qrCode: qrBase64 });
  } catch (err) {
    next(err);
  }
});

// POST /api/receipts/whatsapp — authenticated
router.post('/whatsapp', async (req, res, next) => {
  try {
    const { saleId, phone } = req.body;
    if (!saleId || !phone) return next(AppError.validationError('saleId and phone are required'));

    // Format UK phone number to E.164
    let formattedPhone = phone.trim().replace(/\s+/g, '');
    if (formattedPhone.startsWith('0')) {
      formattedPhone = '+44' + formattedPhone.slice(1);
    } else if (!formattedPhone.startsWith('+')) {
      formattedPhone = '+44' + formattedPhone;
    }

    const sale = await Sale.findOne({ _id: saleId, store: req.storeId });
    if (!sale) return next(AppError.notFound('Sale'));

    const store = await Store.findById(req.storeId).lean();
    const storeName = store ? store.name : 'Vendora Store';
    const storeAddress = store && store.address ? store.address.line1 || '' : '';

    // Format message
    const divider = '\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500';
    const itemLines = (sale.items || []).map((item) => {
      const name = item.name || 'Item';
      const qty = item.quantity || 1;
      const price = Number(item.lineTotal || 0).toFixed(2);
      return `${name} x${qty}    \u00a3${price}`;
    }).join('\n');

    const subtotal = Number(sale.subtotal || sale.total || 0).toFixed(2);
    const total = Number(sale.total || 0).toFixed(2);
    const vatTotal = (sale.vatBreakdown || []).reduce((s, v) => s + (v.vatAmount || 0), 0);

    const message = [
      `\ud83e\uddfe *${storeName}*`,
      `\ud83d\udccd ${storeAddress}`,
      divider,
      itemLines,
      divider,
      `Subtotal: \u00a3${subtotal}`,
      vatTotal > 0 ? `VAT: \u00a3${vatTotal.toFixed(2)}` : null,
      `*TOTAL: \u00a3${total}*`,
      divider,
      `Receipt: ${sale.receiptNumber || 'N/A'}`,
      'Thank you! \ud83d\ude0a',
    ].filter(Boolean).join('\n');

    let sent = false;
    const twilioSid = process.env.TWILIO_ACCOUNT_SID;
    const twilioToken = process.env.TWILIO_AUTH_TOKEN;
    const twilioFrom = process.env.TWILIO_WHATSAPP_NUMBER || process.env.TWILIO_PHONE_NUMBER || '+14155238886';

    if (twilioSid && twilioToken) {
      try {
        const twilio = require('twilio')(twilioSid, twilioToken);
        await twilio.messages.create({
          from: `whatsapp:${twilioFrom}`,
          to: `whatsapp:${formattedPhone}`,
          body: message,
        });
        sent = true;
      } catch (twilioErr) {
        // Fall through to wa.me link
        sent = false;
      }
    }

    const waText = encodeURIComponent(message);
    const waLink = `https://wa.me/${formattedPhone.replace('+', '')}?text=${waText}`;

    // Save digital receipt record
    try {
      await DigitalReceipt.create({
        store: req.storeId,
        receiptNumber: sale.receiptNumber || '',
        sale: sale._id,
        deliveryMethod: 'sms',
        phone: formattedPhone,
        status: sent ? 'sent' : 'pending',
        sentAt: sent ? new Date() : undefined,
      });
    } catch (_) {
      // Non-fatal
    }

    res.json({ success: true, waLink, sent });
  } catch (err) {
    next(err);
  }
});

// PUBLIC: GET /receipt/:token — no auth
publicRouter.get('/:token', async (req, res, next) => {
  try {
    const receiptToken = await ReceiptToken.findOne({ token: req.params.token })
      .populate({
        path: 'sale',
        populate: { path: 'items.product' },
      });

    if (!receiptToken) {
      return res.status(404).send(`<!DOCTYPE html>
<html><head><meta charset="utf-8"><title>Receipt Not Found</title>
<meta name="viewport" content="width=device-width,initial-scale=1">
<style>body{font-family:sans-serif;text-align:center;padding:40px;color:#555}</style>
</head><body><h2>Receipt Not Found</h2><p>This receipt link is invalid or has expired.</p>
<p style="font-size:12px;color:#aaa;margin-top:40px">Powered by Vendora POS</p></body></html>`);
    }

    if (receiptToken.expiresAt < new Date()) {
      return res.status(410).send(`<!DOCTYPE html>
<html><head><meta charset="utf-8"><title>Receipt Expired</title>
<meta name="viewport" content="width=device-width,initial-scale=1">
<style>body{font-family:sans-serif;text-align:center;padding:40px;color:#555}</style>
</head><body><h2>Receipt Expired</h2><p>This receipt link has expired (valid for 24 hours).</p>
<p style="font-size:12px;color:#aaa;margin-top:40px">Powered by Vendora POS</p></body></html>`);
    }

    // Mark as viewed
    if (!receiptToken.viewedAt) {
      receiptToken.viewedAt = new Date();
      await receiptToken.save();
    }

    const sale = receiptToken.sale;
    const store = await Store.findById(receiptToken.store || sale.store).lean();
    const storeName = store ? store.name : 'Store';
    const storeAddress = store && store.address
      ? [store.address.line1, store.address.city, store.address.postcode].filter(Boolean).join(', ')
      : '';
    const storePhone = store ? store.phone || '' : '';
    const storeVat = store ? store.vatNumber || '' : '';

    const saleDate = new Date(sale.completedAt || sale.createdAt);
    const dateStr = saleDate.toLocaleDateString('en-GB', { day: '2-digit', month: 'long', year: 'numeric' });
    const timeStr = saleDate.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });

    const itemRows = (sale.items || []).map((item) => `
      <tr>
        <td style="padding:8px 4px;border-bottom:1px solid #f0f0f0">${item.name || 'Item'}</td>
        <td style="padding:8px 4px;border-bottom:1px solid #f0f0f0;text-align:center">${item.quantity || 1}</td>
        <td style="padding:8px 4px;border-bottom:1px solid #f0f0f0;text-align:right">&pound;${Number(item.unitPrice || 0).toFixed(2)}</td>
        <td style="padding:8px 4px;border-bottom:1px solid #f0f0f0;text-align:right">&pound;${Number(item.lineTotal || 0).toFixed(2)}</td>
      </tr>`).join('');

    const subtotal = Number(sale.subtotal || sale.total || 0).toFixed(2);
    const total = Number(sale.total || 0).toFixed(2);
    const vatTotal = (sale.vatBreakdown || []).reduce((s, v) => s + (v.vatAmount || 0), 0);
    const discountTotal = Number(sale.discountTotal || 0);

    const paymentRows = (sale.payments || []).map((p) => {
      const method = p.method ? p.method.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()) : 'Payment';
      const detail = p.cardLast4 ? ` (&bull;&bull;&bull;&bull; ${p.cardLast4})` : '';
      return `<tr><td style="padding:4px 0;color:#666">${method}${detail}</td><td style="padding:4px 0;text-align:right">&pound;${Number(p.amount || 0).toFixed(2)}</td></tr>`;
    }).join('');

    const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Receipt &mdash; ${storeName}</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      background: #f5f5f5;
      color: #333;
      min-height: 100vh;
      padding: 16px;
    }
    .card {
      background: #fff;
      max-width: 480px;
      margin: 0 auto;
      border-radius: 12px;
      box-shadow: 0 2px 16px rgba(0,0,0,0.08);
      overflow: hidden;
    }
    .header {
      background: #1a1a2e;
      color: #fff;
      text-align: center;
      padding: 28px 20px 20px;
    }
    .header h1 {
      font-size: 22px;
      font-weight: 700;
      letter-spacing: -0.3px;
    }
    .header p {
      font-size: 13px;
      color: #aaa;
      margin-top: 4px;
    }
    .receipt-meta {
      padding: 16px 20px;
      background: #fafafa;
      border-bottom: 1px solid #eee;
      display: flex;
      justify-content: space-between;
      font-size: 13px;
      color: #666;
    }
    .receipt-meta strong { color: #333; }
    .items-table {
      width: 100%;
      border-collapse: collapse;
      font-size: 14px;
    }
    .items-table thead th {
      padding: 10px 4px;
      background: #f9f9f9;
      text-align: left;
      font-size: 11px;
      text-transform: uppercase;
      letter-spacing: 0.5px;
      color: #888;
      border-bottom: 2px solid #eee;
    }
    .items-table thead th:nth-child(2) { text-align: center; }
    .items-table thead th:nth-child(3),
    .items-table thead th:nth-child(4) { text-align: right; }
    .items-section { padding: 0 20px; }
    .totals-section {
      padding: 16px 20px;
      border-top: 2px solid #eee;
    }
    .totals-table { width: 100%; font-size: 14px; }
    .totals-table td { padding: 4px 0; }
    .totals-table td:last-child { text-align: right; }
    .total-row td {
      font-size: 18px;
      font-weight: 700;
      padding-top: 10px;
      color: #1a1a2e;
    }
    .payments-section {
      padding: 12px 20px;
      background: #fafafa;
      border-top: 1px solid #eee;
      font-size: 13px;
    }
    .payments-section h3 {
      font-size: 11px;
      text-transform: uppercase;
      letter-spacing: 0.5px;
      color: #888;
      margin-bottom: 6px;
    }
    .payments-table { width: 100%; }
    .footer {
      text-align: center;
      padding: 24px 20px;
      background: #fff;
    }
    .footer .thank-you {
      font-size: 18px;
      font-weight: 600;
      color: #1a1a2e;
      margin-bottom: 6px;
    }
    .footer .subtitle { font-size: 13px; color: #888; }
    .footer .branding {
      margin-top: 20px;
      font-size: 11px;
      color: #ccc;
      text-transform: uppercase;
      letter-spacing: 0.5px;
    }
    @media (max-width: 520px) {
      body { padding: 8px; }
      .card { border-radius: 8px; }
    }
  </style>
</head>
<body>
  <div class="card">
    <div class="header">
      <h1>${storeName}</h1>
      ${storeAddress ? `<p>${storeAddress}</p>` : ''}
      ${storePhone ? `<p>${storePhone}</p>` : ''}
      ${storeVat ? `<p>VAT: ${storeVat}</p>` : ''}
    </div>

    <div class="receipt-meta">
      <div>
        <div style="color:#888;font-size:11px;text-transform:uppercase;letter-spacing:0.5px">Receipt No.</div>
        <strong>${sale.receiptNumber || 'N/A'}</strong>
      </div>
      <div style="text-align:right">
        <div style="color:#888;font-size:11px;text-transform:uppercase;letter-spacing:0.5px">Date &amp; Time</div>
        <strong>${dateStr}</strong><br><span style="color:#888">${timeStr}</span>
      </div>
    </div>

    <div class="items-section">
      <table class="items-table">
        <thead>
          <tr>
            <th>Item</th>
            <th>Qty</th>
            <th>Each</th>
            <th>Total</th>
          </tr>
        </thead>
        <tbody>
          ${itemRows}
        </tbody>
      </table>
    </div>

    <div class="totals-section">
      <table class="totals-table">
        <tbody>
          <tr><td style="color:#666">Subtotal</td><td>&pound;${subtotal}</td></tr>
          ${discountTotal > 0 ? `<tr><td style="color:#e74c3c">Discount</td><td style="color:#e74c3c">-&pound;${discountTotal.toFixed(2)}</td></tr>` : ''}
          ${vatTotal > 0 ? `<tr><td style="color:#666">VAT</td><td>&pound;${vatTotal.toFixed(2)}</td></tr>` : ''}
          <tr class="total-row"><td>TOTAL</td><td>&pound;${total}</td></tr>
        </tbody>
      </table>
    </div>

    ${sale.payments && sale.payments.length > 0 ? `
    <div class="payments-section">
      <h3>Payment</h3>
      <table class="payments-table">
        <tbody>${paymentRows}</tbody>
      </table>
    </div>` : ''}

    <div class="footer">
      <div class="thank-you">Thank you!</div>
      <div class="subtitle">We appreciate your custom</div>
      <div class="branding">Powered by Vendora POS</div>
    </div>
  </div>
</body>
</html>`;

    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.send(html);
  } catch (err) {
    next(err);
  }
});

module.exports = router;
module.exports.publicRouter = publicRouter;
