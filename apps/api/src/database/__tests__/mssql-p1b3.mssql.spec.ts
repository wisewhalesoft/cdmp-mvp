/**
 * AD-E07-39 P1b3 — Bootstrap/Seed 三支腳本改寫 + B2 npm alias 修復驗證（覆蓋 AD-E07-39-P1b3-test.md，54 案例）。
 *
 *   DIALECT（4）  — 三支 seed 腳本 DataSource 依 DB_TYPE 建 mssql 連線（非硬編碼 postgres）
 *   ALIAS（6）    — 字面 `npm run migration:run/revert/seed/seed-datasource/data-seed/bootstrap` 於 mssql exit 0（B2 修復）
 *   SITE（12）    — 逐站點語法轉換行為驗證（$n→? / LIMIT→TOP / NOW()→Date / RETURNING→顯式 uuid /
 *                   ::text 移除 / IS NOT DISTINCT FROM→可攜 NULL-safe / 裸 true→綁定 / UPDATE alias→表名限定）
 *   BOOT（5）     — bootstrap 全流程 E2E（帳號可登入 / datasource 空殼 / FK 完整）
 *   COUNT（12）   — 參考/種子表筆數對齊 PG 版本（含 roles 2 / whitelist 17 / option 186，P1b3 移植後 🔴 必過）
 *   IDEM（5）     — 冪等（重跑不重複，尤其 ob_levelcard_score 212 筆 level1=NULL 之 NULL-safe reconcile）
 *   PROBE（2）    — mssql UPDATE `qr.query()` 回傳形狀（log-only，不阻擋）+ 決策關卡彙整
 *   STATIC（3）   — 三支腳本零殘留 PG-only 語法 / 零 type:'postgres' / 站點清單文件存在
 *   REG（5）      — 回歸（REG-005 in-spec；REG-001 tsc、002 pg reconcile、003 sqlite、004 p1a/b1/b2 為外部閘，見 impl log）
 *
 * Gating：連不上 MSSQL → DB 相依 test ctx.skip()（不偽造綠燈，feedback_mock_real_system_contract）。
 * dbo 為本套件 + P1b2 共用之保留 schema → 必以 --no-file-parallelism 序列化執行（見 test 設計 §0.3）。
 * beforeAll 先清空 dbo（belt-and-suspenders）→ 逐步跑 migration:run/seed/seed-datasource/data-seed（字面 npm）。
 */

// 必最先 import（side-effect 設 DB_TYPE=mssql，供 seed-connection / entity 之 helper 解析 mssql 分支值）。
import {
  restoreDbType,
  MSSQL,
  mssqlPortReachable,
  SKIP_REASON,
} from './mssql-env-preload';

import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';
import { spawnSync, type SpawnSyncReturns } from 'child_process';
import { randomBytes } from 'crypto';
import * as bcrypt from 'bcryptjs';
import { DataSource, QueryRunner } from 'typeorm';

import { CryptoUtil } from '@/common/crypto/crypto.util';
import {
  BASELINE_ROLES,
  BASELINE_WHITELIST,
  BASELINE_OPTIONS,
} from '../seeds/baseline-reference-data';
import {
  seedCardTypes,
  seedScores,
  seedColumns,
  deriveMatchType,
} from '../seeds/prod-data-seed';
import { resolveCreatedBy, seedDatasources } from '../seeds/seed-datasource';

vi.setConfig({ testTimeout: 300000, hookTimeout: 300000 });

const API_ROOT = join(__dirname, '..', '..', '..'); // apps/api
const SEEDS_DIR = join(__dirname, '..', 'seeds');
const DATA_DIR = join(SEEDS_DIR, 'data');

// AES key（seed-datasource CryptoUtil.encrypt / BOOT-003 decrypt 共用；child + in-process 一致）。
const AES_KEY = randomBytes(32).toString('hex');

function childEnv(extra: Record<string, string> = {}): NodeJS.ProcessEnv {
  return {
    ...process.env,
    DB_TYPE: 'mssql',
    DB_HOST: MSSQL.host,
    DB_PORT: String(MSSQL.port),
    DB_NAME: MSSQL.database,
    DB_USERNAME: MSSQL.username,
    DB_PASSWORD: MSSQL.password,
    DB_MSSQL_ENCRYPT: String(MSSQL.encrypt),
    DB_MSSQL_TRUST_CERT: String(MSSQL.trustServerCertificate),
    NODE_ENV: 'production',
    TYPEORM_LOG: 'false',
    AES_ENCRYPTION_KEY: AES_KEY,
    ...extra,
  };
}

/** 字面 `npm run <script>`（B2：驗證修復後的 npm alias 於 mssql 可直接跑）。 */
function runNpm(script: string): SpawnSyncReturns<string> {
  return spawnSync('npm', ['run', script], {
    cwd: API_ROOT,
    encoding: 'utf8',
    timeout: 280000,
    shell: true,
    env: childEnv(),
  });
}

