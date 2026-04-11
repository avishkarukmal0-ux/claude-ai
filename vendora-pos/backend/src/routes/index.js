const express = require('express');
const router = express.Router();
const { authenticate } = require('../middleware/auth');

const { publicRouter: receiptPublicRouter } = require('./receiptRoutes');
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
const { publicRouter: subscriptionPublicRouter } = require('./subscriptionRoutes');
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
const challenge25Routes    = require('./challenge25Routes');

// Public routes
router.use('/auth', authRoutes);

// Public receipt viewer (no auth required)
router.use('/receipt', receiptPublicRouter);

// Public subscription webhook (no auth required)
router.use('/subscriptions', subscriptionPublicRouter);

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
const { router: subscriptionRoutes } = require('./subscriptionRoutes');
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
router.use('/challenge25',      challenge25Routes);

const receiptRoutes          = require('./receiptRoutes');
const collectionOrderRoutes  = require('./collectionOrderRoutes');
const selfCheckoutRoutes     = require('./selfCheckoutRoutes');
const tapToPayRoutes         = require('./tapToPayRoutes');
const queueBustRoutes        = require('./queueBustRoutes');
const expiryRoutes           = require('./expiryRoutes');
const aiRoutes               = require('./aiRoutes');
const invoiceReaderRoutes    = require('./invoiceReaderRoutes');
const marketIntelRoutes      = require('./marketIntelRoutes');

router.use('/receipts',              receiptRoutes);
router.use('/collection-orders',     collectionOrderRoutes);
router.use('/pos/self-checkout',     selfCheckoutRoutes);
router.use('/payments/tap-to-pay',   tapToPayRoutes);
router.use('/pos/queue-bust',        queueBustRoutes);
router.use('/expiry',                expiryRoutes);
router.use('/ai',                    aiRoutes);
router.use('/invoice-reader',        invoiceReaderRoutes);
router.use('/market',                marketIntelRoutes);

module.exports = router;
