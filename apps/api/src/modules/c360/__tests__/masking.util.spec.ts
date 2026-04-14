import { describe, it, expect } from 'vitest';
import { maskIdNumber, maskPhone, maskEmail } from '../masking.util';

describe('masking utility', () => {
  describe('maskIdNumber', () => {
    it('should mask A123456789 preserving original length', () => {
      // 10 chars: first 3 (A12) + 5 stars + last 2 (89) = 10
      expect(maskIdNumber('A123456789')).toBe('A12*****89');
    });

    it('should return null for null input', () => {
      expect(maskIdNumber(null)).toBeNull();
    });

    it('should handle short strings gracefully', () => {
      // 5 chars or less: keep first 3 + last 2 may overlap, just return as-is
      expect(maskIdNumber('AB')).toBe('AB');
      expect(maskIdNumber('ABCDE')).toBe('ABCDE');
    });

    it('should mask 12345678 to 123***78', () => {
      expect(maskIdNumber('12345678')).toBe('123***78');
    });
  });

  describe('maskPhone', () => {
    it('should mask 0912345678 to 0912****78 (fill to original length)', () => {
      expect(maskPhone('0912345678')).toBe('0912****78');
    });

    it('should return null for null input', () => {
      expect(maskPhone(null)).toBeNull();
    });

    it('should mask 02-23456789 to 02-2*****89 (fill to original length)', () => {
      expect(maskPhone('02-23456789')).toBe('02-2*****89');
    });

    it('should handle short strings gracefully', () => {
      expect(maskPhone('0912')).toBe('0912');
      expect(maskPhone('091234')).toBe('091234');
    });
  });

  describe('maskEmail', () => {
    it('should mask wang@example.com to wa****@example.com', () => {
      expect(maskEmail('wang@example.com')).toBe('wa****@example.com');
    });

    it('should return null for null input', () => {
      expect(maskEmail(null)).toBeNull();
    });

    it('should mask a@test.com to a****@test.com (local part <= 2)', () => {
      // Only 1 char before @, keep it and add ****
      expect(maskEmail('a@test.com')).toBe('a****@test.com');
    });

    it('should mask ab@test.com to ab****@test.com (local part = 2)', () => {
      expect(maskEmail('ab@test.com')).toBe('ab****@test.com');
    });

    it('should handle email without @ gracefully', () => {
      expect(maskEmail('noemail')).toBe('no****');
    });
  });
});
