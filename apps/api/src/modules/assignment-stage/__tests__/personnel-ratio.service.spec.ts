import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  ForbiddenException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { PersonnelRatioService } from '../personnel-ratio.service';
import { ERROR_CODES } from '@/common/errors/error-codes';

/**
 * F082 v1.4 + F083 v1.3 — 個別業務比例 Service 測試
 *
 * 涵蓋：
 *   - PUT 加總 100% / per-DEPT
 *   - 處長轄區 (PERSONNEL_RATIO_OUT_OF_SCOPE)
 *   - ob_dept_pct 不存在 → PERSONNEL_RATIO_DEPT_NOT_FOUND
 *   - 員工不存在 / 已離職 → RATIO_OUT_OF_RANGE
 *   - 月跑進行中 / 歷史月份 / 名單停用
 *   - F083 後端二次校驗 BONUS_PENALTY_TEMPLATE_INVALID
 */
describe('PersonnelRatioService (F082 + F083)', () => {
  let svc: PersonnelRatioService;
  let listRepo: any;
  let deptPctRepo: any;
  let emplSetRepo: any;
  let emphireRepo: any;
  let approvalRepo: any;
  let userRepo: any;
  let scopeService: any;
  let stageTransition: any;
  let ratioValidation: any;
  let personnelRatioValidation: any;
  let runGuard: any;
  let dataSource: any;
  let mgr: any;

  beforeEach(() => {
    mgr = {
      delete: vi.fn().mockResolvedValue({ affected: 0 }),
      insert: vi.fn().mockResolvedValue({}),
      find: vi.fn().mockResolvedValue([]),
    };
    dataSource = { transaction: vi.fn(async (fn: any) => fn(mgr)) };
    listRepo = { findOne: vi.fn() };
    deptPctRepo = {
      find: vi.fn().mockResolvedValue([]),
      findOne: vi.fn(),
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
        { emp_id: 'EMP001', emp_nm: '張三', dept_code: 'XTC0', dept_name: '一部', resign_date: null },
        { emp_id: 'EMP002', emp_nm: '李四', dept_code: 'XTC0', dept_name: '一部', resign_date: null },
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
    userRepo = { findOne: vi.fn().mockResolvedValue(null) };
    stageTransition = { assertStageEquals: vi.fn().mockResolvedValue(undefined) };
    ratioValidation = { assertEachInRange: vi.fn() };
    personnelRatioValidation = { assertDeptSumEquals100: vi.fn() };
    runGuard = { assertNoRunningRun: vi.fn().mockResolvedValue(undefined) };
    // F082 v1.5 BR-3 / F074 v2.1 BR-1：透過 SectionChiefScopeService.getScopeDeptCode
    // 反查處長轄區（email 對 ob_emphire）；測試預設 null（actor 非處長 / 對不上）
    scopeService = {
      getScopeDeptCode: vi.fn().mockResolvedValue(null),
    };

    svc = new PersonnelRatioService(
      dataSource,
      listRepo,
      deptPctRepo,
      emplSetRepo,
      emphireRepo,
      approvalRepo,
      userRepo,
      ratioValidation,
      personnelRatioValidation,
      stageTransition,
      runGuard,
      scopeService,
    );
  });

  const validList = {
    list_no: 'L1',
    list_nm: 'X',
    project_workym: '202605',
    stage: 'personnel_ratio',
    status: 'active',
  };
  const validActor = {
    userId: 'u1',
    role: 'user',
    businessRole: 'director',
    ipAddress: null,
  };

  // TC-M03b-001
  it('PUT 加總 = 100 → 成功儲存', async () => {
    listRepo.findOne.mockResolvedValue(validList);
    deptPctRepo.findOne.mockResolvedValue({ obdeptid: 'XTC0' });

    const res = await svc.setPersonnelRatios(
      'L1',
      {
        deptCode: 'XTC0',
        employees: [
          { empId: 'EMP001', empName: '張三', ration: 60 },
          { empId: 'EMP002', empName: '李四', ration: 40 },
        ],
      },
      validActor,
      '202605',
    );
    expect(res.savedCount).toBe(2);
    expect(res.deptSum).toBe(100);
    expect(personnelRatioValidation.assertDeptSumEquals100).toHaveBeenCalledWith('XTC0', [60, 40], 2);
    expect(stageTransition.assertStageEquals).toHaveBeenCalledWith('L1', 'personnel_ratio');
  });

  // TC-M03b-002
  it('PUT 部門未配置 → 422 PERSONNEL_RATIO_DEPT_NOT_FOUND', async () => {
    listRepo.findOne.mockResolvedValue(validList);
    deptPctRepo.findOne.mockResolvedValue(null);
    try {
      await svc.setPersonnelRatios('L1', { deptCode: 'XTC0', employees: [] }, validActor, '202605');
    } catch (e: any) {
      expect(e.response.error).toBe(ERROR_CODES.PERSONNEL_RATIO_DEPT_NOT_FOUND);
    }
  });

  // TC-M03b-003
  it('PUT 含離職員工 → 422 RATIO_OUT_OF_RANGE + resignedEmpIds', async () => {
    listRepo.findOne.mockResolvedValue(validList);
    deptPctRepo.findOne.mockResolvedValue({ obdeptid: 'XTC0' });
    emphireRepo.find.mockResolvedValue([
      { emp_id: 'EMP001', emp_nm: 'X', dept_code: 'XTC0', dept_name: '一', resign_date: new Date('2025-01-01') },
    ]);
    try {
      await svc.setPersonnelRatios(
        'L1',
        { deptCode: 'XTC0', employees: [{ empId: 'EMP001', empName: 'X', ration: 100 }] },
        validActor,
        '202605',
      );
    } catch (e: any) {
      expect(e.response.error).toBe(ERROR_CODES.RATIO_OUT_OF_RANGE);
      expect(e.response.details[0].resignedEmpIds).toContain('EMP001');
    }
  });

  // TC-M03b-004
  it('PUT 處長越權部門 → 403 PERSONNEL_RATIO_OUT_OF_SCOPE', async () => {
    listRepo.findOne.mockResolvedValue(validList);
    deptPctRepo.findOne.mockResolvedValue({ obdeptid: 'XTC0' });
    emplSetRepo.find.mockResolvedValue([
      { emplid: 'EMP001', deptid_m: 'XTC0', created_by: 'other-chief', ration: '50' },
    ]);
    const sectionChiefActor = { userId: 'me', role: 'user', businessRole: 'section_chief', ipAddress: null };
    try {
      await svc.setPersonnelRatios(
        'L1',
        { deptCode: 'XTC0', employees: [{ empId: 'EMP001', empName: 'X', ration: 100 }] },
        sectionChiefActor,
        '202605',
      );
    } catch (e: any) {
      expect(e).toBeInstanceOf(ForbiddenException);
      expect(e.response.error).toBe(ERROR_CODES.PERSONNEL_RATIO_OUT_OF_SCOPE);
    }
  });

  // TC-M03b-005 — F083 v1.4 弱化校驗：appliedTemplate 僅作 audit hint，不再驗 ration 公式
  it('PUT 含 appliedTemplate +10%；ration 任意值 + 加總=100% → 通過', async () => {
    listRepo.findOne.mockResolvedValue(validList);
    deptPctRepo.findOne.mockResolvedValue({ obdeptid: 'XTC0' });
    // baseline 模型下 ration 可為任何值（13.6 / 3.2 等），只要加總 = 100
    const res = await svc.setPersonnelRatios(
      'L1',
      {
        deptCode: 'XTC0',
        employees: [
          { empId: 'EMP001', empName: '張三', ration: 60 },
          { empId: 'EMP002', empName: '李四', ration: 40 },
        ],
        appliedTemplate: { template: '+10%', targetEmpId: 'EMP001' },
      },
      validActor,
      '202605',
    );
    expect(res.savedCount).toBe(2);
  });

  // TC-M03b-005b — F083 v1.4 弱化校驗下，先前 v1.3 公式不符的 case 現也通過
  it('PUT appliedTemplate ration 與舊公式不符（13.6 vs 13.57）→ 通過（v1.4 不再嚴格驗）', async () => {
    listRepo.findOne.mockResolvedValue(validList);
    deptPctRepo.findOne.mockResolvedValue({ obdeptid: 'XTC0' });
    const res = await svc.setPersonnelRatios(
      'L1',
      {
        deptCode: 'XTC0',
        employees: [
          { empId: 'EMP001', empName: '張三', ration: 70 }, // 舊公式算 60，差 10
          { empId: 'EMP002', empName: '李四', ration: 30 },
        ],
        appliedTemplate: { template: '+10%', targetEmpId: 'EMP001' },
      },
      validActor,
      '202605',
    );
    expect(res.savedCount).toBe(2);
  });

  // TC-M03b-006 — F083 v1.4 弱化校驗保留之 invariant：targetEmpId 必須存在
  it('PUT appliedTemplate.targetEmpId 不在 employees → 422 BONUS_PENALTY_TEMPLATE_INVALID', async () => {
    listRepo.findOne.mockResolvedValue(validList);
    deptPctRepo.findOne.mockResolvedValue({ obdeptid: 'XTC0' });
    let caught: any = null;
    try {
      await svc.setPersonnelRatios(
        'L1',
        {
          deptCode: 'XTC0',
          employees: [
            { empId: 'EMP001', empName: '張三', ration: 60 },
            { empId: 'EMP002', empName: '李四', ration: 40 },
          ],
          appliedTemplate: { template: '+10%', targetEmpId: 'EMP999' }, // 不存在
        },
        validActor,
        '202605',
      );
    } catch (e: any) {
      caught = e;
    }
    expect(caught).not.toBeNull();
    expect(caught.response.error).toBe(ERROR_CODES.BONUS_PENALTY_TEMPLATE_INVALID);
  });

  // TC-M03b-007
  it('PUT 月跑進行中 → 拋例外', async () => {
    runGuard.assertNoRunningRun.mockRejectedValue(new Error('ASSIGNMENT_RUN_ALREADY_RUNNING'));
    await expect(
      svc.setPersonnelRatios('L1', { deptCode: 'XTC0', employees: [] }, validActor, '202605'),
    ).rejects.toThrow();
  });

  // TC-M03b-008
  it('PUT 歷史月份 → 403', async () => {
    listRepo.findOne.mockResolvedValue({ ...validList, project_workym: '202504' });
    try {
      await svc.setPersonnelRatios('L1', { deptCode: 'XTC0', employees: [] }, validActor, '202605');
    } catch (e: any) {
      expect(e).toBeInstanceOf(ForbiddenException);
      expect(e.response.error).toBe(ERROR_CODES.LIST_HISTORICAL_READONLY);
    }
  });

  // GET latestRejection：拒絕者姓名解析（approver_name 於寫入時存的是 UUID）
  it('GET latestRejection：rejectorName 解析為 users.name（非 UUID）', async () => {
    const uid = 'd4e5f6a7-b8c9-0123-def4-567890123456';
    listRepo.findOne.mockResolvedValue(validList);
    const emphireChain = {
      select: vi.fn().mockReturnThis(),
      addSelect: vi.fn().mockReturnThis(),
      where: vi.fn().mockReturnThis(),
      andWhere: vi.fn().mockReturnThis(),
      orderBy: vi.fn().mockReturnThis(),
      addOrderBy: vi.fn().mockReturnThis(),
      groupBy: vi.fn().mockReturnThis(),
      setParameter: vi.fn().mockReturnThis(),
      getMany: vi.fn().mockResolvedValue([]),
      getRawMany: vi.fn().mockResolvedValue([]),
    };
    emphireRepo.createQueryBuilder = vi.fn(() => emphireChain);
    emplSetRepo.createQueryBuilder = vi.fn(() => ({
      where: vi.fn().mockReturnThis(),
      andWhere: vi.fn().mockReturnThis(),
      getMany: vi.fn().mockResolvedValue([]),
    }));
    approvalRepo.createQueryBuilder = vi.fn(() => ({
      where: vi.fn().mockReturnThis(),
      orderBy: vi.fn().mockReturnThis(),
      addOrderBy: vi.fn().mockReturnThis(),
      limit: vi.fn().mockReturnThis(),
      getOne: vi.fn().mockResolvedValue({
        action: 'reject',
        reject_reason: '比例不合理',
        approver_id: uid,
        approver_name: uid, // 寫入時存 UUID（bug 現況）
        approver_role: 'director',
        approved_at: new Date('2026-05-15T13:42:00Z'),
      }),
    }));
    userRepo.findOne.mockResolvedValue({ id: uid, name: '游馥瑄' });

    const res: any = await svc.getPersonnelRatios('L1', null, validActor);
    expect(userRepo.findOne).toHaveBeenCalled();
    expect(res.latestRejection.rejectorName).toBe('游馥瑄');
    expect(res.latestRejection.rejectorId).toBe(uid);
  });

  // =====================================================================
  // getCopySources（從本月其他名單複製）
  // =====================================================================
  describe('getCopySources', () => {
    function mockEmplSetQb(rawRows: any[]) {
      emplSetRepo.createQueryBuilder = vi.fn(() => ({
        innerJoin: vi.fn().mockReturnThis(),
        select: vi.fn().mockReturnThis(),
        addSelect: vi.fn().mockReturnThis(),
        where: vi.fn().mockReturnThis(),
        andWhere: vi.fn().mockReturnThis(),
        orderBy: vi.fn().mockReturnThis(),
        addOrderBy: vi.fn().mockReturnThis(),
        getRawMany: vi.fn().mockResolvedValue(rawRows),
      }));
    }

    it('回傳同月其他名單、僅在職員工之比例（依來源名單分組）', async () => {
      listRepo.findOne.mockResolvedValue(validList); // project_workym 202605
      emphireRepo.find.mockResolvedValue([
        { emp_id: 'EMP001', emp_nm: '張三', dept_code: 'XTC0', resign_date: null },
        { emp_id: 'EMP002', emp_nm: '李四', dept_code: 'XTC0', resign_date: null },
        { emp_id: 'EMP003', emp_nm: '已離職', dept_code: 'XTC0', resign_date: new Date('2020-01-01') },
      ]);
      mockEmplSetQb([
        { list_no: 'L2', emplid: 'EMP001', ration: '60', list_nm: '名單二' },
        { list_no: 'L2', emplid: 'EMP002', ration: '40', list_nm: '名單二' },
        { list_no: 'L2', emplid: 'EMP003', ration: '10', list_nm: '名單二' }, // 離職 → 濾除
      ]);

      const res: any = await svc.getCopySources('L1', 'XTC0', validActor);
      expect(res.deptCode).toBe('XTC0');
      expect(res.sources).toHaveLength(1);
      expect(res.sources[0].listNo).toBe('L2');
      expect(res.sources[0].listNm).toBe('名單二');
      expect(res.sources[0].memberCount).toBe(2); // 離職 EMP003 濾除
      expect(res.sources[0].deptSum).toBe(100);
      expect(res.sources[0].employees).toEqual([
        { empId: 'EMP001', empName: '張三', ration: 60 },
        { empId: 'EMP002', empName: '李四', ration: 40 },
      ]);
    });

    it('deptCode 空字串 → 回空 sources（不丟錯、不查詢）', async () => {
      listRepo.findOne.mockResolvedValue(validList);
      const res: any = await svc.getCopySources('L1', '', validActor);
      expect(res.sources).toEqual([]);
      expect(res.deptCode).toBe('');
    });

    it('處長轄區與請求部門不符 → 403 PERSONNEL_RATIO_OUT_OF_SCOPE', async () => {
      listRepo.findOne.mockResolvedValue(validList);
      scopeService.getScopeDeptCode.mockResolvedValue('XTC9'); // 轄區 != 請求 dept
      const sectionChiefActor = {
        userId: 'sc1',
        role: 'user',
        businessRole: 'section_chief',
        ipAddress: null,
      };
      await expect(
        svc.getCopySources('L1', 'XTC0', sectionChiefActor),
      ).rejects.toMatchObject({
        response: { error: ERROR_CODES.PERSONNEL_RATIO_OUT_OF_SCOPE },
      });
    });

    it('本月其他名單皆未設定本部門比例 → 回空 sources', async () => {
      listRepo.findOne.mockResolvedValue(validList);
      emphireRepo.find.mockResolvedValue([
        { emp_id: 'EMP001', emp_nm: '張三', dept_code: 'XTC0', resign_date: null },
      ]);
      mockEmplSetQb([]);
      const res: any = await svc.getCopySources('L1', 'XTC0', validActor);
      expect(res.sources).toEqual([]);
    });
  });
});
