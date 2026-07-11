/**
 * F070 / CardTypeService.createCardType Unit Tests
 *
 * 對應 spec：docs/specs/features/F070-create-card-type.md
 * 對應 test-spec：docs/test-specs/features/F070-test.md
 *
 * 涵蓋 TC（unit-level，e2e 由 assignment-scoring.e2e-spec.ts 補強）：
 *   TC-F070-01：成功新增（驗 service 呼叫 dataSource.transaction）
 *   TC-F070-02：v1 版本初值正確（sdate=今日、edate='20991231'、status='active'）
 *   TC-F070-03：audit_log CREATE 寫入（同 tx）
 *   TC-F070-04：cardType 重複 → 422 CARD_TYPE_DUPLICATE
 *   TC-F070-09：prodKind 不在啟用期間內 → 422 VALIDATION_ERROR
 *   TC-F070-10/11：月名單分派鎖 → 409 ASSIGNMENT_RUN_ALREADY_RUNNING
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import {
  ConflictException,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { DataSource } from 'typeorm';
import { CardTypeService } from '../services/card-type.service';
import { ObCardType } from '@/database/entities/ob-card-type.entity';
import { PooldataFieldOption } from '@/database/entities/pooldata-field-option.entity';
import { ObLevelcardVersion } from '@/database/entities/ob-levelcard-version.entity';
import { ObLevelcardColumn } from '@/database/entities/ob-levelcard-column.entity';
import { ObLevelcardScore } from '@/database/entities/ob-levelcard-score.entity';
import { ObLevelcardLevel } from '@/database/entities/ob-levelcard-level.entity';
import { ObTier } from '@/database/entities/ob-tier.entity';
import { ObListDefinition } from '@/database/entities/ob-list-definition.entity';
import { AssignmentRun } from '@/database/entities/assignment-run.entity';
import { AssignmentAuditLog } from '@/database/entities/assignment-audit-log.entity';
import { User } from '@/database/entities/user.entity';

describe('CardTypeService — F070 createCardType', () => {
  let service: CardTypeService;
  let cardTypeRepo: any;
  let optionRepo: any;
  let runRepo: any;
  let userRepo: any;
  let dataSource: any;
  let txEntities: Array<{ kind: string; entity: any }>;

  const actor = { userId: 'sm-uuid', ipAddress: '127.0.0.1' };

  beforeEach(async () => {
    txEntities = [];

    cardTypeRepo = {
      findOne: vi.fn().mockResolvedValue(null),
    };
    // v2.1 重構：預設 prodKind '01' 為 pooldata_field_option active 紀錄
    optionRepo = {
      findOne: vi.fn().mockResolvedValue({
        column_name: 'prod_kind',
        option_value: '01',
        option_label: '汽車',
        is_active: true,
      }),
    };
    runRepo = { findOne: vi.fn().mockResolvedValue(null) };
    userRepo = {
      findOne: vi.fn().mockResolvedValue({ id: 'sm-uuid', name: 'SM' }),
    };

    // mock dataSource.transaction：執行 callback，傳入 entityManager 收集 save 呼叫
    const fakeManager = {
      create: vi.fn((entityClass: any, data: any) => ({ __entity: entityClass.name, ...data })),
      save: vi.fn((entity: any) => {
        txEntities.push({ kind: entity.__entity ?? 'unknown', entity });
        return Promise.resolve(entity);
      }),
      delete: vi.fn().mockResolvedValue({ affected: 1 }),
      find: vi.fn().mockResolvedValue([]),
      remove: vi.fn((entities: any) => Promise.resolve(entities)),
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
        { provide: getRepositoryToken(ObLevelcardVersion), useValue: noop },
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

  it('TC-F070-01 + TC-F070-02 + TC-F070-03：新增成功並同 tx 寫入 ob_card_type + ob_levelcard_version + audit', async () => {
    const result = await service.createCardType(
      { cardType: 'X1', cardName: '測試卡', prodKind: '01' },
      actor,
    );

    expect(dataSource.transaction).toHaveBeenCalledTimes(1);
    expect(result.cardType).toBe('X1');
    expect(result.cardVersion).toBe(1);
    expect(result.prodKindName).toBe('汽車');
    expect(result.status).toBe('active');

    // 同 tx 寫入 3 種 entity
    const kinds = txEntities.map((e) => e.kind).sort();
    expect(kinds).toEqual(['AssignmentAuditLog', 'ObCardType', 'ObLevelcardVersion']);

    // ob_levelcard_version 初值驗證：edate='20991231'、status='active'、card_version=1
    const version = txEntities.find((e) => e.kind === 'ObLevelcardVersion')!.entity;
    expect(version.card_type).toBe('X1');
    expect(version.card_version).toBe(1);
    expect(version.edate).toBe('20991231');
    expect(version.status).toBe('active');
    // sdate 為今日 YYYYMMDD（8 字元）
    expect(version.sdate).toMatch(/^\d{8}$/);
    const today = new Date();
    const expectedSdate = [
      today.getFullYear().toString().padStart(4, '0'),
      (today.getMonth() + 1).toString().padStart(2, '0'),
      today.getDate().toString().padStart(2, '0'),
    ].join('');
    expect(version.sdate).toBe(expectedSdate);

    // audit_log
    const audit = txEntities.find((e) => e.kind === 'AssignmentAuditLog')!.entity;
    expect(audit.action).toBe('CREATE');
    expect(audit.entity_type).toBe('ob_card_type');
    expect(audit.entity_id).toBe('X1');
    expect(audit.actor_id).toBe('sm-uuid');
    expect(audit.before_value).toBeNull();
    expect(audit.after_value).toMatchObject({
      cardType: 'X1',
      cardName: '測試卡',
      prodKind: '01',
      cardVersion: 1,
    });
  });

  it('TC-F070-04：cardType 已存在 → 422 CARD_TYPE_DUPLICATE，未寫入', async () => {
    cardTypeRepo.findOne.mockResolvedValue({
      card_type: 'H',
      card_name: '期中',
      prod_kind: '01',
      status: 'active',
    });

    await expect(
      service.createCardType(
        { cardType: 'H', cardName: '重複', prodKind: '01' },
        actor,
      ),
    ).rejects.toThrow(UnprocessableEntityException);

    expect(dataSource.transaction).not.toHaveBeenCalled();
    expect(txEntities).toHaveLength(0);
  });

  it('TC-F070-04b：CARD_TYPE_DUPLICATE 錯誤碼正確', async () => {
    cardTypeRepo.findOne.mockResolvedValue({ card_type: 'H', status: 'active' } as any);

    try {
      await service.createCardType(
        { cardType: 'H', cardName: '重複', prodKind: '01' },
        actor,
      );
      throw new Error('expected to throw');
    } catch (e: any) {
      expect(e.getResponse?.()?.error).toBe('CARD_TYPE_DUPLICATE');
    }
  });

  it('TC-F070-09 v2.1：prodKind 不在 pooldata_field_option 啟用紀錄 → 422 VALIDATION_ERROR', async () => {
    optionRepo.findOne.mockResolvedValue(null); // 無對應 active option

    await expect(
      service.createCardType(
        { cardType: 'Y1', cardName: '測試', prodKind: '99' },
        actor,
      ),
    ).rejects.toThrow(UnprocessableEntityException);

    expect(dataSource.transaction).not.toHaveBeenCalled();
  });

  it('TC-F070-09b：VALIDATION_ERROR 錯誤碼且 details 含 prodKind', async () => {
    optionRepo.findOne.mockResolvedValue(null);

    try {
      await service.createCardType(
        { cardType: 'Y1', cardName: '測試', prodKind: '99' },
        actor,
      );
      throw new Error('expected to throw');
    } catch (e: any) {
      const r = e.getResponse();
      expect(r.error).toBe('VALIDATION_ERROR');
      expect(r.details?.field).toBe('prodKind');
    }
  });

  it('TC-F070-10：月名單分派 pending → 409 ASSIGNMENT_RUN_ALREADY_RUNNING', async () => {
    runRepo.findOne.mockResolvedValue({ run_id: 'r1', status: 'pending' });

    await expect(
      service.createCardType(
        { cardType: 'N1', cardName: '測試', prodKind: '01' },
        actor,
      ),
    ).rejects.toThrow(ConflictException);

    expect(dataSource.transaction).not.toHaveBeenCalled();
  });

  it('TC-F070-11：月名單分派 running → 409 ASSIGNMENT_RUN_ALREADY_RUNNING（錯誤碼正確）', async () => {
    runRepo.findOne.mockResolvedValue({ run_id: 'r2', status: 'running' });

    try {
      await service.createCardType(
        { cardType: 'N2', cardName: '測試', prodKind: '01' },
        actor,
      );
      throw new Error('expected to throw');
    } catch (e: any) {
      expect(e.getResponse?.()?.error).toBe('ASSIGNMENT_RUN_ALREADY_RUNNING');
    }
  });

  it('TC-F070-17 (rollback 守護)：_afterVersionInsertHook 拋錯時整體 rollback、無 audit 寫入', async () => {
    // 攔截 service 之 hook（test seam）
    (service as any)._afterVersionInsertHook = vi
      .fn()
      .mockRejectedValue(new Error('simulated version insert failure'));

    await expect(
      service.createCardType(
        { cardType: 'X9', cardName: 'Rollback測試', prodKind: '01' },
        actor,
      ),
    ).rejects.toThrow(); // 500 InternalServerErrorException

    // 由於 mock dataSource.transaction 是順序執行，
    // ObCardType + ObLevelcardVersion 會被「save」（mock 不會真實 rollback），
    // 但 AssignmentAuditLog 應未被寫入（hook 在 save audit 之前拋錯）
    const kinds = txEntities.map((e) => e.kind);
    expect(kinds).not.toContain('AssignmentAuditLog');
  });

  it('cardType 唯一性檢查只比對 status=active（OQ：inactive 紀錄不阻擋新增）', async () => {
    cardTypeRepo.findOne.mockResolvedValue(null);
    await service.createCardType(
      { cardType: 'X1', cardName: '測試', prodKind: '01' },
      actor,
    );

    expect(cardTypeRepo.findOne).toHaveBeenCalledWith({
      where: { card_type: 'X1', status: 'active' },
    });
  });
});
