import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Brackets, In, Like, Repository } from 'typeorm';
import {
  ObListDefinition,
  ObListDefinitionConditionItem,
  ObListDefinitionConditionPayload,
} from '@/database/entities/ob-list-definition.entity';
import { AssignmentAuditLog } from '@/database/entities/assignment-audit-log.entity';
import { ObDeptPct } from '@/database/entities/ob-dept-pct.entity';
import { ObEmplSet } from '@/database/entities/ob-empl-set.entity';
import { ObEmphire } from '@/database/entities/ob-emphire.entity';
import { AssignmentApproval } from '@/database/entities/assignment-approval.entity';
import { User } from '@/database/entities/user.entity';
import { PooldataFieldOption } from '@/database/entities/pooldata-field-option.entity';
import { PooldataFieldWhitelist } from '@/database/entities/pooldata-field-whitelist.entity';
import { AssignmentRunGuardService } from '@/modules/assignment/services/assignment-run-guard.service';
import { SectionChiefScopeService } from '@/modules/assignment/services/section-chief-scope.service';
// F095 / AD-E07-26 §26.5：與 F091 月名單分派共用同一 trigger pure utility（read-time 推導，無新 DB 欄位）
import { deriveAppliedSpecialRules } from '@/modules/assignment/stage1/special-rules';
import { ERROR_CODES, ERROR_MESSAGES } from '@/common/errors/error-codes';
import { isUuid } from '@/common/uuid.util';
import type { CreateListDto } from './dto/create-list.dto';
import type { UpdateListDto } from './dto/update-list.dto';
import type {
  ListSnapshotResponse,
  SnapshotDeptRatio,
  SnapshotPersonnelRatio,
  SnapshotPersonnelRatioMember,
  SnapshotAuditTrailItem,
} from './dto/list-snapshot-response.dto';

/**
 * F050 v2.1 / AD-E07-18 §18.4：list_period_* 為一級保留欄位，不可入 conditions
 */
const RESERVED_CONDITION_FIELDS = ['list_period_start', 'list_period_end', 'list_interval'];

/**
 * WHITELIST_OPTION_INACTIVE warning 結構（error-handling.md v1.14）
 * 非 HTTP 錯誤碼；隨 200 OK response 攜帶於 `warnings[]`，不阻擋寫入。
 */
export interface ListResponseWarning {
  code: string;
  message: string;
  details: Array<{ columnName: string; optionValue: string }>;
}

/**
 * AssignmentListService — F048 / F050 / F051 / F052 / F077 共用 service
 *
 * 對應 spec：
 *   - F048 v2.0：list（含 lockState）
 *   - F050 v2.0：create（LIST_NO 自動產生 / 999 上限 / PROD_KIND+CARD_TYPE 唯一 / case_status 必填）
 *   - F051 v2.0：update（覆寫式 / 不可動 list_no / case_status 不可清空）
 *   - F052 v2.0：disable（軟刪除 / 重複停用阻擋）
 *   - F077 v1.2：listLists（month switch + stage filter；historical readonly 由 controller 寫入 guard）
 *
 * 所有寫入 method 頂層必呼 `assignmentRunGuard.assertNoRunningRun()`（spec BR / AD-E07 v3.0）。
 */
@Injectable()
export class AssignmentListService {
  private readonly logger = new Logger(AssignmentListService.name);

  /**
   * US-144 / AD-E07-18 §18.12.4：系統固定篩選欄位之固定值對映。
   *
   * `injectSystemFixedConditions` 由 caller 傳入 whitelist query 結果（columnName + fieldType），
   * 固定值則自本 constant 取得。未來新增系統固定欄位於此擴充一筆即可，
   * 無需改動 injectSystemFixedConditions 邏輯或 Stage 1。
   */
  private static readonly SYSTEM_FIXED_VALUE_MAP: Record<string, string[]> = {
    best_case: ['Y'],
  };

  constructor(
    @InjectRepository(ObListDefinition)
    private readonly listRepo: Repository<ObListDefinition>,
    @InjectRepository(AssignmentAuditLog)
    private readonly auditRepo: Repository<AssignmentAuditLog>,
    @InjectRepository(PooldataFieldOption)
    private readonly optionRepo: Repository<PooldataFieldOption>,
    @InjectRepository(PooldataFieldWhitelist)
    private readonly whitelistRepo: Repository<PooldataFieldWhitelist>,
    @InjectRepository(ObDeptPct)
    private readonly deptPctRepo: Repository<ObDeptPct>,
    @InjectRepository(ObEmplSet)
    private readonly emplSetRepo: Repository<ObEmplSet>,
    @InjectRepository(ObEmphire)
    private readonly emphireRepo: Repository<ObEmphire>,
    @InjectRepository(AssignmentApproval)
    private readonly approvalRepo: Repository<AssignmentApproval>,
    @InjectRepository(User)
    private readonly userRepo: Repository<User>,
    private readonly assignmentRunGuard: AssignmentRunGuardService,
    private readonly scopeService: SectionChiefScopeService,
  ) {}

  // -------------------------------------------------------------------------
  // F050 v2.1 / F051 v2.1 — condition_payload 驗證（AD-E07-18 §18.4）
  // -------------------------------------------------------------------------

  /**
   * 驗證 condition_payload service 層校驗（DTO class-validator 之後）。
   *
   * 校驗順序（優先序由高至低）：
   *   1. RESERVED_FIELD_IN_CONDITIONS（400 BadRequest）— columnName ∈ {list_period_start/end/interval}
   *   2. VALIDATION_ERROR（422）— 同 columnName 重複出現
   *   3. CONDITION_COLUMN_NOT_IN_WHITELIST（422）— columnName 不在 F075 active whitelist
   *
   * @param payload — 已通過 DTO 驗證的 ConditionPayload；若 undefined / null 視為呼叫端責任，本 method 不處理
   * @param systemFixedColumnNames — US-144 / §18.12.8：系統固定欄位 columnName 集合；
   *        最低條件數計算（step 0）排除這些欄位（best_case 等由後端強制注入，不代表使用者設定條件）。
   *        省略時視為空集合（向後相容：所有條件皆計入最低數）。
   */
  private async validateConditionPayload(
    payload: ObListDefinitionConditionPayload | null | undefined,
    systemFixedColumnNames: Set<string> = new Set<string>(),
  ): Promise<void> {
    if (!payload || !Array.isArray(payload.conditions)) return;
    const conditions = payload.conditions as ObListDefinitionConditionItem[];

    // 0. 最低條件數（DTO ArrayMinSize 已擋；service 層 defense-in-depth）
    //    US-144 / §18.12.8：排除系統固定欄位後，至少需 1 個非系統固定條件，
    //    否則 422 VALIDATION_ERROR（空 [] 或僅含 best_case 皆拒絕）。
    const nonSystemFixedCount = conditions.filter(
      (c) => !systemFixedColumnNames.has(c.columnName),
    ).length;
    if (nonSystemFixedCount === 0) {
      throw new UnprocessableEntityException({
        error: ERROR_CODES.VALIDATION_ERROR,
        message:
          systemFixedColumnNames.size > 0
            ? '請至少新增 1 個篩選條件（優質案件為系統固定，不計入）'
            : '篩選條件不得為空，請至少設定一個欄位',
      });
    }

    // 1. reserved 欄位（400 優先）
    const reservedHit = conditions
      .map((c) => c.columnName)
      .filter((n) => RESERVED_CONDITION_FIELDS.includes(n));
    if (reservedHit.length > 0) {
      throw new BadRequestException({
        error: ERROR_CODES.RESERVED_FIELD_IN_CONDITIONS,
        message: ERROR_MESSAGES.RESERVED_FIELD_IN_CONDITIONS,
        details: { reservedFields: Array.from(new Set(reservedHit)) },
      });
    }

    // 2. 同 columnName 重複（422 VALIDATION_ERROR）
    const allNames = conditions.map((c) => c.columnName);
    if (new Set(allNames).size < allNames.length) {
      throw new UnprocessableEntityException({
        error: ERROR_CODES.VALIDATION_ERROR,
        message: '篩選條件不可重複出現相同欄位（columnName）',
      });
    }

    // 3. whitelist active check（422 CONDITION_COLUMN_NOT_IN_WHITELIST）
    const activeRows = await this.whitelistRepo.find({ where: { is_active: true } });
    const activeSet = new Set(activeRows.map((r) => r.column_name));
    for (const cond of conditions) {
      if (!activeSet.has(cond.columnName)) {
        throw new UnprocessableEntityException({
          error: ERROR_CODES.CONDITION_COLUMN_NOT_IN_WHITELIST,
          message: ERROR_MESSAGES.CONDITION_COLUMN_NOT_IN_WHITELIST,
          details: { columnName: cond.columnName },
        });
      }
    }
  }

