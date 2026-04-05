'use strict';

const CashDrawer = require('../models/CashDrawer');
const CashActivity = require('../models/CashActivity');
const ShiftHandover = require('../models/ShiftHandover');
const Staff = require('../models/Staff');
const AppError = require('../utils/AppError');
const { verifyPin } = require('./authService');

/**
 * Calculate total cash from UK denomination breakdown.
 */
function calcDenominationTotal(denominations) {
  if (!denominations) return 0;
  const { notes = {}, coins = {} } = denominations;
  return (
    (notes.fifty || 0) * 50 +
    (notes.twenty || 0) * 20 +
    (notes.ten || 0) * 10 +
    (notes.five || 0) * 5 +
    (coins.twoPound || 0) * 2 +
    (coins.onePound || 0) * 1 +
    (coins.fiftyP || 0) * 0.5 +
    (coins.twentyP || 0) * 0.2 +
    (coins.tenP || 0) * 0.1 +
    (coins.fiveP || 0) * 0.05 +
    (coins.twoP || 0) * 0.02 +
    (coins.oneP || 0) * 0.01
  );
}

async function recordCashSale(storeId, tillId, amount, saleId, receiptNumber, staffId, staffName, io) {
  const drawer = await CashDrawer.getDrawer(storeId, tillId);
  if (drawer.status !== 'open') throw AppError.drawerNotOpen();

  drawer.recordCashSale(amount);
  await drawer.save();

  const activity = await CashActivity.create({
    store: storeId,
    tillId,
    type: 'cash_sale',
    amount,
    balanceAfter: drawer.expectedAmount,
    staff: staffId,
    staffName,
    saleId,
    receiptNumber,
  });

  if (io) {
    io.to(`store:${storeId}`).emit('cash:updated', {
      tillId,
      expectedAmount: drawer.expectedAmount,
      sessionTotals: drawer.sessionTotals,
    });

    if (drawer.needsSafeDrop()) {
      io.to(`store:${storeId}`).emit('cash:alert', {
        tillId,
        type: 'safe_drop_required',
        expectedAmount: drawer.expectedAmount,
        excessCash: drawer.getExcessCash(),
      });
    }
  }

  return { drawer, activity };
}

async function recordRefund(storeId, tillId, amount, saleId, staffId, staffName) {
  const drawer = await CashDrawer.getDrawer(storeId, tillId);
  if (drawer.status !== 'open') throw AppError.drawerNotOpen();

  drawer.recordRefund(amount);
  await drawer.save();

  const activity = await CashActivity.create({
    store: storeId,
    tillId,
    type: 'cash_refund',
    amount,
    balanceAfter: drawer.expectedAmount,
    staff: staffId,
    staffName,
    saleId,
  });

  return { drawer, activity };
}

async function recordSafeDrop(storeId, tillId, amount, staffId, staffName, notes) {
  const drawer = await CashDrawer.getDrawer(storeId, tillId);
  if (drawer.status !== 'open') throw AppError.drawerNotOpen();

  drawer.recordSafeDrop(amount);
  await drawer.save();

  const activity = await CashActivity.create({
    store: storeId,
    tillId,
    type: 'safe_drop',
    amount,
    balanceAfter: drawer.expectedAmount,
    staff: staffId,
    staffName,
    notes,
  });

  return { drawer, activity };
}

async function recordPayout(storeId, tillId, amount, staffId, staffName, description) {
  const drawer = await CashDrawer.getDrawer(storeId, tillId);
  if (drawer.status !== 'open') throw AppError.drawerNotOpen();

  drawer.recordPayout(amount);
  await drawer.save();

  const activity = await CashActivity.create({
    store: storeId,
    tillId,
    type: 'payout',
    amount,
    balanceAfter: drawer.expectedAmount,
    staff: staffId,
    staffName,
    description,
  });

  return { drawer, activity };
}

