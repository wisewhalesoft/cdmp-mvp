import {
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import { DataSource, EntityManager, In, Repository } from 'typeorm';
import { ObListDefinition } from '@/database/entities/ob-list-definition.entity';
import { ObDeptPct } from '@/database/entities/ob-dept-pct.entity';
import { ObEmphire } from '@/database/entities/ob-emphire.entity';
import { AssignmentAuditLog } from '@/database/entities/assignment-audit-log.entity';
import { User } from '@/database/entities/user.entity';
import { RatioValidationService } from '@/modules/assignment/services/ratio-validation.service';
import { StageTransitionService } from '@/modules/assignment/services/stage-transition.service';
import { AssignmentRunGuardService } from '@/modules/assignment/services/assignment-run-guard.service';
import { ERROR_CODES, ERROR_MESSAGES } from '@/common/errors/error-codes';
import { activeEmphireCondition, todayYmd } from '@/common/emphire/emphire-active.util';
import { isUuid } from '@/common/uuid.util';
import type { SetDeptRatioDto } from './dto/set-dept-ratio.dto';

/** GET 之查詢旗標（F079 excludeZeroRatio + F117 §5.1 requireDirector，兩者正交、可並存 BR-8） */
export interface GetDeptRatiosOptions {
  /** F088 準備完成摘要用：隱藏 ration = 0 之部門 */
  excludeZeroRatio?: boolean;
  /** F117 AC-1：套用三分類過濾（有處長保留 / 孤兒保留鎖定 / 無關部門隱藏） */
  requireDirector?: boolean;
}

/** deptRatios[] 逐列形狀（F079 既有欄位 + F117 §5.1 增量欄位） */
export interface DeptRatioRowView {
  obdeptId: string;
  obdeptNm: string;
  ration: number;
  /** F079 AC-2：部門是否仍有在職員工（「已下線」徽章依據）；與 hasActiveDirector 正交（F117 BR-10） */
  isActive: boolean;
  directorName: string | null;
  /** F117 BR-1：該部門是否有在職處長（directorName !== null 之布林投影） */
  hasActiveDirector: boolean;
  /** F117 AC-3：=== hasActiveDirector；孤兒部門為 false（前端 disabled 依據） */
  isRatioEditable: boolean;
  /** F088 v1.3 BR-11：該部門比例設定者姓名（ob_dept_pct.created_by → users.name）；無既有設定為 null */
  setByName: string | null;
  /** F088 v1.3 BR-11：設定者為部長（business_role='director' 或 admin）→ true（「部長代設定」） */
  proxyByDirector: boolean;
}

export interface GetDeptRatiosResult {
  listNo: string;
  listNm: string;
  projectWorkym: string;
  stage: string;
  deptRatios: DeptRatioRowView[];
  total: number;
  isReadOnly: boolean;
  /** F117 §5.1：本次因 AC-1 被隱藏之「無關部門」數量；requireDirector=false 時恆為 0（AC-10） */
  hiddenNoDirectorCount: number;
}

/** PUT 之最終持久化列（payload 列 ∪ BR-4 保留之孤兒列） */
interface PersistableDeptRatio {
  obdeptId: string;
  obdeptNm: string;
  ration: number;
  /** 孤兒列保留原建立者 / 建立時間（BR-4「原樣寫回」）；payload 列為 undefined → 取本次 actor */
  createdBy?: string;
  createdAt?: Date;
}

/**
 * F079 v1.2 / F117 v1.1 — 部門比例設定 Service（per-LIST_NO 各部門 RATION）
 *
 * 對應 spec：F079 §5.1 GET / §5.2 PUT；F117 §5.1 / §5.2（增量）。
 *
 * 流程：
 *   - GET：自 ob_emphire 取在職部門 + 處長 + ob_dept_pct 既有 RATION 合併 → F117 三分類過濾
 *   - PUT：assertStageEquals('dept_ratio') → 孤兒保留（BR-4/5）→ 防呆（BR-6）→ 比例驗證（BR-7）
 *          → 覆寫式寫入 → audit（BR-9）
 *
 * 所有寫入 method 頂層必呼 `assignmentRunGuard.assertNoRunningRun()`（BR-11）。
 * 歷史月份阻擋於 service 層執行（BR-8 / F077 BR-3）。
 */
@Injectable()
export class DeptRatioService {
  private readonly logger = new Logger(DeptRatioService.name);

  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    @InjectRepository(ObListDefinition)
    private readonly listRepo: Repository<ObListDefinition>,
    @InjectRepository(ObDeptPct)
    private readonly deptPctRepo: Repository<ObDeptPct>,
    @InjectRepository(ObEmphire)
    private readonly emphireRepo: Repository<ObEmphire>,
    @InjectRepository(User)
    private readonly userRepo: Repository<User>,
    private readonly ratioValidation: RatioValidationService,
    private readonly stageTransition: StageTransitionService,
    private readonly runGuard: AssignmentRunGuardService,
  ) {}

  /**
   * GET /api/v1/assignment/ratios/dept/{listNo}
   *
   * Response：listNo / listNm / projectWorkym / stage / deptRatios[] / total / isReadOnly
   *           + F117：逐列 hasActiveDirector / isRatioEditable、回應層 hiddenNoDirectorCount
   */
  async getDeptRatios(
    listNo: string,
    opts: GetDeptRatiosOptions = {},
  ): Promise<GetDeptRatiosResult> {
    const list = await this.findListOrThrow(listNo);
    const projectWorkym = list.project_workym ?? '';

    const activeMap = await this.computeActiveDeptMap();
    const directorMap = await this.computeActiveDirectorMap();
    const existing = await this.deptPctRepo.find({
      where: { project_workym: projectWorkym, list_no: listNo },
    });

    const rows = await this.buildDeptRatioRows(existing, activeMap, directorMap);
    const { visible, hiddenNoDirectorCount } = this.applyVisibilityFilters(rows, opts);
    const total = visible.reduce((acc, d) => acc + d.ration, 0);

    return {
      listNo,
      listNm: list.list_nm,
      projectWorkym,
      stage: list.stage,
      deptRatios: visible,
      total: Math.round(total * 100) / 100,
      isReadOnly: list.stage !== 'dept_ratio' || list.status !== 'active',
      hiddenNoDirectorCount,
    };
  }

  /**
   * PUT /api/v1/assignment/ratios/dept/{listNo}
   *
   * 流程（AD-E07-48 §4.3）：
   *   1) runGuard.assertNoRunningRun()
   *   2) findListOrThrow + 歷史月份（403）+ status='active'（422）
   *   3) stageTransition.assertStageEquals(listNo, 'dept_ratio')
   *   4~7) computeActiveDirectorMap → beforeRows → 孤兒列識別（BR-4）
   *   8) BR-6 防呆：無處長且非孤兒之部門配置 ration > 0 → 422
   *   9) finalRows = payload（扣除孤兒覆寫，BR-5）∪ 孤兒列原值（BR-4）
   *   10) ratioValidation 以 finalRows 為對象（BR-7）
   *   11) Tx：DELETE 既有 + INSERT finalRows + audit（after_value = finalRows，BR-9）
   */
  async setDeptRatios(
    listNo: string,
    dto: SetDeptRatioDto,
    actor: { userId: string; ipAddress: string | null },
    currentWorkYm: string,
  ): Promise<{ listNo: string; savedCount: number; total: number; savedAt: Date; savedBy: string }> {
    await this.runGuard.assertNoRunningRun();

    const list = await this.findListOrThrow(listNo);
    this.assertNotHistorical(list.project_workym, currentWorkYm);
    this.assertListActive(list);

    await this.stageTransition.assertStageEquals(listNo, 'dept_ratio');

    const projectWorkym = list.project_workym ?? currentWorkYm;
    const directorMap = await this.computeActiveDirectorMap();
    const beforeRows = await this.deptPctRepo.find({
      where: { project_workym: projectWorkym, list_no: listNo },
    });
    const orphanRows = beforeRows.filter(
      (r) => !directorMap.has(deptKey(r.obdeptid)) && Number(r.ration) > 0,
    );
    const orphanIds = new Set(orphanRows.map((r) => deptKey(r.obdeptid)));

    this.assertDirectorAssigned(dto.deptRatios, directorMap, orphanIds);

    const finalRows = buildFinalRows(dto.deptRatios, orphanRows, orphanIds);
    const ratios = finalRows.map((r) => r.ration);
    this.ratioValidation.assertEachInRange(ratios);
    this.ratioValidation.assertSumEquals100(ratios);

    const savedAt = new Date();
    await this.persistDeptRatios({
      listNo,
      projectWorkym,
      finalRows,
      beforeRows,
      actor,
      savedAt,
    });

    const total = ratios.reduce((acc, v) => acc + v, 0);
    return {
      listNo,
      savedCount: finalRows.length,
      total: Math.round(total * 100) / 100,
      savedAt,
      savedBy: actor.userId,
    };
  }

  // --- F117 共用判定（GET / PUT 唯一來源，禁止第二套在職 / 職稱判定；BR-1 / AD-E07-48 §4.1）---

  /**
   * 各部門處長：`TRIM(jfun_nm) = '處長'` 且在職、同部門取最早入職者（F079 BR-14 / F117 BR-1）。
   *
   * 在職判定一律沿用 `emphire-active.util`（resign_date NULL 或 >= 系統日；哨兵 9999-12-31 = 永久在職），
   * 不可用 `resign_date IS NULL`（真實資料無 NULL → 會判全員離職 → 空清單）。
   */
  private async computeActiveDirectorMap(): Promise<Map<string, string>> {
    const sysDate = todayYmd();
    const directorRows = await this.emphireRepo
      .createQueryBuilder('e')
      .select('TRIM(e.dept_code)', 'dept_code')
      .addSelect('TRIM(e.emp_nm)', 'emp_nm')
      .where(activeEmphireCondition('e'), { sysDate })
      .andWhere(`TRIM(e.jfun_nm) = '處長'`)
      .orderBy('TRIM(e.dept_code)', 'ASC')
      .addOrderBy('CASE WHEN e.hire_date IS NULL THEN 1 ELSE 0 END', 'ASC')
      .addOrderBy('e.hire_date', 'ASC')
      .getRawMany<{ dept_code: string; emp_nm: string }>();

    const map = new Map<string, string>();
    for (const row of directorRows) {
      const code = deptKey(row.dept_code);
      if (code && !map.has(code)) map.set(code, row.emp_nm || '');
    }
    return map;
  }

  /** 在職部門（dept_code 去重 + TRIM；F079 BR-6），在職語意同上 */
  private async computeActiveDeptMap(): Promise<Map<string, string>> {
    const sysDate = todayYmd();
    const activeDeptsRaw = await this.emphireRepo
      .createQueryBuilder('e')
      .select('e.dept_code', 'dept_code')
      .addSelect('MAX(e.dept_name)', 'dept_name')
      .where(activeEmphireCondition('e'), { sysDate })
      .groupBy('e.dept_code')
      .orderBy('e.dept_code', 'ASC')
      .getRawMany<{ dept_code: string; dept_name: string }>();

    const map = new Map<string, string>();
    for (const row of activeDeptsRaw) {
      const code = deptKey(row.dept_code);
      if (code) map.set(code, deptKey(row.dept_name) || code);
    }
    return map;
  }

  // --- GET 組裝 helpers ---

  /**
   * F088 v1.3 BR-11：設定者解析 — ob_dept_pct.created_by → users（姓名 + business_role），批次查避免 N+1。
   *
   * 🔴 ob_dept_pct.created_by 為 varchar，可能存非 GUID 值（legacy-import / seed 標記）；以 isUuid 過濾，
   *    避免餵入 users.id(uniqueidentifier) 查詢而拋「Invalid GUID」500（見 common/uuid.util）。
   */
  private async resolveSetters(existing: ObDeptPct[]): Promise<Map<string, User>> {
    const setterIds = Array.from(new Set(existing.map((e) => e.created_by).filter(isUuid)));
    const setterById = new Map<string, User>();
    if (setterIds.length === 0) return setterById;
    const setters = await this.userRepo.find({ where: { id: In(setterIds) } });
    for (const u of setters) setterById.set(u.id, u);
    return setterById;
  }

  /** 合併「在職部門」∪「既有 ration 紀錄部門」，逐列計算 F079 / F117 欄位（依部門代碼排序） */
  private async buildDeptRatioRows(
    existing: ObDeptPct[],
    activeMap: Map<string, string>,
    directorMap: Map<string, string>,
  ): Promise<DeptRatioRowView[]> {
    const existingMap = new Map<string, ObDeptPct>();
    for (const e of existing) existingMap.set(deptKey(e.obdeptid), e);
    const setterById = await this.resolveSetters(existing);

    const allDeptIds = new Set<string>([...activeMap.keys(), ...existingMap.keys()]);
    return Array.from(allDeptIds)
      .sort()
      .map((code) => {
        const existingRow = existingMap.get(code);
        const setter = findSetter(existingRow, setterById);
        const hasActiveDirector = directorMap.has(code);
        return {
          obdeptId: code,
          obdeptNm: resolveDeptName(existingRow, activeMap.get(code), code),
          ration: existingRow ? Number(existingRow.ration) : 0,
          isActive: activeMap.has(code),
          directorName: directorMap.get(code) ?? null,
          hasActiveDirector,
          isRatioEditable: hasActiveDirector,
          setByName: setter?.name ?? null,
          proxyByDirector: isDirectorSetter(setter),
        };
      });
  }

  /**
   * 可見範圍過濾。
   *
   * - F117 requireDirector（AC-1 / BR-2）：有處長部門與孤兒部門（ration > 0）保留，
   *   「無關部門」（無處長且 ration = 0）自陣列移除並計入 hiddenNoDirectorCount。
   * - F079 excludeZeroRatio（準備完成摘要等唯讀檢視）：隱藏比例 = 0% 之部門。
   *
   * 兩旗標皆不帶時行為與 F117 實作前完全相同（AC-10 回歸基準）。
   */
  private applyVisibilityFilters(
    rows: DeptRatioRowView[],
    opts: GetDeptRatiosOptions,
  ): { visible: DeptRatioRowView[]; hiddenNoDirectorCount: number } {
    let visible = rows;
    let hiddenNoDirectorCount = 0;

    if (opts.requireDirector) {
      const kept = visible.filter((d) => d.hasActiveDirector || d.ration > 0);
      hiddenNoDirectorCount = visible.length - kept.length;
      visible = kept;
    }
    if (opts.excludeZeroRatio) {
      visible = visible.filter((d) => d.ration > 0);
    }
    return { visible, hiddenNoDirectorCount };
  }

  // --- PUT helpers ---

  /**
   * BR-6：payload 對「無在職處長且非孤兒」之部門配置 ration > 0 → 422 RATIO_DEPT_DIRECTOR_REQUIRED。
   * 訊息須指明部門代碼（AC-6）。孤兒部門不拋此碼（其值由 BR-4 / BR-5 保留並忽略 payload）。
   */
  private assertDirectorAssigned(
    payload: SetDeptRatioDto['deptRatios'],
    directorMap: Map<string, string>,
    orphanIds: Set<string>,
  ): void {
    for (const row of payload) {
      const code = deptKey(row.obdeptId);
      if (Number(row.ration) > 0 && !directorMap.has(code) && !orphanIds.has(code)) {
        throw new UnprocessableEntityException({
          error: ERROR_CODES.RATIO_DEPT_DIRECTOR_REQUIRED,
          message: `部門 ${code} 目前無在職處長，無法配置分派比例`,
        });
      }
    }
  }

  /** 覆寫式寫入（DELETE + INSERT 最終持久化集合）+ audit（BR-9：before / after 皆為最終集合語意） */
  private async persistDeptRatios(args: {
    listNo: string;
    projectWorkym: string;
    finalRows: PersistableDeptRatio[];
    beforeRows: ObDeptPct[];
    actor: { userId: string; ipAddress: string | null };
    savedAt: Date;
  }): Promise<void> {
    const { listNo, projectWorkym, finalRows, beforeRows, actor, savedAt } = args;
    await this.dataSource.transaction(async (mgr) => {
      await mgr.delete(ObDeptPct, { project_workym: projectWorkym, list_no: listNo });
      for (const r of finalRows) {
        await mgr.insert(ObDeptPct, {
          project_workym: projectWorkym,
          list_no: listNo,
          obdeptid: r.obdeptId,
          obdeptnm: r.obdeptNm,
          ration: String(r.ration) as unknown as string,
          created_by_prog: 'CDMP-F079',
          created_by: r.createdBy ?? actor.userId,
          created_at: r.createdAt ?? savedAt,
          updated_by_prog: 'CDMP-F079',
          updated_by: actor.userId,
          updated_at: savedAt,
        } as Partial<ObDeptPct>);
      }
      await this.writeAuditLog(mgr, { listNo, projectWorkym, finalRows, beforeRows, actor });
    });
  }

  /** audit（F079 BR-10：失敗僅 Logger，不影響主流程） */
  private async writeAuditLog(
    mgr: EntityManager,
    args: {
      listNo: string;
      projectWorkym: string;
      finalRows: PersistableDeptRatio[];
      beforeRows: ObDeptPct[];
      actor: { userId: string; ipAddress: string | null };
    },
  ): Promise<void> {
    const { listNo, projectWorkym, finalRows, beforeRows, actor } = args;
    try {
      await mgr.insert(AssignmentAuditLog, {
        entity_type: 'ob_dept_pct',
        entity_id: listNo,
        action: 'UPDATE', // SET_DEPT_RATIO 對應 entity action union 中的 UPDATE
        actor_id: actor.userId,
        actor_name: actor.userId,
        before_value: {
          deptRatios: beforeRows.map((r) => ({
            obdeptId: r.obdeptid,
            ration: Number(r.ration),
          })),
        },
        // BR-9：after_value 為最終持久化集合（含 BR-4 保留之孤兒列），非原始 payload
        after_value: {
          deptRatios: finalRows.map((r) => ({
            obdeptId: r.obdeptId,
            obdeptNm: r.obdeptNm,
            ration: r.ration,
          })),
          projectWorkym,
        },
        ip_address: actor.ipAddress,
      } as any);
    } catch (err) {
      this.logger.error(
        `SET_DEPT_RATIO audit log 寫入失敗 (listNo=${listNo}): ${(err as Error).message}`,
      );
    }
  }

  // --- 共用 helpers ---

  private async findListOrThrow(listNo: string): Promise<ObListDefinition> {
    const list = await this.listRepo.findOne({ where: { list_no: listNo } });
    if (!list) {
      throw new NotFoundException({
        error: ERROR_CODES.ASSIGNMENT_LIST_NOT_FOUND,
        message: ERROR_MESSAGES.ASSIGNMENT_LIST_NOT_FOUND,
      });
    }
    return list;
  }

  private assertNotHistorical(projectWorkym: string | null, currentWorkYm: string): void {
    if (projectWorkym && projectWorkym < currentWorkYm) {
      throw new ForbiddenException({
        error: ERROR_CODES.LIST_HISTORICAL_READONLY,
        message: ERROR_MESSAGES.LIST_HISTORICAL_READONLY,
      });
    }
  }

  private assertListActive(list: ObListDefinition): void {
    if (list.status !== 'active') {
      throw new UnprocessableEntityException({
        error: ERROR_CODES.ASSIGNMENT_LIST_INACTIVE,
        message: ERROR_MESSAGES.ASSIGNMENT_LIST_INACTIVE,
      });
    }
  }
}