  // -------------------------------------------------------------------------
  // US-144 / AD-E07-18 §18.12.4：系統固定篩選條件注入（best_case → ['Y']）
  // -------------------------------------------------------------------------

  /**
   * 查詢系統固定欄位集合（is_system_fixed = true AND is_active = true），
   * 並與 SYSTEM_FIXED_VALUE_MAP 合併為 injectSystemFixedConditions 所需陣列。
   *
   * createList / updateList 各呼叫一次（§18.12.5 step 1），結果同時供：
   *   - validateConditionPayload min-count 排除（systemFixedColumnNames）
   *   - injectSystemFixedConditions（systemFixedFields 含固定值）
   */
  private async loadSystemFixedFields(): Promise<
    Array<{ columnName: string; fieldType: string; fixedValues: string[] }>
  > {
    const rows = await this.whitelistRepo.findBy({
      isSystemFixed: true,
      is_active: true,
    });
    return rows.map((r) => ({
      columnName: r.column_name,
      fieldType: r.field_type,
      fixedValues:
        AssignmentListService.SYSTEM_FIXED_VALUE_MAP[r.column_name] ?? [],
    }));
  }

  /**
   * US-144 / §18.12.4：強制注入系統固定條件至 condition_payload（tamper-proof）。
   *
   * 對每個 systemFixedField：
   *   - payload.conditions 中無對應 columnName → 靜默注入整筆
   *   - 已含但 values ≠ fixedValues → 靜默正規化 values 為 fixedValues（不拒絕請求）
   *   - 已含且 values 相等（順序無關）→ 不動（idempotent）
   *
   * immutable pattern：回傳新物件，不 mutate 傳入參數；不觸碰 logic / 其他 conditions。
   */
  private injectSystemFixedConditions<T extends ObListDefinitionConditionPayload>(
    payload: T,
    systemFixedFields: Array<{
      columnName: string;
      fieldType: string;
      fixedValues: string[];
    }>,
  ): T {
    const conditions: ObListDefinitionConditionItem[] = Array.isArray(
      payload.conditions,
    )
      ? payload.conditions.map((c) => ({ ...c }))
      : [];

    for (const sf of systemFixedFields) {
      const idx = conditions.findIndex((c) => c.columnName === sf.columnName);
      const fixed: ObListDefinitionConditionItem = {
        columnName: sf.columnName,
        fieldType: sf.fieldType as ObListDefinitionConditionItem['fieldType'],
        values: [...sf.fixedValues],
      };
      if (idx === -1) {
        conditions.push(fixed);
      } else {
        // 正規化 values 為固定值（tamper-proof）；保留其餘欄位語意以固定值為準
        conditions[idx] = fixed;
      }
    }

    // 泛型保留 caller 傳入之 payload 型別（CreateListDto/UpdateListDto 之 ConditionPayloadDto
    // 含 index signature；entity ObListDefinitionConditionPayload 無），回寫 dto.conditionPayload
    // 才不會型別不相容（TS2322）。
    return { ...payload, conditions } as T;
  }

  // -------------------------------------------------------------------------
  // F109 / US-172 / AD-E07-37 §6：寫入時固化每個 condition 之 dataSource
  // -------------------------------------------------------------------------

  /**
   * 依當下 active 白名單逐 condition 蓋上 `dataSource`（'ob_pool_data' | 'customer_core'）。
   *
   * 插入順序（AD §6，強制）：validate → injectSystemFixedConditions → **stampConditionDataSource**
   *   → copyFromListNo → deriveBackwardCompatColumns。
   *   須在 injectSystemFixedConditions **之後**，確保系統固定注入之 best_case 條件亦被蓋章
   *   （best_case 為 ob_pool_data 來源）。
   *
   * 白名單查無對應列（欄位事後刪除等）→ fallback 'ob_pool_data'（與 resolveConditionDataSource 讀取時
   *   靜態 Set fallback 互補；8 個 customer_core 欄名在白名單存在時必被正確蓋為 'customer_core'）。
   *
   * immutable：回傳新物件，不 mutate 傳入參數。
   */
  private async stampConditionDataSource<
    T extends ObListDefinitionConditionPayload,
  >(payload: T): Promise<T> {
    if (!Array.isArray(payload.conditions)) return payload;
    const activeRows = await this.whitelistRepo.find({
      where: { is_active: true },
    });
    const dataSourceMap = new Map<string, 'ob_pool_data' | 'customer_core'>(
      activeRows.map((r) => [r.column_name, r.dataSource ?? 'ob_pool_data']),
    );
    const conditions: ObListDefinitionConditionItem[] = payload.conditions.map(
      (c) => ({
        ...c,
        dataSource: dataSourceMap.get(c.columnName) ?? 'ob_pool_data',
      }),
    );
    return { ...payload, conditions } as T;
  }

  /**
   * F050 v2.1 / AD-E07-18 §18.6：condition_payload → 5 個 backward-compat entity column 衍生
   *
   * NOT NULL 邊界（§18.6 表）：
   *   - prod_kind / case_status 未衍生時 → '' （空字串）
   *   - caseyear / spec_tp / settle_src 未衍生時 → null
   *
   * 衍生規則：
   *   - categorical → values.join('$$')
   *   - numeric → `${min}$$${max}`（5 backward-compat 範圍內理論上不會出現，但容錯）
   *   - date → `${dateStart}$$${dateEnd}`（同上）
   *
   * 其他 columnName（如 month_cnt / birth_date）忽略（entity 無對應欄位）。
   * 同 columnName 重複出現（理論上 validateConditionPayload 已攔截）→ last-wins。
   */
  private deriveBackwardCompatColumns(
    payload: ObListDefinitionConditionPayload | null | undefined,
  ): {
    prod_kind: string;
    caseyear: string | null;
    spec_tp: string | null;
    case_status: string;
    settle_src: string | null;
  } {
    const result = {
      prod_kind: '',
      caseyear: null as string | null,
      spec_tp: null as string | null,
      case_status: '',
      settle_src: null as string | null,
    };

    if (!payload || !Array.isArray(payload.conditions)) return result;
    const BACKWARD_COMPAT_FIELDS = new Set([
      'prod_kind',
      'caseyear',
      'spec_tp',
      'case_status',
      'settle_src',
    ]);

    for (const cond of payload.conditions as ObListDefinitionConditionItem[]) {
      if (!BACKWARD_COMPAT_FIELDS.has(cond.columnName)) continue;

      let derived: string | null = null;
      if (cond.fieldType === 'categorical' && Array.isArray(cond.values)) {
        derived = cond.values.join('$$');
      } else if (cond.fieldType === 'numeric' && cond.min !== undefined && cond.max !== undefined) {
        derived = `${cond.min}$$${cond.max}`;
      } else if (cond.fieldType === 'date' && cond.dateStart && cond.dateEnd) {
        derived = `${cond.dateStart}$$${cond.dateEnd}`;
      }

      if (derived === null) continue;
      // last-wins（防禦）
      (result as Record<string, string | null>)[cond.columnName] = derived;
    }
    return result;
  }

