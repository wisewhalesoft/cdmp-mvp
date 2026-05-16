import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { ExecutionContext, ServiceUnavailableException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { FeatureFlagGuard } from '../feature-flag.guard';
import { ERROR_CODES } from '../../errors/error-codes';

function makeContext(): ExecutionContext {
  return {
    switchToHttp: () => ({
      getRequest: () => ({ method: 'POST', url: '/test' }),
    }),
    getHandler: () => ({}),
    getClass: () => ({}),
  } as any;
}

/**
 * FeatureFlagGuard（AD-E07 v3.0 / 決議 #2）
 *
 * 規則：
 *   - 端點未標 @RequireFeatureFlag() → allow
 *   - process.env[flagName] === 'true'（不分大小寫）→ allow
 *   - 其餘 → 503 FEATURE_NOT_ENABLED
 */
describe('FeatureFlagGuard', () => {
  let guard: FeatureFlagGuard;
  let reflector: Reflector;
  const TEST_FLAG = 'ENABLE_TEST_FLAG_FOR_GUARD_SPEC';
  const original = process.env[TEST_FLAG];

  beforeEach(() => {
    reflector = new Reflector();
    guard = new FeatureFlagGuard(reflector);
  });

  afterEach(() => {
    if (original === undefined) {
      delete process.env[TEST_FLAG];
    } else {
      process.env[TEST_FLAG] = original;
    }
  });

  it('endpoint 未標 @RequireFeatureFlag() → allow', () => {
    vi.spyOn(reflector, 'getAllAndOverride').mockReturnValue(undefined);
    expect(guard.canActivate(makeContext())).toBe(true);
  });

  it('flag === "true" → allow', () => {
    vi.spyOn(reflector, 'getAllAndOverride').mockReturnValue(TEST_FLAG);
    process.env[TEST_FLAG] = 'true';
    expect(guard.canActivate(makeContext())).toBe(true);
  });

  it('flag === "TRUE"（大小寫不敏感）→ allow', () => {
    vi.spyOn(reflector, 'getAllAndOverride').mockReturnValue(TEST_FLAG);
    process.env[TEST_FLAG] = 'TRUE';
    expect(guard.canActivate(makeContext())).toBe(true);
  });

  it('flag 未設定 → 503 FEATURE_NOT_ENABLED', () => {
    vi.spyOn(reflector, 'getAllAndOverride').mockReturnValue(TEST_FLAG);
    delete process.env[TEST_FLAG];
    expect(() => guard.canActivate(makeContext())).toThrow(ServiceUnavailableException);
    try {
      guard.canActivate(makeContext());
    } catch (e: any) {
      expect(e.response.error).toBe(ERROR_CODES.FEATURE_NOT_ENABLED);
    }
  });

  it('flag === "false" → 503 FEATURE_NOT_ENABLED', () => {
    vi.spyOn(reflector, 'getAllAndOverride').mockReturnValue(TEST_FLAG);
    process.env[TEST_FLAG] = 'false';
    expect(() => guard.canActivate(makeContext())).toThrow(ServiceUnavailableException);
  });

  it('flag === "0" → 503 FEATURE_NOT_ENABLED', () => {
    vi.spyOn(reflector, 'getAllAndOverride').mockReturnValue(TEST_FLAG);
    process.env[TEST_FLAG] = '0';
    expect(() => guard.canActivate(makeContext())).toThrow(ServiceUnavailableException);
  });
});
