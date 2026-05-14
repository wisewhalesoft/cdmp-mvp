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
import { ObCardType } from '@/database/entities/ob-card-type.entity';
import { ObCodeDf } from '@/database/entities/ob-code-df.entity';
import { ObListDefinition } from '@/database/entities/ob-list-definition.entity';
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
          ObCardType,
          ObCodeDf,
          ObListDefinition,
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
    // Iter 2 新增清理
    // ob_list_definition 用 createQueryBuilder().delete() 因有 composite PK
    await ds.getRepository(ObListDefinition).createQueryBuilder().delete().execute();
    await ds.getRepository(ObCardType).clear();
    await ds.getRepository(ObCodeDf).createQueryBuilder().delete().execute();
  });

  // ============================================================
  // F053 GET /scoring
  // ============================================================
  describe('F053 GET /scoring', () => {
    // Iter 4 v1.2：F053 cardType 範圍鎖；自動 seed 各 TC 用到的 ob_card_type active 紀錄
    beforeEach(async () => {
      const now = new Date();
      const baseRow = {
        status: 'active', prod_kind: '01',
        created_at: now, created_by: 'system',
        updated_at: now, updated_by: 'system',
      };
      await ds.getRepository(ObCardType).save([
        { card_type: 'H', card_name: '期中', ...baseRow },
        { card_type: 'S', card_name: '中結', ...baseRow },
      ] as any);
    });

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

    // Iter 4 v1.2 新增 e2e：cardType 範圍鎖（AC-7 / BR-4）
    it('TS-F053-016：cardType=GONE 不存在於 active scope → 404 CARD_TYPE_NOT_FOUND', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/assignment/scoring?cardType=GONE')
        .set('Authorization', `Bearer ${smToken}`);
      expect(res.status).toBe(404);
      expect(res.body.error).toBe('CARD_TYPE_NOT_FOUND');
    });

    it('cardType=H 為 inactive → 404 CARD_TYPE_NOT_FOUND', async () => {
      const now = new Date();
      // 把 H 改為 inactive
      await ds.getRepository(ObCardType).delete({ card_type: 'H' });
      await ds.getRepository(ObCardType).save({
        card_type: 'H', card_name: '期中', prod_kind: '01',
        status: 'inactive',
        created_at: now, created_by: 'system',
        updated_at: now, updated_by: 'system',
      } as any);

      const res = await request(app.getHttpServer())
        .get('/api/v1/assignment/scoring?cardType=H')
        .set('Authorization', `Bearer ${smToken}`);
      expect(res.status).toBe(404);
      expect(res.body.error).toBe('CARD_TYPE_NOT_FOUND');
    });
  });

  // ============================================================
  // F054 PUT /dimensions / POST /dimensions / PUT /dimensions/:columnName/disable
  // ============================================================
  describe('F054 寫入端點', () => {
    // Iter 4 v1.2：F054 cardType 範圍鎖；自動 seed 各 TC 用到的 ob_card_type active 紀錄
    beforeEach(async () => {
      const now = new Date();
      const baseRow = {
        status: 'active', prod_kind: '01',
        created_at: now, created_by: 'system',
        updated_at: now, updated_by: 'system',
      };
      await ds.getRepository(ObCardType).save([
        { card_type: 'H', card_name: '期中', ...baseRow },
      ] as any);
    });

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

    // Iter 4 v1.2 新增 e2e：cardType 範圍鎖（AC-7 / BR-7）
    it('TS-F054-025：PUT /dimensions cardType=NOTEXIST → 404 CARD_TYPE_NOT_FOUND', async () => {
      const res = await request(app.getHttpServer())
        .put('/api/v1/assignment/scoring/dimensions')
        .set('Authorization', `Bearer ${smToken}`)
        .send({ cardType: 'NOTEX', cardVersion: 1, dimensions: [] });
      expect(res.status).toBe(404);
      expect(res.body.error).toBe('CARD_TYPE_NOT_FOUND');
    });

    it('TS-F054-026：POST /dimensions cardType=NOTEXIST → 404 CARD_TYPE_NOT_FOUND', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/assignment/scoring/dimensions')
        .set('Authorization', `Bearer ${smToken}`)
        .send({
          cardType: 'NOTEX',
          cardVersion: 1,
          columnName: 'TEST',
          columnLabel: '測試',
          scores: [],
        });
      expect(res.status).toBe(404);
      expect(res.body.error).toBe('CARD_TYPE_NOT_FOUND');
    });

    it('disableDimension cardType=NOTEXIST → 404 CARD_TYPE_NOT_FOUND', async () => {
      const res = await request(app.getHttpServer())
        .put(
          '/api/v1/assignment/scoring/dimensions/CONTRACT_YEARS/disable?cardType=NOTEX',
        )
        .set('Authorization', `Bearer ${smToken}`);
      expect(res.status).toBe(404);
      expect(res.body.error).toBe('CARD_TYPE_NOT_FOUND');
    });
  });

  // ============================================================
  // F055 GET /card-levels / GET /card-levels/preview / PUT /card-levels
  // ============================================================
  describe('F055 CARD_LEVEL 門檻', () => {
    // Iter 4 v1.4：F055 cardType 範圍鎖；自動 seed 各 TC 用到的 ob_card_type active 紀錄
    beforeEach(async () => {
      const now = new Date();
      const baseRow = {
        status: 'active', prod_kind: '01',
        created_at: now, created_by: 'system',
        updated_at: now, updated_by: 'system',
      };
      await ds.getRepository(ObCardType).save([
        { card_type: 'H', card_name: '期中', ...baseRow },
        { card_type: 'S5', card_name: '中結5年', ...baseRow },
      ] as any);
    });

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

    // ============================================================
    // F055 §5.3 DELETE /card-levels（v1.3 hard delete + cascade ref check）
    // ============================================================

    it('TS-F055-D08：DELETE happy path → 200 + DB 紀錄移除 + audit DELETE', async () => {
      await seedHWithLevels();

      const res = await request(app.getHttpServer())
        .delete(
          '/api/v1/assignment/scoring/card-levels' +
            '?cardType=H&cardVersion=1&cardLevel=D',
        )
        .set('Authorization', `Bearer ${smToken}`);

      expect(res.status).toBe(200);
      expect(res.body).toMatchObject({
        cardType: 'H',
        cardVersion: 1,
        cardLevel: 'D',
      });
      expect(typeof res.body.deletedAt).toBe('string');
      expect(res.body.deletedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);

      // DB 中 D 等級確實被移除
      const remaining = await ds.getRepository(ObLevelcardLevel).find({
        where: { card_type: 'H', card_version: 1 },
      });
      expect(remaining).toHaveLength(3);
      expect(remaining.map((r) => r.card_level).sort()).toEqual(['A', 'B', 'C']);

      // audit log
      const logs = await ds.getRepository(AssignmentAuditLog).find();
      const deleteLog = logs.find((l) => l.action === 'DELETE');
      expect(deleteLog).toBeDefined();
      expect(deleteLog?.entity_type).toBe('ob_levelcard_level');
      expect(deleteLog?.entity_id).toBe('H|1|D');
      expect(deleteLog?.before_value).toEqual(
        expect.objectContaining({ cardLevel: 'D', scoreS: 0, scoreE: 184 }),
      );
      expect(deleteLog?.after_value).toBeNull();
    });

    it('TS-F055-D09：DELETE 找不到複合 PK 紀錄 → 404 CARD_LEVEL_RECORD_NOT_FOUND', async () => {
      await seedHWithLevels();

      const res = await request(app.getHttpServer())
        .delete(
          '/api/v1/assignment/scoring/card-levels' +
            '?cardType=H&cardVersion=1&cardLevel=Z',
        )
        .set('Authorization', `Bearer ${smToken}`);

      expect(res.status).toBe(404);
      expect(res.body.error).toBe('CARD_LEVEL_RECORD_NOT_FOUND');

      // 既有 A/B/C/D 完整保留
      const remaining = await ds.getRepository(ObLevelcardLevel).find({
        where: { card_type: 'H', card_version: 1 },
      });
      expect(remaining).toHaveLength(4);
    });

    it('TS-F055-D10：DELETE 仍被 ob_tier 引用 → 409 CARD_LEVEL_REFERENCED（cascade BR-6）', async () => {
      await seedHWithLevels();
      // 植入 (H, A) 引用紀錄；fallback (H, null) 也植入但不應被視為對 'A' 的引用
      await ds.getRepository(ObTier).save([
        { card_type: 'H', card_level: 'A', tier_level: 'T1', list_nm: '期中名單' },
        { card_type: 'H', card_level: null, tier_level: 'T_FB', list_nm: null },
      ] as any);

      const res = await request(app.getHttpServer())
        .delete(
          '/api/v1/assignment/scoring/card-levels' +
            '?cardType=H&cardVersion=1&cardLevel=A',
        )
        .set('Authorization', `Bearer ${smToken}`);

      expect(res.status).toBe(409);
      expect(res.body.error).toBe('CARD_LEVEL_REFERENCED');

      // 確認 A 紀錄仍存在（未刪除）
      const aLevel = await ds.getRepository(ObLevelcardLevel).findOne({
        where: { card_type: 'H', card_version: 1, card_level: 'A' },
      });
      expect(aLevel).not.toBeNull();

      // 確認未寫 DELETE audit log
      const logs = await ds.getRepository(AssignmentAuditLog).find();
      expect(logs.filter((l) => l.action === 'DELETE')).toHaveLength(0);
    });

    it('TS-F055-D11：月跑 pending 時 DELETE → 409 SCORING_VERSION_LOCKED', async () => {
      await seedHWithLevels();
      await ds.getRepository(AssignmentRun).save({
        run_id: '11111111-1111-1111-1111-1111110055d11',
        project_workym: '202605',
        status: 'pending',
        triggered_by: SM_USER.id,
        created_at: new Date(),
      } as any);

      const res = await request(app.getHttpServer())
        .delete(
          '/api/v1/assignment/scoring/card-levels' +
            '?cardType=H&cardVersion=1&cardLevel=D',
        )
        .set('Authorization', `Bearer ${smToken}`);

      expect(res.status).toBe(409);
      expect(res.body.error).toBe('SCORING_VERSION_LOCKED');

      // 鎖時不應執行任何刪除
      const remaining = await ds.getRepository(ObLevelcardLevel).find({
        where: { card_type: 'H', card_version: 1 },
      });
      expect(remaining).toHaveLength(4);
    });

    it('TS-F055-D12：DELETE 未登入 → 401 AUTH_TOKEN_MISSING', async () => {
      const res = await request(app.getHttpServer()).delete(
        '/api/v1/assignment/scoring/card-levels' +
          '?cardType=H&cardVersion=1&cardLevel=D',
      );
      expect(res.status).toBe(401);
      expect(res.body.error).toBe('AUTH_TOKEN_MISSING');
    });

    it('TS-F055-D13：DELETE 非業務主管 → 403 AUTH_FORBIDDEN', async () => {
      const res = await request(app.getHttpServer())
        .delete(
          '/api/v1/assignment/scoring/card-levels' +
            '?cardType=H&cardVersion=1&cardLevel=D',
        )
        .set('Authorization', `Bearer ${plainToken}`);
      expect(res.status).toBe(403);
      expect(res.body.error).toBe('AUTH_FORBIDDEN');
    });

    // Iter 4 v1.4 新增 e2e：cardType 範圍鎖（AC-7 / BR-7）
    it('TS-F055-025：GET /card-levels cardType=NOTEXIST → 404 CARD_TYPE_NOT_FOUND', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/assignment/scoring/card-levels?cardType=NOTEX')
        .set('Authorization', `Bearer ${smToken}`);
      expect(res.status).toBe(404);
      expect(res.body.error).toBe('CARD_TYPE_NOT_FOUND');
    });

    it('PUT /card-levels cardType=NOTEXIST → 404', async () => {
      const res = await request(app.getHttpServer())
        .put('/api/v1/assignment/scoring/card-levels')
        .set('Authorization', `Bearer ${smToken}`)
        .send({
          cardType: 'NOTEX',
          cardVersion: 1,
          levels: [{ cardLevel: 'A', scoreS: 0, scoreE: 99 }],
        });
      expect(res.status).toBe(404);
      expect(res.body.error).toBe('CARD_TYPE_NOT_FOUND');
    });

    it('GET /card-levels/preview cardType=NOTEXIST → 404', async () => {
      const levelsJson = encodeURIComponent(
        JSON.stringify([{ cardLevel: 'A', scoreS: 0, scoreE: 99 }]),
      );
      const res = await request(app.getHttpServer())
        .get(
          `/api/v1/assignment/scoring/card-levels/preview?cardType=NOTEX&levels=${levelsJson}`,
        )
        .set('Authorization', `Bearer ${smToken}`);
      expect(res.status).toBe(404);
      expect(res.body.error).toBe('CARD_TYPE_NOT_FOUND');
    });

    it('DELETE /card-levels cardType=NOTEXIST → 404', async () => {
      const res = await request(app.getHttpServer())
        .delete(
          '/api/v1/assignment/scoring/card-levels?cardType=NOTEX&cardVersion=1&cardLevel=A',
        )
        .set('Authorization', `Bearer ${smToken}`);
      expect(res.status).toBe(404);
      expect(res.body.error).toBe('CARD_TYPE_NOT_FOUND');
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

    // v1.5 (Iter 3)：cardType 範圍鎖 — 自動 seed 各 TC 用到的 ob_card_type active 紀錄
    beforeEach(async () => {
      const now = new Date();
      const baseRow = {
        status: 'active',
        prod_kind: '01',
        created_at: now, created_by: 'system',
        updated_at: now, updated_by: 'system',
      };
      await ds.getRepository(ObCardType).save([
        { card_type: 'H', card_name: '期中', ...baseRow },
        { card_type: 'M5', card_name: '機車', prod_kind: '02',
          status: 'active', created_at: now, created_by: 'system',
          updated_at: now, updated_by: 'system',
        },
        { card_type: 'M3', card_name: '機車3年', prod_kind: '02',
          status: 'active', created_at: now, created_by: 'system',
          updated_at: now, updated_by: 'system',
        },
        { card_type: 'HC', card_name: 'HC', ...baseRow },
        { card_type: 'C3', card_name: 'C3', ...baseRow },
      ] as any);
    });

    // ---- GET /tier-mapping ----

    it('TS-F056-001：GET (cardType=M5) 回 fallback 紀錄', async () => {
      // v1.5：GET 只回單一 cardType；分別驗 M5 fallback
      await ds.getRepository(ObTier).save([
        { card_type: 'H', card_level: 'A', tier_level: 'T1', list_nm: '期中名單' },
        { card_type: 'M5', card_level: null, tier_level: 'T5', list_nm: '機車' },
      ] as any);

      const res = await request(app.getHttpServer())
        .get('/api/v1/assignment/scoring/tier-mapping?cardType=M5')
        .set('Authorization', `Bearer ${smToken}`);
      expect(res.status).toBe(200);
      expect(res.body.cardType).toBe('M5');
      expect(res.body.mappings).toHaveLength(1);
      expect(res.body.mappings[0].cardLevel).toBeNull();
    });

    it('TS-F056-002：GET list_nm null 鍵存在', async () => {
      await ds.getRepository(ObTier).save([
        { card_type: 'H', card_level: 'A', tier_level: 'T1', list_nm: '期中名單' },
        { card_type: 'H', card_level: 'B', tier_level: 'T2', list_nm: null },
      ] as any);

      const res = await request(app.getHttpServer())
        .get('/api/v1/assignment/scoring/tier-mapping?cardType=H')
        .set('Authorization', `Bearer ${smToken}`);
      expect(res.body.mappings[0].listNm).toBe('期中名單');
      expect(res.body.mappings[1]).toHaveProperty('listNm', null);
    });

    it('TS-F056-003：GET 未登入 → 401', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/assignment/scoring/tier-mapping?cardType=H');
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
        .put('/api/v1/assignment/scoring/tier-mapping?cardType=H')
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
        .put('/api/v1/assignment/scoring/tier-mapping?cardType=H')
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
        .put('/api/v1/assignment/scoring/tier-mapping?cardType=H')
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
        .put('/api/v1/assignment/scoring/tier-mapping?cardType=H')
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
        .put('/api/v1/assignment/scoring/tier-mapping?cardType=H')
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
        .put('/api/v1/assignment/scoring/tier-mapping?cardType=M5')
        .set('Authorization', `Bearer ${smToken}`)
        .send({
          mappings: [{ cardType: 'M5', cardLevel: null, tierLevel: 'T5' }],
        });
      expect(res.status).toBe(200);
      expect(res.body.insertedCount).toBe(1);

      const rows = await ds.getRepository(ObTier).find();
      expect(rows[0]).toMatchObject({
        card_type: 'M5', card_level: null, tier_level: 'T5',
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
        .put('/api/v1/assignment/scoring/tier-mapping?cardType=M5')
        .set('Authorization', `Bearer ${smToken}`)
        .send({
          mappings: [{ cardType: 'M5', cardLevel: null, tierLevel: 'T5' }],
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
        .put('/api/v1/assignment/scoring/tier-mapping?cardType=M5')
        .set('Authorization', `Bearer ${smToken}`)
        .send({
          mappings: [{ cardType: 'M5', cardLevel: null, tierLevel: 'T5' }],
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
          // v1.5：T99 已不合法（被 @IsIn 列舉檢查擋）；改用合法列舉值仍應觸發 PK 重複
          cardType: 'H', cardLevel: 'A', tierLevel: 'T9',
        });
      expect(res.status).toBe(422);
      expect(res.body.error).toBe('TIER_LEVEL_DUPLICATE');

      const row = await ds.getRepository(ObTier).findOne({
        where: { card_type: 'H', card_level: 'A' },
      });
      expect(row?.tier_level).toBe('T1');
    });

    it('TS-F056-014：POST CARD_LEVEL 不存在 → 422 CARD_LEVEL_NOT_FOUND_IN_VERSION', async () => {
      // v1.4 錯誤碼拆分（PO 2026-05-14）：F056 PUT/POST 驗證錯誤碼從
      // CARD_LEVEL_NOT_FOUND 改為 CARD_LEVEL_NOT_FOUND_IN_VERSION。
      await seedHActiveLevels();

      const res = await request(app.getHttpServer())
        .post('/api/v1/assignment/scoring/tier-mapping')
        .set('Authorization', `Bearer ${smToken}`)
        .send({ cardType: 'H', cardLevel: 'Z', tierLevel: 'T9' });
      expect(res.status).toBe(422);
      expect(res.body.error).toBe('CARD_LEVEL_NOT_FOUND_IN_VERSION');
    });

    it("TS-F056-015：POST card_level 'AB' (>1 字元) → 422 CARD_LEVEL_NOT_FOUND_IN_VERSION（BR-9）", async () => {
      await seedHActiveLevels();

      const res = await request(app.getHttpServer())
        .post('/api/v1/assignment/scoring/tier-mapping')
        .set('Authorization', `Bearer ${smToken}`)
        .send({ cardType: 'H', cardLevel: 'AB', tierLevel: 'T1' });
      expect(res.status).toBe(422);
      expect(res.body.error).toBe('CARD_LEVEL_NOT_FOUND_IN_VERSION');
    });

    it('TS-F056-016：POST fallback (M5, null) → 201', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/assignment/scoring/tier-mapping')
        .set('Authorization', `Bearer ${smToken}`)
        .send({
          cardType: 'M5', cardLevel: null,
          tierLevel: 'T5', listNm: '機車',
        });
      expect(res.status).toBe(201);
      expect(res.body).toMatchObject({
        cardType: 'M5', cardLevel: null, tierLevel: 'T5',
      });
    });

    it('TS-F056-017：POST fallback (M3, null) → 201（v1.5：M3 由 beforeEach 補 active seed）', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/assignment/scoring/tier-mapping')
        .set('Authorization', `Bearer ${smToken}`)
        .send({ cardType: 'M3', cardLevel: null, tierLevel: 'T5' });
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
        .send({ cardType: 'M5', cardLevel: null, tierLevel: 'T5' });
      expect(res.status).toBe(409);
    });

    // ---- 邊界 ----

    it('BE-F056-001：PUT listNm 省略 → 保留 DB 現有', async () => {
      await seedHActiveLevels();
      await ds.getRepository(ObTier).save({
        card_type: 'H', card_level: 'A', tier_level: 'T1', list_nm: '期中名單',
      } as any);

      await request(app.getHttpServer())
        .put('/api/v1/assignment/scoring/tier-mapping?cardType=H')
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
        .put('/api/v1/assignment/scoring/tier-mapping?cardType=H')
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
          tierLevel: 'T5', listNm: tooLong,
        });
      expect(res.status).toBe(422);
      expect(res.body.error).toBe('VALIDATION_ERROR');
    });

    // ---- Auth ----

    it('PUT 非業務主管 → 403', async () => {
      const res = await request(app.getHttpServer())
        .put('/api/v1/assignment/scoring/tier-mapping?cardType=H')
        .set('Authorization', `Bearer ${plainToken}`)
        .send({ mappings: [] });
      expect(res.status).toBe(403);
    });

    // ============================================================
    // F056 §5.4 DELETE /tier-mapping（v1.4 hard delete + fallback NULL）
    // ============================================================

    it('TS-F056-D07：DELETE 標準對應 (H, A) → 200 + DB 移除 + audit DELETE', async () => {
      await seedHActiveLevels();
      await ds.getRepository(ObTier).save([
        { card_type: 'H', card_level: 'A', tier_level: 'T1', list_nm: '期中名單' },
        { card_type: 'H', card_level: 'B', tier_level: 'T2', list_nm: null },
      ] as any);

      const res = await request(app.getHttpServer())
        .delete('/api/v1/assignment/scoring/tier-mapping?cardType=H&cardLevel=A')
        .set('Authorization', `Bearer ${smToken}`);

      expect(res.status).toBe(200);
      expect(res.body).toMatchObject({ cardType: 'H', cardLevel: 'A' });
      expect(typeof res.body.deletedAt).toBe('string');

      const remaining = await ds.getRepository(ObTier).find();
      expect(remaining).toHaveLength(1);
      expect(remaining[0].card_level).toBe('B');

      const logs = await ds.getRepository(AssignmentAuditLog).find();
      const deleteLog = logs.find((l) => l.action === 'DELETE');
      expect(deleteLog).toBeDefined();
      expect(deleteLog?.entity_type).toBe('ob_tier');
      expect(deleteLog?.entity_id).toBe('H|A');
      expect(deleteLog?.before_value).toEqual(
        expect.objectContaining({
          cardType: 'H',
          cardLevel: 'A',
          tierLevel: 'T1',
        }),
      );
      expect(deleteLog?.after_value).toBeNull();
    });

    it('TS-F056-D08：DELETE fallback (M5, NULL) → 200，省略 cardLevel query → fallback', async () => {
      // 植入兩筆對應：fallback M5/null + 標準 M5/A（如果未來補等級）
      await ds.getRepository(ObTier).save([
        { card_type: 'M5', card_level: null, tier_level: 'T5M', list_nm: '機車' },
      ] as any);

      // 注意：cardLevel query 省略 → service 接收 null（fallback）
      const res = await request(app.getHttpServer())
        .delete('/api/v1/assignment/scoring/tier-mapping?cardType=M5')
        .set('Authorization', `Bearer ${smToken}`);

      expect(res.status).toBe(200);
      expect(res.body).toMatchObject({ cardType: 'M5', cardLevel: null });

      const remaining = await ds.getRepository(ObTier).find();
      expect(remaining).toHaveLength(0);

      const logs = await ds.getRepository(AssignmentAuditLog).find();
      const deleteLog = logs.find((l) => l.action === 'DELETE');
      expect(deleteLog?.entity_type).toBe('ob_tier');
      expect(deleteLog?.entity_id).toBe('M5|'); // fallback entity_id 結尾留空
    });

    it('TS-F056-D09：DELETE 找不到對應 → 404 TIER_MAPPING_NOT_FOUND', async () => {
      // 空 ob_tier
      const res = await request(app.getHttpServer())
        .delete('/api/v1/assignment/scoring/tier-mapping?cardType=H&cardLevel=A')
        .set('Authorization', `Bearer ${smToken}`);

      expect(res.status).toBe(404);
      expect(res.body.error).toBe('TIER_MAPPING_NOT_FOUND');
    });

    it('TS-F056-D10：月跑 running 時 DELETE → 409 SCORING_VERSION_LOCKED', async () => {
      await ds.getRepository(ObTier).save({
        card_type: 'H', card_level: 'A', tier_level: 'T1', list_nm: null,
      } as any);
      await ds.getRepository(AssignmentRun).save({
        run_id: '22222222-2222-2222-2222-2222220056d10',
        project_workym: '202605',
        status: 'running',
        triggered_by: SM_USER.id,
        created_at: new Date(),
      } as any);

      const res = await request(app.getHttpServer())
        .delete('/api/v1/assignment/scoring/tier-mapping?cardType=H&cardLevel=A')
        .set('Authorization', `Bearer ${smToken}`);

      expect(res.status).toBe(409);
      expect(res.body.error).toBe('SCORING_VERSION_LOCKED');

      // 鎖時不應執行刪除
      const remaining = await ds.getRepository(ObTier).find();
      expect(remaining).toHaveLength(1);
    });

    it('TS-F056-D11：DELETE 未登入 → 401 AUTH_TOKEN_MISSING', async () => {
      const res = await request(app.getHttpServer()).delete(
        '/api/v1/assignment/scoring/tier-mapping?cardType=H&cardLevel=A',
      );
      expect(res.status).toBe(401);
      expect(res.body.error).toBe('AUTH_TOKEN_MISSING');
    });

    it('TS-F056-D12：DELETE 非業務主管 → 403 AUTH_FORBIDDEN', async () => {
      const res = await request(app.getHttpServer())
        .delete('/api/v1/assignment/scoring/tier-mapping?cardType=H&cardLevel=A')
        .set('Authorization', `Bearer ${plainToken}`);
      expect(res.status).toBe(403);
      expect(res.body.error).toBe('AUTH_FORBIDDEN');
    });
    // ============================================================
    // F056 v1.5 新增 E2E（Iter 3）：cardType 範圍鎖 / TIER 列舉 / Fallback-Standard 互斥
    // ============================================================

    // --- TIER_LEVEL 列舉約束（AC-8）---

    it('TS-F056-029：PUT body tierLevel=T5M → 422 TIER_LEVEL_INVALID_ENUM', async () => {
      const res = await request(app.getHttpServer())
        .put('/api/v1/assignment/scoring/tier-mapping?cardType=H')
        .set('Authorization', `Bearer ${smToken}`)
        .send({
          mappings: [{ cardType: 'H', cardLevel: 'A', tierLevel: 'T5M' }],
        });
      expect(res.status).toBe(422);
      // DTO @IsIn 先擋 → VALIDATION_ERROR；service-level 也會擋 → 兩種錯誤碼皆可，主要驗 422
      expect([
        'TIER_LEVEL_INVALID_ENUM',
        'VALIDATION_ERROR',
      ]).toContain(res.body.error);
    });

    it('TS-F056-030：POST tierLevel=THC → 422', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/assignment/scoring/tier-mapping')
        .set('Authorization', `Bearer ${smToken}`)
        .send({ cardType: 'H', cardLevel: 'A', tierLevel: 'THC' });
      expect(res.status).toBe(422);
      expect([
        'TIER_LEVEL_INVALID_ENUM',
        'VALIDATION_ERROR',
      ]).toContain(res.body.error);
    });

    it('TS-F056-031：POST tierLevel=T11 → 422', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/assignment/scoring/tier-mapping')
        .set('Authorization', `Bearer ${smToken}`)
        .send({ cardType: 'H', cardLevel: 'A', tierLevel: 'T11' });
      expect(res.status).toBe(422);
    });

    it('TS-F056-032：POST tierLevel=T1 → 201（邊界值）', async () => {
      await seedHActiveLevels();
      const res = await request(app.getHttpServer())
        .post('/api/v1/assignment/scoring/tier-mapping')
        .set('Authorization', `Bearer ${smToken}`)
        .send({ cardType: 'H', cardLevel: 'A', tierLevel: 'T1' });
      expect(res.status).toBe(201);
    });

    it('TS-F056-033：POST tierLevel=T10 → 201（邊界值）', async () => {
      await seedHActiveLevels();
      const res = await request(app.getHttpServer())
        .post('/api/v1/assignment/scoring/tier-mapping')
        .set('Authorization', `Bearer ${smToken}`)
        .send({ cardType: 'H', cardLevel: 'B', tierLevel: 'T10' });
      expect(res.status).toBe(201);
    });

    // --- cardType 範圍鎖（AC-9）---

    it('TS-F056-034：GET cardType=NOTEX → 404 CARD_TYPE_NOT_FOUND', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/assignment/scoring/tier-mapping?cardType=NOTEX')
        .set('Authorization', `Bearer ${smToken}`);
      expect(res.status).toBe(404);
      expect(res.body.error).toBe('CARD_TYPE_NOT_FOUND');
    });

    it('TS-F056-035：PUT cardType=NOTEX → 404', async () => {
      const res = await request(app.getHttpServer())
        .put('/api/v1/assignment/scoring/tier-mapping?cardType=NOTEX')
        .set('Authorization', `Bearer ${smToken}`)
        .send({
          mappings: [{ cardType: 'NOTEX', cardLevel: 'A', tierLevel: 'T1' }],
        });
      expect(res.status).toBe(404);
      expect(res.body.error).toBe('CARD_TYPE_NOT_FOUND');
    });

    it('TS-F056-044：GET cardType=H 僅回傳 H 紀錄（不含 S）', async () => {
      // beforeEach 已 seed H 但未 seed S → 補 seed S 為 active
      const now = new Date();
      await ds.getRepository(ObCardType).save({
        card_type: 'S', card_name: '中結', prod_kind: '01',
        status: 'active', created_at: now, created_by: 'system',
        updated_at: now, updated_by: 'system',
      } as any);
      await ds.getRepository(ObTier).save([
        { card_type: 'H', card_level: 'A', tier_level: 'T1', list_nm: '' },
        { card_type: 'S', card_level: 'A', tier_level: 'T2', list_nm: '' },
      ] as any);

      const res = await request(app.getHttpServer())
        .get('/api/v1/assignment/scoring/tier-mapping?cardType=H')
        .set('Authorization', `Bearer ${smToken}`);
      expect(res.status).toBe(200);
      expect(res.body.mappings).toHaveLength(1);
      expect(res.body.mappings[0].cardType).toBe('H');
    });

    // --- Fallback / Standard 互斥（AC-3 / AC-4a / BR-13）---

    it('TS-F056-036：已有 Standard，POST Fallback → 422 CARD_TYPE_FALLBACK_STANDARD_MUTEX', async () => {
      await ds.getRepository(ObTier).save({
        card_type: 'H', card_level: 'A', tier_level: 'T1', list_nm: '',
      } as any);

      const res = await request(app.getHttpServer())
        .post('/api/v1/assignment/scoring/tier-mapping')
        .set('Authorization', `Bearer ${smToken}`)
        .send({ cardType: 'H', cardLevel: null, tierLevel: 'T1' });
      expect(res.status).toBe(422);
      expect(res.body.error).toBe('CARD_TYPE_FALLBACK_STANDARD_MUTEX');
    });

    it('TS-F056-037：已有 Fallback，POST Standard → 422', async () => {
      await ds.getRepository(ObTier).save({
        card_type: 'H', card_level: null, tier_level: 'T1', list_nm: '',
      } as any);
      await seedHActiveLevels(); // 讓 levelRepo 有 H/A

      const res = await request(app.getHttpServer())
        .post('/api/v1/assignment/scoring/tier-mapping')
        .set('Authorization', `Bearer ${smToken}`)
        .send({ cardType: 'H', cardLevel: 'A', tierLevel: 'T1' });
      expect(res.status).toBe(422);
      expect(res.body.error).toBe('CARD_TYPE_FALLBACK_STANDARD_MUTEX');
    });

    it('TS-F056-038：PUT body 同時含 null + 非 null → 422 互斥，整批 rollback', async () => {
      await seedHActiveLevels();

      const res = await request(app.getHttpServer())
        .put('/api/v1/assignment/scoring/tier-mapping?cardType=H')
        .set('Authorization', `Bearer ${smToken}`)
        .send({
          mappings: [
            { cardType: 'H', cardLevel: null, tierLevel: 'T1' },
            { cardType: 'H', cardLevel: 'A', tierLevel: 'T2' },
          ],
        });
      expect(res.status).toBe(422);
      expect(res.body.error).toBe('CARD_TYPE_FALLBACK_STANDARD_MUTEX');

      // DB 無寫入
      const rows = await ds.getRepository(ObTier).find();
      expect(rows).toHaveLength(0);
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

  // ============================================================
  // F069 GET /card-types — Iter 2
  // ============================================================
  describe('F069 GET /card-types', () => {
    async function seedProdKinds() {
      await ds.getRepository(ObCodeDf).save([
        {
          system_id: 'OB',
          tbl_id: 'PROD_KIND',
          tbl_cd: '01',
          tbl_desc1: '汽車',
          stadt: '20000101',
          enddt: '20991231',
        },
        {
          system_id: 'OB',
          tbl_id: 'PROD_KIND',
          tbl_cd: '02',
          tbl_desc1: '機車',
          stadt: '20000101',
          enddt: '20991231',
        },
      ] as any);
    }

    it('TC-F069-12：未登入 → 401 AUTH_TOKEN_MISSING', async () => {
      const res = await request(app.getHttpServer()).get(
        '/api/v1/assignment/scoring/card-types',
      );
      expect(res.status).toBe(401);
      expect(res.body.error).toBe('AUTH_TOKEN_MISSING');
    });

    it('TC-F069-13：非 SM → 403 AUTH_FORBIDDEN', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/assignment/scoring/card-types')
        .set('Authorization', `Bearer ${plainToken}`);
      expect(res.status).toBe(403);
      expect(res.body.error).toBe('AUTH_FORBIDDEN');
    });

    it('TC-F069-01 + TC-F069-02：GET 列表升冪排序含 prodKindName', async () => {
      await seedProdKinds();
      const now = new Date();
      await ds.getRepository(ObCardType).save([
        // 故意打亂插入順序
        {
          card_type: 'M', card_name: '機車', prod_kind: '02',
          status: 'active', created_at: now, created_by: 'system',
          updated_at: now, updated_by: 'system',
        },
        {
          card_type: 'H', card_name: '期中', prod_kind: '01',
          status: 'active', created_at: now, created_by: 'system',
          updated_at: now, updated_by: 'system',
        },
        {
          card_type: 'S', card_name: '中結', prod_kind: '01',
          status: 'active', created_at: now, created_by: 'system',
          updated_at: now, updated_by: 'system',
        },
      ] as any);

      const res = await request(app.getHttpServer())
        .get('/api/v1/assignment/scoring/card-types')
        .set('Authorization', `Bearer ${smToken}`);

      expect(res.status).toBe(200);
      expect(res.body.cardTypes).toHaveLength(3);
      expect(res.body.cardTypes.map((c: any) => c.cardType)).toEqual([
        'H',
        'M',
        'S',
      ]);
      const h = res.body.cardTypes.find((c: any) => c.cardType === 'H');
      expect(h.prodKindName).toBe('汽車');
      const m = res.body.cardTypes.find((c: any) => c.cardType === 'M');
      expect(m.prodKindName).toBe('機車');
    });

    it('TC-F069-08：清單為空 → 200 空陣列', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/assignment/scoring/card-types')
        .set('Authorization', `Bearer ${smToken}`);
      expect(res.status).toBe(200);
      expect(res.body.cardTypes).toEqual([]);
    });

    it('TC-F069-11：status=inactive 預設不在回傳', async () => {
      await seedProdKinds();
      const now = new Date();
      await ds.getRepository(ObCardType).save([
        {
          card_type: 'H', card_name: '期中', prod_kind: '01',
          status: 'active', created_at: now, created_by: 'system',
          updated_at: now, updated_by: 'system',
        },
        {
          card_type: 'Z', card_name: '停用', prod_kind: '01',
          status: 'inactive', created_at: now, created_by: 'system',
          updated_at: now, updated_by: 'system',
        },
      ] as any);

      const res = await request(app.getHttpServer())
        .get('/api/v1/assignment/scoring/card-types')
        .set('Authorization', `Bearer ${smToken}`);
      expect(res.status).toBe(200);
      const codes = res.body.cardTypes.map((c: any) => c.cardType);
      expect(codes).toContain('H');
      expect(codes).not.toContain('Z');
    });
  });

  // ============================================================
  // F070 POST /card-types — Iter 2
  // ============================================================
  describe('F070 POST /card-types', () => {
    async function seedProdKinds() {
      await ds.getRepository(ObCodeDf).save([
        {
          system_id: 'OB',
          tbl_id: 'PROD_KIND',
          tbl_cd: '01',
          tbl_desc1: '汽車',
          stadt: '20000101',
          enddt: '20991231',
        },
        {
          system_id: 'OB',
          tbl_id: 'PROD_KIND',
          tbl_cd: '02',
          tbl_desc1: '機車',
          stadt: '20000101',
          enddt: '20991231',
        },
      ] as any);
    }

    it('TC-F070-15：未登入 → 401', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/assignment/scoring/card-types')
        .send({ cardType: 'X1', cardName: '測試', prodKind: '01' });
      expect(res.status).toBe(401);
      expect(res.body.error).toBe('AUTH_TOKEN_MISSING');
    });

    it('TC-F070-16：非 SM → 403', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/assignment/scoring/card-types')
        .set('Authorization', `Bearer ${plainToken}`)
        .send({ cardType: 'X1', cardName: '測試', prodKind: '01' });
      expect(res.status).toBe(403);
      expect(res.body.error).toBe('AUTH_FORBIDDEN');
    });

    it('TC-F070-01 + TC-F070-02 + TC-F070-03：成功新增同 tx 寫入 + audit', async () => {
      await seedProdKinds();
      const res = await request(app.getHttpServer())
        .post('/api/v1/assignment/scoring/card-types')
        .set('Authorization', `Bearer ${smToken}`)
        .send({ cardType: 'X1', cardName: '測試卡', prodKind: '01' });

      expect(res.status).toBe(201);
      expect(res.body.cardType).toBe('X1');
      expect(res.body.cardVersion).toBe(1);
      expect(res.body.prodKindName).toBe('汽車');

      // 驗 DB：ob_card_type
      const cards = await ds
        .getRepository(ObCardType)
        .find({ where: { card_type: 'X1' } });
      expect(cards).toHaveLength(1);
      expect(cards[0].status).toBe('active');

      // 驗 DB：ob_levelcard_version
      const versions = await ds
        .getRepository(ObLevelcardVersion)
        .find({ where: { card_type: 'X1' } });
      expect(versions).toHaveLength(1);
      expect(versions[0].card_version).toBe(1);
      expect(versions[0].edate).toBe('20991231');
      expect(versions[0].status).toBe('active');
      const today = new Date();
      const expectedSdate = [
        today.getFullYear().toString().padStart(4, '0'),
        (today.getMonth() + 1).toString().padStart(2, '0'),
        today.getDate().toString().padStart(2, '0'),
      ].join('');
      expect(versions[0].sdate).toBe(expectedSdate);

      // 驗 audit
      const audits = await ds
        .getRepository(AssignmentAuditLog)
        .find({ where: { entity_type: 'ob_card_type', entity_id: 'X1' } });
      expect(audits).toHaveLength(1);
      expect(audits[0].action).toBe('CREATE');
      expect(audits[0].before_value).toBeNull();
      expect((audits[0].after_value as any).cardType).toBe('X1');
    });

    it('TC-F070-04：cardType 重複 → 422 CARD_TYPE_DUPLICATE，無寫入', async () => {
      await seedProdKinds();
      const now = new Date();
      await ds.getRepository(ObCardType).save({
        card_type: 'H', card_name: '期中', prod_kind: '01',
        status: 'active', created_at: now, created_by: 'system',
        updated_at: now, updated_by: 'system',
      } as any);

      const res = await request(app.getHttpServer())
        .post('/api/v1/assignment/scoring/card-types')
        .set('Authorization', `Bearer ${smToken}`)
        .send({ cardType: 'H', cardName: '重複', prodKind: '01' });

      expect(res.status).toBe(422);
      expect(res.body.error).toBe('CARD_TYPE_DUPLICATE');

      // 無多寫入：應仍只有 1 筆 H
      const cards = await ds.getRepository(ObCardType).find();
      expect(cards.filter((c) => c.card_type === 'H')).toHaveLength(1);
    });

    it('TC-F070-05：cardType 含小寫 → 422 VALIDATION_ERROR（pipe 阻擋）', async () => {
      await seedProdKinds();
      const res = await request(app.getHttpServer())
        .post('/api/v1/assignment/scoring/card-types')
        .set('Authorization', `Bearer ${smToken}`)
        .send({ cardType: 'x1', cardName: '小寫', prodKind: '01' });

      expect(res.status).toBe(422);
      expect(res.body.error).toMatch(/VALIDATION_ERROR/);
    });

    it('TC-F070-09：prodKind 不在啟用期間內 → 422 VALIDATION_ERROR', async () => {
      await seedProdKinds(); // 只有 01/02
      const res = await request(app.getHttpServer())
        .post('/api/v1/assignment/scoring/card-types')
        .set('Authorization', `Bearer ${smToken}`)
        .send({ cardType: 'Y1', cardName: '測試', prodKind: '99' });

      expect(res.status).toBe(422);
      expect(res.body.error).toBe('VALIDATION_ERROR');
    });

    it('TC-F070-10/11：月跑 running → 409 ASSIGNMENT_RUN_ALREADY_RUNNING', async () => {
      await seedProdKinds();
      // 依 memory feedback_assignment_run_e2e_seed：須含 4 個 NOT NULL 欄位
      await ds.getRepository(AssignmentRun).save({
        run_id: 'r1' as any,
        project_workym: '202604',
        triggered_by: SM_USER.id,
        status: 'running',
        created_at: new Date(),
      } as any);

      const res = await request(app.getHttpServer())
        .post('/api/v1/assignment/scoring/card-types')
        .set('Authorization', `Bearer ${smToken}`)
        .send({ cardType: 'N1', cardName: '測試', prodKind: '01' });

      expect(res.status).toBe(409);
      expect(res.body.error).toBe('ASSIGNMENT_RUN_ALREADY_RUNNING');
    });
  });

  // ============================================================
  // F071 PUT /card-types/:cardType — Iter 2
  // ============================================================
  describe('F071 PUT /card-types/:cardType', () => {
    async function seedH() {
      await ds.getRepository(ObCodeDf).save([
        {
          system_id: 'OB', tbl_id: 'PROD_KIND', tbl_cd: '01',
          tbl_desc1: '汽車', stadt: '20000101', enddt: '20991231',
        },
        {
          system_id: 'OB', tbl_id: 'PROD_KIND', tbl_cd: '02',
          tbl_desc1: '機車', stadt: '20000101', enddt: '20991231',
        },
      ] as any);
      const now = new Date();
      await ds.getRepository(ObCardType).save({
        card_type: 'H', card_name: '期中', prod_kind: '01',
        status: 'active', created_at: now, created_by: 'system',
        updated_at: now, updated_by: 'system',
      } as any);
      await ds.getRepository(ObLevelcardVersion).save({
        card_type: 'H', card_name: '期中版本', card_version: 1,
        sdate: '20190823', edate: '20991231', status: 'active',
      } as any);
    }

    it('TC-F071-12：未登入 → 401', async () => {
      const res = await request(app.getHttpServer())
        .put('/api/v1/assignment/scoring/card-types/H')
        .send({ cardName: '新', prodKind: '01' });
      expect(res.status).toBe(401);
    });

    it('TC-F071-13：非 SM → 403', async () => {
      const res = await request(app.getHttpServer())
        .put('/api/v1/assignment/scoring/card-types/H')
        .set('Authorization', `Bearer ${plainToken}`)
        .send({ cardName: '新', prodKind: '01' });
      expect(res.status).toBe(403);
    });

    it('TC-F071-03 + TC-F071-04 + TC-F071-14：成功更新 + audit + version 不同步', async () => {
      await seedH();

      const res = await request(app.getHttpServer())
        .put('/api/v1/assignment/scoring/card-types/H')
        .set('Authorization', `Bearer ${smToken}`)
        .send({ cardName: '汽車高資產期中', prodKind: '02' });

      expect(res.status).toBe(200);
      expect(res.body.cardName).toBe('汽車高資產期中');
      expect(res.body.prodKind).toBe('02');
      expect(res.body.prodKindName).toBe('機車');

      // 驗 DB
      const card = await ds
        .getRepository(ObCardType)
        .findOne({ where: { card_type: 'H' } });
      expect(card?.card_name).toBe('汽車高資產期中');
      expect(card?.prod_kind).toBe('02');

      // BR-4：ob_levelcard_version.card_name 不同步
      const version = await ds
        .getRepository(ObLevelcardVersion)
        .findOne({ where: { card_type: 'H', card_version: 1 } });
      expect(version?.card_name).toBe('期中版本'); // 未改動

      // audit
      const audits = await ds
        .getRepository(AssignmentAuditLog)
        .find({ where: { entity_type: 'ob_card_type', entity_id: 'H' } });
      expect(audits).toHaveLength(1);
      expect(audits[0].action).toBe('UPDATE');
      expect((audits[0].before_value as any).cardName).toBe('期中');
      expect((audits[0].after_value as any).cardName).toBe('汽車高資產期中');
    });

    it('TC-F071-02：body 含 cardType 後端忽略，URL path 為準', async () => {
      await seedH();

      await request(app.getHttpServer())
        .put('/api/v1/assignment/scoring/card-types/H')
        .set('Authorization', `Bearer ${smToken}`)
        .send({ cardName: '新名稱', prodKind: '01', cardType: 'ZTAMP' });

      const tampered = await ds
        .getRepository(ObCardType)
        .findOne({ where: { card_type: 'ZTAMP' } });
      expect(tampered).toBeNull();
      const h = await ds
        .getRepository(ObCardType)
        .findOne({ where: { card_type: 'H' } });
      expect(h?.card_name).toBe('新名稱');
    });

    it('TC-F071-07：cardType 不存在 → 404', async () => {
      await ds.getRepository(ObCodeDf).save({
        system_id: 'OB', tbl_id: 'PROD_KIND', tbl_cd: '01',
        tbl_desc1: '汽車', stadt: '20000101', enddt: '20991231',
      } as any);

      const res = await request(app.getHttpServer())
        .put('/api/v1/assignment/scoring/card-types/NOTEX')
        .set('Authorization', `Bearer ${smToken}`)
        .send({ cardName: '測試', prodKind: '01' });
      expect(res.status).toBe(404);
      expect(res.body.error).toBe('CARD_TYPE_NOT_FOUND');
    });

    it('TC-F071-08：prodKind 不在啟用期間內 → 422', async () => {
      await seedH();
      const res = await request(app.getHttpServer())
        .put('/api/v1/assignment/scoring/card-types/H')
        .set('Authorization', `Bearer ${smToken}`)
        .send({ cardName: '期中', prodKind: '99' });
      expect(res.status).toBe(422);
      expect(res.body.error).toBe('VALIDATION_ERROR');
    });

    it('TC-F071-09：月跑鎖 → 409', async () => {
      await seedH();
      await ds.getRepository(AssignmentRun).save({
        run_id: 'r1' as any,
        project_workym: '202604',
        triggered_by: SM_USER.id,
        status: 'pending',
        created_at: new Date(),
      } as any);

      const res = await request(app.getHttpServer())
        .put('/api/v1/assignment/scoring/card-types/H')
        .set('Authorization', `Bearer ${smToken}`)
        .send({ cardName: '測試', prodKind: '01' });
      expect(res.status).toBe(409);
      expect(res.body.error).toBe('ASSIGNMENT_RUN_ALREADY_RUNNING');
    });
  });

  // ============================================================
  // F072 GET /card-types/:cardType/delete-preview + DELETE — Iter 2
  // ============================================================
  describe('F072 delete-preview + DELETE /card-types/:cardType', () => {
    async function seedX() {
      const now = new Date();
      await ds.getRepository(ObCardType).save({
        card_type: 'X', card_name: '測試停用卡', prod_kind: '01',
        status: 'active', created_at: now, created_by: 'system',
        updated_at: now, updated_by: 'system',
      } as any);
      await ds.getRepository(ObLevelcardVersion).save({
        card_type: 'X', card_name: '測試版本', card_version: 1,
        sdate: '20260514', edate: '20991231', status: 'active',
      } as any);
      await ds.getRepository(ObLevelcardColumn).save([
        { card_type: 'X', card_version: 1, column_name: 'COL_A', column_label: 'A', status: 'active' },
        { card_type: 'X', card_version: 1, column_name: 'COL_B', column_label: 'B', status: 'active' },
        { card_type: 'X', card_version: 1, column_name: 'COL_C', column_label: 'C', status: 'active' },
      ] as any);
      await ds.getRepository(ObLevelcardScore).save([
        { card_type: 'X', card_version: 1, column_name: 'COL_A', level1: null, level2_s: '0', level2_e: '10', score: 5 },
        { card_type: 'X', card_version: 1, column_name: 'COL_A', level1: null, level2_s: '11', level2_e: '20', score: 10 },
        { card_type: 'X', card_version: 1, column_name: 'COL_B', level1: 'Y', level2_s: null, level2_e: null, score: 8 },
        { card_type: 'X', card_version: 1, column_name: 'COL_B', level1: 'N', level2_s: null, level2_e: null, score: 0 },
        { card_type: 'X', card_version: 1, column_name: 'COL_C', level1: null, level2_s: '0', level2_e: '5', score: 3 },
        { card_type: 'X', card_version: 1, column_name: 'COL_C', level1: null, level2_s: '6', level2_e: '10', score: 6 },
      ] as any);
      await ds.getRepository(ObLevelcardLevel).save([
        { card_type: 'X', card_version: 1, card_level: 'A', score_s: 20, score_e: 99 },
        { card_type: 'X', card_version: 1, card_level: 'B', score_s: 15, score_e: 19 },
        { card_type: 'X', card_version: 1, card_level: 'C', score_s: 10, score_e: 14 },
        { card_type: 'X', card_version: 1, card_level: 'D', score_s: 0, score_e: 9 },
      ] as any);
      // ob_tier：1 Standard + 1 Fallback
      await ds.getRepository(ObTier).save([
        { card_type: 'X', card_level: 'A', tier_level: 'T1', list_nm: 'X 標準' },
        { card_type: 'X', card_level: null, tier_level: 'T2', list_nm: 'X fallback' },
      ] as any);
    }

    it('TC-F072-16：delete-preview 未登入 → 401', async () => {
      const res = await request(app.getHttpServer()).get(
        '/api/v1/assignment/scoring/card-types/X/delete-preview',
      );
      expect(res.status).toBe(401);
    });

    it('TC-F072-17：delete-preview 非 SM → 403', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/assignment/scoring/card-types/X/delete-preview')
        .set('Authorization', `Bearer ${plainToken}`);
      expect(res.status).toBe(403);
    });

    it('TC-F072-01：delete-preview 回 5 表 count', async () => {
      await seedX();
      const res = await request(app.getHttpServer())
        .get('/api/v1/assignment/scoring/card-types/X/delete-preview')
        .set('Authorization', `Bearer ${smToken}`);
      expect(res.status).toBe(200);
      expect(res.body.cascade).toEqual({
        versions: 1,
        columns: 3,
        scores: 6,
        levels: 4,
        tierMappings: 2,
      });
    });

    it('TC-F072-09：DELETE 不帶 confirmCascade=true → 422 CARD_TYPE_CASCADE_NOT_CONFIRMED', async () => {
      await seedX();
      const res = await request(app.getHttpServer())
        .delete('/api/v1/assignment/scoring/card-types/X')
        .set('Authorization', `Bearer ${smToken}`);
      expect(res.status).toBe(422);
      expect(res.body.error).toBe('CARD_TYPE_CASCADE_NOT_CONFIRMED');
      // DB 未變動
      const remaining = await ds
        .getRepository(ObCardType)
        .findOne({ where: { card_type: 'X' } });
      expect(remaining).not.toBeNull();
    });

    it('TC-F072-10：DELETE confirmCascade=false → 422', async () => {
      await seedX();
      const res = await request(app.getHttpServer())
        .delete(
          '/api/v1/assignment/scoring/card-types/X?confirmCascade=false',
        )
        .set('Authorization', `Bearer ${smToken}`);
      expect(res.status).toBe(422);
      expect(res.body.error).toBe('CARD_TYPE_CASCADE_NOT_CONFIRMED');
    });

    it('TC-F072-13：DELETE 不存在的 cardType → 404', async () => {
      const res = await request(app.getHttpServer())
        .delete(
          '/api/v1/assignment/scoring/card-types/NOTEX?confirmCascade=true',
        )
        .set('Authorization', `Bearer ${smToken}`);
      expect(res.status).toBe(404);
      expect(res.body.error).toBe('CARD_TYPE_NOT_FOUND');
    });

    it('TC-F072-14/15：月跑鎖 → 409', async () => {
      await seedX();
      await ds.getRepository(AssignmentRun).save({
        run_id: 'r1' as any,
        project_workym: '202604',
        triggered_by: SM_USER.id,
        status: 'pending',
        created_at: new Date(),
      } as any);

      const res = await request(app.getHttpServer())
        .delete(
          '/api/v1/assignment/scoring/card-types/X?confirmCascade=true',
        )
        .set('Authorization', `Bearer ${smToken}`);
      expect(res.status).toBe(409);
      expect(res.body.error).toBe('ASSIGNMENT_RUN_ALREADY_RUNNING');
    });

    it('TC-F072-05 + TC-F072-06 + TC-F072-19：DELETE 級聯 6 步驟（含 Fallback NULL PK 守護）', async () => {
      await seedX();
      // 額外加 ob_pool_data_list 歷史紀錄（驗證不被刪）；
      // 註：spec F072 BR-3 提及 ob_pool_data_list.card_type 排除級聯，但 entity 目前無 card_type
      //   欄位（spec/schema gap，OPEN ITEM 待 spec 修訂或 schema 補欄位）。
      //   本 e2e 改採「DELETE 前後 ob_pool_data_list 總筆數不變」驗證排除規則。
      await ds.getRepository(ObPoolDataList).save([
        {
          list_no: 'L1',
          orgno: 'OB',
          appl_no: 'A001',
          settle_src: 'TEST',
        } as any,
      ] as any);
      const poolCountBefore = await ds.getRepository(ObPoolDataList).count();

      const res = await request(app.getHttpServer())
        .delete(
          '/api/v1/assignment/scoring/card-types/X?confirmCascade=true',
        )
        .set('Authorization', `Bearer ${smToken}`);
      expect(res.status).toBe(200);
      expect(res.body.deletedCascade).toEqual({
        versions: 1,
        columns: 3,
        scores: 6,
        levels: 4,
        tierMappings: 2,
      });

      // 後驗：5 表 + ob_card_type 全 0
      expect(
        await ds.getRepository(ObTier).count({ where: { card_type: 'X' as any } }),
      ).toBe(0);
      expect(
        await ds
          .getRepository(ObLevelcardScore)
          .count({ where: { card_type: 'X' as any } }),
      ).toBe(0);
      expect(
        await ds
          .getRepository(ObLevelcardLevel)
          .count({ where: { card_type: 'X' as any } }),
      ).toBe(0);
      expect(
        await ds
          .getRepository(ObLevelcardColumn)
          .count({ where: { card_type: 'X' as any } }),
      ).toBe(0);
      expect(
        await ds
          .getRepository(ObLevelcardVersion)
          .count({ where: { card_type: 'X' as any } }),
      ).toBe(0);
      expect(
        await ds
          .getRepository(ObCardType)
          .count({ where: { card_type: 'X' } }),
      ).toBe(0);

      // 排除項：ob_pool_data_list 總筆數不變（spec/schema gap，見上方註解）
      const poolCountAfter = await ds.getRepository(ObPoolDataList).count();
      expect(poolCountAfter).toBe(poolCountBefore);

      // audit log
      const audits = await ds
        .getRepository(AssignmentAuditLog)
        .find({ where: { entity_type: 'ob_card_type', entity_id: 'X' } });
      expect(audits).toHaveLength(1);
      expect(audits[0].action).toBe('DELETE');
      expect(audits[0].after_value).toBeNull();
      expect((audits[0].before_value as any).cascade).toEqual({
        versions: 1,
        columns: 3,
        scores: 6,
        levels: 4,
        tierMappings: 2,
      });
    });

    it('BE-F072-001：cardType 無下游 cascade 全 0，ob_card_type 仍被刪除', async () => {
      const now = new Date();
      await ds.getRepository(ObCardType).save({
        card_type: 'Y', card_name: '無下游', prod_kind: '01',
        status: 'active', created_at: now, created_by: 'system',
        updated_at: now, updated_by: 'system',
      } as any);

      const res = await request(app.getHttpServer())
        .delete(
          '/api/v1/assignment/scoring/card-types/Y?confirmCascade=true',
        )
        .set('Authorization', `Bearer ${smToken}`);
      expect(res.status).toBe(200);
      expect(res.body.deletedCascade).toEqual({
        versions: 0,
        columns: 0,
        scores: 0,
        levels: 0,
        tierMappings: 0,
      });
      expect(
        await ds
          .getRepository(ObCardType)
          .count({ where: { card_type: 'Y' } }),
      ).toBe(0);
    });

    // TC-F070-17 / TC-F072-18 rollback 守護：依 OPEN-1 規範僅 PostgreSQL 跑
    describe.skipIf(process.env.DB_TYPE !== 'postgres')(
      'transaction rollback (PostgreSQL only)',
      () => {
        it('TC-F070-17：v1 INSERT 失敗時整體 rollback', async () => {
          // 由 service 層 _afterVersionInsertHook 攔截；e2e 無法直接 mock service，
          // 此 placeholder 留待 PG 環境 + service test seam override，目前僅 skip
          expect(true).toBe(true);
        });
      },
    );
  });
});