/** 部門代碼 / 名稱之比對鍵：一律 TRIM（DB 為定長 varchar，尾隨空白會導致 Map 比對失準） */
function deptKey(value: string | null | undefined): string {
  return (value ?? '').trim();
}

/**
 * 部門顯示名稱：既有紀錄 → 在職員工主檔 → 部門代碼（F079 既有優先序）。
 *
 * ⚠️ 沿用 nullish（`??`）而非 falsy（`||`）之 fallback 語意：既有紀錄之 obdeptnm 為
 * 空白字串時，F117 實作前回傳空字串（不 fallback）。F117 僅疊加限縮規則，不得改變
 * 既有消費端（準備完成摘要 / Detail Drawer）之逐欄位輸出（AC-10 回歸基準）。
 */
function resolveDeptName(
  existingRow: ObDeptPct | undefined,
  activeName: string | undefined,
  code: string,
): string {
  return existingRow?.obdeptnm?.trim() ?? activeName ?? code;
}

/** F088 v1.3 BR-11：既有列之設定者（created_by 可能為非 UUID 之 legacy 標記 → 查無即 undefined） */
function findSetter(
  existingRow: ObDeptPct | undefined,
  setterById: Map<string, User>,
): User | undefined {
  if (!existingRow?.created_by) return undefined;
  return setterById.get(existingRow.created_by);
}

