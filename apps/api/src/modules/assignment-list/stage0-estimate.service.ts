import {
  Injectable,
  InternalServerErrorException,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Between, In, Repository } from 'typeorm';
import { ObListDefinition } from '@/database/entities/ob-list-definition.entity';
import { ObPoolData } from '@/database/entities/ob-pool-data.entity';
import { ObPoolDataList } from '@/database/entities/ob-pool-data-list.entity';
import { ObCalendar } from '@/database/entities/ob-calendar.entity';
import { ObDeptPct } from '@/database/entities/ob-dept-pct.entity';
import { ObEmphire } from '@/database/entities/ob-emphire.entity';
import { activeEmphireCondition, todayYmd } from '@/common/emphire/emphire-active.util';
import {
  SectionChiefScopeService,
  type ActorUser,
} from '@/modules/assignment/services/section-chief-scope.service';
// F092 / AD-E07-23 §23.5：per-list 估算升級為完整 Stage 1 篩選鏈唯讀 dry-run，
// 與月跑共用同一 executeStage1Chain（消除 estimate / run 雙軌 drift）。
// 以 namespace import 引用，確保 dry-run 路徑與 AssignmentRunPipelineService 月跑同源，
// 並使 unit test 之 vi.spyOn(chainModule, 'executeStage1Chain') 可攔截內部呼叫。
import * as stage1Chain from '@/modules/assignment/stage1/stage1-filter-chain';
// F099 / AD-E07-28 P2：estimate 改與月跑 run 共用 buildStage1Sql core（I-RUN-EST-01）。
// PG 走 SELECT COUNT(*) 下推；非 PG（SQLite 測試）沿用 executeStage1Chain dry-run（JS oracle）。
import { estimateStage1SqlCount } from '@/modules/assignment/stage1/stage1-sql-executor';
// AD-E07-42 P3a：MSSQL Stage 1 estimate 下推（DB_TYPE='mssql' 分支，DISPATCH-002）。
import { estimateStage1SqlCountMssql } from '@/modules/assignment/stage1/stage1-sql-executor-mssql';
import { ERROR_CODES, ERROR_MESSAGES } from '@/common/errors/error-codes';

/**
 * F049 v1.3：工作日來源模式（對齊 §5.1 calendarSource）
 *   - weekday      ：rest_flg='0'（排除週末 + 國定假日；預設，對齊原系統 SP）
 *   - weekday-only ：僅排除週末（JS getDay∈{0,6}），國定假日視為工作日
 *   - all          ：不排除（全部視為工作日）
 */
export type CalendarSource = 'weekday' | 'weekday-only' | 'all';

/** F049 v1.3 跳過原因 */
export type SkipReason = '週末' | '國定假日';

export interface DailyEstimateRow {
  date: string; // YYYY-MM-DD
  weekday: string; // 一 / 二 / ... / 日
  isWorkday: boolean;
  skipReason: SkipReason | null;
  /** 千分位 ratio（工作日 = baseRatio 或 baseRatio+1；非工作日 = 0）。SUM(工作日) = 1000 */
  ratioPerMille: number;
}

/**
 * F049 v1.3 Design A：daily-estimate response（total-agnostic）
 *   - 不含 total / 每日件數（estimate）；件數由前端以 round(ratioPerMille/1000 × total) 計算
 */
export interface Stage0DailyEstimateResult {
  ym: string;
  calendarSource: CalendarSource;
  startDate: string; // YYYY-MM-DD
  endDate: string; // YYYY-MM-DD
  workingDays: number;
  baseRatio: number;
  remainder: number;
  dailyEstimates: DailyEstimateRow[];
  poolCount: number;
  warning: 'POOL_COUNT_LOW' | null;
}

export interface CalculateDailyEstimateOptions {
  calendarSource?: CalendarSource;
  startDate?: string; // YYYY-MM-DD（選填，預設 ym 整月第一天）
  endDate?: string; // YYYY-MM-DD（選填，預設 ym 整月最後一天）
}

export interface Stage0ListCountResult {
  listNo: string;
  count: number;
}

// ===========================================================================
// F049 v2.0 Part B：部門維度每日分派可行性（AD-E07-v3.6）
// ===========================================================================

/** actor 型別（複用 SectionChiefScopeService.ActorUser；對外導出供 controller / test 使用）。 */
export type ActorLike = ActorUser;

export interface ComputeDeptEstimateOptions {
  calendarSource?: CalendarSource;
  startDate?: string; // YYYY-MM-DD（選填，預設 ym 整月第一天；僅限縮 days[] 顯示子集）
  endDate?: string; // YYYY-MM-DD（選填，預設 ym 整月最後一天）
  listNo?: string; // absent = aggregated（全名單彙總）；指定 = single-list 鑽探
  actor?: ActorLike | null;
}

/** §21 BR-16 / OQ-F049-07：結構性警告（非 HTTP 錯誤碼）。 */
export interface Stage0DeptWarning {
  code:
    | 'DEPT_HEADCOUNT_ZERO'
    | 'SCOPE_UNRESOLVED'
    | 'STAGE0_LIST_ESTIMATE_PARTIAL'
    | 'CALENDAR_EMPTY';
  deptCode?: string;
  listNo?: string;
  message?: string;
}