  /**
   * F050 v2.2 / F051 v2.2 / §18.8（完整條件集相等語意）：
   * 將 condition_payload 正規化為可比對的 canonical 簽章字串。
   *
   * - conditions 依 columnName 排序（條件無序比對）
   * - 排除 system-fixed 欄位（如 best_case）：常數注入、無鑑別度，且 seed 名單未注入，
   *   排除後 service-injected 與 seed 名單方能對稱比對
   * - categorical：values 去重後排序；numeric：min~max；date：dateStart~dateEnd
   * - 併入 logic（AND/OR 影響命中集合，須納入比對）
   *
   * 回傳空字串代表「無可比對條件」，呼叫端視為永不衝突。
   */
  private normalizeConditionPayload(
    payload: ObListDefinitionConditionPayload | null | undefined,
    systemFixedColumnNames: Set<string>,
  ): string {
    if (!payload || !Array.isArray(payload.conditions)) return '';
    const parts: string[] = [];
    for (const c of payload.conditions as ObListDefinitionConditionItem[]) {
      if (systemFixedColumnNames.has(c.columnName)) continue;
      if (c.fieldType === 'categorical' && Array.isArray(c.values)) {
        const vals = [
          ...new Set(
            c.values.filter(
              (v): v is string => typeof v === 'string' && v.length > 0,
            ),
          ),
        ].sort();
        if (vals.length === 0) continue;
        parts.push(`${c.columnName}:cat:${vals.join(',')}`);
      } else if (
        c.fieldType === 'numeric' &&
        c.min !== undefined &&
        c.max !== undefined
      ) {
        parts.push(`${c.columnName}:num:${c.min}~${c.max}`);
      } else if (c.fieldType === 'date' && c.dateStart && c.dateEnd) {
        parts.push(`${c.columnName}:date:${c.dateStart}~${c.dateEnd}`);
      }
    }
    if (parts.length === 0) return '';
    parts.sort();
    const logic = (payload.logic ?? 'AND').toUpperCase();
    return `${logic}|${parts.join('|')}`;
  }

  /**
   * 將舊名單（condition_payload IS NULL）之 5 個 backward-compat entity column
   * 還原為 categorical 條件，供與輸入名單以相同正規化邏輯比對（§18.8）。
   */
  private legacyEntityToConditionPayload(
    entity: ObListDefinition,
  ): ObListDefinitionConditionPayload {
    const BACKWARD_COMPAT_FIELDS = [
      'prod_kind',
      'caseyear',
      'spec_tp',
      'case_status',
      'settle_src',
    ] as const;
    const conditions: ObListDefinitionConditionItem[] = [];
    for (const col of BACKWARD_COMPAT_FIELDS) {
      const raw = (entity as unknown as Record<string, unknown>)[col];
      if (typeof raw === 'string' && raw.length > 0) {
        conditions.push({
          columnName: col,
          fieldType: 'categorical',
          values: raw.split('$$').filter((v) => v.length > 0),
        } as ObListDefinitionConditionItem);
      }
    }
    return { conditions, logic: 'AND' };
  }

  // -------------------------------------------------------------------------
  // F077 / F048 — List
  // -------------------------------------------------------------------------

