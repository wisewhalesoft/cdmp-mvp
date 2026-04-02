import { describe, it, expect, beforeEach, vi } from 'vitest';
import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { ConflictException, NotFoundException, UnprocessableEntityException } from '@nestjs/common';
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

  // TS-F004-009: 以 analyst 角色建立帳號
  it('should create account with analyst business role (TS-F004-009)', async () => {
    userRepository.findOne.mockResolvedValue(null);

    const result = await service.createAccount({
      name: 'Analyst User',
      email: 'analyst@example.com',
      password: 'password123',
      role: 'analyst',
    });

    expect(result.role).toBe('analyst');
    expect(result.name).toBe('Analyst User');
  });

  // TS-F004-010: 以 backend_ops 角色建立帳號
  it('should create account with backend_ops business role (TS-F004-010)', async () => {
    userRepository.findOne.mockResolvedValue(null);

    const result = await service.createAccount({
      name: 'Backend Ops User',
      email: 'ops@example.com',
      password: 'password123',
      role: 'backend_ops',
    });

    expect(result.role).toBe('backend_ops');
  });

  // TS-F004-011: 以 marketing 角色建立帳號
  it('should create account with marketing business role (TS-F004-011)', async () => {
    userRepository.findOne.mockResolvedValue(null);

    const result = await service.createAccount({
      name: 'Marketing User',
      email: 'marketing@example.com',
      password: 'password123',
      role: 'marketing',
    });

    expect(result.role).toBe('marketing');
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

    // TS-F008-007: User → business role
    it('should change User to business role (TS-F008-007)', async () => {
      userRepository.findOne.mockResolvedValueOnce({ ...userAccount });
      userRepository.save.mockImplementation((entity: any) =>
        Promise.resolve({ ...entity, updated_at: new Date('2025-06-01') }),
      );

      const result = await service.changeRole('user-uuid-1', 'business');
      expect(result.role).toBe('business');
    });

    // TS-F008-008: User → analyst
    it('should change User to analyst (TS-F008-008)', async () => {
      userRepository.findOne.mockResolvedValueOnce({ ...userAccount });
      userRepository.save.mockImplementation((entity: any) =>
        Promise.resolve({ ...entity, updated_at: new Date('2025-06-01') }),
      );

      const result = await service.changeRole('user-uuid-1', 'analyst');
      expect(result.role).toBe('analyst');
    });

    // TS-F008-009: business → supervisor (business role to business role)
    it('should change between business roles (TS-F008-009)', async () => {
      const businessUser = { ...userAccount, role: 'business' as const };
      userRepository.findOne.mockResolvedValueOnce({ ...businessUser });
      userRepository.save.mockImplementation((entity: any) =>
        Promise.resolve({ ...entity, updated_at: new Date('2025-06-01') }),
      );

      const result = await service.changeRole('user-uuid-1', 'supervisor');
      expect(result.role).toBe('supervisor');
    });

    // TS-F008-010: analyst → customer_service
    it('should change analyst to customer_service (TS-F008-010)', async () => {
      const analystUser = { ...userAccount, role: 'analyst' as const };
      userRepository.findOne.mockResolvedValueOnce({ ...analystUser });
      userRepository.save.mockImplementation((entity: any) =>
        Promise.resolve({ ...entity, updated_at: new Date('2025-06-01') }),
      );

      const result = await service.changeRole('user-uuid-1', 'customer_service');
      expect(result.role).toBe('customer_service');
    });

    // TS-F008-011: business role → Admin
    it('should upgrade business role to Admin (TS-F008-011)', async () => {
      const businessUser = { ...userAccount, role: 'business' as const };
      userRepository.findOne.mockResolvedValueOnce({ ...businessUser });
      userRepository.save.mockImplementation((entity: any) =>
        Promise.resolve({ ...entity, updated_at: new Date('2025-06-01') }),
      );

      const result = await service.changeRole('user-uuid-1', 'admin');
      expect(result.role).toBe('admin');
    });

    // TS-F008-012: Admin → business role (with >=2 admins)
    it('should downgrade Admin to business role when >=2 admins (TS-F008-012)', async () => {
      userRepository.findOne.mockResolvedValueOnce({ ...adminAccount });
      userRepository.count.mockResolvedValueOnce(2);
      userRepository.save.mockImplementation((entity: any) =>
        Promise.resolve({ ...entity, updated_at: new Date('2025-06-01') }),
      );

      const result = await service.changeRole('admin-uuid-1', 'analyst');
      expect(result.role).toBe('analyst');
    });

    // TS-F008-013: Last Admin → business role should be blocked
    it('should block last Admin downgrade to business role (TS-F008-013)', async () => {
      userRepository.findOne.mockResolvedValueOnce({ ...adminAccount });
      userRepository.count.mockResolvedValueOnce(1);

      await expect(
        service.changeRole('admin-uuid-1', 'business'),
      ).rejects.toThrow(UnprocessableEntityException);
      expect(userRepository.save).not.toHaveBeenCalled();
    });

    // TS-F008-014: Last Admin → backend_ops should be blocked
    it('should block last Admin downgrade to backend_ops (TS-F008-014)', async () => {
      userRepository.findOne.mockResolvedValueOnce({ ...adminAccount });
      userRepository.count.mockResolvedValueOnce(1);

      await expect(
        service.changeRole('admin-uuid-1', 'backend_ops'),
      ).rejects.toThrow(UnprocessableEntityException);
      expect(userRepository.save).not.toHaveBeenCalled();
    });

    // TS-F008-016: Idempotent — business role same value
    it('should handle idempotent business role change (TS-F008-016)', async () => {
      const analystUser = { ...userAccount, role: 'analyst' as const };
      userRepository.findOne.mockResolvedValueOnce({ ...analystUser });

      const result = await service.changeRole('user-uuid-1', 'analyst');
      expect(result.role).toBe('analyst');
      expect(userRepository.save).not.toHaveBeenCalled();
    });
  });
});
