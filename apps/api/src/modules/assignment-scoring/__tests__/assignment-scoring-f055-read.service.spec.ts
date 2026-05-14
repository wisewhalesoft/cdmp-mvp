/**
 * F055：AssignmentScoringService — getCardLevels / previewCardLevels Unit Tests
 *
 *   GET /card-levels (§5.1.1)
 *     - TS-F055-001：H 4 級回傳 4 筆，依 score_s 降冪
 *     - TS-F055-002：S5 2 級回傳 2 筆（不硬編碼 4 級）
 *     - cardVersion 未傳 → 取 active 版本
 *     - 無 active 版本 → 404 SCORING_VERSION_NOT_FOUND
 *
 *   GET /card-levels/preview (§5.2)
 *     - TS-F055-013：distribution 加總 = ob_pool_data_list 中 H 型總筆數
 *     - TS-F055-014：URL-encoded levels JSON 正確解析
 *     - BE-F055-003：ob_pool_data_list 為空時 distribution 全零
 *     - levels JSON 解析失敗 → 422 VALIDATION_ERROR
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { NotFoundException, UnprocessableEntityException } from '@nestjs/common';
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

describe('AssignmentScoringService — F055 getCardLevels + previewCardLevels', () => {
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

  beforeEach(async () => {
    versionRepo = { findOne: vi.fn() };
    columnRepo = { find: vi.fn(), findOne: vi.fn() };
    scoreRepo = { find: vi.fn() };
    levelRepo = { find: vi.fn(), findOne: vi.fn(), save: vi.fn() };
    tierRepo = { find: vi.fn() };
    poolDataListRepo = { find: vi.fn().mockResolvedValue([]) };
    runRepo = { findOne: vi.fn().mockResolvedValue(null) };
    auditRepo = { create: vi.fn(), save: vi.fn() };
    userRepo = { findOne: vi.fn() };

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

  // ===== GET /card-levels =====

  it('TS-F055-001：H 4 級回傳 4 筆，依 score_s 降冪', async () => {
    versionRepo.findOne.mockResolvedValue({
      card_type: 'H', card_version: 1, status: 'active',
    });
    levelRepo.find.mockResolvedValue([
      { card_type: 'H', card_version: 1, card_level: 'D', score_s: 0, score_e: 184 },
      { card_type: 'H', card_version: 1, card_level: 'A', score_s: 243, score_e: 999 },
      { card_type: 'H', card_version: 1, card_level: 'C', score_s: 185, score_e: 213 },
      { card_type: 'H', card_version: 1, card_level: 'B', score_s: 214, score_e: 242 },
    ]);

    const result = await service.getCardLevels({ cardType: 'H' });

    expect(result.cardType).toBe('H');
    expect(result.cardVersion).toBe(1);
    expect(result.levels).toHaveLength(4);
    // score_s 降冪：A(243) → B(214) → C(185) → D(0)
    expect(result.levels.map((l: any) => l.cardLevel)).toEqual(['A', 'B', 'C', 'D']);
    expect(result.levels[0]).toMatchObject({ cardLevel: 'A', scoreS: 243, scoreE: 999 });
  });

  it('TS-F055-002：S5 2 級回傳 2 筆（不硬編碼 4 級）', async () => {
    versionRepo.findOne.mockResolvedValue({
      card_type: 'S5', card_version: 1, status: 'active',
    });
    levelRepo.find.mockResolvedValue([
      { card_type: 'S5', card_version: 1, card_level: 'A', score_s: 200, score_e: 999 },
      { card_type: 'S5', card_version: 1, card_level: 'B', score_s: 0, score_e: 199 },
    ]);

    const result = await service.getCardLevels({ cardType: 'S5' });
    expect(result.levels).toHaveLength(2);
    expect(result.levels.map((l: any) => l.cardLevel)).toEqual(['A', 'B']);
  });

  it('cardVersion 未傳 → 取 active 版本（findOne where status=active）', async () => {
    versionRepo.findOne.mockResolvedValue({
      card_type: 'H', card_version: 1, status: 'active',
    });
    levelRepo.find.mockResolvedValue([]);

    await service.getCardLevels({ cardType: 'H' });

    const findArgs = versionRepo.findOne.mock.calls[0][0];
    expect(findArgs.where).toMatchObject({
      card_type: 'H',
      status: 'active',
    });
  });

  it('cardVersion 顯式傳入 → 用該版本查（不必要求 active）', async () => {
    versionRepo.findOne.mockResolvedValue({
      card_type: 'H', card_version: 2, status: 'inactive',
    });
    levelRepo.find.mockResolvedValue([]);

    await service.getCardLevels({ cardType: 'H', cardVersion: 2 });

    const findArgs = versionRepo.findOne.mock.calls[0][0];
    expect(findArgs.where).toMatchObject({
      card_type: 'H',
      card_version: 2,
    });
    // 顯式 cardVersion 時不限定 status
    expect(findArgs.where.status).toBeUndefined();
  });

  it('無 active 版本 → 404 SCORING_VERSION_NOT_FOUND', async () => {
    versionRepo.findOne.mockResolvedValue(null);

    try {
      await service.getCardLevels({ cardType: 'H' });
      throw new Error('should have thrown');
    } catch (e: any) {
      expect(e).toBeInstanceOf(NotFoundException);
      expect(e.getResponse().error).toBe('SCORING_VERSION_NOT_FOUND');
    }
  });

  // ===== GET /card-levels/preview =====

  it('TS-F055-013：preview distribution 加總 = pool_data_list 總筆數（套用新門檻計算）', async () => {
    // 植入 100 筆 H 型 pool_data_list，分數分佈：
    //   A 級 20 筆（score >= 243）、B 級 40 筆（214-242）、
    //   C 級 30 筆（185-213）、D 級 10 筆（0-184）
    const poolRows: any[] = [];
    for (let i = 0; i < 20; i++) poolRows.push({ score: 250 });
    for (let i = 0; i < 40; i++) poolRows.push({ score: 220 });
    for (let i = 0; i < 30; i++) poolRows.push({ score: 200 });
    for (let i = 0; i < 10; i++) poolRows.push({ score: 100 });
    poolDataListRepo.find.mockResolvedValue(poolRows);

    const levels = JSON.stringify([
      { cardLevel: 'A', scoreS: 243, scoreE: 999 },
      { cardLevel: 'B', scoreS: 214, scoreE: 242 },
      { cardLevel: 'C', scoreS: 185, scoreE: 213 },
      { cardLevel: 'D', scoreS: 0, scoreE: 184 },
    ]);

    const result = await service.previewCardLevels({
      cardType: 'H',
      levels,
    });

    expect(result.distribution).toMatchObject({
      A: 20, B: 40, C: 30, D: 10,
    });
    const total = Object.values(result.distribution).reduce(
      (a: number, b: any) => a + b,
      0,
    );
    expect(total).toBe(100);
  });

  it('TS-F055-014：URL-encoded levels 範例字串能正確解析', async () => {
    poolDataListRepo.find.mockResolvedValue([{ score: 250 }, { score: 50 }]);

    // spec 5.2 範例：levels=%5B%7B%22cardLevel%22%3A%22A%22%2C%22scoreS%22%3A243%2C%22scoreE%22%3A999%7D%5D
    const encoded =
      '%5B%7B%22cardLevel%22%3A%22A%22%2C%22scoreS%22%3A243%2C%22scoreE%22%3A999%7D%5D';
    const decoded = decodeURIComponent(encoded);

    const result = await service.previewCardLevels({
      cardType: 'H',
      levels: decoded,
    });
    expect(result.distribution.A).toBe(1); // score=250 命中 A
    // score=50 沒有對應 level（其他 level 未提供），未分類
  });

  it('BE-F055-003：ob_pool_data_list 為空時 distribution 各等級=0', async () => {
    poolDataListRepo.find.mockResolvedValue([]);

    const levels = JSON.stringify([
      { cardLevel: 'A', scoreS: 243, scoreE: 999 },
      { cardLevel: 'B', scoreS: 0, scoreE: 242 },
    ]);

    const result = await service.previewCardLevels({ cardType: 'H', levels });
    expect(result.distribution).toEqual({ A: 0, B: 0 });
  });

  it('levels JSON 解析失敗 → 422 VALIDATION_ERROR', async () => {
    await expect(
      service.previewCardLevels({ cardType: 'H', levels: 'not-a-json' }),
    ).rejects.toBeInstanceOf(UnprocessableEntityException);
  });

  it('preview 月跑鎖不阻擋（純讀取）', async () => {
    runRepo.findOne.mockResolvedValue({ status: 'running' });
    poolDataListRepo.find.mockResolvedValue([]);

    // 預期 200 而非 409
    const result = await service.previewCardLevels({
      cardType: 'H',
      levels: JSON.stringify([{ cardLevel: 'A', scoreS: 0, scoreE: 999 }]),
    });
    expect(result.distribution).toEqual({ A: 0 });
  });
});
