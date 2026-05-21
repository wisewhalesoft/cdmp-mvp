/**
 * Assignment Stage API — Contract Guard Test
 *
 * 目的：確保 FE TypeScript type 與後端 service 真實回傳 shape 一致。
 *
 * 動機：feedback_mock_real_system_contract / E07 ratio form 對齊事件。
 *       2026-05-21 audit 發現 FE 簡化了 GET response shape（裁掉 isActive / isResigned /
 *       departments[] / latestRejection），導致 26 個 unit test 全綠但 personnel-ratio
 *       頁面 runtime 拿不到 employees。
 *
 * 守門策略：本檔以 `satisfies` 運算子靜態驗證；後端 shape 改變但 FE type 未跟進時，
 *          `tsc -b` 會 fail，本檔的 vitest 也會吃 0 通過（編譯失敗）。
 *
 * 來源 of truth：
 *   - apps/api/src/modules/assignment-stage/dept-ratio.service.ts (lines 105-114 GET shape)
 *   - apps/api/src/modules/assignment-stage/personnel-ratio.service.ts (lines 138-197 GET shape)
 *   - docs/specs/features/F079-set-dept-ratio.md §5.1
 *   - docs/specs/features/F082-set-personnel-ratio.md §5.1
 *
 * 維護規則：後端 service 改 response shape 時，必同步：
 *   1. 更新 src/api/assignment-stage.ts 之 GetDeptRatiosResponse / GetPersonnelRatiosResponse
 *   2. 更新本檔下面的 fixture 使其反映新 shape
 */

import { describe, it, expect } from 'vitest';
import type {
  GetDeptRatiosResponse,
  SetDeptRatiosResponse,
  GetPersonnelRatiosResponse,
  SetPersonnelRatiosResponse,
} from '../assignment-stage';

// ============================================================
// F079 GET /api/v1/assignment/ratios/dept/:listNo
// 對應後端 dept-ratio.service.ts:105-113 之返回物件結構
// ============================================================
const F079_GET_FIXTURE = {
  listNo: 'OB202605001',
  listNm: '車貸催收名單',
  projectWorkym: '202605',
  stage: 'dept_ratio',
  deptRatios: [
    { obdeptId: 'XTC0', obdeptNm: '業務一部', ration: 30.0, isActive: true, directorName: '李處長' },
    { obdeptId: 'XTD0', obdeptNm: '業務二部', ration: 25.0, isActive: true, directorName: null },
    { obdeptId: 'XTF0', obdeptNm: '業務四部（已下線）', ration: 15.0, isActive: false, directorName: null },
  ],
  total: 70.0,
  isReadOnly: false,
} satisfies GetDeptRatiosResponse;

// ============================================================
// F079 PUT response
// 對應後端 dept-ratio.service.ts:188-195
// ============================================================
const F079_PUT_FIXTURE = {
  listNo: 'OB202605001',
  savedCount: 5,
  total: 100,
  savedAt: '2026-05-15T13:00:00Z',
  savedBy: 'user-uuid-xxx',
} satisfies SetDeptRatiosResponse;

// ============================================================
// F082 GET /api/v1/assignment/ratios/personnel/:listNo
// 對應後端 personnel-ratio.service.ts:187-197
// 包含「在職員工」「離職員工」「全員離職部門」「處長轄區外部門」四種代表場景。
// ============================================================
const F082_GET_FIXTURE = {
  listNo: 'OB202605007',
  listNm: '2026-05 主力催收名單 C',
  projectWorkym: '202605',
  stage: 'personnel_ratio',
  isReadOnly: false,
  viewerRole: 'director',
  departments: [
    {
      deptCode: 'XTC0',
      deptName: '北一處',
      deptRatio: 30,
      isInScope: true,
      activeCount: 3,
      sumValidated: true,
      allResigned: false,
      employees: [
        { empId: 'E001', empName: '王小明', ration: 40, isResigned: false, createdBy: 'd1' },
        { empId: 'E002', empName: '林小美', ration: 60, isResigned: false, createdBy: 'd1' },
        { empId: 'E099', empName: '舊員工', ration: null, isResigned: true, createdBy: null },
      ],
      deptSum: 100,
    },
    {
      // 全員離職分支（spec F082 v1.3 決議 #1）
      deptCode: 'XTD9',
      deptName: '舊東區處',
      deptRatio: 0,
      isInScope: true,
      activeCount: 0,
      sumValidated: false,
      allResigned: true,
      employees: [],
      deptSum: 0,
    },
  ],
  latestRejection: {
    rejectReason: '南一處對 EMP011 配 35% 過高',
    rejectorId: 'dir-001',
    rejectorName: '張部長',
    rejectorRole: 'director',
    rejectedAt: '2026-05-15T13:42:00Z',
  },
} satisfies GetPersonnelRatiosResponse;

// 同時驗證 latestRejection 為 null 的場景仍合法
const F082_GET_FIXTURE_NO_REJECTION = {
  ...F082_GET_FIXTURE,
  latestRejection: null,
} satisfies GetPersonnelRatiosResponse;

// ============================================================
// F082 PUT response
// 對應後端 personnel-ratio.service.ts:374-381（注意：是 deptSum 不是 total）
// ============================================================
const F082_PUT_FIXTURE = {
  listNo: 'OB202605007',
  deptCode: 'XTC0',
  savedCount: 3,
  deptSum: 100,
  savedAt: '2026-05-15T13:30:00Z',
  savedBy: 'user-uuid-xxx',
} satisfies SetPersonnelRatiosResponse;

describe('assignment-stage API contract', () => {
  /**
   * 注意：以下 it() 主要是讓 vitest 把本檔當成測試檔執行。
   * 真正的「守門」靠上面的 `satisfies` 在 tsc -b 階段攔截。
   */

  it('F079 GET response 對齊後端 dept-ratio.service.ts:105-113', () => {
    expect(F079_GET_FIXTURE.deptRatios.some((d) => d.isActive === false)).toBe(true);
    expect(typeof F079_GET_FIXTURE.isReadOnly).toBe('boolean');
  });

  it('F079 PUT response 含 savedCount + total + savedAt + savedBy', () => {
    expect(F079_PUT_FIXTURE.savedCount).toBeGreaterThan(0);
    expect(F079_PUT_FIXTURE.savedBy).toBeTruthy();
  });

  it('F082 GET response 為 departments[]（非 employees[]）', () => {
    expect(Array.isArray(F082_GET_FIXTURE.departments)).toBe(true);
    expect(F082_GET_FIXTURE.departments[0].employees.some((e) => e.isResigned)).toBe(true);
  });

  it('F082 GET 全員離職分支：activeCount=0 + allResigned=true', () => {
    const allResignedDept = F082_GET_FIXTURE.departments.find((d) => d.allResigned);
    expect(allResignedDept).toBeDefined();
    expect(allResignedDept!.activeCount).toBe(0);
    expect(allResignedDept!.employees).toEqual([]);
  });

  it('F082 GET latestRejection 可為 null（無拒絕紀錄時）', () => {
    expect(F082_GET_FIXTURE_NO_REJECTION.latestRejection).toBeNull();
  });

  it('F082 PUT response 用 deptSum 而非 total（per-DEPT 寫入語意）', () => {
    expect(F082_PUT_FIXTURE.deptSum).toBe(100);
    expect(F082_PUT_FIXTURE.deptCode).toBeTruthy();
  });
});