export interface Stage0DeptCell {
  deptCode: string;
  /** Math.round(dept_real)；休息日 = 0 */
  cases: number;
  /** Math.round(cases / activeHeadcount)；headcount=0 → null；休息日 → null */
  perPerson: number | null;
  /** perPerson > threshold；threshold=null → false */
  overThreshold: boolean;
}

export interface Stage0DeptDay {
  date: string; // YYYY-MM-DD
  weekday: string;
  isWorkday: boolean;
  /** 全名單總量（不依賴部門比例）；休息日 = 0；處長模式 = null（無全部門合計語意，BR-13） */
  orgTotal: number | null;
  /** Σ 已設定比例部門件數；休息日 = 0；處長模式 = null */
  deptAssignedTotal: number | null;
  /** org_total − deptAssignedTotal（恆 ≥ 0）；休息日 = 0；處長模式 = null */
  gap: number | null;
  /** 已設定比例部門列，依 deptCode ASC（I-DEPT-ORDER-01）；休息日 = [] */
  deptCells: Stage0DeptCell[];
}

export interface Stage0Department {
  deptCode: string;
  deptName: string;
  activeHeadcount: number;
}

export interface Stage0DeptScope {
  role: 'director' | 'section_chief' | 'admin';
  deptCode: string | null;
  scoped: boolean;
}

export interface Stage0DeptEstimateResult {
  ym: string;
  mode: 'aggregated' | 'single-list';
  listNo: string | null;
  calendarSource: CalendarSource;
  startDate: string;
  endDate: string;
  scope: Stage0DeptScope;
  departments: Stage0Department[];
  days: Stage0DeptDay[];
  threshold: number | null;
  warnings: Stage0DeptWarning[];
  poolCount: number;
  poolWarning: 'POOL_COUNT_LOW' | null;
}

const WEEKDAY_TW = ['日', '一', '二', '三', '四', '五', '六'];

/**
 * F049 v1.3 純函式：依日期 / rest_flg / 模式判定 isWorkday 與 skipReason。
 *
 * isWorkday / weekday 在 TS 端計算（非 SQL EXTRACT(DOW)），確保 SQLite e2e 相容。
 *   - weekday      ：isWorkday = rest_flg==='0'；非工作日 skipReason：週六/日→'週末'，否則→'國定假日'
 *   - weekday-only ：isWorkday = 非週末（getDay∉{0,6}）；週末→'週末'（假日視為工作日）
 *   - all          ：全部 isWorkday=true、skipReason=null
 */
export function resolveCalendarDay(
  date: Date,
  restFlg: string,
  mode: CalendarSource,
): { isWorkday: boolean; skipReason: SkipReason | null } {
  const dow = date.getUTCDay(); // 0=日, 6=六
  const isWeekend = dow === 0 || dow === 6;

  if (mode === 'all') {
    return { isWorkday: true, skipReason: null };
  }
  if (mode === 'weekday-only') {
    if (isWeekend) return { isWorkday: false, skipReason: '週末' };
    return { isWorkday: true, skipReason: null };
  }
  // weekday（預設）：rest_flg='0' 才是工作日
  if (restFlg === '0') {
    return { isWorkday: true, skipReason: null };
  }
  // 非工作日：週末 vs 國定假日
  if (isWeekend) return { isWorkday: false, skipReason: '週末' };
  return { isWorkday: false, skipReason: '國定假日' };
}

/**
 * F101 / AD-E07-29 §3.4：純函式抽取——由 (calendar_date, rest_flg) 列產出工作日千分比表。
 *
 * 與 calculateDailyEstimate 共用同一算法（baseRatio=FLOOR(1000/workingDays) + calendar_date DESC
 * 前 remainder 個 +1），使月跑 Stage 4 ASSIGNDAY（distributeStage3to4）與 Stage 0 試算同源
 * （I-RUN-EST-01）。回傳僅工作日（isWorkday=true），依 calendar_date ASC 排序。
 *
 * @param rows           ob_calendar 列（calendar_date 為 Date | 'YYYY-MM-DD' 字串）
 * @param calendarSource 工作日來源模式（預設 weekday，rest_flg='0'）
 * @returns 工作日千分比表 `[{ casedt: 'YYYY-MM-DD', ratioPerMille }]`（Σ=1000；空 → []）
 */
export function computeWorkingDayRatios(
  rows: Array<{ calendar_date: Date | string; rest_flg: string }>,
  calendarSource: CalendarSource = 'weekday',
): Array<{ casedt: string; ratioPerMille: number }> {
  const toUtc = (value: Date | string): Date => {
    if (value instanceof Date) {
      return new Date(
        Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), value.getUTCDate()),
      );
    }
    const [y, m, d] = String(value)
      .slice(0, 10)
      .split('-')
      .map((v) => parseInt(v, 10));
    return new Date(Date.UTC(y, (m || 1) - 1, d || 1));
  };
  const fmt = (dt: Date): string => {
    const y = dt.getUTCFullYear();
    const mm = String(dt.getUTCMonth() + 1).padStart(2, '0');
    const dd = String(dt.getUTCDate()).padStart(2, '0');
    return `${y}-${mm}-${dd}`;
  };

  const days = rows
    .map((row) => {
      const dt = toUtc(row.calendar_date);
      const { isWorkday } = resolveCalendarDay(dt, row.rest_flg, calendarSource);
      return { date: fmt(dt), isWorkday };
    })
    .sort((a, b) => a.date.localeCompare(b.date)); // calendar_date ASC

  const workdays = days.filter((d) => d.isWorkday);
  const workingDays = workdays.length;
  if (workingDays === 0) return [];
  const baseRatio = Math.floor(1000 / workingDays);
  const remainder = 1000 % workingDays;
  // 餘數補：工作日按 calendar_date DESC 前 remainder 個 +1（與 calculateDailyEstimate 一致）。
  const bonus = new Set(
    workdays
      .slice()
      .sort((a, b) => b.date.localeCompare(a.date))
      .slice(0, remainder)
      .map((d) => d.date),
  );
  return workdays.map((d) => ({
    casedt: d.date,
    ratioPerMille: bonus.has(d.date) ? baseRatio + 1 : baseRatio,
  }));
}

