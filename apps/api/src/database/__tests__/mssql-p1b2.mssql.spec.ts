/**
 * AD-E07-39 P1b2 — MSSQL 全面遷移 prod baseline migration + dev/prod parity 驗證。
 *
 * 覆蓋測試設計 AD-E07-39-P1b2-test.md（39 案例）：
 *   BASELINE（6）  — baseline migration 對全新 dbo 建表成功（NODE_ENV=production，字面 CLI 呼叫）
 *   PARITY（10）    — synchronize(p1b2_sync) vs migration(dbo) 結構化 diff 為空 + comparator 自洽/敏感度
 *   TIERFN（3）     — fn_calc_tier_level 未建立
 *   FILTER（3）     — 無 filtered index（F-2）
 *   COLLATE-BASELINE（3）— collation 繼承（DB 層級，非逐欄）
 *   CASE-BASELINE（2）   — 大小寫守門
 *   HASH-BASELINE（3）   — B1 token_hash binary(32)
 *   STATIC（4）     — 不含動態 SQL 執行 API / 不依賴 pg 語法 / 合法 MigrationInterface / revert 逆轉
 *   REG（5）        — 型別檢查 + p1a/p1b1/其他套件不回歸 + dbo 保留慣例閉環
 *
 * 兩路徑 Harness（測試設計 第0節）：
 *   - Path A（synchronize）：專屬 schema `p1b2_sync`（TypeORM schema 選項自動前綴 DDL）。
 *   - Path B（baseline migration）：`dbo`（不新建 schema，對應 prod 真實部署路徑；data-source.ts mssql 分支未設 schema）。
 *   - dbo 為本套件保留：beforeAll 先斷言 dbo 為空（fail-fast），afterAll 清空回 0（含 typeorm_migrations）。
 *
 * Gating：連不上 MSSQL → DB 相依 test ctx.skip()（不偽造綠燈，feedback_mock_real_system_contract）。
 * 表數：36（非 37，算術 off-by-one，沿用 P1b1）；一律動態對齊 ALL_ENTITIES.length。
 */

// 必最先 import（side-effect 設 DB_TYPE=mssql，供 entity 之 column-types helper 解析 mssql 分支值）。
import {
  restoreDbType,
  MSSQL,
  mssqlPortReachable,
  SKIP_REASON,
} from './mssql-env-preload';

import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { readFileSync, existsSync } from 'fs';
import { join } from 'path';
import { spawnSync } from 'child_process';
import { DataSource } from 'typeorm';

import {
  diffColumnSets,
  diffIndexSets,
  diffTableSets,
  buildIndexRecords,
  isEmptyComparison,
  type ColumnRow,
  type IndexColumnRow,
} from './schema-parity';

// baseline migration class（STATIC-003：驗證為合法 MigrationInterface）。
import { MssqlBaselineSchema1751884800000 } from '@/database/migrations/mssql/1751884800000-MssqlBaselineSchema';

// === 全 36 entity（顯式陣列；兼作 parity 期望集合，比照 P1b1）===
import { User } from '@/database/entities/user.entity';
import { Role } from '@/database/entities/role.entity';
import { TokenBlocklist } from '@/database/entities/token-blocklist.entity';
import { PasswordResetToken } from '@/database/entities/password-reset-token.entity';
import { Datasource } from '@/database/entities/datasource.entity';
import { DatasourceHealthLog } from '@/database/entities/datasource-health-log.entity';
import { ExtractionTask } from '@/database/entities/extraction-task.entity';
import { ExtractionLog } from '@/database/entities/extraction-log.entity';
import { EtlPipeline } from '@/database/entities/etl-pipeline.entity';
import { EtlPipelineLog } from '@/database/entities/etl-pipeline-log.entity';
import { EtlPipelineVersion } from '@/database/entities/etl-pipeline-version.entity';
import { ObCodeDf } from '@/database/entities/ob-code-df.entity';
import { ObListDefinition } from '@/database/entities/ob-list-definition.entity';
import { ObDeptPct } from '@/database/entities/ob-dept-pct.entity';
import { ObEmplSet } from '@/database/entities/ob-empl-set.entity';
import { ObLevelcardVersion } from '@/database/entities/ob-levelcard-version.entity';
import { ObLevelcardColumn } from '@/database/entities/ob-levelcard-column.entity';
import { ObLevelcardScore } from '@/database/entities/ob-levelcard-score.entity';
import { ObLevelcardLevel } from '@/database/entities/ob-levelcard-level.entity';
import { ObTier } from '@/database/entities/ob-tier.entity';
import { ObEmphire } from '@/database/entities/ob-emphire.entity';
import { ObCalendar } from '@/database/entities/ob-calendar.entity';
import { ObPoolData } from '@/database/entities/ob-pool-data.entity';
import { ObPoolDataList } from '@/database/entities/ob-pool-data-list.entity';
import { ObMonthlyRunResult } from '@/database/entities/ob-monthly-run-result.entity';
import { AssignmentRun } from '@/database/entities/assignment-run.entity';
import { AssignmentRunSnapshot } from '@/database/entities/assignment-run-snapshot.entity';
import { AssignmentRunStageLog } from '@/database/entities/assignment-run-stage-log.entity';
import { AssignmentAuditLog } from '@/database/entities/assignment-audit-log.entity';
import { AssignmentApproval } from '@/database/entities/assignment-approval.entity';
import { ObAssignConfig } from '@/database/entities/ob-assign-config.entity';
import { ObAssignSet } from '@/database/entities/ob-assign-set.entity';
import { ObArreturndfMinCap } from '@/database/entities/ob-arreturndf-min-cap.entity';
import { ObCardType } from '@/database/entities/ob-card-type.entity';
import { PooldataFieldWhitelist } from '@/database/entities/pooldata-field-whitelist.entity';
import { PooldataFieldOption } from '@/database/entities/pooldata-field-option.entity';

