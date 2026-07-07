/**
 * AD-E07-38 P1a — MSSQL 最小可連線＋登入 smoke slice（真實 SQL Server 2022 容器）。
 *
 * 覆蓋測試設計 AD-E07-38-P1a-test.md 之群組：
 *   CONN（三處設定點 mssql 分支可連線 + 4 表 synchronize + encrypt/trust）
 *   TYPE（型別映射實測：uuid/text/bigint/datetime2/bit + 兩個新 helper 決策）
 *   CRUD（entity round-trip：uuid PK / bcrypt / 2048 varchar / datetime2 / 中文 BIN / nullable / bigint 邊界）
 *   CASE（大小寫一致性守門 I-MSSQL-CASE-01）
 *   LOGIN（種子 admin → POST /auth/login 合法 JWT）
 *
 * Gating：連不上 MSSQL（docker compose --profile mssql up -d mssql mssql-init）→ 每個 test ctx.skip()，
 * 不偽造綠燈（feedback_mock_real_system_contract）。DB_NAME=CDMP_TEST（與 dev CDMP 隔離，R-MSSQL-P1A-01）；
 * 使用專屬 SQL schema `p1a`（跨檔隔離 + 不污染 dbo）。
 */

// 必最先 import（side-effect 設 DB_TYPE=mssql，供 entity 之 column-types helper 解析 mssql 分支值）。
import {
  restoreDbType,
  MSSQL,
  mssqlPortReachable,
  SKIP_REASON,
} from './mssql-env-preload';

// 於 preload 之後 import：data-source.ts 於載入時讀 process.env.DB_TYPE（=mssql）。
import AppDataSource from '@/database/data-source';

import {
  describe,
  it,
  expect,
  beforeAll,
  afterAll,
  vi,
} from 'vitest';
import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { ConfigModule } from '@nestjs/config';
import { ThrottlerModule } from '@nestjs/throttler';
import { DataSource, Table, TableColumn } from 'typeorm';

import { User } from '@/database/entities/user.entity';
import { Role } from '@/database/entities/role.entity';
import { TokenBlocklist } from '@/database/entities/token-blocklist.entity';
import { PasswordResetToken } from '@/database/entities/password-reset-token.entity';
import {
  uuidColumnType,
  longTextColumnType,
  longTextColumnLength,
} from '@/common/database/column-types';
import { HashUtil } from '@/common/hash/hash.util';
import { AuthModule } from '@/modules/auth/auth.module';
import { HttpExceptionFilter } from '@/common/filters/http-exception.filter';

// feedback_pg_spec_parallel_timeout：預設 5s 於 CPU 競爭 / 首次連線握手下易誤判逾時。
vi.setConfig({ testTimeout: 60000 });

const SCHEMA = 'p1a';
const AUTH_TABLES = ['users', 'roles', 'token_blocklist', 'password_reset_tokens'];

let reachable = false;
let ds: DataSource | null = null;

function ensureMssql(ctx: { skip: () => void }): void {
  if (!reachable || !ds) {
    // eslint-disable-next-line no-console
    console.warn(`[AD-E07-38 P1a] SKIPPED — ${SKIP_REASON}`);
    ctx.skip();
  }
}

function mssqlOptions(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    type: 'mssql' as const,
    host: MSSQL.host,
    port: MSSQL.port,
    username: MSSQL.username,
    password: MSSQL.password,
    database: MSSQL.database,
    schema: SCHEMA,
    options: {
      encrypt: MSSQL.encrypt,
      trustServerCertificate: MSSQL.trustServerCertificate,
    },
    ...overrides,
  };
}

