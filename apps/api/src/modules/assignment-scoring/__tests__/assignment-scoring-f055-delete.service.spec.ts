/**
 * F055：AssignmentScoringService.deleteCardLevel Unit Tests
 *
 * 對應 spec：docs/specs/features/F055-edit-card-level-thresholds.md v1.3 §5.3 / AC-6 / AC-7 / BR-5 / BR-6
 *
 *   - TS-F055-D01：正常刪除 (H, 1, D) → 200，呼叫 levelRepo.delete + audit DELETE
 *   - TS-F055-D02：cardVersion 必填（hard delete 不限 active 版本，PO 2026-05-14 決議：可清歷史版本）
 *   - TS-F055-D03：找不到複合 PK 紀錄 → 404 CARD_LEVEL_RECORD_NOT_FOUND
 *   - TS-F055-D04：仍被 ob_tier 引用 → 409 CARD_LEVEL_REFERENCED（cascade reference check, BR-6）
 *   - TS-F055-D05：fallback 對應（card_level IS NULL）不阻擋本表 cardLevel 刪除（cascade 僅比對相同 cardLevel）
 *   - TS-F055-D06：月名單分派鎖 → 409 SCORING_VERSION_LOCKED
 *   - TS-F055-D07：audit_log entity_id = '{cardType}|{cardVersion}|{cardLevel}'，before_value 含 scoreS/scoreE，after_value = null
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

describe('AssignmentScoringService — F055 deleteCardLevel', () => {
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

  const actor = { userId: 'sm-uuid', ipAddress: '127.0.0.1' };

  beforeEach(async () => {
    versionRepo = { findOne: vi.fn() };
    columnRepo = { find: vi.fn(), findOne: vi.fn(), save: vi.fn(), create: vi.fn() };
    scoreRepo = { find: vi.fn(), save: vi.fn(), create: vi.fn(), delete: vi.fn() };
    levelRepo = {
      find: vi.fn(),
      findOne: vi.fn(),
      save: vi.fn((e: any) => Promise.resolve(e)),
      delete: vi.fn().mockResolvedValue({ affected: 1 }),
    };
    tierRepo = {
      find: vi.fn().mockResolvedValue([]),
      findOne: vi.fn().mockResolvedValue(null),
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

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AssignmentScoringService,
        { provide: getRepositoryToken(ObLevelcardVersion), useValue: versionRepo },
        { provide: getRepositoryToken(ObLevelcardColumn), useValue: columnRepo },
        { provide: getRepositoryToken(ObLevelcardScore), useValue: scoreRepo },
        { provide: getRepositoryToken(ObLevelcardLevel), useValue: levelRepo },
        { provide: getRepositoryToken(ObTier), useValue: tierRepo },
        // Iter 4 v1.4：F055 cardType 範圍鎖；happy-path TC 預設 cardType active
        { provide: getRepositoryToken(ObCardType), useValue: {
          findOne: vi.fn().mockImplementation(({ where }: any) =>
            Promise.resolve({
              card_type: where.card_type,
              card_name: 'mock',
              prod_kind: '01',
              status: 'active',
            }),
          ),
        } },
        { provide: getRepositoryToken(ObPoolDataList), useValue: poolDataListRepo },
        { provide: getRepositoryToken(AssignmentRun), useValue: runRepo },
        { provide: getRepositoryToken(AssignmentAuditLog), useValue: auditRepo },
        { provide: getRepositoryToken(User), useValue: userRepo },
      ],
    }).compile();

    service = module.get(AssignmentScoringService);
  });

  // ===== Happy path =====

  it('TS-F055-D01：正常刪除 (H, 1, D) → 200 + DELETE + audit', async () => {
    levelRepo.findOne.mockResolvedValue({
      card_type: 'H',
      card_version: 1,
      card_level: 'D',
      score_s: 0,
      score_e: 184,
    });

    const result = await service.deleteCardLevel(
      { cardType: 'H', cardVersion: 1, cardLevel: 'D' },
      actor,
    );

    expect(result.cardType).toBe('H');
    expect(result.cardVersion).toBe(1);
    expect(result.cardLevel).toBe('D');
    expect(typeof result.deletedAt).toBe('string');
    expect(result.deletedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);

    expect(levelRepo.delete).toHaveBeenCalledWith({
      card_type: 'H',
      card_version: 1,
      card_level: 'D',
    });

    expect(auditRepo.save).toHaveBeenCalled();
  });

  it('TS-F055-D02：cardVersion 可為歷史版本（不限 active；PO 2026-05-14）', async () => {
    levelRepo.findOne.mockResolvedValue({
      card_type: 'H',
      card_version: 99,
      card_level: 'D',
      score_s: 0,
      score_e: 184,
    });

    const result = await service.deleteCardLevel(
      { cardType: 'H', cardVersion: 99, cardLevel: 'D' },
      actor,
    );

    expect(result.cardVersion).toBe(99);
    expect(levelRepo.delete).toHaveBeenCalledWith({
      card_type: 'H',
      card_version: 99,
      card_level: 'D',
    });
  });

  // ===== 錯誤路徑 =====

  it('TS-F055-D03：找不到複合 PK 紀錄 → 404 CARD_LEVEL_RECORD_NOT_FOUND', async () => {
    levelRepo.findOne.mockResolvedValue(null);

    try {
      await service.deleteCardLevel(
        { cardType: 'H', cardVersion: 1, cardLevel: 'Z' },
        actor,
      );
      throw new Error('should have thrown');
    } catch (e: any) {
      expect(e).toBeInstanceOf(NotFoundException);
      expect(e.getResponse().error).toBe('CARD_LEVEL_RECORD_NOT_FOUND');
    }
    expect(levelRepo.delete).not.toHaveBeenCalled();
    expect(auditRepo.save).not.toHaveBeenCalled();
  });

  it('TS-F055-D04：仍被 ob_tier 引用 → 409 CARD_LEVEL_REFERENCED (BR-6)', async () => {
    levelRepo.findOne.mockResolvedValue({
      card_type: 'H',
      card_version: 1,
      card_level: 'A',
      score_s: 243,
      score_e: 999,
    });
    tierRepo.find.mockResolvedValue([
      { card_type: 'H', card_level: 'A', tier_level: 'T1', list_nm: null },
    ]);

    try {
      await service.deleteCardLevel(
        { cardType: 'H', cardVersion: 1, cardLevel: 'A' },
        actor,
      );
      throw new Error('should have thrown');
    } catch (e: any) {
      expect(e).toBeInstanceOf(ConflictException);
      expect(e.getResponse().error).toBe('CARD_LEVEL_REFERENCED');
    }
    expect(levelRepo.delete).not.toHaveBeenCalled();
    expect(auditRepo.save).not.toHaveBeenCalled();
  });

  it('TS-F055-D05：fallback (card_level IS NULL) 不算引用，本表 cardLevel 仍可刪除', async () => {
    levelRepo.findOne.mockResolvedValue({
      card_type: 'M5',
      card_version: 1,
      card_level: 'A',
      score_s: 100,
      score_e: 999,
    });
    // ob_tier 中 M5 對應 cardLevel=null（fallback），與本次要刪除的 'A' 不衝突
    tierRepo.find.mockResolvedValue([
      { card_type: 'M5', card_level: null, tier_level: 'T5M', list_nm: null },
    ]);

    await expect(
      service.deleteCardLevel(
        { cardType: 'M5', cardVersion: 1, cardLevel: 'A' },
        actor,
      ),
    ).resolves.toBeDefined();

    expect(levelRepo.delete).toHaveBeenCalled();
  });

  it('TS-F055-D06：月名單分派鎖 → 409 SCORING_VERSION_LOCKED', async () => {
    runRepo.findOne.mockResolvedValue({ status: 'running' });

    try {
      await service.deleteCardLevel(
        { cardType: 'H', cardVersion: 1, cardLevel: 'D' },
        actor,
      );
      throw new Error('should have thrown');
    } catch (e: any) {
      expect(e).toBeInstanceOf(ConflictException);
      expect(e.getResponse().error).toBe('SCORING_VERSION_LOCKED');
    }
    expect(levelRepo.delete).not.toHaveBeenCalled();
  });

  it('TS-F055-D07：audit_log entity_id / before_value / after_value 結構', async () => {
    levelRepo.findOne.mockResolvedValue({
      card_type: 'H',
      card_version: 1,
      card_level: 'D',
      score_s: 0,
      score_e: 184,
    });

    await service.deleteCardLevel(
      { cardType: 'H', cardVersion: 1, cardLevel: 'D' },
      actor,
    );

    const createdLog = auditRepo.create.mock.calls[0][0];
    expect(createdLog.action).toBe('DELETE');
    expect(createdLog.entity_type).toBe('ob_levelcard_level');
    expect(createdLog.entity_id).toBe('H|1|D');
    expect(createdLog.before_value).toEqual(
      expect.objectContaining({ scoreS: 0, scoreE: 184 }),
    );
    expect(createdLog.after_value).toBeNull();
    expect(createdLog.actor_id).toBe('sm-uuid');
  });
});