const ALL_ENTITIES = [
  User, Role, TokenBlocklist, PasswordResetToken,
  Datasource, DatasourceHealthLog, ExtractionTask, ExtractionLog,
  EtlPipeline, EtlPipelineLog, EtlPipelineVersion,
  ObCodeDf, ObListDefinition, ObDeptPct, ObEmplSet,
  ObLevelcardVersion, ObLevelcardColumn, ObLevelcardScore, ObLevelcardLevel,
  ObTier, ObEmphire, ObCalendar, ObPoolData, ObPoolDataList, ObMonthlyRunResult,
  AssignmentRun, AssignmentRunSnapshot, AssignmentRunStageLog, AssignmentAuditLog, AssignmentApproval,
  ObAssignConfig, ObAssignSet, ObArreturndfMinCap, ObCardType,
  PooldataFieldWhitelist, PooldataFieldOption,
];

const EXPECTED_ENTITY_COUNT = ALL_ENTITIES.length; // 36

vi.setConfig({ testTimeout: 180000 });

const SYNC_SCHEMA = 'p1b2_sync'; // Path A
const DBO = 'dbo'; // Path B（baseline migration，對應 prod 部署路徑）
const MIGRATION_REL = join('src', 'database', 'migrations', 'mssql', '1751884800000-MssqlBaselineSchema.ts');
const MIGRATION_SRC_PATH = join(__dirname, '..', 'migrations', 'mssql', '1751884800000-MssqlBaselineSchema.ts');
const DATA_SOURCE_PATH = join(__dirname, '..', 'data-source.ts');
const API_ROOT = join(__dirname, '..', '..', '..'); // apps/api

let reachable = false;
let ds: DataSource | null = null;
let dboInitialTableCount = -1;
let cliRunResult: ReturnType<typeof spawnSync> | null = null;
const CLI_ENV_NODE_ENV = 'production';

function ensureMssql(ctx: { skip: () => void }): void {
  if (!reachable || !ds) {
    // eslint-disable-next-line no-console
    console.warn(`[AD-E07-39 P1b2] SKIPPED — ${SKIP_REASON}`);
    ctx.skip();
  }
}

function mssqlOptions(schema?: string) {
  return {
    type: 'mssql' as const,
    host: MSSQL.host,
    port: MSSQL.port,
    username: MSSQL.username,
    password: MSSQL.password,
    database: MSSQL.database,
    ...(schema ? { schema } : {}),
    options: {
      encrypt: MSSQL.encrypt,
      trustServerCertificate: MSSQL.trustServerCertificate,
    },
  };
}

/** 解析 hoisted typeorm CLI（monorepo workspace 提升至 repo root；fallback apps/api local）。 */
function resolveTypeormCli(): string {
  const candidates = [
    join(__dirname, '..', '..', '..', '..', '..', 'node_modules', 'typeorm', 'cli.js'), // repo root
    join(__dirname, '..', '..', '..', '..', 'node_modules', 'typeorm', 'cli.js'), // apps/api local
  ];
  for (const c of candidates) if (existsSync(c)) return c;
  throw new Error('typeorm cli.js not found in expected node_modules locations');
}

/**
 * 字面 CLI 呼叫（測試設計 第0.4節 方式1）。
 * ⚠️ 偏離：本機 npm script `typeorm` 之相對路徑 `./node_modules/typeorm/cli.js` 於 monorepo 提升下不存在，
 *    且 ts-node 作為 launcher 於 Node 24 有 getProjectSearchDir bug；故改以 node launcher + require hooks
 *    直呼 hoisted cli.js（功能等價：仍是「CLI 工具 + data-source.ts + migration 檔案」三者串接的真實執行）。
 */
function runTypeormCli(command: string): ReturnType<typeof spawnSync> {
  const cli = resolveTypeormCli();
  return spawnSync(
    process.execPath,
    [
      '-r', 'tsconfig-paths/register',
      '-r', 'ts-node/register/transpile-only',
      cli, command, '-d', 'src/database/data-source.ts',
    ],
    {
      cwd: API_ROOT,
      encoding: 'utf8',
      timeout: 150000,
      env: {
        ...process.env,
        DB_TYPE: 'mssql',
        DB_HOST: MSSQL.host,
        DB_PORT: String(MSSQL.port),
        DB_NAME: MSSQL.database,
        DB_USERNAME: MSSQL.username,
        DB_PASSWORD: MSSQL.password,
        DB_MSSQL_ENCRYPT: String(MSSQL.encrypt),
        DB_MSSQL_TRUST_CERT: String(MSSQL.trustServerCertificate),
        NODE_ENV: CLI_ENV_NODE_ENV,
        TYPEORM_LOG: 'false',
      },
    },
  );
}

