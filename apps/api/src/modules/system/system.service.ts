import { Injectable } from '@nestjs/common';

/**
 * SystemService — F077 v1.2 §5.1 系統當前作業月份服務（E07 重構 P1 B2 補完）
 *
 * 邏輯（per architecture-spec.md §E07 currentWorkYm AD）：
 *   - 每月 1 號 0:00 切換至當月，即 `YYYYMM of today`
 *   - 環境變數 `OVERRIDE_CURRENT_WORK_YM=YYYYMM` 強制覆蓋（測試 / 災難復原）
 *   - OVERRIDE 格式不符（非 6 位數字）時忽略，退回 today
 *
 * 此邏輯與 AssignmentListController.computeCurrentWorkYm 保持一致；
 * 長期上 controller 內 helper 將遷移呼叫此 service 以集中維護。
 */
@Injectable()
export class SystemService {
  /**
   * @param now 可選注入，便於單元測試邊界
   */
  getCurrentWorkYm(now: Date = new Date()): string {
    const override = process.env.OVERRIDE_CURRENT_WORK_YM;
    if (override && /^\d{6}$/.test(override)) return override;
    const y = now.getFullYear();
    const m = now.getMonth() + 1;
    return `${y}${String(m).padStart(2, '0')}`;
  }
}
