'use strict';

const ParkedTransaction = require('../models/ParkedTransaction');
const { generateParkId } = require('../utils/helpers');
const AppError = require('../utils/AppError');

async function park(storeId, tillId, staffId, staffName, items, total, subtotal, customerId, customerName, reason, customerIdentifier) {
  const parkId = generateParkId();
  const itemCount = items.reduce((s, i) => s + i.quantity, 0);

  return ParkedTransaction.create({
    store: storeId,
    parkId,
    parkedBy: staffId,
    parkedByName: staffName,
    tillId,
    items,
    subtotal,
    total,
    itemCount,
    customer: customerId || undefined,
    customerName: customerName || undefined,
    reason: reason || 'other',
    customerIdentifier,
    status: 'parked',
  });
}

async function resume(parkId, storeId) {
  const tx = await ParkedTransaction.findOne({ parkId, store: storeId, status: 'parked' });
  if (!tx) throw AppError.notFound('Parked transaction');
  if (tx.expiresAt < new Date()) {
    tx.status = 'expired';
    await tx.save();
    throw new AppError('Parked transaction has expired', 400, 'PARKED_EXPIRED');
  }
  tx.status = 'resumed';
  tx.resumedAt = new Date();
  await tx.save();
  return tx;
}

async function voidParked(parkId, staffId) {
  const tx = await ParkedTransaction.findOneAndUpdate(
    { parkId, status: 'parked' },
    { status: 'voided' },
    { new: true }
  );
  if (!tx) throw AppError.notFound('Parked transaction');
  return tx;
}

async function list(storeId, tillId) {
  const query = { store: storeId, status: 'parked', expiresAt: { $gt: new Date() } };
  if (tillId) query.tillId = tillId;
  return ParkedTransaction.find(query).sort({ createdAt: -1 });
}

async function listAll(storeId) {
  return ParkedTransaction.find({ store: storeId, status: 'parked', expiresAt: { $gt: new Date() } })
    .sort({ createdAt: -1 });
}

async function getById(parkId, storeId) {
  const tx = await ParkedTransaction.findOne({ parkId, store: storeId });
  if (!tx) throw AppError.notFound('Parked transaction');
  return tx;
}

async function expireOld() {
  const result = await ParkedTransaction.updateMany(
    { status: 'parked', expiresAt: { $lt: new Date() } },
    { status: 'expired' }
  );
  return result.modifiedCount;
}

async function getSummary(storeId) {
  const active = await ParkedTransaction.find({ store: storeId, status: 'parked', expiresAt: { $gt: new Date() } });
  const byTill = {};
  const byReason = {};
  for (const tx of active) {
    if (!byTill[tx.tillId]) byTill[tx.tillId] = { count: 0, value: 0 };
    byTill[tx.tillId].count++;
    byTill[tx.tillId].value += tx.total || 0;
    if (!byReason[tx.reason]) byReason[tx.reason] = 0;
    byReason[tx.reason]++;
  }
  return { total: active.length, value: active.reduce((s, t) => s + (t.total || 0), 0), byTill, byReason };
}

module.exports = { park, resume, voidParked, list, listAll, getById, expireOld, getSummary };
