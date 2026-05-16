import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Not, Repository } from 'typeorm';
import { ObListDefinition } from '@/database/entities/ob-list-definition.entity';
import { AssignmentRun } from '@/database/entities/assignment-run.entity';

export type MonthlyRunStatus = 'none' | 'pending' | 'running' | 'completed' | 'failed';

export interface ReadinessResult {
  workYm: string;
  totalActiveLists: number;
  readyCount: number;
  notReadyLists: Array<{ listNo: string; listNm: string; stage: string }>;
  allReady: boolean;
  monthlyRunStatus: MonthlyRunStatus;
}

/**
 * MonthlyRunReadinessService（F088 §5.2 / F061 月跑前置條件）
 *
 * 計算指定 workYm 的「月跑就緒度」摘要。
 *
 * BR-5：`totalActiveLists` 計算 `status = 'active'` 且 `stage != 'draft'` 之名單；
 *       `readyCount` 計算其中 `stage = 'ready'` 者；`allReady = readyCount === totalActiveLists`。
 * BR-6：`monthlyRunStatus` 反映當月 `assignment_run` 最新狀態。
 */
@Injectable()
export class MonthlyRunReadinessService {
  constructor(
    @InjectRepository(ObListDefinition)
    private readonly listRepo: Repository<ObListDefinition>,
    @InjectRepository(AssignmentRun)
    private readonly runRepo: Repository<AssignmentRun>,
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

    return {
      workYm,
      totalActiveLists: total,
      readyCount: readyList.length,
      notReadyLists: notReady,
      allReady: total === 0 ? true : readyList.length === total,
      monthlyRunStatus: (latestRun?.status as MonthlyRunStatus) ?? 'none',
    };
  }
}
