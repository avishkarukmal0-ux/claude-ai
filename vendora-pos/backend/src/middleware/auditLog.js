'use strict';

const SENSITIVE_ROUTES = ['/auth', '/cash', '/voids', '/discounts', '/accounting', '/margins', '/staff', '/loss-prevention'];

/**
 * Security audit log middleware.
 * Logs security-relevant requests as structured JSON on response finish.
 * Apply with: app.use('/api', auditLog)
 */
const auditLog = (req, res, next) => {
  const isSensitive = SENSITIVE_ROUTES.some(r => req.path.startsWith(r));
  if (!isSensitive) return next();

  const start = Date.now();

  res.on('finish', () => {
    // Omit GET health/read routes that aren't mutations
    if (req.method === 'GET' && res.statusCode === 200) return;

    const entry = {
      type:      'audit',
      method:    req.method,
      path:      req.path,
      status:    res.statusCode,
      duration:  Date.now() - start,
      userId:    req.user?._id,
      userRole:  req.user?.role,
      storeId:   req.user?.store || req.storeId,
      ip:        req.ip || req.headers['x-forwarded-for'],
      userAgent: req.headers['user-agent'],
      ts:        new Date().toISOString(),
    };

    // In production you'd ship this to a SIEM/log aggregator
    // For now, structured JSON to stdout so log collectors can pick it up
    console.info(JSON.stringify(entry));
  });

  next();
};

module.exports = auditLog;
