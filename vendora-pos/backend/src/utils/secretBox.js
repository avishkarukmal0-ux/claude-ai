'use strict';

// Authenticated symmetric encryption for secrets we must store at rest (POS slice 4: provider OAuth/refresh
// tokens). AES-256-GCM with a per-message random IV and the built-in auth tag, so a tampered ciphertext fails
// to decrypt rather than returning garbage. The key comes ONLY from config (POS_TOKEN_KEY), never hard-coded,
// never logged, never sent to the client. If no key is configured, encryption is unavailable and callers must
// refuse to store a secret (we never persist a token in the clear).
const crypto = require('crypto');

const ALGO = 'aes-256-gcm';
const IV_LEN = 12;   // 96-bit nonce, the GCM standard
const TAG_LEN = 16;

class SecretBoxUnavailableError extends Error {
  constructor(msg = 'Secret encryption key not configured (POS_TOKEN_KEY)') {
    super(msg);
    this.name = 'SecretBoxUnavailableError';
    this.code = 'SECRET_BOX_UNAVAILABLE';
  }
}

/** Parse a 32-byte key from hex or base64. Returns a Buffer, or null if the input can't yield 32 bytes. */
function parseKey(raw) {
  if (!raw || typeof raw !== 'string') return null;
  const s = raw.trim();
  // hex (64 chars) first, then base64 / base64url
  if (/^[0-9a-fA-F]{64}$/.test(s)) return Buffer.from(s, 'hex');
  try {
    const b = Buffer.from(s, 'base64');
    if (b.length === 32) return b;
  } catch { /* fall through */ }
  return null;
}

/** True when a usable 32-byte key is configured — callers gate on this before offering to store a secret. */
function isAvailable(keyRaw) {
  return parseKey(keyRaw) != null;
}

/**
 * Encrypt a UTF-8 string. Output is a self-describing, versioned token `v1.<iv>.<tag>.<ct>` (base64url parts)
 * safe to store in a DB field. Throws SecretBoxUnavailableError if the key is missing/invalid — the caller
 * must treat that as "cannot connect / cannot store", never fall back to plaintext.
 */
function encrypt(plaintext, keyRaw) {
  const key = parseKey(keyRaw);
  if (!key) throw new SecretBoxUnavailableError();
  const iv = crypto.randomBytes(IV_LEN);
  const cipher = crypto.createCipheriv(ALGO, key, iv);
  const ct = Buffer.concat([cipher.update(String(plaintext), 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `v1.${iv.toString('base64url')}.${tag.toString('base64url')}.${ct.toString('base64url')}`;
}

/** Decrypt a token produced by encrypt(). Throws on a missing key, a malformed token, or a failed auth tag
 *  (tampering / wrong key) — never returns partial/garbage output. */
function decrypt(token, keyRaw) {
  const key = parseKey(keyRaw);
  if (!key) throw new SecretBoxUnavailableError();
  const parts = String(token || '').split('.');
  if (parts.length !== 4 || parts[0] !== 'v1') throw new Error('Malformed secret token');
  const iv = Buffer.from(parts[1], 'base64url');
  const tag = Buffer.from(parts[2], 'base64url');
  const ct = Buffer.from(parts[3], 'base64url');
  if (iv.length !== IV_LEN || tag.length !== TAG_LEN) throw new Error('Malformed secret token');
  const decipher = crypto.createDecipheriv(ALGO, key, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(ct), decipher.final()]).toString('utf8');
}

/** Generate a fresh 32-byte key as hex (for ops to set POS_TOKEN_KEY). Not used at runtime. */
function generateKeyHex() { return crypto.randomBytes(32).toString('hex'); }

module.exports = { encrypt, decrypt, isAvailable, generateKeyHex, SecretBoxUnavailableError };
