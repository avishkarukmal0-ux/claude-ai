'use strict';

const secretBox = require('../utils/secretBox');

const KEY_HEX = 'a'.repeat(64);                 // 32 bytes in hex
const KEY_B64 = Buffer.alloc(32, 7).toString('base64'); // 32 bytes in base64

describe('secretBox — authenticated secret encryption', () => {
  test('round-trips a secret with a hex key', () => {
    const token = secretBox.encrypt('refresh-token-123', KEY_HEX);
    expect(token.startsWith('v1.')).toBe(true);
    expect(token).not.toContain('refresh-token-123'); // ciphertext, not plaintext
    expect(secretBox.decrypt(token, KEY_HEX)).toBe('refresh-token-123');
  });

  test('round-trips with a base64 key too', () => {
    const token = secretBox.encrypt('abc', KEY_B64);
    expect(secretBox.decrypt(token, KEY_B64)).toBe('abc');
  });

  test('each encryption uses a fresh IV (ciphertexts differ)', () => {
    expect(secretBox.encrypt('same', KEY_HEX)).not.toBe(secretBox.encrypt('same', KEY_HEX));
  });

  test('a tampered ciphertext fails the auth tag (never returns garbage)', () => {
    const token = secretBox.encrypt('sensitive', KEY_HEX);
    const parts = token.split('.');
    const ct = Buffer.from(parts[3], 'base64url');
    ct[0] ^= 0xff; // flip a bit
    const tampered = `${parts[0]}.${parts[1]}.${parts[2]}.${ct.toString('base64url')}`;
    expect(() => secretBox.decrypt(tampered, KEY_HEX)).toThrow();
  });

  test('a wrong key cannot decrypt', () => {
    const token = secretBox.encrypt('x', KEY_HEX);
    expect(() => secretBox.decrypt(token, 'b'.repeat(64))).toThrow();
  });

  test('missing/invalid key → unavailable (callers must refuse to store plaintext)', () => {
    expect(secretBox.isAvailable('')).toBe(false);
    expect(secretBox.isAvailable('too-short')).toBe(false);
    expect(secretBox.isAvailable(KEY_HEX)).toBe(true);
    expect(() => secretBox.encrypt('x', '')).toThrow(secretBox.SecretBoxUnavailableError);
  });

  test('malformed tokens are rejected', () => {
    expect(() => secretBox.decrypt('not-a-token', KEY_HEX)).toThrow();
    expect(() => secretBox.decrypt('v2.a.b.c', KEY_HEX)).toThrow();
  });

  test('generateKeyHex produces a usable 32-byte key', () => {
    const k = secretBox.generateKeyHex();
    expect(k).toHaveLength(64);
    expect(secretBox.isAvailable(k)).toBe(true);
  });
});
