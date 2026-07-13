/**
 * F113 / AD-E02-5 — RBAC 沿用既有 RolesGuard（AC-16 / BR-10 / I-EMPNO-RBAC-UNCHANGED-01）。
 *
 * 覆蓋 F113-test.md GUARD（4）：本 Feature 不新增 Guard；驗證既有 class 級
 *   @UseGuards(AuthGuard, RolesGuard) + @Roles('admin') 對帶 employeeNo 之建立/編輯端點
 *   仍生效（非 admin → 403 AUTH_FORBIDDEN）。使用真實 RolesGuard + 真實 Reflector 讀取
 *   AccountsController 之真實 metadata。
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { ForbiddenException, ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { RolesGuard } from '@/common/guards/roles.guard';
import { AccountsController } from '../accounts.controller';
import { ERROR_CODES, ERROR_MESSAGES } from '@/common/errors/error-codes';

describe('F113 — GUARD（RolesGuard 沿用）', () => {
  let guard: RolesGuard;

  beforeEach(() => {
    guard = new RolesGuard(new Reflector());
  });

  function ctx(role: string | undefined, handler: (...args: any[]) => any): ExecutionContext {
    const request: any = {
      user: role ? { userId: 'u', role } : undefined,
      method: 'POST',
      url: '/api/v1/accounts',
    };
    return {
      switchToHttp: () => ({ getRequest: () => request }),
      getHandler: () => handler,
      getClass: () => AccountsController,
    } as unknown as ExecutionContext;
  }

  // TS-F113-GUARD-001
  it('GUARD-001: 非 Admin 呼叫 POST /accounts（帶 employeeNo）→ 403 AUTH_FORBIDDEN', () => {
    try {
      guard.canActivate(ctx('user', AccountsController.prototype.create));
      expect.fail('should have thrown');
    } catch (e: any) {
      expect(e).toBeInstanceOf(ForbiddenException);
      expect(e.response.error).toBe(ERROR_CODES.FORBIDDEN);
      expect(e.response.message).toBe(ERROR_MESSAGES.FORBIDDEN);
    }
  });

  // TS-F113-GUARD-002
  it('GUARD-002: 非 Admin 呼叫 PUT /accounts/:id（帶 employeeNo）→ 403 AUTH_FORBIDDEN', () => {
    try {
      guard.canActivate(ctx('user', AccountsController.prototype.update));
      expect.fail('should have thrown');
    } catch (e: any) {
      expect(e).toBeInstanceOf(ForbiddenException);
      expect(e.response.error).toBe(ERROR_CODES.FORBIDDEN);
    }
  });

  // TS-F113-GUARD-003
  it('GUARD-003: Admin 呼叫兩端點 → 通過 Guard（正向控制組）', () => {
    expect(guard.canActivate(ctx('admin', AccountsController.prototype.create))).toBe(true);
    expect(guard.canActivate(ctx('admin', AccountsController.prototype.update))).toBe(true);
  });

  // TS-F113-GUARD-004 regression：GET 清單既有 Guard 不變
  it('GUARD-004: GET /accounts 既有 Guard 行為不受影響（admin 通過、user 拒絕）', () => {
    expect(guard.canActivate(ctx('admin', AccountsController.prototype.findAll))).toBe(true);
    expect(() => guard.canActivate(ctx('user', AccountsController.prototype.findAll))).toThrow(
      ForbiddenException,
    );
  });
});
