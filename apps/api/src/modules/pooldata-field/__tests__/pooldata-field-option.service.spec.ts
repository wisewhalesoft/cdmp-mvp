/**
 * F076 v1.3 / P1 B5：PooldataFieldOptionService Unit Tests
 *
 * 涵蓋 TC：
 *   TC-OPT-LIST-001 listOptions ?active=true 只取啟用
 *   TC-OPT-LIST-002 listOptions ?includeInactive=true 全部回傳（含 deactivation_reason）
 *   TC-OPT-LIST-003 listOptions includeInactive 優先 active
 *   TC-OPT-CREATE-001 createOption 成功 + 稽核
 *   TC-OPT-CREATE-002 createOption 重複（含已停用）→ 409 POOLDATA_OPTION_DUPLICATE
 *   TC-OPT-CREATE-003 非 categorical 欄位 → 400
 *   TC-DEACTIVATE-001 deactivateOption 成功 + audit details 帶 reason / deactivationReason=manual
 *   TC-DEACTIVATE-002 deactivateOption 不存在 → 404 POOLDATA_OPTION_NOT_FOUND
 *   TC-REACTIVATE-001 reactivateOption 成功 + 自動清空 deactivation_reason
 *   TC-OPT-LIST-005 listOptions 依 display_order,option_value 排序 + 回傳含 displayOrder
 *   TC-OPT-CREATE-004 createOption 接續既有最大 display_order 之後（append at end）
 *   TC-OPT-CREATE-005 createOption 欄位尚無既有選項時 display_order=0
 *   TC-REORDER-001 reorderOptions 依 orderedValues 設定 display_order=索引 + 稽核 + 回傳新排序
 *   TC-REORDER-002 reorderOptions 含不存在的 optionValue → 寬容跳過不拋錯
 *   TC-REORDER-003 reorderOptions 非 categorical → 400
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { PooldataFieldOptionService } from '../services/pooldata-field-option.service';
import { PooldataFieldWhitelistService } from '../services/pooldata-field-whitelist.service';
import { PooldataFieldOption } from '@/database/entities/pooldata-field-option.entity';
import { AssignmentAuditLog } from '@/database/entities/assignment-audit-log.entity';
import { User } from '@/database/entities/user.entity';

describe('PooldataFieldOptionService', () => {
  let service: PooldataFieldOptionService;
  let optionRepo: any;
  let auditRepo: any;
  let userRepo: any;
  let whitelistService: any;

  const actor = { userId: 'director-uuid', ipAddress: '127.0.0.1' };
  const NOW = new Date('2026-05-17T12:00:00.000Z');

  const makeOption = (
    overrides: Partial<PooldataFieldOption> = {},
  ): PooldataFieldOption => ({
    column_name: 'prod_kind',
    option_value: '01',
    option_label: '汽車',
    display_order: 0,
    is_active: true,
    deactivation_reason: null,
    created_at: NOW,
    updated_at: NOW,
    ...overrides,
  });

  beforeEach(async () => {
    optionRepo = {
      find: vi.fn().mockResolvedValue([]),
      findOne: vi.fn().mockResolvedValue(null),
      create: vi.fn((data: any) => ({ ...data })),
      save: vi.fn((entity: any) => Promise.resolve({ ...entity })),
    };
    auditRepo = {
      create: vi.fn((data: any) => data),
      save: vi.fn().mockResolvedValue(undefined),
    };
    userRepo = {
      findOne: vi.fn().mockResolvedValue({ id: 'director-uuid', name: 'Director' }),
    };
    whitelistService = {
      assertCategorical: vi.fn().mockResolvedValue({
        column_name: 'prod_kind',
        field_type: 'categorical',
      }),
    };

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

  // ========================
  // listOptions
  // ========================

  describe('listOptions (TC-OPT-LIST-001 / 002 / 003)', () => {
    it('TC-OPT-LIST-001：?active=true 只取啟用', async () => {
      await service.listOptions('prod_kind', { active: 'true' });
      expect(optionRepo.find).toHaveBeenCalledWith({
        where: { column_name: 'prod_kind', is_active: true },
        order: { display_order: 'ASC', option_value: 'ASC' },
      });
    });

    it('TC-OPT-LIST-002：?includeInactive=true 全部回傳（不加 is_active filter）', async () => {
      optionRepo.find.mockResolvedValue([
        makeOption({ is_active: true }),
        makeOption({
          option_value: '03',
          is_active: false,
          deactivation_reason: 'manual',
        }),
      ]);
      const result = await service.listOptions('prod_kind', {
        includeInactive: 'true',
      });
      expect(optionRepo.find).toHaveBeenCalledWith({
        where: { column_name: 'prod_kind' },
        order: { display_order: 'ASC', option_value: 'ASC' },
      });
      expect(result.options).toHaveLength(2);
      // inactive 紀錄含 deactivationReason
      const inactive = result.options.find((o) => !o.isActive);
      expect(inactive?.deactivationReason).toBe('manual');
    });

    it('TC-OPT-LIST-003：includeInactive=true 同時帶 active=true → includeInactive 優先', async () => {
      await service.listOptions('prod_kind', {
        includeInactive: 'true',
        active: 'true',
      });
      expect(optionRepo.find).toHaveBeenCalledWith({
        where: { column_name: 'prod_kind' },
        order: { display_order: 'ASC', option_value: 'ASC' },
      });
    });

    it('TC-OPT-LIST-004：非 categorical → 400 由 assertCategorical 拋', async () => {
      whitelistService.assertCategorical.mockRejectedValue(
        new BadRequestException(),
      );
      await expect(service.listOptions('month_cnt')).rejects.toBeInstanceOf(
        BadRequestException,
      );
    });

    it('TC-OPT-LIST-005：依 display_order,option_value 排序查詢 + 回傳含 displayOrder', async () => {
      optionRepo.find.mockResolvedValue([
        makeOption({ option_value: '01', display_order: 0 }),
        makeOption({ option_value: '02', display_order: 1 }),
      ]);

      const result = await service.listOptions('prod_kind', {
        includeInactive: 'true',
      });

      expect(optionRepo.find).toHaveBeenCalledWith({
        where: { column_name: 'prod_kind' },
        order: { display_order: 'ASC', option_value: 'ASC' },
      });
      expect(result.options.map((o) => o.optionValue)).toEqual(['01', '02']);
      expect(result.options[0].displayOrder).toBe(0);
      expect(result.options[1].displayOrder).toBe(1);
    });
  });

  // ========================
  // createOption
  // ========================

  describe('createOption (TC-OPT-CREATE-001 / 002 / 003)', () => {
    it('TC-OPT-CREATE-001：新增成功 + 稽核', async () => {
      optionRepo.findOne.mockResolvedValue(null);
      optionRepo.save.mockResolvedValue(
        makeOption({ option_value: '09', option_label: '農業機具' }),
      );

      const result = await service.createOption(
        'prod_kind',
        { optionValue: '09', optionLabel: '農業機具' },
        actor,
      );

      expect(result.optionValue).toBe('09');
      expect(result.isActive).toBe(true);
      expect(auditRepo.save).toHaveBeenCalledTimes(1);
      const auditArg = auditRepo.create.mock.calls[0][0];
      expect(auditArg.entity_type).toBe('pooldata_field_option');
      expect(auditArg.entity_id).toBe('prod_kind.09');
      expect(auditArg.action).toBe('CREATE');
    });

    it('TC-OPT-CREATE-002：重複 optionValue（含已停用）→ 409 POOLDATA_OPTION_DUPLICATE', async () => {
      optionRepo.findOne.mockResolvedValue(
        makeOption({ option_value: '03', is_active: false, deactivation_reason: 'manual' }),
      );
      await expect(
        service.createOption(
          'prod_kind',
          { optionValue: '03', optionLabel: 'X' },
          actor,
        ),
      ).rejects.toBeInstanceOf(ConflictException);
      expect(optionRepo.save).not.toHaveBeenCalled();
    });

    it('TC-OPT-CREATE-003：非 categorical → 400（由 assertCategorical 拋）', async () => {
      whitelistService.assertCategorical.mockRejectedValue(
        new BadRequestException(),
      );
      await expect(
        service.createOption(
          'month_cnt',
          { optionValue: '1', optionLabel: 'X' },
          actor,
        ),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('TC-OPT-CREATE-004：接續既有最大 display_order 之後（append at end）', async () => {
      optionRepo.findOne.mockResolvedValue(null);
      optionRepo.find.mockResolvedValue([
        makeOption({ option_value: '01', display_order: 3 }),
      ]);
      optionRepo.save.mockImplementation((e: any) => Promise.resolve({ ...e }));

      const result = await service.createOption(
        'prod_kind',
        { optionValue: '10', optionLabel: '新選項' },
        actor,
      );

      expect(optionRepo.find).toHaveBeenCalledWith({
        where: { column_name: 'prod_kind' },
        order: { display_order: 'DESC' },
        take: 1,
      });
      expect(result.displayOrder).toBe(4);
    });

    it('TC-OPT-CREATE-005：欄位尚無既有選項時 display_order=0', async () => {
      optionRepo.findOne.mockResolvedValue(null);
      optionRepo.find.mockResolvedValue([]);
      optionRepo.save.mockImplementation((e: any) => Promise.resolve({ ...e }));

      const result = await service.createOption(
        'prod_kind',
        { optionValue: '01', optionLabel: '首筆' },
        actor,
      );
      expect(result.displayOrder).toBe(0);
    });
  });

  // ========================
  // deactivateOption
  // ========================

  describe('deactivateOption (TC-DEACTIVATE-001 / 002 / TC-DEACTIVATE-REASON)', () => {
    it('TC-DEACTIVATE-001：成功 + audit details 帶 reason / deactivationReason=manual', async () => {
      const before = makeOption({ option_value: '03', is_active: true });
      optionRepo.findOne.mockResolvedValue(before);
      optionRepo.save.mockImplementation((e: any) => Promise.resolve({ ...e }));

      const result = await service.deactivateOption(
        'prod_kind',
        '03',
        { reason: '2026 起停售' },
        actor,
      );

      expect(result.isActive).toBe(false);
      expect(result.deactivationReason).toBe('manual');
      expect(result.reason).toBe('2026 起停售');

      // 稽核 after_value 含 reason / deactivationReason
      const afterValue = auditRepo.create.mock.calls[0][0].after_value;
      expect(afterValue.reason).toBe('2026 起停售');
      expect(afterValue.deactivationReason).toBe('manual');
    });

    it('TC-DEACTIVATE-002：optionValue 不存在 → 404 POOLDATA_OPTION_NOT_FOUND', async () => {
      optionRepo.findOne.mockResolvedValue(null);
      await expect(
        service.deactivateOption('prod_kind', '99', { reason: 'x' }, actor),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('TC-DEACTIVATE-IDEMPOTENT：對已停用紀錄重複呼叫不報錯（idempotent，§5.4）', async () => {
      const already = makeOption({
        option_value: '03',
        is_active: false,
        deactivation_reason: 'manual',
      });
      optionRepo.findOne.mockResolvedValue(already);
      optionRepo.save.mockImplementation((e: any) => Promise.resolve({ ...e }));

      const result = await service.deactivateOption(
        'prod_kind',
        '03',
        { reason: '更新原因' },
        actor,
      );
      expect(result.isActive).toBe(false);
      expect(result.reason).toBe('更新原因');
    });
  });

  // ========================
  // reactivateOption
  // ========================

  describe('reactivateOption (TC-REACTIVATE-001)', () => {
    it('TC-REACTIVATE-001：成功 + 自動清空 deactivation_reason 為 NULL', async () => {
      const before = makeOption({
        option_value: '03',
        is_active: false,
        deactivation_reason: 'manual',
      });
      optionRepo.findOne.mockResolvedValue(before);
      optionRepo.save.mockImplementation((e: any) => Promise.resolve({ ...e }));

      const result = await service.reactivateOption(
        'prod_kind',
        '03',
        {},
        actor,
      );

      expect(result.isActive).toBe(true);
      // 驗證 service 在傳給 save 之前已清空 deactivation_reason
      const savedArg = optionRepo.save.mock.calls[0][0];
      expect(savedArg.deactivation_reason).toBeNull();
    });

    it('reactivateOption：可同步更新 optionLabel', async () => {
      optionRepo.findOne.mockResolvedValue(
        makeOption({ is_active: false, deactivation_reason: 'manual' }),
      );
      optionRepo.save.mockImplementation((e: any) => Promise.resolve({ ...e }));

      const result = await service.reactivateOption(
        'prod_kind',
        '01',
        { optionLabel: '汽車（更新）' },
        actor,
      );
      expect(result.optionLabel).toBe('汽車（更新）');
    });
  });

  // ========================
  // reorderOptions
  // ========================

  describe('reorderOptions (TC-REORDER-001 / 002 / 003)', () => {
    it('TC-REORDER-001：依 orderedValues 設定 display_order=索引 + 稽核 + 回傳新排序', async () => {
      const rowA = makeOption({ option_value: '01', display_order: 0 });
      const rowB = makeOption({ option_value: '02', display_order: 1 });
      const rowC = makeOption({ option_value: '03', display_order: 2 });
      // 第一次 find：載入既有 rows
      optionRepo.find.mockResolvedValueOnce([rowA, rowB, rowC]);
      optionRepo.save.mockImplementation((entities: any) =>
        Promise.resolve(entities),
      );
      // 第二次 find：reorderOptions 內部呼叫 listOptions 回傳新排序後結果
      optionRepo.find.mockResolvedValueOnce([
        makeOption({ option_value: '03', display_order: 0 }),
        makeOption({ option_value: '01', display_order: 1 }),
        makeOption({ option_value: '02', display_order: 2 }),
      ]);

      const result = await service.reorderOptions(
        'prod_kind',
        ['03', '01', '02'],
        actor,
      );

      // save 收到陣列，且各 row display_order 對應新索引
      const savedArg = optionRepo.save.mock.calls[0][0];
      expect(Array.isArray(savedArg)).toBe(true);
      const savedByValue = new Map(
        savedArg.map((r: any) => [r.option_value, r.display_order]),
      );
      expect(savedByValue.get('03')).toBe(0);
      expect(savedByValue.get('01')).toBe(1);
      expect(savedByValue.get('02')).toBe(2);

      // 稽核寫入一次，entity_id 為 columnName.__reorder__，前後對照
      expect(auditRepo.save).toHaveBeenCalledTimes(1);
      const auditArg = auditRepo.create.mock.calls[0][0];
      expect(auditArg.entity_id).toBe('prod_kind.__reorder__');
      expect(auditArg.action).toBe('UPDATE');
      expect(auditArg.before_value.order).toEqual(['01', '02', '03']);
      expect(auditArg.after_value.order).toEqual(['03', '01', '02']);

      // 回傳為 listOptions 的結果（已依新排序）
      expect(result.options.map((o) => o.optionValue)).toEqual([
        '03',
        '01',
        '02',
      ]);
    });

    it('TC-REORDER-002：orderedValues 含不存在的 optionValue → 寬容跳過不拋錯', async () => {
      const rowA = makeOption({ option_value: '01', display_order: 0 });
      optionRepo.find.mockResolvedValueOnce([rowA]);
      optionRepo.save.mockImplementation((entities: any) =>
        Promise.resolve(entities),
      );
      optionRepo.find.mockResolvedValueOnce([
        makeOption({ option_value: '01', display_order: 0 }),
      ]);

      await expect(
        service.reorderOptions('prod_kind', ['01', '99-unknown'], actor),
      ).resolves.toBeDefined();

      const savedArg = optionRepo.save.mock.calls[0][0];
      expect(savedArg).toHaveLength(1);
      expect(savedArg[0].option_value).toBe('01');
      expect(savedArg[0].display_order).toBe(0);
    });

    it('TC-REORDER-003：非 categorical → 400（由 assertCategorical 拋）', async () => {
      whitelistService.assertCategorical.mockRejectedValue(
        new BadRequestException(),
      );
      await expect(
        service.reorderOptions('month_cnt', ['01'], actor),
      ).rejects.toBeInstanceOf(BadRequestException);
    });
  });
});
