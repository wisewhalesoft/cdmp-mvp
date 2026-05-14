/**
 * F053 / F054 / F055 / F056 — AssignmentScoring E2E
 *
 * 涵蓋 F053~F056 所有後端端點完整 HTTP flow，使用 better-sqlite3 in-memory
 * （與 F068 e2e 同 pattern）。
 *
 * 本檔分區（隨 cycle 逐步擴充）：
 *   - F053 GET /scoring               （C2）
 *   - F055 GET /card-levels           （C2 co-located）
 *   - F054 PUT/POST/disable           （C6）
 *   - F055 PUT + GET preview          （C9）
 *   - F056 GET/PUT/POST + fn_calc_*   （C11；fn_calc_tier_level 在 PG 才跑）
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ConfigModule } from '@nestjs/config';
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler';
import { APP_GUARD } from '@nestjs/core';
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
import { AssignmentRun } from '@/database/entities/assignment-run.entity';
import { AssignmentAuditLog } from '@/database/entities/assignment-audit-log.entity';
import { HashUtil } from '@/common/hash/hash.util';

const JWT_SECRET = 'test-jwt-secret-for-assignment-scoring-e2e';

const SM_USER = {
  id: 'a1b2c3d4-e5f6-7890-abcd-ef0123456789',
  name: 'Sales Manager Scoring',
  email: 'sm-scoring-e2e@cdmp.test',
  password: 'P@ssw0rd123',
  role: 'user' as const,
  status: 'active' as const,
  is_sales_manager: true,
};
const PLAIN_USER = {
  id: 'b2c3d4e5-f6a7-8901-bcde-f01234567890',
  name: 'Plain User Scoring',
  email: 'plain-scoring-e2e@cdmp.test',
  password: 'P@ssw0rd123',
  role: 'user' as const,
  status: 'active' as const,
  is_sales_manager: false,
};

async function createTestApp(): Promise<INestApplication> {
  const moduleFixture: TestingModule = await Test.createTestingModule({
    imports: [
      ConfigModule.forRoot({
        isGlobal: true,
        load: [() => ({ JWT_SECRET })],
      }),
      TypeOrmModule.forRoot({
        type: 'better-sqlite3',
        database: ':memory:',
        entities: [
          User,
          TokenBlocklist,
          PasswordResetToken,
          ObLevelcardVersion,
          ObLevelcardColumn,
          ObLevelcardScore,
          ObLevelcardLevel,
          ObTier,
          ObPoolDataList,
          AssignmentRun,
          AssignmentAuditLog,
        ],
        synchronize: true,
      }),
      ThrottlerModule.forRoot([{ name: 'default', ttl: 60000, limit: 1000 }]),
      AuthModule,
      AssignmentScoringModule,
    ],
    providers: [{ provide: APP_GUARD, useClass: ThrottlerGuard }],
  }).compile();

  const app = moduleFixture.createNestApplication();
  app.setGlobalPrefix('api/v1');
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );
  app.useGlobalFilters(new HttpExceptionFilter());
  await app.init();

  // Seed users
  const ds = moduleFixture.get(DataSource);
  const userRepo = ds.getRepository(User);
  const passwordHash = await HashUtil.hash('P@ssw0rd123');
  for (const u of [SM_USER, PLAIN_USER]) {
    await userRepo.save(
      userRepo.create({
        id: u.id,
        name: u.name,
        email: u.email,
        password_hash: passwordHash,
        role: u.role,
        status: u.status,
        is_sales_manager: u.is_sales_manager,
      }),
    );
  }

  return app;
}

async function login(app: INestApplication, email: string): Promise<string> {
  const res = await request(app.getHttpServer())
    .post('/api/v1/auth/login')
    .send({ email, password: 'P@ssw0rd123' });
  if (!res.body?.token) {
    throw new Error(`Login failed for ${email}: ${JSON.stringify(res.body)}`);
  }
  return res.body.token;
}

describe('AssignmentScoring E2E (/api/v1/assignment/scoring/*)', () => {
  let app: INestApplication;
  let smToken: string;
  let plainToken: string;
  let ds: DataSource;

  beforeAll(async () => {
    app = await createTestApp();
    ds = app.get(DataSource);
    smToken = await login(app, SM_USER.email);
    plainToken = await login(app, PLAIN_USER.email);
  });

  afterAll(async () => {
    await app?.close();
  });

  beforeEach(async () => {
    // 各 test 獨立：清空 E07 計分相關表
    await ds.getRepository(AssignmentAuditLog).clear();
    await ds.getRepository(AssignmentRun).clear();
    await ds.getRepository(ObTier).clear();
    await ds.getRepository(ObPoolDataList).clear();
    await ds.getRepository(ObLevelcardLevel).clear();
    await ds.getRepository(ObLevelcardScore).clear();
    await ds.getRepository(ObLevelcardColumn).clear();
    await ds.getRepository(ObLevelcardVersion).clear();
  });

  // ============================================================
  // F053 GET /scoring
  // ============================================================
  describe('F053 GET /scoring', () => {
    it('TS-F053-007：未登入 → 401 AUTH_TOKEN_MISSING', async () => {
      const res = await request(app.getHttpServer()).get(
        '/api/v1/assignment/scoring?cardType=H',
      );
      expect(res.status).toBe(401);
      expect(res.body.error).toBe('AUTH_TOKEN_MISSING');
    });

    it('TS-F053-008：非業務主管 → 403 AUTH_FORBIDDEN', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/assignment/scoring?cardType=H')
        .set('Authorization', `Bearer ${plainToken}`);
      expect(res.status).toBe(403);
      expect(res.body.error).toBe('AUTH_FORBIDDEN');
    });

    it('TS-F053-002：無 active 版本 → 404 SCORING_VERSION_NOT_FOUND', async () => {
      // 植入 inactive 版本
      await ds.getRepository(ObLevelcardVersion).save({
        card_type: 'H',
        card_name: '期中',
        card_version: 1,
        sdate: '20190823',
        edate: '20991231',
        status: 'inactive',
      } as any);
      const res = await request(app.getHttpServer())
        .get('/api/v1/assignment/scoring?cardType=H')
        .set('Authorization', `Bearer ${smToken}`);
      expect(res.status).toBe(404);
      expect(res.body.error).toBe('SCORING_VERSION_NOT_FOUND');
    });

    it('TS-F053-001 + TS-F053-005：H 版本回傳 dimensions 升冪排列含 scores', async () => {
      await ds.getRepository(ObLevelcardVersion).save({
        card_type: 'H', card_name: '期中', card_version: 1,
        sdate: '20190823', edate: '20991231', status: 'active',
      } as any);
      await ds.getRepository(ObLevelcardColumn).save([
        { card_type: 'H', card_version: 1, column_name: 'CELLULAR', column_label: '有無手機', status: 'active' },
        { card_type: 'H', card_version: 1, column_name: 'ACCOUNT_AGE', column_label: '帳齡', status: 'active' },
        { card_type: 'H', card_version: 1, column_name: 'CAREA_NO1', column_label: '戶籍縣市', status: 'active' },
      ] as any);
      await ds.getRepository(ObLevelcardScore).save([
        { card_type: 'H', card_version: 1, column_name: 'ACCOUNT_AGE', level1: null, level2_s: '0', level2_e: '3', score: 10 },
        { card_type: 'H', card_version: 1, column_name: 'ACCOUNT_AGE', level1: null, level2_s: '4', level2_e: '12', score: 20 },
      ] as any);

      const res = await request(app.getHttpServer())
        .get('/api/v1/assignment/scoring?cardType=H')
        .set('Authorization', `Bearer ${smToken}`);

      expect(res.status).toBe(200);
      expect(res.body.dimensions).toHaveLength(3);
      expect(res.body.dimensions[0].columnName).toBe('ACCOUNT_AGE');
      expect(res.body.dimensions[1].columnName).toBe('CAREA_NO1');
      expect(res.body.dimensions[2].columnName).toBe('CELLULAR');

      const accountAge = res.body.dimensions[0];
      expect(accountAge.scores).toHaveLength(2);
      expect(accountAge.scores[0]).toEqual({
        level1: null, level2S: '0', level2E: '3', score: 10,
      });
      expect(accountAge.scoreSummary).toBe('2 個區間');
    });

    it('TS-F053-003：version 有值欄位正確映射', async () => {
      await ds.getRepository(ObLevelcardVersion).save({
        card_type: 'H', card_name: '期中', card_version: 1,
        sdate: '20190823', edate: '20991231', status: 'active',
        created_by: '21251',
        created_at: new Date('2019-08-23T00:00:00Z'),
      } as any);

      const res = await request(app.getHttpServer())
        .get('/api/v1/assignment/scoring?cardType=H')
        .set('Authorization', `Bearer ${smToken}`);

      expect(res.status).toBe(200);
      expect(res.body.version).toMatchObject({
        cardType: 'H', cardName: '期中', cardVersion: 1,
        sdate: '20190823', edate: '20991231',
        createdBy: '21251',
      });
      expect(res.body.version.createdAt).toMatch(/^2019-08-23T00:00:00/);
    });

    it('TS-F053-004：createdBy/createdAt 為 null 時鍵存在值為 null', async () => {
      await ds.getRepository(ObLevelcardVersion).save({
        card_type: 'S', card_name: '中結', card_version: 1,
        sdate: '20190823', edate: '20991231', status: 'active',
        created_by: null,
        created_at: null,
      } as any);

      const res = await request(app.getHttpServer())
        .get('/api/v1/assignment/scoring?cardType=S')
        .set('Authorization', `Bearer ${smToken}`);
      expect(res.status).toBe(200);
      expect(res.body.version.createdBy).toBeNull();
      expect(res.body.version.createdAt).toBeNull();
    });

    it("BE-F053-001：停用維度（status='inactive'）不出現於 dimensions", async () => {
      await ds.getRepository(ObLevelcardVersion).save({
        card_type: 'H', card_name: '期中', card_version: 1,
        sdate: '20190823', edate: '20991231', status: 'active',
      } as any);
      await ds.getRepository(ObLevelcardColumn).save([
        { card_type: 'H', card_version: 1, column_name: 'KEEP', column_label: '保留', status: 'active' },
        { card_type: 'H', card_version: 1, column_name: 'DROP', column_label: '停用', status: 'inactive' },
      ] as any);

      const res = await request(app.getHttpServer())
        .get('/api/v1/assignment/scoring?cardType=H')
        .set('Authorization', `Bearer ${smToken}`);
      expect(res.status).toBe(200);
      expect(res.body.dimensions).toHaveLength(1);
      expect(res.body.dimensions[0].columnName).toBe('KEEP');
    });
  });

  // ============================================================
  // F054 PUT /dimensions / POST /dimensions / PUT /dimensions/:columnName/disable
  // ============================================================
  describe('F054 寫入端點', () => {
    /**
     * seed：H active 版本 + ACCOUNT_AGE 維度 + 2 筆 score
     */
    async function seedHWithAccountAge() {
      await ds.getRepository(ObLevelcardVersion).save({
        card_type: 'H', card_name: '期中', card_version: 1,
        sdate: '20190823', edate: '20991231', status: 'active',
      } as any);
      await ds.getRepository(ObLevelcardColumn).save([
        { card_type: 'H', card_version: 1, column_name: 'ACCOUNT_AGE',
          column_label: '帳齡', status: 'active' },
        { card_type: 'H', card_version: 1, column_name: 'CELLULAR',
          column_label: '有無手機', status: 'active' },
      ] as any);
      await ds.getRepository(ObLevelcardScore).save([
        { card_type: 'H', card_version: 1, column_name: 'ACCOUNT_AGE',
          level1: null, level2_s: '0', level2_e: '3', score: 10 },
        { card_type: 'H', card_version: 1, column_name: 'ACCOUNT_AGE',
          level1: null, level2_s: '4', level2_e: '12', score: 20 },
      ] as any);
    }

    // ---- PUT /dimensions ----

    it('TS-F054-001：PUT 覆寫式修改成功，DB 舊區間被替換', async () => {
      await seedHWithAccountAge();

      const res = await request(app.getHttpServer())
        .put('/api/v1/assignment/scoring/dimensions')
        .set('Authorization', `Bearer ${smToken}`)
        .send({
          cardType: 'H',
          cardVersion: 1,
          dimensions: [{
            columnName: 'ACCOUNT_AGE',
            columnLabel: '帳齡',
            scores: [
              { level1: null, level2S: '0', level2E: '5', score: 15 },
              { level1: null, level2S: '6', level2E: '12', score: 25 },
            ],
          }],
        });
      expect(res.status).toBe(200);
      expect(res.body).toMatchObject({
        cardType: 'H', cardVersion: 1, updatedDimensions: 1, updatedScores: 2,
      });

      // DB 中 ACCOUNT_AGE 的 scores 應為 2 筆新值
      const scores = await ds.getRepository(ObLevelcardScore).find({
        where: { card_type: 'H', card_version: 1, column_name: 'ACCOUNT_AGE' },
      });
      expect(scores).toHaveLength(2);
      expect(scores.find((s) => s.score === 15)).toBeTruthy();
      expect(scores.find((s) => s.score === 25)).toBeTruthy();
      // 舊 [0,3]=10 / [4,12]=20 不應存在
      expect(scores.find((s) => s.score === 10)).toBeFalsy();
      expect(scores.find((s) => s.score === 20)).toBeFalsy();
    });

    it('TS-F054-002：PUT 寫 audit_log（UPDATE / entity_id=H|1|ACCOUNT_AGE）', async () => {
      await seedHWithAccountAge();

      await request(app.getHttpServer())
        .put('/api/v1/assignment/scoring/dimensions')
        .set('Authorization', `Bearer ${smToken}`)
        .send({
          cardType: 'H', cardVersion: 1,
          dimensions: [{
            columnName: 'ACCOUNT_AGE', columnLabel: '帳齡',
            scores: [{ level1: null, level2S: '0', level2E: '5', score: 15 }],
          }],
        });

      const logs = await ds.getRepository(AssignmentAuditLog).find();
      expect(logs).toHaveLength(1);
      expect(logs[0]).toMatchObject({
        action: 'UPDATE',
        entity_type: 'ob_levelcard_score',
        entity_id: 'H|1|ACCOUNT_AGE',
        actor_id: SM_USER.id,
        actor_name: SM_USER.name,
      });
      expect((logs[0].before_value as any).scores).toHaveLength(2);
      expect((logs[0].after_value as any).scores).toHaveLength(1);
    });

    it('TS-F054-013：PUT 區間重疊 [9,20] 與 [0,10] → 422 SCORING_RANGE_OVERLAP，DB 不變', async () => {
      await seedHWithAccountAge();

      const res = await request(app.getHttpServer())
        .put('/api/v1/assignment/scoring/dimensions')
        .set('Authorization', `Bearer ${smToken}`)
        .send({
          cardType: 'H', cardVersion: 1,
          dimensions: [{
            columnName: 'ACCOUNT_AGE', columnLabel: '帳齡',
            scores: [
              { level1: null, level2S: '0', level2E: '10', score: 10 },
              { level1: null, level2S: '9', level2E: '20', score: 20 },
            ],
          }],
        });
      expect(res.status).toBe(422);
      expect(res.body.error).toBe('SCORING_RANGE_OVERLAP');

      // DB 不變（仍是 seed 的 [0,3]=10、[4,12]=20）
      const scores = await ds.getRepository(ObLevelcardScore).find();
      expect(scores).toHaveLength(2);
      expect(scores.find((s) => s.score === 10)?.level2_e).toBe('3');
    });

    it('TS-F054-014：PUT 相鄰接觸 [11,20] 與 [0,10] 允許', async () => {
      await seedHWithAccountAge();

      const res = await request(app.getHttpServer())
        .put('/api/v1/assignment/scoring/dimensions')
        .set('Authorization', `Bearer ${smToken}`)
        .send({
          cardType: 'H', cardVersion: 1,
          dimensions: [{
            columnName: 'ACCOUNT_AGE', columnLabel: '帳齡',
            scores: [
              { level1: null, level2S: '0', level2E: '10', score: 10 },
              { level1: null, level2S: '11', level2E: '20', score: 20 },
            ],
          }],
        });
      expect(res.status).toBe(200);
    });

    // ---- POST /dimensions ----

    it('TS-F054-004：POST 新增 CONTRACT_YEARS → 201 + DB 寫入 + audit CREATE', async () => {
      await seedHWithAccountAge();

      const res = await request(app.getHttpServer())
        .post('/api/v1/assignment/scoring/dimensions')
        .set('Authorization', `Bearer ${smToken}`)
        .send({
          cardType: 'H', cardVersion: 1,
          columnName: 'CONTRACT_YEARS', columnLabel: '契約年資',
          scores: [
            { level1: null, level2S: '0', level2E: '5', score: 5 },
            { level1: null, level2S: '6', level2E: '99', score: 15 },
          ],
        });
      expect(res.status).toBe(201);
      expect(res.body).toMatchObject({
        cardType: 'H', columnName: 'CONTRACT_YEARS',
        columnLabel: '契約年資', status: 'active',
      });

      // DB column 新增
      const col = await ds.getRepository(ObLevelcardColumn).findOne({
        where: { card_type: 'H', card_version: 1, column_name: 'CONTRACT_YEARS' },
      });
      expect(col?.status).toBe('active');

      // DB score 2 筆
      const scores = await ds.getRepository(ObLevelcardScore).find({
        where: { card_type: 'H', card_version: 1, column_name: 'CONTRACT_YEARS' },
      });
      expect(scores).toHaveLength(2);

      // audit CREATE
      const logs = await ds.getRepository(AssignmentAuditLog).find();
      expect(logs).toHaveLength(1);
      expect(logs[0].action).toBe('CREATE');
      expect(logs[0].entity_type).toBe('ob_levelcard_column');
      expect(logs[0].before_value).toBeNull();
      expect((logs[0].after_value as any).columnName).toBe('CONTRACT_YEARS');
    });

    it('TS-F054-006：POST 重複 column_name → 422 SCORING_COLUMN_DUPLICATE，DB 不變', async () => {
      await seedHWithAccountAge();

      const res = await request(app.getHttpServer())
        .post('/api/v1/assignment/scoring/dimensions')
        .set('Authorization', `Bearer ${smToken}`)
        .send({
          cardType: 'H', cardVersion: 1,
          columnName: 'ACCOUNT_AGE', columnLabel: '帳齡',
          scores: [],
        });
      expect(res.status).toBe(422);
      expect(res.body.error).toBe('SCORING_COLUMN_DUPLICATE');

      // DB column 數量不變（仍 2 筆，未重複寫入）
      const cols = await ds.getRepository(ObLevelcardColumn).find({
        where: { card_type: 'H', column_name: 'ACCOUNT_AGE' },
      });
      expect(cols).toHaveLength(1);
    });

    // ---- PUT /dimensions/:columnName/disable ----

    it('TS-F054-007 + TS-F054-008：disable 成功 + DB status=inactive + audit DISABLE + scores 不刪', async () => {
      await seedHWithAccountAge();

      const res = await request(app.getHttpServer())
        .put('/api/v1/assignment/scoring/dimensions/ACCOUNT_AGE/disable?cardType=H')
        .set('Authorization', `Bearer ${smToken}`);
      expect(res.status).toBe(200);
      expect(res.body).toMatchObject({
        cardType: 'H', cardVersion: 1,
        columnName: 'ACCOUNT_AGE', status: 'inactive',
      });

      // DB column status
      const col = await ds.getRepository(ObLevelcardColumn).findOne({
        where: { card_type: 'H', column_name: 'ACCOUNT_AGE' },
      });
      expect(col?.status).toBe('inactive');

      // scores 不刪
      const scores = await ds.getRepository(ObLevelcardScore).find({
        where: { card_type: 'H', column_name: 'ACCOUNT_AGE' },
      });
      expect(scores).toHaveLength(2);

      // audit DISABLE
      const logs = await ds.getRepository(AssignmentAuditLog).find();
      expect(logs).toHaveLength(1);
      expect(logs[0].action).toBe('DISABLE');
      expect(logs[0].entity_type).toBe('ob_levelcard_column');
      expect((logs[0].before_value as any).status).toBe('active');
      expect((logs[0].after_value as any).status).toBe('inactive');
    });

    it('TS-F054-009：停用後 GET /scoring 不再包含該維度（跨 F053 串聯）', async () => {
      await seedHWithAccountAge();

      // 先停用
      await request(app.getHttpServer())
        .put('/api/v1/assignment/scoring/dimensions/ACCOUNT_AGE/disable?cardType=H')
        .set('Authorization', `Bearer ${smToken}`)
        .expect(200);

      // GET /scoring 不再包含 ACCOUNT_AGE
      const res = await request(app.getHttpServer())
        .get('/api/v1/assignment/scoring?cardType=H')
        .set('Authorization', `Bearer ${smToken}`);
      expect(res.status).toBe(200);
      const colNames = res.body.dimensions.map((d: any) => d.columnName);
      expect(colNames).not.toContain('ACCOUNT_AGE');
      expect(colNames).toContain('CELLULAR');
    });

    it('BE-F054-003：重複 disable 已 inactive 維度 → 404 SCORING_COLUMN_NOT_FOUND', async () => {
      await seedHWithAccountAge();

      // 第一次成功
      await request(app.getHttpServer())
        .put('/api/v1/assignment/scoring/dimensions/ACCOUNT_AGE/disable?cardType=H')
        .set('Authorization', `Bearer ${smToken}`)
        .expect(200);

      // 第二次 → 404
      const res = await request(app.getHttpServer())
        .put('/api/v1/assignment/scoring/dimensions/ACCOUNT_AGE/disable?cardType=H')
        .set('Authorization', `Bearer ${smToken}`);
      expect(res.status).toBe(404);
      expect(res.body.error).toBe('SCORING_COLUMN_NOT_FOUND');
    });

    // ---- 月跑鎖 ----

    it('TS-F054-010：assignment_run.status=pending 時 PUT → 409 SCORING_VERSION_LOCKED', async () => {
      await seedHWithAccountAge();
      await ds.getRepository(AssignmentRun).save({
        run_id: '11111111-1111-1111-1111-111111111111',
        project_workym: '202604',
        status: 'pending',
        triggered_by: SM_USER.id,
        created_at: new Date(),
      } as any);

      const res = await request(app.getHttpServer())
        .put('/api/v1/assignment/scoring/dimensions')
        .set('Authorization', `Bearer ${smToken}`)
        .send({
          cardType: 'H', cardVersion: 1,
          dimensions: [{
            columnName: 'ACCOUNT_AGE', columnLabel: '帳齡',
            scores: [{ level1: null, level2S: '0', level2E: '5', score: 15 }],
          }],
        });
      expect(res.status).toBe(409);
      expect(res.body.error).toBe('SCORING_VERSION_LOCKED');
    });

    it('TS-F054-011：assignment_run.status=running 時 PUT → 409', async () => {
      await seedHWithAccountAge();
      await ds.getRepository(AssignmentRun).save({
        run_id: '22222222-2222-2222-2222-222222222222',
        project_workym: '202604',
        status: 'running',
        triggered_by: SM_USER.id,
        created_at: new Date(),
      } as any);

      const res = await request(app.getHttpServer())
        .put('/api/v1/assignment/scoring/dimensions')
        .set('Authorization', `Bearer ${smToken}`)
        .send({
          cardType: 'H', cardVersion: 1,
          dimensions: [{
            columnName: 'ACCOUNT_AGE', columnLabel: '帳齡',
            scores: [{ level1: null, level2S: '0', level2E: '5', score: 15 }],
          }],
        });
      expect(res.status).toBe(409);
      expect(res.body.error).toBe('SCORING_VERSION_LOCKED');
    });

    it('TS-F054-012：assignment_run.status=pending 時 POST 新增也 → 409', async () => {
      await seedHWithAccountAge();
      await ds.getRepository(AssignmentRun).save({
        run_id: '33333333-3333-3333-3333-333333333333',
        project_workym: '202604',
        status: 'pending',
        triggered_by: SM_USER.id,
        created_at: new Date(),
      } as any);

      const res = await request(app.getHttpServer())
        .post('/api/v1/assignment/scoring/dimensions')
        .set('Authorization', `Bearer ${smToken}`)
        .send({
          cardType: 'H', cardVersion: 1,
          columnName: 'CONTRACT_YEARS', columnLabel: '契約年資',
          scores: [],
        });
      expect(res.status).toBe(409);
      expect(res.body.error).toBe('SCORING_VERSION_LOCKED');
    });

    // ---- Auth ----

    it('TS-F054-015：PUT 未登入 → 401', async () => {
      const res = await request(app.getHttpServer())
        .put('/api/v1/assignment/scoring/dimensions')
        .send({ cardType: 'H', cardVersion: 1, dimensions: [] });
      expect(res.status).toBe(401);
      expect(res.body.error).toBe('AUTH_TOKEN_MISSING');
    });

    it('TS-F054-016：PUT 非業務主管 → 403', async () => {
      const res = await request(app.getHttpServer())
        .put('/api/v1/assignment/scoring/dimensions')
        .set('Authorization', `Bearer ${plainToken}`)
        .send({ cardType: 'H', cardVersion: 1, dimensions: [] });
      expect(res.status).toBe(403);
      expect(res.body.error).toBe('AUTH_FORBIDDEN');
    });
  });

  // ============================================================
  // F055 GET /card-levels / GET /card-levels/preview / PUT /card-levels
  // ============================================================
  describe('F055 CARD_LEVEL 門檻', () => {
    async function seedHWithLevels() {
      await ds.getRepository(ObLevelcardVersion).save({
        card_type: 'H', card_name: '期中', card_version: 1,
        sdate: '20190823', edate: '20991231', status: 'active',
      } as any);
      await ds.getRepository(ObLevelcardLevel).save([
        { card_type: 'H', card_version: 1, card_level: 'A', score_s: 243, score_e: 999 },
        { card_type: 'H', card_version: 1, card_level: 'B', score_s: 214, score_e: 242 },
        { card_type: 'H', card_version: 1, card_level: 'C', score_s: 185, score_e: 213 },
        { card_type: 'H', card_version: 1, card_level: 'D', score_s: 0, score_e: 184 },
      ] as any);
    }

    async function seedS5WithLevels() {
      await ds.getRepository(ObLevelcardVersion).save({
        card_type: 'S5', card_name: '中結5年', card_version: 1,
        sdate: '20190823', edate: '20991231', status: 'active',
      } as any);
      await ds.getRepository(ObLevelcardLevel).save([
        { card_type: 'S5', card_version: 1, card_level: 'A', score_s: 200, score_e: 999 },
        { card_type: 'S5', card_version: 1, card_level: 'B', score_s: 0, score_e: 199 },
      ] as any);
    }

    // ---- GET /card-levels ----

    it('TS-F055-001：GET H 4 級 → 200，依 score_s 降冪', async () => {
      await seedHWithLevels();
      const res = await request(app.getHttpServer())
        .get('/api/v1/assignment/scoring/card-levels?cardType=H')
        .set('Authorization', `Bearer ${smToken}`);
      expect(res.status).toBe(200);
      expect(res.body).toMatchObject({ cardType: 'H', cardVersion: 1 });
      expect(res.body.levels).toHaveLength(4);
      expect(res.body.levels.map((l: any) => l.cardLevel)).toEqual([
        'A', 'B', 'C', 'D',
      ]);
      expect(res.body.levels[0]).toMatchObject({
        cardLevel: 'A', scoreS: 243, scoreE: 999,
      });
    });

    it('TS-F055-002：GET S5 2 級 → 200（不硬編碼 4 級）', async () => {
      await seedS5WithLevels();
      const res = await request(app.getHttpServer())
        .get('/api/v1/assignment/scoring/card-levels?cardType=S5')
        .set('Authorization', `Bearer ${smToken}`);
      expect(res.status).toBe(200);
      expect(res.body.levels).toHaveLength(2);
      expect(res.body.levels.map((l: any) => l.cardLevel)).toEqual(['A', 'B']);
    });

    it('GET 無 active 版本 → 404 SCORING_VERSION_NOT_FOUND', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/assignment/scoring/card-levels?cardType=H')
        .set('Authorization', `Bearer ${smToken}`);
      expect(res.status).toBe(404);
      expect(res.body.error).toBe('SCORING_VERSION_NOT_FOUND');
    });

    // ---- PUT /card-levels ----

    it('TS-F055-003：PUT H 4 級 → 200，DB 對應 update，updatedLevels=4', async () => {
      await seedHWithLevels();
      const res = await request(app.getHttpServer())
        .put('/api/v1/assignment/scoring/card-levels')
        .set('Authorization', `Bearer ${smToken}`)
        .send({
          cardType: 'H', cardVersion: 1,
          levels: [
            { cardLevel: 'A', scoreS: 250, scoreE: 999 },
            { cardLevel: 'B', scoreS: 214, scoreE: 249 },
            { cardLevel: 'C', scoreS: 185, scoreE: 213 },
            { cardLevel: 'D', scoreS: 0, scoreE: 184 },
          ],
        });
      expect(res.status).toBe(200);
      expect(res.body).toMatchObject({
        cardType: 'H', cardVersion: 1, updatedLevels: 4,
      });

      const dbLevels = await ds.getRepository(ObLevelcardLevel).find({
        where: { card_type: 'H', card_version: 1 },
      });
      const aLevel = dbLevels.find((l) => l.card_level === 'A');
      expect(aLevel?.score_s).toBe(250);
    });

    it('TS-F055-004：PUT S5 2 級 → 200，updatedLevels=2', async () => {
      await seedS5WithLevels();
      const res = await request(app.getHttpServer())
        .put('/api/v1/assignment/scoring/card-levels')
        .set('Authorization', `Bearer ${smToken}`)
        .send({
          cardType: 'S5', cardVersion: 1,
          levels: [
            { cardLevel: 'A', scoreS: 210, scoreE: 999 },
            { cardLevel: 'B', scoreS: 0, scoreE: 209 },
          ],
        });
      expect(res.status).toBe(200);
      expect(res.body.updatedLevels).toBe(2);
    });

    it('TS-F055-006：PUT 成功後 audit_log 記 UPDATE / before+after', async () => {
      await seedHWithLevels();
      await request(app.getHttpServer())
        .put('/api/v1/assignment/scoring/card-levels')
        .set('Authorization', `Bearer ${smToken}`)
        .send({
          cardType: 'H', cardVersion: 1,
          levels: [{ cardLevel: 'A', scoreS: 250, scoreE: 999 }],
        });

      const logs = await ds.getRepository(AssignmentAuditLog).find();
      expect(logs).toHaveLength(1);
      expect(logs[0]).toMatchObject({
        action: 'UPDATE',
        entity_type: 'ob_levelcard_level',
        entity_id: 'H|1',
      });
      expect((logs[0].before_value as any).levels[0].scoreS).toBe(243);
      expect((logs[0].after_value as any).levels[0].scoreS).toBe(250);
    });

    it('TS-F055-009：PUT 區間重疊 → 422，DB 不變', async () => {
      await seedHWithLevels();
      const res = await request(app.getHttpServer())
        .put('/api/v1/assignment/scoring/card-levels')
        .set('Authorization', `Bearer ${smToken}`)
        .send({
          cardType: 'H', cardVersion: 1,
          levels: [
            { cardLevel: 'A', scoreS: 81, scoreE: 100 },
            { cardLevel: 'B', scoreS: 65, scoreE: 90 },
          ],
        });
      expect(res.status).toBe(422);
      expect(res.body.error).toBe('SCORING_RANGE_OVERLAP');

      // DB 不變
      const dbLevels = await ds.getRepository(ObLevelcardLevel).find();
      const aLevel = dbLevels.find((l) => l.card_level === 'A');
      expect(aLevel?.score_s).toBe(243);
    });

    it('TS-F055-010：PUT 相鄰接觸允許 → 200', async () => {
      await seedHWithLevels();
      const res = await request(app.getHttpServer())
        .put('/api/v1/assignment/scoring/card-levels')
        .set('Authorization', `Bearer ${smToken}`)
        .send({
          cardType: 'H', cardVersion: 1,
          levels: [
            { cardLevel: 'A', scoreS: 81, scoreE: 100 },
            { cardLevel: 'B', scoreS: 61, scoreE: 80 },
          ],
        });
      expect(res.status).toBe(200);
    });

    // ---- 月跑鎖 ----

    it('TS-F055-007：assignment_run.status=pending 時 PUT → 409', async () => {
      await seedHWithLevels();
      await ds.getRepository(AssignmentRun).save({
        run_id: 'aaaa1111-1111-1111-1111-111111111111',
        project_workym: '202604',
        status: 'pending',
        triggered_by: SM_USER.id,
        created_at: new Date(),
      } as any);

      const res = await request(app.getHttpServer())
        .put('/api/v1/assignment/scoring/card-levels')
        .set('Authorization', `Bearer ${smToken}`)
        .send({
          cardType: 'H', cardVersion: 1,
          levels: [{ cardLevel: 'A', scoreS: 243, scoreE: 999 }],
        });
      expect(res.status).toBe(409);
      expect(res.body.error).toBe('SCORING_VERSION_LOCKED');
    });

    it('TS-F055-008：assignment_run.status=running 時 PUT → 409', async () => {
      await seedHWithLevels();
      await ds.getRepository(AssignmentRun).save({
        run_id: 'aaaa2222-2222-2222-2222-222222222222',
        project_workym: '202604',
        status: 'running',
        triggered_by: SM_USER.id,
        created_at: new Date(),
      } as any);

      const res = await request(app.getHttpServer())
        .put('/api/v1/assignment/scoring/card-levels')
        .set('Authorization', `Bearer ${smToken}`)
        .send({
          cardType: 'H', cardVersion: 1,
          levels: [{ cardLevel: 'A', scoreS: 243, scoreE: 999 }],
        });
      expect(res.status).toBe(409);
      expect(res.body.error).toBe('SCORING_VERSION_LOCKED');
    });

    // ---- Auth ----

    it('TS-F055-011：PUT 未登入 → 401', async () => {
      const res = await request(app.getHttpServer())
        .put('/api/v1/assignment/scoring/card-levels')
        .send({ cardType: 'H', cardVersion: 1, levels: [] });
      expect(res.status).toBe(401);
      expect(res.body.error).toBe('AUTH_TOKEN_MISSING');
    });

    it('TS-F055-012：PUT 非業務主管 → 403', async () => {
      const res = await request(app.getHttpServer())
        .put('/api/v1/assignment/scoring/card-levels')
        .set('Authorization', `Bearer ${plainToken}`)
        .send({ cardType: 'H', cardVersion: 1, levels: [] });
      expect(res.status).toBe(403);
      expect(res.body.error).toBe('AUTH_FORBIDDEN');
    });

    // ---- GET /card-levels/preview ----

    it('TS-F055-013：preview distribution 加總 = pool_data_list 總筆數', async () => {
      await seedHWithLevels();

      // 植入 100 筆 pool_data_list，分佈：A=20、B=40、C=30、D=10
      const rows: any[] = [];
      let counter = 0;
      const insertScore = (score: number, count: number) => {
        for (let i = 0; i < count; i++) {
          counter += 1;
          rows.push({
            list_no: '001',
            orgno: '01',
            appl_no: `A${String(counter).padStart(8, '0')}`,
            settle_src: 'N',
            score,
          });
        }
      };
      insertScore(250, 20);
      insertScore(220, 40);
      insertScore(200, 30);
      insertScore(100, 10);
      await ds.getRepository(ObPoolDataList).save(rows as any);

      const levels = encodeURIComponent(JSON.stringify([
        { cardLevel: 'A', scoreS: 243, scoreE: 999 },
        { cardLevel: 'B', scoreS: 214, scoreE: 242 },
        { cardLevel: 'C', scoreS: 185, scoreE: 213 },
        { cardLevel: 'D', scoreS: 0, scoreE: 184 },
      ]));

      const res = await request(app.getHttpServer())
        .get(`/api/v1/assignment/scoring/card-levels/preview?cardType=H&levels=${levels}`)
        .set('Authorization', `Bearer ${smToken}`);
      expect(res.status).toBe(200);
      expect(res.body.distribution).toMatchObject({
        A: 20, B: 40, C: 30, D: 10,
      });
    });

    it('TS-F055-014：preview spec 5.2 範例 URL-encoded 字串能正確解析', async () => {
      // 植入 1 筆 score=250 命中 A
      await ds.getRepository(ObPoolDataList).save({
        list_no: '001', orgno: '01', appl_no: 'B00000001',
        settle_src: 'N', score: 250,
      } as any);

      const encoded =
        'levels=%5B%7B%22cardLevel%22%3A%22A%22%2C%22scoreS%22%3A243%2C%22scoreE%22%3A999%7D%5D';

      const res = await request(app.getHttpServer())
        .get(`/api/v1/assignment/scoring/card-levels/preview?cardType=H&${encoded}`)
        .set('Authorization', `Bearer ${smToken}`);
      expect(res.status).toBe(200);
      expect(res.body.distribution).toMatchObject({ A: 1 });
    });

    it('BE-F055-003：pool_data_list 為空時 distribution 各等級=0', async () => {
      const levels = encodeURIComponent(JSON.stringify([
        { cardLevel: 'A', scoreS: 243, scoreE: 999 },
        { cardLevel: 'B', scoreS: 0, scoreE: 242 },
      ]));

      const res = await request(app.getHttpServer())
        .get(`/api/v1/assignment/scoring/card-levels/preview?cardType=H&levels=${levels}`)
        .set('Authorization', `Bearer ${smToken}`);
      expect(res.status).toBe(200);
      expect(res.body.distribution).toEqual({ A: 0, B: 0 });
    });
  });

  // ============================================================
  // F056 TIER_LEVEL 對應表
  // ============================================================
  describe('F056 TIER_LEVEL 對應表', () => {
    async function seedHActiveLevels() {
      await ds.getRepository(ObLevelcardVersion).save({
        card_type: 'H', card_name: '期中', card_version: 1,
        sdate: '20190823', edate: '20991231', status: 'active',
      } as any);
      await ds.getRepository(ObLevelcardLevel).save([
        { card_type: 'H', card_version: 1, card_level: 'A', score_s: 243, score_e: 999 },
        { card_type: 'H', card_version: 1, card_level: 'B', score_s: 214, score_e: 242 },
      ] as any);
    }

    // ---- GET /tier-mapping ----

    it('TS-F056-001：GET 回傳含標準+fallback (M5/M3/HC/C3)，依升冪', async () => {
      await ds.getRepository(ObTier).save([
        { card_type: 'H', card_level: 'A', tier_level: 'T1', list_nm: '期中名單' },
        { card_type: 'M5', card_level: null, tier_level: 'T5M', list_nm: '機車' },
        { card_type: 'M3', card_level: null, tier_level: 'T5M', list_nm: null },
        { card_type: 'HC', card_level: null, tier_level: 'THC', list_nm: null },
        { card_type: 'C3', card_level: null, tier_level: 'T3C', list_nm: null },
      ] as any);

      const res = await request(app.getHttpServer())
        .get('/api/v1/assignment/scoring/tier-mapping')
        .set('Authorization', `Bearer ${smToken}`);
      expect(res.status).toBe(200);
      expect(res.body.mappings).toHaveLength(5);
      expect(res.body.mappings.map((m: any) => m.cardType)).toEqual([
        'C3', 'H', 'HC', 'M3', 'M5',
      ]);
      expect(res.body.mappings.find((m: any) => m.cardType === 'M5')).toHaveProperty(
        'cardLevel',
        null,
      );
    });

    it('TS-F056-002：GET list_nm null 鍵存在', async () => {
      await ds.getRepository(ObTier).save([
        { card_type: 'H', card_level: 'A', tier_level: 'T1', list_nm: '期中名單' },
        { card_type: 'H', card_level: 'B', tier_level: 'T2', list_nm: null },
      ] as any);

      const res = await request(app.getHttpServer())
        .get('/api/v1/assignment/scoring/tier-mapping')
        .set('Authorization', `Bearer ${smToken}`);
      expect(res.body.mappings[0].listNm).toBe('期中名單');
      expect(res.body.mappings[1]).toHaveProperty('listNm', null);
    });

    it('TS-F056-003：GET 未登入 → 401', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/assignment/scoring/tier-mapping');
      expect(res.status).toBe(401);
      expect(res.body.error).toBe('AUTH_TOKEN_MISSING');
    });

    // ---- PUT /tier-mapping ----

    it('TS-F056-004：PUT UPDATE 既有對應，updatedCount=1', async () => {
      await seedHActiveLevels();
      await ds.getRepository(ObTier).save({
        card_type: 'H', card_level: 'A', tier_level: 'T1', list_nm: '期中名單',
      } as any);

      const res = await request(app.getHttpServer())
        .put('/api/v1/assignment/scoring/tier-mapping')
        .set('Authorization', `Bearer ${smToken}`)
        .send({
          mappings: [{ cardType: 'H', cardLevel: 'A', tierLevel: 'T2' }],
        });
      expect(res.status).toBe(200);
      expect(res.body).toMatchObject({ updatedCount: 1, insertedCount: 0 });

      const row = await ds.getRepository(ObTier).findOne({
        where: { card_type: 'H', card_level: 'A' },
      });
      expect(row?.tier_level).toBe('T2');
    });

    it('TS-F056-005：PUT INSERT 不存在對應，insertedCount=1', async () => {
      await seedHActiveLevels();

      const res = await request(app.getHttpServer())
        .put('/api/v1/assignment/scoring/tier-mapping')
        .set('Authorization', `Bearer ${smToken}`)
        .send({
          mappings: [{ cardType: 'H', cardLevel: 'B', tierLevel: 'T2' }],
        });
      expect(res.status).toBe(200);
      expect(res.body).toMatchObject({ updatedCount: 0, insertedCount: 1 });

      const rows = await ds.getRepository(ObTier).find();
      expect(rows).toHaveLength(1);
      expect(rows[0]).toMatchObject({
        card_type: 'H', card_level: 'B', tier_level: 'T2',
      });
    });

    it('TS-F056-006：PUT 未列出之既有對應不刪除', async () => {
      await seedHActiveLevels();
      await ds.getRepository(ObTier).save([
        { card_type: 'H', card_level: 'A', tier_level: 'T1', list_nm: '期中名單' },
        { card_type: 'H', card_level: 'B', tier_level: 'T2', list_nm: '期中名單' },
      ] as any);

      await request(app.getHttpServer())
        .put('/api/v1/assignment/scoring/tier-mapping')
        .set('Authorization', `Bearer ${smToken}`)
        .send({
          mappings: [{ cardType: 'H', cardLevel: 'A', tierLevel: 'T1' }],
        })
        .expect(200);

      const rows = await ds.getRepository(ObTier).find();
      expect(rows).toHaveLength(2);
      const hB = rows.find((r) => r.card_level === 'B');
      expect(hB?.tier_level).toBe('T2');
    });

    it('TS-F056-007：PUT body 內 PK 重複 → 422 TIER_LEVEL_DUPLICATE', async () => {
      await seedHActiveLevels();

      const res = await request(app.getHttpServer())
        .put('/api/v1/assignment/scoring/tier-mapping')
        .set('Authorization', `Bearer ${smToken}`)
        .send({
          mappings: [
            { cardType: 'H', cardLevel: 'A', tierLevel: 'T1' },
            { cardType: 'H', cardLevel: 'A', tierLevel: 'T2' },
          ],
        });
      expect(res.status).toBe(422);
      expect(res.body.error).toBe('TIER_LEVEL_DUPLICATE');

      const rows = await ds.getRepository(ObTier).find();
      expect(rows).toHaveLength(0);
    });

    it('TS-F056-008：PUT audit_log entity_id 含 cardType|cardLevel', async () => {
      await seedHActiveLevels();
      await ds.getRepository(ObTier).save({
        card_type: 'H', card_level: 'A', tier_level: 'T1', list_nm: '期中',
      } as any);

      await request(app.getHttpServer())
        .put('/api/v1/assignment/scoring/tier-mapping')
        .set('Authorization', `Bearer ${smToken}`)
        .send({
          mappings: [{ cardType: 'H', cardLevel: 'A', tierLevel: 'T2' }],
        })
        .expect(200);

      const logs = await ds.getRepository(AssignmentAuditLog).find();
      expect(logs).toHaveLength(1);
      expect(logs[0]).toMatchObject({
        action: 'UPDATE',
        entity_type: 'ob_tier',
        entity_id: 'H|A',
      });
      expect((logs[0].before_value as any).tierLevel).toBe('T1');
      expect((logs[0].after_value as any).tierLevel).toBe('T2');
    });

    it('TS-F056-009：PUT fallback (M5, null) → 200', async () => {
      const res = await request(app.getHttpServer())
        .put('/api/v1/assignment/scoring/tier-mapping')
        .set('Authorization', `Bearer ${smToken}`)
        .send({
          mappings: [{ cardType: 'M5', cardLevel: null, tierLevel: 'T5M' }],
        });
      expect(res.status).toBe(200);
      expect(res.body.insertedCount).toBe(1);

      const rows = await ds.getRepository(ObTier).find();
      expect(rows[0]).toMatchObject({
        card_type: 'M5', card_level: null, tier_level: 'T5M',
      });
    });

    it('TS-F056-010：PUT 月跑鎖 pending → 409', async () => {
      await ds.getRepository(AssignmentRun).save({
        run_id: 'bbbb1111-1111-1111-1111-111111111111',
        project_workym: '202604',
        status: 'pending',
        triggered_by: SM_USER.id,
        created_at: new Date(),
      } as any);

      const res = await request(app.getHttpServer())
        .put('/api/v1/assignment/scoring/tier-mapping')
        .set('Authorization', `Bearer ${smToken}`)
        .send({
          mappings: [{ cardType: 'M5', cardLevel: null, tierLevel: 'T5M' }],
        });
      expect(res.status).toBe(409);
      expect(res.body.error).toBe('SCORING_VERSION_LOCKED');
    });

    it('TS-F056-011：PUT 月跑鎖 running → 409', async () => {
      await ds.getRepository(AssignmentRun).save({
        run_id: 'bbbb2222-2222-2222-2222-222222222222',
        project_workym: '202604',
        status: 'running',
        triggered_by: SM_USER.id,
        created_at: new Date(),
      } as any);

      const res = await request(app.getHttpServer())
        .put('/api/v1/assignment/scoring/tier-mapping')
        .set('Authorization', `Bearer ${smToken}`)
        .send({
          mappings: [{ cardType: 'M5', cardLevel: null, tierLevel: 'T5M' }],
        });
      expect(res.status).toBe(409);
    });

    // ---- POST /tier-mapping ----

    it('TS-F056-012：POST 正常新增 → 201', async () => {
      await seedHActiveLevels();

      const res = await request(app.getHttpServer())
        .post('/api/v1/assignment/scoring/tier-mapping')
        .set('Authorization', `Bearer ${smToken}`)
        .send({
          cardType: 'H', cardLevel: 'A',
          tierLevel: 'T1', listNm: '期中名單',
        });
      expect(res.status).toBe(201);
      expect(res.body).toMatchObject({
        cardType: 'H', cardLevel: 'A',
        tierLevel: 'T1', listNm: '期中名單',
      });

      const logs = await ds.getRepository(AssignmentAuditLog).find();
      expect(logs).toHaveLength(1);
      expect(logs[0].action).toBe('CREATE');
    });

    it('TS-F056-013：POST DB 已存在 → 422 TIER_LEVEL_DUPLICATE', async () => {
      await seedHActiveLevels();
      await ds.getRepository(ObTier).save({
        card_type: 'H', card_level: 'A', tier_level: 'T1', list_nm: '期中',
      } as any);

      const res = await request(app.getHttpServer())
        .post('/api/v1/assignment/scoring/tier-mapping')
        .set('Authorization', `Bearer ${smToken}`)
        .send({
          cardType: 'H', cardLevel: 'A', tierLevel: 'T99',
        });
      expect(res.status).toBe(422);
      expect(res.body.error).toBe('TIER_LEVEL_DUPLICATE');

      const row = await ds.getRepository(ObTier).findOne({
        where: { card_type: 'H', card_level: 'A' },
      });
      expect(row?.tier_level).toBe('T1');
    });

    it('TS-F056-014：POST CARD_LEVEL 不存在 → 422 CARD_LEVEL_NOT_FOUND', async () => {
      await seedHActiveLevels();

      const res = await request(app.getHttpServer())
        .post('/api/v1/assignment/scoring/tier-mapping')
        .set('Authorization', `Bearer ${smToken}`)
        .send({ cardType: 'H', cardLevel: 'Z', tierLevel: 'T9' });
      expect(res.status).toBe(422);
      expect(res.body.error).toBe('CARD_LEVEL_NOT_FOUND');
    });

    it("TS-F056-015：POST card_level 'AB' (>1 字元) → 422 CARD_LEVEL_NOT_FOUND（BR-9）", async () => {
      await seedHActiveLevels();

      const res = await request(app.getHttpServer())
        .post('/api/v1/assignment/scoring/tier-mapping')
        .set('Authorization', `Bearer ${smToken}`)
        .send({ cardType: 'H', cardLevel: 'AB', tierLevel: 'T1' });
      expect(res.status).toBe(422);
      expect(res.body.error).toBe('CARD_LEVEL_NOT_FOUND');
    });

    it('TS-F056-016：POST fallback (M5, null) → 201', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/assignment/scoring/tier-mapping')
        .set('Authorization', `Bearer ${smToken}`)
        .send({
          cardType: 'M5', cardLevel: null,
          tierLevel: 'T5M', listNm: '機車',
        });
      expect(res.status).toBe(201);
      expect(res.body).toMatchObject({
        cardType: 'M5', cardLevel: null, tierLevel: 'T5M',
      });
    });

    it('TS-F056-017：POST fallback (M3, null) 過渡期 → 201', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/assignment/scoring/tier-mapping')
        .set('Authorization', `Bearer ${smToken}`)
        .send({ cardType: 'M3', cardLevel: null, tierLevel: 'T5M' });
      expect(res.status).toBe(201);
      expect(res.body.cardType).toBe('M3');
      expect(res.body.cardLevel).toBeNull();
    });

    it('TS-F056-018：POST 月跑鎖 → 409', async () => {
      await ds.getRepository(AssignmentRun).save({
        run_id: 'bbbb3333-3333-3333-3333-333333333333',
        project_workym: '202604',
        status: 'running',
        triggered_by: SM_USER.id,
        created_at: new Date(),
      } as any);

      const res = await request(app.getHttpServer())
        .post('/api/v1/assignment/scoring/tier-mapping')
        .set('Authorization', `Bearer ${smToken}`)
        .send({ cardType: 'M5', cardLevel: null, tierLevel: 'T5M' });
      expect(res.status).toBe(409);
    });

    // ---- 邊界 ----

    it('BE-F056-001：PUT listNm 省略 → 保留 DB 現有', async () => {
      await seedHActiveLevels();
      await ds.getRepository(ObTier).save({
        card_type: 'H', card_level: 'A', tier_level: 'T1', list_nm: '期中名單',
      } as any);

      await request(app.getHttpServer())
        .put('/api/v1/assignment/scoring/tier-mapping')
        .set('Authorization', `Bearer ${smToken}`)
        .send({ mappings: [{ cardType: 'H', cardLevel: 'A', tierLevel: 'T2' }] })
        .expect(200);

      const row = await ds.getRepository(ObTier).findOne({
        where: { card_type: 'H', card_level: 'A' },
      });
      expect(row?.list_nm).toBe('期中名單');
      expect(row?.tier_level).toBe('T2');
    });

    it('BE-F056-002：PUT listNm 明確傳 null → 清空', async () => {
      await seedHActiveLevels();
      await ds.getRepository(ObTier).save({
        card_type: 'H', card_level: 'A', tier_level: 'T1', list_nm: '期中名單',
      } as any);

      await request(app.getHttpServer())
        .put('/api/v1/assignment/scoring/tier-mapping')
        .set('Authorization', `Bearer ${smToken}`)
        .send({
          mappings: [{ cardType: 'H', cardLevel: 'A', tierLevel: 'T2', listNm: null }],
        })
        .expect(200);

      const row = await ds.getRepository(ObTier).findOne({
        where: { card_type: 'H', card_level: 'A' },
      });
      expect(row?.list_nm).toBeNull();
    });

    it('BE-F056-003：cardType 超過 5 字元 → 422 VALIDATION_ERROR', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/assignment/scoring/tier-mapping')
        .set('Authorization', `Bearer ${smToken}`)
        .send({ cardType: 'TOOLONG', cardLevel: null, tierLevel: 'T1' });
      expect(res.status).toBe(422);
      expect(res.body.error).toBe('VALIDATION_ERROR');
    });

    it('BE-F056-004：tierLevel 超過 5 字元 → 422 VALIDATION_ERROR', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/assignment/scoring/tier-mapping')
        .set('Authorization', `Bearer ${smToken}`)
        .send({ cardType: 'M5', cardLevel: null, tierLevel: 'TOOLONG' });
      expect(res.status).toBe(422);
      expect(res.body.error).toBe('VALIDATION_ERROR');
    });

    it('BE-F056-005：listNm 超過 30 字元 → 422 VALIDATION_ERROR', async () => {
      const tooLong = 'A'.repeat(31);
      const res = await request(app.getHttpServer())
        .post('/api/v1/assignment/scoring/tier-mapping')
        .set('Authorization', `Bearer ${smToken}`)
        .send({
          cardType: 'M5', cardLevel: null,
          tierLevel: 'T5M', listNm: tooLong,
        });
      expect(res.status).toBe(422);
      expect(res.body.error).toBe('VALIDATION_ERROR');
    });

    // ---- Auth ----

    it('PUT 非業務主管 → 403', async () => {
      const res = await request(app.getHttpServer())
        .put('/api/v1/assignment/scoring/tier-mapping')
        .set('Authorization', `Bearer ${plainToken}`)
        .send({ mappings: [] });
      expect(res.status).toBe(403);
    });
  });

  // ============================================================
  // F056 跨層整合：fn_calc_tier_level（僅 PostgreSQL 真機跑，SQLite skip）
  // ============================================================
  describe.skipIf(process.env.DB_TYPE !== 'postgres')(
    'F056 fn_calc_tier_level 跨層',
    () => {
      it('TS-F056-019：M5 pool_data 觸發 fallback（card_level IS NULL）→ T5M', async () => {
        await ds.getRepository(ObTier).save({
          card_type: 'M5', card_level: null, tier_level: 'T5M', list_nm: null,
        } as any);

        const rows = await ds.query(
          `SELECT * FROM fn_calc_tier_level($1, $2, NULL::ob_pool_data)`,
          ['M5', 1],
        );
        expect(rows).toHaveLength(1);
        expect(rows[0].tier_level).toBe('T5M');
      });

      it('TS-F056-020：H/A 精確匹配 → T1（不走 fallback）', async () => {
        await ds.getRepository(ObLevelcardVersion).save({
          card_type: 'H', card_name: '期中', card_version: 1,
          sdate: '20190823', edate: '20991231', status: 'active',
        } as any);
        await ds.getRepository(ObLevelcardLevel).save({
          card_type: 'H', card_version: 1, card_level: 'A',
          score_s: 0, score_e: 999,
        } as any);
        await ds.getRepository(ObTier).save([
          { card_type: 'H', card_level: 'A', tier_level: 'T1', list_nm: '期中' },
          { card_type: 'H', card_level: null, tier_level: 'T_FALLBACK', list_nm: null },
        ] as any);

        const rows = await ds.query(
          `SELECT * FROM fn_calc_tier_level($1, $2, NULL::ob_pool_data)`,
          ['H', 1],
        );
        expect(rows[0].tier_level).toBe('T1');
      });
    },
  );
});
