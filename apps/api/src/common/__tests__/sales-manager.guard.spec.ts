import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { SalesManagerGuard } from '../guards/sales-manager.guard';
import { REQUIRE_SALES_MANAGER_KEY } from '../decorators/sales-manager.decorator';
import { ERROR_CODES } from '../errors/error-codes';

function makeContext(user: any): ExecutionContext {
  return {
    switchToHttp: () => ({
      getRequest: () => ({ user, method: 'POST', url: '/test' }),
    }),
    getHandler: () => ({}),
    getClass: () => ({}),
  } as any;
}

describe('SalesManagerGuard', () => {
  let guard: SalesManagerGuard;
  let reflector: Reflector;

  beforeEach(() => {
    reflector = new Reflector();
    guard = new SalesManagerGuard(reflector);
  });

  it('allows when @RequireSalesManager() not set on endpoint', () => {
    vi.spyOn(reflector, 'getAllAndOverride').mockReturnValue(false);
    const ctx = makeContext({ userId: 'u1', role: 'user', isSalesManager: false });
    expect(guard.canActivate(ctx)).toBe(true);
  });

  it('allows admin (admin 豁免 sales_manager 檢查)', () => {
    vi.spyOn(reflector, 'getAllAndOverride').mockReturnValue(true);
    const ctx = makeContext({ userId: 'u1', role: 'admin', isSalesManager: false });
    expect(guard.canActivate(ctx)).toBe(true);
  });

  it('allows user with isSalesManager=true', () => {
    vi.spyOn(reflector, 'getAllAndOverride').mockReturnValue(true);
    const ctx = makeContext({ userId: 'u1', role: 'user', isSalesManager: true });
    expect(guard.canActivate(ctx)).toBe(true);
  });

  it('denies user without isSalesManager flag', () => {
    vi.spyOn(reflector, 'getAllAndOverride').mockReturnValue(true);
    const ctx = makeContext({ userId: 'u1', role: 'user', isSalesManager: false });
    expect(() => guard.canActivate(ctx)).toThrow(ForbiddenException);
    try {
      guard.canActivate(ctx);
    } catch (e: any) {
      expect(e.response.error).toBe(ERROR_CODES.FORBIDDEN);
    }
  });

  it('denies when request.user is missing', () => {
    vi.spyOn(reflector, 'getAllAndOverride').mockReturnValue(true);
    const ctx = makeContext(undefined);
    expect(() => guard.canActivate(ctx)).toThrow(ForbiddenException);
  });
});