function loadJson<T>(file: string): T[] {
  return JSON.parse(readFileSync(join(DATA_DIR, file), 'utf-8')) as T[];
}

const SEED = {
  datasources: loadJson<any>('datasources.json'),
  cardType: loadJson<any>('ob-card-type.json'),
  version: loadJson<any>('ob-levelcard-version.json'),
  column: loadJson<any>('ob-levelcard-column.json'),
  score: loadJson<any>('ob-levelcard-score.json'),
  level: loadJson<any>('ob-levelcard-level.json'),
  tier: loadJson<any>('ob-tier.json'),
  etlPipelines: loadJson<any>('etl-pipelines.json'),
  extractionTasks: loadJson<any>('extraction-tasks.json'),
};

let reachable = false;
let ds: DataSource | null = null;
let qr: QueryRunner;
let dboInitialTableCount = -1;

// 逐步 bootstrap 之子行程結果（ALIAS/DIALECT/BOOT/IDEM 群組斷言）。
let migrationRun: SpawnSyncReturns<string> | null = null;
let seedRun: SpawnSyncReturns<string> | null = null;
let seedDsRun: SpawnSyncReturns<string> | null = null;
let dataSeedRun: SpawnSyncReturns<string> | null = null;
// IDEM：第二次執行。
let seed2: SpawnSyncReturns<string> | null = null;
let seedDs2: SpawnSyncReturns<string> | null = null;
let dataSeed2: SpawnSyncReturns<string> | null = null;

function ensureMssql(ctx: { skip: () => void }): void {
  if (!reachable || !ds) {
    // eslint-disable-next-line no-console
    console.warn(`[AD-E07-39 P1b3] SKIPPED — ${SKIP_REASON}`);
    ctx.skip();
  }
}

async function dropAllDbo(d: DataSource): Promise<void> {
  const fks: Array<{ tbl: string; fk: string }> = await d.query(
    `SELECT t.name AS tbl, f.name AS fk FROM sys.foreign_keys f
     JOIN sys.tables t ON f.parent_object_id = t.object_id
     JOIN sys.schemas s ON t.schema_id = s.schema_id WHERE s.name='dbo'`,
  );
  for (const { tbl, fk } of fks) {
    await d.query(`ALTER TABLE [dbo].[${tbl}] DROP CONSTRAINT [${fk}]`);
  }
  const tables: Array<{ tbl: string }> = await d.query(
    `SELECT t.name AS tbl FROM sys.tables t JOIN sys.schemas s ON t.schema_id=s.schema_id WHERE s.name='dbo'`,
  );
  for (const { tbl } of tables) await d.query(`DROP TABLE [dbo].[${tbl}]`);
}

async function tableCount(name: string): Promise<number> {
  const r = await ds!.query(`SELECT COUNT(*) AS n FROM ${name}`);
  return Number(r[0].n);
}

async function dboBusinessTableCount(): Promise<number> {
  // AD-E07-40 P2a：queue_job（佇列基礎建設表）非 36 表業務 baseline 範疇（由 P2a 專屬套件驗證），一律排除。
  // AD-E07-41 P4-0：customer_core（PG-only、無 entity 之客戶主檔）為刻意的 migration-only 表——baseline migration
  //   會建之於 dbo，但非 36 表業務 baseline 之 entity 集合範疇；比照 queue_job 自業務表計數排除（其結構由 P1b2
  //   CUSTOMER-CORE 群組獨立驗證），使「migration:run 後 dbo 業務表數 = 36」之斷言不受此 migration-only 表影響。
  const r = await ds!.query(
    `SELECT COUNT(*) AS n FROM sys.tables t JOIN sys.schemas s ON t.schema_id=s.schema_id
     WHERE s.name='dbo' AND t.name NOT IN ('typeorm_migrations', 'queue_job', 'customer_core')`,
  );
  return Number(r[0].n);
}

function ok(res: SpawnSyncReturns<string> | null): string {
  return `${res?.stdout ?? ''}${res?.stderr ?? ''}`;
}

beforeAll(async () => {
  reachable = await mssqlPortReachable(1500);
  if (!reachable) return;
  process.env.AES_ENCRYPTION_KEY = AES_KEY; // in-process CryptoUtil.decrypt（BOOT-003）
  try {
    ds = new DataSource({
      type: 'mssql',
      host: MSSQL.host,
      port: MSSQL.port,
      username: MSSQL.username,
      password: MSSQL.password,
      database: MSSQL.database,
      options: { encrypt: MSSQL.encrypt, trustServerCertificate: MSSQL.trustServerCertificate },
      synchronize: false,
    });
    await ds.initialize();
  } catch (e) {
    // eslint-disable-next-line no-console
    console.warn('[AD-E07-39 P1b3] init failed → skip:', (e as Error)?.message);
    reachable = false;
    ds = null;
    return;
  }

  // fail-fast 可視化（dbo 保留慣例）：擷取進場前 dbo 表數（非 0 由 BOOT/ALIAS 前置守門標示）。
  dboInitialTableCount = await dboBusinessTableCount();
  // belt-and-suspenders：清空 dbo（含 typeorm_migrations）確保乾淨起點。
  await dropAllDbo(ds);

  // 逐步 bootstrap（字面 npm run；ALIAS-001~005 分步診斷）。
  migrationRun = runNpm('migration:run');
  seedRun = runNpm('seed');
  seedDsRun = runNpm('seed-datasource');
  dataSeedRun = runNpm('data-seed');

  qr = ds.createQueryRunner();
  await qr.connect();
}, 300000);

