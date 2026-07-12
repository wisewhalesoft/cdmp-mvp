/**
 * F112 / AD-E07-47：PooldataFieldWhitelistService.getDistinctValues Unit Tests
 *
 * 涵蓋 F112-test.md 後端群組（distinct-values）：
 *   SRC     來源表解析（_resolveDistinctValueSource）        — SRC-001~005
 *   ORDER   就緒優先於存在性（I-DVAL-READY-BEFORE-EXIST-01） — ORDER-001~003
 *   SAFE    欄位名稱安全驗證（I-DVAL-SAFE-INTERP-01）         — SAFE-001~004
 *   DISTINCT DISTINCT 查詢 + cap/truncation/NULL/排序/空狀態  — DISTINCT-001~007
 *   TIMEOUT app-level 逾時（500，非 504）                     — TIMEOUT-001~004
 *   DEDUP   alreadyOption 去重（含 inactive）                 — DEDUP-001~003
 *
 * 全數以 mocked dataSource.query / fieldRepo / optionRepo 驗證（無真實 MSSQL 連線）；
 * MSSQL 專屬行為（TOP / 方括號欄名 / INFORMATION_SCHEMA 大寫）以「斷言傳入 dataSource.query
 * 之 SQL 字串內容」驗證。逾時測試以極小 timeoutMs 注入（F049 慣例），不等待真實 15s。
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import {
  BadRequestException,
  InternalServerErrorException,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { DataSource } from 'typeorm';
import { PooldataFieldWhitelistService } from '../services/pooldata-field-whitelist.service';
import { PooldataFieldWhitelist } from '@/database/entities/pooldata-field-whitelist.entity';
import { PooldataFieldOption } from '@/database/entities/pooldata-field-option.entity';
import { AssignmentAuditLog } from '@/database/entities/assignment-audit-log.entity';
import { User } from '@/database/entities/user.entity';
import { ExtractionTask } from '@/database/entities/extraction-task.entity';
import { MSSQLExecutor } from '../../extraction-task/executors/mssql-executor';

describe('PooldataFieldWhitelistService.getDistinctValues (F112)', () => {
  let service: PooldataFieldWhitelistService;
  let fieldRepo: any;
  let optionRepo: any;
  let auditRepo: any;
  let userRepo: any;
  let dataSource: any;
  let extractionTaskRepo: any;
  let mssqlExecutor: any;

  // 最近一次 distinct 查詢傳入 dataSource.query 的 SQL（供 SQL-shape 斷言）
  let capturedDistinctSql: string | null;

  const makeFieldRow = (
    overrides: Partial<PooldataFieldWhitelist> = {},
  ): PooldataFieldWhitelist => ({
    column_name: 'prod_kind',
    display_name: '產品類別',
    field_type: 'categorical',
    is_active: true,
    dataSource: 'ob_pool_data',
    isSystemFixed: false,
    created_at: new Date('2026-07-12T00:00:00Z'),
    updated_at: new Date('2026-07-12T00:00:00Z'),
    ...overrides,
  });

  /**
   * 路由 dataSource.query：依 SQL 內容區分 表存在性 / 欄位存在性 / DISTINCT 三種查詢。
   * cfg.distinctRows 為 distinct 值陣列（string[]）；service 內以 `AS v` 取值，故包裝為 [{v}]。
   */
  const setupDataSourceQuery = (cfg: {
    tableExists?: boolean;
    columnExists?: boolean;
    distinctRows?: unknown[];
    distinctError?: Error;
  }) => {
    capturedDistinctSql = null;
    dataSource.query = vi.fn((sql: string) => {
      if (/information_schema\.tables/i.test(sql)) {
        return Promise.resolve(cfg.tableExists ? [{ x: 1 }] : []);
      }
      if (/information_schema\.columns/i.test(sql)) {
        return Promise.resolve(cfg.columnExists ? [{ x: 1 }] : []);
      }
      // DISTINCT 查詢
      capturedDistinctSql = sql;
      if (cfg.distinctError) return Promise.reject(cfg.distinctError);
      return Promise.resolve(
        (cfg.distinctRows ?? []).map((v) => ({ v })),
      );
    });
  };

  beforeEach(async () => {
    fieldRepo = {
      findOne: vi.fn().mockResolvedValue(null),
    };
    optionRepo = {
      find: vi.fn().mockResolvedValue([]),
      count: vi.fn().mockResolvedValue(0),
    };
    auditRepo = {
      create: vi.fn((data: any) => data),
      save: vi.fn().mockResolvedValue(undefined),
    };
    userRepo = {
      findOne: vi.fn().mockResolvedValue({ id: 'director-uuid', name: 'Director' }),
    };
    extractionTaskRepo = { findOne: vi.fn().mockResolvedValue(null) };
    mssqlExecutor = { getColumnDescriptions: vi.fn() };
    dataSource = {
      transaction: vi.fn(),
      options: { type: 'postgres' }, // 非 mssql（SQLite/PG 分支）；個別測試覆寫為 'mssql'
      query: vi.fn().mockResolvedValue([]),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PooldataFieldWhitelistService,
        { provide: getRepositoryToken(PooldataFieldWhitelist), useValue: fieldRepo },
        { provide: getRepositoryToken(PooldataFieldOption), useValue: optionRepo },
        { provide: getRepositoryToken(AssignmentAuditLog), useValue: auditRepo },
        { provide: getRepositoryToken(User), useValue: userRepo },
        { provide: getRepositoryToken(ExtractionTask), useValue: extractionTaskRepo },
        { provide: MSSQLExecutor, useValue: mssqlExecutor },
        { provide: DataSource, useValue: dataSource },
      ],
    }).compile();

    service = module.get(PooldataFieldWhitelistService);
  });

  // ==========================================================
  // 一、SRC — 來源表解析
  // ==========================================================
  describe('SRC — 來源表解析', () => {
    it('SRC-001：白名單既存 categorical + data_source=ob_pool_data → 查 ob_pool_data', async () => {
      fieldRepo.findOne.mockResolvedValue(
        makeFieldRow({ column_name: 'prod_kind', dataSource: 'ob_pool_data' }),
      );
      setupDataSourceQuery({ tableExists: true, columnExists: true, distinctRows: ['01'] });

      const result = await service.getDistinctValues('prod_kind');

      expect(result.dataSource).toBe('ob_pool_data');
      expect(capturedDistinctSql).toContain('FROM ob_pool_data');
    });

    it('SRC-002：白名單既存 categorical + data_source=customer_core → 查 customer_core', async () => {
      fieldRepo.findOne.mockResolvedValue(
        makeFieldRow({ column_name: 'occupation_desc', dataSource: 'customer_core' }),
      );
      setupDataSourceQuery({ tableExists: true, columnExists: true, distinctRows: ['工程師'] });

      const result = await service.getDistinctValues('occupation_desc');

      expect(result.dataSource).toBe('customer_core');
      expect(capturedDistinctSql).toContain('FROM customer_core');
      expect(capturedDistinctSql).not.toContain('FROM ob_pool_data');
    });

    it('SRC-003：欄位不存在於白名單（進入點 1）→ 固定 ob_pool_data，全部 alreadyOption=false', async () => {
      fieldRepo.findOne.mockResolvedValue(null);
      optionRepo.find.mockResolvedValue([]);
      setupDataSourceQuery({
        tableExists: true,
        columnExists: true,
        distinctRows: ['A', 'B'],
      });

      const result = await service.getDistinctValues('risk_level');

      expect(result.dataSource).toBe('ob_pool_data');
      expect(capturedDistinctSql).toContain('FROM ob_pool_data');
      expect(result.values.every((v) => v.alreadyOption === false)).toBe(true);
    });

    it('SRC-004：白名單既存但非 categorical → 400 POOLDATA_OPTION_FIELD_TYPE_INVALID，未走到 DISTINCT', async () => {
      fieldRepo.findOne.mockResolvedValue(
        makeFieldRow({ column_name: 'settle_src', field_type: 'numeric' }),
      );
      setupDataSourceQuery({ tableExists: true, columnExists: true, distinctRows: ['x'] });

      await expect(service.getDistinctValues('settle_src')).rejects.toMatchObject({
        response: { error: 'POOLDATA_OPTION_FIELD_TYPE_INVALID' },
      });
      await expect(service.getDistinctValues('settle_src')).rejects.toBeInstanceOf(
        BadRequestException,
      );
      expect(capturedDistinctSql).toBeNull(); // 從未走到 DISTINCT 查詢分支
    });

    it('SRC-005：來源解析不過濾 is_active（categorical 但 is_active=false 仍正常解析，不拋 404）', async () => {
      fieldRepo.findOne.mockResolvedValue(
        makeFieldRow({
          column_name: 'prod_kind',
          field_type: 'categorical',
          is_active: false,
          dataSource: 'ob_pool_data',
        }),
      );
      setupDataSourceQuery({ tableExists: true, columnExists: true, distinctRows: ['01'] });

      await expect(service.getDistinctValues('prod_kind')).resolves.toMatchObject({
        dataSource: 'ob_pool_data',
      });
    });
  });

  // ==========================================================
  // 二、ORDER — 就緒優先於存在性（I-DVAL-READY-BEFORE-EXIST-01）
  // ==========================================================
  describe('ORDER — 就緒優先於存在性', () => {
    it('ORDER-001【紅線】表不存在 + 欄位也不存在 → 503（未就緒），不誤判 404；_checkColumnExists 未被呼叫', async () => {
      fieldRepo.findOne.mockResolvedValue(
        makeFieldRow({ column_name: 'occupation_desc', dataSource: 'customer_core' }),
      );
      const checkColumnSpy = vi
        .spyOn(service as any, '_checkColumnExists')
        .mockResolvedValue(false);
      vi.spyOn(service as any, '_checkTableExists').mockResolvedValue(false);

      await expect(service.getDistinctValues('occupation_desc')).rejects.toMatchObject({
        response: { error: 'CUSTOMER_CORE_NOT_READY' },
      });
      await expect(service.getDistinctValues('occupation_desc')).rejects.toBeInstanceOf(
        ServiceUnavailableException,
      );
      expect(checkColumnSpy).not.toHaveBeenCalled(); // 短路：就緒檢查先執行且提前 return
    });

    it('ORDER-002：對照 — 表存在但欄位不存在 → 404 SOURCE_COLUMN_NOT_FOUND', async () => {
      fieldRepo.findOne.mockResolvedValue(null); // ob_pool_data
      setupDataSourceQuery({ tableExists: true, columnExists: false });

      await expect(service.getDistinctValues('nonexistent_col')).rejects.toMatchObject({
        response: { error: 'SOURCE_COLUMN_NOT_FOUND' },
      });
      await expect(service.getDistinctValues('nonexistent_col')).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });

    it('ORDER-003：ob_pool_data 未就緒 → OBPOOLDATA_NOT_READY；customer_core 未就緒 → CUSTOMER_CORE_NOT_READY', async () => {
      // ob_pool_data 情境
      fieldRepo.findOne.mockResolvedValue(null);
      setupDataSourceQuery({ tableExists: false });
      await expect(service.getDistinctValues('prod_kind')).rejects.toMatchObject({
        response: { error: 'OBPOOLDATA_NOT_READY' },
      });

      // customer_core 情境
      fieldRepo.findOne.mockResolvedValue(
        makeFieldRow({ column_name: 'occupation_desc', dataSource: 'customer_core' }),
      );
      setupDataSourceQuery({ tableExists: false });
      await expect(service.getDistinctValues('occupation_desc')).rejects.toMatchObject({
        response: { error: 'CUSTOMER_CORE_NOT_READY' },
      });
    });
  });

  // ==========================================================
  // 三、SAFE — 欄位名稱安全驗證（I-DVAL-SAFE-INTERP-01）
  // ==========================================================
  describe('SAFE — 欄位名稱安全驗證', () => {
    it('SAFE-001：不符 SAFE_COLUMN_NAME_RE（含大寫/連字號）→ 400，無任何 DB 呼叫', async () => {
      setupDataSourceQuery({ tableExists: true, columnExists: true });

      await expect(service.getDistinctValues('Risk-Level')).rejects.toMatchObject({
        response: { error: 'SOURCE_COLUMN_NAME_INVALID' },
      });
      expect(fieldRepo.findOne).not.toHaveBeenCalled();
      expect(dataSource.query).not.toHaveBeenCalled();
    });

    it('SAFE-002：SQL injection 嘗試（含空白/分號）被正則拒絕，不建構任何查詢', async () => {
      setupDataSourceQuery({ tableExists: true, columnExists: true });

      await expect(
        service.getDistinctValues('a; drop table ob_pool_data;--'),
      ).rejects.toMatchObject({ response: { error: 'SOURCE_COLUMN_NAME_INVALID' } });
      expect(fieldRepo.findOne).not.toHaveBeenCalled();
      expect(dataSource.query).not.toHaveBeenCalled();
    });

    it('SAFE-003：合法格式但欄位不存在（表已就緒）→ 404 SOURCE_COLUMN_NOT_FOUND', async () => {
      fieldRepo.findOne.mockResolvedValue(null);
      setupDataSourceQuery({ tableExists: true, columnExists: false });

      await expect(service.getDistinctValues('nonexistent_col')).rejects.toMatchObject({
        response: { error: 'SOURCE_COLUMN_NOT_FOUND' },
      });
    });

    it('SAFE-004：合法欄名（含底線與數字）通過正則與存在性 → 正常進入 DISTINCT 查詢', async () => {
      fieldRepo.findOne.mockResolvedValue(null);
      setupDataSourceQuery({
        tableExists: true,
        columnExists: true,
        distinctRows: ['a', 'b'],
      });

      const result = await service.getDistinctValues('monthly_income_desc');
      expect(result.values).toHaveLength(2);
      expect(capturedDistinctSql).toContain('monthly_income_desc');
    });
  });

  // ==========================================================
  // 四、DISTINCT — 查詢 + cap/truncation/NULL/排序/空狀態
  // ==========================================================
  describe('DISTINCT — 查詢與 cap/truncation/NULL/排序/空狀態', () => {
    it('DISTINCT-001：MSSQL 方言 SQL 含 TOP (201) 與方括號欄名；非 MSSQL 含 LIMIT 201', async () => {
      // MSSQL 分支
      dataSource.options.type = 'mssql';
      fieldRepo.findOne.mockResolvedValue(null);
      setupDataSourceQuery({ tableExists: true, columnExists: true, distinctRows: ['01'] });
      await service.getDistinctValues('prod_kind');
      expect(capturedDistinctSql).toBe(
        'SELECT DISTINCT TOP (201) [prod_kind] AS v FROM ob_pool_data WHERE [prod_kind] IS NOT NULL ORDER BY [prod_kind]',
      );

      // 非 MSSQL 分支
      dataSource.options.type = 'postgres';
      setupDataSourceQuery({ tableExists: true, columnExists: true, distinctRows: ['01'] });
      await service.getDistinctValues('prod_kind');
      expect(capturedDistinctSql).toBe(
        'SELECT DISTINCT "prod_kind" AS v FROM ob_pool_data WHERE "prod_kind" IS NOT NULL ORDER BY "prod_kind" LIMIT 201',
      );
    });

    it('DISTINCT-002：distinct 筆數 ≤ CAP（55 筆）→ truncated=false 全數回傳', async () => {
      fieldRepo.findOne.mockResolvedValue(
        makeFieldRow({ column_name: 'occupation_desc', dataSource: 'customer_core' }),
      );
      const rows = Array.from({ length: 55 }, (_, i) => `v${i}`);
      setupDataSourceQuery({ tableExists: true, columnExists: true, distinctRows: rows });

      const result = await service.getDistinctValues('occupation_desc');
      expect(result.values).toHaveLength(55);
      expect(result.truncated).toBe(false);
      expect(result.totalReturned).toBe(55);
      expect(result.cap).toBe(200);
    });

    it('DISTINCT-003：distinct = CAP+1(201) 與 CAP+5(205) → 皆 truncated=true，values.length=200，探測列被丟棄', async () => {
      fieldRepo.findOne.mockResolvedValue(null);

      const rows201 = Array.from({ length: 201 }, (_, i) => `v${i}`);
      setupDataSourceQuery({ tableExists: true, columnExists: true, distinctRows: rows201 });
      const r201 = await service.getDistinctValues('prod_kind');
      expect(r201.truncated).toBe(true);
      expect(r201.values).toHaveLength(200);
      expect(r201.totalReturned).toBe(200);

      const rows205 = Array.from({ length: 205 }, (_, i) => `v${i}`);
      setupDataSourceQuery({ tableExists: true, columnExists: true, distinctRows: rows205 });
      const r205 = await service.getDistinctValues('prod_kind');
      expect(r205.truncated).toBe(true);
      expect(r205.values).toHaveLength(200);
      expect(r205.totalReturned).toBe(200);
    });

    it('DISTINCT-004：driver 回傳混入 null 元素 → 正常路徑不拋未捕捉例外（防禦性）', async () => {
      fieldRepo.findOne.mockResolvedValue(null);
      setupDataSourceQuery({
        tableExists: true,
        columnExists: true,
        distinctRows: ['正常值', null],
      });

      const result = await service.getDistinctValues('prod_kind');
      // String(null)='null'；最低驗收：不拋例外、正常回傳
      expect(result.values).toHaveLength(2);
    });

    it('DISTINCT-005：service 層不重排序，保持 SQL ORDER BY 回傳順序', async () => {
      fieldRepo.findOne.mockResolvedValue(null);
      setupDataSourceQuery({
        tableExists: true,
        columnExists: true,
        distinctRows: ['一般', '個人', '法人'],
      });

      const result = await service.getDistinctValues('prod_kind');
      expect(result.values.map((v) => v.value)).toEqual(['一般', '個人', '法人']);
    });

    it('DISTINCT-006：欄位全 NULL / 無非 NULL 值 → 200 values:[]/totalReturned:0/truncated:false，不拋例外', async () => {
      fieldRepo.findOne.mockResolvedValue(null);
      setupDataSourceQuery({ tableExists: true, columnExists: true, distinctRows: [] });

      const result = await service.getDistinctValues('prod_kind');
      expect(result.values).toEqual([]);
      expect(result.totalReturned).toBe(0);
      expect(result.truncated).toBe(false);
    });

    it('DISTINCT-007：靜態 regression — DISTINCT SQL 不含 TABLESAMPLE（I-DVAL-NO-SAMPLE-01）', async () => {
      fieldRepo.findOne.mockResolvedValue(null);
      setupDataSourceQuery({ tableExists: true, columnExists: true, distinctRows: ['x'] });
      await service.getDistinctValues('prod_kind');
      expect(capturedDistinctSql).not.toMatch(/TABLESAMPLE/i);
    });
  });

  // ==========================================================
  // 五、TIMEOUT — app-level 逾時（500，非 504）
  // ==========================================================
  describe('TIMEOUT — app-level 逾時（500）', () => {
    it('TIMEOUT-001：查詢超過 timeoutMs → Promise.race 逾時分支勝出，拋 500 DISTINCT_VALUES_QUERY_TIMEOUT', async () => {
      fieldRepo.findOne.mockResolvedValue(null);
      setupDataSourceQuery({ tableExists: true, columnExists: true });
      optionRepo.find.mockResolvedValue([]);
      // _runDistinctQuery 永不 resolve → 極小 timeoutMs 必勝
      vi.spyOn(service as any, '_runDistinctQuery').mockReturnValue(
        new Promise(() => {}),
      );

      const err = await service
        .getDistinctValues('prod_kind', { timeoutMs: 10 })
        .catch((e) => e);
      expect(err).toBeInstanceOf(InternalServerErrorException);
      expect(err.response.error).toBe('DISTINCT_VALUES_QUERY_TIMEOUT');
    });

    it('TIMEOUT-002【紅線】逾時例外為 InternalServerErrorException（HTTP 500），明確非 504', async () => {
      fieldRepo.findOne.mockResolvedValue(null);
      setupDataSourceQuery({ tableExists: true, columnExists: true });
      // timeoutMs=0 即立即逾時（F049 慣例）
      const err = await service
        .getDistinctValues('prod_kind', { timeoutMs: 0 })
        .catch((e) => e);
      expect(err).toBeInstanceOf(InternalServerErrorException);
      expect(err.getStatus()).toBe(500);
      expect(err.constructor.name).not.toBe('GatewayTimeoutException');
    });

    it('TIMEOUT-003：查詢拋非預期例外（SQL 錯誤）→ 收斂為 500 DISTINCT_VALUES_QUERY_TIMEOUT，不外洩原始訊息', async () => {
      fieldRepo.findOne.mockResolvedValue(null);
      setupDataSourceQuery({ tableExists: true, columnExists: true });
      vi.spyOn(service as any, '_runDistinctQuery').mockRejectedValue(
        new Error('syntax error near "SELECT"'),
      );

      const err = await service
        .getDistinctValues('prod_kind', { timeoutMs: 10000 })
        .catch((e) => e);
      expect(err).toBeInstanceOf(InternalServerErrorException);
      expect(err.response.error).toBe('DISTINCT_VALUES_QUERY_TIMEOUT');
      expect(err.response.message).not.toContain('syntax error');
    });

    it('TIMEOUT-004：逾時/例外永不吞為 200 空清單（拋例外，而非回 {values:[]}）', async () => {
      fieldRepo.findOne.mockResolvedValue(null);
      setupDataSourceQuery({ tableExists: true, columnExists: true });

      const err = await service
        .getDistinctValues('prod_kind', { timeoutMs: 0 })
        .catch((e) => e);
      expect(err).toBeInstanceOf(InternalServerErrorException);
      // 明確非合法空狀態回應
      expect(err).not.toMatchObject({ values: [], totalReturned: 0 });
    });
  });

  // ==========================================================
  // 六、DEDUP — alreadyOption 去重（含 inactive）
  // ==========================================================
  describe('DEDUP — alreadyOption 去重', () => {
    it('DEDUP-001：既有 ACTIVE 可選值 → 對應 distinct 值 alreadyOption=true', async () => {
      fieldRepo.findOne.mockResolvedValue(
        makeFieldRow({ column_name: 'occupation_desc', dataSource: 'customer_core' }),
      );
      optionRepo.find.mockResolvedValue([{ option_value: '醫師' }]);
      setupDataSourceQuery({
        tableExists: true,
        columnExists: true,
        distinctRows: ['工程師', '醫師', '教師'],
      });

      const result = await service.getDistinctValues('occupation_desc');
      const byValue = new Map(result.values.map((v) => [v.value, v.alreadyOption]));
      expect(byValue.get('醫師')).toBe(true);
      expect(byValue.get('工程師')).toBe(false);
      expect(byValue.get('教師')).toBe(false);
    });

    it('DEDUP-002【紅線】既有 INACTIVE 可選值仍 alreadyOption=true；optionRepo.find 不帶 is_active filter', async () => {
      fieldRepo.findOne.mockResolvedValue(
        makeFieldRow({ column_name: 'occupation_desc', dataSource: 'customer_core' }),
      );
      // 查詢不帶 is_active 條件，回傳含一筆已停用
      optionRepo.find.mockResolvedValue([{ option_value: '教師' }]);
      setupDataSourceQuery({
        tableExists: true,
        columnExists: true,
        distinctRows: ['工程師', '教師'],
      });

      const result = await service.getDistinctValues('occupation_desc');
      const byValue = new Map(result.values.map((v) => [v.value, v.alreadyOption]));
      expect(byValue.get('教師')).toBe(true);

      // regression：find 參數不含 is_active（避免誤加 active-only filter 破壞 BR-2）
      const findArg = optionRepo.find.mock.calls[0][0];
      expect(findArg.where).not.toHaveProperty('is_active');
      expect(findArg.where).toMatchObject({ column_name: 'occupation_desc' });
    });

    it('DEDUP-003：進入點 1（欄位不存在於白名單）→ 全部 alreadyOption=false', async () => {
      fieldRepo.findOne.mockResolvedValue(null);
      optionRepo.find.mockResolvedValue([]); // 新欄位尚無選項
      setupDataSourceQuery({
        tableExists: true,
        columnExists: true,
        distinctRows: ['A', 'B', 'C'],
      });

      const result = await service.getDistinctValues('risk_level');
      expect(result.values.every((v) => v.alreadyOption === false)).toBe(true);
    });
  });
});