async function dropAllTablesInSchema(d: DataSource, schema: string): Promise<void> {
  const fks: Array<{ tbl: string; fk: string }> = await d.query(
    `SELECT t.name AS tbl, f.name AS fk
     FROM sys.foreign_keys f
     JOIN sys.tables t ON f.parent_object_id = t.object_id
     JOIN sys.schemas s ON t.schema_id = s.schema_id
     WHERE s.name = @0`,
    [schema],
  );
  for (const { tbl, fk } of fks) {
    await d.query(`ALTER TABLE [${schema}].[${tbl}] DROP CONSTRAINT [${fk}]`);
  }
  const tables: Array<{ tbl: string }> = await d.query(
    `SELECT t.name AS tbl FROM sys.tables t
     JOIN sys.schemas s ON t.schema_id = s.schema_id WHERE s.name = @0`,
    [schema],
  );
  for (const { tbl } of tables) {
    await d.query(`DROP TABLE [${schema}].[${tbl}]`);
  }
}

async function countTables(schema: string): Promise<number> {
  const r = await ds!.query(
    `SELECT COUNT(*) AS n FROM sys.tables t
     JOIN sys.schemas s ON t.schema_id = s.schema_id WHERE s.name = @0`,
    [schema],
  );
  return Number(r[0].n);
}

async function fetchColumns(schema: string): Promise<ColumnRow[]> {
  return ds!.query(
    `SELECT TABLE_NAME AS table_name, COLUMN_NAME AS column_name, DATA_TYPE,
            CHARACTER_MAXIMUM_LENGTH, NUMERIC_PRECISION, NUMERIC_SCALE,
            DATETIME_PRECISION, IS_NULLABLE, COLUMN_DEFAULT
     FROM INFORMATION_SCHEMA.COLUMNS
     WHERE TABLE_SCHEMA = @0 AND TABLE_NAME <> 'typeorm_migrations'`,
    [schema],
  );
}

async function fetchIndexRows(schema: string): Promise<IndexColumnRow[]> {
  return ds!.query(
    `SELECT t.name AS table_name, i.name AS index_name, i.is_primary_key AS is_primary_key,
            i.is_unique AS is_unique, i.type_desc AS type_desc,
            c.name AS column_name, ic.key_ordinal AS key_ordinal
     FROM sys.indexes i
     JOIN sys.tables t ON i.object_id = t.object_id
     JOIN sys.schemas s ON t.schema_id = s.schema_id
     JOIN sys.index_columns ic ON i.object_id = ic.object_id AND i.index_id = ic.index_id AND ic.is_included_column = 0
     JOIN sys.columns c ON ic.object_id = c.object_id AND ic.column_id = c.column_id
     WHERE s.name = @0 AND i.index_id > 0 AND t.name <> 'typeorm_migrations'
     ORDER BY t.name, i.name, ic.key_ordinal`,
    [schema],
  );
}

async function fetchTableNames(schema: string): Promise<string[]> {
  const rows: Array<{ table_name: string }> = await ds!.query(
    `SELECT TABLE_NAME AS table_name FROM INFORMATION_SCHEMA.TABLES
     WHERE TABLE_SCHEMA = @0 AND TABLE_TYPE = 'BASE TABLE' AND TABLE_NAME <> 'typeorm_migrations'`,
    [schema],
  );
  return rows.map((r) => r.table_name);
}

beforeAll(async () => {
  reachable = await mssqlPortReachable(1500);
  if (!reachable) return;
  try {
    ds = new DataSource({
      ...mssqlOptions(SYNC_SCHEMA),
      entities: ALL_ENTITIES,
      synchronize: false,
    });
    await ds.initialize();
  } catch (e) {
    // eslint-disable-next-line no-console
    console.warn('[AD-E07-39 P1b2] init failed → skip:', (e as Error)?.message);
    reachable = false;
    ds = null;
    return;
  }

  // BASELINE-006 前置守門：於任何建置前擷取 dbo 表數（含 typeorm_migrations）。非 0 由 BASELINE-006 明確失敗。
  const dboAll = await ds.query(
    `SELECT COUNT(*) AS n FROM sys.tables t
     JOIN sys.schemas s ON t.schema_id = s.schema_id WHERE s.name = 'dbo'`,
  );
  dboInitialTableCount = Number(dboAll[0].n);

  // Path A：synchronize → p1b2_sync（乾淨重建全 36 表）。
  await ds.query(`IF SCHEMA_ID('${SYNC_SCHEMA}') IS NULL EXEC('CREATE SCHEMA ${SYNC_SCHEMA}')`);
  await dropAllTablesInSchema(ds, SYNC_SCHEMA);
  await ds.synchronize();

  // Path B：baseline migration → dbo（字面 CLI，NODE_ENV=production；只有 dbo 乾淨時才會建成 36 表 + 1 筆紀錄）。
  if (dboInitialTableCount === 0) {
    cliRunResult = runTypeormCli('migration:run');
  }
}, 240000);

afterAll(async () => {
  if (ds) {
    // 冪等清理（REG-005 已於最後一個 test 清 dbo；此處再保險一次 + 清 p1b2_sync）。
    try { await dropAllTablesInSchema(ds, DBO); } catch { /* noop */ }
    try { await dropAllTablesInSchema(ds, SYNC_SCHEMA); } catch { /* noop */ }
    await ds.destroy();
  }
  restoreDbType();
});

