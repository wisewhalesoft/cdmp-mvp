/**
 * F054 v1.3 — match_type 欄位新增 / 驗證 Unit Tests
 *
 * 涵蓋 spec F054 v1.3 AC-7（match_type 欄位）：
 *   - TS-F054-MT-001：createDimension 帶 match_type='RANGE' → ob_levelcard_column 儲存正確值
 *   - TS-F054-MT-002：createDimension 帶 match_type='CATEGORY' → 儲存 'CATEGORY'
 *   - TS-F054-MT-003：createDimension 帶 match_type='COMPOSITE' → 儲存 'COMPOSITE'
 *   - TS-F054-MT-004：createDimension 不帶 match_type → 預設值（需向 tdd-implementation 確認預設為何，暫設 'RANGE'）
 *   - TS-F054-MT-005：updateDimensions 修改 match_type → audit_log before_value 含舊 match_type，after_value 含新值
 *   - TS-F054-MT-006：無效 match_type 值（如 'UNKNOWN'）→ 422 VALIDATION_ERROR
 *   - TS-F054-MT-007：match_type 欄位出現於 GET /scoring response（ob_levelcard_column 的 matchType 欄位）
 *
 * 前置需求（tdd-implementation 請注意）：
 *   - ob_levelcard_column.entity.ts 必須新增 `match_type` Column（varchar(10)）
 *   - migration {timestamp}-add-match-type-to-ob-levelcard-column.ts 必須已執行
 *   - CreateDimensionDto / UpdateDimensionsDto 必須含 matchType 欄位（@IsIn(['RANGE', 'CATEGORY', 'COMPOSITE'])）
 *   - AssignmentScoringService.createDimension / updateDimensions 必須寫入 match_type
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { UnprocessableEntityException } from '@nestjs/common';
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

describe('AssignmentScoringService — F054 v1.3 match_type', () => {
  let service: AssignmentScoringService;
  let columnRepo: any;
  let scoreRepo: any;
  let auditRepo: any;
  let versionRepo: any;
  let runRepo: any;

  const actor = { userId: 'dir-uuid', ipAddress: '127.0.0.1' };

  beforeEach(async () => {
    versionRepo = {
      findOne: vi.fn().mockResolvedValue({
        card_type: 'H',
        card_version: 1,
        status: 'active',
      }),
    };
    columnRepo = {
      find: vi.fn().mockResolvedValue([]),
      findOne: vi.fn().mockResolvedValue(null),
      save: vi.fn((e: any) => Promise.resolve({ ...e, id: 'col-uuid-1' })),
      create: vi.fn((d: any) => ({ ...d })),
    };
    scoreRepo = {
      find: vi.fn().mockResolvedValue([]),
      save: vi.fn((e: any) => Promise.resolve(e)),
      create: vi.fn((d: any) => ({ ...d })),
      delete: vi.fn().mockResolvedValue({ affected: 0 }),
    };
    auditRepo = {
      create: vi.fn((d: any) => ({ ...d })),
      save: vi.fn((e: any) => Promise.resolve(e)),
    };
    runRepo = { findOne: vi.fn().mockResolvedValue(null) };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AssignmentScoringService,
        { provide: getRepositoryToken(ObLevelcardVersion), useValue: versionRepo },
        { provide: getRepositoryToken(ObLevelcardColumn), useValue: columnRepo },
        { provide: getRepositoryToken(ObLevelcardScore), useValue: scoreRepo },
        { provide: getRepositoryToken(ObLevelcardLevel), useValue: { find: vi.fn().mockResolvedValue([]) } },
        { provide: getRepositoryToken(ObTier), useValue: { find: vi.fn(), findOne: vi.fn() } },
        {
          provide: getRepositoryToken(ObCardType),
          useValue: {
            findOne: vi.fn().mockResolvedValue({
              card_type: 'H', card_name: 'H卡', prod_kind: '01', status: 'active',
            }),
          },
        },
        { provide: getRepositoryToken(ObPoolDataList), useValue: { find: vi.fn().mockResolvedValue([]) } },
        { provide: getRepositoryToken(AssignmentRun), useValue: runRepo },
        { provide: getRepositoryToken(AssignmentAuditLog), useValue: auditRepo },
        { provide: getRepositoryToken(User), useValue: { findOne: vi.fn().mockResolvedValue({ id: 'dir-uuid', name: 'Director' }) } },
      ],
    }).compile();

    service = module.get(AssignmentScoringService);
  });

  describe('TS-F054-MT-001：createDimension 帶 match_type=RANGE', () => {
    it('createDimension match_type=RANGE 儲存至 ob_levelcard_column', async () => {
      await service.createDimension(
        {
          cardType: 'H',
          cardVersion: 1,
          columnName: 'MT_TEST_RANGE',
          columnLabel: 'RANGE 測試',
          matchType: 'RANGE' as any,
          scores: [
            { level1: null, level2S: '0', level2E: '10', score: 5 },
          ],
        },
        actor,
      );
      const created = columnRepo.create.mock.calls[0][0];
      expect(created.match_type).toBe('RANGE');
      // save 被呼叫，傳入物件含 match_type='RANGE'
      expect(columnRepo.save).toHaveBeenCalled();
      const saved = columnRepo.save.mock.calls[0][0];
      expect(saved.match_type).toBe('RANGE');
    });
  });

  describe('TS-F054-MT-002：createDimension 帶 match_type=CATEGORY', () => {
    it('createDimension match_type=CATEGORY 儲存至 ob_levelcard_column', async () => {
      await service.createDimension(
        {
          cardType: 'H',
          cardVersion: 1,
          columnName: 'MT_TEST_CAT',
          columnLabel: 'CATEGORY 測試',
          matchType: 'CATEGORY' as any,
          scores: [
            { level1: 'NORTH', level2S: null, level2E: null, score: 10 },
          ],
        },
        actor,
      );
      const created = columnRepo.create.mock.calls[0][0];
      expect(created.match_type).toBe('CATEGORY');
    });
  });

  describe('TS-F054-MT-003：createDimension 帶 match_type=COMPOSITE', () => {
    it('createDimension match_type=COMPOSITE 儲存至 ob_levelcard_column', async () => {
      await service.createDimension(
        {
          cardType: 'H',
          cardVersion: 1,
          columnName: 'MT_TEST_COMP',
          columnLabel: 'COMPOSITE 測試',
          matchType: 'COMPOSITE' as any,
          scores: [
            { level1: 'A', level2S: '0', level2E: '5', score: 50 },
          ],
        },
        actor,
      );
      const created = columnRepo.create.mock.calls[0][0];
      expect(created.match_type).toBe('COMPOSITE');
    });
  });

  describe('TS-F054-MT-004：createDimension 不帶 match_type 使用預設值', () => {
    it('createDimension 缺 matchType → 422 SCORING_INVALID_MATCH_TYPE (BR-8: 必填無預設)', async () => {
      // v1.3 BR-8 規定：matchType **必填且無預設值**，缺值應 422
      await expect(
        service.createDimension(
          {
            cardType: 'H',
            cardVersion: 1,
            columnName: 'MT_TEST_NULL',
            columnLabel: '缺 matchType',
            // matchType 故意省略
            scores: [],
          } as any,
          actor,
        ),
      ).rejects.toMatchObject({
        response: { error: 'SCORING_INVALID_MATCH_TYPE' },
      });
    });
  });

  describe('TS-F054-MT-005：updateDimensions 修改 match_type → audit_log 記錄新舊值', () => {
    it('updateDimensions match_type 變更 → audit_log before/after 含舊新值', async () => {
      columnRepo.findOne.mockResolvedValue({
        card_type: 'H', card_version: 1, column_name: 'MT_CHANGE',
        column_label: 'MT 變更', status: 'active', match_type: 'RANGE',
      });
      scoreRepo.find.mockResolvedValue([
        { card_type: 'H', card_version: 1, column_name: 'MT_CHANGE',
          level1: null, level2_s: '0', level2_e: '10', score: 5 },
      ]);

      const result = await service.updateDimensions(
        {
          cardType: 'H',
          cardVersion: 1,
          dimensions: [{
            columnName: 'MT_CHANGE',
            columnLabel: 'MT 變更',
            matchType: 'CATEGORY' as any,
            scores: [
              { level1: 'NORTH', level2S: null, level2E: null, score: 30 },
            ],
          }],
        },
        actor,
      );

      expect(auditRepo.create).toHaveBeenCalled();
      const log = auditRepo.create.mock.calls[0][0];
      expect(log.before_value).toMatchObject({ matchType: 'RANGE' });
      expect(log.after_value).toMatchObject({ matchType: 'CATEGORY' });
      // matchTypeChanged 清單包含此 column
      expect(result.matchTypeChanged).toContain('MT_CHANGE');
    });
  });

  describe('TS-F054-MT-006：無效 match_type 值 → 422 VALIDATION_ERROR', () => {
    it('matchType=UNKNOWN → 422 SCORING_INVALID_MATCH_TYPE (service 雙重把關)', async () => {
      await expect(
        service.createDimension(
          {
            cardType: 'H', cardVersion: 1,
            columnName: 'MT_BAD', columnLabel: '非法 MT',
            matchType: 'UNKNOWN' as any,
            scores: [],
          },
          actor,
        ),
      ).rejects.toMatchObject({
        response: { error: 'SCORING_INVALID_MATCH_TYPE' },
      });
    });
  });

  describe('TS-F054-MT-007：GET /scoring response 包含 matchType 欄位', () => {
    it.todo(
      // 此案例屬 E2E（HTTP layer + DI）；放在 assignment-scoring.e2e-spec.ts 較適合
      // 本 unit spec 已透過 MT-001 ~ MT-003 驗證 service.createDimension 寫入 match_type
      'GET /scoring 回傳每個 dimension 的 matchType 欄位（E2E 範圍，本層略過）',
    );
  });

  // ============================================================
  // v1.3 AC-9：matchType 與 scores 欄位一致性（field consistency）
  // ============================================================
  describe('v1.3 AC-9：matchType 與 scores 欄位一致性', () => {
    it('CATEGORY 但 level2_s 有值 → 422 SCORING_MATCH_TYPE_FIELD_MISMATCH', async () => {
      await expect(
        service.createDimension(
          {
            cardType: 'H', cardVersion: 1,
            columnName: 'CAT_BAD', columnLabel: '違反一致性',
            matchType: 'CATEGORY' as any,
            scores: [
              { level1: 'A', level2S: '0', level2E: '5', score: 10 },
            ],
          },
          actor,
        ),
      ).rejects.toMatchObject({
        response: { error: 'SCORING_MATCH_TYPE_FIELD_MISMATCH' },
      });
    });

    it('RANGE 但 level1 有值 → 422 SCORING_MATCH_TYPE_FIELD_MISMATCH', async () => {
      await expect(
        service.createDimension(
          {
            cardType: 'H', cardVersion: 1,
            columnName: 'RANGE_BAD', columnLabel: '違反一致性',
            matchType: 'RANGE' as any,
            scores: [
              { level1: 'A', level2S: '0', level2E: '5', score: 10 },
            ],
          },
          actor,
        ),
      ).rejects.toMatchObject({
        response: { error: 'SCORING_MATCH_TYPE_FIELD_MISMATCH' },
      });
    });

    it('COMPOSITE 但 level1=null → 422 SCORING_MATCH_TYPE_FIELD_MISMATCH', async () => {
      await expect(
        service.createDimension(
          {
            cardType: 'H', cardVersion: 1,
            columnName: 'COMP_BAD', columnLabel: '違反一致性',
            matchType: 'COMPOSITE' as any,
            scores: [
              { level1: null, level2S: '0', level2E: '5', score: 10 },
            ],
          },
          actor,
        ),
      ).rejects.toMatchObject({
        response: { error: 'SCORING_MATCH_TYPE_FIELD_MISMATCH' },
      });
    });
  });

  // ============================================================
  // v1.3 BR-9：level1 規一化（'' → null、TRIM）
  // ============================================================
  describe('v1.3 BR-9：level1 規一化', () => {
    it('CATEGORY level1=" A " (前後空白) → TRIM 後寫入 "A"', async () => {
      await service.createDimension(
        {
          cardType: 'H', cardVersion: 1,
          columnName: 'TRIM_TEST', columnLabel: 'TRIM 測試',
          matchType: 'CATEGORY' as any,
          scores: [
            { level1: '  A  ', level2S: null, level2E: null, score: 10 },
          ],
        },
        actor,
      );
      const savedScores = scoreRepo.save.mock.calls.flatMap((c) => c[0]);
      expect(savedScores[0].level1).toBe('A');
    });
  });

  // ============================================================
  // v1.3 AC-6：CATEGORY 同 level1 重複 → 422 SCORING_CATEGORY_DUPLICATE
  // ============================================================
  describe('v1.3 AC-6：CATEGORY / COMPOSITE 重複偵測', () => {
    it('CATEGORY 同 level1 重複 → 422 SCORING_CATEGORY_DUPLICATE', async () => {
      await expect(
        service.createDimension(
          {
            cardType: 'H', cardVersion: 1,
            columnName: 'CAT_DUP', columnLabel: 'CAT dup',
            matchType: 'CATEGORY' as any,
            scores: [
              { level1: 'NORTH', level2S: null, level2E: null, score: 10 },
              { level1: 'NORTH', level2S: null, level2E: null, score: 20 },
            ],
          },
          actor,
        ),
      ).rejects.toMatchObject({
        response: { error: 'SCORING_CATEGORY_DUPLICATE' },
      });
    });

    it('CATEGORY 規一化後 level1=NULL 與 "" 視為等價 → 422 SCORING_CATEGORY_DUPLICATE', async () => {
      // BR-9：'' 規一化為 null；本案兩筆規一化後均為 null
      await expect(
        service.createDimension(
          {
            cardType: 'H', cardVersion: 1,
            columnName: 'CAT_NULL_DUP', columnLabel: 'NULL dup',
            matchType: 'CATEGORY' as any,
            scores: [
              { level1: '', level2S: null, level2E: null, score: 10 },
              { level1: null, level2S: null, level2E: null, score: 20 },
            ],
          },
          actor,
        ),
      ).rejects.toMatchObject({
        // 規一化後變 null/null：CATEGORY 規定 level1 必填，所以先撞 FIELD_MISMATCH
        response: { error: 'SCORING_MATCH_TYPE_FIELD_MISMATCH' },
      });
    });

    it('COMPOSITE 不同 level1 內各自有 RANGE 區間，跨 level1 不算重疊', async () => {
      const result = await service.createDimension(
        {
          cardType: 'H', cardVersion: 1,
          columnName: 'COMP_OK', columnLabel: 'COMP OK',
          matchType: 'COMPOSITE' as any,
          scores: [
            // 兩個 level1 分別 [0,5] 與 [0,5]；不同 level1 → 合法
            { level1: 'A', level2S: '0', level2E: '5', score: 50 },
            { level1: 'B', level2S: '0', level2E: '5', score: 30 },
          ],
        },
        actor,
      );
      expect(result.columnName).toBe('COMP_OK');
    });

    it('COMPOSITE 同 level1 內區間重疊 → 422 SCORING_RANGE_OVERLAP', async () => {
      await expect(
        service.createDimension(
          {
            cardType: 'H', cardVersion: 1,
            columnName: 'COMP_OVERLAP', columnLabel: '同 level1 重疊',
            matchType: 'COMPOSITE' as any,
            scores: [
              { level1: 'A', level2S: '0', level2E: '10', score: 50 },
              { level1: 'A', level2S: '5', level2E: '15', score: 30 },
            ],
          },
          actor,
        ),
      ).rejects.toMatchObject({
        response: { error: 'SCORING_RANGE_OVERLAP' },
      });
    });
  });
});
