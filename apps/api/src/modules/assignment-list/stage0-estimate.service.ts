import {
  Injectable,
  InternalServerErrorException,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Between, Repository } from 'typeorm';
import { ObListDefinition } from '@/database/entities/ob-list-definition.entity';
import { ObPoolData } from '@/database/entities/ob-pool-data.entity';
import { ObCalendar } from '@/database/entities/ob-calendar.entity';
import { buildStage1WhereConditions } from '@/modules/assignment/stage1/stage1-query-composer';
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
    @InjectRepository(ObCalendar)
    private readonly calendarRepo: Repository<ObCalendar>,
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
   * F049 AC-4：單一 LIST_NO 即時試算
   *
   * - 讀取 list_no 對應 ob_list_definition 之篩選條件
   * - 對 ob_pool_data 套用相同 WHERE → COUNT
   * - 不寫入任何分派結果
   *
   * @throws 404 ASSIGNMENT_LIST_NOT_FOUND — list_no 不存在或 status = 'inactive'
   * @throws 500 STAGE0_ESTIMATE_TIMEOUT — 查詢超過 timeoutMs（spec BR-3 預設 10s）
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

    const countPromise = this.buildPoolCountQuery(def);
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

  // -------------------------------------------------------------------------
  // 內部：建構 ob_pool_data COUNT query
  //
  // F049 v1.2（AC-4 / BR-5 / §18.5）：直接複用月跑 Stage 1 之 buildStage1WhereConditions()
  // 演算法，確保試算與實際月跑逐欄位一致（消除 v1.1 以 `=` 比對 `$$` 多值字串 + caseyear
  // 比到 ob_pool_data.caseyear 西元年欄位的脫節缺陷）。
  //
  // 用法與 AssignmentRunPipelineService.runStage1ForList 完全一致：
  //   - skipReason='EMPTY_CONDITIONS'（含空 conditions / wildcard 後零 fragment）→ COUNT=0
  //     （BR-5，與月跑 Stage 1 skip 該名單行為一致）
  //   - 否則 createQueryBuilder('ob_pool_data').where(fragment.where, fragment.params).getCount()
  //     （composer 產生 bare quoted 欄位名如 `"year_cnt" IN (...)`，無 alias 前綴）
  // -------------------------------------------------------------------------

  private async buildPoolCountQuery(def: ObListDefinition): Promise<number> {
    const fragment = buildStage1WhereConditions(def);

    // 非阻擋型 warning 紀錄（與月跑 Stage 1 一致）
    for (const w of fragment.warnings) {
      this.logger.warn(
        `[Stage0Estimate] composer warning list_no=${def.list_no} code=${w.code} column=${w.columnName ?? '-'} reason=${w.reason}`,
      );
    }

    // BR-5 / §18.5.2：無有效篩選條件 → 與月跑 Stage 1 skip 一致，回 count=0
    if (fragment.skipReason === 'EMPTY_CONDITIONS') {
      this.logger.warn(
        `[Stage0Estimate] list ${def.list_no} (${def.list_nm}) empty conditions → count=0`,
      );
      return 0;
    }

    // skipReason=null 時 fragment.where 必非 null
    return this.poolRepo
      .createQueryBuilder('ob_pool_data')
      .where(fragment.where!, fragment.params)
      .getCount();
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
