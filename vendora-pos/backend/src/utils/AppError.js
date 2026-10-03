class AppError extends Error {
  constructor(message, statusCode = 500, errorCode = 'INTERNAL_ERROR', details = null) {
    super(message);
    this.statusCode = statusCode;
    this.errorCode = errorCode;
    this.details = details;
    this.isOperational = true;
    Error.captureStackTrace(this, this.constructor);
  }
}

// Named error factory helpers
AppError.authInvalidCredentials = (msg = 'Invalid credentials') =>
  new AppError(msg, 401, 'AUTH_INVALID_CREDENTIALS');

AppError.authTokenExpired = () =>
  new AppError('Token expired', 401, 'AUTH_TOKEN_EXPIRED');

AppError.authRefreshInvalid = () =>
  new AppError('Invalid refresh token', 401, 'AUTH_REFRESH_INVALID');

AppError.auth2faRequired = () =>
  new AppError('2FA verification required', 403, 'AUTH_2FA_REQUIRED');

AppError.forbidden = (msg = 'Forbidden') =>
  new AppError(msg, 403, 'FORBIDDEN');

AppError.permissionDenied = (msg = 'Permission denied') =>
  new AppError(msg, 403, 'PERMISSION_DENIED');

AppError.limitExceeded = (msg = 'Daily limit exceeded') =>
  new AppError(msg, 403, 'LIMIT_EXCEEDED');

AppError.notFound = (resource = 'Resource') =>
  new AppError(`${resource} not found`, 404, 'NOT_FOUND');

AppError.validation = (msg = 'Validation error', details = null) =>
  new AppError(msg, 422, 'VALIDATION_ERROR', details);

// Alias with consistent naming used across routes
AppError.validationError = (msg = 'Validation error') =>
  new AppError(msg, 400, 'VALIDATION_ERROR');

AppError.unauthorized = (msg = 'Unauthorized') =>
  new AppError(msg, 401, 'UNAUTHORIZED');

AppError.barcodeNotFound = (barcode) =>
  new AppError(`Barcode ${barcode} not found`, 404, 'BARCODE_NOT_FOUND');

AppError.productInactive = () =>
  new AppError('Product is not active', 400, 'PRODUCT_INACTIVE');

AppError.insufficientStock = (name, available) =>
  new AppError(`Insufficient stock for ${name}. Available: ${available}`, 400, 'INSUFFICIENT_STOCK');

AppError.ageVerificationRequired = (productName) =>
  new AppError(`Age verification required for ${productName}`, 400, 'AGE_VERIFICATION_REQUIRED');

AppError.saleAlreadyVoided = () =>
  new AppError('Sale has already been voided', 400, 'SALE_ALREADY_VOIDED');

AppError.refundWindowExpired = () =>
  new AppError('Refund window has expired', 400, 'REFUND_WINDOW_EXPIRED');

AppError.pinVerificationFailed = () =>
  new AppError('PIN verification failed', 401, 'PIN_VERIFICATION_FAILED');

AppError.drawerAlreadyOpen = () =>
  new AppError('Cash drawer already has an open session', 400, 'DRAWER_ALREADY_OPEN');

AppError.drawerNotOpen = () =>
  new AppError('Cash drawer is not open', 400, 'DRAWER_NOT_OPEN');

AppError.handoverPending = () =>
  new AppError('A shift handover is already pending', 409, 'HANDOVER_PENDING');

AppError.giftCardNotFound = () =>
  new AppError('Gift card not found', 404, 'GIFT_CARD_NOT_FOUND');

AppError.giftCardDepleted = () =>
  new AppError('Gift card has no remaining balance', 400, 'GIFT_CARD_DEPLETED');

AppError.giftCardExpired = () =>
  new AppError('Gift card has expired', 400, 'GIFT_CARD_EXPIRED');

AppError.promoCodeInvalid = () =>
  new AppError('Promotion code is invalid or expired', 400, 'PROMO_CODE_INVALID');

AppError.promoLimitReached = () =>
  new AppError('Promotion usage limit has been reached', 400, 'PROMO_LIMIT_REACHED');

AppError.loyaltyInsufficient = (required, available) =>
  new AppError(`Insufficient loyalty points. Required: ${required}, Available: ${available}`, 400, 'LOYALTY_INSUFFICIENT');

AppError.subscriptionLimit = (msg = 'Subscription limit reached') =>
  new AppError(msg, 402, 'SUBSCRIPTION_LIMIT');

AppError.serverError = (msg = 'Internal server error') =>
  new AppError(msg, 500, 'INTERNAL_ERROR');

AppError.conflict = (msg = 'Conflict') =>
  new AppError(msg, 409, 'CONFLICT');

module.exports = AppError;
