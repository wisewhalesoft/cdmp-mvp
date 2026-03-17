import { describe, it, expect } from 'vitest';
import { formatDateTW, formatTimeTW } from '../date-utils';

describe('date-utils', () => {
  describe('formatDateTW', () => {
    it('should convert UTC midnight to UTC+8 (same day)', () => {
      // UTC 00:00 -> UTC+8 08:00
      expect(formatDateTW('2026-01-15T00:00:00.000Z')).toBe('2026-01-15 08:00');
    });

    it('should convert UTC afternoon to UTC+8 (cross-day)', () => {
      // UTC 16:00 -> UTC+8 00:00 next day
      expect(formatDateTW('2026-01-15T16:00:00.000Z')).toBe('2026-01-16 00:00');
    });

    it('should convert standard UTC time to UTC+8', () => {
      // UTC 14:30 -> UTC+8 22:30
      expect(formatDateTW('2026-01-15T14:30:00.000Z')).toBe('2026-01-15 22:30');
    });

    it('should handle ISO format without milliseconds', () => {
      // UTC 14:30 -> UTC+8 22:30
      expect(formatDateTW('2026-01-15T14:30:00Z')).toBe('2026-01-15 22:30');
    });

    it('should handle UTC time near end of day', () => {
      // UTC 23:59 -> UTC+8 07:59 next day
      expect(formatDateTW('2026-01-15T23:59:00.000Z')).toBe('2026-01-16 07:59');
    });

    it('should handle month boundary crossing', () => {
      // UTC 2026-01-31 18:00 -> UTC+8 2026-02-01 02:00
      expect(formatDateTW('2026-01-31T18:00:00.000Z')).toBe('2026-02-01 02:00');
    });
  });

  describe('formatTimeTW', () => {
    it('should return only HH:mm in UTC+8', () => {
      // UTC 14:30 -> UTC+8 22:30
      expect(formatTimeTW('2026-01-15T14:30:00Z')).toBe('22:30');
    });

    it('should handle cross-day conversion', () => {
      // UTC 16:00 -> UTC+8 00:00
      expect(formatTimeTW('2026-01-15T16:00:00Z')).toBe('00:00');
    });

    it('should handle UTC midnight', () => {
      // UTC 00:00 -> UTC+8 08:00
      expect(formatTimeTW('2026-01-15T00:00:00.000Z')).toBe('08:00');
    });
  });
});