beforeAll(async () => {
  reachable = await mssqlPortReachable(1500);
  if (!reachable) return;
  try {
    ds = new DataSource({
      ...mssqlOptions(),
      entities: [User, Role, TokenBlocklist, PasswordResetToken],
      synchronize: false,
    });
    await ds.initialize();
  } catch (e) {
    // eslint-disable-next-line no-console
    console.warn('[AD-E07-38 P1a] init failed → skip:', (e as Error)?.message);
    reachable = false;
    ds = null;
    return;
  }
  // 專屬 schema + 乾淨重建 4 張 auth 表（CONN-004 需「恰 4 表」）。
  await ds.query(`IF SCHEMA_ID('${SCHEMA}') IS NULL EXEC('CREATE SCHEMA ${SCHEMA}')`);
  for (const t of ['password_reset_tokens', 'token_blocklist', 'users', 'roles']) {
    await ds.query(`IF OBJECT_ID('${SCHEMA}.${t}','U') IS NOT NULL DROP TABLE ${SCHEMA}.${t}`);
  }
  await ds.synchronize();
}, 60000);

afterAll(async () => {
  if (ds) {
    for (const t of ['password_reset_tokens', 'token_blocklist', 'users', 'roles']) {
      await ds.query(`IF OBJECT_ID('${SCHEMA}.${t}','U') IS NOT NULL DROP TABLE ${SCHEMA}.${t}`);
    }
    await ds.destroy();
  }
  restoreDbType();
});

// ===========================================================================
// CONN — 設定點 mssql 分支可連線 + 4 表 synchronize
// ===========================================================================
describe('AD-E07-38 P1a CONN', () => {
  it('TS-MSSQL-P1A-CONN-003：mssql DataSource 可初始化並 SELECT 1；data-source.ts(CLI) 分支型別為 mssql', async (ctx) => {
    ensureMssql(ctx);
    expect(ds!.isInitialized).toBe(true);
    const r = await ds!.query('SELECT 1 AS ok');
    expect(Number(r[0].ok)).toBe(1);
    // data-source.ts（CLI singleton）於 DB_TYPE=mssql 下型別為 mssql（顯式分支已生效）。
    expect((AppDataSource.options as { type: string }).type).toBe('mssql');
  });

  it('TS-MSSQL-P1A-CONN-002：worker 分支之 mssql 連線可初始化（entities:[] 代表僅建連線）', async (ctx) => {
    ensureMssql(ctx);
    const workerDs = new DataSource({ ...mssqlOptions(), entities: [], synchronize: false });
    await workerDs.initialize();
    try {
      expect(workerDs.isInitialized).toBe(true);
    } finally {
      await workerDs.destroy();
    }
  });

  it('TS-MSSQL-P1A-CONN-004：synchronize 僅建出 P1a 範圍之 4 張 auth 表（未擴大至 33 業務表）', async (ctx) => {
    ensureMssql(ctx);
    const rows = await ds!.query(
      `SELECT TABLE_NAME FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA='${SCHEMA}' AND TABLE_TYPE='BASE TABLE'`,
    );
    const names = rows.map((r: { TABLE_NAME: string }) => r.TABLE_NAME).sort();
    expect(names).toEqual([...AUTH_TABLES].sort());
    // 抽樣確認業務表未被無意納入 P1a。
    expect(names).not.toContain('ob_pool_data');
    expect(names).not.toContain('assignment_run');
  });

  it('TS-MSSQL-P1A-CONN-005：trustServerCertificate=false 對自簽憑證連線應被拒（證明 encrypt/trust 非死參數）', async (ctx) => {
    ensureMssql(ctx);
    const strictDs = new DataSource({
      ...mssqlOptions({
        options: { encrypt: true, trustServerCertificate: false },
      }),
      entities: [],
      synchronize: false,
    });
    let threw = false;
    try {
      await strictDs.initialize();
      await strictDs.destroy();
    } catch {
      threw = true;
    }
    expect(threw).toBe(true);
  });
});

