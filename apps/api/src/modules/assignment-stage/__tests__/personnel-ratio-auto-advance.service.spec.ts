import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  ForbiddenException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { PersonnelRatioService } from '../personnel-ratio.service';
import { StageTransitionService } from '@/modules/assignment/services/stage-transition.service';
import { PersonnelRatioValidationService } from '@/modules/assignment/services/personnel-ratio-validation.service';
import { ObListDefinition } from '@/database/entities/ob-list-definition.entity';
import { AssignmentAuditLog } from '@/database/entities/assignment-audit-log.entity';
import { ObEmplSet } from '@/database/entities/ob-empl-set.entity';
import { ERROR_CODES } from '@/common/errors/error-codes';

/**
 * F084 v2.0 Auto-Advance — 後端 Unit Tests（TC-F084-001~030）
 *
 * 對應交接文件：docs/specs/handoffs/F084-v2-auto-advance-test-design.md §3
 * 對應 spec：F084 v2.0.1 §5.2 / BR-11~16 / AC-1~12；架構：AD-E07-19
 *
 * 框架慣例對齊既有 personnel-ratio.service.spec.ts（Vitest + 直接 mock service/repo）。
 *
 * mock 對齊真實 contract（feedback_mock_real_system_contract）：
 *   - lock 超時錯誤碼 = { code: '55P03' }（PostgreSQL 標準碼，非自訂字串）
 *   - 稽核 metadata auto_advanced_by_completion = boolean true（非 1 / 'true'）
 *   - operator_role 推導 = role==='admin' ? 'admin' : (businessRole ?? 'section_chief')
 *   - tx 內月跑 guard = runGuard.isRunning()（回 boolean），非 assertNoRunningRun()（拋例外）
 *
 * SQLite 相容：預設 DB_TYPE='sqlite'（test/setup.ts）→ advisory lock 段跳過，
 *   偵測+推進直接在 mgr 上執行；lock 超時案例（TC-014~016）暫切 DB_TYPE='postgres'
 *   並 mock mgr.query 拋 55P03 以驗 catch 路徑。
 */
