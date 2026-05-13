import { describe, it, expect, beforeEach, vi } from 'vitest';
import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { BadRequestException, ConflictException, NotFoundException, UnprocessableEntityException } from '@nestjs/common';
import { AccountsService } from '../accounts.service';
import { User } from '@/database/entities/user.entity';
import { HashUtil } from '@/common/hash/hash.util';

describe('AccountsService', () => {
  let service: AccountsService;
  let userRepository: {
    findOne: ReturnType<typeof vi.fn>;
    create: ReturnType<typeof vi.fn>;
    save: ReturnType<typeof vi.fn>;
    count: ReturnType<typeof vi.fn>;
    createQueryBuilder: ReturnType<typeof vi.fn>;
  };

  beforeEach(async () => {
    userRepository = {
      findOne: vi.fn(),
      create: vi.fn((data) => ({ ...data, id: 'new-uuid', created_at: new Date() })),
      save: vi.fn((entity) => Promise.resolve(entity)),
      count: vi.fn(),
      createQueryBuilder: vi.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AccountsService,
        { provide: getRepositoryToken(User), useValue: userRepository },
      ],
    }).compile();

    service = module.get<AccountsService>(AccountsService);
  });

  // ===== F004: createAccount =====

  it('should create an account successfully', async () => {
    userRepository.findOne.mockResolvedValue(null);

    const result = await service.createAccount({
      name: 'New User',
      email: 'new@example.com',
      password: 'password123',
      role: 'user',
    });

    expect(result).toHaveProperty('id');
    expect(result.name).toBe('New User');
    expect(result.email).toBe('new@example.com');
    expect(result.role).toBe('user');
    expect(result.status).toBe('active');
    expect(result).not.toHaveProperty('password_hash');
  });

  it('should convert email to lowercase', async () => {
    userRepository.findOne.mockResolvedValue(null);

    const result = await service.createAccount({
      name: 'Test',
      email: 'Test@EXAMPLE.Com',
      password: 'password123',
      role: 'user',
    });

    expect(result.email).toBe('test@example.com');
    expect(userRepository.findOne).toHaveBeenCalledWith({
      where: { email: 'test@example.com' },
    });
  });

  it('should hash password with bcrypt', async () => {
    userRepository.findOne.mockResolvedValue(null);

    await service.createAccount({
      name: 'Test',
      email: 'test@example.com',
      password: 'password123',
      role: 'user',
    });

    const savedEntity = userRepository.create.mock.calls[0][0];
    expect(savedEntity.password_hash).toBeDefined();
    expect(savedEntity.password_hash).not.toBe('password123');
    const isValid = await HashUtil.compare('password123', savedEntity.password_hash);
    expect(isValid).toBe(true);
  });

  it('should throw 409 ConflictException for duplicate email', async () => {
    userRepository.findOne.mockResolvedValue({ id: 'existing', email: 'existing@example.com' });

    await expect(
      service.createAccount({
        name: 'Test',
        email: 'existing@example.com',
        password: 'password123',
        role: 'user',
      }),
    ).rejects.toThrow(ConflictException);
  });

  it('should set status to active for new accounts', async () => {
    userRepository.findOne.mockResolvedValue(null);

    await service.createAccount({
      name: 'Test',
      email: 'test@example.com',
      password: 'password123',
      role: 'admin',
    });

    const savedEntity = userRepository.create.mock.calls[0][0];
    expect(savedEntity.status).toBe('active');
  });

  it('should not include password_hash in response', async () => {
    userRepository.findOne.mockResolvedValue(null);

    const result = await service.createAccount({
      name: 'Test',
      email: 'test@example.com',
      password: 'password123',
      role: 'user',
    });

    expect(result).not.toHaveProperty('password_hash');
    expect(result).toHaveProperty('id');
    expect(result).toHaveProperty('created_at');
  });

  // ===== F006: updateAccount =====

  describe('updateAccount', () => {
    const existingUser = {
      id: 'user-uuid-1',
      name: 'Original Name',
      email: 'original@example.com',
      password_hash: '$2b$10$hashedpassword',
      role: 'user' as const,
      status: 'active' as const,
      created_at: new Date('2025-01-01'),
      updated_at: new Date('2025-01-01'),
    };

    it('should update name successfully', async () => {
      userRepository.findOne
        .mockResolvedValueOnce({ ...existingUser })
        .mockResolvedValueOnce(null);
      userRepository.save.mockImplementation((entity: any) =>
        Promise.resolve({ ...entity, updated_at: new Date('2025-06-01') }),
      );

      const result = await service.updateAccount('user-uuid-1', {
        name: 'Updated Name',
        email: 'original@example.com',
      });

      expect(result.name).toBe('Updated Name');
      expect(result.email).toBe('original@example.com');
      expect(result).toHaveProperty('updated_at');
    });

    it('should update email and convert to lowercase', async () => {
      userRepository.findOne
        .mockResolvedValueOnce({ ...existingUser })
        .mockResolvedValueOnce(null);
      userRepository.save.mockImplementation((entity: any) =>
        Promise.resolve({ ...entity, updated_at: new Date('2025-06-01') }),
      );

      const result = await service.updateAccount('user-uuid-1', {
        name: 'Original Name',
        email: 'NEW@EXAMPLE.COM',
      });

      expect(result.email).toBe('new@example.com');
    });

    it('should not trigger duplicate error when email is unchanged (self-exclusion BR-3)', async () => {
      userRepository.findOne
        .mockResolvedValueOnce({ ...existingUser })
        .mockResolvedValueOnce({ ...existingUser });
      userRepository.save.mockImplementation((entity: any) =>
        Promise.resolve({ ...entity, updated_at: new Date('2025-06-01') }),
      );

      const result = await service.updateAccount('user-uuid-1', {
        name: 'Updated Name',
        email: 'original@example.com',
      });

      expect(result.name).toBe('Updated Name');
    });

    it('should throw 409 ConflictException when email is used by another account', async () => {
      const anotherUser = { id: 'other-uuid-2', email: 'taken@example.com' };
      userRepository.findOne
        .mockResolvedValueOnce({ ...existingUser })
        .mockResolvedValueOnce(anotherUser);

      await expect(
        service.updateAccount('user-uuid-1', {
          name: 'Original Name',
          email: 'taken@example.com',
        }),
      ).rejects.toThrow(ConflictException);
    });

    it('should throw 404 NotFoundException when account does not exist', async () => {
      userRepository.findOne.mockResolvedValueOnce(null);

      await expect(
        service.updateAccount('nonexistent-uuid', {
          name: 'Test',
          email: 'test@example.com',
        }),
      ).rejects.toThrow(NotFoundException);
    });

    it('should not include password_hash in response', async () => {
      userRepository.findOne
        .mockResolvedValueOnce({ ...existingUser })
        .mockResolvedValueOnce(null);
      userRepository.save.mockImplementation((entity: any) =>
        Promise.resolve({ ...entity, updated_at: new Date('2025-06-01') }),
      );

      const result = await service.updateAccount('user-uuid-1', {
        name: 'Updated',
        email: 'original@example.com',
      });

      expect(result).not.toHaveProperty('password_hash');
      expect(result).toHaveProperty('id');
      expect(result).toHaveProperty('role');
      expect(result).toHaveProperty('status');
      expect(result).toHaveProperty('created_at');
      expect(result).toHaveProperty('updated_at');
    });

    it('should preserve role and status when updating', async () => {
      const adminUser = { ...existingUser, role: 'admin' as const, status: 'disabled' as const };
      userRepository.findOne
        .mockResolvedValueOnce({ ...adminUser })
        .mockResolvedValueOnce(null);
      userRepository.save.mockImplementation((entity: any) =>
        Promise.resolve({ ...entity, updated_at: new Date('2025-06-01') }),
      );

      const result = await service.updateAccount('user-uuid-1', {
        name: 'Updated',
        email: 'original@example.com',
      });

      expect(result.role).toBe('admin');
      expect(result.status).toBe('disabled');
    });
  });

  // ===== F007: toggleStatus =====

  describe('toggleStatus', () => {
    const existingUser = {
      id: 'user-uuid-1',
      name: 'Test User',
      email: 'test@example.com',
      password_hash: '$2b$10$hashedpassword',
      role: 'user' as const,
      status: 'active' as const,
      created_at: new Date('2025-01-01'),
      updated_at: new Date('2025-01-01'),
    };

    it('should set status to disabled and return updated user (TS-F007-001)', async () => {
      userRepository.findOne.mockResolvedValueOnce({ ...existingUser });
      userRepository.save.mockImplementation((entity: any) =>
        Promise.resolve({ ...entity, updated_at: new Date('2025-06-01') }),
      );

      const result = await service.toggleStatus('user-uuid-1', 'disabled', 'admin-uuid');

      expect(result.status).toBe('disabled');
      expect(result.id).toBe('user-uuid-1');
      expect(result).not.toHaveProperty('password_hash');
    });

    it('should set status to active and return updated user (TS-F007-004)', async () => {
      const disabledUser = { ...existingUser, status: 'disabled' as const };
      userRepository.findOne.mockResolvedValueOnce({ ...disabledUser });
      userRepository.save.mockImplementation((entity: any) =>
        Promise.resolve({ ...entity, updated_at: new Date('2025-06-01') }),
      );

      const result = await service.toggleStatus('user-uuid-1', 'active', 'admin-uuid');
      expect(result.status).toBe('active');
    });

    it('should throw 422 UnprocessableEntityException for self-disable (TS-F007-005)', async () => {
      await expect(
        service.toggleStatus('admin-uuid', 'disabled', 'admin-uuid'),
      ).rejects.toThrow(UnprocessableEntityException);
    });

    it('should throw 404 NotFoundException for non-existent account (TS-F007-006)', async () => {
      userRepository.findOne.mockResolvedValueOnce(null);
      await expect(
        service.toggleStatus('nonexistent-uuid', 'disabled', 'admin-uuid'),
      ).rejects.toThrow(NotFoundException);
    });

    it('should return 200 idempotently when disabling already-disabled account (TS-F007-007)', async () => {
      const disabledUser = { ...existingUser, status: 'disabled' as const };
      userRepository.findOne.mockResolvedValueOnce({ ...disabledUser });
      userRepository.save.mockImplementation((entity: any) =>
        Promise.resolve({ ...entity, updated_at: new Date('2025-06-01') }),
      );

      const result = await service.toggleStatus('user-uuid-1', 'disabled', 'admin-uuid');
      expect(result.status).toBe('disabled');
    });
  });

  // ===== F008: changeRole (8 roles) =====

  describe('changeRole', () => {
    const userAccount = {
      id: 'user-uuid-1',
      name: 'Test User',
      email: 'test@example.com',
      password_hash: '$2b$10$hashedpassword',
      role: 'user' as const,
      status: 'active' as const,
      created_at: new Date('2025-01-01'),
      updated_at: new Date('2025-01-01'),
    };

    const adminAccount = {
      ...userAccount,
      id: 'admin-uuid-1',
      name: 'Admin User',
      email: 'admin@example.com',
      role: 'admin' as const,
    };

    it('should upgrade User to Admin (TS-F008-001)', async () => {
      userRepository.findOne.mockResolvedValueOnce({ ...userAccount });
      userRepository.save.mockImplementation((entity: any) =>
        Promise.resolve({ ...entity, updated_at: new Date('2025-06-01') }),
      );

      const result = await service.changeRole('user-uuid-1', 'admin');
      expect(result.role).toBe('admin');
      expect(result.id).toBe('user-uuid-1');
      expect(result).not.toHaveProperty('password_hash');
    });

    it('should downgrade Admin to User when system has >= 2 Admins (TS-F008-002)', async () => {
      userRepository.findOne.mockResolvedValueOnce({ ...adminAccount });
      userRepository.count.mockResolvedValueOnce(2);
      userRepository.save.mockImplementation((entity: any) =>
        Promise.resolve({ ...entity, updated_at: new Date('2025-06-01') }),
      );

      const result = await service.changeRole('admin-uuid-1', 'user');
      expect(result.role).toBe('user');
    });

    it('should throw 422 UnprocessableEntityException for last Admin protection (TS-F008-003)', async () => {
      userRepository.findOne.mockResolvedValueOnce({ ...adminAccount });
      userRepository.count.mockResolvedValueOnce(1);

      await expect(
        service.changeRole('admin-uuid-1', 'user'),
      ).rejects.toThrow(UnprocessableEntityException);
      expect(userRepository.save).not.toHaveBeenCalled();
    });

    it('should throw 404 NotFoundException when account does not exist (TS-F008-004)', async () => {
      userRepository.findOne.mockResolvedValueOnce(null);
      await expect(
        service.changeRole('nonexistent-uuid', 'admin'),
      ).rejects.toThrow(NotFoundException);
    });

    it('should return 200 idempotently when setting same role (TS-F008-006)', async () => {
      userRepository.findOne.mockResolvedValueOnce({ ...adminAccount });

      const result = await service.changeRole('admin-uuid-1', 'admin');
      expect(result.role).toBe('admin');
      expect(userRepository.count).not.toHaveBeenCalled();
    });

    it('should downgrade Admin to User when system has 3 Admins', async () => {
      userRepository.findOne.mockResolvedValueOnce({ ...adminAccount });
      userRepository.count.mockResolvedValueOnce(3);
      userRepository.save.mockImplementation((entity: any) =>
        Promise.resolve({ ...entity, updated_at: new Date('2025-06-01') }),
      );

      const result = await service.changeRole('admin-uuid-1', 'user');
      expect(result.role).toBe('user');
    });

    // F008 v3.2 BR-8 / TS-F008-SM-009: 角色變更不影響 is_sales_manager
    it('should preserve is_sales_manager when changing role (TS-F008-SM-009)', async () => {
      const userWithSalesManager = {
        ...userAccount,
        is_sales_manager: true,
      };
      userRepository.findOne.mockResolvedValueOnce({ ...userWithSalesManager });
      userRepository.save.mockImplementation((entity: any) =>
        Promise.resolve({ ...entity, updated_at: new Date('2025-06-01') }),
      );

      // 冪等：user → user，回應仍保留 is_sales_manager: true
      const result = await service.changeRole('user-uuid-1', 'user');
      expect(result.role).toBe('user');
      expect(result.is_sales_manager).toBe(true);
    });

    it('should include is_sales_manager in changeRole response when upgrading', async () => {
      const userWithSalesManager = {
        ...userAccount,
        is_sales_manager: true,
      };
      userRepository.findOne.mockResolvedValueOnce({ ...userWithSalesManager });
      userRepository.save.mockImplementation((entity: any) =>
        Promise.resolve({ ...entity, updated_at: new Date('2025-06-01') }),
      );

      const result = await service.changeRole('user-uuid-1', 'admin');
      expect(result.role).toBe('admin');
      // F008 v3.2 AC-10: 升級為 admin 時 DB 中 is_sales_manager 仍保留原值（不被清除）
      expect(result.is_sales_manager).toBe(true);
    });
  });

  // ===== F004 AC-6 / AC-7 / BR-9: createAccount with isSalesManager =====
  describe('createAccount with isSalesManager (F004 SM)', () => {
    // TS-F004-SM-001
    it('should create User account with isSalesManager=true and write DB true', async () => {
      userRepository.findOne.mockResolvedValue(null);

      const result = await service.createAccount({
        name: 'New User',
        email: 'user+sm@example.com',
        password: 'password123',
        role: 'user',
        isSalesManager: true,
      });

      const savedEntity = userRepository.create.mock.calls[0][0];
      expect(savedEntity.is_sales_manager).toBe(true);
      expect(result.is_sales_manager).toBe(true);
    });

    // TS-F004-SM-002
    it('should create User account with isSalesManager=false', async () => {
      userRepository.findOne.mockResolvedValue(null);

      const result = await service.createAccount({
        name: 'New User',
        email: 'user2@example.com',
        password: 'password123',
        role: 'user',
        isSalesManager: false,
      });

      const savedEntity = userRepository.create.mock.calls[0][0];
      expect(savedEntity.is_sales_manager).toBe(false);
      expect(result.is_sales_manager).toBe(false);
    });

    // TS-F004-SM-003
    it('should default isSalesManager to false when omitted', async () => {
      userRepository.findOne.mockResolvedValue(null);

      const result = await service.createAccount({
        name: 'New User',
        email: 'user3@example.com',
        password: 'password123',
        role: 'user',
        // 無 isSalesManager 欄位
      });

      const savedEntity = userRepository.create.mock.calls[0][0];
      expect(savedEntity.is_sales_manager).toBe(false);
      expect(result.is_sales_manager).toBe(false);
    });

    // TS-F004-SM-004: AC-7 BR-9
    it('should force is_sales_manager=false when role=admin even if isSalesManager=true is sent', async () => {
      userRepository.findOne.mockResolvedValue(null);

      const result = await service.createAccount({
        name: 'New Admin',
        email: 'admin-sm@example.com',
        password: 'password123',
        role: 'admin',
        isSalesManager: true,
      });

      const savedEntity = userRepository.create.mock.calls[0][0];
      // BR-9: role=admin 時後端強制覆寫為 false（不論傳入值）
      expect(savedEntity.is_sales_manager).toBe(false);
      expect(result.is_sales_manager).toBe(false);
    });
  });

  // ===== F006 BR-6: updateAccount must ignore isSalesManager =====
  describe('updateAccount ignores isSalesManager (F006 BR-6)', () => {
    it('should not modify is_sales_manager via updateAccount', async () => {
      const existingUser = {
        id: 'user-uuid-1',
        name: 'Original',
        email: 'original@example.com',
        password_hash: '$2b$10$hashedpassword',
        role: 'user' as const,
        status: 'active' as const,
        is_sales_manager: false,
        created_at: new Date('2025-01-01'),
        updated_at: new Date('2025-01-01'),
      };
      userRepository.findOne
        .mockResolvedValueOnce({ ...existingUser })
        .mockResolvedValueOnce(null);
      userRepository.save.mockImplementation((entity: any) =>
        Promise.resolve({ ...entity, updated_at: new Date('2025-06-01') }),
      );

      // DTO 即使被攻擊者繞過送入 isSalesManager: true，service 也不應改動 DB
      await service.updateAccount('user-uuid-1', {
        name: 'Updated',
        email: 'updated@example.com',
      } as any);

      const savedEntity = userRepository.save.mock.calls[0][0];
      expect(savedEntity.is_sales_manager).toBe(false);
    });
  });

  // ===== F008 v3.2 AC-8 / AC-9 / BR-9 / BR-10: updateSalesManagerFlag =====
  describe('updateSalesManagerFlag', () => {
    const userAccount = {
      id: 'user-uuid-1',
      name: 'Test User',
      email: 'test@example.com',
      password_hash: '$2b$10$hashedpassword',
      role: 'user' as const,
      status: 'active' as const,
      is_sales_manager: false,
      created_at: new Date('2025-01-01'),
      updated_at: new Date('2025-01-01'),
    };

    // TS-F008-SM-001
    it('should toggle flag false → true and return 200', async () => {
      userRepository.findOne.mockResolvedValueOnce({ ...userAccount });
      userRepository.save.mockImplementation((entity: any) =>
        Promise.resolve({ ...entity, updated_at: new Date('2025-06-01') }),
      );

      const result = await service.updateSalesManagerFlag('user-uuid-1', true);

      expect(result.is_sales_manager).toBe(true);
      expect(result.id).toBe('user-uuid-1');
      expect(result.role).toBe('user');
      expect(result).not.toHaveProperty('password_hash');
    });

    // TS-F008-SM-002
    it('should toggle flag true → false and return 200', async () => {
      const userWithSm = { ...userAccount, is_sales_manager: true };
      userRepository.findOne.mockResolvedValueOnce({ ...userWithSm });
      userRepository.save.mockImplementation((entity: any) =>
        Promise.resolve({ ...entity, updated_at: new Date('2025-06-01') }),
      );

      const result = await service.updateSalesManagerFlag('user-uuid-1', false);
      expect(result.is_sales_manager).toBe(false);
    });

    // TS-F008-SM-003 / BR-10
    it('should be idempotent when setting same value (true → true)', async () => {
      const userWithSm = { ...userAccount, is_sales_manager: true };
      userRepository.findOne.mockResolvedValueOnce({ ...userWithSm });
      userRepository.save.mockImplementation((entity: any) =>
        Promise.resolve({ ...entity, updated_at: new Date('2025-06-01') }),
      );

      const result = await service.updateSalesManagerFlag('user-uuid-1', true);
      expect(result.is_sales_manager).toBe(true);
    });

    // TS-F008-SM-005 / AC-9 / BR-9
    it('should throw BadRequestException ACCOUNT_FLAG_NOT_APPLICABLE for admin account', async () => {
      const adminAccount = {
        ...userAccount,
        role: 'admin' as const,
      };
      userRepository.findOne.mockResolvedValueOnce({ ...adminAccount });

      await expect(
        service.updateSalesManagerFlag('user-uuid-1', true),
      ).rejects.toThrow(BadRequestException);
      // 確認 DB 未被更新
      expect(userRepository.save).not.toHaveBeenCalled();
    });

    // TS-F008-SM-006
    it('should throw NotFoundException when account does not exist', async () => {
      userRepository.findOne.mockResolvedValueOnce(null);

      await expect(
        service.updateSalesManagerFlag('nonexistent-uuid', true),
      ).rejects.toThrow(NotFoundException);
    });
  });
});