  /**
   * F077 v1.2 §5.2 + F048 v2.0 §5.1 列表
   *
   * @returns { lists, lockState, currentWorkYm, selectedYm, isHistorical, isFuture, stageCounts }
   */
  async listLists(opts: {
    ym: string;
    stages?: string[];
    includeDisabled?: boolean;
    /**
     * F077 v1.4 §6 BR-4（2026-05-21 修訂）：
     * actor 為 section_chief 時，僅回傳「ob_dept_pct 含處長轄區 dept_code」之名單；
     * admin / director（或 null actor — backward-compat）→ bypass。
     *
     * 廢除原 `created_by = actor.userId` 過濾（chicken-and-egg：處長不會建名單，
     * 該欄位永遠不可能 match）。改為透過 SectionChiefScopeService.getScopeDeptCode
     * 反查 ob_emphire 取得 dept_code，再 EXISTS join ob_dept_pct 過濾。
     */
    actor?: { userId: string; role: string; businessRole: string | null } | null;
  }): Promise<{
    selectedYm: string;
    isHistorical: boolean;
    isFuture: boolean;
    lockState: { locked: boolean; reason: string | null };
    lists: Array<Record<string, unknown>>;
    stageCounts: Record<string, number>;
  }> {
    const { ym, stages, includeDisabled, actor } = opts;

    const qb = this.listRepo
      .createQueryBuilder('l')
      .where('l.project_workym = :ym', { ym });

    if (stages && stages.length > 0) {
      qb.andWhere('l.stage IN (:...stages)', { stages });
    }

    if (!includeDisabled) {
      qb.andWhere("l.status = 'active'");
    }

    // F077 v1.4 §6 BR-4：section_chief 轄區隔離（2026-05-21 改用 ob_emphire 反查）
    //   admin / director / 無 actor → bypass（不過濾）
    //   section_chief → 限 ob_dept_pct 含處長轄區 dept_code 之名單
    //   scope=null（email 對不上 ob_emphire 處長員工）→ 回空清單
    const isSectionChief =
      actor != null &&
      actor.role !== 'admin' &&
      actor.businessRole === 'section_chief';
    if (isSectionChief && actor) {
      const scope = await this.scopeService.getScopeDeptCode(actor.userId);
      if (!scope) {
        // 對不上 ob_emphire 處長員工 → 視同無轄區回空清單
        qb.andWhere('1 = 0');
      } else {
        qb.andWhere(
          `EXISTS (SELECT 1 FROM ob_dept_pct p WHERE p.list_no = l.list_no AND TRIM(p.obdeptid) = :scope)`,
          { scope },
        );
      }
    }

    qb.orderBy('l.list_no', 'ASC');
    const records = await qb.getMany();

    // F088 v1.3 §5.0.1：清單卡片聚合欄位（deptCount / empCount / approvedAt / approverName）
    //   - 全部以「list_no IN (...)」批次查詢，避免 N+1（estimateCases 直接讀 entity 物化欄位，免查詢）
    const listNos = records.map((r) => r.list_no);
    const deptCountMap = new Map<string, number>();
    const empCountMap = new Map<string, number>();
    const approvedAtMap = new Map<string, Date>();
    const approverIdMap = new Map<string, string>();
    if (listNos.length > 0) {
      const deptCountRows = await this.deptPctRepo
        .createQueryBuilder('d')
        .select('d.list_no', 'listNo')
        .addSelect('COUNT(*)', 'cnt')
        .where('d.list_no IN (:...nos)', { nos: listNos })
        .groupBy('d.list_no')
        .getRawMany<{ listNo: string; cnt: string }>();
      for (const r of deptCountRows) deptCountMap.set(r.listNo, Number(r.cnt));

      const empCountRows = await this.emplSetRepo
        .createQueryBuilder('e')
        .select('e.list_no', 'listNo')
        .addSelect('COUNT(*)', 'cnt')
        .where('e.list_no IN (:...nos)', { nos: listNos })
        .groupBy('e.list_no')
        .getRawMany<{ listNo: string; cnt: string }>();
      for (const r of empCountRows) empCountMap.set(r.listNo, Number(r.cnt));

      // 最新一筆 approve（依 approved_at DESC，first-wins）→ approvedAt + approverId
      const approveRows = await this.approvalRepo.find({
        where: { list_no: In(listNos), action: 'approve' },
        order: { approved_at: 'DESC' },
      });
      for (const a of approveRows) {
        if (!approvedAtMap.has(a.list_no)) {
          approvedAtMap.set(a.list_no, a.approved_at);
          if (a.approver_id) approverIdMap.set(a.list_no, a.approver_id);
        }
      }
    }

    // 建立者 / 核准者姓名解析：created_by / approver_id 為 user id（A_USERID），
    // 清單頁需顯示姓名而非 UUID。對齊 card-type.service Iter 9「JOIN users」模式；批次查避免 N+1。
    // 🔴 ob_list_definition.created_by 為 varchar，可能存非 GUID 值（legacy / seed 標記）；以 isUuid 過濾，
    //    避免餵入 users.id(uniqueidentifier) 查詢而拋「Invalid GUID」500（見 common/uuid.util）。
    //    approver_id 本即 GUID，通過 isUuid 無虞；顯示層仍以 `?? r.created_by` 保留原值 fallback。
    const userIds = Array.from(
      new Set([
        ...records.map((r) => r.created_by),
        ...approverIdMap.values(),
      ].filter(isUuid)),
    );
    const creatorNameById = new Map<string, string>();
    if (userIds.length > 0) {
      const users = await this.userRepo.find({ where: { id: In(userIds) } });
      for (const u of users) creatorNameById.set(u.id, u.name);
    }

    // 月名單分派鎖：assertNoRunningRun 失敗即視為 locked
    let locked = false;
    try {
      await this.assignmentRunGuard.assertNoRunningRun(ym);
    } catch {
      locked = true;
    }

    const stageCounts: Record<string, number> = {
      draft: 0,
      dept_ratio: 0,
      personnel_ratio: 0,
      approval: 0,
      ready: 0,
      disabled: 0,
    };
    for (const r of records) {
      if (r.status === 'inactive') stageCounts.disabled += 1;
      else if (stageCounts[r.stage] !== undefined) stageCounts[r.stage] += 1;
    }

    return {
      selectedYm: ym,
      isHistorical: false, // controller 計算 currentWorkYm 與此比對後覆寫
      isFuture: false,
      lockState: {
        locked,
        reason: locked ? '分派執行中' : null,
      },
      lists: records.map((r) => ({
        listNo: r.list_no,
        listNm: r.list_nm,
        prodKind: r.prod_kind,
        caseYear: r.caseyear,
        specTp: r.spec_tp,
        // P2-5 Phase 3：補 caseStatus + crEnabled（已存 DB）
        caseStatus: r.case_status,
        crEnabled: r.cr_enabled,
        listPeriodStart: r.list_period_start,
        listPeriodEnd: r.list_period_end,
        listInterval: r.list_interval,
        settleSrc: r.settle_src,
        cardType: r.card_type,
        prodBest: r.prod_best,
        status: r.status,
        stage: r.stage,
        // 行為人姓名（fallback 回 created_by 原值，確保系統值 / 查無 user 時仍可顯示）
        createdBy: creatorNameById.get(r.created_by) ?? r.created_by,
        createdAt: r.created_at,
        updatedAt: r.updated_at,
        // F088 v1.3 §5.0.1：清單卡片聚合欄位
        deptCount: deptCountMap.get(r.list_no) ?? 0,
        empCount: empCountMap.get(r.list_no) ?? 0,
        approvedAt: approvedAtMap.get(r.list_no) ?? null,
        approverName: (() => {
          const aid = approverIdMap.get(r.list_no);
          return aid ? (creatorNameById.get(aid) ?? aid) : null;
        })(),
        // 物化 Stage 0 估算（approve→ready 寫入；未計算 / 舊名單為 null）
        estimateCases: r.stage0_estimate_count ?? null,
        // F048 v2.0：補 conditionPayload + legacyEntityFallback（2026-05-21 hotfix
        // 對齊 spec §5 要求，前端 list-edit-draft-page 依此預填條件 builder）
        conditionPayload: r.condition_payload ?? null,
        legacyEntityFallback: r.condition_payload === null ? {
          prodKind: r.prod_kind ?? null,
          caseyear: r.caseyear ?? null,
          specTp: r.spec_tp ?? null,
          caseStatus: r.case_status ?? null,
          settleSrc: r.settle_src ?? null,
        } : null,
      })),
      stageCounts,
    };
  }

  // -------------------------------------------------------------------------
  // F050 v2.1 — Create（whitelist-driven 重構 / AD-E07-18）
  // -------------------------------------------------------------------------

