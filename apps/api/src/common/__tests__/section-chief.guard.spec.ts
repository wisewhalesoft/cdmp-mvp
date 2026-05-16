import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { SectionChiefGuard } from '../guards/section-chief.guard';
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
 * SectionChiefGuard：通過條件 = role === 'admin' OR businessRole === 'section_chief'
 * （與 architecture-spec L469 對齊：admin 視為超集；spec 表格僅標 'section_chief' 條件，
 *  但全域規則 admin 一律放行，與其他 Guard 一致；F002 §4.6 規定 admin 自動繼承所有 E07 角色）
 * 失敗錯誤碼：403 E07_REQUIRES_SECTION_CHIEF（F002 v2.0 §4.6.2 / error-handling.md v1.14 / 2026-05-16）
 */
describe('SectionChiefGuard', () => {
  let guard: SectionChiefGuard;
  let reflector: Reflector;

  beforeEach(() => {
    reflector = new Reflector();
    guard = new SectionChiefGuard(reflector);
    vi.spyOn(reflector, 'getAllAndOverride').mockReturnValue(true);
  });

  it('endpoint 未標 @RequireSectionChief() → allow', () => {
    vi.spyOn(reflector, 'getAllAndOverride').mockReturnValue(false);
    const ctx = makeContext({ userId: 'u1', role: 'user', businessRole: null });
    expect(guard.canActivate(ctx)).toBe(true);
  });

  it('admin → allow', () => {
    const ctx = makeContext({ userId: 'u1', role: 'admin', businessRole: null });
    expect(guard.canActivate(ctx)).toBe(true);
  });

  it('user + businessRole === section_chief → allow', () => {
    const ctx = makeContext({ userId: 'u1', role: 'user', businessRole: 'section_chief' });
    expect(guard.canActivate(ctx)).toBe(true);
  });

  it('user + businessRole === director → deny 403 E07_REQUIRES_SECTION_CHIEF', () => {
    const ctx = makeContext({ userId: 'u1', role: 'user', businessRole: 'director' });
    expect(() => guard.canActivate(ctx)).toThrow(ForbiddenException);
    try {
      guard.canActivate(ctx);
    } catch (e: any) {
      expect(e.response.error).toBe(ERROR_CODES.E07_REQUIRES_SECTION_CHIEF);
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
