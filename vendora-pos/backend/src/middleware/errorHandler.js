const logger = require('../utils/logger');
const AppError = require('../utils/AppError');

const errorHandler = (err, req, res, next) => {
  let error = err;

  // Mongoose validation error
  if (err.name === 'ValidationError') {
    const details = Object.values(err.errors).map((e) => ({
      field: e.path,
      message: e.message,
    }));
    error = AppError.validation('Database validation failed', details);
  }

  // Mongoose duplicate key
  if (err.code === 11000) {
    const field = Object.keys(err.keyValue || {})[0] || 'field';
    error = new AppError(`Duplicate value for ${field}`, 409, 'DUPLICATE_KEY');
    error.isOperational = true;
  }

  // Mongoose CastError (invalid ObjectId)
  if (err.name === 'CastError') {
    error = AppError.notFound(err.path);
  }

  // JWT errors
  if (err.name === 'JsonWebTokenError') {
    error = AppError.authTokenExpired();
  }

  if (!error.isOperational) {
    logger.error('Unexpected error:', {
      message: err.message,
      stack: err.stack,
      url: req.url,
      method: req.method,
    });
  }

  const statusCode = error.statusCode || 500;
  const responseBody = {
    success: false,
    error: {
      code: error.errorCode || 'INTERNAL_ERROR',
      message: error.isOperational ? error.message : 'An unexpected error occurred',
      ...(error.details ? { details: error.details } : {}),
    },
  };

  res.status(statusCode).json(responseBody);
};

module.exports = errorHandler;
