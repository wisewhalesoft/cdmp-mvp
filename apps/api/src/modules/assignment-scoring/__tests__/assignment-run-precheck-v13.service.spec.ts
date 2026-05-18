/**
 * F061 v1.3 — AssignmentRunPipelineService Pre-check Unit Tests
 *
 * 涵蓋月跑啟動前稽核流程（v1.3 新增）：
 *   - TS-F061-PRE-001：稽核通過 → pipeline 繼續執行（Stage 1 被觸發）
 *   - TS-F061-PRE-002：稽核失敗 → pipeline 中止，run status='failed'，error 含 SCORING_INTEGRITY_FAILED
 *   - TS-F061-PRE-003：月跑鎖存在 → precheck 不觸發稽核，直接回 409 SCORING_VERSION_LOCKED
 *   - TS-F061-PRE-004：ScoringIntegrityCheckService 以 spy/mock 驗證被呼叫一次
 *   - TS-F061-PRE-005：稽核失敗時 assignment_audit_log 記錄 action='RUN'，after_value 含 status='failed' 與 issues
 *   - TS-F061-PRE-006：precheck 通過後 run status 由 pending → running（非 failed）
 *
 * 設計決策（決策 5.4）：
 *   - ScoringIntegrityCheckService 透過依賴注入（非直接實例化）
 *   - 以 vi.fn() mock 驗證呼叫次數與傳入參數
 *
 * tdd-implementation 指令：
 *   1. AssignmentRunPipelineService 建構子注入 ScoringIntegrityCheckService
 *   2. runPipeline() 進入 Stage 1 前呼叫 integrityCheck.checkIntegrity(cardType, cardVersion)
 *   3. 稽核失敗時：設 run.status='failed'，error_detail 含 issues，throw 或 return early
 *   4. 稽核失敗寫入 assignment_audit_log（action='RUN', after_value.status='failed'）
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { ConflictException } from '@nestjs/common';
import { AssignmentRunPipelineService } from '@/modules/assignment/services/assignment-run-pipeline.service';
import { AssignmentRun } from '@/database/entities/assignment-run.entity';
import { AssignmentAuditLog } from '@/database/entities/assignment-audit-log.entity';
import { ObLevelcardVersion } from '@/database/entities/ob-levelcard-version.entity';
import { ObCardType } from '@/database/entities/ob-card-type.entity';
// TODO（tdd-implementation）：替換為實際路徑
// import { ScoringIntegrityCheckService } from '../services/scoring-integrity-check.service';

describe('AssignmentRunPipelineService — F061 v1.3 Pre-check', () => {
  let service: AssignmentRunPipelineService;
  let runRepo: any;
  let auditRepo: any;
  let versionRepo: any;
  let cardTypeRepo: any;
  // TODO（tdd-implementation）：宣告 integrityCheckService: any;
  let integrityCheckServiceMock: any;

  const actor = { userId: 'dir-uuid', ipAddress: '127.0.0.1' };
  const YM = '202606';

  beforeEach(async () => {
    runRepo = {
      findOne: vi.fn().mockResolvedValue(null),  // 預設：無月跑鎖
      save: vi.fn((e: any) => Promise.resolve(e)),
      create: vi.fn((d: any) => ({ ...d, run_id: 'run-uuid-1' })),
    };
    auditRepo = {
      create: vi.fn((d: any) => ({ ...d })),
      save: vi.fn((e: any) => Promise.resolve(e)),
    };
    versionRepo = {
      findOne: vi.fn().mockResolvedValue({ card_type: 'H', card_version: 1, status: 'active' }),
    };
    cardTypeRepo = {
      find: vi.fn().mockResolvedValue([{ card_type: 'H', status: 'active' }]),
    };
    // 預設：稽核通過
    integrityCheckServiceMock = {
      checkIntegrity: vi.fn().mockResolvedValue({ ok: true, issues: [] }),
    };

    // TODO（tdd-implementation）：補齊 TestingModule，確認 ScoringIntegrityCheckService 注入方式
    // const module: TestingModule = await Test.createTestingModule({
    //   providers: [
    //     AssignmentRunPipelineService,
    //     { provide: ScoringIntegrityCheckService, useValue: integrityCheckServiceMock },
    //     { provide: getRepositoryToken(AssignmentRun), useValue: runRepo },
    //     { provide: getRepositoryToken(AssignmentAuditLog), useValue: auditRepo },
    //     { provide: getRepositoryToken(ObLevelcardVersion), useValue: versionRepo },
    //     { provide: getRepositoryToken(ObCardType), useValue: cardTypeRepo },
    //     // ... 其他依賴 repos
    //   ],
    // }).compile();
    // service = module.get(AssignmentRunPipelineService);
  });

  describe('TS-F061-PRE-001：稽核通過 → pipeline 繼續執行', () => {
    it.todo(
      // TODO（tdd-implementation）：
      // Arrange：integrityCheckServiceMock.checkIntegrity resolves { ok: true, issues: [] }
      // Act：await service.runPipeline({ projectWorkym: YM, cardType: 'H' }, actor)
      // Assert：integrityCheckServiceMock.checkIntegrity 被呼叫一次
      //         run.status 最終非 'failed'（進入後續 stage）
      '稽核通過 → checkIntegrity 被呼叫一次，pipeline 不中止',
    );
  });

  describe('TS-F061-PRE-002：稽核失敗 → pipeline 中止，run status=failed', () => {
    it.todo(
      // TODO（tdd-implementation）：
      // Arrange：integrityCheckServiceMock.checkIntegrity resolves {
      //   ok: false, issues: [{ type: 'MISSING_MATCH_TYPE', columnName: 'ACCOUNT_AGE' }]
      // }
      // Act：await service.runPipeline({ projectWorkym: YM, cardType: 'H' }, actor)
      // Assert：runRepo.save 被呼叫且傳入 status: 'failed'
      //         錯誤碼為 SCORING_INTEGRITY_FAILED（或 service throw 對應 error）
      '稽核失敗 → run status=failed，pipeline 中止',
    );
  });

  describe('TS-F061-PRE-003：月跑鎖存在 → 不觸發稽核，直接 409', () => {
    it.todo(
      // TODO（tdd-implementation）：
      // Arrange：runRepo.findOne mock 回傳 { status: 'running', ... }（月跑鎖存在）
      // Act：expect(service.runPipeline(...)).rejects.toThrow(ConflictException)
      // Assert：integrityCheckServiceMock.checkIntegrity 未被呼叫（never called）
      '月跑鎖存在 → checkIntegrity 不觸發，throw ConflictException 409',
    );
  });

  describe('TS-F061-PRE-004：ScoringIntegrityCheckService 以 spy 驗證被呼叫一次', () => {
    it.todo(
      // TODO（tdd-implementation）：
      // 與 PRE-001 共用情境；此 test 專注驗證呼叫次數與傳入參數
      // Assert：checkIntegrity.mock.calls.length === 1
      //         checkIntegrity.mock.calls[0] === ['H', 1]（card_type 與 version）
      'checkIntegrity spy 呼叫次數=1，傳入正確 cardType 與 cardVersion',
    );
  });

  describe('TS-F061-PRE-005：稽核失敗 → audit_log 記錄 action=RUN，status=failed', () => {
    it.todo(
      // TODO（tdd-implementation）：
      // Arrange：稽核失敗情境（同 PRE-002）
      // Assert：auditRepo.create 被呼叫
      //         create 的參數中 action === 'RUN'
      //         after_value.status === 'failed'
      //         after_value.issues 含稽核失敗的 issue 陣列
      '稽核失敗 → audit_log action=RUN，after_value.status=failed，after_value.issues 非空',
    );
  });

  describe('TS-F061-PRE-006：precheck 通過後 run status=running（非 failed）', () => {
    it.todo(
      // TODO（tdd-implementation）：
      // Arrange：稽核通過
      // Assert：runRepo.save 的呼叫序列中，第一次帶 status='running'
      //         最終呼叫帶 status='completed'（若全流程跑完）
      'precheck 通過 → run status 由 pending 轉 running（非 failed）',
    );
  });
});
