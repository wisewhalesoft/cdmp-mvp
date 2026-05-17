import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Not, Repository } from 'typeorm';
import { ObListDefinition } from '@/database/entities/ob-list-definition.entity';
import { AssignmentRun } from '@/database/entities/assignment-run.entity';
import { ObLevelcardVersion } from '@/database/entities/ob-levelcard-version.entity';
import { EtlPipelineLog } from '@/database/entities/etl-pipeline-log.entity';
import { EtlPipeline } from '@/database/entities/etl-pipeline.entity';

export type MonthlyRunStatus = 'none' | 'pending' | 'running' | 'completed' | 'failed';

export type EtlStatusValue = 'completed' | 'failed' | 'running' | 'missing';

export interface EtlSourceStatus {
  status: EtlStatusValue;
  lastRunAt: string | null;
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
}

/**
 * F061 Pre-check：4 個關鍵 ETL pipeline name 識別字串（不分大小寫比對）
 *
 * 將 pipeline.name 對應到 etlStatus 的 4 個 key。
 */
const ETL_PIPELINE_KEYWORDS: Record<keyof EtlStatusMap, RegExp> = {
  pooldata: /pooldata/i,
  emphire: /emphire/i,
  calendar: /calendar/i,
  arreturndf: /arreturndf/i,
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

    return {
      workYm,
      totalActiveLists: total,
      readyCount: readyList.length,
      notReadyLists: notReady,
      allReady: total === 0 ? true : readyList.length === total,
      monthlyRunStatus: (latestRun?.status as MonthlyRunStatus) ?? 'none',
      scoringActive,
      etlStatus,
    };
  }

  /**
   * 為每個關鍵 ETL pipeline 找出最新一次完成的 log。
   *
   * 策略：撈出 finished_at IS NOT NULL 的最新 50 筆 log（含 pipeline name），
   * 對每個 keyword regex 找第一個 match（即該 source 最新 log）。
   * 沒找到 → status='missing', lastRunAt=null。
   */
  private async calculateEtlStatus(): Promise<EtlStatusMap> {
    const empty: EtlSourceStatus = { status: 'missing', lastRunAt: null };
    const result: EtlStatusMap = {
      pooldata: { ...empty },
      emphire: { ...empty },
      calendar: { ...empty },
      arreturndf: { ...empty },
    };

    const logs = await this.etlLogRepo
      .createQueryBuilder('log')
      .innerJoin('log.pipeline', 'pipeline')
      .where('log.finished_at IS NOT NULL')
      .orderBy('log.finished_at', 'DESC')
      .limit(50)
      .getMany();

    for (const key of Object.keys(ETL_PIPELINE_KEYWORDS) as Array<
      keyof EtlStatusMap
    >) {
      const re = ETL_PIPELINE_KEYWORDS[key];
      const match = logs.find((l) => {
        const name = (l as any).pipeline?.name as string | undefined;
        return name ? re.test(name) : false;
      });
      if (match) {
        const finishedAt = (match as any).finished_at as Date | null;
        result[key] = {
          status: (match.status as EtlStatusValue) ?? 'missing',
          lastRunAt: finishedAt ? new Date(finishedAt).toISOString() : null,
        };
      }
    }
    return result;
  }
}