  async createList(
    dto: CreateListDto,
    actor: { userId: string; ipAddress: string | null },
    targetWorkYm: string,
  ): Promise<{
    listNo: string;
    listNm: string;
    status: string;
    stage: string;
    projectWorkym: string;
    warnings?: ListResponseWarning[];
  }> {
    // 1. BR / spec AC-6：月名單分派鎖（最頂層）
    await this.assignmentRunGuard.assertNoRunningRun();

    // 1b. US-144 / §18.12.5 step 1：載入系統固定欄位（best_case）一次，
    //     供 min-count 排除（step 2）與 injectSystemFixedConditions（step 3）共用。
    const systemFixedFields = await this.loadSystemFixedFields();
    const systemFixedColumnNames = new Set(
      systemFixedFields.map((f) => f.columnName),
    );

    // 2. v2.1 / AC-11 / AC-12 / §18.4：condition_payload 校驗
    //    （reserved 400 > 同名重複 422 > whitelist 422 + §18.12.8 min-count 排除 system-fixed）
    await this.validateConditionPayload(
      dto.conditionPayload,
      systemFixedColumnNames,
    );

    // 2b. US-144 / §18.12.5 step 3：注入系統固定條件（best_case → ['Y']）
    //     在驗證通過後、衍生 backward-compat 之前執行（tamper-proof 靜默正規化）。
    if (dto.conditionPayload) {
      dto.conditionPayload = this.injectSystemFixedConditions(
        dto.conditionPayload,
        systemFixedFields,
      );

      // 2c. F109 / US-172 / AD-E07-37 §6：固化每個 condition 之 dataSource（含系統固定 best_case）。
      //     在 injectSystemFixedConditions 之後、deriveBackwardCompatColumns 之前執行。
      dto.conditionPayload = await this.stampConditionDataSource(
        dto.conditionPayload,
      );
    }

    // 3. v2.1 / AC-5 / 拍板 Q4：copyFromListNo legacy 防呆
    //    （前端 copy 模式：dto.conditionPayload 已含完整 payload；本步驟只校驗 source）
    if (dto.copyFromListNo) {
      const source = await this.listRepo.findOne({
        where: { list_no: dto.copyFromListNo },
      });
      if (!source) {
        throw new NotFoundException({
          error: ERROR_CODES.ASSIGNMENT_LIST_NOT_FOUND,
          message: ERROR_MESSAGES.ASSIGNMENT_LIST_NOT_FOUND,
        });
      }
      if (source.condition_payload === null) {
        throw new UnprocessableEntityException({
          error: ERROR_CODES.LEGACY_LIST_NOT_COPYABLE,
          message: ERROR_MESSAGES.LEGACY_LIST_NOT_COPYABLE,
          details: { copyFromListNo: dto.copyFromListNo },
        });
      }
    }

    // 4. v2.1 / §18.6：derive backward-compat columns
    const derived = this.deriveBackwardCompatColumns(dto.conditionPayload);

    // 5. v2.2 / §18.8：完整條件集相等唯一性（取代 v2.1 prod_kind 交集）
    const conflict = await this.findActiveConditionDuplicate(
      targetWorkYm,
      dto.conditionPayload,
      dto.cardType ?? null,
      systemFixedColumnNames,
    );
    if (conflict) {
      throw new UnprocessableEntityException({
        error: ERROR_CODES.LIST_NO_DUPLICATE,
        message: `${ERROR_MESSAGES.LIST_NO_DUPLICATE}（LIST_NO: ${conflict.conflictListNo}）`,
        details: conflict,
      });
    }

    // 6. AC-2 / AC-3 / BR-1：LIST_NO 自動產生
    const listNo = await this.generateNextListNo(targetWorkYm);

    const now = new Date();
    const entity = this.listRepo.create({
      list_no: listNo,
      list_nm: dto.listNm,
      // 5 個 backward-compat 衍生欄位（§18.6）
      prod_kind: derived.prod_kind,
      caseyear: derived.caseyear,
      spec_tp: derived.spec_tp,
      case_status: derived.case_status,
      settle_src: derived.settle_src,
      // condition_payload source of truth（v2.1 / §18.4）
      condition_payload: dto.conditionPayload,

      // v2.1.1 (US-128 / architecture-spec §18.11.6 方案 Y)：
      //   prod_best 一級欄位 DEPRECATED；業務語意改由 condition_payload.conditions[
      //   columnName='best_case'] 承接 (BR-12)。service 層 ignore dto 之 prodBest 欄位，
      //   不寫入 entity；entity column 仍保留為 deprecated nullable，新名單寫 null。
      prod_best: null,
      list_type: '01', // AC-2：後端固定
      list_period_start: String(dto.listPeriodStart),
      list_period_end: String(dto.listPeriodEnd),
      list_interval: String(dto.listInterval),
      assigned_date: null,
      total_amount: null,
      reserved_amount: null,
      is_assigned: null,
      project_workym: targetWorkYm,
      casenumber: null,
      name: null,
      caseyearnm: null,
      card_type: dto.cardType ?? null,
      cr_enabled: dto.crEnabled ?? false,
      status: 'active',
      stage: 'draft',
      created_by_prog: 'CDMP-F050',
      created_by: actor.userId,
      created_at: now,
      updated_by_prog: 'CDMP-F050',
      updated_by: actor.userId,
      updated_at: now,
    } as Partial<ObListDefinition>);

    await this.listRepo.save(entity);

    // 7. AC-9 / BR-5：audit log（含 condition_payload + copy_from_list_no）
    await this.writeAudit({
      entityId: listNo,
      action: 'CREATE',
      actorId: actor.userId,
      ipAddress: actor.ipAddress,
      beforeValue: null,
      afterValue: {
        list_no: listNo,
        list_nm: dto.listNm,
        condition_payload: dto.conditionPayload,
        card_type: dto.cardType ?? null,
        copy_from_list_no: dto.copyFromListNo ?? null,
      },
    });

    // 8. v2.1 / AC-13 / BR-9：INACTIVE option warnings（非阻擋）
    const warnings = await this.calculateInactiveOptionWarnings(dto.conditionPayload);

    return {
      listNo,
      listNm: dto.listNm,
      status: 'active',
      stage: 'draft',
      projectWorkym: targetWorkYm,
      warnings,
    };
  }

  // -------------------------------------------------------------------------
  // F051 v2.1 — Update（whitelist-driven 重構 / AD-E07-18）
  // -------------------------------------------------------------------------

