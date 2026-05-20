/**
 * F072 / CardTypeService.{getDeletePreview, deleteCardTypeCascade} Unit Tests
 *
 * 對應 spec：docs/specs/features/F072-disable-card-type.md
 * 對應 test-spec：docs/test-specs/features/F072-test.md
 *
 * 涵蓋 TC（unit-level）：
 *   TC-F072-01：delete-preview 回 5 表 cascade count
 *   TC-F072-02：delete-preview 回 listDefinitionsAffected
 *   TC-F072-05：DELETE 級聯 6 步驟 — tier 用 remove(entity)
 *   TC-F072-06：audit_log DELETE 含 cascade 摘要
 *   TC-F072-09/10：缺 confirmCascade → 422 CARD_TYPE_CASCADE_NOT_CONFIRMED
 *   TC-F072-13：cardType 不存在 → 404
 *   TC-F072-14/15：月跑鎖 → 409
 *   TC-F072-19：ob_tier card_level=NULL fallback 列也被刪除（NULL PK delete regression guard）
 *   BE-F072-001：cardType 無下游 → cascade 全 0 但 ob_card_type 仍被刪除
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

interface TxRecord {
  op: 'save' | 'delete' | 'remove';
  entityName: string;
  payload: any;
}

describe('CardTypeService — F072 deletePreview + deleteCardTypeCascade', () => {
  let service: CardTypeService;
  let cardTypeRepo: any;
  let optionRepo: any;
  let versionRepo: any;
  let columnRepo: any;
  let scoreRepo: any;
  let levelRepo: any;
  let tierRepo: any;
  let listDefRepo: any;
  let runRepo: any;
  let userRepo: any;
  let dataSource: any;
  let txOps: TxRecord[];

  const actor = { userId: 'sm-uuid', ipAddress: '127.0.0.1' };

  beforeEach(async () => {
    txOps = [];

    cardTypeRepo = {
      findOne: vi.fn().mockResolvedValue({
        card_type: 'X',
        card_name: '測試卡',
        prod_kind: '01',
        status: 'active',
      }),
    };
    // v2.1 重構：prodKindName 來源 / assertProdKindActive 已遷至 pooldata_field_option
    optionRepo = { findOne: vi.fn(), find: vi.fn() };
    versionRepo = { count: vi.fn().mockResolvedValue(1) };
    columnRepo = { count: vi.fn().mockResolvedValue(3) };
    scoreRepo = { count: vi.fn().mockResolvedValue(6) };
    levelRepo = { count: vi.fn().mockResolvedValue(4) };
    tierRepo = { count: vi.fn().mockResolvedValue(2) };
    listDefRepo = { count: vi.fn().mockResolvedValue(2) };
    runRepo = { findOne: vi.fn().mockResolvedValue(null) };
    userRepo = {
      findOne: vi.fn().mockResolvedValue({ id: 'sm-uuid', name: 'SM' }),
    };

    // mock transaction：收集所有 manager 操作以供斷言
    const fakeManager = {
      find: vi.fn(async (entityClass: any) => {
        // 預設 ob_tier 回兩列（X/A standard + X/null fallback）
        if (entityClass === ObTier) {
          return [
            { card_type: 'X', card_level: 'A', tier_level: 'T1' },
            { card_type: 'X', card_level: null, tier_level: 'T2' },
          ];
        }
        return [];
      }),
      remove: vi.fn(async (entities: any) => {
        txOps.push({ op: 'remove', entityName: 'ObTier', payload: entities });
        return entities;
      }),
      delete: vi.fn(async (entityClass: any, criteria: any) => {
        txOps.push({ op: 'delete', entityName: entityClass.name, payload: criteria });
        return { affected: 1 };
      }),
      create: vi.fn((entityClass: any, data: any) => ({
        __entity: entityClass.name,
        ...data,
      })),
      save: vi.fn(async (entity: any) => {
        txOps.push({ op: 'save', entityName: entity.__entity ?? 'unknown', payload: entity });
        return entity;
      }),
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
        { provide: getRepositoryToken(ObLevelcardColumn), useValue: columnRepo },
        { provide: getRepositoryToken(ObLevelcardScore), useValue: scoreRepo },
        { provide: getRepositoryToken(ObLevelcardLevel), useValue: levelRepo },
        { provide: getRepositoryToken(ObTier), useValue: tierRepo },
        { provide: getRepositoryToken(ObListDefinition), useValue: listDefRepo },
        { provide: getRepositoryToken(AssignmentRun), useValue: runRepo },
        { provide: getRepositoryToken(AssignmentAuditLog), useValue: noop },
        { provide: getRepositoryToken(User), useValue: userRepo },
        { provide: DataSource, useValue: dataSource },
      ],
    }).compile();

    service = module.get(CardTypeService);
  });

  // ===== delete-preview =====

  it('TC-F072-01 + TC-F072-02：delete-preview 回 5 表 count + listDefinitionsAffected', async () => {
    const result = await service.getDeletePreview('X');

    expect(result.cardType).toBe('X');
    expect(result.cascade).toEqual({
      versions: 1,
      columns: 3,
      scores: 6,
      levels: 4,
      tierMappings: 2,
    });
    expect(result.listDefinitionsAffected).toBe(2);
  });

  it('BE-F072-002：delete-preview 不存在的 cardType → 404 CARD_TYPE_NOT_FOUND', async () => {
    cardTypeRepo.findOne.mockResolvedValue(null);

    try {
      await service.getDeletePreview('NOTEXIST');
      throw new Error('expected to throw');
    } catch (e: any) {
      expect(e).toBeInstanceOf(NotFoundException);
      expect(e.getResponse?.()?.error).toBe('CARD_TYPE_NOT_FOUND');
    }
  });

  // ===== DELETE confirmation =====

  it('TC-F072-09：DELETE 不帶 confirmCascade=true → 422 CARD_TYPE_CASCADE_NOT_CONFIRMED', async () => {
    try {
      await service.deleteCardTypeCascade('X', undefined, actor);
      throw new Error('expected to throw');
    } catch (e: any) {
      expect(e).toBeInstanceOf(UnprocessableEntityException);
      expect(e.getResponse?.()?.error).toBe('CARD_TYPE_CASCADE_NOT_CONFIRMED');
    }
    expect(dataSource.transaction).not.toHaveBeenCalled();
  });

  it('TC-F072-10：DELETE confirmCascade=false → 422 CARD_TYPE_CASCADE_NOT_CONFIRMED', async () => {
    try {
      await service.deleteCardTypeCascade('X', false, actor);
      throw new Error('expected to throw');
    } catch (e: any) {
      expect(e.getResponse?.()?.error).toBe('CARD_TYPE_CASCADE_NOT_CONFIRMED');
    }
    expect(dataSource.transaction).not.toHaveBeenCalled();
  });

  // ===== DELETE 月跑鎖 =====

  it('TC-F072-14/15：月跑鎖 → 409 ASSIGNMENT_RUN_ALREADY_RUNNING', async () => {
    runRepo.findOne.mockResolvedValue({ run_id: 'r1', status: 'running' });

    try {
      await service.deleteCardTypeCascade('X', true, actor);
      throw new Error('expected to throw');
    } catch (e: any) {
      expect(e).toBeInstanceOf(ConflictException);
      expect(e.getResponse?.()?.error).toBe('ASSIGNMENT_RUN_ALREADY_RUNNING');
    }
    expect(dataSource.transaction).not.toHaveBeenCalled();
  });

  // ===== DELETE 404 =====

  it('TC-F072-13：cardType 不存在 → 404', async () => {
    cardTypeRepo.findOne.mockResolvedValue(null);

    try {
      await service.deleteCardTypeCascade('NOTEXIST', true, actor);
      throw new Error('expected to throw');
    } catch (e: any) {
      expect(e).toBeInstanceOf(NotFoundException);
      expect(e.getResponse?.()?.error).toBe('CARD_TYPE_NOT_FOUND');
    }
  });

  // ===== DELETE 主流程 =====

  it('TC-F072-05：級聯 6 步驟順序 — ob_tier remove(entity) 在前，最後 audit_log save', async () => {
    const result = await service.deleteCardTypeCascade('X', true, actor);

    expect(result.cardType).toBe('X');
    expect(result.deletedCascade).toEqual({
      versions: 1,
      columns: 3,
      scores: 6,
      levels: 4,
      tierMappings: 2,
    });
    expect(result.listDefinitionsAffected).toBe(2);

    // 順序驗證
    const order = txOps.map((o) => `${o.op}:${o.entityName}`);
    expect(order).toEqual([
      'remove:ObTier', // step 1
      'delete:ObLevelcardScore', // step 2
      'delete:ObLevelcardLevel', // step 3
      'delete:ObLevelcardColumn', // step 4
      'delete:ObLevelcardVersion', // step 5
      'delete:ObCardType', // step 6
      'save:AssignmentAuditLog', // step 7
    ]);
  });

  it('TC-F072-19 (regression guard)：ob_tier card_level=NULL fallback 列使用 manager.remove(entities) 路徑刪除', async () => {
    await service.deleteCardTypeCascade('X', true, actor);

    // 確認 step1 是 remove，且 payload 含 card_level=null 的列
    const tierRemove = txOps.find((o) => o.op === 'remove' && o.entityName === 'ObTier');
    expect(tierRemove).toBeDefined();
    expect(Array.isArray(tierRemove!.payload)).toBe(true);
    const hasFallback = (tierRemove!.payload as any[]).some(
      (r) => r.card_level === null,
    );
    expect(hasFallback).toBe(true);

    // 確認沒有用 manager.delete({card_type:'X'}, ObTier) 路徑（NULL PK delete bug 防護）
    const tierDelete = txOps.find((o) => o.op === 'delete' && o.entityName === 'ObTier');
    expect(tierDelete).toBeUndefined();
  });

  it('TC-F072-06：audit_log DELETE 含 cascade + listDefinitionsAffected 摘要', async () => {
    await service.deleteCardTypeCascade('X', true, actor);

    const auditSave = txOps.find(
      (o) => o.op === 'save' && o.entityName === 'AssignmentAuditLog',
    );
    expect(auditSave).toBeDefined();
    expect(auditSave!.payload.action).toBe('DELETE');
    expect(auditSave!.payload.entity_type).toBe('ob_card_type');
    expect(auditSave!.payload.entity_id).toBe('X');
    expect(auditSave!.payload.after_value).toBeNull();
    expect(auditSave!.payload.before_value).toMatchObject({
      cardType: 'X',
      cardName: '測試卡',
      cascade: {
        versions: 1,
        columns: 3,
        scores: 6,
        levels: 4,
        tierMappings: 2,
      },
      listDefinitionsAffected: 2,
    });
  });

  it('BE-F072-001：cardType 無下游 cascade 全 0，ob_card_type 仍被刪除', async () => {
    versionRepo.count.mockResolvedValue(0);
    columnRepo.count.mockResolvedValue(0);
    scoreRepo.count.mockResolvedValue(0);
    levelRepo.count.mockResolvedValue(0);
    tierRepo.count.mockResolvedValue(0);
    listDefRepo.count.mockResolvedValue(0);

    const result = await service.deleteCardTypeCascade('X', true, actor);

    expect(result.deletedCascade).toEqual({
      versions: 0,
      columns: 0,
      scores: 0,
      levels: 0,
      tierMappings: 0,
    });

    // ob_card_type DELETE 仍被執行
    const cardTypeDelete = txOps.find(
      (o) => o.op === 'delete' && o.entityName === 'ObCardType',
    );
    expect(cardTypeDelete).toBeDefined();
  });
});
