/**
 * F069 / F070 / F071 v2.1：prodKindName 來源遷移驗證
 *   F050 v2.1 重構 / AD-E07-18 §18.2.7 / §18.7 / §18.10 R7
 *
 * 範圍：驗證 CardTypeService 之 prodKindName 來源**已遷移**至 pooldata_field_option，
 * 不再讀 ob_code_df。對應 M5 deployment gate（同 commit + 同 PR）。
 *
 * 對應 test spec：
 *   - TS-F068-DEP-006：F069 prodKindName 改用 pooldata_field_option（M5 閘門驗證）
 *   - MT-M5-001：M5 執行前提 — F069 不再讀取 ob_code_df（regression-guard 靜態掃描，
 *     對應 C5 拍板：採 regression-guard 而非 CI 外部腳本）
 *
 * 涵蓋 cases：
 *   - listCardTypes 從 pooldata_field_option 取 prodKindName（column_name='prod_kind', is_active=true）
 *   - listCardTypes 不再呼叫 codeDfRepo（regression guard）
 *   - createCardType response 之 prodKindName 從 pooldata_field_option 取（is_active=true → option_label；
 *     否則 null）
 *   - updateCardType response 同 createCardType
 *
 * 注意：本 spec 為 W4 / W6 deployment gate 之**新增 spec**，與既有 5 個 fixture spec 並存。
 * 既有 spec（card-type-list/create/update/stats/delete.service.spec.ts）由 W6 同 commit 內 migrate。
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { CardTypeService } from '../services/card-type.service';
import { ObCardType } from '@/database/entities/ob-card-type.entity';
import { ObLevelcardVersion } from '@/database/entities/ob-levelcard-version.entity';
import { ObLevelcardColumn } from '@/database/entities/ob-levelcard-column.entity';
import { ObLevelcardScore } from '@/database/entities/ob-levelcard-score.entity';
import { ObLevelcardLevel } from '@/database/entities/ob-levelcard-level.entity';
import { ObTier } from '@/database/entities/ob-tier.entity';
import { ObListDefinition } from '@/database/entities/ob-list-definition.entity';
import { AssignmentRun } from '@/database/entities/assignment-run.entity';
import { AssignmentAuditLog } from '@/database/entities/assignment-audit-log.entity';
import { User } from '@/database/entities/user.entity';
import { PooldataFieldOption } from '@/database/entities/pooldata-field-option.entity';

describe('CardTypeService — F069/F070/F071 v2.1 prodKindName 來源遷移 (TS-F068-DEP-006 / MT-M5-001)', () => {
  let service: CardTypeService;
  let cardTypeRepo: any;
  let optionRepo: any;
  let versionRepo: any;
  let userRepo: any;
  let runRepo: any;
  let dataSource: any;

  const actor = { userId: 'sm-uuid', ipAddress: '127.0.0.1' };

  beforeEach(async () => {
    cardTypeRepo = {
      find: vi.fn().mockResolvedValue([]),
      findOne: vi.fn().mockResolvedValue(null),
      save: vi.fn((e: any) => Promise.resolve(e)),
    };
    optionRepo = {
      find: vi.fn().mockResolvedValue([]),
      findOne: vi.fn().mockResolvedValue(null),
    };
    versionRepo = { find: vi.fn().mockResolvedValue([]) };
    userRepo = {
      find: vi.fn().mockResolvedValue([]),
      findOne: vi.fn().mockResolvedValue({ id: 'sm-uuid', name: 'SM' }),
    };
    runRepo = { findOne: vi.fn().mockResolvedValue(null) };

    const fakeManager = {
      create: vi.fn((entityClass: any, data: any) => ({ __entity: entityClass.name, ...data })),
      save: vi.fn((entity: any) => Promise.resolve(entity)),
      delete: vi.fn().mockResolvedValue({ affected: 1 }),
      find: vi.fn().mockResolvedValue([]),
      remove: vi.fn((e: any) => Promise.resolve(e)),
    };
    dataSource = {
      transaction: vi.fn(async (cb: any) => cb(fakeManager)),
    };

    const noop = { find: vi.fn(), findOne: vi.fn(), count: vi.fn(), save: vi.fn(), create: vi.fn() };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CardTypeService,
        { provide: getRepositoryToken(ObCardType), useValue: cardTypeRepo },
        { provide: getRepositoryToken(PooldataFieldOption), useValue: optionRepo },
        { provide: getRepositoryToken(ObLevelcardVersion), useValue: versionRepo },
        { provide: getRepositoryToken(ObLevelcardColumn), useValue: noop },
        { provide: getRepositoryToken(ObLevelcardScore), useValue: noop },
        { provide: getRepositoryToken(ObLevelcardLevel), useValue: noop },
        { provide: getRepositoryToken(ObTier), useValue: noop },
        { provide: getRepositoryToken(ObListDefinition), useValue: noop },
        { provide: getRepositoryToken(AssignmentRun), useValue: runRepo },
        { provide: getRepositoryToken(AssignmentAuditLog), useValue: noop },
        { provide: getRepositoryToken(User), useValue: userRepo },
        { provide: DataSource, useValue: dataSource },
      ],
    }).compile();

    service = module.get(CardTypeService);
  });

  describe('listCardTypes', () => {
    it('TS-F068-DEP-006：prodKindName 從 pooldata_field_option 取（is_active=true → option_label）', async () => {
      cardTypeRepo.find.mockResolvedValue([
        { card_type: 'H', card_name: '期中', prod_kind: '01', status: 'active' },
        { card_type: 'M', card_name: '機車', prod_kind: '02', status: 'active' },
      ]);
      optionRepo.find.mockResolvedValue([
        { column_name: 'prod_kind', option_value: '01', option_label: '汽車', is_active: true },
        { column_name: 'prod_kind', option_value: '02', option_label: '機車', is_active: true },
      ]);

      const result = await service.listCardTypes({ status: 'active' });

      const h = result.cardTypes.find((c) => c.cardType === 'H')!;
      expect(h.prodKindName).toBe('汽車');
      const m = result.cardTypes.find((c) => c.cardType === 'M')!;
      expect(m.prodKindName).toBe('機車');
    });

    it('MT-M5-001：listCardTypes 透過 optionRepo（非 codeDfRepo）查 prod_kind，呼叫條件含 column_name=prod_kind', async () => {
      cardTypeRepo.find.mockResolvedValue([
        { card_type: 'H', card_name: '期中', prod_kind: '01', status: 'active' },
      ]);

      await service.listCardTypes({ status: 'active' });

      expect(optionRepo.find).toHaveBeenCalled();
      const calls = optionRepo.find.mock.calls;
      const hasProdKindQuery = calls.some((c: any[]) => {
        const where = c[0]?.where;
        if (!where) return false;
        // where 可能為 array（map）或 object
        if (Array.isArray(where)) {
          return where.some((w: any) => w.column_name === 'prod_kind');
        }
        return where.column_name === 'prod_kind';
      });
      expect(hasProdKindQuery).toBe(true);
    });

    it('TS-F068-DEP-006：option is_active=false → prodKindName=null（停用不顯示 label）', async () => {
      cardTypeRepo.find.mockResolvedValue([
        { card_type: 'X', card_name: '停用', prod_kind: '99', status: 'active' },
      ]);
      optionRepo.find.mockResolvedValue([
        { column_name: 'prod_kind', option_value: '99', option_label: '已停用', is_active: false },
      ]);

      const result = await service.listCardTypes({ status: 'active' });

      expect(result.cardTypes[0].prodKindName).toBeNull();
    });

    it('BE-F069-001：option 不存在 → prodKindName=null（graceful）', async () => {
      cardTypeRepo.find.mockResolvedValue([
        { card_type: 'X', card_name: '無對照', prod_kind: '99', status: 'active' },
      ]);
      optionRepo.find.mockResolvedValue([]);

      const result = await service.listCardTypes({ status: 'active' });
      expect(result.cardTypes[0].prodKindName).toBeNull();
    });
  });

  describe('createCardType', () => {
    it('TS-F068-DEP-006：response prodKindName 從 pooldata_field_option 取（option_label）', async () => {
      optionRepo.findOne.mockImplementation(async (args: any) => {
        const where = args?.where;
        // assertProdKindActive 查詢
        if (where?.column_name === 'prod_kind' && where?.option_value === '01' && where?.is_active === true) {
          return { column_name: 'prod_kind', option_value: '01', option_label: '汽車', is_active: true };
        }
        // response label 查詢
        if (where?.column_name === 'prod_kind' && where?.option_value === '01') {
          return { column_name: 'prod_kind', option_value: '01', option_label: '汽車', is_active: true };
        }
        return null;
      });

      const result = await service.createCardType(
        { cardType: 'X1', cardName: '測試卡', prodKind: '01' },
        actor,
      );

      expect(result.prodKindName).toBe('汽車');
      expect(result.cardVersion).toBe(1);
    });

    it('createCardType assertProdKindActive 不存在 active option → 422', async () => {
      optionRepo.findOne.mockResolvedValue(null);

      await expect(
        service.createCardType(
          { cardType: 'X1', cardName: '測試卡', prodKind: '99' },
          actor,
        ),
      ).rejects.toThrow();
    });
  });

  describe('updateCardType', () => {
    it('TS-F068-DEP-006：response prodKindName 從 pooldata_field_option 取', async () => {
      cardTypeRepo.findOne.mockResolvedValue({
        card_type: 'H',
        card_name: '原期中',
        prod_kind: '01',
        status: 'active',
        updated_at: new Date('2026-05-20'),
      });
      optionRepo.findOne.mockImplementation(async (args: any) => {
        const where = args?.where;
        if (where?.column_name === 'prod_kind' && where?.option_value === '02') {
          return { column_name: 'prod_kind', option_value: '02', option_label: '機車', is_active: true };
        }
        return null;
      });

      const result = await service.updateCardType(
        'H',
        { cardName: '新期中', prodKind: '02' },
        actor,
      );

      expect(result.prodKindName).toBe('機車');
    });
  });
});
