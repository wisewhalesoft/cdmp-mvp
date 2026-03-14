import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { CryptoUtil } from './crypto.util';
import { randomBytes } from 'crypto';

describe('CryptoUtil', () => {
  const originalEnv = process.env.AES_ENCRYPTION_KEY;

  beforeAll(() => {
    // Set a valid 32-byte (64 hex chars) key for testing
    process.env.AES_ENCRYPTION_KEY = randomBytes(32).toString('hex');
  });

  afterAll(() => {
    if (originalEnv !== undefined) {
      process.env.AES_ENCRYPTION_KEY = originalEnv;
    } else {
      delete process.env.AES_ENCRYPTION_KEY;
    }
  });

  it('should encrypt plaintext to non-plaintext format', () => {
    const plaintext = 'MySecretP@ssw0rd';
    const encrypted = CryptoUtil.encrypt(plaintext);

    expect(encrypted).not.toBe(plaintext);
    expect(encrypted).toContain(':'); // iv:authTag:ciphertext format
    expect(encrypted.split(':')).toHaveLength(3);
  });

  it('should decrypt back to original plaintext', () => {
    const plaintext = 'AnotherS3cretPwd!';
    const encrypted = CryptoUtil.encrypt(plaintext);
    const decrypted = CryptoUtil.decrypt(encrypted);

    expect(decrypted).toBe(plaintext);
  });

  it('should produce different ciphertext for same plaintext (random IV)', () => {
    const plaintext = 'SamePlaintext';
    const encrypted1 = CryptoUtil.encrypt(plaintext);
    const encrypted2 = CryptoUtil.encrypt(plaintext);

    expect(encrypted1).not.toBe(encrypted2);

    // But both should decrypt to same value
    expect(CryptoUtil.decrypt(encrypted1)).toBe(plaintext);
    expect(CryptoUtil.decrypt(encrypted2)).toBe(plaintext);
  });

  it('should throw on invalid encrypted data format', () => {
    expect(() => CryptoUtil.decrypt('invalid-data')).toThrow();
  });

  it('should throw when AES_ENCRYPTION_KEY is not set', () => {
    const saved = process.env.AES_ENCRYPTION_KEY;
    delete process.env.AES_ENCRYPTION_KEY;

    expect(() => CryptoUtil.encrypt('test')).toThrow('AES_ENCRYPTION_KEY environment variable is not set');

    process.env.AES_ENCRYPTION_KEY = saved;
  });
});
