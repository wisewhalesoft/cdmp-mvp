import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, EntityManager, Not, Repository } from 'typeorm';
import { PooldataFieldWhitelist } from '@/database/entities/pooldata-field-whitelist.entity';
import { PooldataFieldOption } from '@/database/entities/pooldata-field-option.entity';
import { AssignmentAuditLog } from '@/database/entities/assignment-audit-log.entity';
import { User } from '@/database/entities/user.entity';
import { ERROR_CODES, ERROR_MESSAGES } from '@/common/errors/error-codes';

/**
 * F075 v1.3 / P1 B5：POOLDATA 篩選欄位白名單 CRUD Service
 *
 * 設計重點（依 spec F075 §5 / §6 / BR-7）：
 *   - 軟刪除（is_active=false），不支援 hard delete（BR-3）
 *   - column_name 唯一性以 DB UNIQUE（PK）保證；衝突 → 409 POOLDATA_FIELD_DUPLICATE
 *   - field_type 由 categorical 切離 → 同 transaction 批次軟停用 pooldata_field_option
 *     （BR-7 / F076-C 落地：SET is_active=false + deactivation_reason='field_type_changed'）
 *   - 稽核：assignment_audit_log（entity_type='pooldata_field_whitelist'），失敗不 rollback（BR-8）
 *
 * audit log action 統一用 'UPDATE'（依使用者指示，因 AssignmentAuditLog union 不含 DISABLE/ENABLE）；
 *   actor 操作意圖（disable / enable）透過 before_value / after_value 的 is_active 對比可還原。
 */

export interface ActorContext {
  userId: string;
  ipAddress?: string | null;
}

export interface PooldataFieldItem {
  columnName: string;
  displayName: string;
  fieldType: 'numeric' | 'categorical' | 'date';
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface ListPooldataFieldsResult {
  fields: PooldataFieldItem[];
}

export interface CreatePooldataFieldInput {
  columnName: string;
  displayName: string;
  fieldType: 'numeric' | 'categorical' | 'date';
}

export interface UpdatePooldataFieldInput {
  displayName?: string;
  fieldType?: 'numeric' | 'categorical' | 'date';
  isActive?: boolean;
}

export interface DisablePooldataFieldResult {
  columnName: string;
  isActive: false;
  disabledAt: string;
}

export interface UpdatePooldataFieldResult extends PooldataFieldItem {
  deactivatedOptionCount?: number;
}

// F075 v1.4：available-columns 端點之 response 型別
export interface AvailableColumnItem {
  columnName: string;
  dataType: string;
  suggestedFieldType: 'numeric' | 'categorical' | 'date';
}

export interface GetAvailableColumnsResult {
  availableColumns: AvailableColumnItem[];
}

// F075 v1.4 / _inferSuggestedFieldType 推斷規則（spec §5.5 / BR-12）
//
// NOTE: PostgreSQL DECIMAL 在 information_schema.columns.data_type 實際回傳 'numeric'（已涵蓋於 NUMERIC_SET）；
//       'decimal' 字串不會出現在生產 information_schema 結果
const NUMERIC_SET = new Set<string>([
  'numeric',
  'integer',
  'bigint',
  'double precision',
  'real',
]);

// DATE_SET：PostgreSQL information_schema 對應日期 / 時間型別之實際回傳值（含完整名稱）
const DATE_SET = new Set<string>([
  'date',
  'timestamp',
  'timestamp without time zone',
  'timestamp with time zone',
  'timestamptz',
]);

@Injectable()
export class PooldataFieldWhitelistService {
  constructor(
    @InjectRepository(PooldataFieldWhitelist)
    private readonly fieldRepo: Repository<PooldataFieldWhitelist>,
    @InjectRepository(PooldataFieldOption)
    private readonly optionRepo: Repository<PooldataFieldOption>,
    @InjectRepository(AssignmentAuditLog)
    private readonly auditRepo: Repository<AssignmentAuditLog>,
    @InjectRepository(User)
    private readonly userRepo: Repository<User>,
    private readonly dataSource: DataSource,
  ) {}

  // ========================
  // F075 §5.1 — GET /pooldata-fields
  // ========================

  async listFields(query: { active?: 'true' | 'false' } = {}): Promise<ListPooldataFieldsResult> {
    const where: Record<string, unknown> = {};
    if (query.active === 'true') where.is_active = true;
    if (query.active === 'false') where.is_active = false;

    const rows = await this.fieldRepo.find({
      where,
      order: { column_name: 'ASC' },
    });

    return { fields: rows.map((r) => this._toItem(r)) };
  }

  // ========================
  // F075 §5.1 — GET /pooldata-fields/:columnName（單筆，內部用）
  // ========================

  async findOneOrFail(columnName: string): Promise<PooldataFieldWhitelist> {
    const row = await this.fieldRepo.findOne({ where: { column_name: columnName } });
    if (!row) {
      throw new NotFoundException({
        error: ERROR_CODES.POOLDATA_FIELD_NOT_FOUND,
        message: ERROR_MESSAGES.POOLDATA_FIELD_NOT_FOUND,
      });
    }
    return row;
  }