describe('PersonnelRatioService — F084 v2.0 Auto-Advance', () => {
  let svc: PersonnelRatioService;
  let listRepo: any;
  let deptPctRepo: any;
  let emplSetRepo: any;
  let emphireRepo: any;
  let approvalRepo: any;
  let scopeService: any;
  let stageTransition: any;
  let ratioValidation: any;
  let personnelRatioValidation: any;
  let runGuard: any;
  let dataSource: any;
  let mgr: any;

  const ORIGINAL_DB_TYPE = process.env.DB_TYPE;
  const ORIGINAL_AUTO_FLAG = process.env.ENABLE_E07_AUTO_ADVANCE_TO_APPROVAL;

  // ── 共用 seed（測試設計 §2）─────────────────────────────────────────────
  const validList = {
    list_no: 'OB202506001',
    list_nm: '2026-05 主力催收名單',
    project_workym: '202605',
    stage: 'personnel_ratio',
    status: 'active',
  };
  const validActor = {
    userId: 'chief-001',
    role: 'user',
    businessRole: 'section_chief',
    ipAddress: null,
  };
  const directorActor = {
    userId: 'director-001',
    role: 'user',
    businessRole: 'director',
    ipAddress: null,
  };
  const adminActor = {
    userId: 'admin-001',
    role: 'admin',
    businessRole: null,
    ipAddress: null,
  };

  // dtoForXTE0：最後一個部門設定，使全部完成
  const dtoForXTE0 = {
    deptCode: 'XTE0',
    employees: [
      { empId: 'EMP001', empName: '張三', ration: 60 },
      { empId: 'EMP002', empName: '李四', ration: 40 },
    ],
  };

  beforeEach(() => {
    // 預設啟用 auto-advance flag；DB_TYPE 沿用 setup.ts（sqlite）→ advisory lock 跳過
    process.env.ENABLE_E07_AUTO_ADVANCE_TO_APPROVAL = 'true';
    process.env.DB_TYPE = 'sqlite';

    mgr = {
      delete: vi.fn().mockResolvedValue({ affected: 1 }),
      insert: vi.fn().mockResolvedValue({}),
      find: vi.fn().mockResolvedValue([]),
      findOne: vi.fn().mockResolvedValue(null),
      update: vi.fn().mockResolvedValue({ affected: 1 }),
      query: vi.fn().mockResolvedValue([]),
      createQueryBuilder: vi.fn(() => ({
        select: vi.fn().mockReturnThis(),
        addSelect: vi.fn().mockReturnThis(),
        where: vi.fn().mockReturnThis(),
        andWhere: vi.fn().mockReturnThis(),
        groupBy: vi.fn().mockReturnThis(),
        getRawMany: vi.fn().mockResolvedValue([]),
      })),
      count: vi.fn().mockResolvedValue(2),
    };
    dataSource = { transaction: vi.fn(async (fn: any) => fn(mgr)) };

    listRepo = { findOne: vi.fn().mockResolvedValue(validList) };
    deptPctRepo = {
      find: vi.fn().mockResolvedValue([]),
      findOne: vi.fn().mockResolvedValue({ obdeptid: 'XTE0' }),
    };
    emplSetRepo = {
      find: vi.fn().mockResolvedValue([]),
      createQueryBuilder: vi.fn(() => ({
        where: vi.fn().mockReturnThis(),
        andWhere: vi.fn().mockReturnThis(),
        getMany: vi.fn().mockResolvedValue([]),
      })),
    };
    emphireRepo = {
      find: vi.fn().mockResolvedValue([
        { emp_id: 'EMP001', emp_nm: '張三', dept_code: 'XTE0', dept_name: '三部', resign_date: null },
        { emp_id: 'EMP002', emp_nm: '李四', dept_code: 'XTE0', dept_name: '三部', resign_date: null },
      ]),
      createQueryBuilder: vi.fn(() => ({
        select: vi.fn().mockReturnThis(),
        orderBy: vi.fn().mockReturnThis(),
        addOrderBy: vi.fn().mockReturnThis(),
        getMany: vi.fn().mockResolvedValue([]),
      })),
    };
    approvalRepo = {
      createQueryBuilder: vi.fn(() => ({
        where: vi.fn().mockReturnThis(),
        orderBy: vi.fn().mockReturnThis(),
        addOrderBy: vi.fn().mockReturnThis(),
        limit: vi.fn().mockReturnThis(),
        getOne: vi.fn().mockResolvedValue(null),
      })),
    };
    stageTransition = {
      assertStageEquals: vi.fn().mockResolvedValue(undefined),
      advanceToInMgr: vi.fn().mockResolvedValue(undefined),
      advanceTo: vi.fn().mockResolvedValue(undefined),
    };
    ratioValidation = { assertEachInRange: vi.fn() };
    personnelRatioValidation = {
      assertDeptSumEquals100: vi.fn(),
      // 預設「全部完成」（不拋例外）
      assertAllDeptsSumEquals100WithMgr: vi.fn().mockResolvedValue(undefined),
    };
    runGuard = {
      assertNoRunningRun: vi.fn().mockResolvedValue(undefined),
      isRunning: vi.fn().mockResolvedValue(false),
    };
    // section_chief actor 的轄區 = XTE0（與 dtoForXTE0 一致）；通過轄區檢查
    scopeService = { getScopeDeptCode: vi.fn().mockResolvedValue('XTE0') };

    svc = new PersonnelRatioService(
      dataSource,
      listRepo,
      deptPctRepo,
      emplSetRepo,
      emphireRepo,
      approvalRepo,
      ratioValidation,
      personnelRatioValidation,
      stageTransition,
      runGuard,
      scopeService,
    );
  });

  afterEach(() => {
    process.env.DB_TYPE = ORIGINAL_DB_TYPE;
    if (ORIGINAL_AUTO_FLAG === undefined) {
      delete process.env.ENABLE_E07_AUTO_ADVANCE_TO_APPROVAL;
    } else {
      process.env.ENABLE_E07_AUTO_ADVANCE_TO_APPROVAL = ORIGINAL_AUTO_FLAG;
    }
    vi.restoreAllMocks();
  });

  // =========================================================================
  // 3.1 Feature Flag Off 場景
  // =========================================================================

  // TC-F084-001
  it('TC-F084-001：flag off 時 auto-advance 完全不執行，PUT 回 autoAdvanced:false', async () => {
    process.env.ENABLE_E07_AUTO_ADVANCE_TO_APPROVAL = 'false';

    const res = await svc.setPersonnelRatios('OB202506001', dtoForXTE0, validActor, '202605');

    expect(res.autoAdvanced).toBe(false);
    expect(res.newStage == null).toBe(true);
    expect(stageTransition.advanceToInMgr).not.toHaveBeenCalled();
    expect(mgr.update).not.toHaveBeenCalled();
    expect(mgr.query).not.toHaveBeenCalled();
    // 完成度偵測（auto-advance 路徑）未執行
    expect(personnelRatioValidation.assertAllDeptsSumEquals100WithMgr).not.toHaveBeenCalled();
  });

  // TC-F084-002
  it('TC-F084-002：flag off + phase3 on → 退回手動推進行為（連續兩次 PUT）', async () => {
    process.env.ENABLE_E07_AUTO_ADVANCE_TO_APPROVAL = 'false';
    process.env.ENABLE_E07_REFACTOR_PHASE3 = 'true';

    const res1 = await svc.setPersonnelRatios('OB202506001', dtoForXTE0, validActor, '202605');
    const res2 = await svc.setPersonnelRatios('OB202506001', dtoForXTE0, validActor, '202605');

    expect(res1.autoAdvanced).toBe(false);
    expect(res2.autoAdvanced).toBe(false);
    expect(stageTransition.advanceToInMgr).not.toHaveBeenCalled();
    expect(personnelRatioValidation.assertAllDeptsSumEquals100WithMgr).not.toHaveBeenCalled();
    expect(mgr.query).not.toHaveBeenCalled();
  });

  // =========================================================================
  // 3.2 完成度偵測場景
  // =========================================================================

  // TC-F084-003
  it('TC-F084-003：部分部門未完成 → autoAdvanced:false、不帶 failReason、寫入保留', async () => {
    personnelRatioValidation.assertAllDeptsSumEquals100WithMgr.mockRejectedValue(
      new UnprocessableEntityException({ error: ERROR_CODES.PERSONNEL_RATIO_SUM_NOT_100 }),
    );

    const res = await svc.setPersonnelRatios('OB202506001', dtoForXTE0, validActor, '202605');

    expect(res.autoAdvanced).toBe(false);
    expect(res.newStage == null).toBe(true);
    expect(res.autoAdvanceFailReason == null).toBe(true);
    expect(stageTransition.advanceToInMgr).not.toHaveBeenCalled();
    // ob_empl_set 寫入保留
    expect(mgr.delete).toHaveBeenCalled();
    expect(mgr.insert).toHaveBeenCalled();
  });

  // TC-F084-004
  it('TC-F084-004：容差邊界 99.99% 通過 / 99.98% 不通過', async () => {
    // 子場景 A：99.99%（容差內）→ mock 不拋 → autoAdvanced:true
    personnelRatioValidation.assertAllDeptsSumEquals100WithMgr.mockResolvedValue(undefined);
    const resA = await svc.setPersonnelRatios('OB202506001', dtoForXTE0, validActor, '202605');
    expect(resA.autoAdvanced).toBe(true);

    // 子場景 B：99.98%（超容差）→ mock 拋 422 → autoAdvanced:false、仍 200（不拋）
    personnelRatioValidation.assertAllDeptsSumEquals100WithMgr.mockRejectedValue(
      new UnprocessableEntityException({ error: ERROR_CODES.PERSONNEL_RATIO_SUM_NOT_100 }),
    );
    const resB = await svc.setPersonnelRatios('OB202506001', dtoForXTE0, validActor, '202605');
    expect(resB.autoAdvanced).toBe(false);
  });

  // TC-F084-005
  it('TC-F084-005：全員離職部門短路通過，不阻擋 auto-advance', async () => {
    // WithMgr 內部短路邏輯由其自身單測覆蓋（TC-023）；此處 mock 為「不拋」表示通過
    personnelRatioValidation.assertAllDeptsSumEquals100WithMgr.mockResolvedValue(undefined);

    const res = await svc.setPersonnelRatios('OB202506001', dtoForXTE0, validActor, '202605');

    expect(res.autoAdvanced).toBe(true);
    expect(res.newStage).toBe('approval');
    expect(stageTransition.advanceToInMgr).toHaveBeenCalled();
    const [listNoArg] = stageTransition.advanceToInMgr.mock.calls[0];
    expect(listNoArg).toBe('OB202506001');
    const meta = stageTransition.advanceToInMgr.mock.calls[0][5];
    expect(meta).toMatchObject({ auto_advanced_by_completion: true });
  });

  // =========================================================================
  // 3.3 Auto-Advance 成功觸發場景
  // =========================================================================

  // TC-F084-006
  it('TC-F084-006：處長完成最後部門 PUT → auto-advance 成功（主場景）', async () => {
    const res = await svc.setPersonnelRatios('OB202506001', dtoForXTE0, validActor, '202605');

    expect(res.autoAdvanced).toBe(true);
    expect(res.newStage).toBe('approval');
    expect(stageTransition.advanceToInMgr).toHaveBeenCalledTimes(1);
    expect(stageTransition.advanceToInMgr).toHaveBeenCalledWith(
      'OB202506001',
      'personnel_ratio',
      'approval',
      'chief-001',
      mgr,
      { auto_advanced_by_completion: true, operator_role: 'section_chief' },
    );
    expect(mgr.delete).toHaveBeenCalled();
    expect(mgr.insert).toHaveBeenCalled();
  });

  // TC-F084-007
  it('TC-F084-007：部長完成最後部門 PUT → auto-advance 成功（operator_role:director）', async () => {
    const res = await svc.setPersonnelRatios('OB202506001', dtoForXTE0, directorActor, '202605');

    expect(res.autoAdvanced).toBe(true);
    const meta = stageTransition.advanceToInMgr.mock.calls[0][5];
    expect(meta.operator_role).toBe('director');
  });

  // TC-F084-008
  it('TC-F084-008：Admin 完成最後部門 PUT → operator_role:admin（不 fallback section_chief）', async () => {
    const res = await svc.setPersonnelRatios('OB202506001', dtoForXTE0, adminActor, '202605');

    expect(res.autoAdvanced).toBe(true);
    const meta = stageTransition.advanceToInMgr.mock.calls[0][5];
    expect(meta.operator_role).toBe('admin');
    expect(meta.operator_role).not.toBe('section_chief');
  });

  // =========================================================================
  // 3.4 稽核欄位完整性 + operator_role 推導
  // =========================================================================

  // TC-F084-009
  it('TC-F084-009：auto-advance 稽核 metadata 完整性（嚴格型別 + 無多餘 key）', async () => {
    await svc.setPersonnelRatios('OB202506001', dtoForXTE0, validActor, '202605');

    const meta = stageTransition.advanceToInMgr.mock.calls[0][5];
    expect(meta.auto_advanced_by_completion).toBe(true); // boolean，非 1 / 'true'
    expect(meta.operator_role).toBe('section_chief');
    // 不含其他非預期 key
    expect(Object.keys(meta).sort()).toEqual(['auto_advanced_by_completion', 'operator_role']);
  });

  // TC-F084-010
  it('TC-F084-010：手動 fallback 路徑稽核不含 auto_advanced_by_completion', async () => {
    // 手動 fallback：flag off 時退回手動推進，setPersonnelRatios 不觸發 advanceToInMgr
    process.env.ENABLE_E07_AUTO_ADVANCE_TO_APPROVAL = 'false';

    await svc.setPersonnelRatios('OB202506001', dtoForXTE0, validActor, '202605');

    // setPersonnelRatios 不應呼叫 advanceToInMgr（自動路徑）
    expect(stageTransition.advanceToInMgr).not.toHaveBeenCalled();
    // 個別比例稽核（action='UPDATE'）的 after_value 不含 auto_advanced_by_completion
    const auditCall = mgr.insert.mock.calls.find(
      (c: any[]) => c[0] === AssignmentAuditLog,
    );
    expect(auditCall).toBeTruthy();
    const auditPayload = auditCall[1];
    expect(auditPayload.after_value?.auto_advanced_by_completion).toBeUndefined();
  });

  // TC-F084-011
  it('TC-F084-011：operator_role 推導規則完整性（三角色 × 推導公式）', async () => {
    // 子場景 A：section_chief
    await svc.setPersonnelRatios('OB202506001', dtoForXTE0, validActor, '202605');
    expect(stageTransition.advanceToInMgr.mock.calls[0][5].operator_role).toBe('section_chief');

    stageTransition.advanceToInMgr.mockClear();

    // 子場景 B：director
    await svc.setPersonnelRatios('OB202506001', dtoForXTE0, directorActor, '202605');
    expect(stageTransition.advanceToInMgr.mock.calls[0][5].operator_role).toBe('director');

    stageTransition.advanceToInMgr.mockClear();

    // 子場景 C：admin（businessRole=null → 'admin' 優先）
    await svc.setPersonnelRatios('OB202506001', dtoForXTE0, adminActor, '202605');
    expect(stageTransition.advanceToInMgr.mock.calls[0][5].operator_role).toBe('admin');
  });

  // =========================================================================
  // 3.5 月跑 Guard 場景（tx 內 isRunning）
  // =========================================================================

  // TC-F084-012
  it('TC-F084-012：月跑 running → autoAdvanced:false + failReason，PUT 寫入保留', async () => {
    runGuard.isRunning.mockResolvedValue(true);

    const res = await svc.setPersonnelRatios('OB202506001', dtoForXTE0, validActor, '202605');

    expect(res.autoAdvanced).toBe(false);
    expect(res.autoAdvanceFailReason).toBe(ERROR_CODES.ASSIGNMENT_RUN_ALREADY_RUNNING);
    expect(res.newStage == null).toBe(true);
    expect(stageTransition.advanceToInMgr).not.toHaveBeenCalled();
    // 寫入保留
    expect(mgr.delete).toHaveBeenCalled();
    expect(mgr.insert).toHaveBeenCalled();
  });

  // TC-F084-013
  it('TC-F084-013：月跑 pending（isRunning 回 true）同樣觸發 guard', async () => {
    runGuard.isRunning.mockResolvedValue(true);

    const res = await svc.setPersonnelRatios('OB202506001', dtoForXTE0, validActor, '202605');

    expect(res.autoAdvanced).toBe(false);
    expect(res.autoAdvanceFailReason).toBe(ERROR_CODES.ASSIGNMENT_RUN_ALREADY_RUNNING);
  });

  // =========================================================================
  // 3.6 Lock 超時降級 + Option B（Unit Mock，DB_TYPE=postgres 觸發 lock 段）
  // =========================================================================

  // TC-F084-014
  it('TC-F084-014：lock 等待逾時(55P03) → autoAdvanced:false、不帶 failReason、寫入保留', async () => {
    process.env.DB_TYPE = 'postgres';
    // 第一次 query（SET LOCAL lock_timeout）正常，第二次（advisory lock）拋 55P03
    mgr.query
      .mockResolvedValueOnce([]) // SET LOCAL lock_timeout
      .mockRejectedValueOnce({ code: '55P03', message: 'lock not available' });

    const res = await svc.setPersonnelRatios('OB202506001', dtoForXTE0, validActor, '202605');

    expect(res.autoAdvanced).toBe(false);
    expect(res.newStage == null).toBe(true);
    expect(res.autoAdvanceFailReason == null).toBe(true); // 不帶 failReason
    expect(stageTransition.advanceToInMgr).not.toHaveBeenCalled();
    // Option B：寫入保留
    expect(mgr.delete).toHaveBeenCalled();
    expect(mgr.insert).toHaveBeenCalled();
  });

  // TC-F084-015
  it('TC-F084-015：lock 超時 catch 後 tx 照常 commit（不 rethrow）', async () => {
    process.env.DB_TYPE = 'postgres';
    mgr.query
      .mockResolvedValueOnce([])
      .mockRejectedValueOnce({ code: '55P03', message: 'lock not available' });

    // setPersonnelRatios 正常 resolve（不拋例外）
    await expect(
      svc.setPersonnelRatios('OB202506001', dtoForXTE0, validActor, '202605'),
    ).resolves.toBeTruthy();
    // dataSource.transaction callback 正常 resolve（tx commit，而非 reject）
    expect(dataSource.transaction).toHaveBeenCalledTimes(1);
  });

  // TC-F084-016
  it('TC-F084-016：lock 超時 vs 月跑 guard 的回應欄位差異', async () => {
    // 子場景 A：lock 超時 → 不含 failReason
    process.env.DB_TYPE = 'postgres';
    mgr.query
      .mockResolvedValueOnce([])
      .mockRejectedValueOnce({ code: '55P03', message: 'lock not available' });
    const resA = await svc.setPersonnelRatios('OB202506001', dtoForXTE0, validActor, '202605');
    expect(resA.autoAdvanced).toBe(false);
    expect(resA.autoAdvanceFailReason == null).toBe(true);

    // 子場景 B：月跑 guard → 含 failReason
    process.env.DB_TYPE = 'sqlite';
    runGuard.isRunning.mockResolvedValue(true);
    const resB = await svc.setPersonnelRatios('OB202506001', dtoForXTE0, validActor, '202605');
    expect(resB.autoAdvanced).toBe(false);
    expect(resB.autoAdvanceFailReason).toBe(ERROR_CODES.ASSIGNMENT_RUN_ALREADY_RUNNING);
  });

  // =========================================================================
  // 3.7 Idempotent No-Op 場景
  // =========================================================================

  // TC-F084-017
  it('TC-F084-017：取得 lock 後 stage 已 approval → idempotent no-op，不重複寫稽核', async () => {
    // advanceToInMgr 內部 assertStageEquals 偵測 stage 已 approval → 拋 422
    stageTransition.advanceToInMgr.mockRejectedValue(
      new UnprocessableEntityException({ error: ERROR_CODES.LIST_STAGE_TRANSITION_FORBIDDEN }),
    );

    const res = await svc.setPersonnelRatios('OB202506001', dtoForXTE0, validActor, '202605');

    expect(res.autoAdvanced).toBe(false);
    expect(res.autoAdvanceFailReason == null).toBe(true);
    // ob_empl_set 寫入保留（後到者比例）
    expect(mgr.delete).toHaveBeenCalled();
    expect(mgr.insert).toHaveBeenCalled();
  });

  // TC-F084-018
  it('TC-F084-018：idempotent no-op 時 advanceToInMgr 仍嘗試一次但不成功推進（稽核不重複）', async () => {
    // 先到者：成功推進
    const resFirst = await svc.setPersonnelRatios('OB202506001', dtoForXTE0, validActor, '202605');
    expect(resFirst.autoAdvanced).toBe(true);
    expect(stageTransition.advanceToInMgr).toHaveBeenCalledTimes(1);

    stageTransition.advanceToInMgr.mockClear();
    // 後到者：advanceToInMgr 內部 assertStageEquals 偵測已 approval → 拋 422 → no-op
    stageTransition.advanceToInMgr.mockRejectedValue(
      new UnprocessableEntityException({ error: ERROR_CODES.LIST_STAGE_TRANSITION_FORBIDDEN }),
    );
    const resSecond = await svc.setPersonnelRatios('OB202506001', dtoForXTE0, validActor, '202605');
    expect(resSecond.autoAdvanced).toBe(false);
    // 後到者只嘗試一次 advanceToInMgr，但因 422 而未實際寫 STAGE_ADVANCE（由 advanceToInMgr 內部保證）
    expect(stageTransition.advanceToInMgr).toHaveBeenCalledTimes(1);
  });

  // =========================================================================
  // 3.10 推進後鎖定 / 歷史月份（setPersonnelRatios 入口 guard）
  // =========================================================================

  // TC-F084-024
  it('TC-F084-024：stage=approval 再 PUT → 422 LIST_STAGE_TRANSITION_FORBIDDEN，不寫入', async () => {
    stageTransition.assertStageEquals.mockRejectedValue(
      new UnprocessableEntityException({ error: ERROR_CODES.LIST_STAGE_TRANSITION_FORBIDDEN }),
    );

    await expect(
      svc.setPersonnelRatios('OB202506001', dtoForXTE0, validActor, '202605'),
    ).rejects.toBeInstanceOf(UnprocessableEntityException);
    expect(mgr.delete).not.toHaveBeenCalled();
  });

  // TC-F084-025
  it('TC-F084-025：歷史月份 → 403 LIST_HISTORICAL_READONLY，auto-advance 不執行', async () => {
    listRepo.findOne.mockResolvedValue({ ...validList, project_workym: '202504' });

    await expect(
      svc.setPersonnelRatios('OB202506001', dtoForXTE0, validActor, '202605'),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(mgr.query).not.toHaveBeenCalled();
    expect(stageTransition.advanceToInMgr).not.toHaveBeenCalled();
  });
});

// ===========================================================================
// 3.8 advanceToInMgr 過載合約驗證（直接測試 StageTransitionService）
// ===========================================================================
describe('StageTransitionService.advanceToInMgr — F084 v2.0 過載合約', () => {
  let svc: StageTransitionService;
  let dataSource: any;
  let mockMgr: any;

  beforeEach(() => {
    dataSource = { transaction: vi.fn() };
    mockMgr = {
      findOne: vi.fn().mockResolvedValue({ stage: 'personnel_ratio' }),
      update: vi.fn().mockResolvedValue({ affected: 1 }),
      insert: vi.fn().mockResolvedValue({}),
    };
    svc = new StageTransitionService(dataSource);
  });

  // TC-F084-019
  it('TC-F084-019：接受外部 EntityManager，不自開 tx', async () => {
    await svc.advanceToInMgr(
      'OB202506001',
      'personnel_ratio',
      'approval',
      'chief-001',
      mockMgr,
      { auto_advanced_by_completion: true, operator_role: 'section_chief' },
    );

    // update ObListDefinition stage='approval'
    expect(mockMgr.update).toHaveBeenCalledWith(
      ObListDefinition,
      { list_no: 'OB202506001' },
      { stage: 'approval' },
    );
    // insert AssignmentAuditLog 含 STAGE_ADVANCE + metadata
    expect(mockMgr.insert).toHaveBeenCalledTimes(1);
    const [entity, payload] = mockMgr.insert.mock.calls[0];
    expect(entity).toBe(AssignmentAuditLog);
    expect(payload.action).toBe('STAGE_ADVANCE');
    expect(payload.actor_id).toBe('chief-001');
    expect(payload.after_value.metadata.auto_advanced_by_completion).toBe(true);
    expect(payload.after_value.metadata.operator_role).toBe('section_chief');
    // 不自開 tx
    expect(dataSource.transaction).not.toHaveBeenCalled();
  });

  // TC-F084-020
  it('TC-F084-020：auditMetadata=undefined 時不寫入 auto_advanced_by_completion', async () => {
    await svc.advanceToInMgr(
      'OB202506001',
      'personnel_ratio',
      'approval',
      'chief-001',
      mockMgr,
    );

    const [, payload] = mockMgr.insert.mock.calls[0];
    expect(payload.action).toBe('STAGE_ADVANCE');
    expect(payload.after_value.metadata).toBeUndefined();
  });

  // TC-F084-021
  it('TC-F084-021：stage 不符 fromStage → 拋 422 LIST_STAGE_TRANSITION_FORBIDDEN，不 update', async () => {
    mockMgr.findOne.mockResolvedValue({ stage: 'approval' });

    await expect(
      svc.advanceToInMgr('OB202506001', 'personnel_ratio', 'approval', 'chief-001', mockMgr, {}),
    ).rejects.toBeInstanceOf(UnprocessableEntityException);
    expect(mockMgr.update).not.toHaveBeenCalled();
  });
});

// ===========================================================================
// 3.9 assertAllDeptsSumEquals100WithMgr 場景（直接測試 PersonnelRatioValidationService）
// ===========================================================================
describe('PersonnelRatioValidationService.assertAllDeptsSumEquals100WithMgr — F084 v2.0', () => {
  let svc: PersonnelRatioValidationService;
  let emplSetRepo: any;
  let emphireRepo: any;
  let mockMgr: any;

  // requiredDepts: ob_dept_pct 中 ration>0 之 universe；groups: ob_empl_set 加總
  function buildMgr(
    requiredDepts: Array<{ obdeptid: string; ration: string }>,
    groups: Array<{ deptid_m: string; sumRation: string }>,
    activeMap: Record<string, number>,
  ) {
    return {
      // mgr.find(ObDeptPct, { where: { list_no } }) → universe
      find: vi.fn(async () => requiredDepts),
      createQueryBuilder: vi.fn(() => ({
        select: vi.fn().mockReturnThis(),
        addSelect: vi.fn().mockReturnThis(),
        where: vi.fn().mockReturnThis(),
        groupBy: vi.fn().mockReturnThis(),
        getRawMany: vi.fn().mockResolvedValue(groups),
      })),
      count: vi.fn(async (_entity: any, opts: any) => {
        const dept = opts?.where?.dept_code;
        return activeMap[dept] ?? 0;
      }),
    };
  }

  beforeEach(() => {
    emplSetRepo = { createQueryBuilder: vi.fn() };
    emphireRepo = { count: vi.fn() };
    const deptPctRepo = { find: vi.fn().mockResolvedValue([]) };
    svc = new PersonnelRatioValidationService(emplSetRepo, emphireRepo, deptPctRepo as any);
  });

  // TC-F084-022
  it('TC-F084-022：使用傳入的 EntityManager 查詢（不用全域 repo），全部完成不拋', async () => {
    mockMgr = buildMgr(
      [
        { obdeptid: 'XTC0', ration: '50' },
        { obdeptid: 'XTD0', ration: '50' },
      ],
      [
        { deptid_m: 'XTC0', sumRation: '100' },
        { deptid_m: 'XTD0', sumRation: '100' },
      ],
      { XTC0: 2, XTD0: 2 },
    );

    await expect(
      svc.assertAllDeptsSumEquals100WithMgr('OB202506001', mockMgr as any),
    ).resolves.toBeUndefined();
    expect(mockMgr.find).toHaveBeenCalled();
    expect(mockMgr.createQueryBuilder).toHaveBeenCalled();
  });

  // TC-F084-023
  it('TC-F084-023：全員離職部門短路（activeCount=0），非離職部門仍被驗證', async () => {
    // XTE0 active=0 → 短路；XTC0 sum=100 → 通過
    const mgrPass = buildMgr(
      [
        { obdeptid: 'XTE0', ration: '50' },
        { obdeptid: 'XTC0', ration: '50' },
      ],
      [
        { deptid_m: 'XTC0', sumRation: '100' },
      ],
      { XTE0: 0, XTC0: 2 },
    );
    await expect(
      svc.assertAllDeptsSumEquals100WithMgr('OB202506001', mgrPass as any),
    ).resolves.toBeUndefined();

    // XTC0 sum=80 → 非離職部門仍被驗證 → 拋
    const mgrFail = buildMgr(
      [
        { obdeptid: 'XTE0', ration: '50' },
        { obdeptid: 'XTC0', ration: '50' },
      ],
      [
        { deptid_m: 'XTC0', sumRation: '80' },
      ],
      { XTE0: 0, XTC0: 2 },
    );
    await expect(
      svc.assertAllDeptsSumEquals100WithMgr('OB202506001', mgrFail as any),
    ).rejects.toBeInstanceOf(UnprocessableEntityException);
  });

  // TC-F084-023b（迴歸）：universe = deptRatio>0（非 group-by-empl_set）。
  // 修復 OB202605002：4 個 deptRatio>0 部門僅 1 個設定即提早推進的 bug。
  it('TC-F084-023b：deptRatio>0 部門「完全沒設」（0 筆）且 active>0 → 拋（不可提早推進）', async () => {
    const mgr = buildMgr(
      // 4 個 deptRatio>0 部門
      [
        { obdeptid: 'XVE1', ration: '25' },
        { obdeptid: 'XVE2', ration: '25' },
        { obdeptid: 'XVE3', ration: '25' },
        { obdeptid: 'XVE4', ration: '25' },
      ],
      // 只有 XVE4 有 empl_set 紀錄
      [{ deptid_m: 'XVE4', sumRation: '100' }],
      // 全部都有在職員工
      { XVE1: 27, XVE2: 28, XVE3: 22, XVE4: 14 },
    );
    await expect(
      svc.assertAllDeptsSumEquals100WithMgr('OB202605002', mgr as any),
    ).rejects.toBeInstanceOf(UnprocessableEntityException);
  });
});

// ===========================================================================
// 3.10 Fallback 手動推進路徑（StageActionService.advancePersonnelRatioToApproval）
// TC-F084-026~030
// ===========================================================================
describe('StageActionService.advancePersonnelRatioToApproval — F084 v2.0 fallback 手動路徑', () => {
  // 動態 import 以避免循環依賴；fallback 路徑透過 stageTransition.advanceTo（自開 tx）
  let StageActionService: any;
  let svc: any;
  let stageTransition: any;
  let personnelRatioValidation: any;
  let runGuard: any;
  let listRepo: any;
  let deps: any;

  beforeEach(async () => {
    const mod = await import('../stage-action.service');
    StageActionService = mod.StageActionService;

    stageTransition = {
      advanceTo: vi.fn().mockResolvedValue(undefined),
      assertStageEquals: vi.fn().mockResolvedValue(undefined),
    };
    personnelRatioValidation = {
      assertAllDeptsSumEquals100: vi.fn().mockResolvedValue(undefined),
    };
    runGuard = { assertNoRunningRun: vi.fn().mockResolvedValue(undefined) };
    listRepo = {
      findOne: vi.fn().mockResolvedValue({
        list_no: 'OB202506001',
        stage: 'personnel_ratio',
        status: 'active',
        project_workym: '202605',
      }),
    };
    // StageActionService constructor 注入順序：
    //   (listRepo, deptPctRepo, emplSetRepo, approvalRepo,
    //    stageTransition, ratioValidation, personnelRatioValidation, runGuard, stage0Estimate)
    const deptPctRepo = { find: vi.fn().mockResolvedValue([]), findOne: vi.fn() };
    const emplSetRepo = { find: vi.fn().mockResolvedValue([]) };
    const approvalRepo = { createQueryBuilder: vi.fn() };
    const ratioValidation = { assertEachInRange: vi.fn() };
    const stage0Estimate = { estimateListCount: vi.fn().mockResolvedValue({ count: 0 }) };
    svc = new StageActionService(
      listRepo,
      deptPctRepo,
      emplSetRepo,
      approvalRepo,
      stageTransition,
      ratioValidation,
      personnelRatioValidation,
      runGuard,
      stage0Estimate,
    );
    deps = { svc };
  });

  const directorActor = { userId: 'director-001', role: 'user', businessRole: 'director', ipAddress: null };

  // TC-F084-026
  it('TC-F084-026：部長手動推進成功（走 advanceTo，不含 auto_advanced_by_completion）', async () => {
    const res = await svc.advancePersonnelRatioToApproval('OB202506001', directorActor, '202605');

    expect(res.currentStage).toBe('approval');
    expect(res.advancedByRole).toBe('director');
    expect(stageTransition.advanceTo).toHaveBeenCalled();
    // advanceTo 簽名為 (listNo, from, to, actorId, preconditionFn, postActionFn?)；不含 auditMetadata
    const callArgs = stageTransition.advanceTo.mock.calls[0];
    // 第 5 個參數應為 preconditionFn（function），非 metadata 物件
    expect(typeof callArgs[4]).toBe('function');
  });

  // TC-F084-027
  it('TC-F084-027：仍有部門未完成 → 422 STAGE_ADVANCE_PRECONDITION_FAILED', async () => {
    // advanceTo 內部會呼叫 preconditionFn → assertAllDeptsSumEquals100 拋 422
    stageTransition.advanceTo.mockImplementation(async (...args: any[]) => {
      const preconditionFn = args[4];
      await preconditionFn({});
    });
    personnelRatioValidation.assertAllDeptsSumEquals100.mockRejectedValue(
      new UnprocessableEntityException({
        error: ERROR_CODES.STAGE_ADVANCE_PRECONDITION_FAILED,
        details: [{ incompleteDepts: ['XTD0'] }],
      }),
    );

    await expect(
      svc.advancePersonnelRatioToApproval('OB202506001', directorActor, '202605'),
    ).rejects.toBeInstanceOf(UnprocessableEntityException);
  });

  // TC-F084-028
  it('TC-F084-028：月跑進行中 → 409 ASSIGNMENT_RUN_ALREADY_RUNNING', async () => {
    const { ConflictException } = await import('@nestjs/common');
    runGuard.assertNoRunningRun.mockRejectedValue(
      new ConflictException({ error: ERROR_CODES.ASSIGNMENT_RUN_ALREADY_RUNNING }),
    );

    await expect(
      svc.advancePersonnelRatioToApproval('OB202506001', directorActor, '202605'),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  // TC-F084-029
  it('TC-F084-029：歷史月份 → 403 LIST_HISTORICAL_READONLY', async () => {
    listRepo.findOne.mockResolvedValue({
      list_no: 'OB202506001',
      stage: 'personnel_ratio',
      status: 'active',
      project_workym: '202504',
    });

    await expect(
      svc.advancePersonnelRatioToApproval('OB202506001', directorActor, '202605'),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  // TC-F084-030
  it('TC-F084-030：stage 不是 personnel_ratio → 422 LIST_STAGE_TRANSITION_FORBIDDEN', async () => {
    // advanceTo 內部 assertStageEquals 拋 422（stage='approval'）
    stageTransition.advanceTo.mockRejectedValue(
      new UnprocessableEntityException({ error: ERROR_CODES.LIST_STAGE_TRANSITION_FORBIDDEN }),
    );

    await expect(
      svc.advancePersonnelRatioToApproval('OB202506001', directorActor, '202605'),
    ).rejects.toBeInstanceOf(UnprocessableEntityException);
  });
});
