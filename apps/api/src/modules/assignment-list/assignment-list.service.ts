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
import { User } from '@/database/entities/user.entity';
import { PooldataFieldOption } from '@/database/entities/pooldata-field-option.entity';
import { PooldataFieldWhitelist } from '@/database/entities/pooldata-field-whitelist.entity';
import { AssignmentRunGuardService } from '@/modules/assignment/services/assignment-run-guard.service';
import { ERROR_CODES, ERROR_MESSAGES } from '@/common/errors/error-codes';
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
    @InjectRepository(User)
    private readonly userRepo: Repository<User>,
    private readonly assignmentRunGuard: AssignmentRunGuardService,
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
   */
  private async validateConditionPayload(
    payload: ObListDefinitionConditionPayload | null | undefined,
  ): Promise<void> {
    if (!payload || !Array.isArray(payload.conditions)) return;
    const conditions = payload.conditions as ObListDefinitionConditionItem[];

    // 0. conditions 至少 1 個（DTO ArrayMinSize 已擋；service 層 defense-in-depth）
    if (conditions.length === 0) {
      throw new UnprocessableEntityException({
        error: ERROR_CODES.VALIDATION_ERROR,
        message: '篩選條件不得為空，請至少設定一個欄位',
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
   * F050 v2.1 / AD-E07-18 §18.8：抽取 prod_kind 條件之 values 集合（唯一性交集比對用）
   *
   * - 僅取 fieldType=categorical 之 prod_kind condition
   * - 過濾空字串 values
   * - 未設定 / 非 categorical → 回空陣列（呼叫端依此跳過唯一性檢查）
   */
  private extractProdKindValues(
    payload: ObListDefinitionConditionPayload | null | undefined,
  ): string[] {
    if (!payload || !Array.isArray(payload.conditions)) return [];
    const cond = payload.conditions.find(
      (c) => c.columnName === 'prod_kind' && c.fieldType === 'categorical',
    );
    if (!cond || !Array.isArray(cond.values)) return [];
    return cond.values.filter((v): v is string => typeof v === 'string' && v.length > 0);
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
     * F077 v1.3 §6 BR-4 / D3 follow-up（2026-05-21）：
     * actor 為 section_chief 時，僅回傳 `created_by = actor.userId` 之名單；
     * admin / director（or null actor — backward-compat）→ bypass（看全部）。
     *
     * shouldFilter 判斷邏輯與既有 SectionChiefScopeService.shouldFilter() 一致
     * （F063/F064/F066/F067 v1.1 同 pattern），但 filter 對象為
     * `ob_list_definition.created_by` 而非 emplid，故不 inject Service，
     * 直接 inline 判斷以避免跨 module 依賴。
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

    // F077 v1.3 §6 BR-4 / D3：section_chief 轄區隔離
    //   admin / director / 無 actor → bypass（不過濾）
    //   section_chief → 限 created_by = self
    const isSectionChief =
      actor != null &&
      actor.role !== 'admin' &&
      actor.businessRole === 'section_chief';
    if (isSectionChief && actor) {
      qb.andWhere('l.created_by = :scopeUid', { scopeUid: actor.userId });
    }

    qb.orderBy('l.list_no', 'ASC');
    const records = await qb.getMany();

    // 月跑鎖：assertNoRunningRun 失敗即視為 locked
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
        createdBy: r.created_by,
        createdAt: r.created_at,
        updatedAt: r.updated_at,
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
    currentWorkYm: string,
  ): Promise<{
    listNo: string;
    listNm: string;
    status: string;
    stage: string;
    projectWorkym: string;
    warnings?: ListResponseWarning[];
  }> {
    // 1. BR / spec AC-6：月跑鎖（最頂層）
    await this.assignmentRunGuard.assertNoRunningRun();

    // 2. v2.1 / AC-11 / AC-12 / §18.4：condition_payload 校驗
    //    （reserved 400 > 同名重複 422 > whitelist 422）
    await this.validateConditionPayload(dto.conditionPayload);

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

    // 5. v2.1 / §18.8：prod_kind 交集唯一性
    const inputProdKindValues = this.extractProdKindValues(dto.conditionPayload);
    const conflict = await this.findActivePkCardTypeConflict(
      currentWorkYm,
      inputProdKindValues,
      dto.cardType ?? null,
    );
    if (conflict) {
      throw new UnprocessableEntityException({
        error: ERROR_CODES.LIST_NO_DUPLICATE,
        message: `${ERROR_MESSAGES.LIST_NO_DUPLICATE}（LIST_NO: ${conflict.conflictListNo}）`,
        details: conflict,
      });
    }

    // 6. AC-2 / AC-3 / BR-1：LIST_NO 自動產生
    const listNo = await this.generateNextListNo(currentWorkYm);

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
      project_workym: currentWorkYm,
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
      projectWorkym: currentWorkYm,
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
    // 1. 月跑鎖（優先）
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
      if (existing.stage !== 'draft') {
        throw new UnprocessableEntityException({
          error: ERROR_CODES.LIST_STAGE_TRANSITION_FORBIDDEN,
          message: ERROR_MESSAGES.LIST_STAGE_TRANSITION_FORBIDDEN,
          details: { currentStage: existing.stage },
        });
      }

      // 7. validate condition_payload
      await this.validateConditionPayload(dto.conditionPayload!);

      // 8. derive backward-compat
      derived = this.deriveBackwardCompatColumns(dto.conditionPayload!);

      // 9. prod_kind 交集唯一性（排除自身）
      const inputProdKindValues = this.extractProdKindValues(dto.conditionPayload!);
      const conflict = await this.findActivePkCardTypeConflict(
        existing.project_workym ?? '',
        inputProdKindValues,
        dto.cardType ?? null,
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
   * F050 v2.1 / F051 v2.1 / AD-E07-18 §18.8：prod_kind 交集唯一性比對
   *
   * 比對語意（取代 v2.0 完全相等）：
   *   - 對同 (project_workym, status='active', card_type) 既有候選名單，
   *     計算其 prod_kind values 集合（path A：condition_payload；path B：split entity.prod_kind by $$）
   *   - 與 inputProdKindValues 取交集；首次發現交集 ≠ ∅ 即回衝突
   *   - inputProdKindValues 為空（未設 prod_kind 條件）→ 跳過檢查
   *   - excludeListNo（F051 update）→ 排除自身
   *
   * @returns { conflictListNo, intersectionValues, conflictingProdKindValues, inputProdKindValues } 或 null
   */
  async findActivePkCardTypeConflict(
    ym: string,
    inputProdKindValues: string[],
    cardType: string | null,
    excludeListNo?: string,
  ): Promise<{
    conflictListNo: string;
    intersectionValues: string[];
    conflictingProdKindValues: string[];
    inputProdKindValues: string[];
  } | null> {
    if (!Array.isArray(inputProdKindValues) || inputProdKindValues.length === 0) {
      return null;
    }

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
      let candidateValues: string[];
      if (candidate.condition_payload !== null && candidate.condition_payload !== undefined) {
        candidateValues = this.extractProdKindValues(candidate.condition_payload);
      } else {
        candidateValues = (candidate.prod_kind ?? '')
          .split('$$')
          .filter((v) => v.length > 0);
      }
      const intersection = inputProdKindValues.filter((v) => candidateValues.includes(v));
      if (intersection.length > 0) {
        return {
          conflictListNo: candidate.list_no,
          intersectionValues: intersection,
          conflictingProdKindValues: candidateValues,
          inputProdKindValues,
        };
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
   *   - 不攔截 ASSIGNMENT_RUN_ALREADY_RUNNING（月跑中可開啟）
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
    const auditRows = await this.auditRepo.find({
      where: { entity_type: 'ob_list_definition', entity_id: listNo },
      order: { created_at: 'ASC' },
    });
    const auditTrail: SnapshotAuditTrailItem[] = auditRows.map((r) => ({
      action: r.action,
      operatorId: r.actor_id,
      operatorEmpNm: r.actor_name ?? null,
      before: r.before_value ?? null,
      after: r.after_value ?? null,
      at: r.created_at,
    }));

    return {
      list: {
        listNo: entity.list_no,
        listNm: entity.list_nm,
        stage: entity.stage,
        status: entity.status,
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
    };
  }
}