afterAll(async () => {
  if (ds) {
    try { await qr?.release(); } catch { /* noop */ }
    try { await dropAllDbo(ds); } catch { /* noop */ }
    await ds.destroy();
  }
  restoreDbType();
});

// ===========================================================================
// DIALECT（4）
// ===========================================================================
describe('AD-E07-39 P1b3 DIALECT', () => {
  it('TS-MSSQL-P1B3-DIALECT-001：seed.ts 依 DB_TYPE=mssql 連線並寫入 4 帳號（非 PG wire protocol）', async (ctx) => {
    ensureMssql(ctx);
    expect(seedRun!.status, `stderr=${seedRun!.stderr}`).toBe(0);
    expect(await tableCount('users')).toBe(4);
  });

  it('TS-MSSQL-P1B3-DIALECT-002：seed-datasource.ts 依 DB_TYPE=mssql 連線並寫入 9 空殼', async (ctx) => {
    ensureMssql(ctx);
    expect(seedDsRun!.status, `stderr=${seedDsRun!.stderr}`).toBe(0);
    expect(await tableCount('datasources')).toBe(SEED.datasources.length);
  });

  it('TS-MSSQL-P1B3-DIALECT-003：prod-data-seed.ts 依 DB_TYPE=mssql 連線並寫入計分卡 6 表', async (ctx) => {
    ensureMssql(ctx);
    expect(dataSeedRun!.status, `stderr=${dataSeedRun!.stderr}`).toBe(0);
    expect(await tableCount('ob_card_type')).toBe(SEED.cardType.length);
  });

  it('TS-MSSQL-P1B3-DIALECT-004（靜態）：三支腳本零殘留硬編碼 type:\'postgres\'', () => {
    for (const f of ['seed.ts', 'seed-datasource.ts', 'prod-data-seed.ts']) {
      const src = readFileSync(join(SEEDS_DIR, f), 'utf8');
      expect(src, f).not.toMatch(/type:\s*'postgres'/);
      expect(src, f).not.toMatch(/type:\s*'mssql'/);
    }
  });
});

// ===========================================================================
// ALIAS（6）— B2 npm alias 修復
// ===========================================================================
describe('AD-E07-39 P1b3 ALIAS', () => {
  it('TS-MSSQL-P1B3-ALIAS-001（🔴 B2 核心）：字面 npm run migration:run 對 mssql exit 0、36 表、3 筆 migration', async (ctx) => {
    ensureMssql(ctx);
    expect(migrationRun!.status, `stderr=${migrationRun!.stderr}`).toBe(0);
    expect(ok(migrationRun)).toMatch(/has been executed successfully/);
    expect(ok(migrationRun)).not.toMatch(/17750|Could not load the DLL/i);
    expect(await dboBusinessTableCount()).toBe(36);
    // P1b3 移植 reference-data → 2 支；AD-E07-40 P2a 再加 queue_job baseline → 3 支 mssql baseline（皆 glob 自動載入）。
    expect(await tableCount('typeorm_migrations')).toBe(3);
  });

  it('TS-MSSQL-P1B3-ALIAS-003：字面 npm run seed 對 mssql exit 0（4 帳號）', async (ctx) => {
    ensureMssql(ctx);
    expect(seedRun!.status).toBe(0);
    expect(ok(seedRun)).toMatch(/Created:|Skip:/);
    expect(await tableCount('users')).toBe(4);
  });

  it('TS-MSSQL-P1B3-ALIAS-004：字面 npm run seed-datasource 對 mssql exit 0（9 空殼）', async (ctx) => {
    ensureMssql(ctx);
    expect(seedDsRun!.status).toBe(0);
    expect(await tableCount('datasources')).toBe(9);
  });

  it('TS-MSSQL-P1B3-ALIAS-005：字面 npm run data-seed 對 mssql exit 0（計分卡 + etl_pipelines + extraction_tasks）', async (ctx) => {
    ensureMssql(ctx);
    expect(dataSeedRun!.status).toBe(0);
    expect(await tableCount('etl_pipelines')).toBe(SEED.etlPipelines.length);
    expect(await tableCount('extraction_tasks')).toBe(SEED.extractionTasks.length);
  });

  // ALIAS-002（revert）與 ALIAS-006（one-shot bootstrap）為破壞性 → 置於檔案最後（見末端 describe）。
});

