/**
 * F069 / CardTypeService.listCardTypes Unit Tests
 *
 * 對應 spec：docs/specs/features/F069-view-card-type-list.md
 * 對應 test-spec：docs/test-specs/features/F069-test.md
 *
 * 涵蓋 TC：
 *   TC-F069-01：GET 含 prodKindName（join ob_code_df 正常）
 *   TC-F069-02：依 card_type 升冪排序
 *   TC-F069-08：清單為空時回傳空陣列
 *   TC-F069-11：status='inactive' 紀錄不在預設回傳
 *   BE-F069-001：prodKind 對應 ob_code_df 不存在 → prodKindName=null
 *   BE-F069-002：6 個正規 CARD_TYPE 全 active 升冪排序
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { CardTypeService } from '../services/card-type.service';
import { ObCardType } from '@/database/entities/ob-card-type.entity';
import { ObCodeDf } from '@/database/entities/ob-code-df.entity';
import { ObLevelcardVersion } from '@/database/entities/ob-levelcard-version.entity';
import { ObLevelcardColumn } from '@/database/entities/ob-levelcard-column.entity';
import { ObLevelcardScore } from '@/database/entities/ob-levelcard-score.entity';
import { ObLevelcardLevel } from '@/database/entities/ob-levelcard-level.entity';
import { ObTier } from '@/database/entities/ob-tier.entity';
import { ObListDefinition } from '@/database/entities/ob-list-definition.entity';
import { AssignmentRun } from '@/database/entities/assignment-run.entity';
import { AssignmentAuditLog } from '@/database/entities/assignment-audit-log.entity';
import { User } from '@/database/entities/user.entity';

describe('CardTypeService — F069 listCardTypes', () => {
  let service: CardTypeService;
  let cardTypeRepo: any;
  let codeDfRepo: any;

  beforeEach(async () => {
    cardTypeRepo = {
      find: vi.fn().mockResolvedValue([]),
    };
    codeDfRepo = {
      find: vi.fn().mockResolvedValue([]),
      findOne: vi.fn().mockResolvedValue(null),
    };

    const noop = { find: vi.fn(), findOne: vi.fn(), count: vi.fn(), save: vi.fn(), create: vi.fn() };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CardTypeService,
        { provide: getRepositoryToken(ObCardType), useValue: cardTypeRepo },
        { provide: getRepositoryToken(ObCodeDf), useValue: codeDfRepo },
        { provide: getRepositoryToken(ObLevelcardVersion), useValue: noop },
        { provide: getRepositoryToken(ObLevelcardColumn), useValue: noop },
        { provide: getRepositoryToken(ObLevelcardScore), useValue: noop },
        { provide: getRepositoryToken(ObLevelcardLevel), useValue: noop },
        { provide: getRepositoryToken(ObTier), useValue: noop },
        { provide: getRepositoryToken(ObListDefinition), useValue: noop },
        { provide: getRepositoryToken(AssignmentRun), useValue: noop },
        { provide: getRepositoryToken(AssignmentAuditLog), useValue: noop },
        { provide: getRepositoryToken(User), useValue: noop },
        { provide: DataSource, useValue: { transaction: vi.fn() } },
      ],
    }).compile();

    service = module.get(CardTypeService);
  });

  it('TC-F069-01 + TC-F069-02：GET 列表升冪排序且 prodKindName join 正確', async () => {
    cardTypeRepo.find.mockResolvedValue([
      // 故意打亂插入順序：M / H / S
      { card_type: 'M', card_name: '機車', prod_kind: '02', status: 'active' },
      { card_type: 'H', card_name: '期中', prod_kind: '01', status: 'active' },
      { card_type: 'S', card_name: '中結', prod_kind: '01', status: 'active' },
    ]);
    codeDfRepo.find.mockResolvedValue([
      {
        system_id: 'OB',
        tbl_id: 'PROD_KIND',
        tbl_cd: '01',
        tbl_desc1: '汽車',
        stadt: '20000101',
        enddt: '20991231',
      },
      {
        system_id: 'OB',
        tbl_id: 'PROD_KIND',
        tbl_cd: '02',
        tbl_desc1: '機車',
        stadt: '20000101',
        enddt: '20991231',
      },
    ]);

    const result = await service.listCardTypes({ status: 'active' });

    expect(result.cardTypes).toHaveLength(3);
    expect(result.cardTypes[0].cardType).toBe('H');
    expect(result.cardTypes[1].cardType).toBe('M');
    expect(result.cardTypes[2].cardType).toBe('S');

    const h = result.cardTypes.find((c) => c.cardType === 'H')!;
    expect(h.prodKind).toBe('01');
    expect(h.prodKindName).toBe('汽車');
    expect(h.status).toBe('active');

    const m = result.cardTypes.find((c) => c.cardType === 'M')!;
    expect(m.prodKindName).toBe('機車');
  });

  it('TC-F069-08：清單為空時回傳空陣列（非 404）', async () => {
    cardTypeRepo.find.mockResolvedValue([]);

    const result = await service.listCardTypes({ status: 'active' });

    expect(result.cardTypes).toEqual([]);
  });

  it('TC-F069-11：預設不傳 status 只回 active 紀錄（cardTypeRepo.find 帶 status=active）', async () => {
    cardTypeRepo.find.mockResolvedValue([
      { card_type: 'H', card_name: '期中', prod_kind: '01', status: 'active' },
    ]);

    await service.listCardTypes({});

    // 確認 repo 被 where status='active' 查詢
    expect(cardTypeRepo.find).toHaveBeenCalledWith({
      where: { status: 'active' },
    });
  });

  it("TC-F069-11b：status='all' 時不加 status 過濾", async () => {
    cardTypeRepo.find.mockResolvedValue([]);

    await service.listCardTypes({ status: 'all' });

    expect(cardTypeRepo.find).toHaveBeenCalledWith({ where: {} });
  });

  it('BE-F069-001：prod_kind 對應 ob_code_df 不存在 → prodKindName=null（鍵存在）', async () => {
    cardTypeRepo.find.mockResolvedValue([
      { card_type: 'X', card_name: '無對照', prod_kind: '99', status: 'active' },
    ]);
    codeDfRepo.find.mockResolvedValue([]); // 無對應 PROD_KIND

    const result = await service.listCardTypes({ status: 'active' });

    expect(result.cardTypes).toHaveLength(1);
    expect(result.cardTypes[0].prodKindName).toBeNull();
  });

  it('BE-F069-002：6 個正規 CARD_TYPE 升冪 E < E5 < H < M < S < S5', async () => {
    cardTypeRepo.find.mockResolvedValue([
      // 故意亂序
      { card_type: 'S5', card_name: '中結5年', prod_kind: '01', status: 'active' },
      { card_type: 'E', card_name: '滿期', prod_kind: '01', status: 'active' },
      { card_type: 'M', card_name: '機車', prod_kind: '02', status: 'active' },
      { card_type: 'H', card_name: '期中', prod_kind: '01', status: 'active' },
      { card_type: 'E5', card_name: '滿期5年', prod_kind: '01', status: 'active' },
      { card_type: 'S', card_name: '中結', prod_kind: '01', status: 'active' },
    ]);
    codeDfRepo.find.mockResolvedValue([]);

    const result = await service.listCardTypes({ status: 'active' });

    expect(result.cardTypes.map((c) => c.cardType)).toEqual([
      'E',
      'E5',
      'H',
      'M',
      'S',
      'S5',
    ]);
  });

  it('PROD_KIND 已過期（enddt < today）→ prodKindName=null', async () => {
    cardTypeRepo.find.mockResolvedValue([
      { card_type: 'H', card_name: '期中', prod_kind: '01', status: 'active' },
    ]);
    codeDfRepo.find.mockResolvedValue([
      {
        system_id: 'OB',
        tbl_id: 'PROD_KIND',
        tbl_cd: '01',
        tbl_desc1: '汽車',
        stadt: '20000101',
        enddt: '20100101', // 已過期
      },
    ]);

    const result = await service.listCardTypes({ status: 'active' });
    expect(result.cardTypes[0].prodKindName).toBeNull();
  });
});
