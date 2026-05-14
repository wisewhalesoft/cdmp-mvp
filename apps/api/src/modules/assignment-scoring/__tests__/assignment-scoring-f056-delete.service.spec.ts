/**
 * F056：AssignmentScoringService.deleteTierMapping Unit Tests
 *
 * 對應 spec：docs/specs/features/F056-edit-tier-mapping.md v1.4 §5.4 / AC-6 / AC-7 / BR-11
 *
 *   - TS-F056-D01：正常刪除 (H, A) 標準對應 → 200 + tierRepo.delete + audit
 *   - TS-F056-D02：刪除 fallback (M5, null) → 200，audit entity_id = 'M5|'
 *   - TS-F056-D03：找不到對應紀錄 → 404 TIER_MAPPING_NOT_FOUND
 *   - TS-F056-D04：找不到 fallback (cardLevel=null) 對應紀錄 → 404 TIER_MAPPING_NOT_FOUND
 *   - TS-F056-D05：月跑鎖 → 409 SCORING_VERSION_LOCKED
 *   - TS-F056-D06：audit_log 結構 — action='DELETE'、before_value 含 tierLevel、after_value=null
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import {
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { AssignmentScoringService } from '../assignment-scoring.service';
import { ObLevelcardVersion } from '@/database/entities/ob-levelcard-version.entity';
import { ObLevelcardColumn } from '@/database/entities/ob-levelcard-column.entity';
import { ObLevelcardScore } from '@/database/entities/ob-levelcard-score.entity';
import { ObLevelcardLevel } from '@/database/entities/ob-levelcard-level.entity';
import { ObTier } from '@/database/entities/ob-tier.entity';
import { ObCardType } from '@/database/entities/ob-card-type.entity';
import { ObPoolDataList } from '@/database/entities/ob-pool-data-list.entity';
import { AssignmentRun } from '@/database/entities/assignment-run.entity';
import { AssignmentAuditLog } from '@/database/entities/assignment-audit-log.entity';
import { User } from '@/database/entities/user.entity';

describe('AssignmentScoringService — F056 deleteTierMapping', () => {
  let service: AssignmentScoringService;
  let versionRepo: any;
  let columnRepo: any;
  let scoreRepo: any;
  let levelRepo: any;
  let tierRepo: any;
  let poolDataListRepo: any;
  let runRepo: any;
  let auditRepo: any;
  let userRepo: any;
  let cardTypeRepo: any;

  const actor = { userId: 'sm-uuid', ipAddress: '127.0.0.1' };

  beforeEach(async () => {
    versionRepo = { findOne: vi.fn() };
    columnRepo = { find: vi.fn(), findOne: vi.fn() };
    scoreRepo = { find: vi.fn() };
    levelRepo = { find: vi.fn(), findOne: vi.fn() };
    tierRepo = {
      find: vi.fn().mockResolvedValue([]),
      findOne: vi.fn().mockResolvedValue(null),
      save: vi.fn((e: any) => Promise.resolve(e)),
      create: vi.fn((d: any) => ({ ...d })),
      remove: vi.fn((e: any) => Promise.resolve(e)),
      delete: vi.fn().mockResolvedValue({ affected: 1 }),
    };
    poolDataListRepo = { find: vi.fn().mockResolvedValue([]) };
    runRepo = { findOne: vi.fn().mockResolvedValue(null) };
    auditRepo = {
      create: vi.fn((d: any) => ({ ...d })),
      save: vi.fn((e: any) => Promise.resolve(e)),
    };
    userRepo = {
      findOne: vi.fn().mockResolvedValue({ id: 'sm-uuid', name: 'SM' }),
    };
    // v1.5 cardType 範圍鎖：預設目標 cardType 為 active，使既有 TC 不受影響
    cardTypeRepo = {
      findOne: vi.fn().mockImplementation(({ where }: any) =>
        Promise.resolve({
          card_type: where.card_type,
          card_name: 'mock',
          prod_kind: '01',
          status: 'active',
        }),
      ),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AssignmentScoringService,
        { provide: getRepositoryToken(ObLevelcardVersion), useValue: versionRepo },
        { provide: getRepositoryToken(ObLevelcardColumn), useValue: columnRepo },
        { provide: getRepositoryToken(ObLevelcardScore), useValue: scoreRepo },
        { provide: getRepositoryToken(ObLevelcardLevel), useValue: levelRepo },
        { provide: getRepositoryToken(ObTier), useValue: tierRepo },
        { provide: getRepositoryToken(ObCardType), useValue: cardTypeRepo },
        { provide: getRepositoryToken(ObPoolDataList), useValue: poolDataListRepo },
        { provide: getRepositoryToken(AssignmentRun), useValue: runRepo },
        { provide: getRepositoryToken(AssignmentAuditLog), useValue: auditRepo },
        { provide: getRepositoryToken(User), useValue: userRepo },
      ],
    }).compile();

    service = module.get(AssignmentScoringService);
  });

  // ===== Happy path =====

  it('TS-F056-D01：正常刪除 (H, A) 標準對應 → 200 + audit DELETE', async () => {
    const existing = {
      card_type: 'H',
      card_level: 'A',
      tier_level: 'T1',
      list_nm: '期中名單',
    };
    tierRepo.findOne.mockResolvedValue(existing);

    const result = await service.deleteTierMapping(
      { cardType: 'H', cardLevel: 'A' },
      actor,
    );

    expect(result.cardType).toBe('H');
    expect(result.cardLevel).toBe('A');
    expect(typeof result.deletedAt).toBe('string');

    // 刪除呼叫 — 接受 delete() 或 remove() 任一實作（service 可選）
    const deleteCalled =
      tierRepo.delete.mock.calls.length > 0 ||
      tierRepo.remove.mock.calls.length > 0;
    expect(deleteCalled).toBe(true);
    expect(auditRepo.save).toHaveBeenCalled();
  });

  it('TS-F056-D02：刪除 fallback (M5, null) → 200，audit entity_id = "M5|"', async () => {
    const existing = {
      card_type: 'M5',
      card_level: null,
      tier_level: 'T5M',
      list_nm: '機車中結滿期名單',
    };
    // fallback：cardLevel=null 時 service 內以 find().find(r => r.card_level == null) 模式查
    tierRepo.find.mockResolvedValue([existing]);
    tierRepo.findOne.mockResolvedValue(existing);

    const result = await service.deleteTierMapping(
      { cardType: 'M5', cardLevel: null },
      actor,
    );

    expect(result.cardType).toBe('M5');
    expect(result.cardLevel).toBeNull();
    expect(typeof result.deletedAt).toBe('string');

    const createdLog = auditRepo.create.mock.calls[0][0];
    expect(createdLog.action).toBe('DELETE');
    expect(createdLog.entity_type).toBe('ob_tier');
    expect(createdLog.entity_id).toBe('M5|');
  });

  // ===== 錯誤路徑 =====

  it('TS-F056-D03：找不到對應紀錄 → 404 TIER_MAPPING_NOT_FOUND', async () => {
    tierRepo.find.mockResolvedValue([]);
    tierRepo.findOne.mockResolvedValue(null);

    try {
      await service.deleteTierMapping(
        { cardType: 'X', cardLevel: 'Z' },
        actor,
      );
      throw new Error('should have thrown');
    } catch (e: any) {
      expect(e).toBeInstanceOf(NotFoundException);
      expect(e.getResponse().error).toBe('TIER_MAPPING_NOT_FOUND');
    }
    expect(tierRepo.delete).not.toHaveBeenCalled();
    expect(tierRepo.remove).not.toHaveBeenCalled();
    expect(auditRepo.save).not.toHaveBeenCalled();
  });

  it('TS-F056-D04：找不到 fallback (cardLevel=null) 對應紀錄 → 404 TIER_MAPPING_NOT_FOUND', async () => {
    tierRepo.find.mockResolvedValue([]);
    tierRepo.findOne.mockResolvedValue(null);

    try {
      await service.deleteTierMapping(
        { cardType: 'NONEXIST', cardLevel: null },
        actor,
      );
      throw new Error('should have thrown');
    } catch (e: any) {
      expect(e).toBeInstanceOf(NotFoundException);
      expect(e.getResponse().error).toBe('TIER_MAPPING_NOT_FOUND');
    }
  });

  it('TS-F056-D05：月跑鎖 → 409 SCORING_VERSION_LOCKED', async () => {
    runRepo.findOne.mockResolvedValue({ status: 'pending' });

    try {
      await service.deleteTierMapping(
        { cardType: 'H', cardLevel: 'A' },
        actor,
      );
      throw new Error('should have thrown');
    } catch (e: any) {
      expect(e).toBeInstanceOf(ConflictException);
      expect(e.getResponse().error).toBe('SCORING_VERSION_LOCKED');
    }
    expect(tierRepo.delete).not.toHaveBeenCalled();
    expect(tierRepo.remove).not.toHaveBeenCalled();
  });

  it('TS-F056-D06：audit_log 結構 — action="DELETE"、before_value 含 tierLevel、after_value=null', async () => {
    const existing = {
      card_type: 'H',
      card_level: 'A',
      tier_level: 'T1',
      list_nm: '期中名單',
    };
    tierRepo.findOne.mockResolvedValue(existing);

    await service.deleteTierMapping(
      { cardType: 'H', cardLevel: 'A' },
      actor,
    );

    const createdLog = auditRepo.create.mock.calls[0][0];
    expect(createdLog.action).toBe('DELETE');
    expect(createdLog.entity_type).toBe('ob_tier');
    expect(createdLog.entity_id).toBe('H|A');
    expect(createdLog.before_value).toEqual(
      expect.objectContaining({
        cardType: 'H',
        cardLevel: 'A',
        tierLevel: 'T1',
      }),
    );
    expect(createdLog.after_value).toBeNull();
    expect(createdLog.actor_id).toBe('sm-uuid');
  });
});