async function openDay(storeId, tillId, openingFloat, staffId, staffName) {
  const drawer = await CashDrawer.getDrawer(storeId, tillId);
  if (drawer.status === 'open') throw AppError.drawerAlreadyOpen();

  drawer.startNewDay(openingFloat, staffId, staffName);
  await drawer.save();

  const activity = await CashActivity.create({
    store: storeId,
    tillId,
    type: 'opening_float',
    amount: openingFloat,
    balanceAfter: openingFloat,
    staff: staffId,
    staffName,
  });

  return { drawer, activity };
}

async function closeDay(storeId, tillId, declaredAmount, denominations, staffId, staffName) {
  const drawer = await CashDrawer.getDrawer(storeId, tillId);
  if (drawer.status !== 'open') throw AppError.drawerNotOpen();

  const expectedAmount = drawer.expectedAmount;
  const variance = declaredAmount - expectedAmount;

  drawer.status = 'closed';
  drawer.lastVerification = {
    verifiedAt: new Date(),
    verifiedBy: staffId,
    method: denominations ? 'full_count' : 'quick_confirm',
    declaredAmount,
    variance,
  };
  await drawer.save();

  const activity = await CashActivity.create({
    store: storeId,
    tillId,
    type: 'closing',
    amount: declaredAmount,
    balanceAfter: declaredAmount,
    staff: staffId,
    staffName,
    declaredAmount,
    expectedAmount,
    variance,
    denominations: denominations || undefined,
  });

  return { drawer, activity, variance };
}

async function quickConfirm(storeId, tillId, staffId, staffName) {
  const drawer = await CashDrawer.getDrawer(storeId, tillId);
  if (drawer.status !== 'open') throw AppError.drawerNotOpen();

  const expectedAmount = drawer.expectedAmount;

  drawer.lastVerification = {
    verifiedAt: new Date(),
    verifiedBy: staffId,
    method: 'quick_confirm',
    declaredAmount: expectedAmount,
    variance: 0,
  };
  await drawer.save();

  const activity = await CashActivity.create({
    store: storeId,
    tillId,
    type: 'quick_confirm',
    amount: expectedAmount,
    balanceAfter: expectedAmount,
    staff: staffId,
    staffName,
    declaredAmount: expectedAmount,
    expectedAmount,
    variance: 0,
  });

  return { drawer, activity };
}

async function fullCount(storeId, tillId, denominations, staffId, staffName) {
  const drawer = await CashDrawer.getDrawer(storeId, tillId);
  if (drawer.status !== 'open') throw AppError.drawerNotOpen();

  const declaredAmount = Math.round(calcDenominationTotal(denominations) * 100) / 100;
  const expectedAmount = drawer.expectedAmount;
  const variance = Math.round((declaredAmount - expectedAmount) * 100) / 100;

  drawer.lastVerification = {
    verifiedAt: new Date(),
    verifiedBy: staffId,
    method: 'full_count',
    declaredAmount,
    variance,
  };
  await drawer.save();

  const activity = await CashActivity.create({
    store: storeId,
    tillId,
    type: 'full_count',
    amount: declaredAmount,
    balanceAfter: declaredAmount,
    staff: staffId,
    staffName,
    declaredAmount,
    expectedAmount,
    variance,
    denominations,
  });

  return { drawer, activity, declaredAmount, variance };
}

async function getTodaySummary(storeId, tillId) {
  const drawer = await CashDrawer.getDrawer(storeId, tillId);
  const expectedAmount = drawer.expectedAmount;
  const variance = drawer.lastVerification
    ? drawer.lastVerification.variance
    : 0;

  return {
    sessionTotals: drawer.sessionTotals,
    expectedAmount,
    openingFloat: drawer.openingFloat,
    variance,
    status: drawer.status,
    lastVerification: drawer.lastVerification,
    dayStartedAt: drawer.dayStartedAt,
  };
}

async function getActivityLog(storeId, tillId, date) {
  const start = new Date(date);
  start.setHours(0, 0, 0, 0);
  const end = new Date(date);
  end.setHours(23, 59, 59, 999);

  return CashActivity.find({
    store: storeId,
    tillId,
    occurredAt: { $gte: start, $lte: end },
  })
    .sort({ occurredAt: 1 })
    .lean();
}

