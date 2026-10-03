'use strict';

const Sale = require('../models/Sale');
const Refund = require('../models/Refund');
const Product = require('../models/Product');
const StockMovement = require('../models/StockMovement');
const AppError = require('../utils/AppError');
const cashDrawerService = require('./cashDrawerService');
const { generateReceiptNumber, round2 } = require('../utils/formatters');

// Key an item consistently across sale + prior refunds.
function itemKey(i) {
  return (i.product && i.product.toString()) || i.barcode || i.name;
}

/**
 * PURE refund maths + validation (no DB) so it's unit-testable.
 * Validates quantities, subtracts what's already been refunded, and computes discount-aware
 * amounts. Throws AppError on any invalid/excessive request.
 * @returns { refundItems, refundAmount, alreadyRefundedAmount }
 */
function computeRefundLines({ sale, itemsToRefund, priorRefunds = [] }) {
  if (!Array.isArray(itemsToRefund) || itemsToRefund.length === 0) {
    throw AppError.validation('No items provided to refund');
  }

  const alreadyRefunded = new Map();
  let alreadyRefundedAmount = 0;
  for (const rf of priorRefunds) {
    alreadyRefundedAmount += rf.refundAmount || 0;
    for (const it of rf.items || []) {
      alreadyRefunded.set(itemKey(it), (alreadyRefunded.get(itemKey(it)) || 0) + (it.quantity || 0));
    }
  }

  const refundItems = [];
  let refundAmount = 0;

  for (const ri of itemsToRefund) {
    const saleItem = sale.items.find(
      (i) => (ri.productId && i.product?.toString() === ri.productId) || (ri.barcode && i.barcode === ri.barcode),
    );
    if (!saleItem) throw AppError.notFound(`Item ${ri.barcode || ri.productId}`);

    const soldQty = Number(saleItem.quantity) || 0;
    const refundedQty = alreadyRefunded.get(itemKey(saleItem)) || 0;
    const remaining = soldQty - refundedQty;

    const qty = ri.quantity == null ? remaining : Number(ri.quantity);
    if (!Number.isFinite(qty) || qty <= 0 || !Number.isInteger(qty)) {
      throw AppError.validation(`Refund quantity for ${saleItem.name} must be a positive whole number`);
    }
    if (qty > remaining) {
      throw AppError.validation(`Cannot refund ${qty} × ${saleItem.name} — only ${remaining} remain refundable`);
    }

    // Discount-aware: the price actually paid per unit on this line.
    const paidPerUnit = soldQty > 0 && saleItem.lineTotal != null
      ? saleItem.lineTotal / soldQty
      : (saleItem.unitPrice || 0);
    const lineTotal = round2(paidPerUnit * qty);

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

  refundAmount = round2(refundAmount);
  if (refundAmount <= 0) throw AppError.validation('Refund amount must be positive');
  if (round2(alreadyRefundedAmount + refundAmount) > round2(sale.total) + 0.001) {
    throw AppError.validation('Refund would exceed the amount paid for this sale');
  }

  return { refundItems, refundAmount, alreadyRefundedAmount, alreadyRefunded };
}

/**
 * Process a refund for a sale. Safe by construction:
 *  - SHOP-SCOPED: only refunds a sale belonging to the requesting store.
 *  - QUANTITY-AWARE: never refunds more than remains refundable (prior refunds counted),
 *    so repeated/duplicate requests can't over-refund.
 *  - DISCOUNT-AWARE: refunds the price actually paid per unit (lineTotal ÷ quantity), not
 *    the pre-discount unit price.
 *  - VALIDATED: quantities must be positive integers within the remaining amount.
 *  - Stock, refund record and sale status update together.
 *
 * @param {Object} args
 * @param {string} args.storeId  REQUIRED — the requesting shop; enforces isolation.
 */
async function processRefund({
  saleId, storeId, itemsToRefund, refundMethod, reason,
  staffId, staffName, authorisedById, authorisedByName, io,
}) {
  if (!storeId) throw AppError.forbidden('Store context required');
  if (!Array.isArray(itemsToRefund) || itemsToRefund.length === 0) {
    throw AppError.validation('No items provided to refund');
  }

  // 1. Shop-scoped fetch — a shop can never touch another shop's sale.
  const sale = await Sale.findOne({ _id: saleId, store: storeId });
  if (!sale) throw AppError.notFound('Sale');
  if (sale.status === 'voided') throw AppError.saleAlreadyVoided();
  if (sale.status === 'refunded') throw AppError.validation('This sale has already been fully refunded');

  // 2–3. How much is already refunded + validate/compute this refund (pure, unit-tested).
  const priorRefunds = await Refund.find({ store: storeId, originalSale: sale._id }).lean();
  const { refundItems, refundAmount, alreadyRefundedAmount, alreadyRefunded } =
    computeRefundLines({ sale, itemsToRefund, priorRefunds });

  // 4. Create the refund record.
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
    authorisedByName,
    items: refundItems,
    refundAmount,
    refundMethod: refundMethod || 'original_payment',
    reason,
    processedAt: new Date(),
  });

  // 5. Restore stock + movements.
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

  // 6. Update sale status from TOTAL refunded quantity (not just this refund).
  const totalSoldQty = sale.items.reduce((n, i) => n + (Number(i.quantity) || 0), 0);
  let totalRefundedQty = 0;
  for (const it of refundItems) totalRefundedQty += it.quantity;
  for (const q of alreadyRefunded.values()) totalRefundedQty += q;
  const fullyRefunded = totalRefundedQty >= totalSoldQty
    || round2(alreadyRefundedAmount + refundAmount) >= round2(sale.total);
  sale.status = fullyRefunded ? 'refunded' : 'partially_refunded';
  await sale.save();

  // 7. Cash drawer for cash refunds.
  const cashPayment = sale.payments.find((p) => p.method === 'cash');
  if (cashPayment && (refundMethod === 'cash' || refundMethod === 'original_payment')) {
    await cashDrawerService.recordRefund(
      sale.store.toString(), sale.tillId, refundAmount, sale._id, staffId, staffName,
    );
  }

  return { refund, refundAmount, refundReceiptNumber };
}

module.exports = { processRefund, computeRefundLines };
