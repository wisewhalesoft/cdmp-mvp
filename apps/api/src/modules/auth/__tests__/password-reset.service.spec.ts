import { describe, it, expect, beforeEach, vi } from 'vitest';
import { Test } from '@nestjs/testing';
import { UnprocessableEntityException } from '@nestjs/common';
import { getRepositoryToken } from '@nestjs/typeorm';
import { JwtService } from '@nestjs/jwt';
import { AuthService } from '../auth.service';
import { User } from '@/database/entities/user.entity';
import { TokenBlocklist } from '@/database/entities/token-blocklist.entity';
import { PasswordResetToken } from '@/database/entities/password-reset-token.entity';
import { JwtUtil } from '@/common/jwt/jwt.util';
import { EmailUtil } from '@/common/email/email.util';
import { HashUtil } from '@/common/hash/hash.util';
import { ERROR_CODES, ERROR_MESSAGES } from '@/common/errors/error-codes';
import { ADMIN_ACTIVE } from '../../../../test/seeds/test-data';

describe('AuthService - Password Reset', () => {
  let authService: AuthService;
  let mockUserRepository: Record<string, any>;
  let mockTokenBlocklistRepository: Record<string, any>;
  let mockPasswordResetTokenRepository: Record<string, any>;
  let mockJwtUtil: Record<string, any>;
  let mockJwtService: Record<string, any>;
  let mockEmailUtil: Record<string, any>;

  beforeEach(async () => {
    mockUserRepository = {
      findOne: vi.fn(),
      save: vi.fn(),
    };

    mockTokenBlocklistRepository = {
      findOne: vi.fn(),
      save: vi.fn(),
      create: vi.fn((data: any) => data),
    };

    mockPasswordResetTokenRepository = {
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

    mockEmailUtil = {
      sendPasswordResetEmail: vi.fn().mockResolvedValue(undefined),
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
          provide: getRepositoryToken(PasswordResetToken),
          useValue: mockPasswordResetTokenRepository,
        },
        {
          provide: JwtUtil,
          useValue: mockJwtUtil,
        },
        {
          provide: JwtService,
          useValue: mockJwtService,
        },
        {
          provide: EmailUtil,
          useValue: mockEmailUtil,
        },
      ],
    }).compile();

    authService = module.get<AuthService>(AuthService);
  });

  describe('forgotPassword', () => {
    // TS-F009-001: 已註冊 Email → 建立 Token + 寄 Email → 回傳統一訊息
    it('should create reset token and send email for registered email', async () => {
      mockUserRepository.findOne.mockResolvedValue({
        ...ADMIN_ACTIVE,
        password_hash: 'hashed',
      });
      mockPasswordResetTokenRepository.save.mockResolvedValue({});

      const result = await authService.forgotPassword({ email: ADMIN_ACTIVE.email });

      expect(result.message).toBe('若此 Email 存在，重設連結已寄出');
      expect(mockPasswordResetTokenRepository.create).toHaveBeenCalledWith(
        expect.objectContaining({
          user_id: ADMIN_ACTIVE.id,
        }),
      );
      expect(mockPasswordResetTokenRepository.save).toHaveBeenCalled();
      expect(mockEmailUtil.sendPasswordResetEmail).toHaveBeenCalledWith(
        ADMIN_ACTIVE.email,
        expect.any(String),
      );
    });

    // TS-F009-004: 未註冊 Email → 不建立 Token → 回傳相同統一訊息
    it('should return same message for unregistered email without creating token', async () => {
      mockUserRepository.findOne.mockResolvedValue(null);

      const result = await authService.forgotPassword({ email: 'nonexist@test.com' });

      expect(result.message).toBe('若此 Email 存在，重設連結已寄出');
      expect(mockPasswordResetTokenRepository.save).not.toHaveBeenCalled();
      expect(mockEmailUtil.sendPasswordResetEmail).not.toHaveBeenCalled();
    });
  });

  describe('resetPassword', () => {
    const validToken = 'a1b2c3d4-e5f6-7890-abcd-000000000001';
    const futureDate = new Date(Date.now() + 24 * 60 * 60 * 1000);

    // TS-F009-002: 有效 Token + 合法密碼 → 更新 hash、標記 used_at、失效舊 Session
    it('should reset password with valid token', async () => {
      const tokenRecord = {
        id: 'token-id-1',
        user_id: ADMIN_ACTIVE.id,
        token: validToken,
        expires_at: futureDate,
        used_at: null,
      };

      mockPasswordResetTokenRepository.findOne.mockResolvedValue(tokenRecord);
      mockUserRepository.findOne.mockResolvedValue({
        ...ADMIN_ACTIVE,
        password_hash: 'old-hash',
      });
      mockUserRepository.save.mockResolvedValue({});
      mockPasswordResetTokenRepository.save.mockResolvedValue({});
      mockTokenBlocklistRepository.save.mockResolvedValue({});

      const result = await authService.resetPassword({
        token: validToken,
        newPassword: 'NewPass99',
      });

      expect(result.message).toBe('密碼已成功重設，請重新登入');

      // Verify password hash updated (bcrypt)
      expect(mockUserRepository.save).toHaveBeenCalledWith(
        expect.objectContaining({
          id: ADMIN_ACTIVE.id,
        }),
      );

      // Verify token marked as used
      expect(mockPasswordResetTokenRepository.save).toHaveBeenCalledWith(
        expect.objectContaining({
          used_at: expect.any(Date),
        }),
      );
    });

    // TS-F009-005: 過期 Token → 422 AUTH_RESET_TOKEN_EXPIRED
    it('should throw 422 for expired token', async () => {
      const expiredDate = new Date(Date.now() - 1000);
      mockPasswordResetTokenRepository.findOne.mockResolvedValue({
        id: 'token-id-2',
        user_id: ADMIN_ACTIVE.id,
        token: validToken,
        expires_at: expiredDate,
        used_at: null,
      });

      try {
        await authService.resetPassword({ token: validToken, newPassword: 'NewPass99' });
        expect.unreachable('Should have thrown');
      } catch (error: any) {
        expect(error).toBeInstanceOf(UnprocessableEntityException);
        expect(error.response.error).toBe(ERROR_CODES.RESET_TOKEN_EXPIRED);
        expect(error.response.message).toBe(ERROR_MESSAGES.RESET_TOKEN_EXPIRED);
      }
    });

    // TS-F009-006: 已使用 Token → 422 AUTH_RESET_TOKEN_USED
    it('should throw 422 for already-used token', async () => {
      mockPasswordResetTokenRepository.findOne.mockResolvedValue({
        id: 'token-id-3',
        user_id: ADMIN_ACTIVE.id,
        token: validToken,
        expires_at: futureDate,
        used_at: new Date(),
      });

      try {
        await authService.resetPassword({ token: validToken, newPassword: 'NewPass99' });
        expect.unreachable('Should have thrown');
      } catch (error: any) {
        expect(error).toBeInstanceOf(UnprocessableEntityException);
        expect(error.response.error).toBe(ERROR_CODES.RESET_TOKEN_USED);
        expect(error.response.message).toBe(ERROR_MESSAGES.RESET_TOKEN_USED);
      }
    });

    // TS-F009-007: 無效 Token → 422 AUTH_RESET_TOKEN_INVALID
    it('should throw 422 for invalid/non-existent token', async () => {
      mockPasswordResetTokenRepository.findOne.mockResolvedValue(null);

      try {
        await authService.resetPassword({ token: 'invalid-token', newPassword: 'NewPass99' });
        expect.unreachable('Should have thrown');
      } catch (error: any) {
        expect(error).toBeInstanceOf(UnprocessableEntityException);
        expect(error.response.error).toBe(ERROR_CODES.RESET_TOKEN_INVALID);
        expect(error.response.message).toBe(ERROR_MESSAGES.RESET_TOKEN_INVALID);
      }
    });

    // TS-F009-009: 密碼恰好 8 字元 → 成功
    it('should succeed with password exactly 8 characters', async () => {
      mockPasswordResetTokenRepository.findOne.mockResolvedValue({
        id: 'token-id-4',
        user_id: ADMIN_ACTIVE.id,
        token: validToken,
        expires_at: futureDate,
        used_at: null,
      });
      mockUserRepository.findOne.mockResolvedValue({
        ...ADMIN_ACTIVE,
        password_hash: 'old-hash',
      });
      mockUserRepository.save.mockResolvedValue({});
      mockPasswordResetTokenRepository.save.mockResolvedValue({});
      mockTokenBlocklistRepository.save.mockResolvedValue({});

      const result = await authService.resetPassword({
        token: validToken,
        newPassword: '12345678',
      });

      expect(result.message).toBe('密碼已成功重設，請重新登入');
    });

    // TS-F009-010: 密碼僅 7 字元 → service level validation
    // Note: This is primarily validated by DTO/ValidationPipe at controller level,
    // but we verify the service also checks length for defense in depth.
    it('should throw 422 for password shorter than 8 characters', async () => {
      mockPasswordResetTokenRepository.findOne.mockResolvedValue({
        id: 'token-id-5',
        user_id: ADMIN_ACTIVE.id,
        token: validToken,
        expires_at: futureDate,
        used_at: null,
      });

      try {
        await authService.resetPassword({
          token: validToken,
          newPassword: '1234567',
        });
        expect.unreachable('Should have thrown');
      } catch (error: any) {
        expect(error).toBeInstanceOf(UnprocessableEntityException);
        expect(error.response.error).toBe(ERROR_CODES.VALIDATION_PASSWORD_LENGTH);
        expect(error.response.message).toBe(ERROR_MESSAGES.VALIDATION_PASSWORD_LENGTH);
      }
    });
  });
});