/**
 * Stage0EstimateService — F049 Stage 0 估算 service
 *
 * 提供：
 *   - calculateDailyEstimate(ym)：每日預估件數表（依 ob_calendar 工作日 + 平均分配）
 *   - estimateListCount(listNo, opts?)：單一 LIST_NO 套用 ob_list_definition 篩選後 COUNT
 *
 * 本 service 為唯讀，不寫入任何 ob_pool_data_list / assignment_run 表（spec BR-1）。
 */
@Injectable()
export class Stage0EstimateService {
  private readonly logger = new Logger(Stage0EstimateService.name);

  constructor(
    @InjectRepository(ObListDefinition)
    private readonly listRepo: Repository<ObListDefinition>,
    @InjectRepository(ObPoolData)
    private readonly poolRepo: Repository<ObPoolData>,
    // F092：去重查詢（近 3 個月已派 custo_no）需 ob_pool_data_list；
    // executeStage1Chain 以參數注入此 repo（非 NestJS Injectable），無循環依賴（AD-E07-23 §23.5）。
    @InjectRepository(ObPoolDataList)
    private readonly poolDataListRepo: Repository<ObPoolDataList>,
    @InjectRepository(ObCalendar)
    private readonly calendarRepo: Repository<ObCalendar>,
    // F049 v2.0 Part B：部門投影層（per-list 部門比例 + 在職人數）
    @InjectRepository(ObDeptPct)
    private readonly deptPctRepo: Repository<ObDeptPct>,
    @InjectRepository(ObEmphire)
    private readonly emphireRepo: Repository<ObEmphire>,
    // §17 處長唯讀 scope（複用 listLists 之 getScopeDeptCode → ob_dept_pct.obdeptid 模式）
    private readonly scopeService: SectionChiefScopeService,
  ) {}

  /**
   * F049 v1.3 AC-1 + AC-2 + AC-3：每日 ratio 估算表（Design A，total-agnostic）
   *
   * 規則（§5.1 / §13 AD-E07-8 千分位 ratio 模型）：
   *   - 範圍：calendar_date BETWEEN startDate AND endDate（預設 ym 整月）
   *   - 取 ob_calendar 之 (calendar_date, rest_flg)，於 TS 端依 calendarSource 判定 isWorkday/skipReason
   *     （不使用 SQL EXTRACT(DOW)，確保 SQLite e2e 相容）
   *   - workingDays = Σ isWorkday
   *   - baseRatio = FLOOR(1000 / workingDays)；remainder = 1000 mod workingDays
   *   - 工作日按 calendar_date DESC 排序，前 remainder 個 ratioPerMille = baseRatio+1，其餘 = baseRatio
   *   - 非工作日 ratioPerMille = 0；workingDays=0 時 baseRatio/remainder=0、全 0（不除零）
   *   - poolCount：ob_pool_data 全表筆數（共享池），僅供 AC-3 Pool 偏低警示
   *   - warning：poolCount < STAGE0_POOL_WARN_THRESHOLD（預設 1000）
   *
   * 本 API 不回傳 total / 每日件數；件數由前端以 round(ratioPerMille/1000 × total) 計算。
   */
  async calculateDailyEstimate(
    ym: string,
    opts: CalculateDailyEstimateOptions = {},
  ): Promise<Stage0DailyEstimateResult> {
    const calendarSource: CalendarSource = opts.calendarSource ?? 'weekday';
    const month = this.monthRange(ym);
    const startYmd = opts.startDate ?? this.formatDate(month.startDate);
    const endYmd = opts.endDate ?? this.formatDate(month.endDate);

    // 1) 範圍內所有日期（含跳過日），依 calendar_date ASC
    //    以 YYYY-MM-DD 字串為界，避免 Date 物件被 driver 序列化為 local-time 字串
    //    造成跨時區日期 ±1（date 欄位字串比較在 SQLite / PostgreSQL 皆正確）。
    const rows = await this.calendarRepo.find({
      where: { calendar_date: Between(startYmd as never, endYmd as never) },
      order: { calendar_date: 'ASC' },
    });

    // 2) TS 端判定 isWorkday / skipReason / weekday
    const days = rows.map((row) => {
      const d = this.toUtcDate(row.calendar_date);
      const { isWorkday, skipReason } = resolveCalendarDay(
        d,
        row.rest_flg,
        calendarSource,
      );
      return {
        date: this.formatDate(d),
        weekday: WEEKDAY_TW[d.getUTCDay()],
        isWorkday,
        skipReason,
      };
    });

    // 3) 千分位 ratio 分配
    const workingDays = days.filter((d) => d.isWorkday).length;
    const baseRatio = workingDays > 0 ? Math.floor(1000 / workingDays) : 0;
    const remainder = workingDays > 0 ? 1000 % workingDays : 0;

    // 餘數補：工作日按 calendar_date DESC 排序，前 remainder 個 +1
    const bonusDates = new Set(
      days
        .filter((d) => d.isWorkday)
        .sort((a, b) => b.date.localeCompare(a.date))
        .slice(0, remainder)
        .map((d) => d.date),
    );

    const dailyEstimates: DailyEstimateRow[] = days.map((d) => ({
      date: d.date,
      weekday: d.weekday,
      isWorkday: d.isWorkday,
      skipReason: d.skipReason,
      ratioPerMille: !d.isWorkday
        ? 0
        : bonusDates.has(d.date)
          ? baseRatio + 1
          : baseRatio,
    }));

    // 4) Pool 筆數（共享池，無 list_no 概念）+ 警示門檻
    const poolCount = await this.poolRepo.count();
    const threshold = this.resolveWarnThreshold();
    const warning: Stage0DailyEstimateResult['warning'] =
      poolCount < threshold ? 'POOL_COUNT_LOW' : null;

    return {
      ym,
      calendarSource,
      startDate: startYmd,
      endDate: endYmd,
      workingDays,
      baseRatio,
      remainder,
      dailyEstimates,
      poolCount,
      warning,
    };
  }

