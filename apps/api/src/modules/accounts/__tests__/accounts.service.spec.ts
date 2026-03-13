import { describe, it, expect, beforeEach, vi } from 'vitest';
import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { ConflictException, UnprocessableEntityException } from '@nestjs/common';
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
});
