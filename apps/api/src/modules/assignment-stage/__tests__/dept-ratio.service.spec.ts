import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  ForbiddenException,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { DeptRatioService } from '../dept-ratio.service';
import { ERROR_CODES } from '@/common/errors/error-codes';

/**
 * F079 v1.2 — 部門比例 Service 測試
 *
 * 對應 spec：
 *   - GET 回傳在職部門 + 既有但已下線部門
 *   - PUT 加總 100% / 邊界容忍 ±0.01% / 越界
 *   - 處長不可達（由 controller layer DirectorGuard 拒絕；service 不需另測）
 *   - 月名單分派進行中 → 409
 *   - 歷史月份 → 403
 *   - 非 dept_ratio → 422 LIST_STAGE_TRANSITION_FORBIDDEN
 *   - 覆寫式：原 5 筆 + 新 3 筆 → DB 剩 3 筆
 */
describe('DeptRatioService (F079)', () => {
  let svc: DeptRatioService;
  let listRepo: any;
  let deptPctRepo: any;
  let emphireRepo: any;
  let userRepo: any;
  let stageTransition: any;
  let ratioValidation: any;
  let runGuard: any;
  let dataSource: any;
  let mgr: any;

  beforeEach(() => {
    mgr = {
      delete: vi.fn().mockResolvedValue({ affected: 0 }),
      insert: vi.fn().mockResolvedValue({}),
      find: vi.fn().mockResolvedValue([]),
    };
    dataSource = {
      transaction: vi.fn(async (fn: any) => fn(mgr)),
    };
    listRepo = { findOne: vi.fn() };
    deptPctRepo = {
      find: vi.fn().mockResolvedValue([]),
      createQueryBuilder: vi.fn(() => ({
        select: vi.fn().mockReturnThis(),
        where: vi.fn().mockReturnThis(),
        getMany: vi.fn().mockResolvedValue([]),
      })),
    };
    emphireRepo = {
      createQueryBuilder: vi.fn(() => ({
        select: vi.fn().mockReturnThis(),
        addSelect: vi.fn().mockReturnThis(),
        where: vi.fn().mockReturnThis(),
        andWhere: vi.fn().mockReturnThis(),
        groupBy: vi.fn().mockReturnThis(),
        orderBy: vi.fn().mockReturnThis(),
        addOrderBy: vi.fn().mockReturnThis(),
        getRawMany: vi.fn().mockResolvedValue([
          { dept_code: 'XTC0', dept_name: '業務一部' },
          { dept_code: 'XTD0', dept_name: '業務二部' },
        ]),
      })),
    };
    stageTransition = {
      assertStageEquals: vi.fn().mockResolvedValue(undefined),
    };
    ratioValidation = {
      assertEachInRange: vi.fn(),
      assertSumEquals100: vi.fn(),
    };
    runGuard = { assertNoRunningRun: vi.fn().mockResolvedValue(undefined) };
    // F088 v1.3：設定者解析（created_by → users）
    userRepo = { find: vi.fn().mockResolvedValue([]) };

    svc = new DeptRatioService(
      dataSource,
      listRepo,
      deptPctRepo,
      emphireRepo,
      userRepo,
      ratioValidation,
      stageTransition,
      runGuard,
    );
  });

  // TC-M03a-001
  it('GET 合併在職部門 + 既有 RATION', async () => {
    listRepo.findOne.mockResolvedValue({
      list_no: 'OB202605001',
      list_nm: '車貸',
      project_workym: '202605',
      stage: 'dept_ratio',
      status: 'active',
    });
    deptPctRepo.find.mockResolvedValue([
      { obdeptid: 'XTC0', obdeptnm: '業務一部', ration: '30' },
      { obdeptid: 'XTF0', obdeptnm: '業務四部(下線)', ration: '15' }, // 在 ob_emphire 不存在
    ]);
    const res = await svc.getDeptRatios('OB202605001');
    expect(res.stage).toBe('dept_ratio');
    const codes = res.deptRatios.map((d) => d.obdeptId).sort();
    expect(codes).toContain('XTC0');
    expect(codes).toContain('XTF0');
    const xtf = res.deptRatios.find((d) => d.obdeptId === 'XTF0');
    expect(xtf?.isActive).toBe(false);
    expect(res.isReadOnly).toBe(false);
  });

  // 準備完成摘要：excludeZeroRatio 隱藏 0% 部門
  it('GET excludeZeroRatio=true → 隱藏比例 = 0% 之部門（設定頁不傳則全顯示）', async () => {
    listRepo.findOne.mockResolvedValue({
      list_no: 'L1',
      list_nm: 'X',
      project_workym: '202605',
      stage: 'ready',
      status: 'active',
    });
    // XTC0 配置 60%；XTD0（在職部門）無配置 → ration 0
    deptPctRepo.find.mockResolvedValue([
      { obdeptid: 'XTC0', obdeptnm: '業務一部', ration: '60' },
    ]);

    const all = await svc.getDeptRatios('L1');
    expect(all.deptRatios.map((d) => d.obdeptId).sort()).toEqual(['XTC0', 'XTD0']);
    expect(all.deptRatios.find((d) => d.obdeptId === 'XTD0')!.ration).toBe(0);

    const filtered = await svc.getDeptRatios('L1', { excludeZeroRatio: true });
    expect(filtered.deptRatios.map((d) => d.obdeptId)).toEqual(['XTC0']);
    expect(filtered.deptRatios.every((d) => d.ration > 0)).toBe(true);
  });

  // F088 v1.3 BR-11：設定者 / 部長代設定 解析
  it('F088 GET：設定者解析 — director 設定 → proxyByDirector=true；section_chief → false', async () => {
    listRepo.findOne.mockResolvedValue({
      list_no: 'OB202605001',
      list_nm: '車貸',
      project_workym: '202605',
      stage: 'ready',
      status: 'active',
    });
    deptPctRepo.find.mockResolvedValue([
      { obdeptid: 'XTC0', obdeptnm: '業務一部', ration: '60', created_by: '0d1a0000-0000-4000-8000-000000000001' },
      { obdeptid: 'XTD0', obdeptnm: '業務二部', ration: '40', created_by: '0c1e0000-0000-4000-8000-000000000002' },
    ]);
    userRepo.find.mockResolvedValue([
      { id: '0d1a0000-0000-4000-8000-000000000001', name: '張部長', role: 'user', business_role: 'director' },
      { id: '0c1e0000-0000-4000-8000-000000000002', name: '李處長', role: 'user', business_role: 'section_chief' },
    ]);

    const res = await svc.getDeptRatios('OB202605001');
    const xtc0 = res.deptRatios.find((d) => d.obdeptId === 'XTC0')!;
    const xtd0 = res.deptRatios.find((d) => d.obdeptId === 'XTD0')!;
    expect(xtc0.setByName).toBe('張部長');
    expect(xtc0.proxyByDirector).toBe(true);
    expect(xtd0.setByName).toBe('李處長');
    expect(xtd0.proxyByDirector).toBe(false);
  });

  // TC-M03a-002
  it('PUT 加總 100 → 成功儲存 + audit', async () => {
    listRepo.findOne.mockResolvedValue({
      list_no: 'L1',
      list_nm: 'X',
      project_workym: '202605',
      stage: 'dept_ratio',
      status: 'active',
    });
    deptPctRepo.find.mockResolvedValue([]);

    const res = await svc.setDeptRatios(
      'L1',
      {
        deptRatios: [
          { obdeptId: 'XTC0', obdeptNm: '一部', ration: 60 },
          { obdeptId: 'XTD0', obdeptNm: '二部', ration: 40 },
        ],
      },
      { userId: 'u1', ipAddress: null },
      '202605',
    );
    expect(res.savedCount).toBe(2);
    expect(res.total).toBe(100);
    expect(runGuard.assertNoRunningRun).toHaveBeenCalled();
    expect(stageTransition.assertStageEquals).toHaveBeenCalledWith('L1', 'dept_ratio');
    expect(ratioValidation.assertEachInRange).toHaveBeenCalled();
    expect(ratioValidation.assertSumEquals100).toHaveBeenCalled();
    expect(mgr.delete).toHaveBeenCalled();
    expect(mgr.insert).toHaveBeenCalledTimes(3); // 2 dept rows + 1 audit
  });

  // TC-M03a-003
  it('PUT 名單不存在 → 404 ASSIGNMENT_LIST_NOT_FOUND', async () => {
    listRepo.findOne.mockResolvedValue(null);
    await expect(
      svc.setDeptRatios('NO', { deptRatios: [{ obdeptId: 'X', obdeptNm: 'X', ration: 100 }] }, { userId: 'u1', ipAddress: null }, '202605'),
    ).rejects.toThrow(NotFoundException);
  });

  // TC-M03a-004
  it('PUT 歷史月份 → 403 LIST_HISTORICAL_READONLY', async () => {
    listRepo.findOne.mockResolvedValue({
      list_no: 'L1',
      list_nm: 'X',
      project_workym: '202504',
      stage: 'dept_ratio',
      status: 'active',
    });
    try {
      await svc.setDeptRatios('L1', { deptRatios: [{ obdeptId: 'X', obdeptNm: 'X', ration: 100 }] }, { userId: 'u1', ipAddress: null }, '202605');
    } catch (e: any) {
      expect(e).toBeInstanceOf(ForbiddenException);
      expect(e.response.error).toBe(ERROR_CODES.LIST_HISTORICAL_READONLY);
    }
  });

  // TC-M03a-005
  it('PUT 已停用 → 422 ASSIGNMENT_LIST_INACTIVE', async () => {
    listRepo.findOne.mockResolvedValue({
      list_no: 'L1',
      list_nm: 'X',
      project_workym: '202605',
      stage: 'dept_ratio',
      status: 'inactive',
    });
    try {
      await svc.setDeptRatios('L1', { deptRatios: [{ obdeptId: 'X', obdeptNm: 'X', ration: 100 }] }, { userId: 'u1', ipAddress: null }, '202605');
    } catch (e: any) {
      expect(e).toBeInstanceOf(UnprocessableEntityException);
      expect(e.response.error).toBe(ERROR_CODES.ASSIGNMENT_LIST_INACTIVE);
    }
  });

  // TC-M03a-006
  it('PUT 月名單分派進行中 → 409', async () => {
    runGuard.assertNoRunningRun.mockRejectedValue(new Error('ASSIGNMENT_RUN_ALREADY_RUNNING'));
    await expect(
      svc.setDeptRatios('L1', { deptRatios: [{ obdeptId: 'X', obdeptNm: 'X', ration: 100 }] }, { userId: 'u1', ipAddress: null }, '202605'),
    ).rejects.toThrow();
    expect(stageTransition.assertStageEquals).not.toHaveBeenCalled();
  });
});

