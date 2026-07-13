import { Injectable, BadRequestException, ConflictException, GoneException, HttpException, HttpStatus, NotFoundException, UnprocessableEntityException } from '@nestjs/common';
import { InjectRepository, InjectDataSource } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { User } from '@/database/entities/user.entity';
import { AssignmentAuditLog } from '@/database/entities/assignment-audit-log.entity';
import { HashUtil } from '@/common/hash/hash.util';
import { ERROR_CODES, ERROR_MESSAGES } from '@/common/errors/error-codes';
import type { UserRole } from '@/common/constants/roles';
import { CreateAccountDto } from './dto/create-account.dto';
import { UpdateAccountDto } from './dto/update-account.dto';
import { ListAccountsQueryDto } from './dto/list-accounts-query.dto';

// F006a / AD-E07 v3.0：所有 accounts response 同時暴露 business_role 與 is_sales_manager；
// is_sales_manager 由 business_role !== null 推導，作為過渡期向下相容（待 FE 全面遷移後可移除）。
export type BusinessRole = 'director' | 'section_chief' | null;

export interface CreateAccountResult {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  is_sales_manager: boolean;
  business_role: BusinessRole;
  // F113 / AD-E02-5 §3.4：員工編號回應曝露（有值時唯一，nullable）
  employee_no: string | null;
  status: 'active' | 'disabled';
  created_at: Date;
}

export interface UpdateAccountResult {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  is_sales_manager: boolean;
  business_role: BusinessRole;
  // F113 / AD-E02-5 §3.4：員工編號回應曝露
  employee_no: string | null;
  status: 'active' | 'disabled';
  created_at: Date;
  updated_at: Date;
}

export interface AccountListItem {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  is_sales_manager: boolean;
  business_role: BusinessRole;
  // F113 / AD-E02-5 §3.4 / AC-14：員工編號清單顯示欄
  employee_no: string | null;
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
  is_sales_manager: boolean;
  business_role: BusinessRole;
  status: 'active' | 'disabled';
  updated_at: Date;
}

export interface UpdateSalesManagerFlagResult {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  is_sales_manager: boolean;
  business_role: BusinessRole;
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
  is_sales_manager: boolean;
  business_role: BusinessRole;
  status: 'active' | 'disabled';
  updated_at: Date;
}

export interface UpdateBusinessRoleResult {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  business_role: BusinessRole;
  status: 'active' | 'disabled';
  password_changed_at: Date | null;
  created_at: Date;
  updated_at: Date;
}

function toBusinessRole(value: unknown): BusinessRole {
  if (value === 'director' || value === 'section_chief') return value;
  return null;
}