// ===========================================================================
// TYPE — 型別映射實測（D-1 兩個「不可假設」實測點 + helper 決策 TYPE-007）
// ===========================================================================
describe('AD-E07-38 P1a TYPE', () => {
  const PROBE = '_p1a_probe';

  async function colInfo(table: string, column: string) {
    const r = await ds!.query(
      `SELECT DATA_TYPE, CHARACTER_MAXIMUM_LENGTH, DATETIME_PRECISION
       FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA='${SCHEMA}' AND TABLE_NAME='${table}' AND COLUMN_NAME='${column}'`,
    );
    return r[0] as { DATA_TYPE: string; CHARACTER_MAXIMUM_LENGTH: number; DATETIME_PRECISION: number };
  }

  it('TS-MSSQL-P1A-TYPE-001：User.id（@PrimaryGeneratedColumn(uuid)）→ uniqueidentifier', async (ctx) => {
    ensureMssql(ctx);
    expect((await colInfo('users', 'id')).DATA_TYPE).toBe('uniqueidentifier');
  });

  it('TS-MSSQL-P1A-TYPE-002：裸 type:text → 已棄用 TEXT（非 nvarchar(max)）→ longTextColumnType helper 為必要', async (ctx) => {
    ensureMssql(ctx);
    const qr = ds!.createQueryRunner();
    try {
      await ds!.query(`IF OBJECT_ID('${SCHEMA}.${PROBE}','U') IS NOT NULL DROP TABLE ${SCHEMA}.${PROBE}`);
      await qr.createTable(
        new Table({
          schema: SCHEMA,
          name: PROBE,
          columns: [
            new TableColumn({ name: 'c_text', type: 'text', isNullable: true }),
            new TableColumn({
              name: 'c_helper_text',
              type: longTextColumnType as string,
              length: longTextColumnLength,
              isNullable: true,
            }),
          ],
        }),
      );
      const bare = await colInfo(PROBE, 'c_text');
      // 實測確定性結果：裸 'text' 落入已棄用 TEXT。
      expect(bare.DATA_TYPE).toBe('text');
      // helper（nvarchar + MAX）正確映射 nvarchar(max)（CHARACTER_MAXIMUM_LENGTH = -1）。
      const helper = await colInfo(PROBE, 'c_helper_text');
      expect(helper.DATA_TYPE).toBe('nvarchar');
      expect(helper.CHARACTER_MAXIMUM_LENGTH).toBe(-1);
    } finally {
      await ds!.query(`IF OBJECT_ID('${SCHEMA}.${PROBE}','U') IS NOT NULL DROP TABLE ${SCHEMA}.${PROBE}`);
      await qr.release();
    }
  });

  it('TS-MSSQL-P1A-TYPE-002b：裸 type:uuid 於 mssql driver 直接拋錯 → uuidColumnType helper 為必要', async (ctx) => {
    ensureMssql(ctx);
    const qr = ds!.createQueryRunner();
    try {
      await ds!.query(`IF OBJECT_ID('${SCHEMA}.${PROBE}u','U') IS NOT NULL DROP TABLE ${SCHEMA}.${PROBE}u`);
      // 裸 'uuid' → mssql driver 無此型別 → createTable 於 DDL 執行時拋錯。
      await expect(
        qr.createTable(
          new Table({
            schema: SCHEMA,
            name: `${PROBE}u`,
            columns: [new TableColumn({ name: 'c_uuid', type: 'uuid', isNullable: true })],
          }),
        ),
      ).rejects.toThrow(/uuid/i);
      // helper（uniqueidentifier）可正確建表。
      await qr.createTable(
        new Table({
          schema: SCHEMA,
          name: `${PROBE}h`,
          columns: [new TableColumn({ name: 'c_uuid', type: uuidColumnType as string, isNullable: true })],
        }),
        true,
      );
      const helper = await colInfo(`${PROBE}h`, 'c_uuid');
      expect(helper.DATA_TYPE).toBe('uniqueidentifier');
    } finally {
      await ds!.query(`IF OBJECT_ID('${SCHEMA}.${PROBE}u','U') IS NOT NULL DROP TABLE ${SCHEMA}.${PROBE}u`);
      await ds!.query(`IF OBJECT_ID('${SCHEMA}.${PROBE}h','U') IS NOT NULL DROP TABLE ${SCHEMA}.${PROBE}h`);
      await qr.release();
    }
  });

  it('TS-MSSQL-P1A-TYPE-003：裸 type:bigint → bigint', async (ctx) => {
    ensureMssql(ctx);
    const qr = ds!.createQueryRunner();
    try {
      await ds!.query(`IF OBJECT_ID('${SCHEMA}.${PROBE}b','U') IS NOT NULL DROP TABLE ${SCHEMA}.${PROBE}b`);
      await qr.createTable(
        new Table({
          schema: SCHEMA,
          name: `${PROBE}b`,
          columns: [new TableColumn({ name: 'c_bigint', type: 'bigint', isNullable: true })],
        }),
        true,
      );
      expect((await colInfo(`${PROBE}b`, 'c_bigint')).DATA_TYPE).toBe('bigint');
    } finally {
      await ds!.query(`IF OBJECT_ID('${SCHEMA}.${PROBE}b','U') IS NOT NULL DROP TABLE ${SCHEMA}.${PROBE}b`);
      await qr.release();
    }
  });

  it('TS-MSSQL-P1A-TYPE-004：dateColumnType 欄位（password_changed_at）→ datetime2，精度 ≥ 3（實測 7）', async (ctx) => {
    ensureMssql(ctx);
    const info = await colInfo('users', 'password_changed_at');
    expect(info.DATA_TYPE).toBe('datetime2');
    // AD D-2 述 datetime2(3)；TypeORM mssql 預設精度為 7（＞3，完整涵蓋毫秒），此處驗 ≥3。
    expect(info.DATETIME_PRECISION).toBeGreaterThanOrEqual(3);
  });

  it('TS-MSSQL-P1A-TYPE-005：boolean 欄位（is_sales_manager，經 boolColumnType）→ bit', async (ctx) => {
    ensureMssql(ctx);
    expect((await colInfo('users', 'is_sales_manager')).DATA_TYPE).toBe('bit');
  });

  it('TS-MSSQL-P1A-TYPE-006：@CreateDateColumn/@UpdateDateColumn 於 mssql → datetime2', async (ctx) => {
    ensureMssql(ctx);
    for (const [t, c] of [
      ['users', 'created_at'],
      ['users', 'updated_at'],
      ['roles', 'created_at'],
      ['token_blocklist', 'revoked_at'],
      ['password_reset_tokens', 'created_at'],
    ] as const) {
      expect((await colInfo(t, c)).DATA_TYPE).toBe('datetime2');
    }
  });

  it('TS-MSSQL-P1A-TYPE-007（決策關卡）：裸 uuid/text 皆非正確映射 → 兩個 helper 皆採用（值域鎖定）', async (ctx) => {
    ensureMssql(ctx);
    // 依 TYPE-002 / TYPE-002b 之確定性實測：裸 'uuid' 拋錯、裸 'text' 落 deprecated TEXT，
    // 故 uuidColumnType / longTextColumnType(+Length) 皆為必要，並鎖定為以下 mssql 值。
    expect(uuidColumnType).toBe('uniqueidentifier');
    expect(longTextColumnType).toBe('nvarchar');
    expect(longTextColumnLength).toBe('MAX');
  });
});

