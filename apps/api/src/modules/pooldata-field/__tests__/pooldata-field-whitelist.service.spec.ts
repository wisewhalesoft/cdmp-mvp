/**
 * F075 v1.3 / P1 B5：PooldataFieldWhitelistService Unit Tests
 *
 * 涵蓋 spec §10 後端關鍵測試案例 + 使用者指定 TC：
 *   TC-M04-001 listFields 預設無 filter
 *   TC-M04-002 listFields ?active=true / ?active=false
 *   TC-M04-003 createField 成功 + 稽核
 *   TC-M04-004 createField 重複 → 409 POOLDATA_FIELD_DUPLICATE（含已停用）
 *   TC-M04-005 updateField displayName 成功
 *   TC-M04-006 findOneOrFail 不存在 → 404 POOLDATA_FIELD_NOT_FOUND
 *   TC-M04-007 disableField 軟刪除 + 稽核
 *   TC-FIELD-TYPE-SWITCH categorical → numeric 同 tx 批次軟停用 options
 *   TC-FIELD-TYPE-SWITCH-2 numeric → categorical 不觸發批次軟停用
 *   TC-FIELD-TYPE-SWITCH-3 categorical → categorical 不觸發批次軟停用
 *   TC-CATEGORICAL-GUARD assertCategorical 非 categorical → 400 POOLDATA_OPTION_FIELD_TYPE_INVALID
 *   TC-GET-INACTIVE-COUNT getInactiveCount 回 activeCount
 *   TC-AUDIT-RESILIENCE 稽核失敗不 rollback 主操作
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import {
  BadRequestException,
  ConflictException,
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

describe('PooldataFieldWhitelistService', () => {
  let service: PooldataFieldWhitelistService;
  let fieldRepo: any;
  let optionRepo: any;
  let auditRepo: any;
  let userRepo: any;
  let dataSource: any;
  let extractionTaskRepo: any;
  let mssqlExecutor: any;

  // 收集 tx 內的 manager.save 與 manager 內 QB UPDATE 行為
  let txQbUpdateAffected: number;

  const actor = { userId: 'director-uuid', ipAddress: '127.0.0.1' };
  const NOW = new Date('2026-05-17T12:00:00.000Z');

  const makeRow = (
    overrides: Partial<PooldataFieldWhitelist> = {},
  ): PooldataFieldWhitelist => ({
    column_name: 'prod_kind',
    display_name: '產品類別',
    field_type: 'categorical',
    is_active: true,
    created_at: NOW,
    updated_at: NOW,
    ...overrides,
  });

  beforeEach(async () => {
    txQbUpdateAffected = 0;

    fieldRepo = {
      find: vi.fn().mockResolvedValue([]),
      findOne: vi.fn().mockResolvedValue(null),
      create: vi.fn((data: any) => ({ ...data })),
      save: vi.fn((entity: any) => Promise.resolve(entity)),
    };
    optionRepo = {
      count: vi.fn().mockResolvedValue(0),
    };
    auditRepo = {
      create: vi.fn((data: any) => data),
      save: vi.fn().mockResolvedValue(undefined),
    };
    userRepo = {
      findOne: vi.fn().mockResolvedValue({ id: 'director-uuid', name: 'Director' }),
    };
    extractionTaskRepo = {
      findOne: vi.fn().mockResolvedValue(null),
    };
    mssqlExecutor = {
      getColumnDescriptions: vi.fn(),
    };

    const fakeManager = {
      save: vi.fn((_cls: any, entity: any) => Promise.resolve(entity)),
      createQueryBuilder: vi.fn(() => {
        const qb: any = {
          update: vi.fn(() => qb),
          set: vi.fn(() => qb),
          where: vi.fn(() => qb),
          andWhere: vi.fn(() => qb),
          execute: vi.fn(() => Promise.resolve({ affected: txQbUpdateAffected })),
        };
        return qb;
      }),
    };
    dataSource = {
      transaction: vi.fn(async (cb: any) => cb(fakeManager)),
      // getAvailableColumns 依 options.type 分方言（PG/MSSQL/sqlite）；預設 postgres 走既有 PG-path。
      options: { type: 'postgres' },
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

  // ========================
  // listFields
  // ========================

  describe('listFields (TC-M04-001 / 002)', () => {
    it('TC-M04-001：無 query 時 where 為空（回傳全部）', async () => {
      fieldRepo.find.mockResolvedValue([
        makeRow({ column_name: 'prod_kind' }),
        makeRow({ column_name: 'payt_term', is_active: false, field_type: 'numeric' }),
      ]);

      const result = await service.listFields();
      expect(fieldRepo.find).toHaveBeenCalledWith({
        where: {},
        order: { column_name: 'ASC' },
      });
      expect(result.fields).toHaveLength(2);
    });

    it('TC-M04-002：?active=true 只取啟用', async () => {
      fieldRepo.find.mockResolvedValue([makeRow()]);
      await service.listFields({ active: 'true' });
      expect(fieldRepo.find).toHaveBeenCalledWith({
        where: { is_active: true },
        order: { column_name: 'ASC' },
      });
    });

    it('TC-M04-002b：?active=false 只取停用', async () => {
      await service.listFields({ active: 'false' });
      expect(fieldRepo.find).toHaveBeenCalledWith({
        where: { is_active: false },
        order: { column_name: 'ASC' },
      });
    });
  });

  // ========================
  // createField
  // ========================

  describe('createField (TC-M04-003 / 004)', () => {
    it('TC-M04-003：新增成功 + 寫稽核', async () => {
      fieldRepo.findOne.mockResolvedValue(null);
      fieldRepo.save.mockResolvedValue(
        makeRow({ column_name: 'risk_level', display_name: '風險等級' }),
      );

      const result = await service.createField(
        { columnName: 'risk_level', displayName: '風險等級', fieldType: 'categorical' },
        actor,
      );

      expect(result.columnName).toBe('risk_level');
      expect(result.fieldType).toBe('categorical');
      expect(result.isActive).toBe(true);
      expect(auditRepo.save).toHaveBeenCalledTimes(1);
      const auditArg = auditRepo.create.mock.calls[0][0];
      expect(auditArg.entity_type).toBe('pooldata_field_whitelist');
      expect(auditArg.action).toBe('CREATE');
      expect(auditArg.entity_id).toBe('risk_level');
    });

    it('TC-M04-004：重複 columnName（含已停用）→ 409 POOLDATA_FIELD_DUPLICATE', async () => {
      fieldRepo.findOne.mockResolvedValue(makeRow({ is_active: false }));

      await expect(
        service.createField(
          { columnName: 'prod_kind', displayName: 'X', fieldType: 'categorical' },
          actor,
        ),
      ).rejects.toBeInstanceOf(ConflictException);

      try {
        await service.createField(
          { columnName: 'prod_kind', displayName: 'X', fieldType: 'categorical' },
          actor,
        );
      } catch (err: any) {
        expect(err.response.error).toBe('POOLDATA_FIELD_DUPLICATE');
      }
      expect(fieldRepo.save).not.toHaveBeenCalled();
    });
  });

  // ========================
  // updateField
  // ========================

  describe('updateField (TC-M04-005 / TC-FIELD-TYPE-SWITCH)', () => {
    it('TC-M04-005：更新 displayName 成功 + 同 tx 寫稽核', async () => {
      const before = makeRow({ display_name: 'old' });
      fieldRepo.findOne.mockResolvedValue(before);

      const result = await service.updateField(
        'prod_kind',
        { displayName: 'new' },
        actor,
      );

      expect(result.displayName).toBe('new');
      expect(dataSource.transaction).toHaveBeenCalledTimes(1);
      expect(result.deactivatedOptionCount).toBe(0);
      expect(auditRepo.save).toHaveBeenCalledTimes(1);
    });

    it('TC-FIELD-TYPE-SWITCH：categorical → numeric 同 tx 批次軟停用 N 個 options', async () => {
      const before = makeRow({ field_type: 'categorical' });
      fieldRepo.findOne.mockResolvedValue(before);
      txQbUpdateAffected = 3;

      const result = await service.updateField(
        'prod_kind',
        { fieldType: 'numeric' },
        actor,
      );

      expect(result.fieldType).toBe('numeric');
      expect(result.deactivatedOptionCount).toBe(3);
      expect(dataSource.transaction).toHaveBeenCalledTimes(1);
      // 稽核 details 應含 deactivatedOptionCount
      const afterValue = auditRepo.create.mock.calls[0][0].after_value;
      expect(afterValue.deactivatedOptionCount).toBe(3);
    });

    it('TC-FIELD-TYPE-SWITCH-2：numeric → categorical 不觸發批次軟停用', async () => {
      const before = makeRow({ field_type: 'numeric' });
      fieldRepo.findOne.mockResolvedValue(before);
      txQbUpdateAffected = 99; // 即使 mock 設了 affected，未觸發 QB 就不會用到

      const result = await service.updateField(
        'month_cnt',
        { fieldType: 'categorical' },
        actor,
      );

      expect(result.deactivatedOptionCount).toBe(0);
    });

    it('TC-FIELD-TYPE-SWITCH-3：categorical → categorical 不觸發批次軟停用', async () => {
      const before = makeRow({ field_type: 'categorical' });
      fieldRepo.findOne.mockResolvedValue(before);
      txQbUpdateAffected = 5;

      const result = await service.updateField(
        'prod_kind',
        { fieldType: 'categorical', displayName: 'updated' },
        actor,
      );
      expect(result.deactivatedOptionCount).toBe(0);
    });

    it('TC-M04-006：findOneOrFail 不存在 → 404', async () => {
      fieldRepo.findOne.mockResolvedValue(null);

      await expect(
        service.updateField('NOPE', { displayName: 'x' }, actor),
      ).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  // ========================
  // disableField
  // ========================

  describe('disableField (TC-M04-007)', () => {
    it('TC-M04-007：軟刪除（is_active=false）+ 稽核', async () => {
      const before = makeRow();
      fieldRepo.findOne.mockResolvedValue(before);
      fieldRepo.save.mockImplementation((e: any) => Promise.resolve({ ...e }));

      const result = await service.disableField('prod_kind', actor);
      expect(result.columnName).toBe('prod_kind');
      expect(result.isActive).toBe(false);
      expect(typeof result.disabledAt).toBe('string');
      expect(auditRepo.save).toHaveBeenCalledTimes(1);
    });
  });

  // ========================
  // assertCategorical
  // ========================

  describe('assertCategorical (TC-CATEGORICAL-GUARD)', () => {
    it('categorical → 通過', async () => {
      fieldRepo.findOne.mockResolvedValue(makeRow({ field_type: 'categorical' }));
      await expect(service.assertCategorical('prod_kind')).resolves.toBeDefined();
    });

    it('numeric → 400 POOLDATA_OPTION_FIELD_TYPE_INVALID', async () => {
      fieldRepo.findOne.mockResolvedValue(makeRow({ field_type: 'numeric' }));
      await expect(service.assertCategorical('month_cnt')).rejects.toBeInstanceOf(
        BadRequestException,
      );
    });

    it('not found → 404 POOLDATA_FIELD_NOT_FOUND', async () => {
      fieldRepo.findOne.mockResolvedValue(null);
      await expect(service.assertCategorical('NOPE')).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });
  });

  // ========================
  // getInactiveCount
  // ========================

  describe('getInactiveCount (TC-GET-INACTIVE-COUNT)', () => {
    it('回傳 activeCount（給 UI confirm Modal「將自動停用 N 個可選值」用）', async () => {
      optionRepo.count.mockResolvedValue(7);
      const result = await service.getInactiveCount('prod_kind');
      expect(result.activeCount).toBe(7);
      expect(optionRepo.count).toHaveBeenCalledWith({
        where: { column_name: 'prod_kind', is_active: true },
      });
    });
  });

  // ========================
  // Audit resilience
  // ========================

  describe('Audit resilience (TC-AUDIT-RESILIENCE)', () => {
    it('稽核失敗不 rollback 主操作', async () => {
      auditRepo.save.mockRejectedValue(new Error('audit DB down'));
      fieldRepo.findOne.mockResolvedValue(null);
      fieldRepo.save.mockResolvedValue(makeRow({ column_name: 'new_col' }));

      await expect(
        service.createField(
          { columnName: 'new_col', displayName: 'x', fieldType: 'numeric' },
          actor,
        ),
      ).resolves.toBeDefined();
    });
  });

  // ============================================================
  // F075 v1.4 — getAvailableColumns + _inferSuggestedFieldType
  // ============================================================

  describe('getAvailableColumns + _inferSuggestedFieldType (v1.4 / v1.4.2)', () => {
    /**
     * v1.4.2 兩階段查詢 mock helper：
     *   - 第一查詢（information_schema.tables 確認 ob_pool_data 存在）→ 預設回 [{ '?column?': 1 }]（表存在）
     *   - 第二查詢（NOT IN 子查詢取欄位清單）→ 由 columnsRows 控制
     *
     * 個別測試覆寫第一查詢以模擬「表不存在」/「information_schema 查詢拋錯」情境。
     */
    const mockTwoStageQuery = (
      tableExistsRows: Array<Record<string, unknown>> | Error | null,
      columnsRows: Array<{ column_name: string | null; data_type: string | null }> | Error,
    ) => {
      let callIndex = 0;
      (dataSource as any).query = vi.fn(() => {
        callIndex += 1;
        if (callIndex === 1) {
          if (tableExistsRows instanceof Error) return Promise.reject(tableExistsRows);
          return Promise.resolve(tableExistsRows ?? []);
        }
        if (columnsRows instanceof Error) return Promise.reject(columnsRows);
        return Promise.resolve(columnsRows);
      });
    };

    // dataSource.query mock helper：用 fieldRepo 既有 dataSource mock 加 query method
    beforeEach(() => {
      // 預設：表存在 + 第二查詢回空陣列
      mockTwoStageQuery([{ '?column?': 1 }], []);
    });

    // A. getAvailableColumns 整合行為
    describe('A. getAvailableColumns()', () => {
      it('TS-F075-BE-001：3 筆未排序 mock → 字母升冪 + suggestedFieldType 正確 + camelCase mapping', async () => {
        mockTwoStageQuery(
          [{ '?column?': 1 }],
          [
            { column_name: 'zyear', data_type: 'integer' },
            { column_name: 'age', data_type: 'date' },
            { column_name: 'code', data_type: 'character varying' },
          ],
        );

        const result = await service.getAvailableColumns();

        expect(result.availableColumns).toHaveLength(3);
        // 字母升冪：age → code → zyear
        expect(result.availableColumns[0]).toEqual({
          columnName: 'age',
          dataType: 'date',
          suggestedFieldType: 'date',
        });
        expect(result.availableColumns[1]).toEqual({
          columnName: 'code',
          dataType: 'character varying',
          suggestedFieldType: 'categorical',
        });
        expect(result.availableColumns[2]).toEqual({
          columnName: 'zyear',
          dataType: 'integer',
          suggestedFieldType: 'numeric',
        });
      });

      it('TS-F075-BE-002：表存在 + 第二查詢回 [] → { availableColumns: [] }，不拋例外', async () => {
        mockTwoStageQuery([{ '?column?': 1 }], []);
        const result = await service.getAvailableColumns();
        expect(result).toEqual({ availableColumns: [] });
      });

      it('TS-F075-BE-003：5 筆亂序 → 字母升冪輸出', async () => {
        mockTwoStageQuery(
          [{ '?column?': 1 }],
          [
            { column_name: 'zyear', data_type: 'integer' },
            { column_name: 'age', data_type: 'date' },
            { column_name: 'month_cnt', data_type: 'integer' },
            { column_name: 'birth_date', data_type: 'date' },
            { column_name: 'fund_type', data_type: 'character varying' },
          ],
        );

        const result = await service.getAvailableColumns();
        const names = result.availableColumns.map((c) => c.columnName);
        expect(names).toEqual([
          'age',
          'birth_date',
          'fund_type',
          'month_cnt',
          'zyear',
        ]);
      });

      it('TS-F075-BE-004：DB column_name / data_type → response camelCase；不含 snake_case key', async () => {
        mockTwoStageQuery(
          [{ '?column?': 1 }],
          [{ column_name: 'risk_level', data_type: 'varchar' }],
        );

        const result = await service.getAvailableColumns();
        expect(result.availableColumns[0]).toEqual({
          columnName: 'risk_level',
          dataType: 'varchar',
          suggestedFieldType: 'categorical',
        });
        // 確保不含 snake_case key
        expect((result.availableColumns[0] as any).column_name).toBeUndefined();
        expect((result.availableColumns[0] as any).data_type).toBeUndefined();
      });

      // v1.4.2 D1：第一查詢拋錯（SQLite 環境）→ 視為 OBPOOLDATA_NOT_READY，不再回空陣列
      it('TS-F075-BE-026：dataSource.query 第一查詢拋錯（SQLite 無 information_schema）→ throws ServiceUnavailableException OBPOOLDATA_NOT_READY', async () => {
        mockTwoStageQuery(new Error('no such table: information_schema.tables'), []);
        await expect(service.getAvailableColumns()).rejects.toBeInstanceOf(
          ServiceUnavailableException,
        );
        try {
          await service.getAvailableColumns();
        } catch (err: any) {
          expect(err.response.error).toBe('OBPOOLDATA_NOT_READY');
        }
      });

      // Phase C 降級紀錄：本應在 PostgreSQL Test Container 執行，暫以 mock 驗證 BR-13 邏輯合約
      it('TS-F075-INT-BE-001（降級 mock）：SQL 已過濾白名單（含 is_active=false）→ service 信任 SQL 結果只回未列入欄位', async () => {
        // 模擬 SQL 已執行 NOT IN (含停用) 過濾：payt_term 不會出現在 query 結果
        mockTwoStageQuery(
          [{ '?column?': 1 }],
          [{ column_name: 'risk_level', data_type: 'varchar' }],
        );

        const result = await service.getAvailableColumns();
        expect(result.availableColumns).toHaveLength(1);
        expect(result.availableColumns[0].columnName).toBe('risk_level');
        // 驗證 service 不二次過濾，完全信任 SQL 子查詢結果
        expect(
          result.availableColumns.find((c) => c.columnName === 'payt_term'),
        ).toBeUndefined();
      });

      it('TS-F075-INT-BE-002（降級 mock）：所有欄位皆已列入白名單 → 回空陣列', async () => {
        mockTwoStageQuery([{ '?column?': 1 }], []);
        const result = await service.getAvailableColumns();
        expect(result).toEqual({ availableColumns: [] });
      });

      // v1.4.2 D1：新增三條錯誤分流測試
      it('TS-F075-BE-025：第一查詢回 [] (表不存在) → throws ServiceUnavailableException OBPOOLDATA_NOT_READY', async () => {
        mockTwoStageQuery([], []);
        await expect(service.getAvailableColumns()).rejects.toBeInstanceOf(
          ServiceUnavailableException,
        );
        try {
          await service.getAvailableColumns();
        } catch (err: any) {
          expect(err.response.error).toBe('OBPOOLDATA_NOT_READY');
          expect(err.response.message).toContain('OBPOOLDATA');
        }
      });

      it('TS-F075-BE-027：表存在 + 第二查詢真實 SQL error → throws（不再吞錯回空陣列）', async () => {
        mockTwoStageQuery([{ '?column?': 1 }], new Error('column type not found'));
        await expect(service.getAvailableColumns()).rejects.toThrow();
      });
    });

    // B. _inferSuggestedFieldType 推斷規則逐一驗證（15 個 case）
    describe('B. _inferSuggestedFieldType() 推斷規則', () => {
      // 為了驗證 pure function，透過 getAvailableColumns 觀察 suggestedFieldType 結果。
      // 既符合「驗證該 method 的對外可觀察行為」也避免測試私有 method 強耦合。
      const callInfer = async (dataType: string | null | undefined): Promise<string> => {
        mockTwoStageQuery(
          [{ '?column?': 1 }],
          [{ column_name: 'X', data_type: dataType }],
        );
        const result = await service.getAvailableColumns();
        return result.availableColumns[0].suggestedFieldType;
      };

      it("TS-F075-BE-010：'numeric' → 'numeric'", async () => {
        expect(await callInfer('numeric')).toBe('numeric');
      });

      it("TS-F075-BE-011：'integer' → 'numeric'", async () => {
        expect(await callInfer('integer')).toBe('numeric');
      });

      it("TS-F075-BE-012：'bigint' → 'numeric'", async () => {
        expect(await callInfer('bigint')).toBe('numeric');
      });

      it("TS-F075-BE-013：'double precision' → 'numeric'（含空格）", async () => {
        expect(await callInfer('double precision')).toBe('numeric');
      });

      it("TS-F075-BE-014：'real' → 'numeric'", async () => {
        expect(await callInfer('real')).toBe('numeric');
      });

      it("TS-F075-BE-015：'date' → 'date'", async () => {
        expect(await callInfer('date')).toBe('date');
      });

      it("TS-F075-BE-016：'timestamp without time zone' → 'date'", async () => {
        expect(await callInfer('timestamp without time zone')).toBe('date');
      });

      it("TS-F075-BE-017：'timestamp with time zone' → 'date'", async () => {
        expect(await callInfer('timestamp with time zone')).toBe('date');
      });

      it("TS-F075-BE-018：'character varying' → 'categorical'（保守原則）", async () => {
        expect(await callInfer('character varying')).toBe('categorical');
      });

      it("TS-F075-BE-019：'text' → 'categorical'（保守原則）", async () => {
        expect(await callInfer('text')).toBe('categorical');
      });

      it("TS-F075-BE-020：'boolean' → 'categorical'（保守原則）", async () => {
        expect(await callInfer('boolean')).toBe('categorical');
      });

      it("TS-F075-BE-021：null → 'categorical'（null-safe）", async () => {
        expect(await callInfer(null)).toBe('categorical');
      });

      it("TS-F075-BE-022：undefined → 'categorical'（undefined-safe）", async () => {
        expect(await callInfer(undefined)).toBe('categorical');
      });

      it("TS-F075-BE-023：'unknown_type_xyz' → 'categorical'（保守原則）", async () => {
        expect(await callInfer('unknown_type_xyz')).toBe('categorical');
      });

      // Decimal 邊界備忘（RISK-F075-002 / spec §5.5 文件與生產實際不一致）
      it("TS-F075-BE-024：'decimal' → 'categorical'（Decimal 邊界備忘）", async () => {
        // PostgreSQL information_schema.columns.data_type 對 DECIMAL 實際回傳 'numeric'（不會回傳 'decimal'）
        // 此 case 驗證即使傳入 'decimal' 字串，保守 fallback 行為正確（不誤判為 numeric）
        // 對應 service inline NOTE comment
        expect(await callInfer('decimal')).toBe('categorical');
      });
    });
  });

  // ============================================================
  // F075 v1.4.7 — columnDescription 取得邏輯（AC-16）
  // ============================================================

  describe('F075 v1.4.7 — columnDescription 取得（AC-16）', () => {
    /**
     * v1.4.7 兩階段查詢補強：
     *   - Step 1：information_schema.tables 確認 ob_pool_data 存在（沿用 v1.4.2 邏輯）
     *   - Step 2：information_schema.columns 取欄位清單
     *   - Step 3（v1.4.7 新）：查 extraction_tasks 最新一筆 source_table='OBPOOLDATA'
     *     若找到 → 呼叫 MSSQLExecutor.getColumnDescriptions 取 MS_Description map
     *     若查無 / 呼叫失敗 → 全部欄位 omit columnDescription（不拋錯，整體仍 200 OK）
     *   - merge：descriptionMap.has(columnName) → 帶上 columnDescription；否則 omit
     */
    const mockTwoStageQuery = (
      tableExistsRows: Array<Record<string, unknown>> | null,
      columnsRows: Array<{ column_name: string | null; data_type: string | null }>,
    ) => {
      let callIndex = 0;
      (dataSource as any).query = vi.fn(() => {
        callIndex += 1;
        if (callIndex === 1) return Promise.resolve(tableExistsRows ?? []);
        return Promise.resolve(columnsRows);
      });
    };

    beforeEach(() => {
      // 預設：表存在 + 一筆欄位
      mockTwoStageQuery(
        [{ '?column?': 1 }],
        [{ column_name: 'prod_kind', data_type: 'character varying' }],
      );
    });

    it('TS-F075-BE-V147-BE-01：descriptionMap 有值 → response 對應欄位含 columnDescription', async () => {
      extractionTaskRepo.findOne.mockResolvedValue({
        id: 'task-1',
        datasource_id: 'ds-mssql',
        source_table: 'OBPOOLDATA',
        source_schema: 'dbo',
      });
      mssqlExecutor.getColumnDescriptions.mockResolvedValue(
        new Map<string, string>([['prod_kind', '產品類別']]),
      );

      const result = await service.getAvailableColumns();

      expect(result.availableColumns).toHaveLength(1);
      const item = result.availableColumns[0] as any;
      expect(item.columnName).toBe('prod_kind');
      expect(item.columnDescription).toBe('產品類別');
      // 驗證 executor 被以正確 params 呼叫
      expect(mssqlExecutor.getColumnDescriptions).toHaveBeenCalledTimes(1);
      expect(mssqlExecutor.getColumnDescriptions).toHaveBeenCalledWith({
        datasourceId: 'ds-mssql',
        sourceSchema: 'dbo',
        sourceTable: 'OBPOOLDATA',
      });
    });

    it('TS-F075-BE-V147-BE-02：SQL Server 拋錯 → 全部 omit columnDescription + 整體 200 OK（不重拋）', async () => {
      extractionTaskRepo.findOne.mockResolvedValue({
        id: 'task-1',
        datasource_id: 'ds-mssql',
        source_table: 'OBPOOLDATA',
        source_schema: null,
      });
      mssqlExecutor.getColumnDescriptions.mockRejectedValue(
        new Error('SQL Server connection refused'),
      );

      const result = await service.getAvailableColumns();

      expect(result.availableColumns).toHaveLength(1);
      const item = result.availableColumns[0];
      expect(item).not.toHaveProperty('columnDescription');
      expect(mssqlExecutor.getColumnDescriptions).toHaveBeenCalledTimes(1);
    });

    it('TS-F075-BE-V147-BE-03：ExtractionTask 查無 → 全部 omit + 200 OK + getColumnDescriptions 不被呼叫', async () => {
      extractionTaskRepo.findOne.mockResolvedValue(null);

      const result = await service.getAvailableColumns();

      expect(result.availableColumns).toHaveLength(1);
      const item = result.availableColumns[0];
      expect(item).not.toHaveProperty('columnDescription');
      expect(mssqlExecutor.getColumnDescriptions).not.toHaveBeenCalled();
    });

    it('TS-F075-BE-V147-BE-04：descriptionMap 為空 Map → 全部欄位 omit columnDescription', async () => {
      extractionTaskRepo.findOne.mockResolvedValue({
        id: 'task-1',
        datasource_id: 'ds-mssql',
        source_table: 'OBPOOLDATA',
        source_schema: 'dbo',
      });
      mssqlExecutor.getColumnDescriptions.mockResolvedValue(new Map<string, string>());

      const result = await service.getAvailableColumns();

      expect(result.availableColumns).toHaveLength(1);
      const item = result.availableColumns[0];
      expect(item).not.toHaveProperty('columnDescription');
    });

    it('TS-F075-BE-V147-BE-05：部分欄位有描述 → 有的含 columnDescription / 無的 omit', async () => {
      mockTwoStageQuery(
        [{ '?column?': 1 }],
        [
          { column_name: 'birth_date', data_type: 'date' },
          { column_name: 'cust_age', data_type: 'integer' },
          { column_name: 'risk_level', data_type: 'varchar' },
        ],
      );
      extractionTaskRepo.findOne.mockResolvedValue({
        id: 'task-1',
        datasource_id: 'ds-mssql',
        source_table: 'OBPOOLDATA',
        source_schema: 'dbo',
      });
      mssqlExecutor.getColumnDescriptions.mockResolvedValue(
        new Map<string, string>([
          ['birth_date', '出生日期'],
          ['risk_level', '風險等級'],
        ]),
      );

      const result = await service.getAvailableColumns();

      // 排序後：birth_date, cust_age, risk_level
      expect(result.availableColumns).toHaveLength(3);
      const [a, b, c] = result.availableColumns as any[];
      expect(a.columnName).toBe('birth_date');
      expect(a.columnDescription).toBe('出生日期');
      expect(b.columnName).toBe('cust_age');
      expect(b).not.toHaveProperty('columnDescription');
      expect(c.columnName).toBe('risk_level');
      expect(c.columnDescription).toBe('風險等級');
    });
  });

  // ==================================================================
  // v1.7（US-144 / §18.12.6）：is_system_fixed deactivation guard + isSystemFixed 暴露
  // 對應 F075-test.md §十 TS-F075-v17-003~006（+ _toItem isSystemFixed）
  // ==================================================================
  describe('v1.7 — system-fixed deactivation guard + isSystemFixed', () => {
    it('TS-F075-v17-003：updateField isActive=false 於 system-fixed 欄位 → 422 SYSTEM_FIXED_FIELD_CANNOT_DEACTIVATE', async () => {
      fieldRepo.findOne.mockResolvedValue(
        makeRow({ column_name: 'best_case', display_name: '優質案件', isSystemFixed: true }),
      );
      await expect(
        service.updateField('best_case', { isActive: false }, actor),
      ).rejects.toMatchObject({
        response: { error: 'SYSTEM_FIXED_FIELD_CANNOT_DEACTIVATE' },
      });
      // DB 未被改（save 未被呼叫於本路徑）
      expect(fieldRepo.save).not.toHaveBeenCalled();
    });

    it('TS-F075-v17-004：disableField（DELETE 等效）於 system-fixed 欄位 → 422', async () => {
      fieldRepo.findOne.mockResolvedValue(
        makeRow({ column_name: 'best_case', display_name: '優質案件', isSystemFixed: true }),
      );
      await expect(service.disableField('best_case', actor)).rejects.toMatchObject({
        response: { error: 'SYSTEM_FIXED_FIELD_CANNOT_DEACTIVATE' },
      });
      expect(fieldRepo.save).not.toHaveBeenCalled();
    });

    it('TS-F075-v17-005：updateField 僅改 displayName 於 system-fixed 欄位 → 不觸發 guard（成功）', async () => {
      fieldRepo.findOne.mockResolvedValue(
        makeRow({ column_name: 'best_case', display_name: '優質案件', isSystemFixed: true }),
      );
      const result = await service.updateField(
        'best_case',
        { displayName: '優質案件（測試）' },
        actor,
      );
      expect(result.displayName).toBe('優質案件（測試）');
      expect(result.isSystemFixed).toBe(true);
    });

    it('TS-F075-v17-006：非 system-fixed 欄位（prod_kind）isActive=false → 正常停用（不觸發 guard）', async () => {
      fieldRepo.findOne.mockResolvedValue(
        makeRow({ column_name: 'prod_kind', isSystemFixed: false }),
      );
      const result = await service.updateField('prod_kind', { isActive: false }, actor);
      expect(result.isActive).toBe(false);
    });

    it('_toItem 暴露 isSystemFixed（best_case=true）', async () => {
      fieldRepo.find.mockResolvedValue([
        makeRow({ column_name: 'best_case', display_name: '優質案件', isSystemFixed: true }),
        makeRow({ column_name: 'prod_kind', isSystemFixed: false }),
      ]);
      const { fields } = await service.listFields();
      const best = fields.find((f) => f.columnName === 'best_case');
      const prod = fields.find((f) => f.columnName === 'prod_kind');
      expect(best?.isSystemFixed).toBe(true);
      expect(prod?.isSystemFixed).toBe(false);
    });
  });
});
