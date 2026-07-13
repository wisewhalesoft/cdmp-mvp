import {
  BadRequestException,
  ConflictException,
  Injectable,
  InternalServerErrorException,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, EntityManager, Not, Repository } from 'typeorm';
import { PooldataFieldWhitelist } from '@/database/entities/pooldata-field-whitelist.entity';
import { PooldataFieldOption } from '@/database/entities/pooldata-field-option.entity';
import { AssignmentAuditLog } from '@/database/entities/assignment-audit-log.entity';
import { User } from '@/database/entities/user.entity';
import { ExtractionTask } from '@/database/entities/extraction-task.entity';
import { ERROR_CODES, ERROR_MESSAGES } from '@/common/errors/error-codes';
import { MSSQLExecutor } from '../../extraction-task/executors/mssql-executor';
import {
  DISTINCT_VALUES_CAP,
  DISTINCT_VALUES_TIMEOUT_MS,
  SAFE_COLUMN_NAME_RE,
} from '../pooldata-field.constants';

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
  // F075 v1.7 / US-144 AC-19：系統固定欄位旗標（best_case=true，其餘=false）
  isSystemFixed: boolean;
  // F109 / US-172 / AC-2：資料來源（'ob_pool_data' 案件資料 / 'customer_core' 客戶資料）
  dataSource: 'ob_pool_data' | 'customer_core';
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
// v1.4.7（AC-16）：補 optional `columnDescription`；無描述 / 取得失敗時整個 key omit（不回 null / 不回空字串）
export interface AvailableColumnItem {
  columnName: string;
  dataType: string;
  suggestedFieldType: 'numeric' | 'categorical' | 'date';
  columnDescription?: string;
}

export interface GetAvailableColumnsResult {
  availableColumns: AvailableColumnItem[];
}

// F112 / AD-E07-47 §3.4：distinct-values 端點回應型別（LOCAL；不進 @cdmp/shared）
export interface DistinctValueItem {
  value: string;
  alreadyOption: boolean;
}

export interface DistinctValuesResult {
  columnName: string;
  dataSource: 'ob_pool_data' | 'customer_core';
  values: DistinctValueItem[];
  totalReturned: number;
  truncated: boolean;
  cap: number;
}

// F075 v1.4 / _inferSuggestedFieldType 推斷規則（spec §5.5 / BR-12）
//
// ⚠️ 全面 PG→MSSQL 遷移後（見 memory project_mssql_full_migration）：INFORMATION_SCHEMA.COLUMNS.DATA_TYPE
//    改回傳 MSSQL 原生型別名（皆小寫），與 PostgreSQL 不同。故 NUMERIC_SET / DATE_SET 須同時涵蓋
//    「PG 生產回傳值」與「MSSQL 生產回傳值」，否則 datetime2 / int 等 MSSQL 欄位會落入 categorical
//    保守 fallback（曾釀「結清日 acc_date / 第一次繳款日 first_pay_dt 被誤判為類別」bug）。
//    比對前一律 toLowerCase() 正規化（見 _inferSuggestedFieldType）。
const NUMERIC_SET = new Set<string>([
  // PostgreSQL information_schema 回傳值
  'numeric',
  'integer',
  'bigint',
  'double precision',
  'real',
  // MSSQL INFORMATION_SCHEMA 回傳值（TypeORM type:'integer'→'int'、type:'numeric'→'numeric'、
  //   dev/legacy 亦可能出現 decimal/float/money 等）
  'int',
  'smallint',
  'tinyint',
  'decimal',
  'float',
  'money',
  'smallmoney',
]);

// DATE_SET：日期 / 時間型別之生產回傳值（PostgreSQL + MSSQL 兩方言）
const DATE_SET = new Set<string>([
  // PostgreSQL information_schema 回傳值
  'date',
  'timestamp',
  'timestamp without time zone',
  'timestamp with time zone',
  'timestamptz',
  // MSSQL INFORMATION_SCHEMA 回傳值（dateColumnType 於 MSSQL = datetime2）
  'datetime',
  'datetime2',
  'smalldatetime',
  'datetimeoffset',
]);

@Injectable()
export class PooldataFieldWhitelistService {
  private readonly logger = new Logger(PooldataFieldWhitelistService.name);