async function initiateHandover(storeId, tillId, outgoingStaffId, incomingStaffId, io) {
  // Check no pending handover for this till
  const existing = await ShiftHandover.findOne({
    store: storeId,
    tillId,
    status: { $in: ['pending', 'outgoing_confirmed'] },
  });
  if (existing) throw AppError.handoverPending();

  const [outgoing, incoming] = await Promise.all([
    Staff.findById(outgoingStaffId).select('displayName'),
    Staff.findById(incomingStaffId).select('displayName'),
  ]);

  const drawer = await CashDrawer.getDrawer(storeId, tillId);

  const handover = await ShiftHandover.create({
    store: storeId,
    tillId,
    outgoingStaff: outgoingStaffId,
    outgoingStaffName: outgoing ? outgoing.displayName : '',
    incomingStaff: incomingStaffId,
    incomingStaffName: incoming ? incoming.displayName : '',
    expectedAmount: drawer.expectedAmount,
    status: 'pending',
  });

  if (io) {
    io.to(`store:${storeId}`).emit('handover:initiated', {
      handoverId: handover._id,
      tillId,
      outgoingStaffName: handover.outgoingStaffName,
      incomingStaffName: handover.incomingStaffName,
    });
  }

  return handover;
}

async function confirmOutgoing(handoverId, pin) {
  const handover = await ShiftHandover.findById(handoverId);
  if (!handover) throw AppError.notFound('Handover');

  const result = await verifyPin(handover.store.toString(), pin);
  if (result.isDuress) throw AppError.pinVerificationFailed();

  const staffMatch = result.staff._id.toString() === handover.outgoingStaff.toString();
  if (!staffMatch) throw AppError.permissionDenied('PIN does not match outgoing staff');

  handover.status = 'outgoing_confirmed';
  handover.outgoingConfirmedAt = new Date();
  await handover.save();

  return handover;
}

async function confirmIncoming(handoverId, pin, io) {
  const handover = await ShiftHandover.findById(handoverId);
  if (!handover) throw AppError.notFound('Handover');

  const result = await verifyPin(handover.store.toString(), pin);
  if (result.isDuress) throw AppError.pinVerificationFailed();

  const staffMatch = result.staff._id.toString() === handover.incomingStaff.toString();
  if (!staffMatch) throw AppError.permissionDenied('PIN does not match incoming staff');

  handover.status = 'completed';
  handover.incomingConfirmedAt = new Date();
  handover.completedAt = new Date();
  await handover.save();

  // Update drawer current shift to incoming staff
  const drawer = await CashDrawer.getDrawer(handover.store.toString(), handover.tillId);
  drawer.currentShift = {
    staffId: handover.incomingStaff,
    staffName: handover.incomingStaffName,
    startedAt: new Date(),
    openingAmount: drawer.expectedAmount,
  };
  await drawer.save();

  await CashActivity.create({
    store: handover.store,
    tillId: handover.tillId,
    type: 'handover',
    amount: drawer.expectedAmount,
    balanceAfter: drawer.expectedAmount,
    staff: handover.incomingStaff,
    staffName: handover.incomingStaffName,
    handoverTo: handover.incomingStaff,
    description: `Handover from ${handover.outgoingStaffName} to ${handover.incomingStaffName}`,
  });

  if (io) {
    io.to(`store:${handover.store.toString()}`).emit('handover:completed', {
      handoverId: handover._id,
      tillId: handover.tillId,
      incomingStaffName: handover.incomingStaffName,
    });
  }

  return handover;
}

module.exports = {
  recordCashSale,
  recordRefund,
  recordSafeDrop,
  recordPayout,
  openDay,
  closeDay,
  quickConfirm,
  fullCount,
  getTodaySummary,
  getActivityLog,
  initiateHandover,
  confirmOutgoing,
  confirmIncoming,
};
