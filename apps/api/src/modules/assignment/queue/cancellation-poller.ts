import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AssignmentRun } from '@/database/entities/assignment-run.entity';
import { RunCancelledException } from './run-cancelled.exception';

/**
 * F098 / AD-E07-28 §9.3 / AC-5：worker 內取消輪詢器（修復 cancelRun 自承「背景不會真停」）。
 *
 * pipeline 執行期間，於**可中斷邊界**（每處理完一份 list、每個 Stage 之間）呼叫
 * `throwIfCancelled(runId)`：查 `assignment_run.status`，若已被 `cancelRun` 標為 'failed'
 * （使用者取消），拋 `RunCancelledException` 讓 pipeline 提早結束，**不再**寫快照 / result。
 *
 * P1 取消粒度為 **list 級**（A-2）：單一 list 的同步 JS 迴圈內無讓出點，故 poll 點位於
 * list 迴圈頂 / stage 之間，不在 list 內部。輪詢由 pipeline 在邊界主動呼叫，
 * 不依賴真實 setInterval（測試可直接呼叫 `throwIfCancelled` 驗證，沿用 fake timer 慣例）。
 */
@Injectable()
export class CancellationPoller {
  private readonly logger = new Logger(CancellationPoller.name);

  constructor(
    @InjectRepository(AssignmentRun)
    private readonly runRepo: Repository<AssignmentRun>,
  ) {}

  /**
   * 查該 run 是否已被取消（status 已被改為 'failed'）。
   * 純判定：不寫入、不拋例外，供測試 / 內部複用。
   */
  async isCancelled(runId: string): Promise<boolean> {
    const row = await this.runRepo.findOne({
      where: { run_id: runId },
      select: ['run_id', 'status'],
    });
    // run 不存在（極端 race / 手動刪除）亦視為應中止
    if (!row) return true;
    return row.status === 'failed';
  }

  /**
   * 於可中斷邊界呼叫：若已取消 → 拋 RunCancelledException 中止 pipeline。
   */
  async throwIfCancelled(runId: string): Promise<void> {
    if (await this.isCancelled(runId)) {
      this.logger.log(
        `偵測到 run=${runId} 已被取消（status=failed），於可中斷邊界中止 pipeline`,
      );
      throw new RunCancelledException(runId);
    }
  }
}
