'use strict';
const Product = require('../models/Product');
const AppError = require('../utils/AppError');
const lookup = async (barcode, storeId) => {
  const product = await Product.findOne({ store: storeId, barcode, isActive: true });
  if (!product) throw AppError.barcodeNotFound(barcode);
  return product;
};
module.exports = { lookup };
