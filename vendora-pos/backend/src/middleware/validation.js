const AppError = require('../utils/AppError');

/**
 * Validate req.body against a Joi schema.
 * Returns 422 with validation details on failure.
 */
const validate = (schema, target = 'body') => (req, res, next) => {
  const { error, value } = schema.validate(req[target], {
    abortEarly: false,
    stripUnknown: true,
    convert: true,
  });

  if (error) {
    const details = error.details.map((d) => ({
      field: d.path.join('.'),
      message: d.message.replace(/['"]/g, ''),
    }));
    return next(AppError.validation('Validation failed', details));
  }

  req[target] = value;
  next();
};

module.exports = { validate };