// ===========================================================================
// SITE（12）— 逐站點轉換行為驗證
// ===========================================================================
describe('AD-E07-39 P1b3 SITE', () => {
  it('TS-MSSQL-P1B3-SITE-001：具名/綁定參數化查詢正確綁定（resolveCreatedBy by email）', async (ctx) => {
    ensureMssql(ctx);
    process.env.ETL_SEED_USER_EMAIL = 'admin@cdmp.test';
    try {
      const id = await resolveCreatedBy(qr);
      expect(typeof id).toBe('string');
      const u = await ds!.query(`SELECT email FROM users WHERE id = @0`, [id]);
      expect(u[0].email).toBe('admin@cdmp.test');
      // 不存在 email → fail-fast。
      process.env.ETL_SEED_USER_EMAIL = 'nobody@cdmp.test';
      await expect(resolveCreatedBy(qr)).rejects.toThrow();
    } finally {
      delete process.env.ETL_SEED_USER_EMAIL;
    }
  });

  it('TS-MSSQL-P1B3-SITE-002：TOP(1) 存在性檢查等價 LIMIT 1（seedDatasources 重跑 SKIP、不重複 INSERT）', async (ctx) => {
    ensureMssql(ctx);
    await seedDatasources(qr); // 全部已存在 → 應全 SKIP
    expect(await tableCount('datasources')).toBe(9);
  });

  it('TS-MSSQL-P1B3-SITE-003：LOWER() 大小寫比對於 BIN collation 下仍正確正規化', async (ctx) => {
    ensureMssql(ctx);
    // 以小寫查名（DB 內存大寫 APYHFC16.OB）→ LOWER() 抵消 BIN 大小寫敏感、命中。
    const r = await ds!.query(
      `SELECT name FROM datasources WHERE LOWER(name) = LOWER(@0) AND deleted_at IS NULL`,
      ['apyhfc16.ob'],
    );
    expect(r.length).toBe(1);
    expect(String(r[0].name).toLowerCase()).toBe('apyhfc16.ob');
  });

  it('TS-MSSQL-P1B3-SITE-004：NOW()→JS Date 綁定寫入之 created_at 為合理現時 Date（非 NULL / 非 epoch）', async (ctx) => {
    ensureMssql(ctx);
    const r = await ds!.query(`SELECT TOP(1) created_at FROM datasources ORDER BY name`);
    const created = r[0].created_at as Date;
    expect(created).toBeInstanceOf(Date);
    const t = new Date(created).getTime();
    expect(t).toBeGreaterThan(new Date('2020-01-01').getTime()); // 非 1970 epoch
    expect(Math.abs(Date.now() - t)).toBeLessThan(24 * 60 * 60 * 1000); // 24h 內（bootstrap 剛跑）
  });

  it('TS-MSSQL-P1B3-SITE-005（🔴 最高風險）：NULL-safe 自然鍵 reconcile — 212 筆 level1=NULL 重跑不重複', async (ctx) => {
    ensureMssql(ctx);
    const nullBefore = await ds!.query(
      `SELECT COUNT(*) AS n FROM ob_levelcard_score WHERE level1 IS NULL`,
    );
    await seedScores(qr); // 第二次呼叫，資料未變 → 全判定已存在、SKIP
    expect(await tableCount('ob_levelcard_score')).toBe(SEED.score.length);
    const nullAfter = await ds!.query(
      `SELECT COUNT(*) AS n FROM ob_levelcard_score WHERE level1 IS NULL`,
    );
    expect(Number(nullAfter[0].n)).toBe(Number(nullBefore[0].n)); // NULL 分量未因誤判重複膨脹
    const seedNull = SEED.score.filter((s: any) => s.level1 === null).length;
    expect(Number(nullAfter[0].n)).toBe(seedNull);
  });

  it('TS-MSSQL-P1B3-SITE-006：reconcileTable 加法式 INSERT 六表筆數 = seed JSON', async (ctx) => {
    ensureMssql(ctx);
    expect(await tableCount('ob_card_type')).toBe(SEED.cardType.length);
    expect(await tableCount('ob_levelcard_version')).toBe(SEED.version.length);
    expect(await tableCount('ob_levelcard_column')).toBe(SEED.column.length);
    expect(await tableCount('ob_levelcard_score')).toBe(SEED.score.length);
    expect(await tableCount('ob_levelcard_level')).toBe(SEED.level.length);
    expect(await tableCount('ob_tier')).toBe(SEED.tier.length);
  });

  it('TS-MSSQL-P1B3-SITE-008：ob_levelcard_column.column_label 條件式補齊（IS NULL only）', async (ctx) => {
    ensureMssql(ctx);
    const labelled = await ds!.query(
      `SELECT COUNT(*) AS n FROM ob_levelcard_column WHERE column_label IS NOT NULL`,
    );
    const seedLabelled = SEED.column.filter((c: any) => c.column_label !== null).length;
    expect(Number(labelled[0].n)).toBe(seedLabelled);
  });

  it('TS-MSSQL-P1B3-SITE-009：etl_pipelines 新 id（原 RETURNING）可正確作 etl_pipeline_versions FK', async (ctx) => {
    ensureMssql(ctx);
    const orphan = await ds!.query(
      `SELECT COUNT(*) AS n FROM etl_pipeline_versions v
       LEFT JOIN etl_pipelines p ON v.pipeline_id = p.id WHERE p.id IS NULL`,
    );
    expect(Number(orphan[0].n)).toBe(0);
    expect(await tableCount('etl_pipeline_versions')).toBe(SEED.etlPipelines.length);
  });

  it('TS-MSSQL-P1B3-SITE-010：etl_pipeline_versions.definition JSON round-trip（原 ::text cast 已移除）', async (ctx) => {
    ensureMssql(ctx);
    const rows = await ds!.query(`SELECT TOP(1) definition FROM etl_pipeline_versions`);
    const parsed = JSON.parse(rows[0].definition);
    expect(parsed).toHaveProperty('nodes');
    expect(parsed).toHaveProperty('edges');
    expect(Array.isArray(parsed.nodes)).toBe(true);
  });

  it('TS-MSSQL-P1B3-SITE-011：extraction_tasks.enabled 裸布林 true → bit（19 筆皆 enabled）', async (ctx) => {
    ensureMssql(ctx);
    const r = await ds!.query(`SELECT COUNT(*) AS n FROM extraction_tasks WHERE enabled = 1`);
    expect(Number(r[0].n)).toBe(SEED.extractionTasks.length);
  });

  it('TS-MSSQL-P1B3-SITE-012：deriveMatchType（UPDATE 表名限定，非 alias）於 mssql 正確推導', async (ctx) => {
    ensureMssql(ctx);
    // 全域 match_type 呈 CATEGORY/COMPOSITE/RANGE 三態（非全 RANGE=推導失敗）。
    const rows = await ds!.query(
      `SELECT match_type, COUNT(*) AS n FROM ob_levelcard_column GROUP BY match_type`,
    );
    const dist: Record<string, number> = {};
    for (const r of rows) dist[r.match_type] = Number(r.n);
    expect(dist['COMPOSITE'] ?? 0).toBeGreaterThan(0);
    expect(dist['CATEGORY'] ?? 0).toBeGreaterThan(0);
    expect(dist['RANGE'] ?? 0).toBeGreaterThan(0);
  });
});

