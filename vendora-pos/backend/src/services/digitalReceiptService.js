'use strict';

const DigitalReceipt = require('../models/DigitalReceipt');
const { formatCurrency, formatDate } = require('../utils/formatters');
const logger = require('../utils/logger');

async function generateHtml(sale, store) {
  const storeName = store ? store.name : 'Vendora POS';
  const storeAddress = store
    ? [store.address.line1, store.address.city, store.address.postcode].filter(Boolean).join(', ')
    : '';
  const receiptFooter = store ? store.settings.receiptFooter : 'Thank you for shopping with us!';
  const vatNumber = store ? store.vatNumber : '';

  const itemsHtml = (sale.items || [])
    .map(
      (item) => `
      <tr>
        <td style="padding:4px 8px;">${item.name}</td>
        <td style="padding:4px 8px;text-align:right;">${item.quantity}</td>
        <td style="padding:4px 8px;text-align:right;">${formatCurrency(item.unitPrice)}</td>
        <td style="padding:4px 8px;text-align:right;">${formatCurrency(item.lineTotal)}</td>
      </tr>`
    )
    .join('');

  const paymentsHtml = (sale.payments || [])
    .map(
      (p) => `
      <tr>
        <td style="padding:2px 8px;">${p.method.replace(/_/g, ' ').toUpperCase()}</td>
        <td style="padding:2px 8px;text-align:right;">${formatCurrency(p.amount)}</td>
      </tr>`
    )
    .join('');

  return `<!DOCTYPE html>
<html>
<head><meta charset="UTF-8"><title>Receipt ${sale.receiptNumber}</title></head>
<body style="font-family:monospace;max-width:400px;margin:0 auto;padding:20px;">
  <div style="text-align:center;margin-bottom:16px;">
    <h2 style="margin:0;">${storeName}</h2>
    <p style="margin:4px 0;font-size:12px;">${storeAddress}</p>
    ${vatNumber ? `<p style="margin:4px 0;font-size:12px;">VAT: ${vatNumber}</p>` : ''}
  </div>
  <hr/>
  <p style="font-size:12px;margin:4px 0;"><strong>Receipt:</strong> ${sale.receiptNumber}</p>
  <p style="font-size:12px;margin:4px 0;"><strong>Date:</strong> ${formatDate(sale.completedAt || sale.createdAt)}</p>
  <p style="font-size:12px;margin:4px 0;"><strong>Staff:</strong> ${sale.staffName}</p>
  <hr/>
  <table width="100%" style="border-collapse:collapse;font-size:13px;">
    <thead>
      <tr style="border-bottom:1px solid #ccc;">
        <th style="text-align:left;padding:4px 8px;">Item</th>
        <th style="text-align:right;padding:4px 8px;">Qty</th>
        <th style="text-align:right;padding:4px 8px;">Price</th>
        <th style="text-align:right;padding:4px 8px;">Total</th>
      </tr>
    </thead>
    <tbody>${itemsHtml}</tbody>
  </table>
  <hr/>
  <table width="100%" style="font-size:13px;">
    ${sale.discountTotal > 0 ? `<tr><td>Discount</td><td style="text-align:right;">-${formatCurrency(sale.discountTotal)}</td></tr>` : ''}
    <tr><td>Subtotal</td><td style="text-align:right;">${formatCurrency(sale.subtotal)}</td></tr>
    <tr><td><strong>TOTAL</strong></td><td style="text-align:right;"><strong>${formatCurrency(sale.total)}</strong></td></tr>
  </table>
  <hr/>
  <table width="100%" style="font-size:12px;">
    ${paymentsHtml}
    ${sale.cashDetails && sale.cashDetails.change > 0 ? `<tr><td>Change Given</td><td style="text-align:right;">${formatCurrency(sale.cashDetails.change)}</td></tr>` : ''}
  </table>
  <hr/>
  <div style="text-align:center;font-size:11px;margin-top:12px;">
    ${sale.loyaltyPointsEarned > 0 ? `<p>Points Earned: ${sale.loyaltyPointsEarned}</p>` : ''}
    <p>${receiptFooter}</p>
  </div>
</body>
</html>`;
}

async function send(sale, storeId) {
  try {
    const Store = require('../models/Store');
    const Customer = require('../models/Customer');

    const store = await Store.findById(storeId);
    const htmlContent = await generateHtml(sale, store);

    let email = null;
    let phone = null;
    let deliveryMethod = null;

    if (sale.customer) {
      const customer = await Customer.findById(sale.customer);
      if (customer) {
        if (customer.marketing.emailOptIn && customer.email) {
          email = customer.email;
          deliveryMethod = 'email';
        }
        if (customer.marketing.smsOptIn && customer.phone) {
          phone = customer.phone;
          deliveryMethod = deliveryMethod ? 'both' : 'sms';
        }
      }
    }

    if (!deliveryMethod) return null;

    const receipt = await DigitalReceipt.create({
      store: storeId,
      receiptNumber: sale.receiptNumber,
      sale: sale._id,
      deliveryMethod,
      email,
      phone,
      status: 'pending',
      htmlContent,
    });

    // In development, just log — in production use SendGrid/Twilio
    if (process.env.NODE_ENV === 'development') {
      logger.info(`[DigitalReceipt] Would send ${deliveryMethod} receipt for ${sale.receiptNumber} to ${email || phone}`);
      await DigitalReceipt.findByIdAndUpdate(receipt._id, { status: 'sent', sentAt: new Date() });
    } else if (email && process.env.SENDGRID_API_KEY) {
      const nodemailer = require('nodemailer');
      // Nodemailer via SendGrid SMTP
      const transporter = nodemailer.createTransport({
        host: 'smtp.sendgrid.net',
        port: 587,
        auth: { user: 'apikey', pass: process.env.SENDGRID_API_KEY },
      });
      await transporter.sendMail({
        from: process.env.SENDGRID_FROM_EMAIL,
        to: email,
        subject: `Your receipt from ${store ? store.name : 'Vendora POS'} — ${sale.receiptNumber}`,
        html: htmlContent,
      });
      await DigitalReceipt.findByIdAndUpdate(receipt._id, { status: 'sent', sentAt: new Date() });
    }

    return receipt;
  } catch (err) {
    logger.error('DigitalReceiptService.send error:', err.message);
    return null;
  }
}

async function resend(digitalReceiptId) {
  const receipt = await DigitalReceipt.findById(digitalReceiptId).populate('sale');
  if (!receipt) throw new Error('Receipt not found');
  return send(receipt.sale, receipt.store);
}

module.exports = { send, resend, generateHtml };
