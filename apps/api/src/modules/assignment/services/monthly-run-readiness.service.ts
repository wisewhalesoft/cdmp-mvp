import { Injectable } from '@nestjs/common';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import { DataSource, In, IsNull, Not, Repository } from 'typeorm';
import { getTableRowCounts } from '@/common/db/table-row-counts';
import { ObListDefinition } from '@/database/entities/ob-list-definition.entity';
import { AssignmentRun } from '@/database/entities/assignment-run.entity';
import { ObLevelcardVersion } from '@/database/entities/ob-levelcard-version.entity';
import { EtlPipelineLog } from '@/database/entities/etl-pipeline-log.entity';
import { EtlPipeline } from '@/database/entities/etl-pipeline.entity';
import { EtlPipelineVersion } from '@/database/entities/etl-pipeline-version.entity';

export type MonthlyRunStatus = 'none' | 'pending' | 'running' | 'completed' | 'failed';

export type EtlStatusValue = 'completed' | 'failed' | 'running' | 'missing';

export interface EtlSourceStatus {
  status: EtlStatusValue;
  lastRunAt: string | null;
  /** 目標表目前真實筆數（metadata 快速查）；0 = 空表 / 未載入（即使 log 為 completed）。 */
  rowCount: number;
}

export interface EtlStatusMap {
  pooldata: EtlSourceStatus;
  emphire: EtlSourceStatus;
  calendar: EtlSourceStatus;
  arreturndf: EtlSourceStatus;
}

export interface ReadinessResult {
  workYm: string;
  totalActiveLists: number;
  readyCount: number;
  notReadyLists: Array<{ listNo: string; listNm: string; stage: string }>;
  allReady: boolean;
  monthlyRunStatus: MonthlyRunStatus;
  /** F061 Phase 2 — 是否存在 status='active' 的 ob_levelcard_version */
  scoringActive: boolean;
  /** F061 Phase 2 — 4 個關鍵 ETL pipeline 最新狀態 */
  etlStatus: EtlStatusMap;
  /**
   * 4 張來源表是否皆有資料（rowCount>0）。false → 有空表（log 可能 completed 但表被清空/未載入），
   * 月跑會靜默算錯（如 ob_calendar 空→試算 0；ob_arreturndf_min_cap 空→H 卡分數偏低）→ 應擋月跑。
   */
  sourcesAllHaveData: boolean;
  /** rowCount=0 之來源表清單（供前端明確提示）。 */
  emptySourceTables: string[];
}

/**
 * F061 Pre-check：4 個關鍵 ETL pipeline 的識別依據 —— pipeline 的 **target_load 目標表**。
 *
 * ⚠️ 原以 pipeline.name 英文關鍵字（/pooldata/i 等）比對，但 pipeline 為使用者可自訂顯示名
 *    （dev CDMP 已改中文名如「電銷名單來源案件資料 ETL」），英文 regex 一律比不到 → 4 項全誤報
 *    'missing'（即使 ETL 實際 completed）。改以 pipeline definition 中 `target_load` 節點的
 *    `targetTable`（穩定、與顯示名脫鉤）對應，中/英文名皆可、未來改名也不會壞。
 *    另：精確比對 `ob_pool_data`（非 `ob_pool_data_list`）順帶修掉舊 regex 會同時誤匹配
 *    OBPOOLDATA_LIST 的問題。
 */
const TARGET_TABLE_TO_KEY: Record<string, keyof EtlStatusMap> = {
  ob_pool_data: 'pooldata',
  ob_emphire: 'emphire',
  ob_calendar: 'calendar',
  ob_arreturndf_min_cap: 'arreturndf',
};

/**
 * MonthlyRunReadinessService（F088 §5.2 / F061 月跑前置條件 v1.2 Phase 2）
 *
 * 計算指定 workYm 的「月跑就緒度」摘要。
 *
 * BR-5：`totalActiveLists` 計算 `status = 'active'` 且 `stage != 'draft'` 之名單；
 *       `readyCount` 計算其中 `stage = 'ready'` 者；`allReady = readyCount === totalActiveLists`。
 * BR-6：`monthlyRunStatus` 反映當月 `assignment_run` 最新狀態。
 *
 * F061 Phase 2 擴充（2026-05-17）：
 *   - `scoringActive`：是否有任何 `ob_levelcard_version.status='active'`
 *   - `etlStatus`：4 個關鍵 ETL pipeline (pooldata/emphire/calendar/arreturndf)
 *     的最新一次 etl_pipeline_logs 狀態
 */
@Injectable()
export class MonthlyRunReadinessService {
  constructor(
    @InjectRepository(ObListDefinition)
    private readonly listRepo: Repository<ObListDefinition>,
    @InjectRepository(AssignmentRun)
    private readonly runRepo: Repository<AssignmentRun>,
    @InjectRepository(ObLevelcardVersion)
    private readonly versionRepo: Repository<ObLevelcardVersion>,
    @InjectRepository(EtlPipelineLog)
    private readonly etlLogRepo: Repository<EtlPipelineLog>,
    @InjectRepository(EtlPipeline)
    private readonly etlPipelineRepo: Repository<EtlPipeline>,
    @InjectRepository(EtlPipelineVersion)
    private readonly etlVersionRepo: Repository<EtlPipelineVersion>,
    @InjectDataSource() private readonly dataSource: DataSource,
  ) {}

