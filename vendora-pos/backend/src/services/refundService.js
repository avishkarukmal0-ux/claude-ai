'use strict';

const Sale = require('../models/Sale');
const Refund = require('../models/Refund');
const Product = require('../models/Product');
const StockMovement = require('../models/StockMovement');
const Customer = require('../models/Customer');
const AppError = require('../utils/AppError');
const cashDrawerService = require('./cashDrawerService');
const { generateReceiptNumber } = require('../utils/formatters');

async function processRefund(saleId, itemsToRefund, refundMethod, reason, staffId, staffName, authorisedById, authorisedByName, io) {
  const sale = await Sale.findById(saleId);
  if (!sale) throw AppError.notFound('Sale');
  if (sale.status === 'voided') throw AppError.saleAlreadyVoided();

  // Build refund items
  const refundItems = [];
  let refundAmount = 0;

  for (const ri of itemsToRefund) {
    const saleItem = sale.items.find(
      (i) => i.barcode === ri.barcode || i.product?.toString() === ri.productId
    );
    if (!saleItem) throw AppError.notFound(`Item ${ri.barcode || ri.productId}`);

    const qty = ri.quantity || saleItem.quantity;
    const lineTotal = (saleItem.unitPrice || 0) * qty;

    refundItems.push({
      product: saleItem.product,
      barcode: saleItem.barcode,
      name: saleItem.name,
      quantity: qty,
      unitPrice: saleItem.unitPrice,
      lineTotal,
      stockRestored: true,
    });
    refundAmount += lineTotal;
  }

  refundAmount = Math.round(refundAmount * 100) / 100;

  // Generate refund receipt number
  const count = await Refund.countDocuments({ store: sale.store });
  const refundReceiptNumber = 'REF-' + generateReceiptNumber(count + 1);

  const refund = await Refund.create({
    store: sale.store,
    originalSale: sale._id,
    receiptNumber: sale.receiptNumber,
    refundReceiptNumber,
    processedBy: staffId,
    processedByName: staffName,
    authorisedBy: authorisedById,
    authorisedByName: authorisedByName,
    items: refundItems,
    refundAmount,
    refundMethod: refundMethod || 'original_payment',
    reason,
    processedAt: new Date(),
  });

  // Restore stock
  for (const ri of refundItems) {
    if (ri.stockRestored && ri.product) {
      await Product.findByIdAndUpdate(ri.product, { $inc: { 'stock.quantity': ri.quantity } });
      await StockMovement.create({
        store: sale.store,
        product: ri.product,
        barcode: ri.barcode,
        productName: ri.name,
        type: 'refund',
        quantity: ri.quantity,
        reference: refundReceiptNumber,
        reason: `Refund: ${reason}`,
        staff: staffId,
        staffName,
      });
    }
  }

  // Update sale status
  const fullRefund = refundAmount >= sale.total;
  sale.status = fullRefund ? 'refunded' : 'partially_refunded';
  await sale.save();

  // If cash refund, update drawer
  const cashPayment = sale.payments.find((p) => p.method === 'cash');
  if (cashPayment && (refundMethod === 'cash' || refundMethod === 'original_payment')) {
    await cashDrawerService.recordRefund(
      sale.store.toString(),
      sale.tillId,
      refundAmount,
      sale._id,
      staffId,
      staffName
    );
  }

  return { refund, refundAmount, refundReceiptNumber };
}

module.exports = { processRefund };