  /**
   * F049 AC-4 + F092 AC-1：單一 LIST_NO 即時試算（完整 Stage 1 篩選鏈唯讀 dry-run）
   *
   * F092 升級（AD-E07-23 §23.5 / DP-AD23-1）：
   *   - 內部改呼叫 `executeStage1Chain(list, workdt, poolRepo, poolDataListRepo, { dryRun: true })`，
   *     取 `result.count`，取代原欄位篩選版 COUNT（F049 v1.2 buildPoolCountQuery 路徑）。
   *   - 估算涵蓋完整鏈：欄位篩選 + MONTH_CNT 期別過濾 + 近 3 個月去重 + 特殊 DELETE，
   *     與正式月跑 Stage 1 案件數嚴格一致（與 AssignmentRunPipelineService 同源 executeStage1Chain）。
   *   - dry-run 唯讀：不寫 ob_pool_data_list / assignment_run / assignment_run_snapshot（F092 AC-2 / BR-2）。
   *   - EMPTY_CONDITIONS → result.skipped=true → count=0（與月跑 skip 一致；F049 BR-5）。
   *
   * workdt 推導：以名單 project_workym（'YYYYMM'）轉為當月 1 日 Date（PROJECT_WORKYM + '01'），
   * 與 AssignmentRunPipelineService.parseWorkdt 同規則（去重視窗 + 年資特殊 DELETE 取當年）。
   *
   * @throws 404 ASSIGNMENT_LIST_NOT_FOUND — list_no 不存在或 status = 'inactive'
   * @throws 500 STAGE0_ESTIMATE_TIMEOUT — 查詢超過 timeoutMs（spec BR-3 / F049 AC-5 預設 10s）
   */
  async estimateListCount(
    listNo: string,
    opts: { timeoutMs?: number } = {},
  ): Promise<Stage0ListCountResult> {
    const timeoutMs = opts.timeoutMs ?? 10_000;

    const def = await this.listRepo.findOne({ where: { list_no: listNo } });
    if (!def || def.status === 'inactive') {
      throw new NotFoundException({
        error: ERROR_CODES.ASSIGNMENT_LIST_NOT_FOUND,
        message: ERROR_MESSAGES.ASSIGNMENT_LIST_NOT_FOUND,
      });
    }

    // timeoutMs = 0 即視為立即逾時（測試 / 強制中斷）
    if (timeoutMs <= 0) {
      throw new InternalServerErrorException({
        error: ERROR_CODES.STAGE0_ESTIMATE_TIMEOUT,
        message: ERROR_MESSAGES.STAGE0_ESTIMATE_TIMEOUT,
      });
    }

    const countPromise = this.dryRunChainCount(def);
    const timeoutPromise = new Promise<never>((_, reject) =>
      setTimeout(
        () =>
          reject(
            new InternalServerErrorException({
              error: ERROR_CODES.STAGE0_ESTIMATE_TIMEOUT,
              message: ERROR_MESSAGES.STAGE0_ESTIMATE_TIMEOUT,
            }),
          ),
        timeoutMs,
      ),
    );

    try {
      const count = await Promise.race([countPromise, timeoutPromise]);
      return { listNo, count };
    } catch (e) {
      if (
        e instanceof InternalServerErrorException ||
        e instanceof NotFoundException
      ) {
        throw e;
      }
      this.logger.error(`estimateListCount failed: ${(e as Error).message}`);
      throw new InternalServerErrorException({
        error: ERROR_CODES.STAGE0_ESTIMATE_TIMEOUT,
        message: ERROR_MESSAGES.STAGE0_ESTIMATE_TIMEOUT,
      });
    }
  }