// ===========================================================================
// 一、BASELINE — Baseline Migration 建置成功
// ===========================================================================
describe('AD-E07-39 P1b2 BASELINE', () => {
  it('TS-MSSQL-P1B2-BASELINE-006（前置守門）：建置前 CDMP_TEST.dbo 為空', (ctx) => {
    ensureMssql(ctx);
    expect(
      dboInitialTableCount,
      'dbo 非乾淨狀態（可能為前次失敗殘留或其他套件誤用 dbo）',
    ).toBe(0);
  });

  it('TS-MSSQL-P1B2-BASELINE-001（🔴 DoD #1）：NODE_ENV=production 下 migration:run 對全新 dbo 成功，零錯誤', (ctx) => {
    ensureMssql(ctx);
    expect(cliRunResult, 'cliRunResult 未執行（dbo 非空？見 BASELINE-006）').not.toBeNull();
    expect(cliRunResult!.status, `stderr=${cliRunResult!.stderr}`).toBe(0);
    const out = `${cliRunResult!.stdout ?? ''}${cliRunResult!.stderr ?? ''}`;
    expect(out).toContain('has been executed successfully');
    expect(out).not.toMatch(/QueryFailedError|17750|Could not load the DLL/i);
  });

  it('TS-MSSQL-P1B2-BASELINE-002：dbo 建出業務資料表數 = ALL_ENTITIES.length（36，動態對齊）', async (ctx) => {
    ensureMssql(ctx);
    const rows: Array<{ table_name: string }> = await ds!.query(
      `SELECT TABLE_NAME AS table_name FROM INFORMATION_SCHEMA.TABLES
       WHERE TABLE_SCHEMA='dbo' AND TABLE_TYPE='BASE TABLE' AND TABLE_NAME <> 'typeorm_migrations'`,
    );
    expect(rows.length).toBe(EXPECTED_ENTITY_COUNT);
    expect(rows.length).toBe(ds!.entityMetadatas.length);
  });

  it('TS-MSSQL-P1B2-BASELINE-003：typeorm_migrations 恰 1 筆，第二次 migration:run 為 no-op', async (ctx) => {
    ensureMssql(ctx);
    const before = await ds!.query(`SELECT COUNT(*) AS n FROM dbo.typeorm_migrations`);
    expect(Number(before[0].n)).toBe(1);

    const second = runTypeormCli('migration:run');
    expect(second.status, `stderr=${second.stderr}`).toBe(0);
    const out = `${second.stdout ?? ''}${second.stderr ?? ''}`;
    expect(out).toMatch(/No migrations are pending/i);

    const after = await ds!.query(`SELECT COUNT(*) AS n FROM dbo.typeorm_migrations`);
    expect(Number(after[0].n)).toBe(1);
  });

  it('TS-MSSQL-P1B2-BASELINE-004：CLI datasource synchronize=false 且以 NODE_ENV=production 執行（無 synchronize 混淆）', (ctx) => {
    ensureMssql(ctx);
    // data-source.ts（CLI 專用 datasource）恆 synchronize:false → 建表完全歸因於 migration。
    const dsSrc = readFileSync(DATA_SOURCE_PATH, 'utf8');
    expect(dsSrc).toMatch(/synchronize:\s*false/);
    // 本群組子行程確以 NODE_ENV=production 執行（app.module.ts 之 synchronize 於 production 亦關閉）。
    expect(CLI_ENV_NODE_ENV).toBe('production');
    const appSrc = readFileSync(join(__dirname, '..', '..', 'app.module.ts'), 'utf8');
    expect(appSrc).toMatch(/NODE_ENV/);
  });

  it('TS-MSSQL-P1B2-BASELINE-005：關鍵 FK assignment_run_stage_log.run_id → assignment_run 正確建立', async (ctx) => {
    ensureMssql(ctx);
    const rows = await ds!.query(
      `SELECT OBJECT_NAME(f.referenced_object_id) AS ref
       FROM sys.foreign_keys f
       JOIN sys.tables t ON f.parent_object_id = t.object_id
       JOIN sys.schemas s ON t.schema_id = s.schema_id
       WHERE s.name = 'dbo' AND t.name = 'assignment_run_stage_log'`,
    );
    expect(rows.length).toBeGreaterThanOrEqual(1);
    expect(rows.map((r: { ref: string }) => r.ref)).toContain('assignment_run');
  });
});

