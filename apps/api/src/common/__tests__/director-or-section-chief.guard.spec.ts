import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { DirectorOrSectionChiefGuard } from '../guards/director-or-section-chief.guard';
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
 * DirectorOrSectionChiefGuard：E07 全部 controller 一般入口
 * 通過條件 = role === 'admin' OR businessRole IN ('director', 'section_chief')
 * 失敗錯誤碼：403 E07_ROLE_NOT_ASSIGNED（明示需聯絡 admin 補設；非模糊 AUTH_FORBIDDEN）
 * 對應 spec：architecture-spec.md §E07 Guard 清單；error-handling.md L230
 */
describe('DirectorOrSectionChiefGuard', () => {
  let guard: DirectorOrSectionChiefGuard;
  let reflector: Reflector;

  beforeEach(() => {
    reflector = new Reflector();
    guard = new DirectorOrSectionChiefGuard(reflector);
    vi.spyOn(reflector, 'getAllAndOverride').mockReturnValue(true);
  });

  it('endpoint 未標 @RequireDirectorOrSectionChief() → allow', () => {
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

  it('user + businessRole === section_chief → allow', () => {
    const ctx = makeContext({ userId: 'u1', role: 'user', businessRole: 'section_chief' });
    expect(guard.canActivate(ctx)).toBe(true);
  });

  it('user + businessRole === null → deny 403 E07_ROLE_NOT_ASSIGNED（明示訊息）', () => {
    const ctx = makeContext({ userId: 'u1', role: 'user', businessRole: null });
    expect(() => guard.canActivate(ctx)).toThrow(ForbiddenException);
    try {
      guard.canActivate(ctx);
    } catch (e: any) {
      expect(e.response.error).toBe(ERROR_CODES.E07_ROLE_NOT_ASSIGNED);
      expect(e.response.message).toMatch(/業務角色|聯絡|管理員/);
    }
  });

  it('request.user missing → deny', () => {
    const ctx = makeContext(undefined);
    expect(() => guard.canActivate(ctx)).toThrow(ForbiddenException);
  });
});