  /**
   * F049 v2.0 Part B（§14~§22 / AD-E07-v3.6）：部門維度每日分派可行性投影。
   *
   * 分層（每層只在前一層之上加法，不分叉底層）：
   *   L0 千分位 ratio（computeWorkingDayRatios，整月工作日，I-RUN-EST-01 唯一來源）
   *   L1 per-list 估算 list_total[L]（primary：stage0_estimate_count 物化；fallback：estimateListCount）
   *   L2 聚合（全名單彙總 / 單一名單鑽探）
   *   L3 部門投影 dept_real = Σ_L(list_total × ration/100 × dpm/1000)；org / gap
   *   L4 處長唯讀 scope（service 層強制 dept filter，安全邊界）
   *   L5 可行性 per_person = round(cases / active_headcount) + 門檻警示
   *
   * 唯讀：不寫入任何分派紀錄（AC-AGG-5 / BR-1）。捨入：最終每格 Math.round 一次（§16.3）。
   */
  async computeDeptEstimate(
    ym: string,
    opts: ComputeDeptEstimateOptions = {},
  ): Promise<Stage0DeptEstimateResult> {
    const calendarSource: CalendarSource = opts.calendarSource ?? 'weekday';
    const month = this.monthRange(ym);
    const monthStartYmd = this.formatDate(month.startDate);
    const monthEndYmd = this.formatDate(month.endDate);
    const startYmd = opts.startDate ?? monthStartYmd;
    const endYmd = opts.endDate ?? monthEndYmd;
    const mode: 'aggregated' | 'single-list' = opts.listNo
      ? 'single-list'
      : 'aggregated';
    const actor = opts.actor ?? null;
    const warnings: Stage0DeptWarning[] = [];

    // ---- L4 scope 判定（§17 / AD-E07-v3.6 §6）----
    const isSectionChief =
      actor?.businessRole === 'section_chief' && actor?.role !== 'admin';
    const scopeRole: Stage0DeptScope['role'] =
      actor?.role === 'admin'
        ? 'admin'
        : actor?.businessRole === 'section_chief'
          ? 'section_chief'
          : 'director';
    let scopeDeptCode: string | null = null;
    if (isSectionChief) {
      scopeDeptCode = await this.scopeService.getScopeDeptCode(actor!.userId);
      if (scopeDeptCode === null) {
        warnings.push({
          code: 'SCOPE_UNRESOLVED',
          message:
            '無法識別您的轄區部門，請聯繫系統管理員確認帳號 ob_emphire 設定。',
        });
        this.logger.warn(
          '[Stage0Estimate] section_chief scope applied: null → empty result',
        );
      } else {
        this.logger.log(
          `[Stage0Estimate] section_chief scope applied dept_code=${scopeDeptCode}`,
        );
      }
    }
    const scope: Stage0DeptScope = {
      role: scopeRole,
      deptCode: isSectionChief ? scopeDeptCode : null,
      scoped: isSectionChief,
    };

    // ---- L0 整月 ratio（dpm）；複用 computeWorkingDayRatios（不分叉，I-RUN-EST-01）----
    const monthRows = await this.calendarRepo.find({
      where: { calendar_date: Between(monthStartYmd as never, monthEndYmd as never) },
      order: { calendar_date: 'ASC' },
    });
    const ratios = computeWorkingDayRatios(
      monthRows.map((r) => ({
        calendar_date: r.calendar_date,
        rest_flg: r.rest_flg,
      })),
      calendarSource,
    );
    const dpmMap = new Map<string, number>();
    for (const r of ratios) dpmMap.set(r.casedt, r.ratioPerMille);

    // 顯示範圍（startDate..endDate；含休息日）
    const rangeRows = monthRows.filter((r) => {
      const ymd = this.formatDate(this.toUtcDate(r.calendar_date));
      return ymd >= startYmd && ymd <= endYmd;
    });

    // ---- L1 / L2 名單集合 + list_total ----
    let lists = await this.listRepo.find({
      where: { project_workym: ym, status: 'active' },
    });
    if (mode === 'single-list') {
      lists = lists.filter((l) => l.list_no === opts.listNo);
    }
    const listNos = lists.map((l) => l.list_no);

    const listTotals = new Map<string, number>();
    const fallbackLists: ObListDefinition[] = [];
    for (const l of lists) {
      if (l.stage0_estimate_count != null) {
        listTotals.set(l.list_no, l.stage0_estimate_count);
      } else {
        fallbackLists.push(l);
      }
    }
    if (fallbackLists.length > 0) {
      const timeoutMs = this.resolveDeptTimeoutMs();
      await Promise.all(
        fallbackLists.map(async (l) => {
          try {
            const r = await this.raceTimeout(
              this.estimateListCount(l.list_no),
              timeoutMs,
            );
            listTotals.set(l.list_no, r.count);
          } catch {
            warnings.push({
              code: 'STAGE0_LIST_ESTIMATE_PARTIAL',
              listNo: l.list_no,
              message: `名單 ${l.list_no} 估算逾時，已從本次合計排除。`,
            });
          }
        }),
      );
    }

    // ---- L3 ob_dept_pct（批次）+ scope filter ----
    let deptPctRows: ObDeptPct[] =
      listNos.length > 0
        ? await this.deptPctRepo.find({
            where: { project_workym: ym, list_no: In(listNos) },
          })
        : [];
    if (isSectionChief) {
      deptPctRows =
        scopeDeptCode === null
          ? []
          : deptPctRows.filter((r) => (r.obdeptid ?? '').trim() === scopeDeptCode);
    }

    const rationMap = new Map<string, Map<string, number>>();
    const deptNameMap = new Map<string, string>();
    const deptCodeSet = new Set<string>();
    for (const r of deptPctRows) {
      const deptCode = (r.obdeptid ?? '').trim();
      if (!deptCode) continue;
      deptCodeSet.add(deptCode);
      if (!rationMap.has(r.list_no)) rationMap.set(r.list_no, new Map());
      rationMap.get(r.list_no)!.set(deptCode, parseFloat(String(r.ration)) || 0);
      const nm = (r.obdeptnm ?? '').trim();
      if (nm && !deptNameMap.has(deptCode)) deptNameMap.set(deptCode, nm);
    }
    const deptCodes = Array.from(deptCodeSet).sort((a, b) =>
      a.localeCompare(b),
    ); // I-DEPT-ORDER-01

    // ---- L5 在職人數（批次 TRIM(dept_code) COUNT，SQLite/PG 相容）----
    // departments 之建立延後至逐日投影之後：須先知道每個候選部門整期 cases 總和，
    // 才能隱藏「整期 0 件」部門（AC-DEPT-2），並只對保留部門發 DEPT_HEADCOUNT_ZERO。
    const staffMap = await this.loadDeptStaff();

    const threshold = this.resolvePerPersonThreshold();
    const poolCount = await this.poolRepo.count();
    const poolWarnThreshold = this.resolveWarnThreshold();
    const poolWarning: 'POOL_COUNT_LOW' | null =
      poolCount < poolWarnThreshold ? 'POOL_COUNT_LOW' : null;

    // ---- 逐日部門投影（§16.1 / §16.3）----
    const days: Stage0DeptDay[] = rangeRows.map((row) => {
      const d = this.toUtcDate(row.calendar_date);
      const date = this.formatDate(d);
      const weekday = WEEKDAY_TW[d.getUTCDay()];
      const { isWorkday } = resolveCalendarDay(d, row.rest_flg, calendarSource);
      const dpm = isWorkday ? (dpmMap.get(date) ?? 0) : 0;

      if (!isWorkday) {
        return {
          date,
          weekday,
          isWorkday: false,
          orgTotal: isSectionChief ? null : 0,
          deptAssignedTotal: isSectionChief ? null : 0,
          gap: isSectionChief ? null : 0,
          deptCells: [],
        };
      }

      let orgReal = 0;
      const deptReal = new Map<string, number>();
      for (const deptCode of deptCodes) deptReal.set(deptCode, 0);
      for (const l of lists) {
        const total = listTotals.get(l.list_no);
        if (total == null) continue; // fallback 逾時排除
        orgReal += (total * dpm) / 1000;
        const lr = rationMap.get(l.list_no);
        if (lr) {
          for (const [deptCode, pct] of lr) {
            deptReal.set(
              deptCode,
              (deptReal.get(deptCode) ?? 0) + ((total * pct) / 100) * dpm / 1000,
            );
          }
        }
      }

      let assignedReal = 0;
      const deptCells: Stage0DeptCell[] = deptCodes.map((deptCode) => {
        const real = deptReal.get(deptCode) ?? 0;
        assignedReal += real;
        const cases = Math.round(real);
        const headcount = staffMap.get(deptCode)?.count ?? 0;
        const perPerson = headcount > 0 ? Math.round(cases / headcount) : null;
        const overThreshold =
          perPerson !== null && threshold !== null && perPerson > threshold;
        return { deptCode, cases, perPerson, overThreshold };
      });

      return {
        date,
        weekday,
        isWorkday: true,
        orgTotal: isSectionChief ? null : Math.round(orgReal),
        deptAssignedTotal: isSectionChief ? null : Math.round(assignedReal),
        gap: isSectionChief ? null : Math.round(orgReal - assignedReal),
        deptCells,
      };
    });

    // ---- 整期 0 件部門隱藏（AC-DEPT-2）----
    // 算每個候選部門整期（顯示工作日）cases 合計，只保留 > 0 者，並從每日 deptCells 移除。
    // 排除者 cases 恆為 0（實機驗證：非電銷部門 ration=0）→ 不改變 org_total / deptAssignedTotal / gap
    // （若存在 ration>0 但每日捨入為 0 之極小部門，其 <0.5/日 殘差落於 §16.3 容差內）。
    const deptCaseTotals = new Map<string, number>();
    for (const day of days) {
      for (const cell of day.deptCells) {
        deptCaseTotals.set(
          cell.deptCode,
          (deptCaseTotals.get(cell.deptCode) ?? 0) + cell.cases,
        );
      }
    }
    const keptDeptCodes = deptCodes.filter(
      (dc) => (deptCaseTotals.get(dc) ?? 0) > 0,
    );
    const keptSet = new Set(keptDeptCodes);
    for (const day of days) {
      if (day.deptCells.length > 0) {
        day.deptCells = day.deptCells.filter((c) => keptSet.has(c.deptCode));
      }
    }

    // departments[]：只列保留部門（deptCode ASC 已於 deptCodes 排序，I-DEPT-ORDER-01）；
    // 僅對「保留且在職人數 0」之部門發 DEPT_HEADCOUNT_ZERO（被隱藏的 0 件部門不發警告）。
    const departments: Stage0Department[] = keptDeptCodes.map((deptCode) => {
      const staff = staffMap.get(deptCode);
      const activeHeadcount = staff?.count ?? 0;
      if (activeHeadcount === 0) {
        warnings.push({
          code: 'DEPT_HEADCOUNT_ZERO',
          deptCode,
          message: `${deptCode} 在職人數為 0，請確認 ob_emphire 資料是否已同步。`,
        });
      }
      return {
        deptCode,
        deptName: deptNameMap.get(deptCode) ?? staff?.name ?? deptCode,
        activeHeadcount,
      };
    });

    // 工作日曆無資料 → days/departments 皆空（非 0 案件，而是無法計算）。發警示讓前端能明確提示
    //   使用者「工作日曆無資料」而非靜默顯示 0（常見於 ob_calendar 未載入 / 被清空；對齊 poolWarning）。
    const workingDayCount = days.filter((d) => d.isWorkday).length;
    if (workingDayCount === 0) {
      warnings.push({
        code: 'CALENDAR_EMPTY',
        message: `工作日曆（ob_calendar）於 ${startYmd}~${endYmd} 無工作日資料，無法計算每日分派量。請先執行「行事曆 ETL」載入工作日曆後再試算。`,
      });
    }

    return {
      ym,
      mode,
      listNo: mode === 'single-list' ? (opts.listNo ?? null) : null,
      calendarSource,
      startDate: startYmd,
      endDate: endYmd,
      scope,
      departments,
      days,
      threshold,
      warnings,
      poolCount,
      poolWarning,
    };
  }

