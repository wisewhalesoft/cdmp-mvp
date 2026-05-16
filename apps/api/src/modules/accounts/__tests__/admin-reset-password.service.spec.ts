import { describe, it, expect, beforeEach, vi } from 'vitest';
import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken, getDataSourceToken } from '@nestjs/typeorm';
import { NotFoundException, UnprocessableEntityException } from '@nestjs/common';
import { AccountsService } from '../accounts.service';
import { User } from '@/database/entities/user.entity';
import { HashUtil } from '@/common/hash/hash.util';
import { ERROR_CODES } from '@/common/errors/error-codes';

describe('AccountsService — adminResetPassword (F010)', () => {
  let service: AccountsService;
  let userRepository: {
    findOne: ReturnType<typeof vi.fn>;
    create: ReturnType<typeof vi.fn>;
    save: ReturnType<typeof vi.fn>;
    count: ReturnType<typeof vi.fn>;
    createQueryBuilder: ReturnType<typeof vi.fn>;
  };

  const targetUser = {
    id: 'target-uuid',
    name: 'Target User',
    email: 'target@example.com',
    password_hash: '$2b$10$oldhash',
    role: 'user' as const,
    status: 'active' as const,
    password_changed_at: null as Date | null,
    created_at: new Date('2025-01-01'),
    updated_at: new Date('2025-01-01'),
  };

  const adminUserId = 'admin-uuid';

  beforeEach(async () => {
    userRepository = {
      findOne: vi.fn(),
      create: vi.fn((data) => ({ ...data, id: 'new-uuid', created_at: new Date() })),
      save: vi.fn((entity) => Promise.resolve({ ...entity, updated_at: new Date() })),
      count: vi.fn(),
      createQueryBuilder: vi.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AccountsService,
        { provide: getRepositoryToken(User), useValue: userRepository },
        // P1 B1 / F006a：AccountsService 注入 DataSource，本 spec 不觸發 transaction
        {
          provide: getDataSourceToken(),
          useValue: { transaction: vi.fn() },
        },
      ],
    }).compile();

    service = module.get<AccountsService>(AccountsService);
  });

  it('should reset password successfully and update password_changed_at (TS-F010-001)', async () => {
    userRepository.findOne.mockResolvedValueOnce({ ...targetUser });
    userRepository.save.mockImplementation((entity: any) =>
      Promise.resolve({ ...entity, updated_at: new Date() }),
    );

    const result = await service.adminResetPassword('target-uuid', 'NewPass99', adminUserId);

    expect(result.message).toBe('密碼已重設，使用者需以新密碼重新登入');

    // Verify password was hashed
    const savedEntity = userRepository.save.mock.calls[0][0];
    expect(savedEntity.password_hash).toBeDefined();
    expect(savedEntity.password_hash).not.toBe('NewPass99');
    const isValid = await HashUtil.compare('NewPass99', savedEntity.password_hash);
    expect(isValid).toBe(true);

    // Verify password_changed_at was set (for session invalidation)
    expect(savedEntity.password_changed_at).toBeInstanceOf(Date);
  });

  it('should throw 422 ACCOUNT_SELF_RESET when admin resets own password (TS-F010-003)', async () => {
    try {
      await service.adminResetPassword('admin-uuid', 'NewPass99', 'admin-uuid');
      expect.unreachable('Should have thrown');
    } catch (error: any) {
      expect(error).toBeInstanceOf(UnprocessableEntityException);
      const response = error.getResponse();
      expect(response.error).toBe(ERROR_CODES.ACCOUNT_SELF_RESET);
    }
  });

  it('should throw 404 ACCOUNT_NOT_FOUND when target account does not exist (TS-F010-004)', async () => {
    userRepository.findOne.mockResolvedValueOnce(null);

    try {
      await service.adminResetPassword('nonexistent-uuid', 'NewPass99', adminUserId);
      expect.unreachable('Should have thrown');
    } catch (error: any) {
      expect(error).toBeInstanceOf(NotFoundException);
      const response = error.getResponse();
      expect(response.error).toBe(ERROR_CODES.ACCOUNT_NOT_FOUND);
    }
  });

  it('should throw 422 VALIDATION_PASSWORD_LENGTH when password is too short (TS-F010-005)', async () => {
    try {
      await service.adminResetPassword('target-uuid', 'short', adminUserId);
      expect.unreachable('Should have thrown');
    } catch (error: any) {
      expect(error).toBeInstanceOf(UnprocessableEntityException);
      const response = error.getResponse();
      expect(response.error).toBe(ERROR_CODES.VALIDATION_PASSWORD_LENGTH);
    }
  });

  it('should succeed with exactly 8-char password (TS-F010-006)', async () => {
    userRepository.findOne.mockResolvedValueOnce({ ...targetUser });
    userRepository.save.mockImplementation((entity: any) =>
      Promise.resolve({ ...entity, updated_at: new Date() }),
    );

    const result = await service.adminResetPassword('target-uuid', '12345678', adminUserId);

    expect(result.message).toBe('密碼已重設，使用者需以新密碼重新登入');
    const savedEntity = userRepository.save.mock.calls[0][0];
    const isValid = await HashUtil.compare('12345678', savedEntity.password_hash);
    expect(isValid).toBe(true);
  });
});
