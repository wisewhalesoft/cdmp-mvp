/**
 * F098 / AD-E07-28 §9.3：月名單分派取消專用例外。
 *
 * 由 worker 內 `CancellationPoller` 於可中斷邊界（list 與 list 之間 / Stage 與 Stage 之間）
 * 偵測 `assignment_run.status` 已被 `cancelRun` 標為 'failed' 時拋出，使 pipeline 提早結束、
 * **不再**寫快照 / ob_monthly_run_result。
 *
 * ⚠️ 此例外**不**繼承 NestJS HttpException：它在 worker 程序內被 pipeline try/catch 攔截，
 * 不會走 API 的 HttpExceptionFilter。pipeline 捕捉到它時，run 已是 'failed'（cancelRun 標記），
 * 不可覆寫回 'completed'。
 */
export class RunCancelledException extends Error {
  /** 觸發取消的 run_id（供 log / 診斷） */
  readonly runId: string;

  constructor(runId: string) {
    super(`月名單分派 run=${runId} 已被使用者取消，pipeline 於可中斷邊界提早結束`);
    this.name = 'RunCancelledException';
    this.runId = runId;
    // 維持 instanceof 在 transpile（swc / ts）後仍正確
    Object.setPrototypeOf(this, RunCancelledException.prototype);
  }
}
