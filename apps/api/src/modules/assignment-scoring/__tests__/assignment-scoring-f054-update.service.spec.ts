/**
 * F054：AssignmentScoringService.updateDimensions Unit Tests
 *
 * 涵蓋 F054 PUT /dimensions：
 *   - TS-F054-001：覆寫式修改 ACCOUNT_AGE 2 筆分數，updatedScores=2、舊區間被替換、card_version 仍 1
 *   - TS-F054-002：audit_log 記 action='UPDATE'，before_value 含舊 score、after_value 含新 score
 *   - TS-F054-003：類別型（level1）區間修改正常
 *   - TS-F054-013：數值區間 [9,20] 與既有 [0,10] 重疊 → 422 SCORING_RANGE_OVERLAP
 *   - TS-F054-014：相鄰接觸 [11,20] 與既有 [0,10] 合法
 *   - BE-F054-001：scores 空陣列允許（清除該維度區間）
 *   - BE-F054-002：覆寫後 card_version 仍 1
 *   - BE-F054-004：[0,10] 與 [10,20] 在「本次 body 內」算重疊（boundary 同值衝突）
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { ConflictException, UnprocessableEntityException } from '@nestjs/common';
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

describe('AssignmentScoringService — F054 updateDimensions', () => {
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
    columnRepo = {
      find: vi.fn(),
      findOne: vi.fn(),
      save: vi.fn((e: any) => Promise.resolve(e)),
      create: vi.fn((d: any) => ({ ...d })),
    };
    scoreRepo = {
      find: vi.fn(),
      save: vi.fn((e: any) => Promise.resolve(e)),
      create: vi.fn((d: any) => ({ ...d })),
      delete: vi.fn().mockResolvedValue({ affected: 0 }),
    };
    levelRepo = { find: vi.fn() };
    tierRepo = { find: vi.fn(), findOne: vi.fn() };
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
        // Iter 4 v1.2：F054 cardType 範圍鎖；happy-path TC 預設 cardType active
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

  it('TS-F054-001：覆寫式修改 ACCOUNT_AGE 2 筆 → updatedScores=2、card_version 不遞增', async () => {
    columnRepo.findOne.mockResolvedValue({
      card_type: 'H', card_version: 1, column_name: 'ACCOUNT_AGE',
      column_label: '帳齡', status: 'active',
    });
    scoreRepo.find.mockResolvedValue([
      { card_type: 'H', card_version: 1, column_name: 'ACCOUNT_AGE',
        level1: null, level2_s: '0', level2_e: '3', score: 10 },
      { card_type: 'H', card_version: 1, column_name: 'ACCOUNT_AGE',
        level1: null, level2_s: '4', level2_e: '12', score: 20 },
    ]);

    const result = await service.updateDimensions(
      {
        cardType: 'H',
        cardVersion: 1,
        dimensions: [
          {
            columnName: 'ACCOUNT_AGE',
            columnLabel: '帳齡',
            scores: [
              { level1: null, level2S: '0', level2E: '5', score: 15 },
              { level1: null, level2S: '6', level2E: '12', score: 25 },
            ],
          },
        ],
      },
      actor,
    );

    expect(result.cardType).toBe('H');
    expect(result.cardVersion).toBe(1);
    expect(result.updatedDimensions).toBe(1);
    expect(result.updatedScores).toBe(2);

    // 舊區間應該被 delete + 新區間 save
    expect(scoreRepo.delete).toHaveBeenCalled();
    expect(scoreRepo.save).toHaveBeenCalled();
    // card_version 不變（versionRepo.save 不應被呼叫）
    expect(versionRepo.findOne).not.toHaveBeenCalled();
  });

  it('TS-F054-002：audit_log 記 action=UPDATE，before/after 含 scores', async () => {
    columnRepo.findOne.mockResolvedValue({
      card_type: 'H', card_version: 1, column_name: 'ACCOUNT_AGE',
      column_label: '帳齡', status: 'active',
    });
    scoreRepo.find.mockResolvedValue([
      { card_type: 'H', card_version: 1, column_name: 'ACCOUNT_AGE',
        level1: null, level2_s: '0', level2_e: '3', score: 10 },
    ]);

    await service.updateDimensions(
      {
        cardType: 'H',
        cardVersion: 1,
        dimensions: [{
          columnName: 'ACCOUNT_AGE',
          columnLabel: '帳齡',
          scores: [{ level1: null, level2S: '0', level2E: '5', score: 15 }],
        }],
      },
      actor,
    );

    expect(auditRepo.create).toHaveBeenCalled();
    const log = auditRepo.create.mock.calls[0][0];
    expect(log.action).toBe('UPDATE');
    expect(log.entity_type).toBe('ob_levelcard_score');
    expect(log.entity_id).toBe('H|1|ACCOUNT_AGE');
    expect(log.actor_id).toBe('sm-uuid');
    expect(log.before_value).toHaveProperty('scores');
    expect(log.after_value).toHaveProperty('scores');
    expect(log.before_value.scores[0].score).toBe(10);
    expect(log.after_value.scores[0].score).toBe(15);
  });

  it('TS-F054-003：類別型（level1）區間修改正常', async () => {
    columnRepo.findOne.mockResolvedValue({
      card_type: 'H', card_version: 1, column_name: 'CELLULAR',
      column_label: '有無手機', status: 'active',
    });
    scoreRepo.find.mockResolvedValue([
      { card_type: 'H', card_version: 1, column_name: 'CELLULAR',
        level1: 'Y', level2_s: null, level2_e: null, score: 15 },
      { card_type: 'H', card_version: 1, column_name: 'CELLULAR',
        level1: 'N', level2_s: null, level2_e: null, score: 0 },
    ]);

    const result = await service.updateDimensions(
      {
        cardType: 'H',
        cardVersion: 1,
        dimensions: [{
          columnName: 'CELLULAR',
          columnLabel: '有無手機',
          scores: [
            { level1: 'Y', level2S: null, level2E: null, score: 20 },
            { level1: 'N', level2S: null, level2E: null, score: 5 },
          ],
        }],
      },
      actor,
    );

    expect(result.updatedScores).toBe(2);
    // 驗證新 score 區間有 level1 而 level2_s/e 為 null
    const savedScores = scoreRepo.save.mock.calls.flatMap((c) => c[0]);
    expect(savedScores.find((s: any) => s.level1 === 'Y')).toBeTruthy();
    expect(savedScores.find((s: any) => s.level1 === 'Y').level2_s).toBeNull();
  });

  it('TS-F054-013：數值區間重疊（新 body 內 [9,20] 與 [0,10]）→ 422 SCORING_RANGE_OVERLAP', async () => {
    columnRepo.findOne.mockResolvedValue({
      card_type: 'H', card_version: 1, column_name: 'ACCOUNT_AGE',
      column_label: '帳齡', status: 'active',
    });
    scoreRepo.find.mockResolvedValue([]);

    await expect(
      service.updateDimensions(
        {
          cardType: 'H',
          cardVersion: 1,
          dimensions: [{
            columnName: 'ACCOUNT_AGE',
            columnLabel: '帳齡',
            scores: [
              { level1: null, level2S: '0', level2E: '10', score: 10 },
              { level1: null, level2S: '9', level2E: '20', score: 20 },
            ],
          }],
        },
        actor,
      ),
    ).rejects.toBeInstanceOf(UnprocessableEntityException);

    try {
      await service.updateDimensions(
        {
          cardType: 'H', cardVersion: 1,
          dimensions: [{
            columnName: 'ACCOUNT_AGE', columnLabel: '帳齡',
            scores: [
              { level1: null, level2S: '0', level2E: '10', score: 10 },
              { level1: null, level2S: '9', level2E: '20', score: 20 },
            ],
          }],
        },
        actor,
      );
    } catch (e: any) {
      expect(e.getResponse().error).toBe('SCORING_RANGE_OVERLAP');
    }
    // DB 不應有任何寫入
    expect(scoreRepo.save).not.toHaveBeenCalled();
    expect(scoreRepo.delete).not.toHaveBeenCalled();
  });

  it('TS-F054-014：相鄰接觸 [11,20] 與 [0,10] 允許（score_e+1=下一級 score_s）', async () => {
    columnRepo.findOne.mockResolvedValue({
      card_type: 'H', card_version: 1, column_name: 'ACCOUNT_AGE',
      column_label: '帳齡', status: 'active',
    });
    scoreRepo.find.mockResolvedValue([]);

    const result = await service.updateDimensions(
      {
        cardType: 'H', cardVersion: 1,
        dimensions: [{
          columnName: 'ACCOUNT_AGE', columnLabel: '帳齡',
          scores: [
            { level1: null, level2S: '0', level2E: '10', score: 10 },
            { level1: null, level2S: '11', level2E: '20', score: 20 },
          ],
        }],
      },
      actor,
    );
    expect(result.updatedScores).toBe(2);
  });

  it('BE-F054-001：scores 空陣列允許（清除該維度區間）', async () => {
    columnRepo.findOne.mockResolvedValue({
      card_type: 'H', card_version: 1, column_name: 'ACCOUNT_AGE',
      column_label: '帳齡', status: 'active',
    });
    scoreRepo.find.mockResolvedValue([
      { card_type: 'H', card_version: 1, column_name: 'ACCOUNT_AGE',
        level1: null, level2_s: '0', level2_e: '3', score: 10 },
    ]);

    const result = await service.updateDimensions(
      {
        cardType: 'H', cardVersion: 1,
        dimensions: [{ columnName: 'ACCOUNT_AGE', columnLabel: '帳齡', scores: [] }],
      },
      actor,
    );

    expect(result.updatedScores).toBe(0);
    expect(scoreRepo.delete).toHaveBeenCalled();
  });

  it('BE-F054-002：覆寫後 card_version 仍 1（不遞增）', async () => {
    columnRepo.findOne.mockResolvedValue({
      card_type: 'H', card_version: 1, column_name: 'ACCOUNT_AGE',
      column_label: '帳齡', status: 'active',
    });
    scoreRepo.find.mockResolvedValue([]);

    const result = await service.updateDimensions(
      {
        cardType: 'H', cardVersion: 1,
        dimensions: [{ columnName: 'ACCOUNT_AGE', columnLabel: '帳齡',
          scores: [{ level1: null, level2S: '0', level2E: '5', score: 10 }] }],
      },
      actor,
    );

    expect(result.cardVersion).toBe(1);
    // version 表不應該被 save（覆寫式不遞增）
    expect(versionRepo.findOne).not.toHaveBeenCalled();
  });

  it('BE-F054-004：[0,10] 與 [10,20] 邊界同值衝突 → 422', async () => {
    columnRepo.findOne.mockResolvedValue({
      card_type: 'H', card_version: 1, column_name: 'ACCOUNT_AGE',
      column_label: '帳齡', status: 'active',
    });
    scoreRepo.find.mockResolvedValue([]);

    await expect(
      service.updateDimensions(
        {
          cardType: 'H', cardVersion: 1,
          dimensions: [{
            columnName: 'ACCOUNT_AGE', columnLabel: '帳齡',
            scores: [
              { level1: null, level2S: '0', level2E: '10', score: 10 },
              { level1: null, level2S: '10', level2E: '20', score: 20 },
            ],
          }],
        },
        actor,
      ),
    ).rejects.toBeInstanceOf(UnprocessableEntityException);
  });

  it('AC-5：月跑鎖（pending/running）時 → 409 SCORING_VERSION_LOCKED', async () => {
    runRepo.findOne.mockResolvedValue({ run_id: 'r1', status: 'pending' });

    await expect(
      service.updateDimensions(
        {
          cardType: 'H', cardVersion: 1,
          dimensions: [{
            columnName: 'ACCOUNT_AGE', columnLabel: '帳齡',
            scores: [{ level1: null, level2S: '0', level2E: '5', score: 10 }],
          }],
        },
        actor,
      ),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('column_name 不存在 → 404 SCORING_COLUMN_NOT_FOUND', async () => {
    columnRepo.findOne.mockResolvedValue(null);

    try {
      await service.updateDimensions(
        {
          cardType: 'H', cardVersion: 1,
          dimensions: [{
            columnName: 'NOT_EXIST', columnLabel: '不存在',
            scores: [],
          }],
        },
        actor,
      );
      throw new Error('should have thrown');
    } catch (e: any) {
      expect(e.getResponse().error).toBe('SCORING_COLUMN_NOT_FOUND');
    }
  });
});