// ===========================================================================
// CRUD — Entity round-trip
// ===========================================================================
describe('AD-E07-38 P1a CRUD', () => {
  it('TS-MSSQL-P1A-CRUD-001：User uuid PK 序列化/反序列化正確，可用於 WHERE 查詢', async (ctx) => {
    ensureMssql(ctx);
    const repo = ds!.getRepository(User);
    const saved = await repo.save(
      repo.create({
        name: 'CRUD001',
        email: 'crud001@cdmp.test',
        password_hash: 'x',
        role: 'user',
        status: 'active',
      }),
    );
    expect(saved.id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i);
    const found = await repo.findOneBy({ id: saved.id });
    expect(found).not.toBeNull();
    expect(found!.email).toBe('crud001@cdmp.test');
  });

  it('TS-MSSQL-P1A-CRUD-002：password_hash（bcrypt 60 字元）逐字元 round-trip', async (ctx) => {
    ensureMssql(ctx);
    const repo = ds!.getRepository(User);
    const hash = await HashUtil.hash('P@ssw0rd123');
    const saved = await repo.save(
      repo.create({
        name: 'CRUD002',
        email: 'crud002@cdmp.test',
        password_hash: hash,
        role: 'user',
        status: 'active',
      }),
    );
    const found = await repo.findOneBy({ id: saved.id });
    expect(found!.password_hash).toBe(hash);
    expect(await HashUtil.compare('P@ssw0rd123', found!.password_hash)).toBe(true);
  });

  it('TS-MSSQL-P1A-CRUD-003a：TokenBlocklist.token 於 mssql 合法索引鍵長度內（448 字元）round-trip 無截斷', async (ctx) => {
    ensureMssql(ctx);
    const repo = ds!.getRepository(TokenBlocklist);
    // 900 bytes / 2 bytes-per-nvarchar-char = 450 字元上限；用 448（896 bytes）驗證編碼/長字串無截斷。
    const token = 'T'.repeat(448);
    await repo.save(
      repo.create({ token, user_id: 'u-crud003', expires_at: new Date('2030-01-01T00:00:00.000Z') }),
    );
    const found = await repo.findOneBy({ token });
    expect(found).not.toBeNull();
    expect(found!.token.length).toBe(448);
  });

  it('TS-MSSQL-P1A-CRUD-003b（實測發現/需 P1b 裁示）：2048 字元 token 作為 clustered PK 超過 mssql 900-byte 索引鍵上限而 INSERT 失敗', async (ctx) => {
    ensureMssql(ctx);
    // ⚠️ 實測發現：token_blocklist.token 為 nvarchar(2048) PRIMARY KEY，於 mssql 為 clustered index；
    //    key 上限 900 bytes（nonclustered 亦僅 1700 bytes）→ 2048 字元（4096 bytes）INSERT 直接被拒。
    //    此為 TokenBlocklist entity 於 mssql 的 schema-compat 議題，非型別映射可解，須 P1b 決策
    //    （例：改以 jti/hash 為鍵、或加代理 PK）。詳見 AD-E07-38-P1a-impl.md 阻擋議題段。
    const repo = ds!.getRepository(TokenBlocklist);
    const token = 'T'.repeat(2048);
    let threw = false;
    try {
      await repo.save(
        repo.create({ token, user_id: 'u-crud003b', expires_at: new Date('2030-01-01T00:00:00.000Z') }),
      );
    } catch (e) {
      threw = true;
      expect((e as Error).message).toMatch(/900 bytes|exceeds the maximum length/i);
    }
    expect(threw).toBe(true);
  });

  it('TS-MSSQL-P1A-CRUD-004：datetime2 欄位毫秒精度 round-trip 無偏移', async (ctx) => {
    ensureMssql(ctx);
    const repo = ds!.getRepository(User);
    const when = new Date('2026-07-07T12:00:00.123Z');
    const saved = await repo.save(
      repo.create({
        name: 'CRUD004',
        email: 'crud004@cdmp.test',
        password_hash: 'x',
        role: 'user',
        status: 'active',
        password_changed_at: when,
      }),
    );
    const found = await repo.findOneBy({ id: saved.id });
    expect(found!.password_changed_at).toBeInstanceOf(Date);
    expect(found!.password_changed_at!.getTime()).toBe(when.getTime());
  });

  it('TS-MSSQL-P1A-CRUD-005：Role（varchar PK）+ 中文 display_name（BIN collation）round-trip', async (ctx) => {
    ensureMssql(ctx);
    const repo = ds!.getRepository(Role);
    await repo.save(repo.create({ role_code: 'admin', display_name: '管理員', type: 'system' }));
    const found = await repo.findOneBy({ role_code: 'admin' });
    expect(found).not.toBeNull();
    expect(found!.display_name).toBe('管理員');
  });

  it('TS-MSSQL-P1A-CRUD-006：PasswordResetToken uuid PK + nullable used_at 雙向正確', async (ctx) => {
    ensureMssql(ctx);
    const repo = ds!.getRepository(PasswordResetToken);
    const saved = await repo.save(
      repo.create({
        user_id: 'u-crud006',
        token: 'reset-token-crud006',
        expires_at: new Date('2030-01-01T00:00:00.000Z'),
        used_at: null,
      }),
    );
    const initial = await repo.findOneBy({ id: saved.id });
    expect(initial!.used_at).toBeNull();
    const usedWhen = new Date('2026-07-07T08:00:00.000Z');
    await repo.update({ id: saved.id }, { used_at: usedWhen });
    const after = await repo.findOneBy({ id: saved.id });
    expect(after!.used_at).toBeInstanceOf(Date);
    expect(after!.used_at!.getTime()).toBe(usedWhen.getTime());
  });

  it('TS-MSSQL-P1A-CRUD-007：bigint 邊界值（BIGINT_MAX）以字串精確 round-trip', async (ctx) => {
    ensureMssql(ctx);
    const qr = ds!.createQueryRunner();
    const T = '_p1a_bigint';
    try {
      await ds!.query(`IF OBJECT_ID('${SCHEMA}.${T}','U') IS NOT NULL DROP TABLE ${SCHEMA}.${T}`);
      await qr.createTable(
        new Table({
          schema: SCHEMA,
          name: T,
          columns: [new TableColumn({ name: 'b', type: 'bigint', isNullable: true })],
        }),
        true,
      );
      await ds!.query(`INSERT INTO ${SCHEMA}.${T} (b) VALUES (9223372036854775807)`);
      const rows = await ds!.query(`SELECT b FROM ${SCHEMA}.${T}`);
      // tedious driver 將 bigint 序列化為 string（比照 pg driver，避免超過 2^53 精度流失）。
      expect(typeof rows[0].b).toBe('string');
      expect(String(rows[0].b)).toBe('9223372036854775807');
    } finally {
      await ds!.query(`IF OBJECT_ID('${SCHEMA}.${T}','U') IS NOT NULL DROP TABLE ${SCHEMA}.${T}`);
      await qr.release();
    }
  });
});

