'use strict';

// Known insecure fallback/placeholder secrets that must never be used in production.
const WEAK_SECRETS = ['vendora-dev-secret-fallback', 'vendora-refresh-secret-fallback', 'change-me', 'secret'];

/** A secret is insecure if it's missing, too short, or matches a known placeholder. */
function isInsecure(s) {
  if (!s || typeof s !== 'string' || s.length < 32) return true;
  return WEAK_SECRETS.some((w) => s.includes(w));
}

/**
 * Assess JWT secrets. In production, insecure secrets are FATAL (the app must refuse to start
 * rather than issue forgeable tokens). Outside production, they're a warning so local/test
 * work is explicit and unblocked. Never returns or logs the secret values themselves.
 * @returns { ok, problems: string[], fatal }
 */
function checkSecrets({ jwtSecret, jwtRefreshSecret, isProd }) {
  const problems = [];
  if (isInsecure(jwtSecret)) problems.push('JWT_SECRET');
  if (isInsecure(jwtRefreshSecret)) problems.push('JWT_REFRESH_SECRET');
  return { ok: problems.length === 0, problems, fatal: !!isProd && problems.length > 0 };
}

module.exports = { checkSecrets, isInsecure, WEAK_SECRETS };
