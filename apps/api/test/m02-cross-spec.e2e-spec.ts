/**
 * M02 跨 Spec 整合 e2e（Iter 6）
 *
 * 對應 docs/test-specs/integration/M02-cross-spec-tests.md。
 *
 * 涵蓋：
 *   - IT-CASCADE-001：F072 6 步驟級聯刪除完整筆數驗證 + 排除項保留
 *   - IT-LOCK-001：月跑 running 時 9 端點一致性（含錯誤碼分流）
 *   - IT-MIGRATION-001：D-CT-02 seed idempotent（同 cardType 重跑 ON CONFLICT DO NOTHING）
 *
 * 註：
 *   - Frontend tab-linkage 由 RTL test 覆蓋（apps/web/src/pages/assignment/__tests__）
 *   - Migration idempotent 由 m02-migrations-sqlite-smoke.spec.ts 已覆蓋 D-CT-02 重跑
 *   - Transaction Rollback (IT-CASCADE-002) 需 PostgreSQL Test Container（skipIf 標註）
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

// B2 替換（AD-E07 v3.0 / 2026-05-16）：SM fixture 升級為 director
const SM_USER = {
  id: 'a1b2c3d4-e5f6-7890-abcd-ef0123456789',
  name: 'M02 Cross-Spec Director',
  email: 'm02-cross-spec@cdmp.test',
  password: 'P@ssw0rd123',
  role: 'user' as const,
  status: 'active' as const,
  is_sales_manager: true,
  business_role: 'director' as const,
};

async function createTestApp(): Promise<INestApplication> {
  const moduleFixture: TestingModule = await Test.createTestingModule({
    imports: [
      ConfigModule.forRoot({
        isGlobal: true,
        load: [() => ({ JWT_SECRET: 'test-secret' })],
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
      ThrottlerModule.forRoot([{ name: 'default', ttl: 60000, limit: 10000 }]),
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

  const ds = moduleFixture.get(DataSource);
  const userRepo = ds.getRepository(User);
  const passwordHash = await HashUtil.hash('P@ssw0rd123');
  await userRepo.save(
    userRepo.create({
      id: SM_USER.id,
      name: SM_USER.name,
      email: SM_USER.email,
      password_hash: passwordHash,
      role: SM_USER.role,
      status: SM_USER.status,
      is_sales_manager: SM_USER.is_sales_manager,
      business_role: SM_USER.business_role,
    }),
  );

  return app;
}

async function login(app: INestApplication): Promise<string> {
  const res = await request(app.getHttpServer())
    .post('/api/v1/auth/login')
    .send({ email: SM_USER.email, password: 'P@ssw0rd123' });
  if (!res.body?.token) throw new Error('Login failed');
  return res.body.token;
}

describe('M02 Cross-Spec Integration (Iter 6)', () => {
  let app: INestApplication;
  let token: string;
  let ds: DataSource;

  beforeAll(async () => {
    app = await createTestApp();
    ds = app.get(DataSource);
    token = await login(app);
  });

  afterAll(async () => {
    await app?.close();
  });

  beforeEach(async () => {
    // 清空 E07 相關表
    await ds.getRepository(AssignmentAuditLog).clear();
    await ds.getRepository(AssignmentRun).clear();
    await ds.getRepository(ObTier).clear();
    await ds.getRepository(ObPoolDataList).clear();
    await ds.getRepository(ObLevelcardLevel).clear();
    await ds.getRepository(ObLevelcardScore).clear();
    await ds.getRepository(ObLevelcardColumn).clear();
    await ds.getRepository(ObLevelcardVersion).clear();
    await ds
      .getRepository(ObListDefinition)
      .createQueryBuilder()
      .delete()
      .execute();
    await ds.getRepository(ObCardType).clear();
    await ds
      .getRepository(ObCodeDf)
      .createQueryBuilder()
      .delete()
      .execute();
  });

  // =========================================================================
  // IT-CASCADE-001：F072 6 步驟級聯刪除完整筆數驗證
  // =========================================================================
  describe('IT-CASCADE-001：F072 6 步驟級聯刪除 + 排除項保留', () => {
    async function seedFullX() {
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
      // 1 Standard + 1 Fallback ob_tier
      await ds.getRepository(ObTier).save([
        { card_type: 'X', card_level: 'A', tier_level: 'T1', list_nm: 'X 標準' },
        { card_type: 'X', card_level: null, tier_level: 'T2', list_nm: 'X fallback' },
      ] as any);
      // 排除項：ob_pool_data_list 5 筆 + ob_list_definition 紀錄保留驗證
      await ds.getRepository(ObPoolDataList).save([
        { list_no: 'L1', orgno: 'OB', appl_no: 'A001', settle_src: 'TEST' } as any,
      ] as any);
    }

    it('完整 6 步驟刪除：5 表 + ob_card_type 全清空；排除項保留；audit log 正確', async () => {
      await seedFullX();

      const poolBefore = await ds.getRepository(ObPoolDataList).count();

      const res = await request(app.getHttpServer())
        .delete(
          '/api/v1/assignment/scoring/card-types/X?confirmCascade=true',
        )
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(200);
      expect(res.body.deletedCascade).toEqual({
        versions: 1,
        columns: 3,
        scores: 6,
        levels: 4,
        tierMappings: 2,
      });

      // 5 表 + ob_card_type 全 0
      expect(
        await ds.getRepository(ObTier).count({ where: { card_type: 'X' as any } }),
      ).toBe(0);
      expect(
        await ds.getRepository(ObLevelcardScore).count({ where: { card_type: 'X' as any } }),
      ).toBe(0);
      expect(
        await ds.getRepository(ObLevelcardLevel).count({ where: { card_type: 'X' as any } }),
      ).toBe(0);
      expect(
        await ds.getRepository(ObLevelcardColumn).count({ where: { card_type: 'X' as any } }),
      ).toBe(0);
      expect(
        await ds.getRepository(ObLevelcardVersion).count({ where: { card_type: 'X' as any } }),
      ).toBe(0);
      expect(
        await ds.getRepository(ObCardType).count({ where: { card_type: 'X' } }),
      ).toBe(0);

      // 排除項：ob_pool_data_list 不變
      const poolAfter = await ds.getRepository(ObPoolDataList).count();
      expect(poolAfter).toBe(poolBefore);

      // audit log
      const audits = await ds
        .getRepository(AssignmentAuditLog)
        .find({ where: { entity_type: 'ob_card_type', entity_id: 'X' } });
      expect(audits).toHaveLength(1);
      expect(audits[0].action).toBe('DELETE');
      expect((audits[0].before_value as any).cascade).toEqual({
        versions: 1,
        columns: 3,
        scores: 6,
        levels: 4,
        tierMappings: 2,
      });
    });

    it('Fallback NULL PK 守護：含 card_level=NULL 的 ob_tier 列被刪除（不殘留）', async () => {
      await seedFullX();
      // 確認 seed 有 fallback 紀錄
      const fallbackBefore = await ds
        .getRepository(ObTier)
        .createQueryBuilder('t')
        .where('t.card_type = :ct', { ct: 'X' })
        .andWhere('t.card_level IS NULL')
        .getCount();
      expect(fallbackBefore).toBe(1);

      await request(app.getHttpServer())
        .delete(
          '/api/v1/assignment/scoring/card-types/X?confirmCascade=true',
        )
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      const fallbackAfter = await ds
        .getRepository(ObTier)
        .createQueryBuilder('t')
        .where('t.card_type = :ct', { ct: 'X' })
        .andWhere('t.card_level IS NULL')
        .getCount();
      // 若 service 改成 manager.delete({card_level:null}) 路徑，此 fallback 列會殘留 → fail
      expect(fallbackAfter).toBe(0);
    });
  });

  // =========================================================================
  // IT-LOCK-001：月跑 running 時所有寫入端點一致回 409
  // =========================================================================
  describe('IT-LOCK-001：月跑鎖 9 端點一致性', () => {
    async function seedHWithLock(status: 'pending' | 'running' = 'running') {
      const now = new Date();
      await ds.getRepository(ObCardType).save({
        card_type: 'H', card_name: '期中', prod_kind: '01',
        status: 'active', created_at: now, created_by: 'system',
        updated_at: now, updated_by: 'system',
      } as any);
      await ds.getRepository(ObLevelcardVersion).save({
        card_type: 'H', card_name: '期中', card_version: 1,
        sdate: '20260101', edate: '20991231', status: 'active',
      } as any);
      await ds.getRepository(AssignmentRun).save({
        run_id: 'lock-test',
        project_workym: '202604',
        triggered_by: SM_USER.id,
        status,
        created_at: now,
      } as any);
    }

    it('POST /card-types → 409 ASSIGNMENT_RUN_ALREADY_RUNNING', async () => {
      await seedHWithLock();
      await ds.getRepository(ObCodeDf).save({
        system_id: 'OB', tbl_id: 'PROD_KIND', tbl_cd: '01',
        tbl_desc1: '汽車', stadt: '20000101', enddt: '20991231',
      } as any);

      const res = await request(app.getHttpServer())
        .post('/api/v1/assignment/scoring/card-types')
        .set('Authorization', `Bearer ${token}`)
        .send({ cardType: 'N1', cardName: '新', prodKind: '01' });
      expect(res.status).toBe(409);
      expect(res.body.error).toBe('ASSIGNMENT_RUN_ALREADY_RUNNING');
    });

    it('PUT /card-types/H → 409 ASSIGNMENT_RUN_ALREADY_RUNNING', async () => {
      await seedHWithLock();
      await ds.getRepository(ObCodeDf).save({
        system_id: 'OB', tbl_id: 'PROD_KIND', tbl_cd: '01',
        tbl_desc1: '汽車', stadt: '20000101', enddt: '20991231',
      } as any);

      const res = await request(app.getHttpServer())
        .put('/api/v1/assignment/scoring/card-types/H')
        .set('Authorization', `Bearer ${token}`)
        .send({ cardName: '新名', prodKind: '01' });
      expect(res.status).toBe(409);
      expect(res.body.error).toBe('ASSIGNMENT_RUN_ALREADY_RUNNING');
    });

    it('DELETE /card-types/H → 409 ASSIGNMENT_RUN_ALREADY_RUNNING', async () => {
      await seedHWithLock();
      const res = await request(app.getHttpServer())
        .delete('/api/v1/assignment/scoring/card-types/H?confirmCascade=true')
        .set('Authorization', `Bearer ${token}`);
      expect(res.status).toBe(409);
      expect(res.body.error).toBe('ASSIGNMENT_RUN_ALREADY_RUNNING');
    });

    it('PUT /dimensions → 409 SCORING_VERSION_LOCKED', async () => {
      await seedHWithLock();
      const res = await request(app.getHttpServer())
        .put('/api/v1/assignment/scoring/dimensions')
        .set('Authorization', `Bearer ${token}`)
        .send({ cardType: 'H', cardVersion: 1, dimensions: [] });
      expect(res.status).toBe(409);
      expect(res.body.error).toBe('SCORING_VERSION_LOCKED');
    });

    it('POST /dimensions → 409 SCORING_VERSION_LOCKED', async () => {
      await seedHWithLock();
      const res = await request(app.getHttpServer())
        .post('/api/v1/assignment/scoring/dimensions')
        .set('Authorization', `Bearer ${token}`)
        .send({
          cardType: 'H',
          cardVersion: 1,
          columnName: 'TEST',
          columnLabel: 'test',
          scores: [],
        });
      expect(res.status).toBe(409);
      expect(res.body.error).toBe('SCORING_VERSION_LOCKED');
    });

    it('PUT /card-levels → 409 SCORING_VERSION_LOCKED', async () => {
      await seedHWithLock();
      const res = await request(app.getHttpServer())
        .put('/api/v1/assignment/scoring/card-levels')
        .set('Authorization', `Bearer ${token}`)
        .send({
          cardType: 'H',
          cardVersion: 1,
          levels: [{ cardLevel: 'A', scoreS: 0, scoreE: 99 }],
        });
      expect(res.status).toBe(409);
      expect(res.body.error).toBe('SCORING_VERSION_LOCKED');
    });

    it('DELETE /card-levels → 409 SCORING_VERSION_LOCKED', async () => {
      await seedHWithLock();
      const res = await request(app.getHttpServer())
        .delete(
          '/api/v1/assignment/scoring/card-levels?cardType=H&cardVersion=1&cardLevel=A',
        )
        .set('Authorization', `Bearer ${token}`);
      expect(res.status).toBe(409);
      expect(res.body.error).toBe('SCORING_VERSION_LOCKED');
    });

    it('PUT /tier-mapping → 409 SCORING_VERSION_LOCKED', async () => {
      await seedHWithLock();
      const res = await request(app.getHttpServer())
        .put('/api/v1/assignment/scoring/tier-mapping?cardType=H')
        .set('Authorization', `Bearer ${token}`)
        .send({ mappings: [{ cardType: 'H', cardLevel: 'A', tierLevel: 'T1' }] });
      expect(res.status).toBe(409);
      expect(res.body.error).toBe('SCORING_VERSION_LOCKED');
    });

    it('POST /tier-mapping → 409 SCORING_VERSION_LOCKED', async () => {
      await seedHWithLock();
      const res = await request(app.getHttpServer())
        .post('/api/v1/assignment/scoring/tier-mapping')
        .set('Authorization', `Bearer ${token}`)
        .send({ cardType: 'H', cardLevel: 'A', tierLevel: 'T1' });
      expect(res.status).toBe(409);
      expect(res.body.error).toBe('SCORING_VERSION_LOCKED');
    });

    it('DELETE /tier-mapping → 409 SCORING_VERSION_LOCKED', async () => {
      await seedHWithLock();
      const res = await request(app.getHttpServer())
        .delete(
          '/api/v1/assignment/scoring/tier-mapping?cardType=H&cardLevel=A',
        )
        .set('Authorization', `Bearer ${token}`);
      expect(res.status).toBe(409);
      expect(res.body.error).toBe('SCORING_VERSION_LOCKED');
    });
  });

  // =========================================================================
  // IT-MIGRATION-001：D-CT-02 seed idempotent（運行時可重複呼叫）
  // =========================================================================
  describe('IT-MIGRATION-001：D-CT-02 seed idempotent', () => {
    it('已含 H 紀錄時 POST /card-types 重複 → 422 CARD_TYPE_DUPLICATE（service 層 idempotent guard）', async () => {
      // 模擬 dump migration 已 seed H 紀錄
      const now = new Date();
      await ds.getRepository(ObCardType).save({
        card_type: 'H', card_name: '期中', prod_kind: '01',
        status: 'active', created_at: now, created_by: 'system',
        updated_at: now, updated_by: 'system',
      } as any);
      await ds.getRepository(ObCodeDf).save({
        system_id: 'OB', tbl_id: 'PROD_KIND', tbl_cd: '01',
        tbl_desc1: '汽車', stadt: '20000101', enddt: '20991231',
      } as any);

      // 第二次 POST 應 422 而非 500（service unique check + transaction 不爆）
      const res = await request(app.getHttpServer())
        .post('/api/v1/assignment/scoring/card-types')
        .set('Authorization', `Bearer ${token}`)
        .send({ cardType: 'H', cardName: '重複', prodKind: '01' });
      expect(res.status).toBe(422);
      expect(res.body.error).toBe('CARD_TYPE_DUPLICATE');
    });
  });
});
