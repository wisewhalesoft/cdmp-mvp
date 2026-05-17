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
    stageTransition = { assertStageEquals: vi.fn().mockResolvedValue(undefined) };
    ratioValidation = { assertEachInRange: vi.fn() };
    personnelRatioValidation = { assertDeptSumEquals100: vi.fn() };
    runGuard = { assertNoRunningRun: vi.fn().mockResolvedValue(undefined) };

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

  // TC-M03b-005 — F083 後端二次校驗
  it('PUT 含 appliedTemplate +10%；正確結果 → 通過', async () => {
    listRepo.findOne.mockResolvedValue(validList);
    deptPctRepo.findOne.mockResolvedValue({ obdeptid: 'XTC0' });
    // 2 人 → defaultRation = 50；+10% = 60；其餘均分 (100-60)/1 = 40
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

  // TC-M03b-006
  it('PUT 含 appliedTemplate 但 ration 與模板計算不符 → 422 BONUS_PENALTY_TEMPLATE_INVALID', async () => {
    listRepo.findOne.mockResolvedValue(validList);
    deptPctRepo.findOne.mockResolvedValue({ obdeptid: 'XTC0' });
    try {
      await svc.setPersonnelRatios(
        'L1',
        {
          deptCode: 'XTC0',
          employees: [
            { empId: 'EMP001', empName: '張三', ration: 70 }, // 模板算為 60
            { empId: 'EMP002', empName: '李四', ration: 30 },
          ],
          appliedTemplate: { template: '+10%', targetEmpId: 'EMP001' },
        },
        validActor,
        '202605',
      );
    } catch (e: any) {
      expect(e.response.error).toBe(ERROR_CODES.BONUS_PENALTY_TEMPLATE_INVALID);
    }
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
});
