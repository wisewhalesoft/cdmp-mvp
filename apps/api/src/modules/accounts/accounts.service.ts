import { Injectable, ConflictException, NotFoundException, UnprocessableEntityException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { User } from '@/database/entities/user.entity';
import { HashUtil } from '@/common/hash/hash.util';
import { ERROR_CODES, ERROR_MESSAGES } from '@/common/errors/error-codes';
import type { UserRole } from '@/common/constants/roles';
import { CreateAccountDto } from './dto/create-account.dto';
import { UpdateAccountDto } from './dto/update-account.dto';
import { ListAccountsQueryDto } from './dto/list-accounts-query.dto';

export interface CreateAccountResult {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  status: 'active' | 'disabled';
  created_at: Date;
}

export interface UpdateAccountResult {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  status: 'active' | 'disabled';
  created_at: Date;
  updated_at: Date;
}

export interface AccountListItem {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  status: 'active' | 'disabled';
  created_at: Date;
}

export interface AccountListResult {
  data: AccountListItem[];
  total: number;
  page: number;
  limit: number;
}

export interface ChangeRoleResult {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  status: 'active' | 'disabled';
  updated_at: Date;
}

export interface AdminResetPasswordResult {
  message: string;
}

export interface ToggleStatusResult {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  status: 'active' | 'disabled';
  updated_at: Date;
}

@Injectable()
export class AccountsService {
  constructor(
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
  ) {}

  async findAll(query: ListAccountsQueryDto): Promise<AccountListResult> {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;

    const qb = this.userRepository
      .createQueryBuilder('user')
      .select([
        'user.id',
        'user.name',
        'user.email',
        'user.role',
        'user.status',
        'user.created_at',
      ]);

    if (query.search) {
      const searchTerm = `%${query.search.toLowerCase()}%`;
      qb.andWhere(
        '(LOWER(user.name) LIKE :search OR LOWER(user.email) LIKE :search)',
        { search: searchTerm },
      );
    }

    if (query.role) {
      qb.andWhere('user.role = :role', { role: query.role });
    }

    if (query.status) {
      qb.andWhere('user.status = :status', { status: query.status });
    }

    qb.orderBy('user.created_at', 'DESC');
    qb.skip((page - 1) * limit);
    qb.take(limit);

    const [data, total] = await qb.getManyAndCount();

    return {
      data: data.map((user) => ({
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
        status: user.status,
        created_at: user.created_at,
      })),
      total,
      page,
      limit,
    };
  }

  async createAccount(dto: CreateAccountDto): Promise<CreateAccountResult> {
    const email = dto.email.toLowerCase();

    // Check for duplicate email
    const existing = await this.userRepository.findOne({ where: { email } });
    if (existing) {
      throw new ConflictException({
        error: ERROR_CODES.ACCOUNT_EMAIL_EXISTS,
        message: ERROR_MESSAGES.ACCOUNT_EMAIL_EXISTS,
      });
    }

    // Hash password
    const passwordHash = await HashUtil.hash(dto.password);

    // Create and save user
    const user = this.userRepository.create({
      name: dto.name,
      email,
      password_hash: passwordHash,
      role: dto.role,
      status: 'active',
    });

    const saved = await this.userRepository.save(user);

    return {
      id: saved.id,
      name: saved.name,
      email: saved.email,
      role: saved.role,
      status: saved.status,
      created_at: saved.created_at,
    };
  }

  async updateAccount(id: string, dto: UpdateAccountDto): Promise<UpdateAccountResult> {
    // Find the account
    const user = await this.userRepository.findOne({ where: { id } });
    if (!user) {
      throw new NotFoundException({
        error: ERROR_CODES.ACCOUNT_NOT_FOUND,
        message: ERROR_MESSAGES.ACCOUNT_NOT_FOUND,
      });
    }

    const email = dto.email.toLowerCase();

    // Check email uniqueness (exclude self — BR-3)
    const existing = await this.userRepository.findOne({ where: { email } });
    if (existing && existing.id !== id) {
      throw new ConflictException({
        error: ERROR_CODES.ACCOUNT_EMAIL_IN_USE,
        message: ERROR_MESSAGES.ACCOUNT_EMAIL_IN_USE,
      });
    }

    // Update fields
    user.name = dto.name;
    user.email = email;

    const saved = await this.userRepository.save(user);

    return {
      id: saved.id,
      name: saved.name,
      email: saved.email,
      role: saved.role,
      status: saved.status,
      created_at: saved.created_at,
      updated_at: saved.updated_at,
    };
  }

  async toggleStatus(
    id: string,
    status: 'active' | 'disabled',
    currentUserId: string,
  ): Promise<ToggleStatusResult> {
    // Self-disable check (before DB lookup)
    if (status === 'disabled' && id === currentUserId) {
      throw new UnprocessableEntityException({
        error: ERROR_CODES.ACCOUNT_SELF_DISABLE,
        message: ERROR_MESSAGES.ACCOUNT_SELF_DISABLE,
      });
    }

    // Find the account
    const user = await this.userRepository.findOne({ where: { id } });
    if (!user) {
      throw new NotFoundException({
        error: ERROR_CODES.ACCOUNT_NOT_FOUND,
        message: ERROR_MESSAGES.ACCOUNT_NOT_FOUND,
      });
    }

    // Update status
    user.status = status;
    const saved = await this.userRepository.save(user);

    return {
      id: saved.id,
      name: saved.name,
      email: saved.email,
      role: saved.role,
      status: saved.status,
      updated_at: saved.updated_at,
    };
  }

  async changeRole(
    id: string,
    role: UserRole,
  ): Promise<ChangeRoleResult> {
    // Find the account
    const user = await this.userRepository.findOne({ where: { id } });
    if (!user) {
      throw new NotFoundException({
        error: ERROR_CODES.ACCOUNT_NOT_FOUND,
        message: ERROR_MESSAGES.ACCOUNT_NOT_FOUND,
      });
    }

    // Idempotent: same role → return immediately without admin count check
    if (user.role === role) {
      return {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
        status: user.status,
        updated_at: user.updated_at,
      };
    }

    // Last Admin protection: when downgrading admin → any non-admin role
    if (user.role === 'admin' && role !== 'admin') {
      const adminCount = await this.userRepository.count({ where: { role: 'admin' } });
      if (adminCount <= 1) {
        throw new UnprocessableEntityException({
          error: ERROR_CODES.ACCOUNT_LAST_ADMIN,
          message: ERROR_MESSAGES.ACCOUNT_LAST_ADMIN,
        });
      }
    }

    // Update role
    user.role = role;
    const saved = await this.userRepository.save(user);

    return {
      id: saved.id,
      name: saved.name,
      email: saved.email,
      role: saved.role,
      status: saved.status,
      updated_at: saved.updated_at,
    };
  }

  // F010: Admin 重設使用者密碼
  async adminResetPassword(
    targetId: string,
    newPassword: string,
    currentUserId: string,
  ): Promise<AdminResetPasswordResult> {
    // BR-2: Admin 不可透過此功能重設自己的密碼
    if (targetId === currentUserId) {
      throw new UnprocessableEntityException({
        error: ERROR_CODES.ACCOUNT_SELF_RESET,
        message: ERROR_MESSAGES.ACCOUNT_SELF_RESET,
      });
    }

    // BR-3: 密碼長度驗證 (defense in depth, DTO 已驗證)
    if (newPassword.length < 8) {
      throw new UnprocessableEntityException({
        error: ERROR_CODES.VALIDATION_PASSWORD_LENGTH,
        message: ERROR_MESSAGES.VALIDATION_PASSWORD_LENGTH,
      });
    }

    // 查詢目標帳號
    const user = await this.userRepository.findOne({ where: { id: targetId } });
    if (!user) {
      throw new NotFoundException({
        error: ERROR_CODES.ACCOUNT_NOT_FOUND,
        message: ERROR_MESSAGES.ACCOUNT_NOT_FOUND,
      });
    }

    // BR-4: bcrypt hash 新密碼
    user.password_hash = await HashUtil.hash(newPassword);

    // BR-5: 設定 password_changed_at 以失效所有舊 Session Token
    // 加 1 秒確保在同一秒內發行的 JWT 也會被失效（沿用 F009 機制）
    user.password_changed_at = new Date(Date.now() + 1000);

    await this.userRepository.save(user);

    return { message: '密碼已重設，使用者需以新密碼重新登入' };
  }
}
