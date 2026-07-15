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
// AD-E07-43 P5a（I-MSSQL-CI-BOOTSTRAP-01）：本套件執行真實 CLI migration:run 並反覆清空 dbo，
//   故隔離至專屬資料庫（CDMP_P1B2，由 docker/mssql-init.sql 建立、fresh empty），不碰共用之
//   CDMP_TEST.dbo——後者由 CI bootstrap 建 baseline 供 P3a/P5b 沿用。Path B 仍走「連線之 DB 的 dbo、
//   無 schema override」＝真實 prod 部署路徑，僅資料庫名不同（parity/baseline 語意不受影響）。
const P1B2_DATABASE = process.env.MSSQL_P1B2_DB ?? 'CDMP_P1B2';
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
    database: P1B2_DATABASE,
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
        DB_NAME: P1B2_DATABASE,
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

// AD-E07-40 P2a：queue_job（佇列基礎建設表）非 P1b2 之 36 表業務 baseline 範疇，且其兩軌索引刻意分歧
//   （synchronize 一般索引 vs migration filtered index，見 AD-E07-40-P2a-test SCHEMA-010），
//   不可納入本套件之 parity 比對；一律於 dbo 讀取端排除，改由 P2a 專屬套件獨立驗證。
// AD-E07-41 P4-0：customer_core（客戶資料主檔）為 PG-only 表、無 TypeORM entity（AD-E06-1），synchronize 路徑（Path A）
//   天生不建，僅 baseline migration（Path B/dbo）建之——刻意的 migration-only 表。若納入 parity 會使兩軌表集合不相等
//   （破壞 I-MSSQL-BASELINE-PARITY-01）而誤報，故比照 queue_job 之精神列為白名單例外，一律於 dbo 讀取端排除；
//   其物理存在與結構正確性由本檔 CUSTOMER-CORE 群組獨立正向驗證。
const EXCLUDED_TABLES = "('typeorm_migrations', 'queue_job', 'customer_core', 'customer_financial')";

// F113 / AD-E02-5 §3.2.4：users.employee_no 之 filtered unique index（uq_users_employee_no）為
//   刻意的、僅存在於 Path B（1751884800004 migration）的兩軌分歧——entity 無 @Index，Path A
//   synchronize 不產生。**不可**整表排除 users（會誤傷其既有 PK / email unique index 的 parity
//   覆蓋，見 P1B2-006），改以「索引層級」白名單自 countFiltered() 與 fetchIndexRows() 兩處讀取端
//   排除此**單一具名索引**（同一份謂詞，避免兩處白名單漂移）。
const KNOWN_FILTERED_INDEX_EXCLUSION =
  "AND NOT (t.name = 'users' AND i.name = 'uq_users_employee_no')";

