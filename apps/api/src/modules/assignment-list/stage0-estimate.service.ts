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

export interface DailyEstimateRow {
  date: string; // YYYY-MM-DD
  weekday: string; // 一 / 二 / ... / 日
  estimate: number;
}

export interface Stage0DailyEstimateResult {
  ym: string;
  workingDays: number;
  totalEstimate: number;
  dailyEstimates: DailyEstimateRow[];
  poolCount: number;
  warning: 'POOL_COUNT_LOW' | null;
}

export interface Stage0ListCountResult {
  listNo: string;
  count: number;
}

const WEEKDAY_TW = ['日', '一', '二', '三', '四', '五', '六'];

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
   * F049 AC-1 + AC-2 + AC-3：每日估算表
   *
   * 規則：
   *   - workingDays：ob_calendar.rest_flg = '0' 且日期落在指定月份範圍
   *   - poolCount：ob_pool_data 全表筆數（共享池）
   *   - totalEstimate：等於 poolCount（每月所有案件分散到工作日）
   *   - dailyEstimates：依工作日數平均分配 floor(poolCount / workingDays)
   *   - warning：poolCount < STAGE0_POOL_WARN_THRESHOLD（預設 1000）
   */
  async calculateDailyEstimate(ym: string): Promise<Stage0DailyEstimateResult> {
    const { startDate, endDate } = this.monthRange(ym);

    // 1) 工作日清單
    const workdays = await this.calendarRepo.find({
      where: {
        calendar_date: Between(startDate, endDate),
        rest_flg: '0',
      },
      order: { calendar_date: 'ASC' },
    });
    const workingDays = workdays.length;

    // 2) Pool 筆數（共享池，無 list_no 概念）
    const poolCount = await this.poolRepo.count();

    // 3) 計算每日估算
    const totalEstimate = poolCount;
    const perDay = workingDays > 0 ? Math.floor(totalEstimate / workingDays) : 0;
    const dailyEstimates: DailyEstimateRow[] = workdays.map((row) => {
      const d = new Date(row.calendar_date);
      return {
        date: this.formatDate(d),
        weekday: WEEKDAY_TW[d.getDay()],
        estimate: perDay,
      };
    });

    // 4) 警示門檻
    const threshold = this.resolveWarnThreshold();
    const warning: Stage0DailyEstimateResult['warning'] =
      poolCount < threshold ? 'POOL_COUNT_LOW' : null;

    return { ym, workingDays, totalEstimate, dailyEstimates, poolCount, warning };
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
