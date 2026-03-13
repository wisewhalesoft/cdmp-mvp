import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ForbiddenException, ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { RolesGuard } from '../guards/roles.guard';
import { ERROR_CODES, ERROR_MESSAGES } from '../errors/error-codes';

describe('RolesGuard', () => {
  let guard: RolesGuard;
  let reflector: Reflector;

  function createMockContext(userRole?: string): ExecutionContext {
    const request: any = {
      user: userRole ? { userId: 'test-user', role: userRole } : undefined,
      method: 'GET',
      url: '/api/v1/accounts',
    };
    return {
      switchToHttp: () => ({
        getRequest: () => request,
      }),
      getHandler: () => ({}),
      getClass: () => ({}),
    } as unknown as ExecutionContext;
  }

  beforeEach(() => {
    reflector = new Reflector();
    guard = new RolesGuard(reflector);
  });

  it('should allow admin to access @Roles("admin") endpoint', () => {
    vi.spyOn(reflector, 'getAllAndOverride').mockReturnValue(['admin']);

    const context = createMockContext('admin');
    expect(guard.canActivate(context)).toBe(true);
  });

  it('should deny user from accessing @Roles("admin") endpoint with 403', () => {
    vi.spyOn(reflector, 'getAllAndOverride').mockReturnValue(['admin']);

    const context = createMockContext('user');

    try {
      guard.canActivate(context);
      expect.fail('should have thrown');
    } catch (error: any) {
      expect(error).toBeInstanceOf(ForbiddenException);
      expect(error.response.error).toBe(ERROR_CODES.FORBIDDEN);
      expect(error.response.message).toBe(ERROR_MESSAGES.FORBIDDEN);
    }
  });

  it('should allow access when no @Roles decorator is present', () => {
    vi.spyOn(reflector, 'getAllAndOverride').mockReturnValue(undefined);

    const context = createMockContext('user');
    expect(guard.canActivate(context)).toBe(true);
  });
});
