import { describe, it, expect, beforeEach, vi } from 'vitest';
import { Test } from '@nestjs/testing';
import { UnauthorizedException, ForbiddenException } from '@nestjs/common';
import { getRepositoryToken } from '@nestjs/typeorm';
import { AuthService } from '../auth.service';
import { User } from '@/database/entities/user.entity';
import { TokenBlocklist } from '@/database/entities/token-blocklist.entity';
import { HashUtil } from '@/common/hash/hash.util';
import { JwtUtil } from '@/common/jwt/jwt.util';
import { JwtService } from '@nestjs/jwt';
import { ERROR_CODES, ERROR_MESSAGES } from '@/common/errors/error-codes';
import {
  ADMIN_ACTIVE,
  ADMIN_DISABLED,
  USER_ACTIVE,
  USER_DISABLED,
} from '../../../../test/seeds/test-data';

describe('AuthService', () => {
  let authService: AuthService;
  let mockUserRepository: Record<string, any>;
  let mockTokenBlocklistRepository: Record<string, any>;
  let mockJwtUtil: Record<string, any>;
  let mockJwtService: Record<string, any>;

  // Pre-hashed password for test seeds
  let hashedPassword: string;

  beforeEach(async () => {
    hashedPassword = await HashUtil.hash(ADMIN_ACTIVE.password);

    mockUserRepository = {
      findOne: vi.fn(),
    };

    mockTokenBlocklistRepository = {
      findOne: vi.fn(),
      save: vi.fn(),
      create: vi.fn((data: any) => data),
    };

    mockJwtUtil = {
      generateToken: vi.fn().mockReturnValue('mock-jwt-token'),
    };

    mockJwtService = {
      decode: vi.fn().mockReturnValue({ exp: Math.floor(Date.now() / 1000) + 3600 }),
    };

    const module = await Test.createTestingModule({
      providers: [
        AuthService,
        {
          provide: getRepositoryToken(User),
          useValue: mockUserRepository,
        },
        {
          provide: getRepositoryToken(TokenBlocklist),
          useValue: mockTokenBlocklistRepository,
        },
        {
          provide: JwtUtil,
          useValue: mockJwtUtil,
        },
        {
          provide: JwtService,
          useValue: mockJwtService,
        },
      ],
    }).compile();

    authService = module.get<AuthService>(AuthService);
  });

  // TS-F001-001: Admin 正確憑證 → 回傳 { token, user }
  it('should return token and user info for valid admin credentials', async () => {
    mockUserRepository.findOne.mockResolvedValue({
      ...ADMIN_ACTIVE,
      password_hash: hashedPassword,
    });

    const result = await authService.login({
      email: ADMIN_ACTIVE.email,
      password: ADMIN_ACTIVE.password,
    });

    expect(result).toHaveProperty('token');
    expect(result).toHaveProperty('user');
    expect(result.user.id).toBe(ADMIN_ACTIVE.id);
    expect(result.user.email).toBe(ADMIN_ACTIVE.email);
    expect(result.user.name).toBe(ADMIN_ACTIVE.name);
    expect(result.user.role).toBe('admin');
    expect(result.token).toBe('mock-jwt-token');

    // Verify JWT was generated with correct payload
    expect(mockJwtUtil.generateToken).toHaveBeenCalledWith({
      userId: ADMIN_ACTIVE.id,
      role: 'admin',
      rememberMe: false,
    });
  });

  // TS-F001-002: rememberMe=true → JWT exp = 30 天
  it('should pass rememberMe=true to JWT generation', async () => {
    mockUserRepository.findOne.mockResolvedValue({
      ...ADMIN_ACTIVE,
      password_hash: hashedPassword,
    });

    await authService.login({
      email: ADMIN_ACTIVE.email,
      password: ADMIN_ACTIVE.password,
      rememberMe: true,
    });

    expect(mockJwtUtil.generateToken).toHaveBeenCalledWith({
      userId: ADMIN_ACTIVE.id,
      role: 'admin',
      rememberMe: true,
    });
  });

  // TS-F001-003: rememberMe=false → JWT exp = 8 小時
  it('should pass rememberMe=false to JWT generation by default', async () => {
    mockUserRepository.findOne.mockResolvedValue({
      ...ADMIN_ACTIVE,
      password_hash: hashedPassword,
    });

    await authService.login({
      email: ADMIN_ACTIVE.email,
      password: ADMIN_ACTIVE.password,
    });

    expect(mockJwtUtil.generateToken).toHaveBeenCalledWith({
      userId: ADMIN_ACTIVE.id,
      role: 'admin',
      rememberMe: false,
    });
  });

  // TS-F001-004: 錯誤密碼 → UnauthorizedException
  it('should throw UnauthorizedException for wrong password', async () => {
    mockUserRepository.findOne.mockResolvedValue({
      ...ADMIN_ACTIVE,
      password_hash: hashedPassword,
    });

    await expect(
      authService.login({
        email: ADMIN_ACTIVE.email,
        password: 'WrongPassword123',
      }),
    ).rejects.toThrow(UnauthorizedException);

    try {
      await authService.login({
        email: ADMIN_ACTIVE.email,
        password: 'WrongPassword123',
      });
    } catch (error: any) {
      expect(error.response.error).toBe(ERROR_CODES.INVALID_CREDENTIALS);
      expect(error.response.message).toBe(ERROR_MESSAGES.INVALID_CREDENTIALS);
    }
  });

  // TS-F001-005: 不存在 Email → UnauthorizedException (同錯誤密碼回應)
  it('should throw UnauthorizedException for non-existent email with same message as wrong password', async () => {
    mockUserRepository.findOne.mockResolvedValue(null);

    await expect(
      authService.login({
        email: 'nonexistent@cdmp.test',
        password: 'P@ssw0rd123',
      }),
    ).rejects.toThrow(UnauthorizedException);

    try {
      await authService.login({
        email: 'nonexistent@cdmp.test',
        password: 'P@ssw0rd123',
      });
    } catch (error: any) {
      expect(error.response.error).toBe(ERROR_CODES.INVALID_CREDENTIALS);
      expect(error.response.message).toBe(ERROR_MESSAGES.INVALID_CREDENTIALS);
    }
  });

  // TS-F001-006: 帳號已停用 → ForbiddenException
  it('should throw ForbiddenException for disabled account', async () => {
    mockUserRepository.findOne.mockResolvedValue({
      ...ADMIN_DISABLED,
      password_hash: hashedPassword,
    });

    await expect(
      authService.login({
        email: ADMIN_DISABLED.email,
        password: ADMIN_DISABLED.password,
      }),
    ).rejects.toThrow(ForbiddenException);

    try {
      await authService.login({
        email: ADMIN_DISABLED.email,
        password: ADMIN_DISABLED.password,
      });
    } catch (error: any) {
      expect(error.response.error).toBe(ERROR_CODES.ACCOUNT_DISABLED);
      expect(error.response.message).toBe(ERROR_MESSAGES.ACCOUNT_DISABLED);
    }
  });

  // TS-F002-001: User 正確憑證登入 → token + user.role='user'
  it('should return token and user info for valid user credentials', async () => {
    mockUserRepository.findOne.mockResolvedValue({
      ...USER_ACTIVE,
      password_hash: hashedPassword,
    });

    const result = await authService.login({
      email: USER_ACTIVE.email,
      password: USER_ACTIVE.password,
    });

    expect(result).toHaveProperty('token');
    expect(result.user.id).toBe(USER_ACTIVE.id);
    expect(result.user.email).toBe(USER_ACTIVE.email);
    expect(result.user.name).toBe(USER_ACTIVE.name);
    expect(result.user.role).toBe('user');
    expect(result.token).toBe('mock-jwt-token');

    expect(mockJwtUtil.generateToken).toHaveBeenCalledWith({
      userId: USER_ACTIVE.id,
      role: 'user',
      rememberMe: false,
    });
  });

  // TS-F002-002: User rememberMe=true → JWT generateToken 帶 rememberMe=true
  it('should pass rememberMe=true to JWT generation for user', async () => {
    mockUserRepository.findOne.mockResolvedValue({
      ...USER_ACTIVE,
      password_hash: hashedPassword,
    });

    await authService.login({
      email: USER_ACTIVE.email,
      password: USER_ACTIVE.password,
      rememberMe: true,
    });

    expect(mockJwtUtil.generateToken).toHaveBeenCalledWith({
      userId: USER_ACTIVE.id,
      role: 'user',
      rememberMe: true,
    });
  });

  // TS-F002-005: User 帳號已停用 → ForbiddenException
  it('should throw ForbiddenException for disabled user account', async () => {
    mockUserRepository.findOne.mockResolvedValue({
      ...USER_DISABLED,
      password_hash: hashedPassword,
    });

    await expect(
      authService.login({
        email: USER_DISABLED.email,
        password: USER_DISABLED.password,
      }),
    ).rejects.toThrow(ForbiddenException);

    try {
      await authService.login({
        email: USER_DISABLED.email,
        password: USER_DISABLED.password,
      });
    } catch (error: any) {
      expect(error.response.error).toBe(ERROR_CODES.ACCOUNT_DISABLED);
      expect(error.response.message).toBe(ERROR_MESSAGES.ACCOUNT_DISABLED);
    }
  });

  // TS-F002-006: User 錯誤密碼 → UnauthorizedException
  it('should throw UnauthorizedException for wrong user password', async () => {
    mockUserRepository.findOne.mockResolvedValue({
      ...USER_ACTIVE,
      password_hash: hashedPassword,
    });

    await expect(
      authService.login({
        email: USER_ACTIVE.email,
        password: 'WrongPassword123',
      }),
    ).rejects.toThrow(UnauthorizedException);

    try {
      await authService.login({
        email: USER_ACTIVE.email,
        password: 'WrongPassword123',
      });
    } catch (error: any) {
      expect(error.response.error).toBe(ERROR_CODES.INVALID_CREDENTIALS);
      expect(error.response.message).toBe(ERROR_MESSAGES.INVALID_CREDENTIALS);
    }
  });

  // TS-F001-007: SQL injection 安全處理
  it('should safely handle SQL injection attempt via parameterized query', async () => {
    mockUserRepository.findOne.mockResolvedValue(null);

    const sqlInjectionEmail = "' OR '1'='1'; DROP TABLE users; --";

    await expect(
      authService.login({
        email: sqlInjectionEmail,
        password: 'anything',
      }),
    ).rejects.toThrow(UnauthorizedException);

    // Verify TypeORM findOne was called with the raw string (parameterized)
    expect(mockUserRepository.findOne).toHaveBeenCalledWith({
      where: { email: sqlInjectionEmail.toLowerCase() },
    });
  });

  // TS-F003: Logout tests
  describe('logout', () => {
    it('should save token to blocklist', async () => {
      mockTokenBlocklistRepository.findOne.mockResolvedValue(null);
      mockTokenBlocklistRepository.save.mockResolvedValue(undefined);

      await authService.logout('some-jwt-token', 'user-123');

      expect(mockTokenBlocklistRepository.create).toHaveBeenCalledWith(
        expect.objectContaining({
          token: 'some-jwt-token',
          user_id: 'user-123',
        }),
      );
      expect(mockTokenBlocklistRepository.save).toHaveBeenCalled();
    });

    it('should set expires_at from JWT exp claim', async () => {
      const futureExp = Math.floor(Date.now() / 1000) + 7200;
      mockJwtService.decode.mockReturnValue({ exp: futureExp });
      mockTokenBlocklistRepository.findOne.mockResolvedValue(null);
      mockTokenBlocklistRepository.save.mockResolvedValue(undefined);

      await authService.logout('token-with-exp', 'user-123');

      expect(mockTokenBlocklistRepository.create).toHaveBeenCalledWith(
        expect.objectContaining({
          expires_at: new Date(futureExp * 1000),
        }),
      );
    });

    it('should be idempotent — skip if token already in blocklist', async () => {
      mockTokenBlocklistRepository.findOne.mockResolvedValue({
        token: 'already-revoked',
      });

      await authService.logout('already-revoked', 'user-123');

      expect(mockTokenBlocklistRepository.save).not.toHaveBeenCalled();
    });
  });

  describe('isTokenRevoked', () => {
    it('should return true if token is in blocklist', async () => {
      mockTokenBlocklistRepository.findOne.mockResolvedValue({
        token: 'revoked-token',
      });

      const result = await authService.isTokenRevoked('revoked-token');
      expect(result).toBe(true);
    });

    it('should return false if token is not in blocklist', async () => {
      mockTokenBlocklistRepository.findOne.mockResolvedValue(null);

      const result = await authService.isTokenRevoked('valid-token');
      expect(result).toBe(false);
    });
  });
});