// ===========================================================================
// BOOT（5）— E2E
// ===========================================================================
describe('AD-E07-39 P1b3 BOOT', () => {
  it('TS-MSSQL-P1B3-BOOT-001：乾淨 dbo 逐步 bootstrap 全流程零錯（migration + 3 seeds 皆 exit 0）', (ctx) => {
    ensureMssql(ctx);
    for (const [name, r] of [
      ['migration:run', migrationRun],
      ['seed', seedRun],
      ['seed-datasource', seedDsRun],
      ['data-seed', dataSeedRun],
    ] as const) {
      expect(r!.status, `${name} stderr=${r!.stderr}`).toBe(0);
    }
  });

  it('TS-MSSQL-P1B3-BOOT-002：bootstrap 後 4 帳號可用密碼（bcrypt round-trip）', async (ctx) => {
    ensureMssql(ctx);
    const rows = await ds!.query(
      `SELECT password_hash FROM users WHERE email = @0`,
      ['admin@cdmp.test'],
    );
    expect(rows.length).toBe(1);
    expect(await bcrypt.compare('P@ssw0rd123', rows[0].password_hash)).toBe(true);
  });

  it('TS-MSSQL-P1B3-BOOT-003：datasources 空殼 — encrypted_password 解密為空字串 / status unknown / last_tested_at NULL', async (ctx) => {
    ensureMssql(ctx);
    const rows = await ds!.query(
      `SELECT encrypted_password, status, last_tested_at FROM datasources`,
    );
    expect(rows.length).toBe(9);
    for (const r of rows) {
      expect(r.status).toBe('unknown');
      expect(r.last_tested_at).toBeNull();
      expect(CryptoUtil.decrypt(r.encrypted_password)).toBe('');
    }
  });

  it('TS-MSSQL-P1B3-BOOT-004：etl_pipelines/versions FK 完整、created_by 指向存在 users', async (ctx) => {
    ensureMssql(ctx);
    expect(await tableCount('etl_pipelines')).toBe(SEED.etlPipelines.length);
    const badCreatedBy = await ds!.query(
      `SELECT COUNT(*) AS n FROM etl_pipelines p LEFT JOIN users u ON p.created_by = u.id WHERE u.id IS NULL`,
    );
    expect(Number(badCreatedBy[0].n)).toBe(0);
    const missingVer = await ds!.query(
      `SELECT COUNT(*) AS n FROM etl_pipelines p
       WHERE NOT EXISTS (SELECT 1 FROM etl_pipeline_versions v WHERE v.pipeline_id = p.id)`,
    );
    expect(Number(missingVer[0].n)).toBe(0);
  });

  it('TS-MSSQL-P1B3-BOOT-005：extraction_tasks 無懸空 datasource_id FK', async (ctx) => {
    ensureMssql(ctx);
    expect(await tableCount('extraction_tasks')).toBe(SEED.extractionTasks.length);
    const orphan = await ds!.query(
      `SELECT COUNT(*) AS n FROM extraction_tasks t
       LEFT JOIN datasources d ON t.datasource_id = d.id WHERE d.id IS NULL`,
    );
    expect(Number(orphan[0].n)).toBe(0);
  });
});