  async calculateReadiness(workYm: string): Promise<ReadinessResult> {
    const lists = await this.listRepo.find({
      where: {
        project_workym: workYm,
        status: 'active',
        stage: Not('draft') as any,
      },
    });

    const total = lists.length;
    const readyList = lists.filter((l) => (l as any).stage === 'ready');
    const notReady = lists
      .filter((l) => (l as any).stage !== 'ready')
      .map((l) => ({
        listNo: l.list_no,
        listNm: l.list_nm,
        stage: (l as any).stage,
      }));

    const latestRun = await this.runRepo.findOne({
      where: { project_workym: workYm },
      order: { created_at: 'DESC' },
    });

    const scoringActive =
      (await this.versionRepo.count({
        where: { status: 'active' } as any,
      })) > 0;

    const etlStatus = await this.calculateEtlStatus();

    // 空來源表 guard：log 可能 completed 但表被清空/未載入 → 月跑靜默算錯。以 target 表反查回報空表。
    const emptySourceTables = (
      Object.entries(TARGET_TABLE_TO_KEY) as Array<[string, keyof EtlStatusMap]>
    )
      .filter(([, key]) => etlStatus[key].rowCount === 0)
      .map(([table]) => table)
      .sort((a, b) => a.localeCompare(b));

    return {
      workYm,
      totalActiveLists: total,
      readyCount: readyList.length,
      notReadyLists: notReady,
      allReady: total === 0 ? true : readyList.length === total,
      monthlyRunStatus: (latestRun?.status as MonthlyRunStatus) ?? 'none',
      scoringActive,
      etlStatus,
      sourcesAllHaveData: emptySourceTables.length === 0,
      emptySourceTables,
    };
  }

  /**
   * 為每個關鍵 ETL source 找出最新一次完成的 log。
   *
   * 策略（改為與顯示名脫鉤）：
   *   1) 建 pipelineId → sourceKey 對應：讀各 pipeline 當前版 definition，取 `target_load`
   *      節點的 `targetTable`，對照 {@link TARGET_TABLE_TO_KEY}（ob_pool_data→pooldata 等）。
   *   2) 撈 finished_at IS NOT NULL 的最新 50 筆 log，依 `pipeline_id` 對應到 sourceKey；
   *      每個 source 取最新一筆（logs 已依 finished_at DESC 排序，首筆即最新）。
   * 沒找到 → status='missing', lastRunAt=null。
   */
  private async calculateEtlStatus(): Promise<EtlStatusMap> {
    const empty: EtlSourceStatus = {
      status: 'missing',
      lastRunAt: null,
      rowCount: 0,
    };
    const result: EtlStatusMap = {
      pooldata: { ...empty },
      emphire: { ...empty },
      calendar: { ...empty },
      arreturndf: { ...empty },
    };

    // 各來源目標表真實筆數（metadata 快速查；獨立於 pipeline log —— 抓「log 為 completed 但表被清空/
    //   未載入」之矛盾，正是 ob_calendar/ob_arreturndf_min_cap 被 E2E 清表致月跑/試算靜默壞的根因）。
    const counts = await getTableRowCounts(
      this.dataSource,
      Object.keys(TARGET_TABLE_TO_KEY),
    );
    for (const [table, key] of Object.entries(TARGET_TABLE_TO_KEY) as Array<
      [string, keyof EtlStatusMap]
    >) {
      result[key].rowCount = counts.get(table) ?? 0;
    }

    const pipelineIdToKey = await this.buildPipelineTargetMap();
    if (pipelineIdToKey.size === 0) return result;

    // finished_at DESC → 每個 source 首個 match 即最新完成 log（依 pipeline_id 對應，脫離顯示名）。
    const logs = await this.etlLogRepo
      .createQueryBuilder('log')
      .where('log.finished_at IS NOT NULL')
      .orderBy('log.finished_at', 'DESC')
      .limit(50)
      .getMany();

    for (const log of logs) {
      const key = pipelineIdToKey.get(log.pipeline_id);
      if (!key || result[key].status !== 'missing') continue; // 已填（更新的）→ 跳過
      const finishedAt = (log as any).finished_at as Date | null;
      result[key] = {
        status: (log.status as EtlStatusValue) ?? 'missing',
        lastRunAt: finishedAt ? new Date(finishedAt).toISOString() : null,
        rowCount: result[key].rowCount, // 保留上方已填之真實筆數
      };
    }
    return result;
  }

  /**
   * 建立 `pipeline_id → sourceKey` 對應：讀各未刪除 pipeline 當前版（pipeline.version）的
   * definition，取 `target_load` 節點 targetTable，對照 {@link TARGET_TABLE_TO_KEY}。
   * 找不到當前版時退回該 pipeline 最新版。一個 pipeline 對到的 sourceKey 取首個命中的目標表。
   */
  private async buildPipelineTargetMap(): Promise<
    Map<string, keyof EtlStatusMap>
  > {
    const map = new Map<string, keyof EtlStatusMap>();
    const pipelines = await this.etlPipelineRepo.find({
      where: { deleted_at: IsNull() },
      select: ['id', 'version'],
    });
    if (pipelines.length === 0) return map;

    const versions = await this.etlVersionRepo.find({
      where: { pipeline_id: In(pipelines.map((p) => p.id)) },
    });

    for (const p of pipelines) {
      const own = versions.filter((v) => v.pipeline_id === p.id);
      if (own.length === 0) continue;
      // 當前版優先，否則取最新版（version 最大）。
      const current =
        own.find((v) => v.version === p.version) ??
        own.reduce((a, b) => (b.version > a.version ? b : a));
      const nodes = (current.definition?.nodes ?? []) as Array<{
        data?: { nodeType?: string; targetTable?: string };
      }>;
      for (const n of nodes) {
        if (n?.data?.nodeType !== 'target_load') continue;
        const key = n.data.targetTable
          ? TARGET_TABLE_TO_KEY[n.data.targetTable]
          : undefined;
        if (key && !map.has(p.id)) {
          map.set(p.id, key);
          break;
        }
      }
    }
    return map;
  }
}
