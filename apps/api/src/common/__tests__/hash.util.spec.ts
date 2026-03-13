import { describe, it, expect } from 'vitest';
import { HashUtil } from '../hash/hash.util';

describe('HashUtil', () => {
  it('should generate a valid bcrypt hash', async () => {
    const password = 'P@ssw0rd123';
    const hash = await HashUtil.hash(password);

    expect(hash).toBeDefined();
    expect(hash).not.toBe(password);
    // bcrypt hashes start with $2a$ or $2b$
    expect(hash).toMatch(/^\$2[ab]\$/);
  });

  it('should compare password correctly against hash', async () => {
    const password = 'P@ssw0rd123';
    const hash = await HashUtil.hash(password);

    const isMatch = await HashUtil.compare(password, hash);
    expect(isMatch).toBe(true);

    const isWrong = await HashUtil.compare('wrongpassword', hash);
    expect(isWrong).toBe(false);
  });

  it('should use a cost factor >= 10', async () => {
    const password = 'P@ssw0rd123';
    const hash = await HashUtil.hash(password);

    // bcrypt format: $2b$<cost>$...
    const costStr = hash.split('$')[2];
    const cost = parseInt(costStr, 10);
    expect(cost).toBeGreaterThanOrEqual(10);
  });
});
