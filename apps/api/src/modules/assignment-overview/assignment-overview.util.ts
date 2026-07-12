import { Logger } from '@nestjs/common';
import type {
  DeptDistributionItem,
  OverviewBlock,
  OverviewBlockError,
} from './assignment-overview.types';
import type { Stage0DeptEstimateResult } from '@/modules/assignment-list/stage0-estimate.service';

/**
 * F111 / AD-E07-46 §3.4 / §3.7.3 — 分派總覽聚合層純函式。
 *
 * 三個純函式，零 I/O、零 service 依賴，供 AssignmentOverviewService 組裝各區塊使用。
 */

/** 區塊軟失敗之固定使用者可讀文案（BR-9：非技術堆疊、不外洩原始例外訊息）。 */
export const OVERVIEW_BLOCK_ERROR_MESSAGE = '本區塊資料暫時無法取得，請稍後重試。';

/**
 * §3.4 — 永不 reject 的區塊包裝器。
 *   - fn 成功 resolve → { error:false, ...data }
 *   - fn reject / throw → { error:true, errorCode, message }（固定文案）
 * 自身**絕不**向外拋出，使呼叫端 Promise.allSettled 恆為 fulfilled（I-OVW-BLOCK-ISOLATE-01）。
 */
export async function wrapBlock<T extends object>(
  fn: () => Promise<T>,
  errorCode: OverviewBlockError['errorCode'],
  logger: Logger,
): Promise<OverviewBlock<T>> {
  try {
    const data = await fn();
    return { error: false, ...data };
  } catch (e) {
    const err = e as Error;
    logger.error(
      `[AssignmentOverview] ${errorCode}: ${err?.message}`,
      err?.stack,
    );
    return { error: true, errorCode, message: OVERVIEW_BLOCK_ERROR_MESSAGE };
  }
}

/** 供純函式使用之最小結構型別（避免測試需建構完整 Stage0DeptEstimateResult）。 */
type DaysOnly = Pick<Stage0DeptEstimateResult, 'days'>;
type DeptEstimateLike = Pick<
  Stage0DeptEstimateResult,
  'days' | 'departments' | 'scope'
>;

/**
 * §3.7.1 / §3.7.3 — 選定月份工作日案量加總。
 *   total = Σ_{d ∈ days, isWorkday} Σ_{c ∈ days[d].deptCells} c.cases
 * 非工作日之 deptCells（即使非空）不計入（BR-4）。days=[] → 0。
 */
export function sumWorkdayCases(r: DaysOnly): number {
  let total = 0;
  for (const day of r.days) {
    if (!day.isWorkday) continue;
    for (const cell of day.deptCells) total += cell.cases;
  }
  return total;
}

/**
 * §3.7.3 — 由 days[].deptCells 於記憶體彙總各部門 totalCases + 佔比（衍生便利欄，無新查詢）。
 *   - 僅加總工作日 deptCells。
 *   - ratio：非 scoped 模式 = totalCases ÷ grandTotal（%，一位小數）；grandTotal=0 → 0（防 NaN/Infinity）。
 *   - scoped（section_chief）模式：ratio 恆為 null（組織級佔比隱藏，AC-2 / I-OVW-SCOPE-PASSTHROUGH-01）。
 */
export function deriveDeptDistribution(
  r: DeptEstimateLike,
): DeptDistributionItem[] {
  const totals = new Map<string, number>();
  for (const day of r.days) {
    if (!day.isWorkday) continue;
    for (const cell of day.deptCells) {
      totals.set(cell.deptCode, (totals.get(cell.deptCode) ?? 0) + cell.cases);
    }
  }
  const grandTotal = Array.from(totals.values()).reduce((a, b) => a + b, 0);
  const nameByCode = new Map(r.departments.map((d) => [d.deptCode, d.deptName]));
  return r.departments.map((d) => {
    const totalCases = totals.get(d.deptCode) ?? 0;
    return {
      deptCode: d.deptCode,
      deptName: nameByCode.get(d.deptCode) ?? d.deptCode,
      totalCases,
      ratio: r.scope.scoped
        ? null
        : grandTotal > 0
          ? Math.round((totalCases / grandTotal) * 1000) / 10
          : 0,
    };
  });
}
