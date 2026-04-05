'use strict';

const express = require('express');
const router = express.Router();
const Sale = require('../models/Sale');
const Product = require('../models/Product');
const Customer = require('../models/Customer');
const GiftCard = require('../models/GiftCard');
const StockMovement = require('../models/StockMovement');
const AuditLog = require('../models/AuditLog');
const AppError = require('../utils/AppError');
const { requireRole, requirePermission } = require('../middleware/permissions');
const cashDrawerService = require('../services/cashDrawerService');
const loyaltyService = require('../services/loyaltyService');
const promotionsEngine = require('../services/promotionsEngine');
const lossPreventionService = require('../services/lossPreventionService');
const digitalReceiptService = require('../services/digitalReceiptService');
const refundService = require('../services/refundService');
const { generateReceiptNumber, round2, extractVat } = require('../utils/formatters');
const { todayStart, todayEnd } = require('../utils/helpers');

// POST /api/sales
router.post('/', async (req, res, next) => {
  try {
    const { tillId = 'TILL-1', customerId, items: rawItems, payments, cashDetails, promoCode, loyaltyPointsToRedeem, isTraining } = req.body;
    const storeId = req.storeId;
    const staff = req.user;
    const store = req.store;
    const io = req.io;

    if (!rawItems || rawItems.length === 0) return next(AppError.validation('No items provided'));
    if (!payments || payments.length === 0) return next(AppError.validation('No payment provided'));

    // 1. Validate and enrich items
    const enrichedItems = [];
    for (const ri of rawItems) {
      const product = ri.productId
        ? await Product.findOne({ _id: ri.productId, store: storeId, isActive: true })
        : await Product.findOne({ barcode: ri.barcode, store: storeId, isActive: true });

      if (!product) {
        return next(ri.barcode ? AppError.barcodeNotFound(ri.barcode) : AppError.notFound('Product'));
      }
      if (!product.isActive) return next(AppError.productInactive());

      const availableQty = product.stock.quantity;
      if (!product.attributes.isWeighed && availableQty < ri.quantity) {
        return next(AppError.insufficientStock(product.name, availableQty));
      }

      // 4. Age verification check
      if (product.attributes.ageRestricted && !ri.ageVerified && !isTraining) {
        return next(AppError.ageVerificationRequired(product.name));
      }

      const unitPrice = product.pricing.retailPrice;
      let lineTotal = round2(unitPrice * ri.quantity);
      const discountData = ri.discount || {};
      let discountAmount = 0;

      if (discountData.type === 'percent' && discountData.amount > 0) {
        discountAmount = round2(lineTotal * (discountData.amount / 100));
        lineTotal = round2(lineTotal - discountAmount);
      } else if (discountData.type === 'fixed' && discountData.amount > 0) {
        discountAmount = Math.min(discountData.amount, lineTotal);
        lineTotal = round2(lineTotal - discountAmount);
      }

      const { vat: vatAmount } = extractVat(lineTotal, product.pricing.vatRate);

      enrichedItems.push({
        product: product._id,
        barcode: product.barcode,
        name: product.name,
        category: product.category,
        quantity: ri.quantity,
        unitPrice,
        costPrice: product.pricing.costPrice,
        discount: discountData.amount > 0 ? { type: discountData.type, amount: discountData.amount, reason: discountData.reason, authorisedBy: discountData.authorisedBy } : undefined,
        lineTotal,
        vatRate: product.pricing.vatRate,
        vatAmount,
        ageVerified: !!ri.ageVerified,
        scanTime: ri.scanTime || new Date(),
      });
    }

    // 2. Apply promotions
    const { promotionsApplied, totalDiscount } = await promotionsEngine.applyPromotions(
      enrichedItems, customerId ? await Customer.findById(customerId) : null, promoCode, storeId
    );

    // Load customer if provided
    let customer = null;
    let customerName = null;
    if (customerId) {
      customer = await Customer.findById(customerId);
      if (customer) customerName = `${customer.firstName} ${customer.lastName}`;
    }

    // 3. Loyalty points redemption
    let loyaltyMonetaryValue = 0;
    if (loyaltyPointsToRedeem > 0 && customer && store) {
      const redemption = await loyaltyService.redeemPoints(customerId, loyaltyPointsToRedeem, null, store.settings);
      loyaltyMonetaryValue = redemption.monetaryValue;
    }

    // Calculate totals
    const subtotal = round2(enrichedItems.reduce((s, i) => s + i.lineTotal, 0));
    const discountTotal = round2(totalDiscount + (loyaltyMonetaryValue || 0));
    const total = round2(Math.max(0, subtotal - totalDiscount));

    // Validate payment totals
    const paymentTotal = round2(payments.reduce((s, p) => s + (p.amount || 0), 0));
    if (Math.abs(paymentTotal - total) > 0.02) {
      return next(AppError.validation(`Payment total (£${paymentTotal}) doesn't match sale total (£${total})`));
    }

    // 5. Generate receipt number
    const todayCount = await Sale.countDocuments({
      store: storeId,
      completedAt: { $gte: todayStart(), $lte: todayEnd() },
    });
    const receiptNumber = generateReceiptNumber(todayCount + 1);

    // VAT breakdown
    const vatBreakdown = {};
    for (const item of enrichedItems) {
      const rate = item.vatRate || 'standard';
      if (!vatBreakdown[rate]) vatBreakdown[rate] = { rate, netAmount: 0, vatAmount: 0 };
      vatBreakdown[rate].vatAmount += item.vatAmount || 0;
      vatBreakdown[rate].netAmount += item.lineTotal - (item.vatAmount || 0);
    }

    // 6. Save sale
    const sale = await Sale.create({
      store: storeId,
      tillId,
      receiptNumber,
      staff: staff._id,
      staffName: staff.displayName,
      customer: customer ? customer._id : undefined,
      customerName,
      items: enrichedItems,
      subtotal,
      discountTotal,
      vatBreakdown: Object.values(vatBreakdown),
      total,
      payments: payments.map((p) => ({
        method: p.method,
        amount: p.amount,
        reference: p.reference,
        cardLast4: p.cardLast4,
        cardType: p.cardType,
      })),
      cashDetails,
      status: isTraining ? 'completed' : 'completed',
      promotionsApplied,
      loyaltyPointsRedeemed: loyaltyPointsToRedeem || 0,
      isTraining: !!isTraining,
      completedAt: new Date(),
    });

    if (!isTraining) {
      // 7. Deduct stock + create movements
      for (const item of enrichedItems) {
        await Product.findByIdAndUpdate(item.product, { $inc: { 'stock.quantity': -item.quantity } });
        await StockMovement.create({
          store: storeId,
          product: item.product,
          barcode: item.barcode,
          productName: item.name,
          type: 'sale',
          quantity: -item.quantity,
          reference: receiptNumber,
          staff: staff._id,
          staffName: staff.displayName,
        });
      }

      // 8. Cash drawer
      const cashPayment = payments.find((p) => p.method === 'cash');
      if (cashPayment) {
        await cashDrawerService.recordCashSale(storeId, tillId, cashPayment.amount, sale._id, receiptNumber, staff._id, staff.displayName, io);
      }

      // 9. Loyalty points earn
      let loyaltyPointsEarned = 0;
      if (customer && store && store.settings.loyaltyEnabled && customer.loyalty.enrolled) {
        loyaltyPointsEarned = await loyaltyService.earnPoints(customerId, total, sale._id, store.settings);
        if (loyaltyPointsEarned > 0) {
          await Sale.findByIdAndUpdate(sale._id, { loyaltyPointsEarned });
        }
      }

      // 10. Promo usage
      for (const p of promotionsApplied) {
        promotionsEngine.recordUsage(p.promotionId, p.discountAmount).catch(() => {});
      }

      // 11. Gift card payments
      for (const payment of payments) {
        if (payment.method === 'gift_card' && payment.reference) {
          await GiftCard.findOneAndUpdate(
            { code: payment.reference, store: storeId },
            {
              $inc: { currentBalance: -payment.amount },
              $push: { transactions: { type: 'redeem', amount: -payment.amount, saleId: sale._id, createdAt: new Date() } },
            }
          );
        }
      }

      // 12. Discount pattern detection (async, don't await)
      const discounts = enrichedItems.filter((i) => i.discount && i.discount.amount > 0);
      if (discounts.length > 0) {
        lossPreventionService.recordDiscountPattern(staff._id, storeId, sale._id, discounts).catch(() => {});
      }

      // 12b. Scan pattern detection (fire and forget)
      lossPreventionService.analyzeSaleForPatterns(sale).catch(() => {});

      // 13. Digital receipt
      if (customer) {
        digitalReceiptService.send(sale, storeId).catch(() => {});
      }

      // 15. Socket emit
      if (io) {
        io.to(`store:${storeId}`).emit('sale:completed', {
          receiptNumber,
          total,
          staffName: staff.displayName,
          tillId,
        });
      }
    }

    res.status(201).json({ success: true, sale, receiptNumber });
  } catch (err) {
    next(err);
  }
});

