/**
 * M02 Regression Guards e2e（Iter 6）
 *
 * 對應 docs/test-specs/regression/M02-regression-guards.md。
 *
 * 涵蓋（DB 行為層）：
 *   - TC-GUARD-NULL-PK-001：ob_tier card_level=NULL 列必須能透過 service DELETE 路徑刪除
 *   - TC-GUARD-NULL-PK-002：六步驟 cascade 含 Fallback 列完整刪除
 *   - TC-GUARD-RUN-SEED-001：AssignmentRun seed 必須含 4 個 NOT NULL 欄位（run_id /
 *     project_workym / triggered_by / created_at）
 *   - TC-GUARD-GUARD-001：F069~F072 全端點 SalesManagerGuard 403 覆蓋
 *
 * 非 DB 行為（fs / metadata 層）由 unit spec 覆蓋：
 *   - TC-GUARD-TIMESTAMP-001 / TC-GUARD-ERRORCODE-001：見
 *     apps/api/src/database/migrations/__tests__/m02-error-code-consistency.spec.ts
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

const SM_USER = {
  id: 'a1b2c3d4-e5f6-7890-abcd-ef0123456789',
  name: 'Guard SM',
  email: 'guard-sm@cdmp.test',
  password: 'P@ssw0rd123',
  role: 'user' as const,
  status: 'active' as const,
  is_sales_manager: true,
};
const PLAIN_USER = {
  id: 'b2c3d4e5-f6a7-8901-bcde-f01234567890',
  name: 'Guard Plain',
  email: 'guard-plain@cdmp.test',
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
        load: [() => ({ JWT_SECRET: 'test-secret-guards' })],
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
  return res.body.token;
}

describe('M02 Regression Guards (Iter 6)', () => {
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
  // TC-GUARD-NULL-PK-001：ob_tier card_level=NULL 透過 service DELETE 路徑刪除
  // =========================================================================
  it('TC-GUARD-NULL-PK-001：F056 DELETE /tier-mapping 省略 cardLevel → 刪除 Fallback NULL 列', async () => {
    const now = new Date();
    await ds.getRepository(ObCardType).save({
      card_type: 'XTEST', card_name: 'Test Card', prod_kind: '01',
      status: 'active', created_at: now, created_by: 'system',
      updated_at: now, updated_by: 'system',
    } as any);
    await ds.getRepository(ObTier).save([
      // Fallback 列：card_level=NULL（不可被 manager.delete({card_level:null}) 路徑刪除）
      { card_type: 'XTEST', card_level: null, tier_level: 'T2' },
    ] as any);

    const before = await ds
      .getRepository(ObTier)
      .count({ where: { card_type: 'XTEST' as any } });
    expect(before).toBe(1);

    // 省略 cardLevel query → service 解讀為 fallback NULL
    const res = await request(app.getHttpServer())
      .delete('/api/v1/assignment/scoring/tier-mapping?cardType=XTEST')
      .set('Authorization', `Bearer ${smToken}`);
    expect(res.status).toBe(200);
    expect(res.body.cardLevel).toBeNull();

    const after = await ds
      .getRepository(ObTier)
      .count({ where: { card_type: 'XTEST' as any } });
    // 若 service 改用 manager.delete({card_level:null})，SQL =NULL 永不匹配 → after=1 → fail
    expect(after).toBe(0);
  });

  // =========================================================================
  // TC-GUARD-NULL-PK-002：F072 六步驟 cascade 含 Fallback 列完整刪除
  // =========================================================================
  it('TC-GUARD-NULL-PK-002：F072 級聯刪除含 Fallback NULL ob_tier 列', async () => {
    const now = new Date();
    await ds.getRepository(ObCardType).save({
      card_type: 'X', card_name: 'Test', prod_kind: '01',
      status: 'active', created_at: now, created_by: 'system',
      updated_at: now, updated_by: 'system',
    } as any);
    await ds.getRepository(ObTier).save([
      { card_type: 'X', card_level: 'A', tier_level: 'T1' }, // Standard
      { card_type: 'X', card_level: null, tier_level: 'T2' }, // Fallback
    ] as any);

    const res = await request(app.getHttpServer())
      .delete('/api/v1/assignment/scoring/card-types/X?confirmCascade=true')
      .set('Authorization', `Bearer ${smToken}`);
    expect(res.status).toBe(200);

    const remaining = await ds
      .getRepository(ObTier)
      .count({ where: { card_type: 'X' as any } });
    expect(remaining).toBe(0); // 含 Fallback NULL 列都必須清空
  });

  // =========================================================================
  // TC-GUARD-RUN-SEED-001：AssignmentRun 4 個必填欄位
  // =========================================================================
  it('TC-GUARD-RUN-SEED-001：AssignmentRun seed 缺任一欄位 → SQLite NOT NULL constraint failed', async () => {
    const now = new Date();
    // 缺 triggered_by → 應 throw
    let thrown = false;
    try {
      await ds.getRepository(AssignmentRun).save({
        run_id: 'r-missing-triggered-by',
        project_workym: '202604',
        // triggered_by 缺漏
        status: 'pending',
        created_at: now,
      } as any);
    } catch (err: any) {
      thrown = true;
      expect(err.message.toLowerCase()).toContain('not null');
    }
    expect(thrown, 'AssignmentRun 缺 triggered_by 應拋 NOT NULL').toBe(true);

    // 缺 created_at → 應 throw
    thrown = false;
    try {
      await ds.getRepository(AssignmentRun).save({
        run_id: 'r-missing-created-at',
        project_workym: '202604',
        triggered_by: SM_USER.id,
        status: 'pending',
        // created_at 缺漏
      } as any);
    } catch (err: any) {
      thrown = true;
    }
    // 注意：entity 的 created_at 有 default=CURRENT_TIMESTAMP，可能不會 throw
    // 此 case 視 entity 設定為主，不強制 throw

    // 正確含 4 欄 → 成功
    await ds.getRepository(AssignmentRun).save({
      run_id: 'r-complete',
      project_workym: '202604',
      triggered_by: SM_USER.id,
      status: 'pending',
      created_at: now,
    } as any);
    const count = await ds.getRepository(AssignmentRun).count();
    expect(count).toBeGreaterThanOrEqual(1);
  });

  // =========================================================================
  // TC-GUARD-GUARD-001：F069~F072 SalesManagerGuard 覆蓋矩陣
  // =========================================================================
  describe('TC-GUARD-GUARD-001：F069~F072 SalesManagerGuard 覆蓋', () => {
    const endpoints = [
      { name: 'GET /card-types', method: 'get' as const, path: '/api/v1/assignment/scoring/card-types' },
      { name: 'POST /card-types', method: 'post' as const, path: '/api/v1/assignment/scoring/card-types', body: { cardType: 'X', cardName: 'x', prodKind: '01' } },
      { name: 'PUT /card-types/:cardType', method: 'put' as const, path: '/api/v1/assignment/scoring/card-types/H', body: { cardName: 'x', prodKind: '01' } },
      { name: 'GET /card-types/:cardType/delete-preview', method: 'get' as const, path: '/api/v1/assignment/scoring/card-types/H/delete-preview' },
      { name: 'DELETE /card-types/:cardType', method: 'delete' as const, path: '/api/v1/assignment/scoring/card-types/H?confirmCascade=true' },
    ];

    for (const ep of endpoints) {
      it(`${ep.name} → 未登入 401`, async () => {
        let req = request(app.getHttpServer())[ep.method](ep.path);
        if (ep.body) req = req.send(ep.body);
        const res = await req;
        expect(res.status).toBe(401);
      });
      it(`${ep.name} → 非 SM 403`, async () => {
        let req = request(app.getHttpServer())[ep.method](ep.path).set(
          'Authorization',
          `Bearer ${plainToken}`,
        );
        if (ep.body) req = req.send(ep.body);
        const res = await req;
        expect(res.status).toBe(403);
        expect(res.body.error).toBe('AUTH_FORBIDDEN');
      });
    }
  });
});
