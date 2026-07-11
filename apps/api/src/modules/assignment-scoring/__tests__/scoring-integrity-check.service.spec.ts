/**
 * F061 v1.3 — ScoringIntegrityCheckService Unit Tests
 *
 * 涵蓋計分前完整性稽核（spec BR-13 / AC-7c）：
 *   - TS-F061-INT-001：所有維度均有 match_type + scores → 稽核通過
 *   - TS-F061-INT-002：MISSING_MATCH_TYPE 偵測（防護網）
 *   - TS-F061-INT-003：ALL_SCORES_EMPTY 偵測
 *   - TS-F061-INT-004：COMPOSITE 缺基線（level1=null 不存在）警告
 *   - TS-F061-INT-005：稽核服務不觸發 fn_calc_tier_level（純資料表掃描）
 *   - TS-F061-INT-006：稽核失敗時不拋 exception（spec BR-13：不阻擋月名單分派）
 *   - TS-F061-INT-007：每維度每 rule_violated 寫一筆彙總 audit log（不寫 appl_no 明細）
 *
 * 設計決策：
 *   - 透過 ScoringIntegrityCheckService 與 fn_calc_tier_level 解耦
 *   - 每維度寫彙總列；多個 issue 共享同 audit_log batch
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { ObLevelcardColumn } from '@/database/entities/ob-levelcard-column.entity';
import { ObLevelcardScore } from '@/database/entities/ob-levelcard-score.entity';
import { AssignmentAuditLog } from '@/database/entities/assignment-audit-log.entity';
import { ScoringIntegrityCheckService } from '../services/scoring-integrity-check.service';

describe('ScoringIntegrityCheckService — F061 v1.3 計分完整性稽核', () => {
  let service: ScoringIntegrityCheckService;
  let columnRepo: any;
  let scoreRepo: any;
  let auditRepo: any;

  beforeEach(async () => {
    columnRepo = {
      find: vi.fn(),
    };
    scoreRepo = {
      find: vi.fn(),
    };
    auditRepo = {
      create: vi.fn((d: any) => ({ ...d })),
      save: vi.fn((e: any) => Promise.resolve(e)),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ScoringIntegrityCheckService,
        { provide: getRepositoryToken(ObLevelcardColumn), useValue: columnRepo },
        { provide: getRepositoryToken(ObLevelcardScore), useValue: scoreRepo },
        { provide: getRepositoryToken(AssignmentAuditLog), useValue: auditRepo },
      ],
    }).compile();
    service = module.get(ScoringIntegrityCheckService);
  });

  describe('TS-F061-INT-001：所有維度均有 match_type → 稽核通過', () => {
    it('所有維度有 match_type 與 scores → ok=true, issues=[]', async () => {
      columnRepo.find.mockResolvedValue([
        { card_type: 'H', card_version: 1, column_name: 'ACCOUNT_AGE',
          status: 'active', match_type: 'RANGE' },
        { card_type: 'H', card_version: 1, column_name: 'CELLULAR',
          status: 'active', match_type: 'CATEGORY' },
      ]);
      scoreRepo.find.mockResolvedValue([
        { column_name: 'ACCOUNT_AGE', level1: null, level2_s: '0', level2_e: '10', score: 10 },
        { column_name: 'CELLULAR', level1: 'Y', level2_s: null, level2_e: null, score: 5 },
      ]);

      const result = await service.checkIntegrity('H', 1);
      expect(result.ok).toBe(true);
      expect(result.issues).toEqual([]);
      expect(result.warningSummary).toEqual([]);
      // 無 issues 不寫 audit log
      expect(auditRepo.save).not.toHaveBeenCalled();
    });
  });

  describe('TS-F061-INT-002：有維度缺少 match_type → 稽核失敗', () => {
    it('match_type=null → ok=false, issue 含 MISSING_MATCH_TYPE', async () => {
      columnRepo.find.mockResolvedValue([
        { card_type: 'H', card_version: 1, column_name: 'ACCOUNT_AGE',
          status: 'active', match_type: null },
      ]);
      scoreRepo.find.mockResolvedValue([
        { column_name: 'ACCOUNT_AGE', level1: null, level2_s: '0', level2_e: '10', score: 10 },
      ]);
      const result = await service.checkIntegrity('H', 1);
      expect(result.ok).toBe(false);
      const types = result.issues.map((i) => i.type);
      expect(types).toContain('MISSING_MATCH_TYPE');
    });
  });

  describe('TS-F061-INT-003：有維度 score 區間為空 → 警告 issue', () => {
    it('維度 score rows=0 → 警告 issue ALL_SCORES_EMPTY 並寫 audit log', async () => {
      columnRepo.find.mockResolvedValue([
        { card_type: 'H', card_version: 1, column_name: 'EMPTY_DIM',
          status: 'active', match_type: 'RANGE' },
      ]);
      scoreRepo.find.mockResolvedValue([]);
      const result = await service.checkIntegrity('H', 1, {
        runId: 'run-001',
        affectedRowCount: 42,
      });
      expect(result.ok).toBe(false);
      expect(result.issues[0]).toMatchObject({
        type: 'ALL_SCORES_EMPTY',
        cardType: 'H',
        columnName: 'EMPTY_DIM',
        violatedRowCount: 42,
      });
      // 彙總 audit log 已寫入
      expect(auditRepo.save).toHaveBeenCalled();
      const savedLogs = auditRepo.save.mock.calls[0][0];
      expect(savedLogs[0].action).toBe('SCORING_INTEGRITY_WARN');
      expect(savedLogs[0].after_value).toMatchObject({
        run_id: 'run-001',
        card_type: 'H',
        column_name: 'EMPTY_DIM',
        rule_violated: 'ALL_SCORES_EMPTY',
        violated_row_count: 42,
      });
    });
  });

  describe('TS-F061-INT-004：COMPOSITE 維度缺少基線區間（LEVEL1=null）→ 警告', () => {
    it('COMPOSITE 無 level1=null 基線 → 警告 COMPOSITE_MISSING_BASELINE', async () => {
      columnRepo.find.mockResolvedValue([
        { card_type: 'H', card_version: 1, column_name: 'PROJECT_TP',
          status: 'active', match_type: 'COMPOSITE' },
      ]);
      scoreRepo.find.mockResolvedValue([
        { column_name: 'PROJECT_TP', level1: 'A', level2_s: '0', level2_e: '5', score: 50 },
        { column_name: 'PROJECT_TP', level1: 'B', level2_s: '0', level2_e: '5', score: 30 },
      ]);
      const result = await service.checkIntegrity('H', 1);
      const types = result.issues.map((i) => i.type);
      expect(types).toContain('COMPOSITE_MISSING_BASELINE');
    });
  });

  describe('TS-F061-INT-005：稽核服務不觸發 fn_calc_tier_level（解耦驗證）', () => {
    it('checkIntegrity 不查詢 ob_pool_data，且不執行 raw SQL fn_calc_tier_level', async () => {
      columnRepo.find.mockResolvedValue([]);
      scoreRepo.find.mockResolvedValue([]);
      await service.checkIntegrity('H', 1);
      // 僅查 column / score 兩個 repo；無其他資料表存取
      expect(columnRepo.find).toHaveBeenCalledTimes(1);
      expect(scoreRepo.find).toHaveBeenCalledTimes(1);
      // 沒有 raw query / pool_data / customer 相關 repo 注入 → 結構性保證解耦
    });
  });

  describe('TS-F061-INT-006：稽核失敗回傳值供 caller 設定 run status', () => {
    it('稽核失敗時不拋 exception（BR-13：不阻擋月名單分派）', async () => {
      columnRepo.find.mockResolvedValue([
        { card_type: 'H', card_version: 1, column_name: 'BAD_DIM',
          status: 'active', match_type: null },
      ]);
      scoreRepo.find.mockResolvedValue([]);
      // 應正常 resolve，不 throw
      await expect(service.checkIntegrity('H', 1)).resolves.toBeDefined();
    });
  });

  describe('TS-F061-INT-007：每維度每 rule_violated 寫一筆彙總 audit log', () => {
    it('多維度多違規 → 對應多筆彙總 audit log，不寫 appl_no 明細', async () => {
      columnRepo.find.mockResolvedValue([
        { card_type: 'H', card_version: 1, column_name: 'D1', status: 'active', match_type: 'RANGE' },
        { card_type: 'H', card_version: 1, column_name: 'D2', status: 'active', match_type: 'RANGE' },
      ]);
      scoreRepo.find.mockResolvedValue([]); // 兩個維度均空
      const result = await service.checkIntegrity('H', 1);
      expect(result.issues).toHaveLength(2);
      const saved = auditRepo.save.mock.calls[0][0];
      expect(saved).toHaveLength(2);
      // 確認彙總列無 appl_no 明細欄位
      expect(saved[0].after_value).not.toHaveProperty('appl_no');
    });
  });
});