// GET /api/sales
router.get('/', async (req, res, next) => {
  try {
    const { from, to, staffId, status, search, page = 1, limit = 50 } = req.query;
    const query = { store: req.storeId, isTraining: false };

    if (from || to) {
      query.completedAt = {};
      if (from) query.completedAt.$gte = new Date(from);
      if (to) query.completedAt.$lte = new Date(to);
    }
    if (staffId) query.staff = staffId;
    if (status) query.status = status;
    if (search) {
      query.$or = [
        { receiptNumber: new RegExp(search, 'i') },
        { staffName: new RegExp(search, 'i') },
        { customerName: new RegExp(search, 'i') },
      ];
    }

    const [sales, total] = await Promise.all([
      Sale.find(query)
        .sort({ completedAt: -1 })
        .skip((page - 1) * limit)
        .limit(parseInt(limit))
        .lean(),
      Sale.countDocuments(query),
    ]);

    res.json({ success: true, sales, total, page: parseInt(page), limit: parseInt(limit) });
  } catch (err) {
    next(err);
  }
});

// GET /api/sales/today/summary
router.get('/today/summary', async (req, res, next) => {
  try {
    const sales = await Sale.find({
      store: req.storeId,
      status: 'completed',
      isTraining: false,
      completedAt: { $gte: todayStart(), $lte: todayEnd() },
    });

    const totalRevenue = sales.reduce((s, sale) => s + (sale.total || 0), 0);
    const transactionCount = sales.length;
    const cashSales = sales.filter((s) => s.payments.some((p) => p.method === 'cash')).length;

    res.json({
      success: true,
      summary: {
        totalRevenue: round2(totalRevenue),
        transactionCount,
        cashSales,
        averageBasket: transactionCount > 0 ? round2(totalRevenue / transactionCount) : 0,
      },
    });
  } catch (err) {
    next(err);
  }
});