  // ========================
  // F075 §5.2 — POST /pooldata-fields
  // ========================

  async createField(
    input: CreatePooldataFieldInput,
    actor: ActorContext,
  ): Promise<PooldataFieldItem> {
    // AC-5：唯一性 — 含啟用 / 停用皆視為衝突
    const existing = await this.fieldRepo.findOne({
      where: { column_name: input.columnName },
    });
    if (existing) {
      throw new ConflictException({
        error: ERROR_CODES.POOLDATA_FIELD_DUPLICATE,
        message: ERROR_MESSAGES.POOLDATA_FIELD_DUPLICATE,
      });
    }

    const now = new Date();
    const row = this.fieldRepo.create({
      column_name: input.columnName,
      display_name: input.displayName,
      field_type: input.fieldType,
      is_active: true,
      created_at: now,
      updated_at: now,
    });
    const saved = await this.fieldRepo.save(row);

    await this._writeAudit(actor, 'CREATE', saved.column_name, null, this._toItem(saved));

    return this._toItem(saved);
  }

  // ========================
  // F075 §5.3 — PATCH /pooldata-fields/:columnName
  // ========================

  /**
   * 變更 displayName / fieldType / isActive（合一）；
   * 若 fieldType 從 categorical 切離 → 同 transaction 批次軟停用對應 options。
   *
   * @returns 更新後的 field item；含 deactivatedOptionCount 提供前端 toast 顯示
   */
  async updateField(
    columnName: string,
    input: UpdatePooldataFieldInput,
    actor: ActorContext,
  ): Promise<UpdatePooldataFieldResult> {
    const before = await this.findOneOrFail(columnName);

    const beforeSnapshot = this._toItem(before);
    const wasCategorical = before.field_type === 'categorical';
    const willBeCategorical = input.fieldType
      ? input.fieldType === 'categorical'
      : wasCategorical;
    const triggerSoftDeactivate = wasCategorical && !willBeCategorical;

    let deactivatedOptionCount = 0;
    const after = await this.dataSource.transaction(async (manager: EntityManager) => {
      // 1) 更新 field 本體
      if (input.displayName !== undefined) before.display_name = input.displayName;
      if (input.fieldType !== undefined) before.field_type = input.fieldType;
      if (input.isActive !== undefined) before.is_active = input.isActive;
      before.updated_at = new Date();

      const updated = await manager.save(PooldataFieldWhitelist, before);

      // 2) F076-C 軟停用級聯（BR-7 / 同 tx）
      if (triggerSoftDeactivate) {
        const result = await manager
          .createQueryBuilder()
          .update(PooldataFieldOption)
          .set({
            is_active: false,
            deactivation_reason: 'field_type_changed',
            updated_at: new Date(),
          })
          .where('column_name = :columnName', { columnName })
          .andWhere('is_active = :active', { active: true })
          .execute();

        deactivatedOptionCount = result.affected ?? 0;
      }

      return updated;
    });

    // 3) 稽核（spec L119：UPDATE + details 含 deactivatedOptionCount）
    await this._writeAudit(
      actor,
      'UPDATE',
      columnName,
      beforeSnapshot,
      {
        ...this._toItem(after),
        deactivatedOptionCount,
      },
    );

    return {
      ...this._toItem(after),
      deactivatedOptionCount,
    };
  }

  // ========================
  // F075 §5.4 — DELETE /pooldata-fields/:columnName（軟刪除）
  // ========================

  async disableField(
    columnName: string,
    actor: ActorContext,
  ): Promise<DisablePooldataFieldResult> {
    const before = await this.findOneOrFail(columnName);
    const beforeSnapshot = this._toItem(before);

    before.is_active = false;
    before.updated_at = new Date();
    const updated = await this.fieldRepo.save(before);

    await this._writeAudit(
      actor,
      'UPDATE',
      columnName,
      beforeSnapshot,
      this._toItem(updated),
    );

    return {
      columnName: updated.column_name,
      isActive: false,
      disabledAt: updated.updated_at.toISOString(),
    };
  }

  // ========================
  // F076 BR-2：categorical 守門（供 PooldataFieldOptionService 復用）
  // ========================

  /**
   * 載入 categorical 欄位；非 categorical 或不存在 → 對應錯誤。
   *
   * 用於 F076 endpoints 入口：GET / POST / PATCH 可選值前須先校驗。
   */
  async assertCategorical(columnName: string): Promise<PooldataFieldWhitelist> {
    const row = await this.findOneOrFail(columnName);
    if (row.field_type !== 'categorical') {
      throw new BadRequestException({
        error: ERROR_CODES.POOLDATA_OPTION_FIELD_TYPE_INVALID,
        message: ERROR_MESSAGES.POOLDATA_OPTION_FIELD_TYPE_INVALID,
      });
    }
    return row;
  }

  // ========================
  // F075 v1.3 / UI 預查：取得 categorical 欄位啟用可選值數量（confirm Modal 顯示 N）
  // ========================