// ===========================================================================
// CASE — 大小寫一致性守門（I-MSSQL-CASE-01）
// ===========================================================================
describe('AD-E07-38 P1a CASE', () => {
  it('TS-MSSQL-P1A-CASE-001：4 張 auth 表名稱皆為小寫', async (ctx) => {
    ensureMssql(ctx);
    const rows = await ds!.query(
      `SELECT TABLE_NAME FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA='${SCHEMA}' AND TABLE_TYPE='BASE TABLE'`,
    );
    for (const r of rows) {
      expect(r.TABLE_NAME).toMatch(/^[a-z_]+$/);
    }
  });

  it('TS-MSSQL-P1A-CASE-002：4 張表全部欄位名稱皆為小寫 snake_case', async (ctx) => {
    ensureMssql(ctx);
    const rows = await ds!.query(
      `SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA='${SCHEMA}' AND TABLE_NAME IN ('users','roles','token_blocklist','password_reset_tokens')`,
    );
    expect(rows.length).toBeGreaterThan(0);
    for (const r of rows) {
      expect(r.COLUMN_NAME).toMatch(/^[a-z_]+$/);
    }
  });

  it('TS-MSSQL-P1A-CASE-003：大寫物件名於 BIN collation 下解析失敗（佐證大小寫敏感生效）', async (ctx) => {
    ensureMssql(ctx);
    // 小寫可查、大寫失敗 → 證明並非命名巧合而是 BIN collation 使識別碼大小寫敏感。
    await expect(ds!.query(`SELECT TOP 1 * FROM ${SCHEMA}.users`)).resolves.toBeDefined();
    await expect(ds!.query(`SELECT TOP 1 * FROM ${SCHEMA}.USERS`)).rejects.toThrow(/invalid object name/i);
  });
});

