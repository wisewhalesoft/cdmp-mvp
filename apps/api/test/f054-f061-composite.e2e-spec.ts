/**
 * F054 / F061 v1.3 Composite E2E Tests
 *
 * 涵蓋 v1.3 端對端整合流程（Supertest + better-sqlite3 in-memory）：
 *
 * 分區：
 *   A. match_type 欄位 E2E（F054 v1.3 AC-7）
 *      - POST /scoring/dimensions 帶 matchType → 回傳 201，GET 可查到 matchType
 *      - GET /scoring response 包含 matchType 欄位
 *      - matchType='UNKNOWN' → 422 VALIDATION_ERROR
 *
 *   B. 計分完整性稽核 E2E（F061 v1.3 Pre-check）
 *      - POST /assignment-runs/run 稽核通過 → 202 Accepted，非同步 polling 完成
 *      - POST /assignment-runs/run 稽核失敗（有維度缺 match_type）→ run status='failed'
 *      - 稽核失敗時 GET /assignment-runs/:runId → status='failed'，errorDetail 含 issues
 *
 *   C. warning_summary 回傳（F061 v1.3 AC-8）
 *      - 月名單分派完成後 GET /assignment-runs/:runId → response.reportPayload.warningSummary 存在
 *      - warningSummary.issueCount === 0（無警告）或 > 0（有警告）
 *
 *   D. audit_log 新欄位（F061 v1.3 AC-9）
 *      - 月名單分派計分後 assignment_audit_log 含 run_id / card_type / column_name
 *      - rule_violated / violated_row_count 在有違規時非 null
 *
 * 前置條件（tdd-implementation）：
 *   - better-sqlite3 in-memory：entities 需含 ObLevelcardColumn（with match_type）
 *   - migration {timestamp}-add-match-type 已執行
 *   - migration {timestamp}-add-scoring-audit-fields 已執行
 *   - ScoringIntegrityCheckService 已實作並注入
 *
 * Pattern：同 assignment-scoring.e2e-spec.ts（better-sqlite3 + JWT seed）
 * SQLite 限制：fn_calc_tier_level plpgsql 不執行（Stage 2 計分使用簡化版）
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ConfigModule } from '@nestjs/config';
import { DataSource } from 'typeorm';
import { AuthModule } from '@/modules/auth/auth.module';
import { AssignmentScoringModule } from '@/modules/assignment-scoring/assignment-scoring.module';
import { HttpExceptionFilter } from '@/common/filters/http-exception.filter';
import { User } from '@/database/entities/user.entity';
import { TokenBlocklist } from '@/database/entities/token-blocklist.entity';
import { PasswordResetToken } from '@/database/entities/password-reset-token.entity';
import { ObLevelcardVersion } from '@/database/entities/ob-levelcard-version.entity';
import { ObLevelcardColumn } from '@/database/entities/ob-levelcard-column.entity';
import { ObLevelcardScore } from '@/database/entities/ob-levelcard-score.entity';
import { ObLevelcardLevel } from '@/database/entities/ob-levelcard-level.entity';
import { ObTier } from '@/database/entities/ob-tier.entity';
import { ObPoolDataList } from '@/database/entities/ob-pool-data-list.entity';
import { ObCardType } from '@/database/entities/ob-card-type.entity';
import { ObCodeDf } from '@/database/entities/ob-code-df.entity';
import { ObListDefinition } from '@/database/entities/ob-list-definition.entity';
import { AssignmentRun } from '@/database/entities/assignment-run.entity';
import { AssignmentAuditLog } from '@/database/entities/assignment-audit-log.entity';
import { HashUtil } from '@/common/hash/hash.util';

const JWT_SECRET = 'test-jwt-f054-f061-v13';

// B2 pattern：director 身份（寫入需 DirectorGuard）
const DIRECTOR_USER = {
  id: 'f054-f061-dir-uuid-0001',
  name: 'Director v13 Tester',
  email: 'director-v13@cdmp.test',
  password: 'P@ssw0rd123',
  role: 'user' as const,
  status: 'active' as const,
  is_sales_manager: true,
  business_role: 'director' as const,
};

// ============================================================
// TODO（tdd-implementation）：補齊 createTestApp()
//   - 複製 assignment-scoring.e2e-spec.ts 的 createTestApp pattern
//   - 新增 ObLevelcardColumn（match_type 欄位版本）到 entities 清單
//   - 新增 AssignmentRun entities 如有月名單分派測試
// ============================================================

describe('F054/F061 v1.3 Composite E2E', () => {
  let app: INestApplication;
  let dataSource: DataSource;
  let directorToken: string;

  beforeAll(async () => {
    // TODO（tdd-implementation）：補齊 app setup + token 取得
    // app = await createTestApp();
    // const loginRes = await request(app.getHttpServer())
    //   .post('/api/v1/auth/login')
    //   .send({ email: DIRECTOR_USER.email, password: DIRECTOR_USER.password });
    // directorToken = loginRes.body.accessToken;
  });

  afterAll(async () => {
    // TODO（tdd-implementation）：await app.close()
  });

  // ============================================================
  // A. match_type 欄位 E2E
  // ============================================================

  describe('A. match_type 欄位（F054 v1.3 AC-7）', () => {
    it.todo(
      // TODO（tdd-implementation）：
      // Precondition：ob_levelcard_version 有 card_type='H', card_version=1, status='active'
      // Act：POST /api/v1/assignment/scoring/dimensions
      //   body: { cardType:'H', cardVersion:1, columnName:'MT_TEST_E2E', matchType:'RANGE', scores:[...] }
      //   Authorization: Bearer ${directorToken}
      // Assert：HTTP 201
      //         GET /scoring?cardType=H&cardVersion=1 → dimensions 含 MT_TEST_E2E，matchType='RANGE'
      'POST /dimensions 帶 matchType=RANGE → 201，GET 可查到 matchType',
    );

    it.todo(
      // TODO（tdd-implementation）：
      // Act：POST /dimensions body 含 matchType='UNKNOWN'
      // Assert：HTTP 422，error='VALIDATION_ERROR'
      'matchType=UNKNOWN → 422 VALIDATION_ERROR',
    );

    it.todo(
      // TODO（tdd-implementation）：
      // GET /scoring?cardType=H&cardVersion=1 後
      // 驗證 response.dimensions[0] 含 matchType 欄位（非 undefined）
      // 若 matchType=null（seed 資料無此欄位），亦需明確回傳 null
      'GET /scoring response 每個 dimension 含 matchType 欄位',
    );
  });

  // ============================================================
  // B. 計分完整性稽核 E2E
  // ============================================================

  describe('B. 計分完整性稽核（F061 v1.3 Pre-check）', () => {
    it.todo(
      // TODO（tdd-implementation）：
      // Precondition：所有 ob_levelcard_column 均有 match_type（非 null）
      //               ob_levelcard_score 每個維度均有 score rows
      // Act：POST /api/v1/assignment/runs/run { projectWorkym: '202607', cardType: 'H' }
      // Assert：HTTP 202 Accepted（非同步）
      //         polling GET /runs/:runId until status='completed'（timeout 5s）
      //         run.status === 'completed'（稽核通過，pipeline 正常完成）
      '稽核通過 → POST /runs/run 202，polling completed',
    );

    it.todo(
      // TODO（tdd-implementation）：
      // Precondition：seed 一筆 ob_levelcard_column，match_type=null（觸發稽核失敗）
      // Act：POST /runs/run { projectWorkym: '202608', cardType: 'H' }
      // Assert：HTTP 202（先接受）
      //         polling GET /runs/:runId until status='failed'
      //         response.errorDetail 或 reportPayload.warningSummary 含 MISSING_MATCH_TYPE issue
      '稽核失敗（match_type=null）→ run status=failed，errorDetail 含 MISSING_MATCH_TYPE',
    );

    it.todo(
      // TODO（tdd-implementation）：
      // Precondition：月名單分派鎖（ob 或 assignment_run status=running）
      // Act：POST /runs/run
      // Assert：HTTP 409，error='SCORING_VERSION_LOCKED'
      //         不建立新 run（run count 不增加）
      '月名單分派鎖存在 → POST /runs/run 409 SCORING_VERSION_LOCKED',
    );
  });

  // ============================================================
  // C. warning_summary 回傳
  // ============================================================

  describe('C. warning_summary（F061 v1.3 AC-8）', () => {
    it.todo(
      // TODO（tdd-implementation）：
      // Precondition：月名單分派正常完成（稽核通過，無警告）
      // Assert：GET /runs/:runId → response.reportPayload.warningSummary 存在
      //         warningSummary.issueCount === 0
      //         warningSummary.issues === []
      '月名單分派無警告 → reportPayload.warningSummary.issueCount=0',
    );

    it.todo(
      // TODO（tdd-implementation）：
      // Precondition：月名單分派完成但有 COMPOSITE 維度缺基線（警告非阻斷）
      // Assert：reportPayload.warningSummary.issueCount > 0
      //         issues[0].type === 'COMPOSITE_MISSING_BASELINE'
      //         run.status 仍為 'completed'（警告不阻斷完成）
      '月名單分派有警告（COMPOSITE 缺基線）→ reportPayload.warningSummary.issueCount>0，status 仍 completed',
    );
  });

  // ============================================================
  // D. audit_log 新欄位
  // ============================================================

  describe('D. audit_log 新欄位（F061 v1.3 AC-9）', () => {
    it.todo(
      // TODO（tdd-implementation）：
      // Precondition：月名單分派完成後查 assignment_audit_log WHERE action='RUN'
      // Assert：每筆 log 含 run_id（非 null）
      //         含 card_type（如 'H'）
      //         含 column_name（維度名稱或 null，依寫入時機）
      '月名單分派後 audit_log action=RUN 含 run_id 與 card_type',
    );

    it.todo(
      // TODO（tdd-implementation）：
      // Precondition：月名單分派時有計分規則被違反（rule_violated 場景）
      // Assert：audit_log 含 rule_violated 非 null、violated_row_count > 0
      '有規則違反時 audit_log 含 rule_violated 與 violated_row_count',
    );
  });
});