// ===========================================================================
// COUNT（12）— 筆數對齊
// ===========================================================================
describe('AD-E07-39 P1b3 COUNT', () => {
  const cases: Array<[string, string, number]> = [
    ['COUNT-001', 'users', 4],
    ['COUNT-002', 'datasources', SEED.datasources.length],
    ['COUNT-003', 'ob_card_type', SEED.cardType.length],
    ['COUNT-004', 'ob_levelcard_version', SEED.version.length],
    ['COUNT-005', 'ob_levelcard_column', SEED.column.length],
    ['COUNT-006', 'ob_levelcard_score', SEED.score.length],
    ['COUNT-007', 'ob_levelcard_level', SEED.level.length],
    ['COUNT-008', 'ob_tier', SEED.tier.length],
    ['COUNT-009', 'etl_pipelines', SEED.etlPipelines.length],
    ['COUNT-010', 'extraction_tasks', SEED.extractionTasks.length],
  ];
  for (const [id, table, expected] of cases) {
    it(`TS-MSSQL-P1B3-${id}：${table} = ${expected}`, async (ctx) => {
      ensureMssql(ctx);
      expect(await tableCount(table)).toBe(expected);
    });
  }

  it('TS-MSSQL-P1B3-COUNT-011（🔴 P1b3 移植後必過）：roles = 2', async (ctx) => {
    ensureMssql(ctx);
    expect(BASELINE_ROLES.length).toBe(2);
    expect(await tableCount('roles')).toBe(2);
  });

  it('TS-MSSQL-P1B3-COUNT-012（🔴 P1b3 移植後必過）：pooldata_field_whitelist = 17、pooldata_field_option = 186', async (ctx) => {
    ensureMssql(ctx);
    expect(BASELINE_WHITELIST.length).toBe(17);
    expect(BASELINE_OPTIONS.length).toBe(186);
    expect(await tableCount('pooldata_field_whitelist')).toBe(17);
    expect(await tableCount('pooldata_field_option')).toBe(186);
  });
});

// ===========================================================================
// IDEM（5）— 冪等（第二次執行）
// ===========================================================================
describe('AD-E07-39 P1b3 IDEM（第二次 bootstrap seeds）', () => {
  const snapshot: Record<string, number> = {};
  const IDEM_TABLES = [
    'users', 'datasources', 'ob_card_type', 'ob_levelcard_version', 'ob_levelcard_column',
    'ob_levelcard_score', 'ob_levelcard_level', 'ob_tier', 'etl_pipelines', 'etl_pipeline_versions',
    'extraction_tasks', 'roles', 'pooldata_field_whitelist', 'pooldata_field_option',
  ];

  beforeAll(async () => {
    if (!reachable || !ds) return;
    for (const t of IDEM_TABLES) snapshot[t] = await tableCount(t);
    // 第二次執行三支 seed（migration:run 天然冪等，不重複驗）。
    seed2 = runNpm('seed');
    seedDs2 = runNpm('seed-datasource');
    dataSeed2 = runNpm('data-seed');
  }, 300000);

  it('TS-MSSQL-P1B3-IDEM-001：重跑 seed/seed-datasource/data-seed 後所有表列數不變', async (ctx) => {
    ensureMssql(ctx);
    for (const t of IDEM_TABLES) {
      expect(await tableCount(t), t).toBe(snapshot[t]);
    }
  });

  it('TS-MSSQL-P1B3-IDEM-002：第二次執行 exit 0，且呈「0 新增 / 已存在」而非唯一鍵衝突拋錯', (ctx) => {
    ensureMssql(ctx);
    expect(seed2!.status).toBe(0);
    expect(seedDs2!.status).toBe(0);
    expect(dataSeed2!.status).toBe(0);
    expect(ok(dataSeed2)).toMatch(/INSERT 0 缺列/);
    expect(ok(seedDs2)).toMatch(/0 新增/);
  });

  it('TS-MSSQL-P1B3-IDEM-003：值未變動時第二次執行不觸發漂移 WARN', (ctx) => {
    ensureMssql(ctx);
    expect(ok(dataSeed2)).not.toMatch(/\[漂移\]/);
  });

  it('TS-MSSQL-P1B3-IDEM-005：seed.ts 對既有帳號第二次執行 → 4 筆「already correct」、列數不變', async (ctx) => {
    ensureMssql(ctx);
    const skips = (ok(seed2).match(/already correct/g) ?? []).length;
    expect(skips).toBe(4);
    expect(await tableCount('users')).toBe(4);
  });
});