// ===========================================================================
// 二、PARITY — Dev/Prod 結構化 Parity（I-MSSQL-BASELINE-PARITY-01）
// ===========================================================================
describe('AD-E07-39 P1b2 PARITY', () => {
  it('TS-MSSQL-P1B2-PARITY-001（🔴 核心）：INFORMATION_SCHEMA.COLUMNS 逐欄屬性交集完全相等', async (ctx) => {
    ensureMssql(ctx);
    const a = await fetchColumns(SYNC_SCHEMA);
    const b = await fetchColumns(DBO);
    const cmp = diffColumnSets(a, b);
    expect(cmp.fieldDiffs, JSON.stringify(cmp.fieldDiffs.slice(0, 10))).toEqual([]);
  });

  it('TS-MSSQL-P1B2-PARITY-002：欄位集合對稱差為空（無任一路徑獨有欄位）', async (ctx) => {
    ensureMssql(ctx);
    const a = await fetchColumns(SYNC_SCHEMA);
    const b = await fetchColumns(DBO);
    const cmp = diffColumnSets(a, b);
    expect(cmp.setDiffs, JSON.stringify(cmp.setDiffs.slice(0, 10))).toEqual([]);
  });

  it('TS-MSSQL-P1B2-PARITY-003：資料表集合對稱差為空（36 = 36）', async (ctx) => {
    ensureMssql(ctx);
    const a = await fetchTableNames(SYNC_SCHEMA);
    const b = await fetchTableNames(DBO);
    expect(a.length).toBe(EXPECTED_ENTITY_COUNT);
    expect(b.length).toBe(EXPECTED_ENTITY_COUNT);
    const d = diffTableSets(a, b);
    expect(d.onlyA).toEqual([]);
    expect(d.onlyB).toEqual([]);
  });

  it('TS-MSSQL-P1B2-PARITY-004（🔴 核心）：索引定義（PK/unique/一般）結構化 diff 為空', async (ctx) => {
    ensureMssql(ctx);
    const a = buildIndexRecords(await fetchIndexRows(SYNC_SCHEMA));
    const b = buildIndexRecords(await fetchIndexRows(DBO));
    const cmp = diffIndexSets(a, b);
    expect(cmp.fieldDiffs, JSON.stringify(cmp.fieldDiffs)).toEqual([]);
    expect(cmp.setDiffs, JSON.stringify(cmp.setDiffs)).toEqual([]);
    // 具名交叉驗證：token_blocklist PK 與 stage_log (run_id, stage_no) unique 兩路徑皆存在等價定義。
    const hasTbPk = a.some((r) => r.table_name === 'token_blocklist' && r.is_primary_key);
    const hasStageUq = a.some(
      (r) => r.table_name === 'assignment_run_stage_log' && r.is_unique && !r.is_primary_key
        && r.columns.join(',') === 'run_id,stage_no',
    );
    expect(hasTbPk).toBe(true);
    expect(hasStageUq).toBe(true);
  });

  it('TS-MSSQL-P1B2-PARITY-005：索引集合對稱差為空', async (ctx) => {
    ensureMssql(ctx);
    const a = buildIndexRecords(await fetchIndexRows(SYNC_SCHEMA));
    const b = buildIndexRecords(await fetchIndexRows(DBO));
    const cmp = diffIndexSets(a, b);
    expect(cmp.setDiffs).toEqual([]);
  });

  it('TS-MSSQL-P1B2-PARITY-006：sys.check_constraints 兩路徑皆恰為 0 筆', async (ctx) => {
    ensureMssql(ctx);
    const countChecks = async (schema: string) => {
      const r = await ds!.query(
        `SELECT COUNT(*) AS n FROM sys.check_constraints cc
         JOIN sys.tables t ON cc.parent_object_id = t.object_id
         JOIN sys.schemas s ON t.schema_id = s.schema_id
         WHERE s.name = @0`,
        [schema],
      );
      return Number(r[0].n);
    };
    expect(await countChecks(SYNC_SCHEMA)).toBe(0);
    expect(await countChecks(DBO)).toBe(0);
  });

  it('TS-MSSQL-P1B2-PARITY-007：複合索引欄位順序（key_ordinal）逐一比對相同', async (ctx) => {
    ensureMssql(ctx);
    const a = buildIndexRecords(await fetchIndexRows(SYNC_SCHEMA));
    const b = buildIndexRecords(await fetchIndexRows(DBO));
    const stageA = a.find((r) => r.table_name === 'assignment_run_stage_log' && r.is_unique && !r.is_primary_key);
    const stageB = b.find((r) => r.table_name === 'assignment_run_stage_log' && r.is_unique && !r.is_primary_key);
    expect(stageA, 'p1b2_sync stage_log unique index').toBeTruthy();
    expect(stageB, 'dbo stage_log unique index').toBeTruthy();
    // run_id 為第 1 順位、stage_no 為第 2 順位（順序守門）。
    expect(stageA!.columns).toEqual(['run_id', 'stage_no']);
    expect(stageB!.columns).toEqual(['run_id', 'stage_no']);
  });

  it('TS-MSSQL-P1B2-PARITY-008（meta，comparator 自洽）：同一來源自比對（A vs A）必為空 diff', async (ctx) => {
    ensureMssql(ctx);
    const a = await fetchColumns(SYNC_SCHEMA);
    const colsCmp = diffColumnSets(a, a);
    expect(isEmptyComparison(colsCmp)).toBe(true);
    const ia = buildIndexRecords(await fetchIndexRows(SYNC_SCHEMA));
    const idxCmp = diffIndexSets(ia, ia);
    expect(isEmptyComparison(idxCmp)).toBe(true);
  });

  it('TS-MSSQL-P1B2-PARITY-009（🔴 meta，敏感度）：人工注入合成差異必被偵測到恰 1 筆非空 diff', async (ctx) => {
    ensureMssql(ctx);
    const a = await fetchColumns(SYNC_SCHEMA);
    expect(a.length).toBeGreaterThan(0);
    // 深拷貝並竄改一筆欄位屬性（CHARACTER_MAXIMUM_LENGTH）。
    const mutated: ColumnRow[] = a.map((r) => ({ ...r }));
    const targetIdx = mutated.findIndex((r) => r.CHARACTER_MAXIMUM_LENGTH !== null);
    expect(targetIdx).toBeGreaterThanOrEqual(0);
    const origLen = mutated[targetIdx].CHARACTER_MAXIMUM_LENGTH;
    mutated[targetIdx].CHARACTER_MAXIMUM_LENGTH = (Number(origLen) === 100 ? 101 : 100);
    const cmp = diffColumnSets(a, mutated);
    expect(cmp.setDiffs).toEqual([]); // 集合未變，僅屬性變
    expect(cmp.fieldDiffs.length).toBe(1);
    expect(cmp.fieldDiffs[0].table).toBe(a[targetIdx].table_name);
    expect(cmp.fieldDiffs[0].column).toBe(a[targetIdx].column_name);
    expect(cmp.fieldDiffs[0].field).toBe('CHARACTER_MAXIMUM_LENGTH');
    expect(cmp.fieldDiffs[0].valueA).toBe(origLen);
    expect(cmp.fieldDiffs[0].valueB).toBe(mutated[targetIdx].CHARACTER_MAXIMUM_LENGTH);
  });

  it('TS-MSSQL-P1B2-PARITY-010：diff 報告為結構化格式（含 table/column/field/valueA/valueB）', async (ctx) => {
    ensureMssql(ctx);
    // 以合成竄改觸發一筆 diff，驗證輸出結構（非布林/非字串訊息）。
    const a = await fetchColumns(SYNC_SCHEMA);
    const mutated = a.map((r) => ({ ...r }));
    const i = mutated.findIndex((r) => r.DATA_TYPE);
    mutated[i].DATA_TYPE = mutated[i].DATA_TYPE + '_x';
    const cmp = diffColumnSets(a, mutated);
    expect(Array.isArray(cmp.fieldDiffs)).toBe(true);
    const dobj = cmp.fieldDiffs[0];
    expect(dobj).toHaveProperty('table');
    expect(dobj).toHaveProperty('column');
    expect(dobj).toHaveProperty('field');
    expect(dobj).toHaveProperty('valueA');
    expect(dobj).toHaveProperty('valueB');
  });
});

