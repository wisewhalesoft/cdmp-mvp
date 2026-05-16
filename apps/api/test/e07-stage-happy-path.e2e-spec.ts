/**
 * E2E 主動線骨架：E07 五階段 happy path（director 視角）
 *
 * 對應 spec：F050 → F078 → F079 → F080 → F082 → F084 → F086（draft → ready 完整流轉）
 *
 * 當前狀態：**骨架測試（structural skeleton）**
 *   - 業務 controller 尚未實作；以 todo.skip 標註，等待 P1 後 controller 上線後解鎖。
 *   - 本檔在 P0 階段確保 E2E 主動線「結構可見」、CI 不報誤紅。
 *   - 解鎖時：(1) 移除 `it.skip`；(2) 套上 supertest + INestApplication 啟動；
 *     (3) 對應 controller / module 已 wired up DirectorOrSectionChiefGuard +
 *     DirectorGuard + AssignmentRunGuardService。
 *
 * 5 階段步驟（director 視角）：
 *   1) POST /api/v1/assignment/list-definitions（建立 draft）
 *   2) PUT  /api/v1/assignment/ratios/dept/:listNo（設定部門比例，仍 draft）
 *   3) POST /api/v1/assignment/list-definitions/:listNo/advance-to-dept-ratio
 *      → draft → dept_ratio
 *   4) POST /api/v1/assignment/list-definitions/:listNo/advance-to-personnel-ratio
 *      → dept_ratio → personnel_ratio
 *   5) PUT  /api/v1/assignment/ratios/personnel/:listNo（設定個別業務比例）
 *   6) POST /api/v1/assignment/list-definitions/:listNo/advance-to-approval
 *      → personnel_ratio → approval
 *   7) POST /api/v1/assignment/list-definitions/:listNo/approve-to-ready
 *      → approval → ready
 *   8) GET  /api/v1/assignment/ready-summary?ym=YYYYMM
 *      → allReady === true（單一名單情境）
 */

import { describe, it } from 'vitest';

describe('E2E：E07 五階段 happy path（director 視角，骨架）', () => {
  it.todo(
    'TC-E2E-E07-HAPPY-001: director 完成 draft → dept_ratio → personnel_ratio → approval → ready 全流程',
  );

  it.todo('TC-E2E-E07-HAPPY-002: ready 階段觸發 monthly run → 202 Accepted');

  it.todo(
    'TC-E2E-E07-HAPPY-003: 全程 audit log 完整（每階段 STAGE_ADVANCE 一筆）',
  );

  it.todo(
    'TC-E2E-E07-HAPPY-004: 任一寫入端點被 AssignmentRunGuardService 攔截時回 409',
  );

  it.todo(
    'TC-E2E-E07-HAPPY-005: 一般 user（business_role=null）被 DirectorOrSectionChiefGuard 攔截回 403 E07_ROLE_NOT_ASSIGNED',
  );
});