/** F088 v1.3 BR-11：設定者為部長（business_role='director'）或 admin → 「部長代設定」 */
function isDirectorSetter(setter: User | undefined): boolean {
  if (!setter) return false;
  return setter.role === 'admin' || setter.business_role === 'director';
}

/**
 * BR-4 / BR-5：最終持久化集合 = payload（扣除孤兒部門之覆寫值）∪ 孤兒列既有值（原樣）。
 *
 * 孤兒列不可經 payload 修改：payload 帶入之不同值一律忽略且不回錯誤（BR-5），
 * 且無論是否出現於 payload 皆重新寫回（BR-4，AC-3 之伺服器端不變式）。
 */
function buildFinalRows(
  payload: SetDeptRatioDto['deptRatios'],
  orphanRows: ObDeptPct[],
  orphanIds: Set<string>,
): PersistableDeptRatio[] {
  const fromPayload = payload
    .filter((r) => !orphanIds.has(deptKey(r.obdeptId)))
    .map((r) => ({
      obdeptId: r.obdeptId,
      obdeptNm: r.obdeptNm,
      ration: Number(r.ration),
    }));
  const preserved = orphanRows.map((r) => ({
    obdeptId: deptKey(r.obdeptid),
    obdeptNm: deptKey(r.obdeptnm),
    ration: Number(r.ration),
    createdBy: r.created_by,
    createdAt: r.created_at,
  }));
  return [...fromPayload, ...preserved];
}