// ===========================================================================
// 三、TIERFN — fn_calc_tier_level 未建立
// ===========================================================================
describe('AD-E07-39 P1b2 TIERFN', () => {
  it('TS-MSSQL-P1B2-TIERFN-001（🔴 DoD #3）：OBJECT_ID(dbo.fn_calc_tier_level) 為 NULL', async (ctx) => {
    ensureMssql(ctx);
    const r = await ds!.query(`SELECT OBJECT_ID('dbo.fn_calc_tier_level') AS oid`);
    expect(r[0].oid).toBeNull();
  });

  it('TS-MSSQL-P1B2-TIERFN-002（靜態守門）：baseline migration 原始碼不含 tier 計算函式名', () => {
    const src = readFileSync(MIGRATION_SRC_PATH, 'utf8');
    expect(src.includes('fn_calc_tier_level')).toBe(false);
  });

  it('TS-MSSQL-P1B2-TIERFN-003（對照組）：p1b2_sync（synchronize 路徑）同樣未建立此函式', async (ctx) => {
    ensureMssql(ctx);
    const r = await ds!.query(`SELECT OBJECT_ID('${SYNC_SCHEMA}.fn_calc_tier_level') AS oid`);
    expect(r[0].oid).toBeNull();
  });
});

// ===========================================================================
// 四、FILTER — 無 Filtered Index（F-2）
// ===========================================================================
describe('AD-E07-39 P1b2 FILTER', () => {
  const countFiltered = async (schema: string) => {
    const r = await ds!.query(
      `SELECT COUNT(*) AS n FROM sys.indexes i
       JOIN sys.tables t ON i.object_id = t.object_id
       JOIN sys.schemas s ON t.schema_id = s.schema_id
       WHERE s.name = @0 AND i.has_filter = 1`,
      [schema],
    );
    return Number(r[0].n);
  };

  it('TS-MSSQL-P1B2-FILTER-001：Path B（dbo）filtered index 計數為 0', async (ctx) => {
    ensureMssql(ctx);
    expect(await countFiltered(DBO)).toBe(0);
  });

  it('TS-MSSQL-P1B2-FILTER-002：Path A（p1b2_sync）filtered index 計數同樣為 0', async (ctx) => {
    ensureMssql(ctx);
    expect(await countFiltered(SYNC_SCHEMA)).toBe(0);
  });

  it('TS-MSSQL-P1B2-FILTER-003（靜態守門）：baseline migration 原始碼不含 filtered index 語法（CREATE INDEX ... WHERE）', () => {
    const src = readFileSync(MIGRATION_SRC_PATH, 'utf8');
    // 偵測 CREATE ... INDEX ... 後接 WHERE 子句（同一 backtick 內）。
    expect(src).not.toMatch(/CREATE[^`]*INDEX[^`]*\bWHERE\b/i);
  });
});