  async updateList(
    listNo: string,
    dto: UpdateListDto,
    actor: { userId: string; ipAddress: string | null },
    currentWorkYm?: string,
  ): Promise<{
    listNo: string;
    listNm: string;
    status: string;
    stage: string;
    updatedAt: Date;
    warnings?: ListResponseWarning[];
  }> {
    // 1. 月名單分派鎖（優先）
    await this.assignmentRunGuard.assertNoRunningRun();

    // 2. 名單存在性
    const existing = await this.listRepo.findOne({ where: { list_no: listNo } });
    if (!existing) {
      throw new NotFoundException({
        error: ERROR_CODES.ASSIGNMENT_LIST_NOT_FOUND,
        message: ERROR_MESSAGES.ASSIGNMENT_LIST_NOT_FOUND,
      });
    }

    // 3. 歷史月份寫入攔截
    this.assertNotHistorical(existing.project_workym ?? '', currentWorkYm);

    // 4. status=inactive 不可編輯
    if (existing.status === 'inactive') {
      throw new UnprocessableEntityException({
        error: ERROR_CODES.ASSIGNMENT_LIST_INACTIVE,
        message: ERROR_MESSAGES.ASSIGNMENT_LIST_INACTIVE,
      });
    }

    // 5. v2.1 4-state：existing.condition_payload × dto.conditionPayload
    const hasExistingPayload = existing.condition_payload !== null && existing.condition_payload !== undefined;
    const hasDtoPayload = dto.conditionPayload !== undefined && dto.conditionPayload !== null;

    if (!hasExistingPayload && hasDtoPayload) {
      // 5a. 舊名單 + 提供 conditionPayload → LEGACY_LIST_CONDITION_READONLY
      throw new UnprocessableEntityException({
        error: ERROR_CODES.LEGACY_LIST_CONDITION_READONLY,
        message: ERROR_MESSAGES.LEGACY_LIST_CONDITION_READONLY,
      });
    }
    if (hasExistingPayload && !hasDtoPayload) {
      // 5b. 新名單 + 未提供 conditionPayload → VALIDATION_ERROR
      throw new UnprocessableEntityException({
        error: ERROR_CODES.VALIDATION_ERROR,
        message: 'conditionPayload 為必填（新名單）',
      });
    }
    // 5c. 舊名單 + 未提供 → OK（只改非篩選欄位）
    // 5d. 新名單 + 提供 → 進入下面正常 flow

    const beforePayload = existing.condition_payload;
    const beforeListNm = existing.list_nm;
    let derived: ReturnType<AssignmentListService['deriveBackwardCompatColumns']> | null = null;

    if (hasDtoPayload) {
      // 6. stage guard（僅 draft 可寫入 condition_payload；K1 / K3）
      //    US-144 / §18.12.5：stage guard 在 injectSystemFixedConditions 之前執行
      //    （dept_ratio 等非 draft 名單帶 conditionPayload → 422，不進入注入邏輯）。
      if (existing.stage !== 'draft') {
        throw new UnprocessableEntityException({
          error: ERROR_CODES.LIST_STAGE_TRANSITION_FORBIDDEN,
          message: ERROR_MESSAGES.LIST_STAGE_TRANSITION_FORBIDDEN,
          details: { currentStage: existing.stage },
        });
      }

      // 6b. US-144 / §18.12.5 step 1：載入系統固定欄位（best_case）一次。
      const systemFixedFields = await this.loadSystemFixedFields();
      const systemFixedColumnNames = new Set(
        systemFixedFields.map((f) => f.columnName),
      );

      // 7. validate condition_payload（含 §18.12.8 min-count 排除 system-fixed）
      await this.validateConditionPayload(
        dto.conditionPayload!,
        systemFixedColumnNames,
      );

      // 7b. US-144 / §18.12.5 step 3：注入系統固定條件（best_case → ['Y']）
      //     在 stage guard + 驗證通過後、衍生 backward-compat 之前執行。
      dto.conditionPayload = this.injectSystemFixedConditions(
        dto.conditionPayload!,
        systemFixedFields,
      );

      // 7c. F109 / US-172 / AD-E07-37 §6：固化每個 condition 之 dataSource（含系統固定 best_case）。
      dto.conditionPayload = await this.stampConditionDataSource(
        dto.conditionPayload!,
      );

      // 8. derive backward-compat
      derived = this.deriveBackwardCompatColumns(dto.conditionPayload!);

      // 9. v2.2 / §18.8：完整條件集相等唯一性（排除自身）
      const conflict = await this.findActiveConditionDuplicate(
        existing.project_workym ?? '',
        dto.conditionPayload!,
        dto.cardType ?? null,
        systemFixedColumnNames,
        listNo,
      );
      if (conflict) {
        throw new UnprocessableEntityException({
          error: ERROR_CODES.LIST_NO_DUPLICATE,
          message: `${ERROR_MESSAGES.LIST_NO_DUPLICATE}（LIST_NO: ${conflict.conflictListNo}）`,
          details: conflict,
        });
      }
    }

    const now = new Date();

    // 10. 永遠更新非篩選欄位
    existing.list_nm = dto.listNm;
    existing.list_period_start = String(dto.listPeriodStart);
    existing.list_period_end = String(dto.listPeriodEnd);
    existing.list_interval = String(dto.listInterval);
    existing.card_type = dto.cardType ?? null;
    // v2.1.1 (US-128 / architecture-spec §18.11.6 方案 Y)：
    //   service 層 ignore dto 之 prodBest 欄位 — 整行刪除；migration M-A2 已一次性
    //   清空既有資料，後續寫入維持 NULL（不主動覆寫；舊客戶端送 prodBest:'Y' 也不會生效）。
    if (dto.crEnabled !== undefined) {
      existing.cr_enabled = dto.crEnabled;
    }

    // 11. 條件覆寫（新名單 + 提供 conditionPayload）
    if (hasDtoPayload && derived) {
      existing.condition_payload = dto.conditionPayload!;
      existing.prod_kind = derived.prod_kind;
      existing.caseyear = derived.caseyear;
      existing.spec_tp = derived.spec_tp;
      existing.case_status = derived.case_status;
      existing.settle_src = derived.settle_src;
    }

    existing.updated_by = actor.userId;
    existing.updated_by_prog = 'CDMP-F051';
    existing.updated_at = now;

    await this.listRepo.save(existing);

    // 12. audit log（含 before/after condition_payload）
    await this.writeAudit({
      entityId: listNo,
      action: 'UPDATE',
      actorId: actor.userId,
      ipAddress: actor.ipAddress,
      beforeValue: {
        list_nm: beforeListNm,
        condition_payload: beforePayload,
        card_type: existing.card_type,
      },
      afterValue: {
        list_nm: dto.listNm,
        condition_payload: existing.condition_payload,
        card_type: dto.cardType ?? null,
      },
    });

    // 13. INACTIVE option warnings（非阻擋）
    const warnings = hasDtoPayload
      ? await this.calculateInactiveOptionWarnings(dto.conditionPayload!)
      : [];

    return {
      listNo,
      listNm: dto.listNm,
      status: existing.status,
      stage: existing.stage,
      updatedAt: now,
      warnings,
    };
  }

  /**
   * F050 v2.0 / F051 v2.0 + F076 v1.3 BR-7 + error-handling.md v1.14
   *
   * 檢查 condition_payload 引用之可選值是否有已停用（is_active=false）。
   * 不阻擋寫入，僅 response.warnings 增補 WHITELIST_OPTION_INACTIVE 條目。
   *
   * @returns warnings 陣列（無 inactive 引用時為 []）
   */
  private async calculateInactiveOptionWarnings(
    conditionPayload?: {
      conditions?: Array<{
        columnName: string;
        values?: string[];
        [k: string]: unknown;
      }>;
      [k: string]: unknown;
    } | null,
  ): Promise<ListResponseWarning[]> {
    if (!conditionPayload || !Array.isArray(conditionPayload.conditions)) {
      return [];
    }

    // 收集 (columnName, optionValue) 對
    const refPairs: Array<{ columnName: string; optionValue: string }> = [];
    for (const cond of conditionPayload.conditions) {
      if (!cond?.columnName || !Array.isArray(cond?.values)) continue;
      for (const v of cond.values) {
        if (v == null) continue;
        refPairs.push({ columnName: cond.columnName, optionValue: String(v) });
      }
    }
    if (refPairs.length === 0) return [];

    // 一次查詢相關 options
    const columnNames = Array.from(new Set(refPairs.map((p) => p.columnName)));
    const options = await this.optionRepo
      .createQueryBuilder('o')
      .where('o.column_name IN (:...names)', { names: columnNames })
      .getMany();
    const activeMap = new Map<string, boolean>();
    for (const o of options) {
      activeMap.set(`${o.column_name}::${o.option_value}`, o.is_active);
    }

    // 不存在於 active map 視為「未維護」不報 inactive（避免誤報，留給其他驗證處理）
    const inactiveRefs = refPairs.filter((p) => {
      const key = `${p.columnName}::${p.optionValue}`;
      const isActive = activeMap.get(key);
      return isActive === false;
    });

    if (inactiveRefs.length === 0) return [];

    return [
      {
        code: ERROR_CODES.WHITELIST_OPTION_INACTIVE,
        message: ERROR_MESSAGES.WHITELIST_OPTION_INACTIVE,
        details: inactiveRefs,
      },
    ];
  }

  // -------------------------------------------------------------------------
  // F052 v2.0 — Disable（軟刪除）
  // -------------------------------------------------------------------------