  constructor(
    @InjectRepository(PooldataFieldWhitelist)
    private readonly fieldRepo: Repository<PooldataFieldWhitelist>,
    @InjectRepository(PooldataFieldOption)
    private readonly optionRepo: Repository<PooldataFieldOption>,
    @InjectRepository(AssignmentAuditLog)
    private readonly auditRepo: Repository<AssignmentAuditLog>,
    @InjectRepository(User)
    private readonly userRepo: Repository<User>,
    @InjectRepository(ExtractionTask)
    private readonly extractionTaskRepo: Repository<ExtractionTask>,
    private readonly mssqlExecutor: MSSQLExecutor,
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

    // F075 v1.7 / US-144 AC-6 / §18.12.6：系統固定欄位 deactivation guard。
    //   僅當明確傳入 isActive=false（停用意圖）時攔截；displayName / fieldType 編輯不受影響。
    if (input.isActive === false && before.isSystemFixed) {
      throw new UnprocessableEntityException({
        error: ERROR_CODES.SYSTEM_FIXED_FIELD_CANNOT_DEACTIVATE,
        message: ERROR_MESSAGES.SYSTEM_FIXED_FIELD_CANNOT_DEACTIVATE,
      });
    }

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

    // F075 v1.7 / US-144 AC-6 / §18.12.6：DELETE（停用等效端點）亦受系統固定 guard 保護。
    if (before.isSystemFixed) {
      throw new UnprocessableEntityException({
        error: ERROR_CODES.SYSTEM_FIXED_FIELD_CANNOT_DEACTIVATE,
        message: ERROR_MESSAGES.SYSTEM_FIXED_FIELD_CANNOT_DEACTIVATE,
      });
    }

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
   * 設計重點（architecture-spec v2.12 §3.10 / v1.4.2 D1 設計修補）：
   *   - **兩階段查詢**（v1.4.2）：
   *     - Step 1：查 `information_schema.tables` 確認 `ob_pool_data` 存在；查詢失敗（SQLite
   *       無 information_schema）或回空陣列（PostgreSQL 但表不存在/ETL 未 Load）→ 拋
   *       **503 OBPOOLDATA_NOT_READY**（不再吞錯回空陣列）
   *     - Step 2：NOT IN 子查詢取欄位清單；真實 SQL 錯誤 → 直接拋（由 NestJS exception
   *       filter 攔為 500，避免誤導 UI）
   *   - 子查詢排除**所有** `pooldata_field_whitelist.column_name`（含 `is_active=false`，BR-13）
   *   - 按 `column_name` 字母升冪排序（AC-10）
   *   - `_inferSuggestedFieldType` 為 service 層 pure function，不使用 SQL CASE
   *   - 不快取（information_schema catalog 查詢成本可忽略）
   *
   * v1.4.2 改變理由：原 try/catch 吞錯回空陣列 → UI 一律顯示「全部已列入」誤導訊息（即使
   * 實際是 SQLite 無 information_schema 或表不存在）。D1 設計修補使三種錯誤情境可由
   * 前端依錯誤碼分流顯示對應訊息（FEATURE_NOT_ENABLED / OBPOOLDATA_NOT_READY / 5xx）。
   */
  async getAvailableColumns(): Promise<GetAvailableColumnsResult> {
    // MSSQL 方言：catalog 須大寫 INFORMATION_SCHEMA（BIN collation 大小寫敏感，I-MSSQL-CATALOG-CASE-01）、
    //   schema 為 'dbo'（非 PG 'public'）、`LIMIT`→`TOP`。SQLite test env 無 information_schema → catch。
    const isMssql = this.dataSource.options.type === 'mssql';
    // Step 1：確認 ob_pool_data 表存在（F112 / AD §3.3：重構為共用 `_checkTableExists`，零行為變更）
    if (!(await this._checkTableExists('ob_pool_data'))) {
      throw new ServiceUnavailableException({
        error: ERROR_CODES.OBPOOLDATA_NOT_READY,
        message: ERROR_MESSAGES.OBPOOLDATA_NOT_READY,
      });
    }

    // Step 2：NOT IN 子查詢取欄位清單；真實 SQL 錯誤不再吞，直接由 NestJS exception filter 攔截
    // v1.4.7：與 Step 3（ExtractionTask 查詢）以 Promise.all 平行化（無相依），降低總延遲
    const columnsSql = isMssql
      ? `SELECT c.COLUMN_NAME AS column_name, c.DATA_TYPE AS data_type
           FROM INFORMATION_SCHEMA.COLUMNS c
          WHERE c.TABLE_SCHEMA = 'dbo'
            AND c.TABLE_NAME = 'ob_pool_data'
            AND c.COLUMN_NAME NOT IN (
              SELECT w.column_name FROM pooldata_field_whitelist w
            )
          ORDER BY c.COLUMN_NAME ASC`
      : `SELECT c.column_name, c.data_type
           FROM information_schema.columns c
          WHERE c.table_schema = 'public'
            AND c.table_name = 'ob_pool_data'
            AND c.column_name NOT IN (
              SELECT w.column_name FROM pooldata_field_whitelist w
            )
          ORDER BY c.column_name ASC`;
    const [rows, extractionTask] = await Promise.all([
      this.dataSource.query(columnsSql) as Promise<
        Array<{ column_name: string | null; data_type: string | null }>
      >,
      this.extractionTaskRepo.findOne({
        where: { source_table: 'OBPOOLDATA' },
        order: { created_at: 'DESC' },
      }),
    ]);

    // v1.4.7（AC-16）：序列呼叫 MSSQLExecutor 取 MS_Description map（依賴 ExtractionTask 結果）
    // 三種降級情境（皆 omit columnDescription、整體仍 200 OK）：
    //   1. ExtractionTask 查無 → 不呼叫 executor，descriptionMap = null
    //   2. SQL Server 連線/查詢失敗 → catch 後 descriptionMap = null + logger.warn
    //   3. 該欄位在 sys.extended_properties 無 MS_Description → executor 回 map 但不含該 key
    let descriptionMap: Map<string, string> | null = null;
    if (extractionTask) {
      try {
        descriptionMap = await this.mssqlExecutor.getColumnDescriptions({
          datasourceId: extractionTask.datasource_id,
          sourceSchema: extractionTask.source_schema,
          sourceTable: 'OBPOOLDATA',
        });
      } catch (err) {
        this.logger.warn(
          `[F075 v1.4.7] getColumnDescriptions failed; omitting columnDescription for all columns. err=${
            (err as Error)?.message ?? String(err)
          }`,
        );
        descriptionMap = null;
      }
    } else {
      this.logger.warn(
        `[F075 v1.4.7] no ExtractionTask found for source_table='OBPOOLDATA'; omitting columnDescription for all columns`,
      );
    }

    const items: AvailableColumnItem[] = rows
      .filter((r) => r.column_name !== null && r.column_name !== undefined)
      .map((r) => {
        const columnName = r.column_name as string;
        const desc = descriptionMap?.get(columnName);
        // 用 spread 條件式：desc 為 undefined / null / 空字串時整個 key omit（不回 null、不回空字串）
        return {
          columnName,
          dataType: r.data_type ?? '',
          suggestedFieldType: this._inferSuggestedFieldType(r.data_type),
          ...(desc ? { columnDescription: desc } : {}),
        };
      });

    // 雙重保險：即使 SQL 已 ORDER BY，service 層仍確保字母升冪輸出（防 DB collation 差異）
    items.sort((a, b) => a.columnName.localeCompare(b.columnName));

    return { availableColumns: items };
  }

  /**
   * 推斷 information_schema `data_type` 對應之 `suggestedFieldType`（AC-12 / BR-12）。
   *
   * 同時支援 PostgreSQL 與 MSSQL 兩方言之回傳值（見 NUMERIC_SET / DATE_SET 註解）；
   * 比對前以 toLowerCase() 正規化，避免大小寫差異（MSSQL 內建型別名固定小寫，PG 亦然，
   * 但正規化可防禦任何 driver / collation 差異）。
   */
  private _inferSuggestedFieldType(
    dataType: string | null | undefined,
  ): 'numeric' | 'categorical' | 'date' {
    if (dataType === null || dataType === undefined) return 'categorical';
    const normalized = dataType.toLowerCase();
    if (NUMERIC_SET.has(normalized)) return 'numeric';
    if (DATE_SET.has(normalized)) return 'date';
    return 'categorical'; // 保守原則：字串型 / 未識別 / boolean / bit / 其他 → categorical
  }

  // ============================================================
  // F112 / AD-E07-47 — GET /pooldata-fields/:columnName/distinct-values
  // ============================================================

  /**
   * 查詢某欄位來源表之實際 distinct 值（供兩進入點之核取清單）。
   *
   * 執行順序（AD §3.4；I-DVAL-SAFE-INTERP-01 / I-DVAL-READY-BEFORE-EXIST-01）：
   *   1. `SAFE_COLUMN_NAME_RE` 正則驗證（函式第一行，先於任何 DB 呼叫）→ 400 SOURCE_COLUMN_NAME_INVALID
   *   2. 來源表解析（`_resolveDistinctValueSource`；非 categorical → 400，重用 F076 既有碼）
   *   3. **表就緒檢查先於欄位存在性檢查**（I-DVAL-READY-BEFORE-EXIST-01）：表不存在 → 503
   *      OBPOOLDATA_NOT_READY / CUSTOMER_CORE_NOT_READY
   *   4. 欄位存在性確認（參數化 INFORMATION_SCHEMA.COLUMNS）→ 404 SOURCE_COLUMN_NOT_FOUND
   *   5. alreadyOption 查詢（含 inactive）與 DISTINCT 查詢並行（Promise.all）
   *   6. truncation 判定（> CAP → truncated=true，取前 CAP 筆）
   *
   * @param opts.timeoutMs distinct 查詢之 app-level 逾時（預設 `DISTINCT_VALUES_TIMEOUT_MS`）；
   *   比照既有 `Stage0EstimateService.estimateListCount(listNo, opts)` 之 F049 timeoutMs 注入慣例，
   *   供測試以極小值強制逾時分支。controller 呼叫不帶此參數（用預設）。
   */
  async getDistinctValues(
    columnName: string,
    opts: { timeoutMs?: number } = {},
  ): Promise<DistinctValuesResult> {
    // 1) 欄位名稱安全驗證（第一道防線，先於白名單解析與任何 DB 呼叫；I-DVAL-SAFE-INTERP-01）
    if (!SAFE_COLUMN_NAME_RE.test(columnName)) {
      throw new BadRequestException({
        error: ERROR_CODES.SOURCE_COLUMN_NAME_INVALID,
        message: ERROR_MESSAGES.SOURCE_COLUMN_NAME_INVALID,
      });
    }

    // 2) 來源表解析（白名單 data_source / 進入點 1 固定 ob_pool_data；非 categorical → 400）
    const { table } = await this._resolveDistinctValueSource(columnName);

    // 3) 表就緒檢查優先於欄位存在性檢查（I-DVAL-READY-BEFORE-EXIST-01）
    if (!(await this._checkTableExists(table))) {
      const code =
        table === 'customer_core'
          ? ERROR_CODES.CUSTOMER_CORE_NOT_READY
          : ERROR_CODES.OBPOOLDATA_NOT_READY;
      throw new ServiceUnavailableException({
        error: code,
        message: ERROR_MESSAGES[code],
      });
    }

    // 4) 欄位存在性確認（參數化 INFORMATION_SCHEMA.COLUMNS）
    if (!(await this._checkColumnExists(table, columnName))) {
      throw new NotFoundException({
        error: ERROR_CODES.SOURCE_COLUMN_NOT_FOUND,
        message: ERROR_MESSAGES.SOURCE_COLUMN_NOT_FOUND,
      });
    }

    // 5) alreadyOption 查詢與 DISTINCT 查詢互不相依 → 並行（沿用 getAvailableColumns Promise.all 先例）
    const [existingOptionRows, distinctValues] = await Promise.all([
      this.optionRepo.find({
        where: { column_name: columnName },
        select: ['option_value'],
      }),
      this._queryDistinctWithTimeout(
        table,
        columnName,
        opts.timeoutMs ?? DISTINCT_VALUES_TIMEOUT_MS,
      ),
    ]);

    const existingSet = new Set(existingOptionRows.map((r) => r.option_value));

    // 6) truncation 判定：實際回傳 > CAP → 取前 CAP 筆、totalReturned=CAP、truncated=true
    const truncated = distinctValues.length > DISTINCT_VALUES_CAP;
    const sliced = truncated
      ? distinctValues.slice(0, DISTINCT_VALUES_CAP)
      : distinctValues;

    return {
      columnName,
      dataSource: table,
      values: sliced.map((v) => {
        const asString = String(v);
        return { value: asString, alreadyOption: existingSet.has(asString) };
      }),
      totalReturned: sliced.length,
      truncated,
      cap: DISTINCT_VALUES_CAP,
    };
  }

  /**
   * 來源表解析（AD §3.2 / BR-12）：
   *   - 白名單存在此 columnName（不論 is_active）→ 使用其 data_source；非 categorical → 400（重用 F076 碼）
   *   - 白名單不存在（進入點 1，新增欄位 Modal 選取尚未列入白名單之 ob_pool_data 欄位）→ 固定 ob_pool_data
   *
   * 刻意**不**重用 `assertCategorical()`：其 `findOneOrFail` 對「不存在」拋 404，但進入點 1 需要
   * 「不存在 → 靜默視為 ob_pool_data」，語意不同不可共用（AD §3.2 末段）。
   */
  private async _resolveDistinctValueSource(
    columnName: string,
  ): Promise<{ table: 'ob_pool_data' | 'customer_core' }> {
    const row = await this.fieldRepo.findOne({
      where: { column_name: columnName },
    });
    if (row) {
      if (row.field_type !== 'categorical') {
        throw new BadRequestException({
          error: ERROR_CODES.POOLDATA_OPTION_FIELD_TYPE_INVALID,
          message: ERROR_MESSAGES.POOLDATA_OPTION_FIELD_TYPE_INVALID,
        });
      }
      return { table: row.dataSource ?? 'ob_pool_data' };
    }
    // 進入點 1：欄位尚未列入白名單 → 固定 ob_pool_data
    return { table: 'ob_pool_data' };
  }

  /**
   * 確認來源表是否存在（AD §3.3；供 getAvailableColumns 與 getDistinctValues 共用，DRY 零行為變更）。
   *
   * `tableName` 恆為程式碼常數（'ob_pool_data' | 'customer_core'），仍以值參數化傳遞保持一致風格。
   * SQLite 測試環境無 information_schema → catch 降級為 false（未就緒）。
   */
  private async _checkTableExists(
    tableName: 'ob_pool_data' | 'customer_core',
  ): Promise<boolean> {
    const isMssql = this.dataSource.options.type === 'mssql';
    const sql = isMssql
      ? `SELECT TOP 1 1 AS x FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA = 'dbo' AND TABLE_NAME = @0`
      : `SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = ? LIMIT 1`;
    const rows = await this.dataSource.query(sql, [tableName]).catch(() => null);
    return !!rows && rows.length > 0;
  }

  /**
   * 確認 columnName 是否存在於解析出之來源表（AD §3.3）。
   *
   * `columnName` 此階段已通過 `SAFE_COLUMN_NAME_RE`，但仍以**值參數化**查詢（非識別字內插），
   * 避免任何 SQL 文字插入。SQLite 無 information_schema → catch 降級為 false。
   */
  private async _checkColumnExists(
    tableName: 'ob_pool_data' | 'customer_core',
    columnName: string,
  ): Promise<boolean> {
    const isMssql = this.dataSource.options.type === 'mssql';
    const sql = isMssql
      ? `SELECT TOP 1 1 AS x FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = 'dbo' AND TABLE_NAME = @0 AND COLUMN_NAME = @1`
      : `SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = ? AND column_name = ? LIMIT 1`;
    const rows = await this.dataSource
      .query(sql, [tableName, columnName])
      .catch(() => null);
    return !!rows && rows.length > 0;
  }

  /**
   * DISTINCT 查詢包上獨立 app-level 逾時（AD §3.5；I-DVAL-SCAN-BOUND-01 / I-DVAL-TIMEOUT-EXPLICIT-01）。
   *
   * 以 `Promise.race` 界定獨立於全域 driver requestTimeout（1 小時）之逾時視窗；逾時或任何非預期
   * 例外一律收斂為 500 `DISTINCT_VALUES_QUERY_TIMEOUT`（忠實比照 `Stage0EstimateService.estimateListCount`
   * 之 catch 語意：不外洩原始 SQL 錯誤訊息）。`finally` 之 `clearTimeout` 避免逾時 timer 於查詢先完成後
   * 殘留並於稍後對已 settle 之 promise 產生 unhandled rejection（較 AD §3.5 片段之硬化）。
   */
  private async _queryDistinctWithTimeout(
    table: 'ob_pool_data' | 'customer_core',
    columnName: string,
    timeoutMs: number,
  ): Promise<unknown[]> {
    // timeoutMs <= 0 即視為立即逾時（測試 / 強制中斷；沿用 F049 timeoutMs=0 慣例）
    if (timeoutMs <= 0) {
      throw new InternalServerErrorException({
        error: ERROR_CODES.DISTINCT_VALUES_QUERY_TIMEOUT,
        message: ERROR_MESSAGES.DISTINCT_VALUES_QUERY_TIMEOUT,
      });
    }

    const queryPromise = this._runDistinctQuery(table, columnName);
    let timer: ReturnType<typeof setTimeout> | undefined;
    const timeoutPromise = new Promise<never>((_, reject) => {
      timer = setTimeout(
        () =>
          reject(
            new InternalServerErrorException({
              error: ERROR_CODES.DISTINCT_VALUES_QUERY_TIMEOUT,
              message: ERROR_MESSAGES.DISTINCT_VALUES_QUERY_TIMEOUT,
            }),
          ),
        timeoutMs,
      );
    });

    try {
      return await Promise.race([queryPromise, timeoutPromise]);
    } catch (e) {
      if (e instanceof InternalServerErrorException) throw e;
      this.logger.error(
        `getDistinctValues query failed: ${(e as Error).message}`,
      );
      throw new InternalServerErrorException({
        error: ERROR_CODES.DISTINCT_VALUES_QUERY_TIMEOUT,
        message: ERROR_MESSAGES.DISTINCT_VALUES_QUERY_TIMEOUT,
      });
    } finally {
      if (timer) clearTimeout(timer);
    }
  }

  /**
   * dialect-branch raw DISTINCT 查詢（AD §3.5；I-DVAL-NO-SAMPLE-01 精確 DISTINCT，禁用抽樣）。
   *
   * `columnName` 已通過 §3.3 之 regex + INFORMATION_SCHEMA 存在性驗證，此處可安全內插（I-DVAL-SAFE-INTERP-01）。
   * 取 `CAP + 1` 筆以偵測 truncation；`WHERE ... IS NOT NULL` 天然滿足 AC-14 空狀態（全 NULL → []）。
   * SQLite 無 information_schema 相關降級由上游檢查處理，此處查詢本體對兩方言皆有效。
   */
  private async _runDistinctQuery(
    table: 'ob_pool_data' | 'customer_core',
    columnName: string,
  ): Promise<unknown[]> {
    const isMssql = this.dataSource.options.type === 'mssql';
    const cap1 = DISTINCT_VALUES_CAP + 1;
    const sql = isMssql
      ? `SELECT DISTINCT TOP (${cap1}) [${columnName}] AS v FROM ${table} WHERE [${columnName}] IS NOT NULL ORDER BY [${columnName}]`
      : `SELECT DISTINCT "${columnName}" AS v FROM ${table} WHERE "${columnName}" IS NOT NULL ORDER BY "${columnName}" LIMIT ${cap1}`;
    const rows = await this.dataSource.query(sql);
    return (rows as Array<{ v: unknown }>).map((r) => r.v);
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
      // F075 v1.7 / US-144 AC-19：camelCase isSystemFixed（DB 欄位 is_system_fixed）；
      //   舊資料 / 未設定時防呆為 false
      isSystemFixed: row.isSystemFixed ?? false,
      // F109 / US-172 / AC-2：資料來源（DB 欄位 data_source）；舊資料 / 未設定時防呆為 'ob_pool_data'
      dataSource: row.dataSource ?? 'ob_pool_data',
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