async function fetchColumns(schema: string): Promise<ColumnRow[]> {
  return ds!.query(
    `SELECT TABLE_NAME AS table_name, COLUMN_NAME AS column_name, DATA_TYPE,
            CHARACTER_MAXIMUM_LENGTH, NUMERIC_PRECISION, NUMERIC_SCALE,
            DATETIME_PRECISION, IS_NULLABLE, COLUMN_DEFAULT
     FROM INFORMATION_SCHEMA.COLUMNS
     WHERE TABLE_SCHEMA = @0 AND TABLE_NAME NOT IN ${EXCLUDED_TABLES}`,
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
     WHERE s.name = @0 AND i.index_id > 0 AND t.name NOT IN ${EXCLUDED_TABLES}
       ${KNOWN_FILTERED_INDEX_EXCLUSION}
     ORDER BY t.name, i.name, ic.key_ordinal`,
    [schema],
  );
}

async function fetchTableNames(schema: string): Promise<string[]> {
  const rows: Array<{ table_name: string }> = await ds!.query(
    `SELECT TABLE_NAME AS table_name FROM INFORMATION_SCHEMA.TABLES
     WHERE TABLE_SCHEMA = @0 AND TABLE_TYPE = 'BASE TABLE' AND TABLE_NAME NOT IN ${EXCLUDED_TABLES}`,
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
  it('TS-MSSQL-P1B2-BASELINE-006（前置守門）：建置前隔離庫（CDMP_P1B2）.dbo 為空', (ctx) => {
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
       WHERE TABLE_SCHEMA='dbo' AND TABLE_TYPE='BASE TABLE' AND TABLE_NAME NOT IN ${EXCLUDED_TABLES}`,
    );
    expect(rows.length).toBe(EXPECTED_ENTITY_COUNT);
    expect(rows.length).toBe(ds!.entityMetadatas.length);
  });

  it('TS-MSSQL-P1B2-BASELINE-003：typeorm_migrations 恰 6 筆（schema + reference-data + queue_job + customer_core code-decode + users employee_no + customer_financial baseline），第二次 migration:run 為 no-op', async (ctx) => {
    ensureMssql(ctx);
    // AD-E07-39 P1b3 新增 MssqlBaselineReferenceData（*1751884800001*）→ 由 1 支變 2 支；
    // AD-E07-40 P2a 再新增 MssqlQueueJobSchema（*1751884800002*）→ 2 支變 3 支；
    // AD-E07-41 P4 再新增 MssqlUpdateCustomerCoreCodeDecode（*1751884800003*）→ 3 支變 4 支；
    // F113 / AD-E02-5 再新增 MssqlAddUsersEmployeeNo（*1751884800004*）→ 4 支變 5 支；
    // F114 再新增 MssqlAddCustomerFinancial（*1751884800005*）→ 5 支變 6 支（皆 migrations/mssql/* glob 自動載入）。
    const before = await ds!.query(`SELECT COUNT(*) AS n FROM dbo.typeorm_migrations`);
    expect(Number(before[0].n)).toBe(6);

    const second = runTypeormCli('migration:run');
    expect(second.status, `stderr=${second.stderr}`).toBe(0);
    const out = `${second.stdout ?? ''}${second.stderr ?? ''}`;
    expect(out).toMatch(/No migrations are pending/i);

    const after = await ds!.query(`SELECT COUNT(*) AS n FROM dbo.typeorm_migrations`);
    expect(Number(after[0].n)).toBe(6);
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

  // F113 / AD-E02-5 §3.2.4：索引層級白名單未誤傷 users 既有索引之 parity 覆蓋。
  it('TS-MSSQL-P1B2-PARITY-006（F113 regression guard）：白名單機制僅排除 uq_users_employee_no，users 既有 PK / email unique index 仍計入', async (ctx) => {
    ensureMssql(ctx);
    const rows = await fetchIndexRows(DBO);
    const usersRows = rows.filter((r) => r.table_name === 'users');
    // users 表仍出現於 parity 讀取端（非整表消失 → 證明非整表排除）。
    expect(usersRows.length).toBeGreaterThan(0);
    // 既有 PK（id）仍計入。
    expect(usersRows.some((r) => r.is_primary_key)).toBe(true);
    // 既有 email unique index 仍計入。
    expect(usersRows.some((r) => r.is_unique && !r.is_primary_key && r.column_name === 'email')).toBe(true);
    // 唯獨 uq_users_employee_no 被排除。
    expect(usersRows.some((r) => r.index_name === 'uq_users_employee_no')).toBe(false);
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
    // AD-E07-40 P2a：排除 queue_job——其 baseline migration 刻意含 filtered index（claim/sweep 熱路徑），
    //   非 36 表業務 baseline 之 F-2「無 filtered index」範疇（由 P2a SCHEMA-012 獨立驗證）。
    // F113 / AD-E02-5 §3.2.4：另以索引層級白名單排除 users.uq_users_employee_no（刻意的 filtered
    //   unique index，僅 Path B）——維持「業務 baseline 無非預期 filtered index」語意，計數仍為 0。
    const r = await ds!.query(
      `SELECT COUNT(*) AS n FROM sys.indexes i
       JOIN sys.tables t ON i.object_id = t.object_id
       JOIN sys.schemas s ON t.schema_id = s.schema_id
       WHERE s.name = @0 AND i.has_filter = 1 AND t.name NOT IN ${EXCLUDED_TABLES}
         ${KNOWN_FILTERED_INDEX_EXCLUSION}`,
      [schema],
    );
    return Number(r[0].n);
  };

  it('TS-MSSQL-P1B2-FILTER-001：Path B（dbo）filtered index 計數為 0（uq_users_employee_no 經索引層級白名單排除）', async (ctx) => {
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
       WHERE s.name = 'dbo' AND t.name NOT IN ${EXCLUDED_TABLES}`,
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
// 七之二、CUSTOMER-CORE — AD-E07-41 P4-0 migration-only 客戶主檔（Path B 專屬）
//   customer_core 為 PG-only、無 entity；本群組正向驗證其僅存在於 baseline migration 路徑（dbo），
//   且欄位型別/唯一索引/PK 忠實對齊 PG DDL；同時證明其自 parity 讀取端被正確排除（白名單例外）。
//   ⚠️ 必置於 STATIC（八）之前——STATIC-004 會 revert 全部 migration（清空 dbo），之後 dbo 已無此表。
// ===========================================================================
describe('AD-E07-41 P4-0 CUSTOMER-CORE', () => {
  // PG BaselineSchema customer_core 完整 92 欄。
  const EXPECTED_CC_COLUMN_COUNT = 92;

  async function fetchCustomerCoreColumns(schema: string): Promise<Record<string, ColumnRow & { DATA_TYPE: string }>> {
    const rows: Array<ColumnRow & { DATA_TYPE: string }> = await ds!.query(
      `SELECT COLUMN_NAME AS column_name, DATA_TYPE, CHARACTER_MAXIMUM_LENGTH,
              NUMERIC_PRECISION, NUMERIC_SCALE, IS_NULLABLE
       FROM INFORMATION_SCHEMA.COLUMNS
       WHERE TABLE_SCHEMA = @0 AND TABLE_NAME = 'customer_core'`,
      [schema],
    );
    const map: Record<string, ColumnRow & { DATA_TYPE: string }> = {};
    for (const r of rows) map[r.column_name] = r;
    return map;
  }

  it('TS-MSSQL-P4-0-CC-001（🔴 DoD）：dbo.customer_core 經 baseline migration 建立（OBJECT_ID 非 NULL）', async (ctx) => {
    ensureMssql(ctx);
    const r = await ds!.query(`SELECT OBJECT_ID('dbo.customer_core') AS oid`);
    expect(r[0].oid).not.toBeNull();
  });

  it('TS-MSSQL-P4-0-CC-002：dbo.customer_core 欄位數 = 92（忠實對齊 PG DDL 全欄）', async (ctx) => {
    ensureMssql(ctx);
    const cols = await fetchCustomerCoreColumns(DBO);
    expect(Object.keys(cols).length).toBe(EXPECTED_CC_COLUMN_COUNT);
  });

  it('TS-MSSQL-P4-0-CC-003（🔴 型別對照）：關鍵欄位型別符合 P1b 型別對照慣例', async (ctx) => {
    ensureMssql(ctx);
    const cols = await fetchCustomerCoreColumns(DBO);
    // uuid → uniqueidentifier
    expect(cols['customer_id'].DATA_TYPE).toBe('uniqueidentifier');
    expect(cols['_etl_pipeline_id'].DATA_TYPE).toBe('uniqueidentifier');
    // character varying(N) → varchar(N)（ASCII 鍵/代碼/pipeline 名，長度保真）
    expect(cols['source_customer_no'].DATA_TYPE).toBe('varchar');
    expect(cols['source_customer_no'].CHARACTER_MAXIMUM_LENGTH).toBe(20);
    expect(cols['customer_type_code'].DATA_TYPE).toBe('varchar');
    expect(cols['data_source'].DATA_TYPE).toBe('varchar');
    expect(cols['data_source'].CHARACTER_MAXIMUM_LENGTH).toBe(50);
    // AD-E07-43 P6c（I-MSSQL-NVARCHAR-DISPLAY-01 家族）：中文自由文字顯示欄 varchar(N)→nvarchar(N)，寬度（字元數）不變。
    //   避免 Chinese_Taiwan_Stroke_BIN collation 下 byte 計長截斷（maturity_mailing_address 59 中文字於 varchar(100) 實爆）。
    for (const [col, len] of [
      ['name', 100], ['maturity_mailing_address', 100], ['residential_address', 100], ['company_name', 100],
      ['owner_name', 50], ['education_desc', 50], ['business_item', 100], ['co_city', 20],
    ] as const) {
      expect(cols[col].DATA_TYPE, col).toBe('nvarchar');
      expect(cols[col].CHARACTER_MAXIMUM_LENGTH, col).toBe(len);
    }
    // 對照：ASCII 代碼/鍵/電話/zip 欄維持 varchar（不誤轉，避 cross-type join）。
    for (const kept of ['maturity_mailing_zip', 'occupation_code', 'mobile_phone', 'gender', 'owner_id']) {
      expect(cols[kept].DATA_TYPE, kept).toBe('varchar');
    }
    // character(1)（固定長）→ char(1)，不可誤譯為 varchar
    expect(cols['debt_flag'].DATA_TYPE).toBe('char');
    expect(cols['debt_flag'].CHARACTER_MAXIMUM_LENGTH).toBe(1);
    expect(cols['fine_flag'].DATA_TYPE).toBe('char');
    // smallint / integer 保真
    expect(cols['address_anomaly_flag'].DATA_TYPE).toBe('smallint');
    expect(cols['mainland_flag'].DATA_TYPE).toBe('smallint');
    expect(cols['approved_income'].DATA_TYPE).toBe('int');
    // numeric(p,s) 保真
    expect(cols['work_years'].DATA_TYPE).toBe('numeric');
    expect(Number(cols['work_years'].NUMERIC_PRECISION)).toBe(8);
    expect(Number(cols['work_years'].NUMERIC_SCALE)).toBe(2);
    expect(cols['capital'].DATA_TYPE).toBe('numeric');
    expect(Number(cols['capital'].NUMERIC_PRECISION)).toBe(12);
    expect(Number(cols['capital'].NUMERIC_SCALE)).toBe(0);
    // 裸 timestamp → datetime2；date 保真
    expect(cols['source_created_at'].DATA_TYPE).toBe('datetime2');
    expect(cols['_etl_loaded_at'].DATA_TYPE).toBe('datetime2');
    expect(cols['date_of_birth'].DATA_TYPE).toBe('date');
  });

  it('TS-MSSQL-P4-0-CC-004：NOT NULL 約束對齊（PK + 必填欄 NO、其餘 YES）', async (ctx) => {
    ensureMssql(ctx);
    const cols = await fetchCustomerCoreColumns(DBO);
    for (const notNullCol of ['customer_id', 'source_customer_no', 'customer_type_code', 'name', 'data_source', '_etl_loaded_at', '_etl_pipeline_id']) {
      expect(cols[notNullCol].IS_NULLABLE, notNullCol).toBe('NO');
    }
    for (const nullableCol of ['english_name', 'gender', 'date_of_birth', 'co_city']) {
      expect(cols[nullableCol].IS_NULLABLE, nullableCol).toBe('YES');
    }
  });

  it('TS-MSSQL-P4-0-CC-005：dbo.customer_core PK = customer_id、UNIQUE 索引 = source_customer_no', async (ctx) => {
    ensureMssql(ctx);
    const rows: Array<{ index_name: string; is_primary_key: boolean; is_unique: boolean; column_name: string }> =
      await ds!.query(
        `SELECT i.name AS index_name, i.is_primary_key, i.is_unique, c.name AS column_name
         FROM sys.indexes i
         JOIN sys.tables t ON i.object_id = t.object_id
         JOIN sys.schemas s ON t.schema_id = s.schema_id
         JOIN sys.index_columns ic ON i.object_id = ic.object_id AND i.index_id = ic.index_id AND ic.is_included_column = 0
         JOIN sys.columns c ON ic.object_id = c.object_id AND ic.column_id = c.column_id
         WHERE s.name = 'dbo' AND t.name = 'customer_core' AND i.index_id > 0`,
      );
    const pk = rows.filter((r) => r.is_primary_key);
    expect(pk.length).toBe(1);
    expect(pk[0].column_name).toBe('customer_id');
    const uq = rows.filter((r) => r.is_unique && !r.is_primary_key);
    expect(uq.length).toBe(1);
    expect(uq[0].column_name).toBe('source_customer_no');
  });

  it('TS-MSSQL-P4-0-CC-006（🔴 migration-only 證明）：synchronize 路徑（p1b2_sync）不建 customer_core', async (ctx) => {
    ensureMssql(ctx);
    // 無 entity → Path A（synchronize）天生不建；證明其為刻意的 migration-only 表。
    const r = await ds!.query(`SELECT OBJECT_ID('${SYNC_SCHEMA}.customer_core') AS oid`);
    expect(r[0].oid).toBeNull();
  });

  it('TS-MSSQL-P4-0-CC-007（白名單例外閉環）：customer_core 物理存在於 dbo，但自 parity 讀取端被排除', async (ctx) => {
    ensureMssql(ctx);
    // 物理存在（Path B）。
    const oid = await ds!.query(`SELECT OBJECT_ID('dbo.customer_core') AS oid`);
    expect(oid[0].oid).not.toBeNull();
    // 但 parity 表集合讀取端（EXCLUDED_TABLES）將其排除 → 兩軌仍相等（36），不誤報。
    const tableNames = await fetchTableNames(DBO);
    expect(tableNames).not.toContain('customer_core');
    expect(tableNames.length).toBe(EXPECTED_ENTITY_COUNT);
  });

  it('TS-MSSQL-P4-0-CC-008（靜態守門）：baseline migration 原始碼含 customer_core CREATE TABLE 且以 NEWID/getdate 翻譯 PG 預設', () => {
    const src = readFileSync(MIGRATION_SRC_PATH, 'utf8');
    expect(src).toMatch(/CREATE TABLE "customer_core"/);
    expect(src).toMatch(/"customer_id" uniqueidentifier NOT NULL CONSTRAINT "DF_customer_core_customer_id" DEFAULT NEWID\(\)/);
    expect(src).toMatch(/"_etl_loaded_at" datetime2 NOT NULL CONSTRAINT "DF_customer_core_etl_loaded_at" DEFAULT getdate\(\)/);
    expect(src).toMatch(/UNIQUE \("source_customer_no"\)/);
    // 對稱 down：DROP TABLE customer_core。
    expect(src).toMatch(/DROP TABLE "customer_core"/);
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

  it('TS-MSSQL-P1B2-STATIC-004（建議項）：migration:revert 逐一逆轉六支 baseline 後 dbo 全表與 migration 紀錄乾淨移除', async (ctx) => {
    ensureMssql(ctx);
    // P1b3 起 mssql 有 2 支 baseline；AD-E07-40 P2a 再加 queue_job → 3 支；AD-E07-41 P4 再加
    //   customer_core code-decode（1751884800003）→ 4 支；F113 / AD-E02-5 再加 users employee_no
    //   （1751884800004）→ 5 支；F114 再加 customer_financial（1751884800005）→ 6 支 → 需 revert 六次
    //   （TypeORM 由新到舊逆轉）：
    //   #1 逆轉 customer_financial（DROP customer_financial，時間戳最新故第 1）；
    //   #2 逆轉 users employee_no（DROP INDEX uq_users_employee_no + DROP COLUMN employee_no）；
    //   #3 逆轉 customer_core code-decode（回復欄位定義）；#4 逆轉 queue_job（DROP queue_job）；
    //   #5 逆轉 reference-data（down 為 no-op，僅移除紀錄）；#6 逆轉 schema（DROP 全 36 表 + customer_core）。
    for (let i = 1; i <= 6; i++) {
      const revert = runTypeormCli('migration:revert');
      expect(revert.status, `#${i} stderr=${revert.stderr}`).toBe(0);
      const out = `${revert.stdout ?? ''}${revert.stderr ?? ''}`;
      expect(out).not.toMatch(/QueryFailedError|17750|Could not load the DLL/i);
    }
    // 六支 baseline 皆逆轉：36 業務表 + queue_job + customer_core + customer_financial 移除、
    //   users.employee_no 欄/索引移除、typeorm_migrations 紀錄歸 0（typeorm_migrations 表本身仍在）。
    const business = await countTables(DBO); // 含 typeorm_migrations
    const migRows = await ds!.query(`SELECT COUNT(*) AS n FROM dbo.typeorm_migrations`);
    expect(Number(migRows[0].n)).toBe(0);
    expect(business).toBeLessThanOrEqual(1);
  });
});

// ===========================================================================
// 九、REG — 回歸 + dbo 保留慣例閉環（REG-005 為最後一個 test，清 dbo 並斷言歸零）
// ===========================================================================
describe('AD-E07-39 P1b2 REG', () => {
  it('TS-MSSQL-P1B2-REG-005（dbo 保留慣例閉環）：清理後隔離庫（CDMP_P1B2）.dbo 資料表數量歸零', async (ctx) => {
    ensureMssql(ctx);
    // STATIC-004 已 revert 業務表；此處清空 dbo 剩餘（typeorm_migrations 等）並斷言 0。
    await dropAllTablesInSchema(ds!, DBO);
    const remaining = await countTables(DBO);
    expect(remaining).toBe(0);
  });
});
