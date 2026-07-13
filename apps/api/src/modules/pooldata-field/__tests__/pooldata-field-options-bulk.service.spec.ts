/**
 * F112 / AD-E07-47：PooldataFieldOptionService.createOptionsBulk Unit Tests
 *
 * 涵蓋 F112-test.md 後端群組：
 *   BULK   options/bulk 交易 + 冪等略過 + display_order + 交易原子性  — BULK-001~008,012~014
 *   AUDIT  稽核彙總單筆（I-DVAL-AUDIT-SUMMARY-01）                    — AUDIT-001~005
 *
 * DTO 層驗證（BULK-009/010/011 空陣列 / >cap / 長度）於 bulk-create-options.dto.spec.ts。
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { PooldataFieldOptionService } from '../services/pooldata-field-option.service';
import { PooldataFieldWhitelistService } from '../services/pooldata-field-whitelist.service';
import { PooldataFieldOption } from '@/database/entities/pooldata-field-option.entity';
import { AssignmentAuditLog } from '@/database/entities/assignment-audit-log.entity';
import { User } from '@/database/entities/user.entity';

describe('PooldataFieldOptionService.createOptionsBulk (F112)', () => {
  let service: PooldataFieldOptionService;
  let optionRepo: any;
  let auditRepo: any;
  let userRepo: any;
  let whitelistService: any;
  let fakeManager: any;
  let transactionCallCount: number;

  const actor = { userId: 'director-uuid', ipAddress: '127.0.0.1' };

  const makeOption = (
    overrides: Partial<PooldataFieldOption> = {},
  ): PooldataFieldOption => ({
    column_name: 'occupation_desc',
    option_value: '01',
    option_label: '01',
    display_order: 0,
    is_active: true,
    deactivation_reason: null,
    created_at: new Date('2026-07-12T00:00:00Z'),
    updated_at: new Date('2026-07-12T00:00:00Z'),
    ...overrides,
  });

  /** 以既有 rows 建立 fakeManager（find 回傳既有值；create 保留欄位；save 可覆寫為 reject 測 rollback）。 */
  const setupManager = (existingRows: PooldataFieldOption[]) => {
    fakeManager = {
      find: vi.fn().mockResolvedValue(existingRows),
      create: vi.fn((_cls: any, data: any) => ({ ...data })),
      save: vi.fn((_cls: any, entities: any) => Promise.resolve(entities)),
    };
    optionRepo.manager = {
      transaction: vi.fn(async (cb: any) => {
        transactionCallCount += 1;
        return cb(fakeManager);
      }),
    };
  };

  beforeEach(async () => {
    transactionCallCount = 0;
    optionRepo = {};
    auditRepo = {
      create: vi.fn((data: any) => data),
      save: vi.fn().mockResolvedValue(undefined),
    };
    userRepo = {
      findOne: vi.fn().mockResolvedValue({ id: 'director-uuid', name: 'Director' }),
    };
    whitelistService = {
      assertCategorical: vi.fn().mockResolvedValue({
        column_name: 'occupation_desc',
        field_type: 'categorical',
      }),
    };
    setupManager([]);

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PooldataFieldOptionService,
        { provide: getRepositoryToken(PooldataFieldOption), useValue: optionRepo },
        { provide: getRepositoryToken(AssignmentAuditLog), useValue: auditRepo },
        { provide: getRepositoryToken(User), useValue: userRepo },
        { provide: PooldataFieldWhitelistService, useValue: whitelistService },
      ],
    }).compile();

    service = module.get(PooldataFieldOptionService);
  });

  // ==========================================================
  // BULK
  // ==========================================================
  describe('BULK — 交易與冪等', () => {
    it('BULK-001：整批操作包在單一 DB transaction 內（manager.transaction 恰 1 次）', async () => {
      setupManager([]);
      await service.createOptionsBulk(
        'occupation_desc',
        [{ optionValue: '工程師', optionLabel: '工程師' }],
        actor,
      );
      expect(transactionCallCount).toBe(1);
    });

    it('BULK-002：display_order 為現有 max+1，依輸入順序遞增', async () => {
      setupManager([makeOption({ option_value: 'X', display_order: 3 })]);

      await service.createOptionsBulk(
        'occupation_desc',
        [
          { optionValue: 'A', optionLabel: 'A' },
          { optionValue: 'B', optionLabel: 'B' },
        ],
        actor,
      );

      // 檢視傳入 manager.save 的 toInsert 陣列 display_order
      const saved = fakeManager.save.mock.calls[0][1];
      const byValue = new Map(saved.map((r: any) => [r.option_value, r.display_order]));
      expect(byValue.get('A')).toBe(4);
      expect(byValue.get('B')).toBe(5);
    });

    it('BULK-003：既有 ACTIVE 值 → 略過、不報錯、不回 409、不覆寫既有 label', async () => {
      setupManager([
        makeOption({ option_value: '醫師', option_label: '醫師', is_active: true }),
      ]);

      const result = await service.createOptionsBulk(
        'occupation_desc',
        [{ optionValue: '醫師', optionLabel: '醫生' }], // 同值不同 label
        actor,
      );

      expect(result.createdCount).toBe(0);
      expect(result.skippedCount).toBe(1);
      // 未把 '醫師' 放入 toInsert（save 未被呼叫或無此值）
      expect(fakeManager.save).not.toHaveBeenCalled();
    });

    it('BULK-004：既有 INACTIVE 值 → 略過，不重新啟用', async () => {
      setupManager([
        makeOption({ option_value: '教師', is_active: false, deactivation_reason: 'manual' }),
      ]);

      const result = await service.createOptionsBulk(
        'occupation_desc',
        [{ optionValue: '教師', optionLabel: '教師' }],
        actor,
      );

      expect(result.skippedCount).toBe(1);
      expect(result.createdCount).toBe(0);
      // 不對既有 inactive 紀錄呼叫 save（不重啟）
      expect(fakeManager.save).not.toHaveBeenCalled();
    });

    it('BULK-005：批次內重複值 → 首次建立、其餘略過（首次為準）', async () => {
      setupManager([]);

      const result = await service.createOptionsBulk(
        'occupation_desc',
        [
          { optionValue: 'X', optionLabel: '第一個' },
          { optionValue: 'X', optionLabel: '第二個' },
        ],
        actor,
      );

      expect(result.createdCount).toBe(1);
      expect(result.skippedCount).toBe(1);
      expect(result.options).toHaveLength(1);
      expect(result.options[0].optionLabel).toBe('第一個');
    });

    it('BULK-006：回應形狀正確，options[] 僅含實際新增項', async () => {
      setupManager([makeOption({ option_value: '既有', display_order: 0 })]);

      const result = await service.createOptionsBulk(
        'occupation_desc',
        [
          { optionValue: '新1', optionLabel: '新1' },
          { optionValue: '新2', optionLabel: '新2' },
          { optionValue: '既有', optionLabel: '既有' },
        ],
        actor,
      );

      expect(result.columnName).toBe('occupation_desc');
      expect(result.createdCount).toBe(2);
      expect(result.skippedCount).toBe(1);
      expect(result.options).toHaveLength(2);
      result.options.forEach((o) => {
        expect(o.optionValue).toBe(o.optionLabel);
        expect(o.isActive).toBe(true);
      });
    });

    it('BULK-007：欄位不存在 → 404 POOLDATA_FIELD_NOT_FOUND，transaction 未開啟', async () => {
      whitelistService.assertCategorical.mockRejectedValue(
        new NotFoundException({ error: 'POOLDATA_FIELD_NOT_FOUND' }),
      );

      await expect(
        service.createOptionsBulk(
          'nonexistent_col',
          [{ optionValue: 'X', optionLabel: 'X' }],
          actor,
        ),
      ).rejects.toBeInstanceOf(NotFoundException);
      expect(transactionCallCount).toBe(0);
    });

    it('BULK-008：非 categorical → 400 POOLDATA_OPTION_FIELD_TYPE_INVALID，transaction 未開啟', async () => {
      whitelistService.assertCategorical.mockRejectedValue(
        new BadRequestException({ error: 'POOLDATA_OPTION_FIELD_TYPE_INVALID' }),
      );

      await expect(
        service.createOptionsBulk(
          'date_of_birth',
          [{ optionValue: 'X', optionLabel: 'X' }],
          actor,
        ),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(transactionCallCount).toBe(0);
    });

    it('BULK-012：全部候選值皆略過（createdCount=0）→ 仍回 200，manager.save 不被呼叫', async () => {
      setupManager([
        makeOption({ option_value: 'A' }),
        makeOption({ option_value: 'B' }),
      ]);

      const result = await service.createOptionsBulk(
        'occupation_desc',
        [
          { optionValue: 'A', optionLabel: 'A' },
          { optionValue: 'B', optionLabel: 'B' },
        ],
        actor,
      );

      expect(result.createdCount).toBe(0);
      expect(result.skippedCount).toBe(2);
      expect(result.options).toEqual([]);
      expect(fakeManager.save).not.toHaveBeenCalled();
    });

    it('BULK-013：交易原子性 — save 失敗 → 整批 rollback（拋例外、不寫稽核）', async () => {
      setupManager([]);
      fakeManager.save = vi.fn().mockRejectedValue(new Error('DB write failed'));

      await expect(
        service.createOptionsBulk(
          'occupation_desc',
          [
            { optionValue: 'A', optionLabel: 'A' },
            { optionValue: 'B', optionLabel: 'B' },
            { optionValue: 'C', optionLabel: 'C' },
          ],
          actor,
        ),
      ).rejects.toThrow();
      // 稽核在 tx 外、於 tx 成功後才寫；tx 失敗 → 稽核未被寫入
      expect(auditRepo.save).not.toHaveBeenCalled();
    });

    it('BULK-014：既有值判定與 maxOrder 推導共用同一次 manager.find（不隨候選數線性增加查詢）', async () => {
      setupManager([makeOption({ option_value: 'seed', display_order: 0 })]);

      await service.createOptionsBulk(
        'occupation_desc',
        Array.from({ length: 10 }, (_, i) => ({
          optionValue: `v${i}`,
          optionLabel: `v${i}`,
        })),
        actor,
      );

      expect(fakeManager.find).toHaveBeenCalledTimes(1);
    });
  });

  // ==========================================================
  // AUDIT
  // ==========================================================
  describe('AUDIT — 稽核彙總單筆', () => {
    it('AUDIT-001【紅線】一次 bulk（N 筆新增）僅寫入 assignment_audit_log 恰好 1 筆', async () => {
      setupManager([]);
      await service.createOptionsBulk(
        'occupation_desc',
        [
          { optionValue: 'a', optionLabel: 'a' },
          { optionValue: 'b', optionLabel: 'b' },
          { optionValue: 'c', optionLabel: 'c' },
        ],
        actor,
      );
      expect(auditRepo.save).toHaveBeenCalledTimes(1);
    });

    it('AUDIT-002：entity_id === columnName（不含 .optionValue 後綴）+ entity_type + action', async () => {
      setupManager([]);
      await service.createOptionsBulk(
        'occupation_desc',
        [{ optionValue: 'a', optionLabel: 'a' }],
        actor,
      );
      const arg = auditRepo.create.mock.calls[0][0];
      expect(arg.entity_type).toBe('pooldata_field_option');
      expect(arg.entity_id).toBe('occupation_desc');
      expect(arg.entity_id).not.toContain('.');
      expect(arg.action).toBe('CREATE');
    });

    it('AUDIT-003：after_value 內容正確（寫入既有 after_value 欄，非新增 details 欄）；before_value=null', async () => {
      setupManager([makeOption({ option_value: '既有' })]);
      await service.createOptionsBulk(
        'occupation_desc',
        [
          { optionValue: '新1', optionLabel: '新1' },
          { optionValue: '新2', optionLabel: '新2' },
          { optionValue: '既有', optionLabel: '既有' },
        ],
        actor,
      );
      const arg = auditRepo.create.mock.calls[0][0];
      expect(arg.before_value).toBeNull();
      expect(arg).not.toHaveProperty('details'); // 無獨立 details 欄
      expect(arg.after_value.createdValues).toEqual(['新1', '新2']);
      expect(arg.after_value.createdCount).toBe(2);
      expect(arg.after_value.skippedCount).toBe(1);
      expect(arg.after_value.source).toBe('bulk_auto_suggest');
    });

    it('AUDIT-004：稽核寫入失敗不 rollback 已提交可選值（catch 吞例外，整體仍回 200）', async () => {
      setupManager([]);
      auditRepo.save.mockRejectedValue(new Error('audit DB down'));

      const result = await service.createOptionsBulk(
        'occupation_desc',
        [{ optionValue: 'a', optionLabel: 'a' }],
        actor,
      );
      expect(result.createdCount).toBe(1);
    });

    it('AUDIT-005：既有單筆 _writeAudit 行為不受影響（createOption 稽核 entity_id 仍為 columnName.optionValue）', async () => {
      // 既有單筆路徑：optionRepo.create/findOne/find/save（非 manager）
      optionRepo.create = vi.fn((data: any) => ({ ...data }));
      optionRepo.findOne = vi.fn().mockResolvedValue(null);
      optionRepo.find = vi.fn().mockResolvedValue([]);
      optionRepo.save = vi.fn((e: any) => Promise.resolve({ ...e }));

      await service.createOption(
        'occupation_desc',
        { optionValue: '09', optionLabel: '09' },
        actor,
      );
      const arg = auditRepo.create.mock.calls[0][0];
      expect(arg.entity_id).toBe('occupation_desc.09'); // 單筆仍含 .optionValue 後綴
    });
  });
});