/**
 * F117 v1.1 — 部門比例設定頁僅提供「有在職處長」之部門設定
 *
 * 對應：
 *   - docs/specs/features/F117-dept-ratio-director-required-filter.md（AC-1~AC-10 / BR-1~BR-11）
 *   - docs/specs/implementation-log/AD-E07-48-f117-f118-ux-refinements.md §4（GET/PUT 增量）
 *   - docs/test-specs/features/F117-test.md（TS-F117-BE-001~012）
 *
 * mock 慣例說明：`emphireRepo.createQueryBuilder()` 為單一非計次 factory（沿用既有 F079 慣例，
 * 見上方 beforeEach），本群組於各測試內覆寫其 `getRawMany()` 回傳值，回傳值視為「已通過
 * activeEmphireCondition + jfun_nm='處長' + ORDER BY dept_code, hire_date 篩選/排序後」之列
 * （即 SQL WHERE/ORDER 之效果由測試資料本身表達，不在 mock chain 內重新實作 SQL 邏輯）。
 * 若實作將部門清單查詢與處長判定查詢合併為一次呼叫，本測試提供之列形狀（同時含
 * dept_code/dept_name/emp_nm）仍可滿足；若實作維持兩次獨立查詢，兩次呼叫皆會拿到
 * 同一份資料，其中不相關欄位由服務層自行取用需要的欄位。
 *
 * PUT 側測試（BE-008~012）不依賴上述模糊性：AD-E07-48 §2 明文「現行 PUT 完全不查
 * ob_emphire」，故 F117 PUT 新增的 computeActiveDirectorMap() 呼叫為 PUT 流程中「唯一」一次
 * emphireRepo 查詢，可精確 mock。
 */
