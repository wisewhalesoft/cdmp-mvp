import { ConflictException, Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { AssignmentRun } from '@/database/entities/assignment-run.entity';
import { ERROR_CODES, ERROR_MESSAGES } from '@/common/errors/error-codes';

/**
 * AssignmentRunGuardService（AD-E07 v3.0 / architecture-spec.md §E07 元件清單 / 決議 #6）
 *
 * 月名單分派並發守衛集中實作。所有 E07 寫入 service method 最頂層呼叫 `assertNoRunningRun(workYm?)`，
 * 確保「月名單分派執行中時不可變更任何 E07 設定 / 名單 / 比例」。
 *
 * 觸發條件：assignment_run.status IN ('pending', 'running')
 * 失敗回應：409 ConflictException + ASSIGNMENT_RUN_ALREADY_RUNNING
 * 解除阻擋：月名單分派結束（status = 'completed' / 'failed'）後自動解除
 *
 * 對應 spec：F050 v2.0, F051, F052, F078, F079, F080, F081, F082 v1.3, F083, F084, F085, F086, F087, F089
 */
@Injectable()
export class AssignmentRunGuardService {
  private readonly logger = new Logger(AssignmentRunGuardService.name);

  constructor(
    @InjectRepository(AssignmentRun)
    private readonly runRepo: Repository<AssignmentRun>,
  ) {}

  /**
   * 守衛：當有 pending / running 月名單分派時拒絕進入。
   *
   * @param workYm 可選，限定特定月份；未提供則檢查全部月份（最嚴格）
   */
  async assertNoRunningRun(workYm?: string): Promise<void> {
    const where: Record<string, unknown> = {
      status: In(['pending', 'running']),
    };
    if (workYm) where.project_workym = workYm;

    const count = await this.runRepo.count({ where });
    if (count > 0) {
      this.logger.warn(
        `Assignment run blocking: workYm=${workYm ?? '(any)'}, runningCount=${count}`,
      );
      throw new ConflictException({
        error: ERROR_CODES.ASSIGNMENT_RUN_ALREADY_RUNNING,
        message: ERROR_MESSAGES.ASSIGNMENT_RUN_ALREADY_RUNNING,
      });
    }
  }

  /**
   * 輕量版月名單分派守衛（F084 v2.0 auto-advance tx 內使用 / AD-E07-19 §19.3.3 [4b]）。
   *
   * 與 assertNoRunningRun() 區分（測試設計 §6.3 警告 4）：
   *   - assertNoRunningRun()：tx 外呼叫，有 pending/running 即**拋 409**（PUT 整體失敗）
   *   - isRunning()：tx 內呼叫，回 **boolean**（true → 跳過 auto-advance 但 PUT 仍 200）
   *
   * 兩者是不同的 contract，不可互換。
   *
   * @param workYm 可選，限定特定月份；未提供則檢查全部月份（最嚴格）
   * @returns 有 pending / running 月名單分派時為 true，否則 false
   */
  async isRunning(workYm?: string): Promise<boolean> {
    const where: Record<string, unknown> = {
      status: In(['pending', 'running']),
    };
    if (workYm) where.project_workym = workYm;

    const count = await this.runRepo.count({ where });
    return count > 0;
  }
}