// ===========================================================================
// SITE-DRIFT / IDEM-004（值竄改 → WARN / repair；置於唯讀群組之後）
// ===========================================================================
describe('AD-E07-39 P1b3 SITE-DRIFT（漂移偵測 + repair，mutation）', () => {
  it('TS-MSSQL-P1B3-SITE-007：漂移偵測 WARN-only（預設不改）+ repair（SEED_REPAIR_DRIFT=true 修回）', async (ctx) => {
    ensureMssql(ctx);
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    try {
      // 竄改一筆 card_name（模擬業務 UI 改動）。
      await ds!.query(`UPDATE ob_card_type SET card_name = N'業務改名XYZ' WHERE card_type = @0`, ['H']);
      // (a) 預設（無 SEED_REPAIR_DRIFT）→ WARN、值不變。
      delete process.env.SEED_REPAIR_DRIFT;
      await seedCardTypes(qr);
      const warned = warn.mock.calls.map((c) => String(c[0])).join('\n');
      expect(warned).toMatch(/漂移/);
      expect(warned).toMatch(/ob_card_type/);
      const afterWarn = await ds!.query(`SELECT card_name FROM ob_card_type WHERE card_type = @0`, ['H']);
      expect(afterWarn[0].card_name).toBe('業務改名XYZ');
      // (b) SEED_REPAIR_DRIFT=true → 修回 seed 值。
      process.env.SEED_REPAIR_DRIFT = 'true';
      await seedCardTypes(qr);
      const afterRepair = await ds!.query(`SELECT card_name FROM ob_card_type WHERE card_type = @0`, ['H']);
      const seedH = SEED.cardType.find((c: any) => c.card_type === 'H');
      expect(afterRepair[0].card_name).toBe(seedH.card_name);
    } finally {
      delete process.env.SEED_REPAIR_DRIFT;
      warn.mockRestore();
    }
  });

  it('TS-MSSQL-P1B3-IDEM-004：修復後再次以 SEED_REPAIR_DRIFT=true 執行偵測 0 筆漂移、列數不變', async (ctx) => {
    ensureMssql(ctx);
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    try {
      process.env.SEED_REPAIR_DRIFT = 'true';
      await seedCardTypes(qr); // 已修回 seed 值 → 不再偵測漂移
      const warned = warn.mock.calls.map((c) => String(c[0])).join('\n');
      expect(warned).not.toMatch(/漂移/);
      expect(await tableCount('ob_card_type')).toBe(SEED.cardType.length);
    } finally {
      delete process.env.SEED_REPAIR_DRIFT;
      warn.mockRestore();
    }
  });
});

// ===========================================================================
// PROBE（2）
// ===========================================================================
describe('AD-E07-39 P1b3 PROBE', () => {
  it('TS-MSSQL-P1B3-PROBE-001：mssql driver 之 UPDATE qr.query() 回傳形狀（log-only，不阻擋）', async (ctx) => {
    ensureMssql(ctx);
    const res = await qr.query(
      `UPDATE ob_card_type SET updated_by = updated_by WHERE card_type = @0`,
      ['H'],
    );
    // 探測：記錄回傳形狀。mssql 對 UPDATE 通常回 undefined（非 PG 的 [rows, affected] tuple）。
    // 生產碼以 `res?.[1] ?? 0` 防禦（log 筆數可能不準，但不影響 UPDATE 正確性）。
    const shape = res === undefined ? 'undefined' : Array.isArray(res) ? 'array' : typeof res;
    // eslint-disable-next-line no-console
    console.log(`[P1b3 PROBE-001] mssql UPDATE qr.query() 回傳形狀 = ${shape}`);
    expect(['undefined', 'array', 'object']).toContain(shape);
  });

  it('TS-MSSQL-P1B3-PROBE-002（決策關卡彙整）：reference-data 已於 P1b3 移植 → roles/whitelist/option 非 0', async (ctx) => {
    ensureMssql(ctx);
    // 原測試設計 COUNT-011/012 為「SCOPE GAP 決策關卡」（預期 0）；P1b3 已移植 MssqlBaselineReferenceData →
    // 三表皆有值，SCOPE GAP 已關閉。此處彙整確認結論陳述成立。
    expect(await tableCount('roles')).toBe(2);
    expect(await tableCount('pooldata_field_whitelist')).toBe(17);
    expect(await tableCount('pooldata_field_option')).toBe(186);
  });
});

