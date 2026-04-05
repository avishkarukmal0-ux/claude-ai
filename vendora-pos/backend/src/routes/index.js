const express = require('express');
const router = express.Router();
const { authenticate } = require('../middleware/auth');

const authRoutes           = require('./authRoutes');
const saleRoutes           = require('./saleRoutes');
const productRoutes        = require('./productRoutes');
const customerRoutes       = require('./customerRoutes');
const staffRoutes          = require('./staffRoutes');
const cashDrawerRoutes     = require('./cashDrawerRoutes');
const lossPreventionRoutes = require('./lossPreventionRoutes');
const reportRoutes         = require('./reportRoutes');
const supplierRoutes       = require('./supplierRoutes');
const purchaseOrderRoutes  = require('./purchaseOrderRoutes');
const invoiceRoutes        = require('./invoiceRoutes');
const promotionRoutes      = require('./promotionRoutes');
const giftCardRoutes       = require('./giftCardRoutes');
const smartReorderRoutes   = require('./smartReorderRoutes');
const hardwareRoutes       = require('./hardwareRoutes');
const subscriptionRoutes   = require('./subscriptionRoutes');
const posParkedRoutes      = require('./posParkedRoutes');
const posPromotionRoutes   = require('./posPromotionRoutes');
const posQuickKeyRoutes    = require('./posQuickKeyRoutes');
const posStockTakeRoutes   = require('./posStockTakeRoutes');
const posTrainingRoutes    = require('./posTrainingRoutes');
const displayRoutes        = require('./displayRoutes');
const digitalReceiptRoutes = require('./digitalReceiptRoutes');
const walletPassRoutes     = require('./walletPassRoutes');
const openBankingRoutes    = require('./openBankingRoutes');
const scheduleRoutes       = require('./scheduleRoutes');

// Public routes
router.use('/auth', authRoutes);

// All routes below require a valid JWT
router.use(authenticate);

router.use('/sales',            saleRoutes);
router.use('/products',         productRoutes);
router.use('/customers',        customerRoutes);
router.use('/staff',            staffRoutes);
router.use('/cash-drawer',      cashDrawerRoutes);
router.use('/loss-prevention',  lossPreventionRoutes);
router.use('/reports',          reportRoutes);
router.use('/suppliers',        supplierRoutes);
router.use('/purchase-orders',  purchaseOrderRoutes);
router.use('/invoices',         invoiceRoutes);
router.use('/promotions',       promotionRoutes);
router.use('/gift-cards',       giftCardRoutes);
router.use('/smart-reorder',    smartReorderRoutes);
router.use('/hardware',         hardwareRoutes);
router.use('/subscriptions',    subscriptionRoutes);
router.use('/display',          displayRoutes);
router.use('/digital-receipts', digitalReceiptRoutes);
router.use('/wallet-passes',    walletPassRoutes);
router.use('/open-banking',     openBankingRoutes);
router.use('/schedule',         scheduleRoutes);
router.use('/pos/parked',       posParkedRoutes);
router.use('/pos/promotions',   posPromotionRoutes);
router.use('/pos/quick-keys',   posQuickKeyRoutes);
router.use('/pos/stock-take',   posStockTakeRoutes);
router.use('/pos/training',     posTrainingRoutes);

module.exports = router;
