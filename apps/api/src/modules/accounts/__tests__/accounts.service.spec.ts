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
  };

  beforeEach(async () => {
    userRepository = {
      findOne: vi.fn(),
      create: vi.fn((data) => ({ ...data, id: 'new-uuid', created_at: new Date() })),
      save: vi.fn((entity) => Promise.resolve(entity)),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AccountsService,
        { provide: getRepositoryToken(User), useValue: userRepository },
      ],
    }).compile();

    service = module.get<AccountsService>(AccountsService);
  });

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
    // Verify it's a valid bcrypt hash
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
        .mockResolvedValueOnce({ ...existingUser }) // findOne by id
        .mockResolvedValueOnce(null); // findOne by email (no duplicate)
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
        .mockResolvedValueOnce({ ...existingUser }) // findOne by id
        .mockResolvedValueOnce(null); // findOne by email (no duplicate)
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
      // findOne by id returns the user
      userRepository.findOne
        .mockResolvedValueOnce({ ...existingUser })
        // findOne by email returns the same user (self)
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
      const anotherUser = {
        id: 'other-uuid-2',
        email: 'taken@example.com',
      };
      userRepository.findOne
        .mockResolvedValueOnce({ ...existingUser }) // findOne by id
        .mockResolvedValueOnce(anotherUser); // findOne by email (duplicate)

      await expect(
        service.updateAccount('user-uuid-1', {
          name: 'Original Name',
          email: 'taken@example.com',
        }),
      ).rejects.toThrow(ConflictException);
    });

    it('should throw 404 NotFoundException when account does not exist', async () => {
      userRepository.findOne.mockResolvedValueOnce(null); // findOne by id

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
      expect(result.name).toBe('Test User');
      expect(result.email).toBe('test@example.com');
      expect(result.role).toBe('user');
      expect(result).toHaveProperty('updated_at');
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
      expect(result.id).toBe('user-uuid-1');
      expect(result).not.toHaveProperty('password_hash');
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
      expect(result.id).toBe('user-uuid-1');
    });
  });
});