// ===========================================================================
// LOGIN（+ CONN-001）— 種子 admin → POST /auth/login 合法 JWT
// ===========================================================================
describe('AD-E07-38 P1a LOGIN', () => {
  let app: INestApplication | null = null;
  const ADMIN = { email: 'p1a-admin@cdmp.test', password: 'P@ssw0rd123' };

  beforeAll(async () => {
    if (!reachable || !ds) return;
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({
          isGlobal: true,
          load: [() => ({ JWT_SECRET: 'cdmp-test-jwt-secret-key' })],
        }),
        (await import('@nestjs/typeorm')).TypeOrmModule.forRoot({
          ...mssqlOptions(),
          entities: [User, TokenBlocklist, PasswordResetToken],
          synchronize: false,
        } as never),
        ThrottlerModule.forRoot([{ name: 'login', ttl: 60000, limit: 100 }]),
        AuthModule,
      ],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.setGlobalPrefix('api/v1');
    app.useGlobalPipes(
      new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }),
    );
    app.useGlobalFilters(new HttpExceptionFilter());
    await app.init();

    // 種子 admin（清掉先前 CRUD 測試殘留的 users，避免 email 干擾）。
    await ds.query(`DELETE FROM ${SCHEMA}.users`);
    const repo = ds.getRepository(User);
    await repo.save(
      repo.create({
        name: 'P1a Admin',
        email: ADMIN.email,
        password_hash: await HashUtil.hash(ADMIN.password),
        role: 'admin',
        status: 'active',
      }),
    );
  }, 60000);

  afterAll(async () => {
    await app?.close();
  });

  it('TS-MSSQL-P1A-CONN-001：auth-slice NestJS API 於 mssql 分支成功啟動（DataSource.isInitialized）', async (ctx) => {
    ensureMssql(ctx);
    const appDs = app!.get(DataSource);
    expect(appDs.isInitialized).toBe(true);
  });

  it('TS-MSSQL-P1A-LOGIN-001：admin 正確憑證 → 200 + 合法 JWT', async (ctx) => {
    ensureMssql(ctx);
    const res = await request(app!.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ email: ADMIN.email, password: ADMIN.password });
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('token');
    expect(res.body.user.email).toBe(ADMIN.email);
    expect(res.body.user.role).toBe('admin');
    expect(res.body.user).not.toHaveProperty('password_hash');
  });

  it('TS-MSSQL-P1A-LOGIN-002：錯誤密碼 → 401 AUTH_INVALID_CREDENTIALS（跨 driver 行為一致）', async (ctx) => {
    ensureMssql(ctx);
    const res = await request(app!.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ email: ADMIN.email, password: 'WrongPassword' });
    expect(res.status).toBe(401);
    expect(res.body.error).toBe('AUTH_INVALID_CREDENTIALS');
  });

  it('TS-MSSQL-P1A-LOGIN-003：JWT payload 含既有 claim 結構（userId/role/isSalesManager/businessRole，driver 無關）', async (ctx) => {
    ensureMssql(ctx);
    // 註：本專案 JWT 既有 claim 為 userId（非 sub）、無 email claim（jwt.util.ts）；
    // 測試設計原述 sub/email 為對既有結構的誤設，此處對齊實際 claim（行為 driver 無關）。
    const res = await request(app!.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ email: ADMIN.email, password: ADMIN.password });
    expect(res.status).toBe(200);
    const payload = JSON.parse(
      Buffer.from((res.body.token as string).split('.')[1], 'base64').toString(),
    );
    expect(typeof payload.userId).toBe('string');
    expect(payload.userId.length).toBeGreaterThan(0);
    expect(payload.role).toBe('admin');
    expect(payload).toHaveProperty('isSalesManager');
    expect(typeof payload.isSalesManager).toBe('boolean');
    expect(payload).toHaveProperty('businessRole');
  });
});