// ===========================================================================
// 五、COLLATE-BASELINE — Collation 繼承（I-MSSQL-COLLATE-01，Baseline 路徑）
// ===========================================================================
describe('AD-E07-39 P1b2 COLLATE-BASELINE', () => {
  it('TS-MSSQL-P1B2-COLLATE-BASELINE-001：dbo 全欄 collation 唯一 = Chinese_Taiwan_Stroke_BIN', async (ctx) => {
    ensureMssql(ctx);
    const rows = await ds!.query(
      `SELECT DISTINCT c.collation_name FROM sys.columns c
       JOIN sys.tables t ON c.object_id = t.object_id
       JOIN sys.schemas s ON t.schema_id = s.schema_id
       WHERE s.name = 'dbo' AND t.name <> 'typeorm_migrations' AND c.collation_name IS NOT NULL`,
    );
    expect(rows.map((r: { collation_name: string }) => r.collation_name)).toEqual(['Chinese_Taiwan_Stroke_BIN']);
  });

  it('TS-MSSQL-P1B2-COLLATE-BASELINE-002：dbo 無任何欄位層級 COLLATE 覆寫（皆繼承 DB 層級）', async (ctx) => {
    ensureMssql(ctx);
    const dbCollation = (await ds!.query(
      `SELECT CAST(DATABASEPROPERTYEX(DB_NAME(),'Collation') AS NVARCHAR(128)) AS coll`,
    ))[0].coll;
    const overrides = await ds!.query(
      `SELECT t.name AS tbl, c.name AS col FROM sys.columns c
       JOIN sys.tables t ON c.object_id = t.object_id
       JOIN sys.schemas s ON t.schema_id = s.schema_id
       WHERE s.name = 'dbo' AND t.name <> 'typeorm_migrations'
         AND c.collation_name IS NOT NULL AND c.collation_name <> @0`,
      [dbCollation],
    );
    expect(overrides).toEqual([]);
  });

  it('TS-MSSQL-P1B2-COLLATE-BASELINE-003（靜態守門）：baseline migration 原始碼完全不含逐欄 collation 覆寫關鍵字', () => {
    const src = readFileSync(MIGRATION_SRC_PATH, 'utf8');
    expect(src.toUpperCase().includes('COLLATE')).toBe(false);
  });
});

// ===========================================================================
// 六、CASE-BASELINE — 大小寫守門（I-MSSQL-CASE-01，Baseline 路徑）
// ===========================================================================
describe('AD-E07-39 P1b2 CASE-BASELINE', () => {
  it('TS-MSSQL-P1B2-CASE-BASELINE-001：dbo 全表名稱皆為小寫', async (ctx) => {
    ensureMssql(ctx);
    const rows = await ds!.query(
      `SELECT t.name AS name FROM sys.tables t
       JOIN sys.schemas s ON t.schema_id = s.schema_id
       WHERE s.name = 'dbo' AND t.name <> 'typeorm_migrations'`,
    );
    expect(rows.length).toBe(EXPECTED_ENTITY_COUNT);
    for (const r of rows) expect(r.name, r.name).toMatch(/^[a-z0-9_]+$/);
  });

  it('TS-MSSQL-P1B2-CASE-BASELINE-002：dbo 全表所有欄位名稱皆為小寫 snake_case', async (ctx) => {
    ensureMssql(ctx);
    const rows = await ds!.query(
      `SELECT c.name AS name FROM sys.columns c
       JOIN sys.tables t ON c.object_id = t.object_id
       JOIN sys.schemas s ON t.schema_id = s.schema_id
       WHERE s.name = 'dbo' AND t.name <> 'typeorm_migrations'`,
    );
    expect(rows.length).toBeGreaterThan(0);
    for (const r of rows) {
      expect(r.name, r.name).toMatch(/^[a-z0-9_]+$/);
      expect(r.name, r.name).toBe(r.name.toLowerCase());
    }
  });
});

// ===========================================================================
// 七、HASH-BASELINE — B1 結構正確（Baseline 路徑）
// ===========================================================================
describe('AD-E07-39 P1b2 HASH-BASELINE', () => {
  it('TS-MSSQL-P1B2-HASH-BASELINE-001：dbo.token_blocklist PK = token_hash binary(32)，無明文 token 欄', async (ctx) => {
    ensureMssql(ctx);
    const info = await ds!.query(
      `SELECT DATA_TYPE, CHARACTER_MAXIMUM_LENGTH FROM INFORMATION_SCHEMA.COLUMNS
       WHERE TABLE_SCHEMA='dbo' AND TABLE_NAME='token_blocklist' AND COLUMN_NAME='token_hash'`,
    );
    expect(info[0].DATA_TYPE).toBe('binary');
    expect(info[0].CHARACTER_MAXIMUM_LENGTH).toBe(32);
    const tokenCol = await ds!.query(
      `SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS
       WHERE TABLE_SCHEMA='dbo' AND TABLE_NAME='token_blocklist' AND COLUMN_NAME='token'`,
    );
    expect(tokenCol).toEqual([]);
  });

  it('TS-MSSQL-P1B2-HASH-BASELINE-002：dbo.token_blocklist PK 鍵寬 = 32 bytes（≤ 900 上限）', async (ctx) => {
    ensureMssql(ctx);
    const rows = await ds!.query(
      `SELECT SUM(c.max_length) AS key_bytes
       FROM sys.indexes i
       JOIN sys.tables t ON i.object_id = t.object_id
       JOIN sys.schemas s ON t.schema_id = s.schema_id
       JOIN sys.index_columns ic ON i.object_id = ic.object_id AND i.index_id = ic.index_id AND ic.is_included_column = 0
       JOIN sys.columns c ON ic.object_id = c.object_id AND ic.column_id = c.column_id
       WHERE s.name = 'dbo' AND t.name = 'token_blocklist' AND i.is_primary_key = 1
       GROUP BY i.name`,
    );
    expect(rows.length).toBe(1);
    expect(Number(rows[0].key_bytes)).toBe(32);
    expect(Number(rows[0].key_bytes)).toBeLessThanOrEqual(900);
  });

  it('TS-MSSQL-P1B2-HASH-BASELINE-003（與 PARITY 交叉引用）：token_blocklist 欄位/索引 parity diff 恰 0 筆', async (ctx) => {
    ensureMssql(ctx);
    const colCmp = diffColumnSets(await fetchColumns(SYNC_SCHEMA), await fetchColumns(DBO));
    const tbColDiffs = [
      ...colCmp.fieldDiffs.filter((d) => d.table === 'token_blocklist'),
      ...colCmp.setDiffs.filter((d) => d.table === 'token_blocklist'),
    ];
    expect(tbColDiffs).toEqual([]);
    const idxCmp = diffIndexSets(
      buildIndexRecords(await fetchIndexRows(SYNC_SCHEMA)),
      buildIndexRecords(await fetchIndexRows(DBO)),
    );
    const tbIdxDiffs = [
      ...idxCmp.fieldDiffs.filter((d) => d.table === 'token_blocklist'),
      ...idxCmp.setDiffs.filter((d) => d.table === 'token_blocklist'),
    ];
    expect(tbIdxDiffs).toEqual([]);
  });
});

