/**
 * F054：AssignmentScoringService.createDimension Unit Tests
 *
 *   - TS-F054-004：新增 CONTRACT_YEARS 2 個區間 → 201；column status=active；score 2 筆
 *   - TS-F054-005：audit_log 記 CREATE / before=null / after.columnName='CONTRACT_YEARS'
 *   - TS-F054-006：column_name 已存在於 active 版本 → 422 SCORING_COLUMN_DUPLICATE
 *   - AC-5：月名單分派鎖 → 409 SCORING_VERSION_LOCKED
 *   - AC-6：body 內 scores 區間重疊 → 422 SCORING_RANGE_OVERLAP
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

describe('AssignmentScoringService — F054 createDimension', () => {
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
      findOne: vi.fn().mockResolvedValue(null),
      save: vi.fn((e: any) => Promise.resolve({ ...e, id: '1' })),
      create: vi.fn((d: any) => ({ ...d })),
    };
    scoreRepo = {
      find: vi.fn(),
      save: vi.fn((e: any) => Promise.resolve(e)),
      create: vi.fn((d: any) => ({ ...d })),
      delete: vi.fn(),
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

  it('TS-F054-004：新增 CONTRACT_YEARS 2 個區間 → column status=active；score 2 筆', async () => {
    const result = await service.createDimension(
      {
        cardType: 'H',
        cardVersion: 1,
        columnName: 'CONTRACT_YEARS',
        columnLabel: '契約年資',
        matchType: 'RANGE' as any,
        scores: [
          { level1: null, level2S: '0', level2E: '5', score: 5 },
          { level1: null, level2S: '6', level2E: '99', score: 15 },
        ],
      },
      actor,
    );

    expect(result.cardType).toBe('H');
    expect(result.columnName).toBe('CONTRACT_YEARS');
    // column 寫入時 status='active'
    const createdColumn = columnRepo.create.mock.calls[0][0];
    expect(createdColumn.status).toBe('active');
    expect(createdColumn.column_name).toBe('CONTRACT_YEARS');
    expect(createdColumn.column_label).toBe('契約年資');
    // score 2 筆
    expect(scoreRepo.save).toHaveBeenCalled();
    const savedScores = scoreRepo.save.mock.calls.flatMap((c) => c[0]);
    expect(savedScores).toHaveLength(2);
  });

  it('TS-F054-005：audit_log 記 CREATE / before=null / after 含 columnName', async () => {
    await service.createDimension(
      {
        cardType: 'H',
        cardVersion: 1,
        columnName: 'CONTRACT_YEARS',
        columnLabel: '契約年資',
        matchType: 'RANGE' as any,
        scores: [{ level1: null, level2S: '0', level2E: '5', score: 5 }],
      },
      actor,
    );

    expect(auditRepo.create).toHaveBeenCalled();
    const log = auditRepo.create.mock.calls[0][0];
    expect(log.action).toBe('CREATE');
    expect(log.entity_type).toBe('ob_levelcard_column');
    expect(log.entity_id).toBe('H|1|CONTRACT_YEARS');
    expect(log.before_value).toBeNull();
    expect(log.after_value).toMatchObject({
      columnName: 'CONTRACT_YEARS',
      columnLabel: '契約年資',
    });
  });

  it('TS-F054-006：column_name 已存在於 active 版本 → 422 SCORING_COLUMN_DUPLICATE', async () => {
    columnRepo.findOne.mockResolvedValue({
      card_type: 'H', card_version: 1, column_name: 'ACCOUNT_AGE',
      column_label: '帳齡', status: 'active',
    });

    await expect(
      service.createDimension(
        {
          cardType: 'H', cardVersion: 1,
          columnName: 'ACCOUNT_AGE', columnLabel: '帳齡',
          matchType: 'RANGE' as any,
          scores: [],
        },
        actor,
      ),
    ).rejects.toBeInstanceOf(UnprocessableEntityException);

    try {
      await service.createDimension(
        {
          cardType: 'H', cardVersion: 1,
          columnName: 'ACCOUNT_AGE', columnLabel: '帳齡',
          matchType: 'RANGE' as any,
          scores: [],
        },
        actor,
      );
    } catch (e: any) {
      expect(e.getResponse().error).toBe('SCORING_COLUMN_DUPLICATE');
    }
    // DB 不應有任何寫入
    expect(columnRepo.save).not.toHaveBeenCalled();
    expect(scoreRepo.save).not.toHaveBeenCalled();
  });

  it('AC-5：月名單分派鎖 → 409 SCORING_VERSION_LOCKED', async () => {
    runRepo.findOne.mockResolvedValue({ run_id: 'r1', status: 'running' });

    await expect(
      service.createDimension(
        {
          cardType: 'H', cardVersion: 1,
          columnName: 'CONTRACT_YEARS', columnLabel: '契約年資',
          matchType: 'RANGE' as any,
          scores: [],
        },
        actor,
      ),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('AC-6：body 內 scores 區間重疊 → 422 SCORING_RANGE_OVERLAP', async () => {
    await expect(
      service.createDimension(
        {
          cardType: 'H', cardVersion: 1,
          columnName: 'CONTRACT_YEARS', columnLabel: '契約年資',
          matchType: 'RANGE' as any,
          scores: [
            { level1: null, level2S: '0', level2E: '10', score: 5 },
            { level1: null, level2S: '5', level2E: '15', score: 10 },
          ],
        },
        actor,
      ),
    ).rejects.toBeInstanceOf(UnprocessableEntityException);
  });

  it('如果 status="inactive" 同名 column 存在，視為可重新建立（duplicate 僅限 active）', async () => {
    // findOne 過濾條件 active='active'，故回 null
    columnRepo.findOne.mockResolvedValue(null);

    const result = await service.createDimension(
      {
        cardType: 'H', cardVersion: 1,
        columnName: 'ACCOUNT_AGE', columnLabel: '帳齡',
        matchType: 'RANGE' as any,
        scores: [],
      },
      actor,
    );

    expect(result.columnName).toBe('ACCOUNT_AGE');
    // findOne 應被 active 過濾
    const findArgs = columnRepo.findOne.mock.calls[0][0];
    expect(findArgs.where).toMatchObject({
      card_type: 'H',
      card_version: 1,
      column_name: 'ACCOUNT_AGE',
      status: 'active',
    });
  });

  // ============================================================
  // F054 v1.3 新增：match_type 欄位 createDimension 驗證
  // ============================================================

  describe('v1.3 — match_type 欄位寫入（createDimension）', () => {
    it.todo(
      // TODO（tdd-implementation）：
      // 詳見 assignment-scoring-f054-match-type.service.spec.ts
      // TS-F054-MT-001：createDimension 帶 matchType=RANGE → column.match_type='RANGE'
      // TS-F054-MT-002：createDimension 帶 matchType=CATEGORY → column.match_type='CATEGORY'
      // TS-F054-MT-003：createDimension 帶 matchType=COMPOSITE → column.match_type='COMPOSITE'
      // TS-F054-MT-004：不帶 matchType → 預設值（與 spec 確認）
      'match_type 欄位寫入 — 詳見 assignment-scoring-f054-match-type.service.spec.ts',
    );
  });

  // ============================================================
  // F061 v1.3 新增：audit_log 含 run_id / card_type / column_name / rule_violated / violated_row_count
  // ============================================================

  describe('v1.3 — audit_log 新增欄位（F061 AC-9）', () => {
    it.todo(
      // TODO（tdd-implementation）：
      // 當 createDimension 產生 audit_log 時，after_value 需含：
      //   - card_type：'H'
      //   - column_name：'CONTRACT_YEARS'
      // 注意：run_id / rule_violated / violated_row_count 為月名單分派計分稽核欄位
      //   屬於 AssignmentRunPipelineService 寫入，非 createDimension 負責
      //   此 describe 標記為 F061 v1.3 協調對齊點
      'audit_log after_value 含 card_type / column_name（F061 v1.3 欄位對齊）',
    );
  });
});
