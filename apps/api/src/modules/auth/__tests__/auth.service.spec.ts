import { describe, it, expect, beforeEach, vi } from 'vitest';
import { Test } from '@nestjs/testing';
import { UnauthorizedException, ForbiddenException } from '@nestjs/common';
import { getRepositoryToken } from '@nestjs/typeorm';
import { AuthService } from '../auth.service';
import { User } from '@/database/entities/user.entity';
import { HashUtil } from '@/common/hash/hash.util';
import { JwtUtil } from '@/common/jwt/jwt.util';
import { ERROR_CODES, ERROR_MESSAGES } from '@/common/errors/error-codes';
import { ADMIN_ACTIVE, ADMIN_DISABLED } from '../../../../test/seeds/test-data';

describe('AuthService', () => {
  let authService: AuthService;
  let mockUserRepository: Record<string, any>;
  let mockJwtUtil: Record<string, any>;

  // Pre-hashed password for test seeds
  let hashedPassword: string;

  beforeEach(async () => {
    hashedPassword = await HashUtil.hash(ADMIN_ACTIVE.password);

    mockUserRepository = {
      findOne: vi.fn(),
    };

    mockJwtUtil = {
      generateToken: vi.fn().mockReturnValue('mock-jwt-token'),
    };

    const module = await Test.createTestingModule({
      providers: [
        AuthService,
        {
          provide: getRepositoryToken(User),
          useValue: mockUserRepository,
        },
        {
          provide: JwtUtil,
          useValue: mockJwtUtil,
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
});