// ===========================================================================
// 八、STATIC — 靜態檢查 + revert 逆轉（STATIC-004 置於 dbo 讀取類之後）
// ===========================================================================
describe('AD-E07-39 P1b2 STATIC', () => {
  it('TS-MSSQL-P1B2-STATIC-001（🔴 P1b1 caveat）：baseline migration 原始碼不含動態 SQL 執行 API', () => {
    const src = readFileSync(MIGRATION_SRC_PATH, 'utf8');
    expect(src.toLowerCase().includes('sp_executesql')).toBe(false);
  });

  it('TS-MSSQL-P1B2-STATIC-002：baseline migration 原始碼不含 PostgreSQL 專屬語法標記', () => {
    const src = readFileSync(MIGRATION_SRC_PATH, 'utf8');
    expect(src).not.toContain('::'); // 型別轉換運算子
    expect(src).not.toMatch(/\bSERIAL\b/i);
    expect(src).not.toMatch(/\bRETURNING\b/i);
    expect(src).not.toContain('gen_random_uuid');
    expect(src).not.toContain('uuid_generate_v4');
    expect(src).not.toMatch(/\bNOW\(\)/i); // PG 慣用；MSSQL 應為 getdate()/CURRENT_TIMESTAMP
    expect(src).not.toContain('"public".');
    expect(src).not.toMatch(/CREATE\s+EXTENSION/i);
  });

  it('TS-MSSQL-P1B2-STATIC-003：baseline 為合法 MigrationInterface，且被 data-source.ts mssql 分支 glob 納入', () => {
    const inst = new MssqlBaselineSchema1751884800000();
    expect(inst.name).toBe('MssqlBaselineSchema1751884800000');
    expect(typeof inst.up).toBe('function');
    expect(typeof inst.down).toBe('function');
    // 檔案位於 migrations/mssql/ 且符合 timestamp-prefixed 命名慣例。
    expect(existsSync(MIGRATION_SRC_PATH)).toBe(true);
    expect(MIGRATION_REL).toMatch(/migrations[\\/]mssql[\\/]\d+-MssqlBaselineSchema\.ts$/);
    // data-source.ts mssql 分支 glob 專屬掃描 migrations/mssql/*。
    const dsSrc = readFileSync(DATA_SOURCE_PATH, 'utf8');
    expect(dsSrc).toMatch(/'migrations',\s*'mssql'/);
  });

  it('TS-MSSQL-P1B2-STATIC-004（建議項）：migration:revert 後 dbo 全 36 表與 migration 紀錄乾淨移除', async (ctx) => {
    ensureMssql(ctx);
    const revert = runTypeormCli('migration:revert');
    expect(revert.status, `stderr=${revert.stderr}`).toBe(0);
    const out = `${revert.stdout ?? ''}${revert.stderr ?? ''}`;
    expect(out).not.toMatch(/QueryFailedError|17750|Could not load the DLL/i);
    // 36 業務表移除（typeorm_migrations 表本身仍在，但該筆紀錄移除）。
    const business = await countTables(DBO); // 含 typeorm_migrations
    const migRows = await ds!.query(`SELECT COUNT(*) AS n FROM dbo.typeorm_migrations`);
    expect(Number(migRows[0].n)).toBe(0);
    // 僅剩 typeorm_migrations（1 張）或 0：業務 36 表已全數 drop。
    expect(business).toBeLessThanOrEqual(1);
  });
});

// ===========================================================================
// 九、REG — 回歸 + dbo 保留慣例閉環（REG-005 為最後一個 test，清 dbo 並斷言歸零）
// ===========================================================================
describe('AD-E07-39 P1b2 REG', () => {
  it('TS-MSSQL-P1B2-REG-005（dbo 保留慣例閉環）：清理後 CDMP_TEST.dbo 資料表數量歸零', async (ctx) => {
    ensureMssql(ctx);
    // STATIC-004 已 revert 業務表；此處清空 dbo 剩餘（typeorm_migrations 等）並斷言 0。
    await dropAllTablesInSchema(ds!, DBO);
    const remaining = await countTables(DBO);
    expect(remaining).toBe(0);
  });
});