@Injectable()
export class AccountsService {
  constructor(
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
    // F006a v1.0 / 2026-05-16：updateBusinessRole 同 transaction 寫 audit log
    // P0 P1 過渡期 dataSource 為 optional：未注入時表 legacy module 尚未升級，
    // 仍可由舊功能 Repository<User> 走原路徑
    @InjectDataSource()
    private readonly dataSource: DataSource,
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
        // F004/F006/F008 v3.2: 列表頁需顯示 is_sales_manager chip 徽章（DEPRECATED）
        'user.is_sales_manager',
        // F006a / AD-E07 v3.0：4 角色 column 顯示依據
        'user.business_role',
        // F113 AC-14：員工編號清單顯示欄
        'user.employee_no',
      ]);

    if (query.search) {
      const searchTerm = `%${query.search.toLowerCase()}%`;
      qb.andWhere(
        // F113 AC-15：LOWER(...) 兩側皆先轉小寫，達成大小寫不敏感、部分匹配——與 collation
        // 無關（LOWER() 之行為不受欄位定序影響），與登入之精確比對為刻意不同的獨立機制。
        // NULL employee_no 於 LOWER(NULL) LIKE 恆為假，自然不匹配，無需額外守門。
        '(LOWER(user.name) LIKE :search OR LOWER(user.email) LIKE :search OR LOWER(user.employee_no) LIKE :search)',
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
        is_sales_manager: user.is_sales_manager ?? false,
        business_role: toBusinessRole(user.business_role),
        employee_no: user.employee_no ?? null,
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

    // F113 §7.1 / 軌道 A：email 唯一性檢查之後、儲存之前，新增 employee_no 重複檢查（僅值非 null 時）。
    // Transform 已將空字串/純空白正規化為 undefined → 此處 ?? null 統一收斂為 null。
    const employeeNo = dto.employeeNo ?? null;
    if (employeeNo !== null) {
      const existingEmployeeNo = await this.userRepository.findOne({
        where: { employee_no: employeeNo },
      });
      if (existingEmployeeNo) {
        throw new ConflictException({
          error: ERROR_CODES.ACCOUNT_EMPLOYEE_NO_EXISTS,
          message: ERROR_MESSAGES.ACCOUNT_EMPLOYEE_NO_EXISTS,
        });
      }
    }

    // Hash password
    const passwordHash = await HashUtil.hash(dto.password);

    // F004 AC-7 / BR-9: Admin 角色強制忽略 isSalesManager (寫入 false)；
    // 僅在 role='user' 時採用傳入值（預設 false）
    const isSalesManager = dto.role === 'user' ? (dto.isSalesManager ?? false) : false;

    // Create and save user
    const user = this.userRepository.create({
      name: dto.name,
      email,
      password_hash: passwordHash,
      role: dto.role,
      status: 'active',
      is_sales_manager: isSalesManager,
      employee_no: employeeNo,
    });

    const saved = await this.userRepository.save(user);

    return {
      id: saved.id,
      name: saved.name,
      email: saved.email,
      role: saved.role,
      is_sales_manager: saved.is_sales_manager ?? false,
      business_role: toBusinessRole(saved.business_role),
      employee_no: saved.employee_no ?? null,
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

    // F113 §7.2 / 軌道 A：email 唯一性檢查後，新增 employee_no 唯一性檢查（排除自身，BR-3 同構）。
    const employeeNo = dto.employeeNo ?? null;
    if (employeeNo !== null) {
      const existingEmployeeNo = await this.userRepository.findOne({
        where: { employee_no: employeeNo },
      });
      if (existingEmployeeNo && existingEmployeeNo.id !== id) {
        throw new ConflictException({
          error: ERROR_CODES.ACCOUNT_EMPLOYEE_NO_EXISTS,
          message: ERROR_MESSAGES.ACCOUNT_EMPLOYEE_NO_EXISTS,
        });
      }
    }

    // Update fields (F006 BR-1 擴充：姓名、Email 與員工編號)
    // F006 BR-6: is_sales_manager 不在此功能範圍，DTO 已透過 whitelist 阻擋；
    // service 也僅更新 name/email/employee_no，is_sales_manager 不動。
    user.name = dto.name;
    user.email = email;
    // F113 AC-4 / FMT-6：可設值/變更/清空為 null（PUT 全量替換語意）
    user.employee_no = employeeNo;

    const saved = await this.userRepository.save(user);

    return {
      id: saved.id,
      name: saved.name,
      email: saved.email,
      role: saved.role,
      is_sales_manager: saved.is_sales_manager ?? false,
      business_role: toBusinessRole(saved.business_role),
      employee_no: saved.employee_no ?? null,
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
      is_sales_manager: saved.is_sales_manager ?? false,
      business_role: toBusinessRole(saved.business_role),
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
        // F008 v3.2 BR-8 / TS-F008-SM-009: 角色變更不影響 is_sales_manager
        is_sales_manager: user.is_sales_manager ?? false,
        business_role: toBusinessRole(user.business_role),
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
    // F008 v3.2 AC-10 / BR-8: is_sales_manager 不因角色變更而被清除
    // （升 admin 時 DB 保留原值，再降回 user 時旗標仍維持原值）
    user.role = role;
    const saved = await this.userRepository.save(user);

    return {
      id: saved.id,
      name: saved.name,
      email: saved.email,
      role: saved.role,
      is_sales_manager: saved.is_sales_manager ?? false,
      business_role: toBusinessRole(saved.business_role),
      status: saved.status,
      updated_at: saved.updated_at,
    };
  }

  // F008 v3.2 AC-8 / AC-9 / BR-9 / BR-10:
  // PATCH /api/accounts/:id/sales-manager-flag
  // - 僅可對 role=user 帳號操作；admin 拒絕 ACCOUNT_FLAG_NOT_APPLICABLE
  // - 冪等：同值亦回傳 200
  async updateSalesManagerFlag(
    id: string,
    isSalesManager: boolean,
  ): Promise<UpdateSalesManagerFlagResult> {
    const user = await this.userRepository.findOne({ where: { id } });
    if (!user) {
      throw new NotFoundException({
        error: ERROR_CODES.ACCOUNT_NOT_FOUND,
        message: ERROR_MESSAGES.ACCOUNT_NOT_FOUND,
      });
    }

    // AC-9 / BR-9: Admin 帳號不適用業務主管旗標，回 400
    if (user.role !== 'user') {
      throw new BadRequestException({
        error: ERROR_CODES.ACCOUNT_FLAG_NOT_APPLICABLE,
        message: ERROR_MESSAGES.ACCOUNT_FLAG_NOT_APPLICABLE,
      });
    }

    // 更新旗標（冪等：相同值亦寫入並回 200）
    user.is_sales_manager = isSalesManager;
    const saved = await this.userRepository.save(user);

    return {
      id: saved.id,
      name: saved.name,
      email: saved.email,
      role: saved.role,
      is_sales_manager: saved.is_sales_manager ?? false,
      business_role: toBusinessRole(saved.business_role),
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

  /**
   * F006a v1.0 / AD-E07 v3.0 / 2026-05-16
   * PATCH /api/v1/accounts/:id/business-role
   *
   * 同一 DB transaction 內：
   *   1) findOne(target) → 不存在拋 404 ACCOUNT_NOT_FOUND
   *   2) UPDATE users.business_role = newRole + password_changed_at = now + 1000ms
   *   3) INSERT assignment_audit_log（action = ASSIGN_ROLE / REVOKE_ROLE）
   *
   * BR-1：唯一 business_role 寫入入口
   * BR-3：caller 由 RolesGuard @Roles('admin') 強制 admin（service 層不重複檢查）
   * BR-4：token revoke via password_changed_at（沿用 F009 / F010 機制）
   * BR-5：稽核寫入 entity_id = `{userId}|{role}`
   * BR-6：覆寫 / 撤銷皆走本端點
   * BR-7：Admin 自身亦允許寫入（不阻擋）
   */
  async updateBusinessRole(
    targetId: string,
    newRole: BusinessRole,
    actorId: string,
  ): Promise<UpdateBusinessRoleResult> {
    return this.dataSource.transaction(async (mgr) => {
      const user = await mgr.findOne(User, { where: { id: targetId } });
      if (!user) {
        throw new NotFoundException({
          error: ERROR_CODES.ACCOUNT_NOT_FOUND,
          message: ERROR_MESSAGES.ACCOUNT_NOT_FOUND,
        });
      }

      const oldRole = (user.business_role ?? null) as BusinessRole;
      const passwordChangedAt = new Date(Date.now() + 1000);

      // UPDATE users (single statement: business_role + password_changed_at + updated_at)
      await mgr.update(
        User,
        { id: targetId },
        {
          business_role: newRole,
          password_changed_at: passwordChangedAt,
        },
      );

      // INSERT assignment_audit_log
      // F006a §9：entity_id 撤銷時 {newRole} 為原舊 role；指派時為新 role
      const action: 'ASSIGN_ROLE' | 'REVOKE_ROLE' =
        newRole === null ? 'REVOKE_ROLE' : 'ASSIGN_ROLE';
      const entityIdSuffix = newRole === null ? oldRole : newRole;

      await mgr.insert(AssignmentAuditLog, {
        action,
        entity_type: 'business_role',
        entity_id: `${targetId}|${entityIdSuffix ?? ''}`,
        actor_id: actorId,
        actor_name: actorId,
        before_value: { business_role: oldRole },
        after_value: { business_role: newRole },
      } as any);

      // 回傳更新後物件（合併本地變更，避免再讀一次 DB）
      const updated = {
        ...user,
        business_role: newRole,
        password_changed_at: passwordChangedAt,
      };

      return {
        id: updated.id,
        name: updated.name,
        email: updated.email,
        role: updated.role,
        business_role: updated.business_role,
        status: updated.status,
        password_changed_at: updated.password_changed_at,
        created_at: updated.created_at,
        updated_at: updated.updated_at,
      };
    });
  }
}