  async disableList(
    listNo: string,
    actor: { userId: string; ipAddress: string | null },
    currentWorkYm?: string,
  ): Promise<{ listNo: string; status: string; updatedAt: Date }> {
    await this.assignmentRunGuard.assertNoRunningRun();

    const existing = await this.listRepo.findOne({ where: { list_no: listNo } });
    if (!existing) {
      throw new NotFoundException({
        error: ERROR_CODES.ASSIGNMENT_LIST_NOT_FOUND,
        message: ERROR_MESSAGES.ASSIGNMENT_LIST_NOT_FOUND,
      });
    }

    // E07 重構 P1 B2 補完：歷史月份寫入攔截
    this.assertNotHistorical(existing.project_workym ?? '', currentWorkYm);

    // AC-7：重複停用阻擋
    if (existing.status === 'inactive') {
      throw new UnprocessableEntityException({
        error: ERROR_CODES.ASSIGNMENT_LIST_ALREADY_INACTIVE,
        message: ERROR_MESSAGES.ASSIGNMENT_LIST_ALREADY_INACTIVE,
      });
    }

    const now = new Date();
    const beforeStatus = existing.status;
    existing.status = 'inactive';
    existing.updated_by = actor.userId;
    existing.updated_by_prog = 'CDMP-F052';
    existing.updated_at = now;
    await this.listRepo.save(existing);

    // 注意：entity union 不含 'DISABLE'，採 UPDATE + status change 紀錄
    // 對應 spec AC-2「action='DISABLE'」之語意以 before/after status 差異保留稽核軌跡
    await this.writeAudit({
      entityId: listNo,
      action: 'UPDATE',
      actorId: actor.userId,
      ipAddress: actor.ipAddress,
      beforeValue: { status: beforeStatus, _operation: 'DISABLE' },
      afterValue: { status: 'inactive', _operation: 'DISABLE' },
    });

    return { listNo, status: 'inactive', updatedAt: now };
  }

  // -------------------------------------------------------------------------
  // 內部：歷史月份寫入攔截（E07 重構 P1 B2 補完 / error-handling.md v1.14）
  // -------------------------------------------------------------------------

  /**
   * 比對名單 project_workym 與當前 currentWorkYm，較舊則 403 LIST_HISTORICAL_READONLY。
   *
   * 參數 currentWorkYm 為 optional：
   *   - 未傳入：跳過檢查（service 單元測試 / 舊呼叫端向下相容）
   *   - 傳入：執行嚴格比對（controller 必須傳入以實施 spec BR-3）
   *
   * 注意：F077 §6 BR-3 規範「歷史月份資料為唯讀」適用於 update / disable；
   *       create 因 project_workym 由 currentWorkYm 強制注入，無歷史寫入風險。
   */
  private assertNotHistorical(
    listProjectWorkYm: string,
    currentWorkYm: string | undefined,
  ): void {
    if (!currentWorkYm) return;
    if (!listProjectWorkYm) return;
    if (listProjectWorkYm < currentWorkYm) {
      throw new ForbiddenException({
        error: ERROR_CODES.LIST_HISTORICAL_READONLY,
        message: ERROR_MESSAGES.LIST_HISTORICAL_READONLY,
      });
    }
  }

  // -------------------------------------------------------------------------
  // 內部：LIST_NO 自動產生（BR-1）
  // -------------------------------------------------------------------------

  /**
   * 依 spec AC-2：OB{YYYYMM}{NNN}，001~999，達 999 → LIST_NO_LIMIT_EXCEEDED
   */
  async generateNextListNo(ym: string): Promise<string> {
    const prefix = `OB${ym}`;
    const existing = await this.listRepo
      .createQueryBuilder('l')
      .where('l.list_no LIKE :pattern', { pattern: `${prefix}%` })
      .orderBy('l.list_no', 'DESC')
      .limit(1)
      .getOne();

    let nextSeq = 1;
    if (existing) {
      const seqStr = existing.list_no.slice(prefix.length);
      const seq = parseInt(seqStr, 10);
      if (!Number.isNaN(seq)) {
        nextSeq = seq + 1;
      }
    }

    if (nextSeq > 999) {
      throw new UnprocessableEntityException({
        error: ERROR_CODES.LIST_NO_LIMIT_EXCEEDED,
        message: `本月（${ym}）名單定義已達 999 筆上限，無法新增`,
      });
    }

    return `${prefix}${String(nextSeq).padStart(3, '0')}`;
  }

  /**
   * F050 v2.2 / F051 v2.2 / §18.8（v2.2 完整條件集相等語意，取代 v2.1 prod_kind 交集）：
   *
   * 重複判定：同 (project_workym, status='active', card_type) 之既有名單中，
   *   若有任一筆「正規化後 condition_payload 與輸入名單完全相同」即為重複。
   *   - 候選 condition_payload != null → 直接正規化比對
   *   - 候選 condition_payload == null（舊遷移名單）→ 由 5 個 backward-compat 欄位還原後比對
   *   - system-fixed 欄位（best_case）於兩端皆排除（常數、無鑑別度）
   *   - 輸入正規化為空（無可比對條件）→ 跳過檢查
   *   - excludeListNo（F051 update）→ 排除自身
   *
   * card_type 仍為比對 key 的一部分（由 query 過濾）：legacy 實際資料存在「條件全同、
   *   僅 card_type 不同」之合法名單（如 M/M3、HC/SEC），不可誤判為重複。
   *
   * @returns { conflictListNo, cardType } 或 null
   */
  async findActiveConditionDuplicate(
    ym: string,
    inputPayload: ObListDefinitionConditionPayload | null | undefined,
    cardType: string | null,
    systemFixedColumnNames: Set<string>,
    excludeListNo?: string,
  ): Promise<{
    conflictListNo: string;
    cardType: string | null;
  } | null> {
    const inputSig = this.normalizeConditionPayload(
      inputPayload,
      systemFixedColumnNames,
    );
    if (inputSig === '') return null;

    const qb = this.listRepo
      .createQueryBuilder('l')
      .where("l.status = 'active'")
      .andWhere('l.project_workym = :ym', { ym });

    if (cardType === null || cardType === undefined) {
      qb.andWhere('l.card_type IS NULL');
    } else {
      qb.andWhere('l.card_type = :cardType', { cardType });
    }

    if (excludeListNo) {
      qb.andWhere('l.list_no != :excludeListNo', { excludeListNo });
    }

    const candidates = await qb.getMany();
    for (const candidate of candidates) {
      const candPayload =
        candidate.condition_payload !== null &&
        candidate.condition_payload !== undefined
          ? candidate.condition_payload
          : this.legacyEntityToConditionPayload(candidate);
      const candSig = this.normalizeConditionPayload(
        candPayload,
        systemFixedColumnNames,
      );
      if (candSig !== '' && candSig === inputSig) {
        return { conflictListNo: candidate.list_no, cardType: cardType ?? null };
      }
    }
    return null;
  }

  // -------------------------------------------------------------------------
  // 內部：寫入 audit log
  // -------------------------------------------------------------------------

  private async writeAudit(args: {
    entityId: string;
    action: AssignmentAuditLog['action'];
    actorId: string;
    ipAddress: string | null;
    beforeValue: Record<string, unknown> | null;
    afterValue: Record<string, unknown> | null;
  }): Promise<void> {
    try {
      await this.auditRepo.save(
        this.auditRepo.create({
          entity_type: 'ob_list_definition',
          entity_id: args.entityId,
          action: args.action,
          actor_id: args.actorId,
          actor_name: args.actorId, // F050 spec 未要求查 user 名稱；以 id 暫填，後續可由 view join
          before_value: args.beforeValue,
          after_value: args.afterValue,
          ip_address: args.ipAddress,
          created_at: new Date(),
        } as Partial<AssignmentAuditLog>),
      );
    } catch (err: any) {
      // BR-5：稽核寫入失敗僅記錄 Logger.error，不 rollback 業務操作
      this.logger.error(
        `assignment_audit_log write failed: entity=${args.entityId}, ` +
          `action=${args.action}, actor=${args.actorId}: ${err?.message ?? err}`,
      );
    }
  }

