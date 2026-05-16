/**
 * F055 v1.5：AssignmentScoringService.createCardLevel Unit Tests
 *
 * 對應 spec：docs/specs/features/F055-edit-card-level-thresholds.md v1.5 §5.4 / AC-8 ~ AC-8f / BR-1 / BR-7 / BR-8 / BR-9
 *
 *   - TS-F055-C01：happy path → 201 + levelRepo.save + audit CREATE
 *   - TS-F055-C02：cardType 不存在 active → 404 CARD_TYPE_NOT_FOUND
 *   - TS-F055-C03：cardType active 但無 active 計分版本 → 404 SCORING_VERSION_NOT_FOUND
 *   - TS-F055-C04：(cardType, cardVersion, cardLevel) 已存在 → 422 CARD_LEVEL_DUPLICATE
 *   - TS-F055-C05：與既有等級區間重疊（覆蓋 / 部分 / 同邊界）→ 422 SCORING_RANGE_OVERLAP
 *   - TS-F055-C06：允許 gap 場景 → 成功（既有 A=80~999，新增 C=0~50）
 *   - TS-F055-C07：空 levels 新增第一筆 → 成功
 *   - TS-F055-C08：scoreE < scoreS → 422 VALIDATION_ERROR
 *   - TS-F055-C09：月跑 pending/running → 409 SCORING_VERSION_LOCKED
 *   - TS-F055-C10：audit_log entity_id='{cardType}|{cardVersion}|{cardLevel}',
 *                  before_value=null, after_value 含 scoreS/scoreE
 *   - TS-F055-C11：BR-9 regression — DELETE A 後 POST A 應成功（dedup 僅針對當前存活紀錄）
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import {
  ConflictException,
  NotFoundException,
  UnprocessableEntityException,
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

describe('AssignmentScoringService — F055 createCardLevel (v1.5 §5.4)', () => {
  let service: AssignmentScoringService;
  let versionRepo: any;
  let levelRepo: any;
  let runRepo: any;
  let auditRepo: any;

  const actor = { userId: 'sm-uuid', ipAddress: '127.0.0.1' };

  // 預設 active 計分版本（H, 1）
  function setActiveVersion(cardType = 'H', cardVersion = 1) {
    versionRepo.findOne.mockResolvedValue({
      card_type: cardType,
      card_version: cardVersion,
      status: 'active',
    });
  }

  // 既有 levels（依 PK 命中 vs 未命中：用 findOne mockImplementation）
  function setupLevelRepo(existingLevels: Array<{ cardLevel: string; scoreS: number; scoreE: number }>) {
    // findOne：依 where 的 card_level 比對
    levelRepo.findOne.mockImplementation(({ where }: any) => {
      const found = existingLevels.find((l) => l.cardLevel === where.card_level);
      if (!found) return Promise.resolve(null);
      return Promise.resolve({
        card_type: where.card_type,
        card_version: where.card_version,
        card_level: found.cardLevel,
        score_s: found.scoreS,
        score_e: found.scoreE,
      });
    });
    // find：回傳全部 levels（依 where 的 card_type / card_version）
    levelRepo.find.mockImplementation(() =>
      Promise.resolve(
        existingLevels.map((l) => ({
          card_type: 'H',
          card_version: 1,
          card_level: l.cardLevel,
          score_s: l.scoreS,
          score_e: l.scoreE,
        })),
      ),
    );
  }

  beforeEach(async () => {
    versionRepo = { findOne: vi.fn() };
    levelRepo = {
      find: vi.fn().mockResolvedValue([]),
      findOne: vi.fn().mockResolvedValue(null),
      save: vi.fn((e: any) => Promise.resolve(e)),
      create: vi.fn((d: any) => ({ ...d })),
      delete: vi.fn().mockResolvedValue({ affected: 1 }),
    };
    runRepo = { findOne: vi.fn().mockResolvedValue(null) };
    auditRepo = {
      create: vi.fn((d: any) => ({ ...d })),
      save: vi.fn((e: any) => Promise.resolve(e)),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AssignmentScoringService,
        { provide: getRepositoryToken(ObLevelcardVersion), useValue: versionRepo },
        { provide: getRepositoryToken(ObLevelcardColumn), useValue: { find: vi.fn(), findOne: vi.fn(), save: vi.fn(), create: vi.fn() } },
        { provide: getRepositoryToken(ObLevelcardScore), useValue: { find: vi.fn(), save: vi.fn(), create: vi.fn(), delete: vi.fn() } },
        { provide: getRepositoryToken(ObLevelcardLevel), useValue: levelRepo },
        { provide: getRepositoryToken(ObTier), useValue: { find: vi.fn().mockResolvedValue([]), findOne: vi.fn() } },
        {
          provide: getRepositoryToken(ObCardType),
          useValue: {
            findOne: vi.fn().mockImplementation(({ where }: any) =>
              Promise.resolve(
                where.card_type === 'NOTEX'
                  ? null
                  : {
                      card_type: where.card_type,
                      card_name: 'mock',
                      prod_kind: '01',
                      status: 'active',
                    },
              ),
            ),
          },
        },
        { provide: getRepositoryToken(ObPoolDataList), useValue: { find: vi.fn().mockResolvedValue([]) } },
        { provide: getRepositoryToken(AssignmentRun), useValue: runRepo },
        { provide: getRepositoryToken(AssignmentAuditLog), useValue: auditRepo },
        {
          provide: getRepositoryToken(User),
          useValue: { findOne: vi.fn().mockResolvedValue({ id: 'sm-uuid', name: 'SM' }) },
        },
      ],
    }).compile();

    service = module.get(AssignmentScoringService);
  });

  // ===== Happy path =====

  it('TS-F055-C01：happy path → 201 + levelRepo.save + audit CREATE', async () => {
    setActiveVersion('H', 1);
    setupLevelRepo([
      { cardLevel: 'A', scoreS: 80, scoreE: 999 },
    ]);

    const result = await service.createCardLevel(
      { cardType: 'H', cardLevel: 'B', scoreS: 0, scoreE: 50 },
      actor,
    );

    expect(result).toMatchObject({
      cardType: 'H',
      cardVersion: 1,
      cardLevel: 'B',
      scoreS: 0,
      scoreE: 50,
    });
    expect(typeof result.createdAt).toBe('string');
    expect(result.createdAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);

    // levelRepo.save 被呼叫且帶有新 row
    expect(levelRepo.save).toHaveBeenCalled();
    const savedArg = levelRepo.save.mock.calls[0][0];
    expect(savedArg).toMatchObject({
      card_type: 'H',
      card_version: 1,
      card_level: 'B',
      score_s: 0,
      score_e: 50,
    });

    // audit
    expect(auditRepo.save).toHaveBeenCalled();
    const auditCreated = auditRepo.create.mock.calls[0][0];
    expect(auditCreated.action).toBe('CREATE');
    expect(auditCreated.entity_type).toBe('ob_levelcard_level');
    expect(auditCreated.entity_id).toBe('H|1|B');
  });

  // ===== 錯誤路徑 =====

  it('TS-F055-C02：cardType 不存在 active → 404 CARD_TYPE_NOT_FOUND', async () => {
    setActiveVersion('H', 1); // 不影響——CARD_TYPE 範圍鎖在最前
    try {
      await service.createCardLevel(
        { cardType: 'NOTEX', cardLevel: 'A', scoreS: 0, scoreE: 99 },
        actor,
      );
      throw new Error('should have thrown');
    } catch (e: any) {
      expect(e).toBeInstanceOf(NotFoundException);
      expect(e.getResponse().error).toBe('CARD_TYPE_NOT_FOUND');
    }
    expect(levelRepo.save).not.toHaveBeenCalled();
    expect(auditRepo.save).not.toHaveBeenCalled();
  });

  it('TS-F055-C03：cardType active 但無 active 計分版本 → 404 SCORING_VERSION_NOT_FOUND', async () => {
    versionRepo.findOne.mockResolvedValue(null); // 無 active 版本

    try {
      await service.createCardLevel(
        { cardType: 'H', cardLevel: 'A', scoreS: 0, scoreE: 99 },
        actor,
      );
      throw new Error('should have thrown');
    } catch (e: any) {
      expect(e).toBeInstanceOf(NotFoundException);
      expect(e.getResponse().error).toBe('SCORING_VERSION_NOT_FOUND');
    }
    expect(levelRepo.save).not.toHaveBeenCalled();
  });

  it('TS-F055-C04：(cardType, cardVersion, cardLevel) 已存在 → 422 CARD_LEVEL_DUPLICATE', async () => {
    setActiveVersion('H', 1);
    setupLevelRepo([{ cardLevel: 'A', scoreS: 80, scoreE: 999 }]);

    try {
      await service.createCardLevel(
        { cardType: 'H', cardLevel: 'A', scoreS: 0, scoreE: 50 },
        actor,
      );
      throw new Error('should have thrown');
    } catch (e: any) {
      expect(e).toBeInstanceOf(UnprocessableEntityException);
      expect(e.getResponse().error).toBe('CARD_LEVEL_DUPLICATE');
    }
    expect(levelRepo.save).not.toHaveBeenCalled();
    expect(auditRepo.save).not.toHaveBeenCalled();
  });

  // ===== 區間重疊（AC-8b / BR-1 v1.5） =====

  it('TS-F055-C05a：完全覆蓋既有區間 → 422 SCORING_RANGE_OVERLAP', async () => {
    setActiveVersion('H', 1);
    setupLevelRepo([{ cardLevel: 'A', scoreS: 80, scoreE: 999 }]);

    try {
      await service.createCardLevel(
        { cardType: 'H', cardLevel: 'B', scoreS: 0, scoreE: 999 },
        actor,
      );
      throw new Error('should have thrown');
    } catch (e: any) {
      expect(e).toBeInstanceOf(UnprocessableEntityException);
      expect(e.getResponse().error).toBe('SCORING_RANGE_OVERLAP');
    }
    expect(levelRepo.save).not.toHaveBeenCalled();
  });

  it('TS-F055-C05b：部分重疊（spec 範例 A=80~999, 新 B=85~120）→ 422', async () => {
    setActiveVersion('H', 1);
    setupLevelRepo([{ cardLevel: 'A', scoreS: 80, scoreE: 999 }]);

    try {
      await service.createCardLevel(
        { cardType: 'H', cardLevel: 'B', scoreS: 85, scoreE: 120 },
        actor,
      );
      throw new Error('should have thrown');
    } catch (e: any) {
      expect(e).toBeInstanceOf(UnprocessableEntityException);
      expect(e.getResponse().error).toBe('SCORING_RANGE_OVERLAP');
    }
  });

  it('TS-F055-C05c：邊界共享（A=80~999，新 B=70~80）→ 422', async () => {
    setActiveVersion('H', 1);
    setupLevelRepo([{ cardLevel: 'A', scoreS: 80, scoreE: 999 }]);

    try {
      await service.createCardLevel(
        { cardType: 'H', cardLevel: 'B', scoreS: 70, scoreE: 80 },
        actor,
      );
      throw new Error('should have thrown');
    } catch (e: any) {
      expect(e).toBeInstanceOf(UnprocessableEntityException);
      expect(e.getResponse().error).toBe('SCORING_RANGE_OVERLAP');
    }
  });

  // ===== 允許 gap（AC-8b BR-1 v1.5） =====

  it('TS-F055-C06：允許 gap（A=80~999，新 C=0~50，gap 51~79）→ 成功', async () => {
    setActiveVersion('H', 1);
    setupLevelRepo([{ cardLevel: 'A', scoreS: 80, scoreE: 999 }]);

    const result = await service.createCardLevel(
      { cardType: 'H', cardLevel: 'C', scoreS: 0, scoreE: 50 },
      actor,
    );
    expect(result.cardLevel).toBe('C');
    expect(levelRepo.save).toHaveBeenCalled();
  });

  // ===== 空 levels 新增第一筆（AC-8a） =====

  it('TS-F055-C07：空 levels 新增第一筆 → 成功', async () => {
    setActiveVersion('H', 1);
    setupLevelRepo([]); // 空

    const result = await service.createCardLevel(
      { cardType: 'H', cardLevel: 'A', scoreS: 0, scoreE: 999 },
      actor,
    );
    expect(result.cardLevel).toBe('A');
    expect(result.scoreS).toBe(0);
    expect(result.scoreE).toBe(999);
    expect(levelRepo.save).toHaveBeenCalled();
  });

  // ===== scoreE < scoreS 業務驗證 =====

  it('TS-F055-C08：scoreE < scoreS → 422 VALIDATION_ERROR', async () => {
    setActiveVersion('H', 1);

    try {
      await service.createCardLevel(
        { cardType: 'H', cardLevel: 'A', scoreS: 100, scoreE: 50 },
        actor,
      );
      throw new Error('should have thrown');
    } catch (e: any) {
      expect(e).toBeInstanceOf(UnprocessableEntityException);
      expect(e.getResponse().error).toBe('VALIDATION_ERROR');
    }
    expect(levelRepo.save).not.toHaveBeenCalled();
  });

  // ===== 月跑鎖（AC-8e / BR-3） =====

  it('TS-F055-C09a：月跑 pending → 409 SCORING_VERSION_LOCKED', async () => {
    runRepo.findOne.mockResolvedValue({ status: 'pending' });
    setActiveVersion('H', 1);

    try {
      await service.createCardLevel(
        { cardType: 'H', cardLevel: 'A', scoreS: 0, scoreE: 99 },
        actor,
      );
      throw new Error('should have thrown');
    } catch (e: any) {
      expect(e).toBeInstanceOf(ConflictException);
      expect(e.getResponse().error).toBe('SCORING_VERSION_LOCKED');
    }
    expect(levelRepo.save).not.toHaveBeenCalled();
  });

  it('TS-F055-C09b：月跑 running → 409 SCORING_VERSION_LOCKED', async () => {
    runRepo.findOne.mockResolvedValue({ status: 'running' });
    setActiveVersion('H', 1);

    try {
      await service.createCardLevel(
        { cardType: 'H', cardLevel: 'A', scoreS: 0, scoreE: 99 },
        actor,
      );
      throw new Error('should have thrown');
    } catch (e: any) {
      expect(e).toBeInstanceOf(ConflictException);
      expect(e.getResponse().error).toBe('SCORING_VERSION_LOCKED');
    }
  });

  // ===== Audit log 結構 =====

  it('TS-F055-C10：audit_log entity_id / before_value=null / after_value 結構', async () => {
    setActiveVersion('H', 1);
    setupLevelRepo([]);

    await service.createCardLevel(
      { cardType: 'H', cardLevel: 'E', scoreS: 0, scoreE: 49 },
      actor,
    );

    const createdLog = auditRepo.create.mock.calls[0][0];
    expect(createdLog.action).toBe('CREATE');
    expect(createdLog.entity_type).toBe('ob_levelcard_level');
    expect(createdLog.entity_id).toBe('H|1|E');
    expect(createdLog.before_value).toBeNull();
    expect(createdLog.after_value).toEqual(
      expect.objectContaining({
        cardLevel: 'E',
        scoreS: 0,
        scoreE: 49,
      }),
    );
    expect(createdLog.actor_id).toBe('sm-uuid');
  });

  // ===== BR-9 regression：hard delete 後可重新新增 =====

  it('TS-F055-C11：DELETE A 後 POST A 應成功（BR-9 — dedup 僅針對當前存活紀錄）', async () => {
    setActiveVersion('H', 1);
    // 模擬：A 曾經存在但已被 hard delete → 當前不存在
    setupLevelRepo([]);

    const result = await service.createCardLevel(
      { cardType: 'H', cardLevel: 'A', scoreS: 0, scoreE: 999 },
      actor,
    );
    expect(result.cardLevel).toBe('A');
    expect(levelRepo.save).toHaveBeenCalled();
  });
});