// ===========================================================================
// STATIC（3）
// ===========================================================================
describe('AD-E07-39 P1b3 STATIC', () => {
  const seedSrc = (f: string) => readFileSync(join(SEEDS_DIR, f), 'utf8');
  // 只掃「程式碼」不掃註解——本輪轉換說明註解會刻意提及 PG-only token（NOW()/RETURNING/…），
  // 掃描目標為實際 SQL 使用，故先剝除區塊/行註解。
  const stripComments = (s: string) =>
    s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');

  it('TS-MSSQL-P1B3-STATIC-001：三支腳本零殘留 PG-only 語法（NOW()/RETURNING/::text/IS NOT DISTINCT FROM/裸 true）', () => {
    for (const f of ['seed.ts', 'seed-datasource.ts', 'prod-data-seed.ts']) {
      const src = stripComments(seedSrc(f));
      expect(src, `${f} NOW()`).not.toMatch(/\bNOW\(\)/i);
      expect(src, `${f} RETURNING`).not.toMatch(/\bRETURNING\b/i);
      expect(src, `${f} ::text`).not.toContain('::text');
      expect(src, `${f} IS NOT DISTINCT FROM`).not.toMatch(/IS NOT DISTINCT FROM/i);
      expect(src, `${f} $n placeholder`).not.toMatch(/\$\$\{|= \$1|\bLIMIT 1\b/);
    }
    // 裸布林 VALUES(...true...) 已改綁定（prod-data-seed 之 extraction_tasks）。
    expect(stripComments(seedSrc('prod-data-seed.ts'))).not.toMatch(/VALUES\s*\([^)]*\btrue\b[^)]*\)/i);
  });

  it('TS-MSSQL-P1B3-STATIC-002：三支腳本零殘留 type:\'postgres\'（同 DIALECT-004）', () => {
    for (const f of ['seed.ts', 'seed-datasource.ts', 'prod-data-seed.ts']) {
      expect(seedSrc(f), f).not.toMatch(/type:\s*'postgres'/);
    }
  });

  it('TS-MSSQL-P1B3-STATIC-003：seed raw SQL 站點清單文件存在（impl log 涵蓋 A~H 全類別）', () => {
    const log = readFileSync(
      join(API_ROOT, '..', '..', 'docs', 'specs', 'implementation-log', 'AD-E07-39-P1b3-impl.md'),
      'utf8',
    );
    for (const cat of ['DataSource', 'NOW()', 'RETURNING', '::text', 'IS NOT DISTINCT FROM', '布林']) {
      expect(log, cat).toContain(cat);
    }
  });
});

// ===========================================================================
// REG（in-spec 部分：REG-005；REG-001/002/003/004 為外部閘見 impl log）
// ===========================================================================
describe('AD-E07-39 P1b3 REG', () => {
  it('TS-MSSQL-P1B3-REG-005：package.json bootstrap script 步驟順序文字未被更動', () => {
    const pkg = JSON.parse(readFileSync(join(API_ROOT, 'package.json'), 'utf8'));
    expect(pkg.scripts.bootstrap).toBe(
      'npm run migration:run && npm run seed && npm run seed-datasource && npm run data-seed',
    );
  });
});

// ===========================================================================
// 破壞性群組（置於最後）：ALIAS-006 one-shot bootstrap + ALIAS-002 revert
// ===========================================================================
describe('AD-E07-39 P1b3 ALIAS（破壞性，末端執行）', () => {
  it('TS-MSSQL-P1B3-ALIAS-006（🔴 DoD #1 全流程）：清空 dbo → 字面 npm run bootstrap 一次到位 exit 0、最終筆數一致', async (ctx) => {
    ensureMssql(ctx);
    await dropAllDbo(ds!);
    const boot = runNpm('bootstrap');
    expect(boot.status, `stderr=${boot.stderr}`).toBe(0);
    const out = ok(boot);
    expect(out).toMatch(/has been executed successfully/);
    expect(out).not.toMatch(/17750|Could not load the DLL|QueryFailedError/i);
    // 最終狀態與分步一致。
    expect(await tableCount('users')).toBe(4);
    expect(await tableCount('datasources')).toBe(9);
    expect(await tableCount('ob_levelcard_score')).toBe(SEED.score.length);
    expect(await tableCount('roles')).toBe(2);
    expect(await tableCount('pooldata_field_option')).toBe(186);
    expect(await tableCount('typeorm_migrations')).toBe(3);
  });

  it('TS-MSSQL-P1B3-ALIAS-002：字面 npm run migration:revert 對稱可用（逆轉三支 baseline → dbo 淨空）', async (ctx) => {
    ensureMssql(ctx);
    // AD-E07-40 P2a：3 支 baseline → 逆轉三次（TypeORM 由新到舊）：queue_job → reference-data（down no-op）→ schema（DROP 全表）。
    const r1 = runNpm('migration:revert'); // queue_job（DROP queue_job）
    expect(r1.status, `#1 stderr=${r1.stderr}`).toBe(0);
    const r2 = runNpm('migration:revert'); // reference-data（down no-op）
    expect(r2.status, `#2 stderr=${r2.stderr}`).toBe(0);
    const r3 = runNpm('migration:revert'); // schema（DROP 全表）
    expect(r3.status, `#3 stderr=${r3.stderr}`).toBe(0);
    expect(ok(r1) + ok(r2) + ok(r3)).not.toMatch(/17750|Could not load the DLL|QueryFailedError/i);
    expect(await dboBusinessTableCount()).toBe(0);
    expect(await tableCount('typeorm_migrations')).toBe(0);
  });
});