  // -------------------------------------------------------------------------
  // F050 v2.2 §6.2 — GET full-snapshot（US-131 Detail Drawer）
  // -------------------------------------------------------------------------

  /**
   * F050 v2.2 §6.2：取得指定名單之完整快照。
   *
   * 唯讀端點：
   *   - 不攔截 LIST_HISTORICAL_READONLY（歷史月份可開啟）
   *   - 不攔截 ASSIGNMENT_RUN_ALREADY_RUNNING（月名單分派中可開啟）
   *   - 不攔截 FeatureFlagGuard（為展示用唯讀資料）
   *
   * 處長轄區隔離（US-131 AC-4）：
   *   - 沿用既有 SectionChiefScopeService pattern：actor 為 section_chief 時，
   *     依 ob_empl_set.created_by = actor.userId 限縮 personnelRatios 範圍（取 deptid_m 集合）
   *   - admin / director / 無 actor → bypass（全可見）
   *   - deptRatios 不過濾（處長仍可見全名單分配輪廓）
   *
   * Stage-aware null state（US-131 AC-3）：
   *   - draft：deptRatios=[], personnelRatios=[]
   *   - dept_ratio：deptRatios 有值, personnelRatios=[]
   *   - personnel_ratio / approval / ready：兩者皆有值
   *
   * @param listNo 11 碼名單編號
   * @param actor 當前使用者（含 role / businessRole / userId）
   * @throws NotFoundException 404 ASSIGNMENT_LIST_NOT_FOUND
   */
  async getFullSnapshot(
    listNo: string,
    actor: { userId: string; role: string; businessRole: string | null },
  ): Promise<ListSnapshotResponse> {
    // 1. 名單存在性
    const entity = await this.listRepo.findOne({ where: { list_no: listNo } });
    if (!entity) {
      throw new NotFoundException({
        error: ERROR_CODES.ASSIGNMENT_LIST_NOT_FOUND,
        message: ERROR_MESSAGES.ASSIGNMENT_LIST_NOT_FOUND,
      });
    }

    // 2. legacyEntityFallback：condition_payload IS NULL 時非 null
    const legacyEntityFallback =
      entity.condition_payload === null
        ? {
            prodKind: entity.prod_kind ?? null,
            caseyear: entity.caseyear ?? null,
            specTp: entity.spec_tp ?? null,
            caseStatus: entity.case_status ?? null,
            settleSrc: entity.settle_src ?? null,
          }
        : null;

    // 3. deptRatios（依 ob_dept_pct；不過濾 section_chief 轄區）
    const deptRows = await this.deptPctRepo.find({
      where: { list_no: listNo },
      order: { obdeptid: 'ASC' },
    });
    const deptRatios: SnapshotDeptRatio[] = deptRows.map((r) => ({
      deptCode: r.obdeptid,
      deptName: r.obdeptnm ?? null,
      ration: Number(r.ration),
    }));

    // 4. personnelRatios（依 ob_empl_set group by deptid_m；section_chief 轄區隔離）
    const isSectionChief =
      actor.role !== 'admin' && actor.businessRole === 'section_chief';
    const emplQb = this.emplSetRepo
      .createQueryBuilder('s')
      .where('s.list_no = :listNo', { listNo });
    if (isSectionChief) {
      emplQb.andWhere('s.created_by = :uid', { uid: actor.userId });
    }
    const emplRows = await emplQb.getMany();

    // 收集所有 emplid 一次性查 ob_emphire（避免 N+1）
    const emplIds = Array.from(new Set(emplRows.map((r) => r.emplid))).filter(
      (x): x is string => typeof x === 'string' && x.length > 0,
    );
    const emphireMap = new Map<string, ObEmphire>();
    if (emplIds.length > 0) {
      const emphires = await this.emphireRepo.find({ where: { emp_id: In(emplIds) } });
      for (const e of emphires) emphireMap.set(e.emp_id, e);
    }

    // Group by deptid_m
    const groupMap = new Map<string, { deptName: string | null; members: SnapshotPersonnelRatioMember[] }>();
    for (const row of emplRows) {
      const deptCode = row.deptid_m ?? '';
      if (!deptCode) continue;
      let group = groupMap.get(deptCode);
      if (!group) {
        const emphire = row.emplid ? emphireMap.get(row.emplid) : undefined;
        group = { deptName: emphire?.dept_name ?? null, members: [] };
        groupMap.set(deptCode, group);
      }
      const empInfo = row.emplid ? emphireMap.get(row.emplid) : undefined;
      group.members.push({
        emplid: row.emplid ?? '',
        empNm: empInfo?.emp_nm ?? null,
        ration: Number(row.ration),
      });
    }
    const personnelRatios: SnapshotPersonnelRatio[] = Array.from(groupMap.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([deptCode, g]) => ({ deptCode, deptName: g.deptName, members: g.members }));

    // 5. auditTrail（依 created_at ASC）
    // entity_type 放寬涵蓋舊資料：階段轉換 audit 於 2026-05-26 前以 'list_definition' 寫入
    //（已修為 'ob_list_definition'，見 stage-transition.service.buildAudit）；兩值並查確保歷史列不漏。
    const auditRows = await this.auditRepo.find({
      where: {
        entity_type: In(['ob_list_definition', 'list_definition']),
        entity_id: listNo,
      },
      order: { created_at: 'ASC' },
    });
    // 解析行為人姓名：audit.actor_name 目前寫入 actor_id placeholder（見 writeAudit / buildAudit），
    // 改以 users.name 解析後顯示，timeline 才看得到操作者姓名而非 UUID。
    const actorIds = Array.from(
      new Set(auditRows.map((r) => r.actor_id).filter((id): id is string => !!id)),
    );
    const actorNameById = new Map<string, string>();
    if (actorIds.length > 0) {
      const users = await this.userRepo.find({ where: { id: In(actorIds) } });
      for (const u of users) actorNameById.set(u.id, u.name);
    }
    const auditTrail: SnapshotAuditTrailItem[] = auditRows.map((r) => ({
      action: r.action,
      operatorId: r.actor_id,
      operatorEmpNm: actorNameById.get(r.actor_id) ?? r.actor_name ?? null,
      before: r.before_value ?? null,
      after: r.after_value ?? null,
      at: r.created_at,
    }));

    return {
      list: {
        listNo: entity.list_no,
        listNm: entity.list_nm,
        stage: entity.stage,
        status: entity.status as 'active' | 'inactive',
        projectWorkym: entity.project_workym ?? null,
        cardType: entity.card_type ?? null,
        crEnabled: entity.cr_enabled ?? false,
        listPeriodStart: entity.list_period_start ?? null,
        listPeriodEnd: entity.list_period_end ?? null,
        listInterval: entity.list_interval ?? null,
        conditionPayload: entity.condition_payload ?? null,
        legacyEntityFallback,
        createdBy: entity.created_by ?? null,
        createdAt: entity.created_at ?? null,
        updatedAt: entity.updated_at ?? null,
      },
      deptRatios,
      personnelRatios,
      auditTrail,
      // F095：依 list_nm 讀時推導套用之系統特例規則（與 F091 月名單分派共用 deriveAppliedSpecialRules）
      appliedSpecialRules: deriveAppliedSpecialRules(entity.list_nm),
    };
  }
}
