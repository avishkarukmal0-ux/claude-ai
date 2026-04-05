'use strict';

const TrainingSession = require('../models/TrainingSession');
const AppError = require('../utils/AppError');

async function start(storeId, staffId, staffName, tillId) {
  const existing = await TrainingSession.findOne({ store: storeId, tillId, status: 'active' });
  if (existing) return existing;

  return TrainingSession.create({
    store: storeId,
    staff: staffId,
    staffName,
    tillId,
    status: 'active',
    startedAt: new Date(),
  });
}

async function end(tillId, storeId) {
  const session = await TrainingSession.findOneAndUpdate(
    { store: storeId, tillId, status: 'active' },
    { status: 'ended', endedAt: new Date() },
    { new: true }
  );
  return session;
}

async function getActive(tillId, storeId) {
  return TrainingSession.findOne({ store: storeId, tillId, status: 'active' });
}

async function isTraining(tillId, storeId) {
  const session = await getActive(tillId, storeId);
  return !!session;
}

async function recordSale(tillId, storeId, saleTotal) {
  await TrainingSession.findOneAndUpdate(
    { store: storeId, tillId, status: 'active' },
    { $inc: { transactionCount: 1, totalValue: saleTotal } }
  );
}

module.exports = { start, end, getActive, isTraining, recordSale };
