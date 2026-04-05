const Store = require('../models/Store');
const AppError = require('../utils/AppError');

/**
 * Loads the store document from MongoDB and attaches it to req.store.
 * Requires authenticate middleware to run first.
 */
const storeContext = async (req, res, next) => {
  try {
    if (!req.storeId) return next();

    const store = await Store.findById(req.storeId);
    if (!store) return next(AppError.notFound('Store'));

    req.store = store;
    next();
  } catch (err) {
    next(err);
  }
};

module.exports = storeContext;