  async getInactiveCount(columnName: string): Promise<{ activeCount: number }> {
    const count = await this.optionRepo.count({
      where: { column_name: columnName, is_active: true },
    });
    return { activeCount: count };
  }

  // ========================
  // F075 v1.4 §5.5 — GET /pooldata-fields/available-columns
  // ========================

  /**
   * 取得 OBPOOLDATA 既有但尚未列入白名單之欄位清單（供新增 Modal dropdown 使用）。
   *
   * 設計重點（architecture-spec v2.12 §3.10）：
   *   - 以 `dataSource.query()` raw SQL 查詢 `information_schema.columns`
   *   - 子查詢排除**所有** `pooldata_field_whitelist.column_name`（含 `is_active=false`，BR-13）
   *   - 按 `column_name` 字母升冪排序（AC-10）
   *   - `_inferSuggestedFieldType` 為 service 層 pure function，不使用 SQL CASE
   *   - 不快取（information_schema catalog 查詢成本可忽略）
   *
   * SQLite test 環境 / `ob_pool_data` 不存在 → 回 `{ availableColumns: [] }`（合法空陣列，
   * 對齊 architecture-spec v2.12 §3.10 第 5 點與 B-i 策略決議）。
   */
  async getAvailableColumns(): Promise<GetAvailableColumnsResult> {
    try {
      const rows: Array<{ column_name: string | null; data_type: string | null }> =
        await this.dataSource.query(
          `SELECT c.column_name, c.data_type
             FROM information_schema.columns c
            WHERE c.table_schema = 'public'
              AND c.table_name = 'ob_pool_data'
              AND c.column_name NOT IN (
                SELECT w.column_name FROM pooldata_field_whitelist w
              )
            ORDER BY c.column_name ASC`,
        );

      const items: AvailableColumnItem[] = rows
        .filter((r) => r.column_name !== null && r.column_name !== undefined)
        .map((r) => ({
          columnName: r.column_name as string,
          dataType: r.data_type ?? '',
          suggestedFieldType: this._inferSuggestedFieldType(r.data_type),
        }));

      // 雙重保險：即使 SQL 已 ORDER BY，service 層仍確保字母升冪輸出（防 DB collation 差異）
      items.sort((a, b) => a.columnName.localeCompare(b.columnName));

      return { availableColumns: items };
    } catch {
      // SQLite test env（無 information_schema）或 ob_pool_data 不存在 → 合法空陣列
      // 對齊 architecture-spec v2.12 §3.10 第 5 點 + B-i 策略決議
      return { availableColumns: [] };
    }
  }

  /**
   * 推斷 PostgreSQL information_schema `data_type` 對應之 `suggestedFieldType`（AC-12 / BR-12）。
   *
   * NOTE: PostgreSQL DECIMAL 在 information_schema.columns.data_type 實際回傳 'numeric'（已涵蓋於 NUMERIC_SET）；
   *       'decimal' 字串不會出現在生產 information_schema 結果。若日後需特殊映射 'decimal' → 'numeric'，
   *       須同步更新 spec §5.5 並調整 NUMERIC_SET。
   */
  private _inferSuggestedFieldType(
    dataType: string | null | undefined,
  ): 'numeric' | 'categorical' | 'date' {
    if (dataType === null || dataType === undefined) return 'categorical';
    if (NUMERIC_SET.has(dataType)) return 'numeric';
    if (DATE_SET.has(dataType)) return 'date';
    return 'categorical'; // 保守原則：字串型 / 未識別 / boolean / 其他 → categorical
  }

  // ========================
  // 內部 helper
  // ========================

  private _toItem(row: PooldataFieldWhitelist): PooldataFieldItem {
    return {
      columnName: row.column_name,
      displayName: row.display_name,
      fieldType: row.field_type,
      isActive: row.is_active,
      createdAt: row.created_at.toISOString(),
      updatedAt: row.updated_at.toISOString(),
    };
  }

  private async _writeAudit(
    actor: ActorContext,
    action: 'CREATE' | 'UPDATE',
    entityId: string,
    beforeValue: Record<string, unknown> | PooldataFieldItem | null,
    afterValue: Record<string, unknown> | PooldataFieldItem | null,
  ): Promise<void> {
    try {
      const actorName = await this._resolveActorName(actor.userId);
      const log = this.auditRepo.create({
        entity_type: 'pooldata_field_whitelist',
        entity_id: entityId,
        action,
        actor_id: actor.userId,
        actor_name: actorName,
        before_value: beforeValue as Record<string, unknown> | null,
        after_value: afterValue as Record<string, unknown> | null,
        ip_address: actor.ipAddress ?? null,
      });
      await this.auditRepo.save(log);
    } catch (_err) {
      // BR-8：稽核失敗不 rollback；僅吞錯（架構決議沿用 F050 v2.0）
    }
  }

  private async _resolveActorName(userId: string): Promise<string> {
    const user = await this.userRepo.findOne({
      where: { id: userId },
      select: ['id', 'name'],
    });
    return user?.name ?? 'unknown';
  }
}
