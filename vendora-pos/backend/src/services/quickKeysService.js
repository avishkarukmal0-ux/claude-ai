'use strict';

const QuickKey = require('../models/QuickKey');
const QuickKeyLayout = require('../models/QuickKeyLayout');
const AppError = require('../utils/AppError');

async function getLayouts(storeId) {
  return QuickKeyLayout.find({ store: storeId }).sort({ isDefault: -1, createdAt: 1 });
}

async function createLayout(storeId, name, staffId) {
  const existingCount = await QuickKeyLayout.countDocuments({ store: storeId });
  return QuickKeyLayout.create({
    store: storeId,
    name,
    isDefault: existingCount === 0,
    createdBy: staffId,
  });
}

async function getKeys(storeId, layoutId) {
  const query = { store: storeId };
  if (layoutId) {
    query.layout = layoutId;
  } else {
    const defaultLayout = await QuickKeyLayout.findOne({ store: storeId, isDefault: true });
    if (defaultLayout) query.layout = defaultLayout._id;
  }
  return QuickKey.find({ ...query, disabled: false }).populate('product').sort({ position: 1 });
}

async function createKey(storeId, layoutId, keyData) {
  return QuickKey.create({ store: storeId, layout: layoutId, ...keyData });
}

async function updateKey(keyId, updates) {
  const key = await QuickKey.findByIdAndUpdate(keyId, updates, { new: true });
  if (!key) throw AppError.notFound('Quick key');
  return key;
}

async function deleteKey(keyId) {
  const key = await QuickKey.findByIdAndDelete(keyId);
  if (!key) throw AppError.notFound('Quick key');
  return key;
}

async function reorder(storeId, keyIds) {
  const ops = keyIds.map((id, idx) =>
    QuickKey.findOneAndUpdate({ _id: id, store: storeId }, { position: idx })
  );
  await Promise.all(ops);
}

async function updateLayout(layoutId, updates) {
  const layout = await QuickKeyLayout.findByIdAndUpdate(layoutId, updates, { new: true });
  if (!layout) throw AppError.notFound('Layout');
  return layout;
}

async function deleteLayout(layoutId) {
  await QuickKey.deleteMany({ layout: layoutId });
  const layout = await QuickKeyLayout.findByIdAndDelete(layoutId);
  if (!layout) throw AppError.notFound('Layout');
  return layout;
}

module.exports = { getLayouts, createLayout, getKeys, createKey, updateKey, deleteKey, reorder, updateLayout, deleteLayout };
