import { describe, it, expect, beforeEach, vi } from 'vitest';
import { UnauthorizedException, ExecutionContext } from '@nestjs/common';
import { AuthGuard } from '../guards/auth.guard';

describe('AuthGuard', () => {
  let guard: AuthGuard;
  let mockJwtService: Record<string, any>;

  function createMockContext(authHeader?: string): ExecutionContext {
    const request: any = {
      headers: authHeader !== undefined ? { authorization: authHeader } : {},
    };
    return {
      switchToHttp: () => ({
        getRequest: () => request,
      }),
    } as ExecutionContext;
  }

  beforeEach(() => {
    mockJwtService = {
      verify: vi.fn(),
    };
    guard = new AuthGuard(mockJwtService as any);
  });

  it('should inject request.user and return true for valid token', () => {
    mockJwtService.verify.mockReturnValue({
      userId: 'user-123',
      role: 'admin',
    });

    const context = createMockContext('Bearer valid-token');
    const result = guard.canActivate(context);

    expect(result).toBe(true);
    const request = context.switchToHttp().getRequest() as any;
    expect(request.user).toEqual({ userId: 'user-123', role: 'admin' });
    expect(mockJwtService.verify).toHaveBeenCalledWith('valid-token');
  });

  it('should throw 401 when no Authorization header', () => {
    const context = createMockContext();

    expect(() => guard.canActivate(context)).toThrow(UnauthorizedException);
  });

  it('should throw 401 when token is expired or invalid', () => {
    mockJwtService.verify.mockImplementation(() => {
      throw new Error('jwt expired');
    });

    const context = createMockContext('Bearer expired-token');

    expect(() => guard.canActivate(context)).toThrow(UnauthorizedException);
  });
});
