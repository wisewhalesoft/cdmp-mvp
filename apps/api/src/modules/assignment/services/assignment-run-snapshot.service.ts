import {
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AssignmentRun } from '@/database/entities/assignment-run.entity';
import { AssignmentRunSnapshot } from '@/database/entities/assignment-run-snapshot.entity';
import { ERROR_CODES, ERROR_MESSAGES } from '@/common/errors/error-codes';
import {
  SectionChiefScopeService,
  ActorUser,
} from './section-chief-scope.service';

export type SnapshotType = 'config' | 'input_list' | 'result';

export interface RunMeta {
  runId: string;
  projectWorkym: string;
  triggeredBy: string;
  triggeredAt: Date;
  finishedAt: Date | null;
  status: AssignmentRun['status'];
  totalCases: number | null;
}

export interface FullSnapshotResponse {
  runMeta: RunMeta;
  snapshots: {
    config: Record<string, unknown> | null;
    inputList: Record<string, unknown> | null;
    result: Record<string, unknown> | null;
  };
}

/**
 * AssignmentRunSnapshotService — F066 查看執行快照詳情
 *
 * 提供兩種讀取模式：
 *   - getFullSnapshot(runId)：回傳三份快照（spec §5.1）
 *   - getSnapshotByType(runId, type)：回傳單一快照（spec §5.1 type 變體）
 *
 * 行為：
 *   - run_id 不存在 → 404 ASSIGNMENT_RUN_NOT_FOUND
 *   - 快照缺失（getSnapshotByType）→ 404 ASSIGNMENT_RUN_NOT_FOUND（spec AC-5）
 *   - 不依賴 status：未完成的 run 也允許讀（pending 期間 config 可能尚未寫入，回傳 null）
 */
@Injectable()
export class AssignmentRunSnapshotService {
  constructor(
    @InjectRepository(AssignmentRun)
    private readonly runRepo: Repository<AssignmentRun>,
    @InjectRepository(AssignmentRunSnapshot)
    private readonly snapshotRepo: Repository<AssignmentRunSnapshot>,
    private readonly scope: SectionChiefScopeService,
  ) {}

  async getFullSnapshot(
    runId: string,
    actor?: ActorUser | null,
  ): Promise<FullSnapshotResponse> {
    const run = await this.requireRun(runId);
    const all = await this.snapshotRepo.find({ where: { run_id: runId } });

    const byType = new Map<SnapshotType, Record<string, unknown>>();
    for (const s of all) {
      byType.set(s.snapshot_type as SnapshotType, s.payload);
    }

    return {
      runMeta: this.toMeta(run),
      snapshots: {
        config: byType.get('config') ?? null,
        inputList: await this.filterPayload(byType.get('input_list'), 'cases', actor),
        result: await this.filterPayload(byType.get('result'), 'assignments', actor),
      },
    };
  }

  async getSnapshotByType(
    runId: string,
    type: SnapshotType,
    actor?: ActorUser | null,
  ): Promise<{ runMeta: RunMeta; type: SnapshotType; payload: Record<string, unknown> }> {
    const run = await this.requireRun(runId);
    const snap = await this.snapshotRepo.findOne({
      where: { run_id: runId, snapshot_type: type },
    });
    if (!snap) {
      // 對齊 AC-5：快照缺失 → 404 ASSIGNMENT_RUN_NOT_FOUND
      throw new NotFoundException({
        error: ERROR_CODES.ASSIGNMENT_RUN_NOT_FOUND,
        message: ERROR_MESSAGES.ASSIGNMENT_RUN_NOT_FOUND,
      });
    }
    const payload =
      type === 'config'
        ? snap.payload
        : type === 'input_list'
          ? await this.filterPayload(snap.payload, 'cases', actor)
          : await this.filterPayload(snap.payload, 'assignments', actor);
    return { runMeta: this.toMeta(run), type, payload: payload ?? snap.payload };
  }

  /**
   * F066 v1.1 scope filter — 對 result.assignments / input_list.cases 進行 emplid 過濾。
   * config 不過濾（無 emplid 概念）。
   */
  private async filterPayload(
    payload: Record<string, unknown> | undefined | null,
    arrayKey: 'assignments' | 'cases',
    actor?: ActorUser | null,
  ): Promise<Record<string, unknown> | null> {
    if (!payload) return null;
    if (!this.scope.shouldFilter(actor)) return payload;
    const arr = (payload as any)[arrayKey];
    if (!Array.isArray(arr)) return payload;
    const filtered = await this.scope.filterByEmplId<{ emplid?: string | null }>(arr, actor);
    return { ...payload, [arrayKey]: filtered };
  }

  private async requireRun(runId: string): Promise<AssignmentRun> {
    const run = await this.runRepo.findOne({ where: { run_id: runId } });
    if (!run) {
      throw new NotFoundException({
        error: ERROR_CODES.ASSIGNMENT_RUN_NOT_FOUND,
        message: ERROR_MESSAGES.ASSIGNMENT_RUN_NOT_FOUND,
      });
    }
    return run;
  }

  private toMeta(r: AssignmentRun): RunMeta {
    return {
      runId: r.run_id,
      projectWorkym: r.project_workym,
      triggeredBy: r.triggered_by,
      triggeredAt: r.created_at,
      finishedAt: r.finished_at,
      status: r.status,
      totalCases: r.total_cases,
    };
  }
}