  /** 在職人數 + 部門名稱（批次 TRIM(dept_code) GROUP BY；SQLite / PG 均相容）。 */
  private async loadDeptStaff(): Promise<
    Map<string, { count: number; name: string | null }>
  > {
    const rows = await this.emphireRepo
      .createQueryBuilder('e')
      .select('TRIM(e.dept_code)', 'dept_code')
      .addSelect('COUNT(*)', 'cnt')
      .addSelect('MAX(e.dept_name)', 'dept_name')
      // 在職判定對齊 legacy（NULL 或 resign_date >= 系統日；哨兵 9999-12-31）；勿用 `IS NULL`。
      .where(activeEmphireCondition('e'), { sysDate: todayYmd() })
      .andWhere('e.dept_code IS NOT NULL')
      .groupBy('TRIM(e.dept_code)')
      .getRawMany<{ dept_code: string; cnt: string; dept_name: string | null }>();
    const map = new Map<string, { count: number; name: string | null }>();
    for (const r of rows) {
      const code = (r.dept_code ?? '').trim();
      if (!code) continue;
      map.set(code, {
        count: parseInt(String(r.cnt), 10) || 0,
        name: r.dept_name,
      });
    }
    return map;
  }

  /** Promise 逾時保護（per-list fallback；超時則 reject，呼叫端記 PARTIAL warning）。 */
  private raceTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
    let timer: ReturnType<typeof setTimeout>;
    const t = new Promise<never>((_, reject) => {
      timer = setTimeout(
        () => reject(new Error('STAGE0_DEPT_ESTIMATE_TIMEOUT')),
        ms,
      );
    });
    return Promise.race([p, t]).finally(() => clearTimeout(timer));
  }

  /** OQ-F049-03：每人每日上限門檻（env；未設 / 非正整數 → null = 不標紅）。 */
  private resolvePerPersonThreshold(): number | null {
    const raw = process.env.STAGE0_MAX_CASES_PER_PERSON_PER_DAY;
    if (!raw) return null;
    const n = parseInt(raw, 10);
    return Number.isFinite(n) && n > 0 ? n : null;
  }

  /** OQ-F049-02：部門投影 fallback 整體逾時（env；預設 30000ms）。 */
  private resolveDeptTimeoutMs(): number {
    const raw = process.env.STAGE0_DEPT_ESTIMATE_TIMEOUT_MS;
    const n = raw ? parseInt(raw, 10) : NaN;
    return Number.isFinite(n) && n > 0 ? n : 30_000;
  }

  // -------------------------------------------------------------------------
  // 內部：完整 Stage 1 篩選鏈唯讀 dry-run COUNT（F092 / AD-E07-23 §23.5）
  //
  // 取代 F049 v1.2 欄位篩選版 buildPoolCountQuery。改呼叫與月跑同源的
  // executeStage1Chain({ dryRun: true })，使試算涵蓋：
  //   ① 欄位篩選（buildStage1WhereConditions，路徑 A/B 不變）
  //   ② MONTH_CNT 期別過濾
  //   ③ 詐騙白牌 / 中結強案 / 中結 / 年資 特殊 DELETE
  //   ④ 近 3 個月去重（查 ob_pool_data_list）
  // 確保 estimate 數字 ≡ 正式月跑 Stage 1 案件數（DP-AD23-1 完整鏈精確模式）。
  //
  // dry-run 唯讀（F092 AC-2 / BR-2）：executeStage1Chain dryRun:true 僅 SELECT，
  // 不寫 ob_pool_data_list / assignment_run / assignment_run_snapshot。
  //
  // EMPTY_CONDITIONS（含空 conditions / wildcard 後零 fragment）→ result.skipped=true →
  // count=0（與月跑 Stage 1 skip 該名單一致；F049 BR-5）。
  // -------------------------------------------------------------------------

  private async dryRunChainCount(def: ObListDefinition): Promise<number> {
    const workdt = this.deriveWorkdt(def.project_workym);

    // F099 P2 / AD-E07-42 P3a：PG 與 MSSQL 皆走 SELECT COUNT(*) 下推（與月跑 run 之 INSERT…SELECT 共用
    // 同源 buildStage1Sql[Mssql] core，I-RUN-EST-01）；非 PG/MSSQL（SQLite 測試）沿用 executeStage1Chain
    // dry-run（JS oracle，PG-only CAST 不適用）。DISPATCH-002：三分支中 mssql 走 estimateStage1SqlCountMssql。
    const dbType = process.env.DB_TYPE;
    if (dbType === 'postgres' || dbType === 'mssql') {
      const estimateFn =
        dbType === 'mssql' ? estimateStage1SqlCountMssql : estimateStage1SqlCount;
      const { count, core } = await estimateFn(
        this.poolRepo.manager,
        def,
        workdt,
        this.poolDataListRepo,
      );
      for (const w of core.warnings) {
        this.logger.warn(
          `[Stage0Estimate] sql warning list_no=${def.list_no} code=${w.code} column=${(w as { columnName?: string }).columnName ?? '-'} reason=${w.reason}`,
        );
      }
      if (core.skip) {
        this.logger.warn(
          `[Stage0Estimate] list ${def.list_no} (${def.list_nm}) skipped (${core.skipReason}) → count=0`,
        );
      }
      return count;
    }

    const result = await stage1Chain.executeStage1Chain(
      def,
      workdt,
      this.poolRepo,
      this.poolDataListRepo,
      { dryRun: true },
    );

    // 非阻擋型 warning 紀錄（與月跑 Stage 1 一致）
    for (const w of result.warnings) {
      this.logger.warn(
        `[Stage0Estimate] chain warning list_no=${def.list_no} code=${w.code} column=${(w as { columnName?: string }).columnName ?? '-'} reason=${w.reason}`,
      );
    }

    if (result.skipped) {
      this.logger.warn(
        `[Stage0Estimate] list ${def.list_no} (${def.list_nm}) skipped (${result.skipReason}) → count=0`,
      );
    }

    return result.count;
  }

  /**
   * F092：PROJECT_WORKYM（'YYYYMM' 字串）→ workdt Date（當月 1 日，本地時間）。
   * 對應 SP `@WORKDT = PROJECT_WORKYM + '01'`，與 AssignmentRunPipelineService.parseWorkdt 同規則。
   * project_workym 缺值時退化為當前月份（dry-run 去重視窗仍可計算，不阻擋估算）。
   */
  private deriveWorkdt(projectWorkym: string | null): Date {
    if (projectWorkym && /^\d{6}$/.test(projectWorkym)) {
      const year = parseInt(projectWorkym.slice(0, 4), 10);
      const month = parseInt(projectWorkym.slice(4, 6), 10); // 1-based
      return new Date(year, month - 1, 1);
    }
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), 1);
  }

  // -------------------------------------------------------------------------
  // 內部：月份範圍 / 警示門檻 / 日期格式
  // -------------------------------------------------------------------------

  private monthRange(ym: string): { startDate: Date; endDate: Date } {
    const y = parseInt(ym.slice(0, 4), 10);
    const m = parseInt(ym.slice(4, 6), 10);
    const start = new Date(Date.UTC(y, m - 1, 1));
    const end = new Date(Date.UTC(y, m, 0)); // 該月最後一天
    return { startDate: start, endDate: end };
  }

  /** 'YYYY-MM-DD' → UTC midnight Date */
  private parseYmd(ymd: string): Date {
    const [y, m, d] = ymd.split('-').map((v) => parseInt(v, 10));
    return new Date(Date.UTC(y, (m || 1) - 1, d || 1));
  }

  /**
   * ob_calendar.calendar_date 在不同 driver 回傳型別不一：
   *   - better-sqlite3 date 欄位 → 'YYYY-MM-DD' 字串
   *   - PostgreSQL date 欄位 → Date 物件
   * 統一轉為 UTC midnight Date，避免本地時區造成日期 ±1。
   */
  private toUtcDate(value: Date | string): Date {
    if (value instanceof Date) {
      return new Date(
        Date.UTC(
          value.getUTCFullYear(),
          value.getUTCMonth(),
          value.getUTCDate(),
        ),
      );
    }
    return this.parseYmd(String(value).slice(0, 10));
  }

  private resolveWarnThreshold(): number {
    const raw = process.env.STAGE0_POOL_WARN_THRESHOLD;
    const n = raw ? parseInt(raw, 10) : NaN;
    return Number.isFinite(n) && n > 0 ? n : 1000;
  }

  private formatDate(d: Date): string {
    const y = d.getUTCFullYear();
    const m = String(d.getUTCMonth() + 1).padStart(2, '0');
    const dd = String(d.getUTCDate()).padStart(2, '0');
    return `${y}-${m}-${dd}`;
  }
}
