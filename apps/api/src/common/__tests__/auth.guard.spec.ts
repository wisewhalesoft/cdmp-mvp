import { describe, it, expect, beforeEach, vi } from 'vitest';
import { UnauthorizedException, ExecutionContext } from '@nestjs/common';
import { AuthGuard } from '../guards/auth.guard';
import { ERROR_CODES } from '../errors/error-codes';

describe('AuthGuard', () => {
  let guard: AuthGuard;
  let mockJwtService: Record<string, any>;
  let mockTokenBlocklistRepository: Record<string, any>;
  let mockUserRepository: Record<string, any>;

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
    mockTokenBlocklistRepository = {
      findOne: vi.fn().mockResolvedValue(null),
    };
    mockUserRepository = {
      findOne: vi.fn().mockResolvedValue({ id: 'user-123', status: 'active' }),
    };
    guard = new AuthGuard(
      mockJwtService as any,
      mockTokenBlocklistRepository as any,
      mockUserRepository as any,
    );
  });

  it('should inject request.user and return true for valid token', async () => {
    mockJwtService.verify.mockReturnValue({
      userId: 'user-123',
      role: 'admin',
    });

    const context = createMockContext('Bearer valid-token');
    const result = await guard.canActivate(context);

    expect(result).toBe(true);
    const request = context.switchToHttp().getRequest() as any;
    expect(request.user).toEqual({ userId: 'user-123', role: 'admin', isSalesManager: false });
    expect(mockJwtService.verify).toHaveBeenCalledWith('valid-token');
  });

  it('should throw AUTH_TOKEN_MISSING when no Authorization header', async () => {
    const context = createMockContext();

    try {
      await guard.canActivate(context);
      expect.fail('should have thrown');
    } catch (error: any) {
      expect(error).toBeInstanceOf(UnauthorizedException);
      expect(error.response.error).toBe(ERROR_CODES.TOKEN_MISSING);
    }
  });

  it('should throw AUTH_TOKEN_EXPIRED when token is expired', async () => {
    const expiredError = new Error('jwt expired');
    (expiredError as any).name = 'TokenExpiredError';
    mockJwtService.verify.mockImplementation(() => {
      throw expiredError;
    });

    const context = createMockContext('Bearer expired-token');

    try {
      await guard.canActivate(context);
      expect.fail('should have thrown');
    } catch (error: any) {
      expect(error).toBeInstanceOf(UnauthorizedException);
      expect(error.response.error).toBe(ERROR_CODES.TOKEN_EXPIRED);
    }
  });

  it('should throw AUTH_UNAUTHORIZED when token is invalid', async () => {
    mockJwtService.verify.mockImplementation(() => {
      throw new Error('invalid signature');
    });

    const context = createMockContext('Bearer invalid-token');

    try {
      await guard.canActivate(context);
      expect.fail('should have thrown');
    } catch (error: any) {
      expect(error).toBeInstanceOf(UnauthorizedException);
      expect(error.response.error).toBe('AUTH_UNAUTHORIZED');
    }
  });

  it('should throw AUTH_TOKEN_REVOKED when user account is disabled', async () => {
    mockJwtService.verify.mockReturnValue({
      userId: 'user-123',
      role: 'admin',
    });
    mockUserRepository.findOne.mockResolvedValue({ id: 'user-123', status: 'disabled' });

    const context = createMockContext('Bearer valid-token');

    try {
      await guard.canActivate(context);
      expect.fail('should have thrown');
    } catch (error: any) {
      expect(error).toBeInstanceOf(UnauthorizedException);
      expect(error.response.error).toBe(ERROR_CODES.TOKEN_REVOKED);
    }
  });

  it('should throw AUTH_TOKEN_REVOKED when user not found in DB', async () => {
    mockJwtService.verify.mockReturnValue({
      userId: 'user-123',
      role: 'admin',
    });
    mockUserRepository.findOne.mockResolvedValue(null);

    const context = createMockContext('Bearer valid-token');

    try {
      await guard.canActivate(context);
      expect.fail('should have thrown');
    } catch (error: any) {
      expect(error).toBeInstanceOf(UnauthorizedException);
      expect(error.response.error).toBe(ERROR_CODES.TOKEN_REVOKED);
    }
  });

  it('should throw AUTH_TOKEN_REVOKED when token is in blocklist', async () => {
    mockJwtService.verify.mockReturnValue({
      userId: 'user-123',
      role: 'admin',
    });
    mockTokenBlocklistRepository.findOne.mockResolvedValue({
      token: 'revoked-token',
    });

    const context = createMockContext('Bearer revoked-token');

    try {
      await guard.canActivate(context);
      expect.fail('should have thrown');
    } catch (error: any) {
      expect(error).toBeInstanceOf(UnauthorizedException);
      expect(error.response.error).toBe(ERROR_CODES.TOKEN_REVOKED);
    }
  });
});
