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
} from '@nestjs/common';
import { DataSource } from 'typeorm';
import { PooldataFieldWhitelistService } from '../services/pooldata-field-whitelist.service';
import { PooldataFieldWhitelist } from '@/database/entities/pooldata-field-whitelist.entity';
import { PooldataFieldOption } from '@/database/entities/pooldata-field-option.entity';
import { AssignmentAuditLog } from '@/database/entities/assignment-audit-log.entity';
import { User } from '@/database/entities/user.entity';

describe('PooldataFieldWhitelistService', () => {
  let service: PooldataFieldWhitelistService;
  let fieldRepo: any;
  let optionRepo: any;
  let auditRepo: any;
  let userRepo: any;
  let dataSource: any;

  // 收集 tx 內的 manager.save 與 manager 內 QB UPDATE 行為
  let txQbUpdateAffected: number;

  const actor = { userId: 'director-uuid', ipAddress: '127.0.0.1' };
  const NOW = new Date('2026-05-17T12:00:00.000Z');

  const makeRow = (
    overrides: Partial<PooldataFieldWhitelist> = {},
  ): PooldataFieldWhitelist => ({
    column_name: 'PROD_KIND',
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
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PooldataFieldWhitelistService,
        { provide: getRepositoryToken(PooldataFieldWhitelist), useValue: fieldRepo },
        { provide: getRepositoryToken(PooldataFieldOption), useValue: optionRepo },
        { provide: getRepositoryToken(AssignmentAuditLog), useValue: auditRepo },
        { provide: getRepositoryToken(User), useValue: userRepo },
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
        makeRow({ column_name: 'PROD_KIND' }),
        makeRow({ column_name: 'PAYT_TERM', is_active: false, field_type: 'numeric' }),
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
        makeRow({ column_name: 'RISK_LEVEL', display_name: '風險等級' }),
      );

      const result = await service.createField(
        { columnName: 'RISK_LEVEL', displayName: '風險等級', fieldType: 'categorical' },
        actor,
      );

      expect(result.columnName).toBe('RISK_LEVEL');
      expect(result.fieldType).toBe('categorical');
      expect(result.isActive).toBe(true);
      expect(auditRepo.save).toHaveBeenCalledTimes(1);
      const auditArg = auditRepo.create.mock.calls[0][0];
      expect(auditArg.entity_type).toBe('pooldata_field_whitelist');
      expect(auditArg.action).toBe('CREATE');
      expect(auditArg.entity_id).toBe('RISK_LEVEL');
    });

    it('TC-M04-004：重複 columnName（含已停用）→ 409 POOLDATA_FIELD_DUPLICATE', async () => {
      fieldRepo.findOne.mockResolvedValue(makeRow({ is_active: false }));

      await expect(
        service.createField(
          { columnName: 'PROD_KIND', displayName: 'X', fieldType: 'categorical' },
          actor,
        ),
      ).rejects.toBeInstanceOf(ConflictException);

      try {
        await service.createField(
          { columnName: 'PROD_KIND', displayName: 'X', fieldType: 'categorical' },
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
        'PROD_KIND',
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
        'PROD_KIND',
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
        'MONTH_CNT',
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
        'PROD_KIND',
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

      const result = await service.disableField('PROD_KIND', actor);
      expect(result.columnName).toBe('PROD_KIND');
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
      await expect(service.assertCategorical('PROD_KIND')).resolves.toBeDefined();
    });

    it('numeric → 400 POOLDATA_OPTION_FIELD_TYPE_INVALID', async () => {
      fieldRepo.findOne.mockResolvedValue(makeRow({ field_type: 'numeric' }));
      await expect(service.assertCategorical('MONTH_CNT')).rejects.toBeInstanceOf(
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
      const result = await service.getInactiveCount('PROD_KIND');
      expect(result.activeCount).toBe(7);
      expect(optionRepo.count).toHaveBeenCalledWith({
        where: { column_name: 'PROD_KIND', is_active: true },
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
      fieldRepo.save.mockResolvedValue(makeRow({ column_name: 'NEW' }));

      await expect(
        service.createField(
          { columnName: 'NEW', displayName: 'x', fieldType: 'numeric' },
          actor,
        ),
      ).resolves.toBeDefined();
    });
  });
});
