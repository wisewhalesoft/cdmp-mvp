import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { DirectorGuard } from '../guards/director.guard';
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

/**
 * DirectorGuard：通過條件 = role === 'admin' OR businessRole === 'director'
 * 失敗錯誤碼：403 E07_REQUIRES_DIRECTOR（F002 v2.0 §4.6.2 / error-handling.md v1.14 / 2026-05-16）
 * 對應 spec：architecture-spec.md §E07 Guard 清單；F002 v2.0 §4.6
 */
describe('DirectorGuard', () => {
  let guard: DirectorGuard;
  let reflector: Reflector;

  beforeEach(() => {
    reflector = new Reflector();
    guard = new DirectorGuard(reflector);
    // 預設端點有套 @RequireDirector()
    vi.spyOn(reflector, 'getAllAndOverride').mockReturnValue(true);
  });

  it('endpoint 未標 @RequireDirector() → allow', () => {
    vi.spyOn(reflector, 'getAllAndOverride').mockReturnValue(false);
    const ctx = makeContext({ userId: 'u1', role: 'user', businessRole: null });
    expect(guard.canActivate(ctx)).toBe(true);
  });

  it('admin → allow（無需 businessRole）', () => {
    const ctx = makeContext({ userId: 'u1', role: 'admin', businessRole: null });
    expect(guard.canActivate(ctx)).toBe(true);
  });

  it('user + businessRole === director → allow', () => {
    const ctx = makeContext({ userId: 'u1', role: 'user', businessRole: 'director' });
    expect(guard.canActivate(ctx)).toBe(true);
  });

  it('user + businessRole === section_chief → deny 403 E07_REQUIRES_DIRECTOR', () => {
    const ctx = makeContext({ userId: 'u1', role: 'user', businessRole: 'section_chief' });
    expect(() => guard.canActivate(ctx)).toThrow(ForbiddenException);
    try {
      guard.canActivate(ctx);
    } catch (e: any) {
      expect(e.response.error).toBe(ERROR_CODES.E07_REQUIRES_DIRECTOR);
    }
  });

  it('user + businessRole === null → deny', () => {
    const ctx = makeContext({ userId: 'u1', role: 'user', businessRole: null });
    expect(() => guard.canActivate(ctx)).toThrow(ForbiddenException);
  });

  it('request.user missing → deny', () => {
    const ctx = makeContext(undefined);
    expect(() => guard.canActivate(ctx)).toThrow(ForbiddenException);
  });
});
