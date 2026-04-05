const AppError = require('../utils/AppError');

const roleHierarchy = { cashier: 1, supervisor: 2, manager: 3, owner: 4 };

/**
 * Require that the authenticated user has at least one of the given roles.
 */
const requireRole = (...roles) => (req, res, next) => {
  const user = req.user;
  if (!user) return next(AppError.forbidden());

  const userLevel = roleHierarchy[user.role] || 0;
  const requiredLevel = Math.min(...roles.map((r) => roleHierarchy[r] || 99));

  if (userLevel < requiredLevel) {
    return next(AppError.permissionDenied(`Requires role: ${roles.join(' or ')}`));
  }
  next();
};

/**
 * Require a specific permission flag on the user's permissions object.
 */
const requirePermission = (permission) => (req, res, next) => {
  const user = req.user;
  if (!user) return next(AppError.forbidden());

  // Owners and managers have all permissions
  if (user.role === 'owner' || user.role === 'manager') return next();

  if (!user.permissions || !user.permissions[permission]) {
    return next(AppError.permissionDenied(`Missing permission: ${permission}`));
  }
  next();
};

/**
 * Require user is either the target staff, or has manager+ role.
 */
const requireSelfOrManager = (getTargetId) => (req, res, next) => {
  const user = req.user;
  const targetId = getTargetId(req);
  if (user.role === 'manager' || user.role === 'owner') return next();
  if (user._id.toString() === targetId) return next();
  return next(AppError.permissionDenied('Can only access your own resource'));
};

module.exports = { requireRole, requirePermission, requireSelfOrManager, roleHierarchy };