// GET /api/sales/receipt/:number
router.get('/receipt/:number', async (req, res, next) => {
  try {
    const sale = await Sale.findOne({ receiptNumber: req.params.number, store: req.storeId });
    if (!sale) return next(AppError.notFound('Receipt'));
    res.json({ success: true, sale });
  } catch (err) {
    next(err);
  }
});

// GET /api/sales/:id
router.get('/:id', async (req, res, next) => {
  try {
    const sale = await Sale.findOne({ _id: req.params.id, store: req.storeId });
    if (!sale) return next(AppError.notFound('Sale'));
    res.json({ success: true, sale });
  } catch (err) {
    next(err);
  }
});

// POST /api/sales/:id/void
router.post('/:id/void', requirePermission('canVoid'), async (req, res, next) => {
  try {
    const { voidReason, authorisedPin } = req.body;
    const storeId = req.storeId;
    const staff = req.user;

    const sale = await Sale.findOne({ _id: req.params.id, store: storeId });
    if (!sale) return next(AppError.notFound('Sale'));
    if (sale.status === 'voided') return next(AppError.saleAlreadyVoided());

    // Check staff void limit
    await lossPreventionService.checkStaffLimit(staff._id, 'void', sale.total);

    // Supervisor PIN gate if required
    if (req.store && req.store.settings.requirePinForVoid && authorisedPin) {
      const bcrypt = require('bcryptjs');
      const Staff = require('../models/Staff');
      const allStaff = await Staff.find({ store: storeId, status: 'active', role: { $in: ['supervisor', 'manager', 'owner'] } });
      let pinValid = false;
      for (const s of allStaff) {
        if (s.pin && await bcrypt.compare(authorisedPin, s.pin)) { pinValid = true; break; }
      }
      if (!pinValid) return next(AppError.pinVerificationFailed());
    }

    // Restore stock
    for (const item of sale.items) {
      if (item.product) {
        await Product.findByIdAndUpdate(item.product, { $inc: { 'stock.quantity': item.quantity } });
        await StockMovement.create({
          store: storeId,
          product: item.product,
          barcode: item.barcode,
          productName: item.name,
          type: 'refund',
          quantity: item.quantity,
          reference: sale.receiptNumber,
          reason: `Void: ${voidReason}`,
          staff: staff._id,
          staffName: staff.displayName,
        });
      }
    }

    // Reverse cash in drawer
    const cashPayment = sale.payments.find((p) => p.method === 'cash');
    if (cashPayment) {
      await cashDrawerService.recordRefund(storeId, sale.tillId, cashPayment.amount, sale._id, staff._id, staff.displayName);
    }

    // Reverse loyalty points
    if (sale.loyaltyPointsEarned > 0 && sale.customer) {
      await loyaltyService.adjustPoints(sale.customer, -sale.loyaltyPointsEarned, 'Sale voided', staff._id);
    }

    // Increment void counter
    await lossPreventionService.incrementStaffCounter(staff._id, 'void', sale.total);

    sale.status = 'voided';
    sale.voidedBy = staff._id;
    sale.voidedByName = staff.displayName;
    sale.voidReason = voidReason;
    sale.voidedAt = new Date();
    await sale.save();

    await AuditLog.create({
      store: storeId,
      staff: staff._id,
      staffName: staff.displayName,
      action: 'sale_voided',
      entityType: 'Sale',
      entityId: sale._id,
      after: { voidReason, voidedAt: sale.voidedAt },
      ipAddress: req.ip,
    });

    res.json({ success: true, sale });
  } catch (err) {
    next(err);
  }
});

// POST /api/sales/:id/refund
router.post('/:id/refund', requirePermission('canRefund'), async (req, res, next) => {
  try {
    const { items, refundMethod, reason, authorisedPin } = req.body;
    const { refund, refundAmount, refundReceiptNumber } = await refundService.processRefund(
      req.params.id,
      items,
      refundMethod,
      reason,
      req.user._id,
      req.user.displayName,
      req.user._id,
      req.user.displayName,
      req.io
    );

    await lossPreventionService.incrementStaffCounter(req.user._id, 'refund', refundAmount);

    res.json({ success: true, refund, refundAmount, refundReceiptNumber });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
