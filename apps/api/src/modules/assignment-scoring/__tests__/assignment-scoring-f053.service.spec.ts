/**
 * F053：AssignmentScoringService — GET /scoring (getScoring) Unit Tests
 *
 * 採 mocked repositories，涵蓋 F053 test-spec：
 *
 *   - TS-F053-001  cardType=H 升冪排列
 *   - TS-F053-003  version 資訊（有值）正確映射
 *   - TS-F053-004  createdBy / createdAt 為 null 時鍵存在，值為 null
 *   - TS-F053-005  scores 數值型欄位映射正確
 *   - TS-F053-006  scores 類別型（level1）映射正確
 *   - TS-F053-002  無 active 版本 → 404 SCORING_VERSION_NOT_FOUND
 *   - BE-F053-001  status='inactive' 的 column 不會出現在 dimensions
 *   - BE-F053-002  dimensions 中 scores 為空時，scoreSummary='0 個區間'
 *   - scoreSummary 格式 `{N} 個區間`
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { NotFoundException } from '@nestjs/common';
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

describe('AssignmentScoringService — F053 getScoring', () => {
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
    versionRepo = { findOne: vi.fn(), find: vi.fn() };
    columnRepo = { find: vi.fn(), findOne: vi.fn(), save: vi.fn(), create: vi.fn() };
    scoreRepo = { find: vi.fn(), save: vi.fn(), create: vi.fn(), delete: vi.fn() };
    levelRepo = { find: vi.fn(), save: vi.fn(), create: vi.fn() };
    tierRepo = { find: vi.fn(), findOne: vi.fn(), save: vi.fn(), create: vi.fn() };
    poolDataListRepo = { find: vi.fn().mockResolvedValue([]) };
    runRepo = { findOne: vi.fn().mockResolvedValue(null) };
    auditRepo = { create: vi.fn((d) => ({ ...d })), save: vi.fn((e) => Promise.resolve(e)) };
    userRepo = { findOne: vi.fn().mockResolvedValue({ id: 'u1', name: 'Tester' }) };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AssignmentScoringService,
        { provide: getRepositoryToken(ObLevelcardVersion), useValue: versionRepo },
        { provide: getRepositoryToken(ObLevelcardColumn), useValue: columnRepo },
        { provide: getRepositoryToken(ObLevelcardScore), useValue: scoreRepo },
        { provide: getRepositoryToken(ObLevelcardLevel), useValue: levelRepo },
        { provide: getRepositoryToken(ObTier), useValue: tierRepo },
        // Iter 4 v1.2：F053 cardType 範圍鎖；既有 happy-path TC 預設 cardType active
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

  it('TS-F053-001：cardType=H 時 dimensions 依 column_name 升冪', async () => {
    versionRepo.findOne.mockResolvedValue({
      card_type: 'H',
      card_name: '期中',
      card_version: 1,
      sdate: '20190823',
      edate: '20991231',
      status: 'active',
      created_by: '21251',
      created_at: new Date('2019-08-23T00:00:00Z'),
    });
    columnRepo.find.mockResolvedValue([
      { card_type: 'H', card_version: 1, column_name: 'CELLULAR', column_label: '有無手機', status: 'active' },
      { card_type: 'H', card_version: 1, column_name: 'ACCOUNT_AGE', column_label: '帳齡', status: 'active' },
      { card_type: 'H', card_version: 1, column_name: 'CAREA_NO1', column_label: '戶籍縣市', status: 'active' },
    ]);
    scoreRepo.find.mockResolvedValue([]);

    const result = await service.getScoring({ cardType: 'H' });

    expect(result.dimensions).toHaveLength(3);
    expect(result.dimensions[0].columnName).toBe('ACCOUNT_AGE');
    expect(result.dimensions[1].columnName).toBe('CAREA_NO1');
    expect(result.dimensions[2].columnName).toBe('CELLULAR');
  });

  it('TS-F053-003：version 欄位映射為 camelCase 並含 cardVersion/sdate/edate', async () => {
    versionRepo.findOne.mockResolvedValue({
      card_type: 'H',
      card_name: '期中',
      card_version: 1,
      sdate: '20190823',
      edate: '20991231',
      status: 'active',
      created_by: '21251',
      created_at: new Date('2019-08-23T00:00:00Z'),
    });
    columnRepo.find.mockResolvedValue([]);
    scoreRepo.find.mockResolvedValue([]);

    const result = await service.getScoring({ cardType: 'H' });

    expect(result.version).toMatchObject({
      cardType: 'H',
      cardName: '期中',
      cardVersion: 1,
      sdate: '20190823',
      edate: '20991231',
      createdBy: '21251',
    });
    expect(result.version.createdAt).toBe('2019-08-23T00:00:00.000Z');
  });

  it('TS-F053-004：createdBy/createdAt 為 null 時鍵存在且值為 null（非省略）', async () => {
    versionRepo.findOne.mockResolvedValue({
      card_type: 'S',
      card_name: '中結',
      card_version: 1,
      sdate: '20190823',
      edate: '20991231',
      status: 'active',
      created_by: null,
      created_at: null,
    });
    columnRepo.find.mockResolvedValue([]);
    scoreRepo.find.mockResolvedValue([]);

    const result = await service.getScoring({ cardType: 'S' });

    expect(result.version).toHaveProperty('createdBy', null);
    expect(result.version).toHaveProperty('createdAt', null);
  });

  it('TS-F053-005：scores 為數值型，level1=null、level2S/E/score 正確', async () => {
    versionRepo.findOne.mockResolvedValue({
      card_type: 'H', card_name: '期中', card_version: 1,
      sdate: '20190823', edate: '20991231', status: 'active',
      created_by: null, created_at: null,
    });
    columnRepo.find.mockResolvedValue([
      { card_type: 'H', card_version: 1, column_name: 'ACCOUNT_AGE', column_label: '帳齡', status: 'active' },
    ]);
    scoreRepo.find.mockResolvedValue([
      { card_type: 'H', card_version: 1, column_name: 'ACCOUNT_AGE', level1: null, level2_s: '0', level2_e: '3', score: 10 },
      { card_type: 'H', card_version: 1, column_name: 'ACCOUNT_AGE', level1: null, level2_s: '4', level2_e: '12', score: 20 },
    ]);

    const result = await service.getScoring({ cardType: 'H' });

    expect(result.dimensions[0].scores).toHaveLength(2);
    expect(result.dimensions[0].scores[0]).toEqual({
      level1: null, level2S: '0', level2E: '3', score: 10,
    });
    expect(result.dimensions[0].scores[1].score).toBe(20);
    expect(result.dimensions[0].scoreSummary).toBe('2 個區間');
  });

  it('TS-F053-006：scores 為類別型（level1 有值，level2_s/e 為 null）正確映射', async () => {
    versionRepo.findOne.mockResolvedValue({
      card_type: 'H', card_name: '期中', card_version: 1,
      sdate: '20190823', edate: '20991231', status: 'active',
      created_by: null, created_at: null,
    });
    columnRepo.find.mockResolvedValue([
      { card_type: 'H', card_version: 1, column_name: 'CELLULAR', column_label: '有無手機', status: 'active' },
    ]);
    scoreRepo.find.mockResolvedValue([
      { card_type: 'H', card_version: 1, column_name: 'CELLULAR', level1: 'Y', level2_s: null, level2_e: null, score: 15 },
      { card_type: 'H', card_version: 1, column_name: 'CELLULAR', level1: 'N', level2_s: null, level2_e: null, score: 0 },
    ]);

    const result = await service.getScoring({ cardType: 'H' });

    expect(result.dimensions[0].scores[0]).toMatchObject({
      level1: 'Y', level2S: null, level2E: null, score: 15,
    });
  });

  it('TS-F053-002：無 active 版本 → 404 SCORING_VERSION_NOT_FOUND', async () => {
    versionRepo.findOne.mockResolvedValue(null);

    await expect(service.getScoring({ cardType: 'H' })).rejects.toBeInstanceOf(
      NotFoundException,
    );
    try {
      await service.getScoring({ cardType: 'H' });
    } catch (e: any) {
      expect(e.getResponse()).toMatchObject({
        error: 'SCORING_VERSION_NOT_FOUND',
      });
    }
  });

  it("BE-F053-001：dimensions 不應包含 status='inactive' 的維度", async () => {
    versionRepo.findOne.mockResolvedValue({
      card_type: 'H', card_name: '期中', card_version: 1,
      sdate: '20190823', edate: '20991231', status: 'active',
      created_by: null, created_at: null,
    });
    // service 應該以 status='active' 過濾呼叫 columnRepo.find
    columnRepo.find.mockResolvedValue([
      { card_type: 'H', card_version: 1, column_name: 'ACCOUNT_AGE', column_label: '帳齡', status: 'active' },
    ]);
    scoreRepo.find.mockResolvedValue([]);

    const result = await service.getScoring({ cardType: 'H' });

    expect(result.dimensions).toHaveLength(1);
    // 驗證 columnRepo.find 呼叫時帶 status='active' 過濾
    const findArgs = columnRepo.find.mock.calls[0][0];
    expect(findArgs.where).toMatchObject({
      card_type: 'H',
      status: 'active',
    });
  });

  it("BE-F053-002：dimensions 中 scores 為空時，scoreSummary='0 個區間'", async () => {
    versionRepo.findOne.mockResolvedValue({
      card_type: 'H', card_name: '期中', card_version: 1,
      sdate: '20190823', edate: '20991231', status: 'active',
      created_by: null, created_at: null,
    });
    columnRepo.find.mockResolvedValue([
      { card_type: 'H', card_version: 1, column_name: 'EMPTY_DIM', column_label: '空', status: 'active' },
    ]);
    scoreRepo.find.mockResolvedValue([]);

    const result = await service.getScoring({ cardType: 'H' });

    expect(result.dimensions[0].scores).toEqual([]);
    expect(result.dimensions[0].scoreSummary).toBe('0 個區間');
  });
});