describe('DeptRatioService (F117)', () => {
  let svc: DeptRatioService;
  let listRepo: any;
  let deptPctRepo: any;
  let emphireRepo: any;
  let userRepo: any;
  let stageTransition: any;
  let ratioValidation: any;
  let runGuard: any;
  let dataSource: any;
  let mgr: any;

  function makeEmphireChain(rows: Array<{ dept_code: string; dept_name?: string; emp_nm: string }>) {
    return {
      select: vi.fn().mockReturnThis(),
      addSelect: vi.fn().mockReturnThis(),
      where: vi.fn().mockReturnThis(),
      andWhere: vi.fn().mockReturnThis(),
      groupBy: vi.fn().mockReturnThis(),
      orderBy: vi.fn().mockReturnThis(),
      addOrderBy: vi.fn().mockReturnThis(),
      getRawMany: vi.fn().mockResolvedValue(rows),
    };
  }

  beforeEach(() => {
    mgr = {
      delete: vi.fn().mockResolvedValue({ affected: 0 }),
      insert: vi.fn().mockResolvedValue({}),
      find: vi.fn().mockResolvedValue([]),
    };
    dataSource = { transaction: vi.fn(async (fn: any) => fn(mgr)) };
    listRepo = {
      findOne: vi.fn().mockResolvedValue({
        list_no: 'L1',
        list_nm: 'X',
        project_workym: '202605',
        stage: 'dept_ratio',
        status: 'active',
      }),
    };
    deptPctRepo = { find: vi.fn().mockResolvedValue([]) };
    emphireRepo = { createQueryBuilder: vi.fn(() => makeEmphireChain([])) };
    stageTransition = { assertStageEquals: vi.fn().mockResolvedValue(undefined) };
    ratioValidation = { assertEachInRange: vi.fn(), assertSumEquals100: vi.fn() };
    runGuard = { assertNoRunningRun: vi.fn().mockResolvedValue(undefined) };
    userRepo = { find: vi.fn().mockResolvedValue([]) };

    svc = new DeptRatioService(
      dataSource,
      listRepo,
      deptPctRepo,
      emphireRepo,
      userRepo,
      ratioValidation,
      stageTransition,
      runGuard,
    );
  });

  // TS-F117-BE-001
  it('GET requireDirector=true，4 部門皆有處長 → 全數可編輯、hiddenNoDirectorCount=0', async () => {
    emphireRepo.createQueryBuilder = vi.fn(() =>
      makeEmphireChain([
        { dept_code: 'A', dept_name: '一部', emp_nm: '甲處長' },
        { dept_code: 'B', dept_name: '二部', emp_nm: '乙處長' },
        { dept_code: 'C', dept_name: '三部', emp_nm: '丙處長' },
        { dept_code: 'D', dept_name: '四部', emp_nm: '丁處長' },
      ]),
    );
    deptPctRepo.find.mockResolvedValue([
      { obdeptid: 'A', obdeptnm: '一部', ration: '30' },
      { obdeptid: 'B', obdeptnm: '二部', ration: '25' },
      { obdeptid: 'C', obdeptnm: '三部', ration: '25' },
      { obdeptid: 'D', obdeptnm: '四部', ration: '20' },
    ]);

    const res = await svc.getDeptRatios('L1', { requireDirector: true } as any);
    expect(res.deptRatios).toHaveLength(4);
    expect(res.deptRatios.every((d: any) => d.hasActiveDirector === true)).toBe(true);
    expect(res.deptRatios.every((d: any) => d.isRatioEditable === true)).toBe(true);
    expect((res as any).hiddenNoDirectorCount).toBe(0);
  });

  // TS-F117-BE-002
  it('GET requireDirector=true，5 部門其中 1 無處長且 ration=0 → 回 4 列、hiddenNoDirectorCount=1', async () => {
    emphireRepo.createQueryBuilder = vi.fn(() =>
      makeEmphireChain([
        { dept_code: 'A', dept_name: '一部', emp_nm: '甲處長' },
        { dept_code: 'B', dept_name: '二部', emp_nm: '乙處長' },
        { dept_code: 'C', dept_name: '三部', emp_nm: '丙處長' },
        { dept_code: 'D', dept_name: '四部', emp_nm: '丁處長' },
        // E 部門無處長列（未列入）
      ]),
    );
    deptPctRepo.find.mockResolvedValue([
      { obdeptid: 'A', obdeptnm: '一部', ration: '30' },
      { obdeptid: 'B', obdeptnm: '二部', ration: '25' },
      { obdeptid: 'C', obdeptnm: '三部', ration: '25' },
      { obdeptid: 'D', obdeptnm: '四部', ration: '20' },
      { obdeptid: 'E', obdeptnm: '五部', ration: '0' },
    ]);

    const res = await svc.getDeptRatios('L1', { requireDirector: true } as any);
    expect(res.deptRatios.map((d: any) => d.obdeptId).sort()).toEqual(['A', 'B', 'C', 'D']);
    expect((res as any).hiddenNoDirectorCount).toBe(1);
  });

  // TS-F117-BE-003（★核心）
  it('GET requireDirector=true，1 部門無處長但既有 ration=20 → 回該列、isRatioEditable=false、不計入 hiddenNoDirectorCount', async () => {
    emphireRepo.createQueryBuilder = vi.fn(() =>
      makeEmphireChain([{ dept_code: 'A', dept_name: '一部', emp_nm: '甲處長' }]),
    );
    deptPctRepo.find.mockResolvedValue([
      { obdeptid: 'A', obdeptnm: '一部', ration: '80' },
      { obdeptid: 'B', obdeptnm: '二部（孤兒）', ration: '20' },
    ]);

    const res = await svc.getDeptRatios('L1', { requireDirector: true } as any);
    const orphan = res.deptRatios.find((d: any) => d.obdeptId === 'B');
    expect(orphan).toBeDefined();
    expect((orphan as any).hasActiveDirector).toBe(false);
    expect((orphan as any).isRatioEditable).toBe(false);
    expect((res as any).hiddenNoDirectorCount).toBe(0);
  });

  // TS-F117-BE-004
  it('GET，處長已離職（不在有效處長列中）→ 判定無處長', async () => {
    // 已離職處長不應出現於「已通過在職判定」之查詢結果中（見本群組頂部 mock 慣例說明）
    emphireRepo.createQueryBuilder = vi.fn(() => makeEmphireChain([]));
    deptPctRepo.find.mockResolvedValue([{ obdeptid: 'A', obdeptnm: '一部', ration: '50' }]);

    const res = await svc.getDeptRatios('L1', { requireDirector: false } as any);
    const a = res.deptRatios.find((d: any) => d.obdeptId === 'A');
    expect((a as any).hasActiveDirector).toBe(false);
  });

  // TS-F117-BE-005
  it('GET，哨兵值 resign_date=9999-12-31 之處長 → 判定有處長（在職語意迴歸）', async () => {
    // 哨兵值代表在職，故應出現於「已通過在職判定」之查詢結果中
    emphireRepo.createQueryBuilder = vi.fn(() =>
      makeEmphireChain([{ dept_code: 'A', dept_name: '一部', emp_nm: '甲處長（哨兵在職）' }]),
    );
    deptPctRepo.find.mockResolvedValue([{ obdeptid: 'A', obdeptnm: '一部', ration: '50' }]);

    const res = await svc.getDeptRatios('L1', { requireDirector: false } as any);
    const a = res.deptRatios.find((d: any) => d.obdeptId === 'A');
    expect((a as any).hasActiveDirector).toBe(true);
    expect(a!.directorName).toBe('甲處長（哨兵在職）');
  });

  // TS-F117-BE-006
  it('GET，同部門 2 位在職處長 → 取最早 hire_date 者（列陣列已依 hire_date ASC 排序，取第一筆）', async () => {
    emphireRepo.createQueryBuilder = vi.fn(() =>
      makeEmphireChain([
        { dept_code: 'A', dept_name: '一部', emp_nm: '較早到職者' }, // hire_date 較早，排序在前
        { dept_code: 'A', dept_name: '一部', emp_nm: '較晚到職者' },
      ]),
    );
    deptPctRepo.find.mockResolvedValue([{ obdeptid: 'A', obdeptnm: '一部', ration: '50' }]);

    const res = await svc.getDeptRatios('L1', { requireDirector: false } as any);
    const a = res.deptRatios.find((d: any) => d.obdeptId === 'A');
    expect(a!.directorName).toBe('較早到職者');
  });

  // TS-F117-BE-007（AC-10 回歸）
  it('GET 不帶 requireDirector → 陣列不因處長狀態過濾，但 hasActiveDirector/isRatioEditable 仍恆計算並回傳', async () => {
    emphireRepo.createQueryBuilder = vi.fn(() => makeEmphireChain([]));
    deptPctRepo.find.mockResolvedValue([
      { obdeptid: 'A', obdeptnm: '一部', ration: '0' }, // 無處長 + ration 0（若 requireDirector=true 應被隱藏）
    ]);

    const res = await svc.getDeptRatios('L1');
    expect(res.deptRatios.map((d: any) => d.obdeptId)).toEqual(['A']); // 未被過濾
    expect((res as any).hiddenNoDirectorCount).toBe(0);
    const a = res.deptRatios.find((d: any) => d.obdeptId === 'A')!;
    expect(typeof (a as any).hasActiveDirector).toBe('boolean');
    expect(typeof (a as any).isRatioEditable).toBe('boolean');
  });

  // TS-F117-BE-008（★核心）
  it('PUT 孤兒保留 — 既有 {A:60(有處長), B:40(無處長)}，payload 僅送 {A:60} → 最終持久化含 B，加總驗證以 100 為準', async () => {
    emphireRepo.createQueryBuilder = vi.fn(() =>
      makeEmphireChain([{ dept_code: 'A', dept_name: '一部', emp_nm: '甲處長' }]),
    );
    deptPctRepo.find.mockResolvedValue([
      { obdeptid: 'A', obdeptnm: '一部', ration: '60' },
      { obdeptid: 'B', obdeptnm: '二部（孤兒）', ration: '40' },
    ]);

    await svc.setDeptRatios(
      'L1',
      { deptRatios: [{ obdeptId: 'A', obdeptNm: '一部', ration: 60 }] },
      { userId: 'u1', ipAddress: null },
      '202605',
    );

    // BR-7：加總驗證對象須含孤兒列 B（40），總和 100，非僅 payload 的 60
    const sumArgs = ratioValidation.assertSumEquals100.mock.calls[0][0];
    const sumTotal = Array.isArray(sumArgs)
      ? sumArgs.reduce((s: number, r: any) => s + Number(r?.ration ?? r), 0)
      : sumArgs;
    expect(sumTotal).toBeCloseTo(100, 2);
  });

  // TS-F117-BE-009
  it('PUT 孤兒列竄改 — payload 送 {A:60, B:0} → B 仍以既有值 40 為準（BR-5），不拋錯', async () => {
    emphireRepo.createQueryBuilder = vi.fn(() =>
      makeEmphireChain([{ dept_code: 'A', dept_name: '一部', emp_nm: '甲處長' }]),
    );
    deptPctRepo.find.mockResolvedValue([
      { obdeptid: 'A', obdeptnm: '一部', ration: '60' },
      { obdeptid: 'B', obdeptnm: '二部（孤兒）', ration: '40' },
    ]);

    await expect(
      svc.setDeptRatios(
        'L1',
        {
          deptRatios: [
            { obdeptId: 'A', obdeptNm: '一部', ration: 60 },
            { obdeptId: 'B', obdeptNm: '二部（孤兒）', ration: 0 },
          ],
        },
        { userId: 'u1', ipAddress: null },
        '202605',
      ),
    ).resolves.toBeDefined();

    const sumArgs = ratioValidation.assertSumEquals100.mock.calls[0][0];
    const sumTotal = Array.isArray(sumArgs)
      ? sumArgs.reduce((s: number, r: any) => s + Number(r?.ration ?? r), 0)
      : sumArgs;
    expect(sumTotal).toBeCloseTo(100, 2); // 40（既有值）非 0（payload 竄改值）
  });

  // TS-F117-BE-010
  it('PUT 無處長新配置 — 對無處長且無既有比例之 C 配 10% → 422 RATIO_DEPT_DIRECTOR_REQUIRED', async () => {
    emphireRepo.createQueryBuilder = vi.fn(() =>
      makeEmphireChain([{ dept_code: 'A', dept_name: '一部', emp_nm: '甲處長' }]),
    );
    deptPctRepo.find.mockResolvedValue([{ obdeptid: 'A', obdeptnm: '一部', ration: '90' }]);

    try {
      await svc.setDeptRatios(
        'L1',
        {
          deptRatios: [
            { obdeptId: 'A', obdeptNm: '一部', ration: 90 },
            { obdeptId: 'C', obdeptNm: '三部（無處長無既有）', ration: 10 },
          ],
        },
        { userId: 'u1', ipAddress: null },
        '202605',
      );
      expect.fail('應拋出 RATIO_DEPT_DIRECTOR_REQUIRED');
    } catch (e: any) {
      expect(e).toBeInstanceOf(UnprocessableEntityException);
      expect(e.response?.error ?? e.response?.error?.code ?? e.message).toContain(
        'RATIO_DEPT_DIRECTOR_REQUIRED',
      );
    }
  });

  // TS-F117-BE-011
  it('PUT 加總範圍 — payload {A:100} + 孤兒 B:40 → 最終 140 → 422 RATIO_SUM_NOT_100（BR-7）', async () => {
    emphireRepo.createQueryBuilder = vi.fn(() =>
      makeEmphireChain([{ dept_code: 'A', dept_name: '一部', emp_nm: '甲處長' }]),
    );
    deptPctRepo.find.mockResolvedValue([
      { obdeptid: 'A', obdeptnm: '一部', ration: '60' },
      { obdeptid: 'B', obdeptnm: '二部（孤兒）', ration: '40' },
    ]);
    ratioValidation.assertSumEquals100.mockImplementation((ratios: any) => {
      const total = Array.isArray(ratios)
        ? ratios.reduce((s: number, r: any) => s + Number(r?.ration ?? r), 0)
        : ratios;
      if (Math.abs(total - 100) > 0.01) {
        throw new UnprocessableEntityException({ error: 'RATIO_SUM_NOT_100' });
      }
    });

    await expect(
      svc.setDeptRatios(
        'L1',
        { deptRatios: [{ obdeptId: 'A', obdeptNm: '一部', ration: 100 }] },
        { userId: 'u1', ipAddress: null },
        '202605',
      ),
    ).rejects.toThrow(UnprocessableEntityException);
  });

  // TS-F117-BE-012
  it('PUT 稽核 — after_value（或等價最終寫入紀錄）含保留之孤兒列', async () => {
    emphireRepo.createQueryBuilder = vi.fn(() =>
      makeEmphireChain([{ dept_code: 'A', dept_name: '一部', emp_nm: '甲處長' }]),
    );
    deptPctRepo.find.mockResolvedValue([
      { obdeptid: 'A', obdeptnm: '一部', ration: '60' },
      { obdeptid: 'B', obdeptnm: '二部（孤兒）', ration: '40' },
    ]);

    await svc.setDeptRatios(
      'L1',
      { deptRatios: [{ obdeptId: 'A', obdeptNm: '一部', ration: 60 }] },
      { userId: 'u1', ipAddress: null },
      '202605',
    );

    // 最終持久化之 dept_pct 列插入須含孤兒部門 B（BR-4/BR-9：非僅檢查「B 字串出現於任何 insert 呼叫」，
    // 避免誤配對到 audit 稽核紀錄之 before_value 陣列本就含 B 之情況——那只證明「讀到了 B」，
    // 不證明「B 被寫回」，兩者不可混淆，否則會是 false positive（tautological pass）。
    const deptPctRowInserts = mgr.insert.mock.calls.filter((call: any) => {
      const payload = call[1];
      const rows = Array.isArray(payload) ? payload : [payload];
      return rows.some(
        (r: any) => r && typeof r === 'object' && 'obdeptid' in r && !('after_value' in (call[1] ?? {})),
      );
    });
    const persistedIds = deptPctRowInserts.flatMap((call: any) => {
      const payload = call[1];
      const rows = Array.isArray(payload) ? payload : [payload];
      return rows.map((r: any) => r?.obdeptid);
    });
    expect(persistedIds).toContain('B');
  });
});
