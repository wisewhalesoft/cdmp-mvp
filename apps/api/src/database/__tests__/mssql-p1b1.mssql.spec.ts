/**
 * AD-E07-39 P1b1 — MSSQL 全面遷移全 Entity 型別修正 + 索引鍵修正 + D1 全 Entity 載入 + Synchronize 全表建成。
 *
 * 覆蓋測試設計 AD-E07-39-P1b1-test.md：
 *   CHI（F-4 中文 varchar 編碼 smoke，test-first 決策閘門 — 已於獨立 probe 先行，本檔正式化）
 *   TYPE（§1 全 47 處 helper 替換：uuid 18 + text 17 + boolean 8 + F-1 timestamp 4 + bigint）
 *   HASH（B1：token_blocklist → token_hash binary(32)；hashToken 決定性 + JWT 撤銷 E2E）
 *   ENTITY（D1：全 entity 載入 + 完整 AppModule / WorkerAppModule 啟動 + 集合 parity）
 *   DEFAULT（CURRENT_TIMESTAMP 8 欄自動填入）
 *   CASE / COLLATE（全表大小寫 + collation 一致性守門）
 *   PKWIDTH（I-MSSQL-PK-BYTELIMIT-01 動態索引鍵寬度守門）
 *   REG（跨分支回歸 + 型別檢查閘 + entity 無 DB_TYPE 條件判斷）
 *
 * Gating：連不上 MSSQL → 每個 DB 相依 test ctx.skip()（不偽造綠燈，feedback_mock_real_system_contract）。
 * DB_NAME=CDMP_TEST（與 dev CDMP 隔離）；使用專屬 SQL schema `p1b1`（跨檔隔離 + 不污染 dbo）。
 *
 * ⚠️ 表數：AD/測試設計述「37」為算術 off-by-one（14 未改 + 22 已改 = 36，非 23→37）；
 *    實際 entity 檔 = 36，故計數斷言一律動態對齊 entityMetadatas.length（= 36），見 impl log 偏離段。
 */

// 必最先 import（side-effect 設 DB_TYPE=mssql，供 entity 之 column-types helper 解析 mssql 分支值）。
import {
  restoreDbType,
  MSSQL,
  mssqlPortReachable,
  SKIP_REASON,
} from './mssql-env-preload';

import {
  describe,
  it,
  expect,
  beforeAll,
  afterAll,
  vi,
} from 'vitest';
import { readFileSync, readdirSync } from 'fs';
import { join } from 'path';
import { randomUUID, createHash } from 'crypto';
import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ThrottlerModule } from '@nestjs/throttler';
import { JwtService } from '@nestjs/jwt';
import request from 'supertest';
import { DataSource, Table, TableColumn } from 'typeorm';

import {
  hashColumnType,
  hashColumnLength,
} from '@/common/database/column-types';
import { hashToken } from '@/common/hash/token-hash.util';
import { HashUtil } from '@/common/hash/hash.util';
import { HttpExceptionFilter } from '@/common/filters/http-exception.filter';
import { AuthModule } from '@/modules/auth/auth.module';
import { AuthService } from '@/modules/auth/auth.service';

// === 全 36 entity（顯式陣列；避免 vitest 下 TypeORM glob 載入 .ts 之風險，兼作 parity 期望集合）===
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

// 全 37 表 synchronize（首次含索引/FK）耗時明顯高於 P1a 之 4 表 → 提高 timeout（測試設計 §0.3 建議）。
vi.setConfig({ testTimeout: 120000 });

const SCHEMA = 'p1b1';

let reachable = false;
let ds: DataSource | null = null;

function ensureMssql(ctx: { skip: () => void }): void {
  if (!reachable || !ds) {
    // eslint-disable-next-line no-console
    console.warn(`[AD-E07-39 P1b1] SKIPPED — ${SKIP_REASON}`);
    ctx.skip();
  }
}

function mssqlOptions(schema: string, overrides: Record<string, unknown> = {}) {
  return {
    type: 'mssql' as const,
    host: MSSQL.host,
    port: MSSQL.port,
    username: MSSQL.username,
    password: MSSQL.password,
    database: MSSQL.database,
    schema,
    options: {
      encrypt: MSSQL.encrypt,
      trustServerCertificate: MSSQL.trustServerCertificate,
    },
    ...overrides,
  };
}

/**
 * DROP 指定 schema 下所有 FK + table（先解 FK、再 DROP TABLE，避免複合 FK 刪除順序問題）。
 *
 * ⚠️ 刻意「以 JS 列舉 sys 目錄 + 逐句 plain DDL」，不使用 `sp_executesql` 動態 SQL：
 *    本機 SQL Server 2022 Linux 容器對 `EXEC sp_executesql` 拋 17750（Could not load the DLL,
 *    Reason 126）。`EXEC('...')` 與一般 DDL 正常，僅 sp_executesql 受影響。
 */
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

async function colInfo(table: string, column: string) {
  const r = await ds!.query(
    `SELECT DATA_TYPE, CHARACTER_MAXIMUM_LENGTH, DATETIME_PRECISION
     FROM INFORMATION_SCHEMA.COLUMNS
     WHERE TABLE_SCHEMA=@0 AND TABLE_NAME=@1 AND COLUMN_NAME=@2`,
    [SCHEMA, table, column],
  );
  return r[0] as {
    DATA_TYPE: string;
    CHARACTER_MAXIMUM_LENGTH: number;
    DATETIME_PRECISION: number;
  };
}

beforeAll(async () => {
  reachable = await mssqlPortReachable(1500);
  if (!reachable) return;
  try {
    ds = new DataSource({
      ...mssqlOptions(SCHEMA),
      entities: ALL_ENTITIES,
      synchronize: false,
    });
    await ds.initialize();
  } catch (e) {
    // eslint-disable-next-line no-console
    console.warn('[AD-E07-39 P1b1] init failed → skip:', (e as Error)?.message);
    reachable = false;
    ds = null;
    return;
  }
  // 專屬 schema + 乾淨重建全 36 表。
  await ds.query(`IF SCHEMA_ID('${SCHEMA}') IS NULL EXEC('CREATE SCHEMA ${SCHEMA}')`);
  await dropAllTablesInSchema(ds, SCHEMA);
  await ds.synchronize();
}, 120000);

afterAll(async () => {
  if (ds) {
    await dropAllTablesInSchema(ds, SCHEMA);
    await ds.destroy();
  }
  restoreDbType();
});

// ===========================================================================
// 一、CHI — F-4 中文 varchar 編碼 smoke（test-first 決策閘門，優先執行）
// ===========================================================================
describe('AD-E07-39 P1b1 CHI（F-4 中文 varchar 編碼）', () => {
  const PROBE = 'chi_probe';

  beforeAll(async () => {
    if (!reachable || !ds) return;
    await ds.query(`IF OBJECT_ID('${SCHEMA}.${PROBE}','U') IS NOT NULL DROP TABLE ${SCHEMA}.${PROBE}`);
    // 裸 varchar(20)（非 nvarchar）— 直接測 Big5（Chinese_Taiwan_Stroke_BIN）碼頁承載中文。
    await ds.query(`CREATE TABLE ${SCHEMA}.${PROBE} (id INT IDENTITY PRIMARY KEY, val VARCHAR(20) NULL)`);
  });

  afterAll(async () => {
    if (ds) await ds.query(`IF OBJECT_ID('${SCHEMA}.${PROBE}','U') IS NOT NULL DROP TABLE ${SCHEMA}.${PROBE}`);
  });

  it('TS-MSSQL-P1B1-CHI-001：varchar 寫入「借新還舊」逐字元 round-trip', async (ctx) => {
    ensureMssql(ctx);
    await ds!.query(`INSERT INTO ${SCHEMA}.${PROBE} (val) VALUES (@0)`, ['借新還舊']);
    const rows = await ds!.query(`SELECT val FROM ${SCHEMA}.${PROBE} WHERE val = @0`, ['借新還舊']);
    expect(rows.length).toBe(1);
    expect(rows[0].val).toBe('借新還舊');
    for (let i = 0; i < '借新還舊'.length; i++) {
      expect(rows[0].val.charCodeAt(i)).toBe('借新還舊'.charCodeAt(i));
    }
    expect(rows[0].val).not.toContain('?');
    expect(rows[0].val).not.toContain('�');
  });

  it('TS-MSSQL-P1B1-CHI-002：varchar 寫入「中古車商」逐字元 round-trip（第二樣本）', async (ctx) => {
    ensureMssql(ctx);
    await ds!.query(`INSERT INTO ${SCHEMA}.${PROBE} (val) VALUES (@0)`, ['中古車商']);
    const rows = await ds!.query(`SELECT val FROM ${SCHEMA}.${PROBE} WHERE val = @0`, ['中古車商']);
    expect(rows[0].val).toBe('中古車商');
    for (let i = 0; i < '中古車商'.length; i++) {
      expect(rows[0].val.charCodeAt(i)).toBe('中古車商'.charCodeAt(i));
    }
  });

  it("TS-MSSQL-P1B1-CHI-003：LIKE '%借新還舊%' 子字串查詢命中", async (ctx) => {
    ensureMssql(ctx);
    const rows = await ds!.query(`SELECT val FROM ${SCHEMA}.${PROBE} WHERE val LIKE '%借新還舊%'`);
    expect(rows.length).toBeGreaterThanOrEqual(1);
  });

  it('TS-MSSQL-P1B1-CHI-004（對照組）：BIN collation 中文比較 byte-exact，不 trim 尾隨空白', async (ctx) => {
    ensureMssql(ctx);
    await ds!.query(`DELETE FROM ${SCHEMA}.${PROBE}`);
    await ds!.query(`INSERT INTO ${SCHEMA}.${PROBE} (val) VALUES (@0)`, ['借新還舊']);
    await ds!.query(`INSERT INTO ${SCHEMA}.${PROBE} (val) VALUES (@0)`, ['借新還舊 ']); // 尾隨半形空白
    // BIN collation：'借新還舊' 與 '借新還舊 ' 於 = 比對視為不同（byte-exact，不 trim；MSSQL 尾隨空白於 = 通常忽略，
    //   但 BIN + LEN 差異可精確驗證），此處以 LEN 與逐 byte 排序確認未被 trim/正規化。
    const exact = await ds!.query(
      `SELECT val, DATALENGTH(val) AS bytes FROM ${SCHEMA}.${PROBE} ORDER BY val ASC`,
    );
    const lens = exact.map((r: { bytes: number }) => r.bytes).sort((a: number, b: number) => a - b);
    // '借新還舊'=8 bytes（4 中文×2 Big5）、'借新還舊 '=9 bytes（+1 空白）→ 儲存未被 trim。
    expect(lens).toEqual([8, 9]);
  });

  // TS-MSSQL-P1B1-CHI-DECISION-001：決策關卡 —— 依 CHI-001~004 記錄 I-MSSQL-VARCHAR-ENCODING-01 結論。
  it('TS-MSSQL-P1B1-CHI-DECISION-001（決策關卡）：varchar 中文編碼結論 = 已驗證相符', async (ctx) => {
    ensureMssql(ctx);
    // CHI-001~004 全數相符 → 現行 varchar 宣告維持不變，P1b1 範圍不擴大（不觸發全面 varchar→nvarchar）。
    const write = '借新還舊';
    await ds!.query(`DELETE FROM ${SCHEMA}.${PROBE}`);
    await ds!.query(`INSERT INTO ${SCHEMA}.${PROBE} (val) VALUES (@0)`, [write]);
    const rows = await ds!.query(`SELECT val FROM ${SCHEMA}.${PROBE} WHERE val LIKE '%還舊%'`);
    const varcharEncodingMatches = rows.length === 1 && rows[0].val === write;
    expect(varcharEncodingMatches).toBe(true);
  });
});

// ===========================================================================
// 二、TYPE — 全 Entity 型別轉換（§1 全 47 處 + F-1 4 處紅線 + bigint）
// ===========================================================================
describe('AD-E07-39 P1b1 TYPE', () => {
  const UUID_COLS: Array<[string, string]> = [
    ['assignment_run_snapshot', 'run_id'],
    ['assignment_approval', 'approver_id'],
    ['assignment_audit_log', 'actor_id'],
    ['assignment_run', 'triggered_by'],
    ['assignment_run_stage_log', 'run_id'],
    ['datasource_health_logs', 'datasource_id'],
    ['datasources', 'created_by'],
    ['etl_pipeline_logs', 'pipeline_id'],
    ['etl_pipeline_logs', 'created_by'],
    ['etl_pipeline_versions', 'pipeline_id'],
    ['etl_pipeline_versions', 'created_by'],
    ['extraction_logs', 'task_id'],
    ['extraction_logs', 'created_by'],
    ['etl_pipelines', 'created_by'],
    ['extraction_tasks', 'datasource_id'],
    ['extraction_tasks', 'created_by'],
    ['ob_assign_config', 'updated_by'],
    ['ob_monthly_run_result', 'run_id'],
  ];

  const TEXT_COLS: Array<[string, string]> = [
    ['assignment_run', 'error_message'],
    ['assignment_run_stage_log', 'error_message'],
    ['datasource_health_logs', 'error_message'],
    ['datasources', 'encrypted_password'],
    ['etl_pipeline_logs', 'error_message'],
    ['etl_pipeline_logs', 'node_logs'],
    ['extraction_logs', 'error_message'],
    ['etl_pipelines', 'description'],
    ['extraction_tasks', 'error_message'],
    ['ob_assign_config', 'config_value'],
    ['ob_assign_config', 'description'],
    ['ob_levelcard_version', 'card_type'],
    ['ob_pool_data', 'apmacc_memo'],
    ['ob_pool_data', 'settle_src'],
    ['ob_pool_data_list', 'apmacc_memo'],
    ['ob_pool_data_list', 'settle_src'],
    ['ob_monthly_run_result', 'settle_src'],
  ];

  const BOOL_COLS: Array<[string, string]> = [
    ['datasource_health_logs', 'success'],
    ['etl_pipeline_logs', 'is_test_run'],
    ['etl_pipelines', 'enabled'],
    ['extraction_tasks', 'enabled'],
    ['ob_list_definition', 'cr_enabled'],
    ['pooldata_field_whitelist', 'is_active'],
    ['pooldata_field_whitelist', 'is_system_fixed'],
    ['pooldata_field_option', 'is_active'],
  ];

  // F-1（§0）：4 處裸 timestamp 改 dateColumnType。
  const F1_TIMESTAMP_COLS: Array<[string, string]> = [
    ['ob_assign_config', 'updated_at'],
    ['ob_arreturndf_min_cap', '_cdmp_extracted_at'],
    ['assignment_run_stage_log', 'started_at'],
    ['assignment_run_stage_log', 'finished_at'],
  ];

  it('TS-MSSQL-P1B1-TYPE-001：uuid helper 全 18 處 → uniqueidentifier', async (ctx) => {
    ensureMssql(ctx);
    expect(UUID_COLS.length).toBe(18);
    for (const [t, c] of UUID_COLS) {
      expect((await colInfo(t, c)).DATA_TYPE, `${t}.${c}`).toBe('uniqueidentifier');
    }
  });

  it('TS-MSSQL-P1B1-TYPE-002（回歸）：P1a uuid PK 產生策略維持 uniqueidentifier', async (ctx) => {
    ensureMssql(ctx);
    expect((await colInfo('users', 'id')).DATA_TYPE).toBe('uniqueidentifier');
    expect((await colInfo('password_reset_tokens', 'id')).DATA_TYPE).toBe('uniqueidentifier');
  });

  it('TS-MSSQL-P1B1-TYPE-003：longText helper 全 17 處 → nvarchar(MAX)（CHARACTER_MAXIMUM_LENGTH=-1）', async (ctx) => {
    ensureMssql(ctx);
    expect(TEXT_COLS.length).toBe(17);
    for (const [t, c] of TEXT_COLS) {
      const info = await colInfo(t, c);
      expect(info.DATA_TYPE, `${t}.${c}`).toBe('nvarchar');
      expect(info.CHARACTER_MAXIMUM_LENGTH, `${t}.${c}`).toBe(-1);
    }
  });

  it('TS-MSSQL-P1B1-TYPE-004：boolean helper 全 8 處 → bit', async (ctx) => {
    ensureMssql(ctx);
    expect(BOOL_COLS.length).toBe(8);
    for (const [t, c] of BOOL_COLS) {
      expect((await colInfo(t, c)).DATA_TYPE, `${t}.${c}`).toBe('bit');
    }
  });

  it('TS-MSSQL-P1B1-TYPE-005（🔴 F-1 紅線）：4 處裸 timestamp → datetime2（非 timestamp/rowversion）', async (ctx) => {
    ensureMssql(ctx);
    for (const [t, c] of F1_TIMESTAMP_COLS) {
      const info = await colInfo(t, c);
      expect(info.DATA_TYPE, `${t}.${c}`).toBe('datetime2');
      expect(info.DATA_TYPE, `${t}.${c}`).not.toBe('timestamp');
      expect(info.DATA_TYPE, `${t}.${c}`).not.toBe('rowversion');
    }
  });

  it('TS-MSSQL-P1B1-TYPE-006（🔴 F-1 全域守門）：全 schema 無任何 timestamp/rowversion 型別欄位', async (ctx) => {
    ensureMssql(ctx);
    const rows = await ds!.query(
      `SELECT TABLE_NAME, COLUMN_NAME, DATA_TYPE FROM INFORMATION_SCHEMA.COLUMNS
       WHERE TABLE_SCHEMA='${SCHEMA}' AND DATA_TYPE IN ('timestamp','rowversion')`,
    );
    expect(rows).toEqual([]);
  });

  it('TS-MSSQL-P1B1-TYPE-007（🔴 F-1 修復佐證）：datetime2 欄位可寫入/讀回含毫秒 Date', async (ctx) => {
    ensureMssql(ctx);
    const runRepo = ds!.getRepository(AssignmentRun);
    const run = await runRepo.save(
      runRepo.create({
        project_workym: '202607',
        status: 'running',
        triggered_by: randomUUID(),
      }),
    );
    const logRepo = ds!.getRepository(AssignmentRunStageLog);
    const started = new Date('2026-07-07T03:04:05.123Z');
    const finished = new Date('2026-07-07T03:05:06.789Z');
    const saved = await logRepo.save(
      logRepo.create({
        run_id: run.run_id,
        stage_no: 1,
        status: 'completed',
        started_at: started,
        finished_at: finished,
      }),
    );
    const found = await logRepo.findOneBy({ id: saved.id });
    expect(found!.started_at).toBeInstanceOf(Date);
    expect(found!.started_at.getTime()).toBe(started.getTime());
    expect(found!.finished_at!.getTime()).toBe(finished.getTime());
  });

  it('TS-MSSQL-P1B1-TYPE-008：production bigint 欄位 → bigint；tedious 讀回字串（精度保全）', async (ctx) => {
    ensureMssql(ctx);
    expect((await colInfo('assignment_run_stage_log', 'id')).DATA_TYPE).toBe('bigint');
    const obAssignSetBigints = await ds!.query(
      `SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS
       WHERE TABLE_SCHEMA='${SCHEMA}' AND TABLE_NAME='ob_assign_set' AND DATA_TYPE='bigint'`,
    );
    expect(obAssignSetBigints.length).toBeGreaterThanOrEqual(1);
    // >2^53 邊界以字串精確 round-trip（合成 probe，比照 P1a CRUD-007）。
    const T = '_p1b1_bigint';
    const qr = ds!.createQueryRunner();
    try {
      await ds!.query(`IF OBJECT_ID('${SCHEMA}.${T}','U') IS NOT NULL DROP TABLE ${SCHEMA}.${T}`);
      await qr.createTable(
        new Table({ schema: SCHEMA, name: T, columns: [new TableColumn({ name: 'b', type: 'bigint', isNullable: true })] }),
        true,
      );
      await ds!.query(`INSERT INTO ${SCHEMA}.${T} (b) VALUES (9223372036854775807)`);
      const rows = await ds!.query(`SELECT b FROM ${SCHEMA}.${T}`);
      expect(typeof rows[0].b).toBe('string');
      expect(String(rows[0].b)).toBe('9223372036854775807');
    } finally {
      await ds!.query(`IF OBJECT_ID('${SCHEMA}.${T}','U') IS NOT NULL DROP TABLE ${SCHEMA}.${T}`);
      await qr.release();
    }
  });
});

// ===========================================================================
// 三、HASH — B1：token_blocklist → token_hash binary(32)
// ===========================================================================
describe('AD-E07-39 P1b1 HASH（unit / integration）', () => {
  it('TS-MSSQL-P1B1-HASH-001（I-MSSQL-HASH-DETERMINISM-01）：hashToken 決定性 — 同輸入多次輸出相同', () => {
    const jwt = 'eyJhbGciOi.sample.jwt-token';
    const a = hashToken(jwt);
    const b = hashToken(jwt);
    const c = hashToken(jwt);
    expect(Buffer.compare(a, b)).toBe(0);
    expect(Buffer.compare(b, c)).toBe(0);
  });

  it('TS-MSSQL-P1B1-HASH-002：hashToken 輸出為 32-byte SHA-256 摘要，與參考實作一致', () => {
    const jwt = 'sample-jwt-token';
    const out = hashToken(jwt);
    expect(out.length).toBe(32);
    const ref = createHash('sha256').update(jwt, 'utf8').digest();
    expect(Buffer.compare(out, ref)).toBe(0);
  });

  it('TS-MSSQL-P1B1-HASH-003：不同輸入產生不同 hash（雪崩效應 sanity check）', () => {
    const a = hashToken('token-A');
    const b = hashToken('token-B'); // 差 1 字元
    expect(Buffer.compare(a, b)).not.toBe(0);
  });

  it('TS-MSSQL-P1B1-HASH-004：token_blocklist.token_hash = binary(32)，且不存在明文 token 欄', async (ctx) => {
    ensureMssql(ctx);
    const info = await colInfo('token_blocklist', 'token_hash');
    expect(info.DATA_TYPE).toBe('binary');
    expect(info.CHARACTER_MAXIMUM_LENGTH).toBe(32);
    const tokenCol = await ds!.query(
      `SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS
       WHERE TABLE_SCHEMA='${SCHEMA}' AND TABLE_NAME='token_blocklist' AND COLUMN_NAME='token'`,
    );
    expect(tokenCol).toEqual([]);
  });

  it('TS-MSSQL-P1B1-HASH-005（I-MSSQL-PK-BYTELIMIT-01 正面驗證）：長 JWT 之 32-byte hash PK 可正常 INSERT', async (ctx) => {
    ensureMssql(ctx);
    const repo = ds!.getRepository(TokenBlocklist);
    const longToken = 'T'.repeat(2048); // P1a CRUD-003b 曾於明文 nvarchar(2048) PK 失敗
    await repo.save(
      repo.create({
        token_hash: hashToken(longToken),
        user_id: 'u-hash005',
        expires_at: new Date('2030-01-01T00:00:00.000Z'),
      }),
    );
    const found = await repo.findOneBy({ token_hash: hashToken(longToken) });
    expect(found).not.toBeNull();
    expect(found!.user_id).toBe('u-hash005');
  });

  // TS-MSSQL-P1B1-HASH-REG-001（三分支）刻意置於本檔最後（見末端 describe）：
  //   其 vi.resetModules() 會重置模組登錄，若在 module-boot 測試（ENTITY / E2E）之前執行，
  //   會造成 entity/service 之 class ref 前後不一致（EntityMetadataNotFound / provider not found）。
  // 此處僅快速驗 mssql 分支值（本檔 DB_TYPE=mssql，無需 reset）。
  it('TS-MSSQL-P1B1-HASH-REG-001a：hashColumnType/hashColumnLength（mssql 分支）', () => {
    expect(hashColumnType).toBe('binary');
    expect(hashColumnLength).toBe(32);
  });
});

// ===========================================================================
// 三-E2E、HASH-E2E — 真實 JWT 撤銷流程（P1b1 DoD #5 核心紅線）
// ===========================================================================
describe('AD-E07-39 P1b1 HASH-E2E（JWT 撤銷流程）', () => {
  let app: INestApplication | null = null;
  let jwtService: JwtService | null = null;
  const ADMIN_A = { email: 'p1b1-a@cdmp.test', password: 'P@ssw0rd123' };
  const ADMIN_B = { email: 'p1b1-b@cdmp.test', password: 'P@ssw0rd123' };
  let adminAId = '';

  beforeAll(async () => {
    if (!reachable || !ds) return;
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({
          isGlobal: true,
          load: [() => ({ JWT_SECRET: 'cdmp-test-jwt-secret-key' })],
        }),
        (await import('@nestjs/typeorm')).TypeOrmModule.forRoot({
          ...mssqlOptions(SCHEMA),
          entities: [User, TokenBlocklist, PasswordResetToken],
          synchronize: false,
        } as never),
        ThrottlerModule.forRoot([{ name: 'login', ttl: 60000, limit: 100 }]),
        AuthModule,
      ],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.setGlobalPrefix('api/v1');
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
    app.useGlobalFilters(new HttpExceptionFilter());
    await app.init();
    jwtService = app.get(JwtService);

    // 種子 admin（清掉先前殘留），並清空 token_blocklist。
    await ds.query(`DELETE FROM ${SCHEMA}.users`);
    await ds.query(`DELETE FROM ${SCHEMA}.token_blocklist`);
    const repo = ds.getRepository(User);
    const a = await repo.save(repo.create({
      name: 'P1b1 Admin A', email: ADMIN_A.email,
      password_hash: await HashUtil.hash(ADMIN_A.password), role: 'admin', status: 'active',
    }));
    adminAId = a.id;
    await repo.save(repo.create({
      name: 'P1b1 Admin B', email: ADMIN_B.email,
      password_hash: await HashUtil.hash(ADMIN_B.password), role: 'admin', status: 'active',
    }));
  }, 120000);

  afterAll(async () => {
    await app?.close();
  });

  async function login(creds: { email: string; password: string }): Promise<string> {
    const res = await request(app!.getHttpServer())
      .post('/api/v1/auth/login')
      .send(creds);
    expect(res.status).toBe(200);
    return res.body.token as string;
  }

  it('TS-MSSQL-P1B1-HASH-E2E-001（🔴 DoD #5）：login → 受保護端點 200 → 撤銷 → 同 token 再請求 401 TOKEN_REVOKED', async (ctx) => {
    ensureMssql(ctx);
    const token = await login(ADMIN_A);
    // 受保護端點（POST /auth/logout 帶 AuthGuard）第一次通過 → 200，並將該 token 撤銷。
    const first = await request(app!.getHttpServer())
      .post('/api/v1/auth/logout')
      .set('Authorization', `Bearer ${token}`);
    expect(first.status).toBe(200);
    // 同一 token 再次請求受保護端點 → AuthGuard 查 token_hash 命中 → 401 TOKEN_REVOKED。
    const second = await request(app!.getHttpServer())
      .post('/api/v1/auth/logout')
      .set('Authorization', `Bearer ${token}`);
    expect(second.status).toBe(401);
    expect(second.body.error).toBe('AUTH_TOKEN_REVOKED');
  });

  it('TS-MSSQL-P1B1-HASH-E2E-002：長 JWT（明文 >900 bytes）撤銷流程仍正確（與長度脫鉤）', async (ctx) => {
    ensureMssql(ctx);
    // 手簽一個含大 claim 的合法 JWT（明文遠超過 900 bytes；於舊 nvarchar(2048) PK 會失敗）。
    const longJwt = jwtService!.sign({
      userId: adminAId, role: 'admin', isSalesManager: false, businessRole: null,
      pad: 'x'.repeat(2000),
    });
    expect(Buffer.byteLength(longJwt, 'utf8')).toBeGreaterThan(900);
    const first = await request(app!.getHttpServer())
      .post('/api/v1/auth/logout')
      .set('Authorization', `Bearer ${longJwt}`);
    expect(first.status).toBe(200);
    const second = await request(app!.getHttpServer())
      .post('/api/v1/auth/logout')
      .set('Authorization', `Bearer ${longJwt}`);
    expect(second.status).toBe(401);
    expect(second.body.error).toBe('AUTH_TOKEN_REVOKED');
  });

  it('TS-MSSQL-P1B1-HASH-E2E-003：未撤銷 token 正常通過 AuthGuard（不誤傷其他 token）', async (ctx) => {
    ensureMssql(ctx);
    const tokenB = await login(ADMIN_B);
    // A 已於 E2E-001 撤銷；B 全新登入未撤銷 → 受保護端點應成功。
    const res = await request(app!.getHttpServer())
      .post('/api/v1/auth/logout')
      .set('Authorization', `Bearer ${tokenB}`);
    expect(res.status).toBe(200);
  });

  it('TS-MSSQL-P1B1-HASH-E2E-004：logout 冪等（service 層對真實 MSSQL）— 同 token 兩次不重複寫入/不拋錯', async (ctx) => {
    ensureMssql(ctx);
    // ⚠️ 偏離：HTTP 端點第二次 logout 因 AuthGuard 撤銷檢查回 401（= E2E-001），
    //   故冪等性於 service 層對真實 MSSQL 驗證（AuthService.logout findOne 存在→skip save）。
    const authService = app!.get(AuthService, { strict: false });
    const rawToken = jwtService!.sign({ userId: adminAId, role: 'admin', isSalesManager: false, businessRole: null });
    await authService.logout(rawToken, adminAId);
    await authService.logout(rawToken, adminAId); // 第二次應 no-op
    const hashHex = hashToken(rawToken).toString('hex');
    const rows = await ds!.query(
      `SELECT COUNT(*) AS cnt FROM ${SCHEMA}.token_blocklist WHERE token_hash = 0x${hashHex}`,
    );
    expect(Number(rows[0].cnt)).toBe(1);
  });
});

// ===========================================================================
// 四、ENTITY — D1 全 Entity 載入 + I-MSSQL-ENTITY-LIST-PARITY-01
// ===========================================================================
describe('AD-E07-39 P1b1 ENTITY（D1）', () => {
  const EXPECTED_ENTITY_COUNT = 36; // AD/測試設計述 37 為算術 off-by-one（14+22=36）；見檔頭。

  it('TS-MSSQL-P1B1-ENTITY-001：synchronize 建出全部業務表（非僅 P1a 之 4 張）', async (ctx) => {
    ensureMssql(ctx);
    const rows = await ds!.query(
      `SELECT TABLE_NAME FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA='${SCHEMA}' AND TABLE_TYPE='BASE TABLE'`,
    );
    expect(rows.length).toBe(EXPECTED_ENTITY_COUNT);
    expect(rows.length).toBeGreaterThan(4);
    const names = rows.map((r: { TABLE_NAME: string }) => r.TABLE_NAME);
    expect(names).toContain('ob_pool_data');
    expect(names).toContain('assignment_run');
    expect(names).toContain('token_blocklist');
  });

  // mssql 連線 env（連 CDMP_TEST）；NODE_ENV=production → synchronize 關閉（僅驗連線 + DI 解析，
  //   不建 dbo 表、不污染、避免不必要的 synchronize 時間）。compile() 不觸發 onModuleInit/bootstrap 生命週期，
  //   故無 onApplicationBootstrap（orphan recovery）/cron 之 DB 副作用。
  const MSSQL_ENV_KEYS = [
    'DB_HOST', 'DB_PORT', 'DB_USERNAME', 'DB_PASSWORD', 'DB_NAME',
    'DB_MSSQL_ENCRYPT', 'DB_MSSQL_TRUST_CERT', 'NODE_ENV',
  ] as const;

  function withMssqlEnv(): Record<string, string | undefined> {
    const prev: Record<string, string | undefined> = {};
    for (const k of MSSQL_ENV_KEYS) prev[k] = process.env[k];
    process.env.DB_HOST = MSSQL.host;
    process.env.DB_PORT = String(MSSQL.port);
    process.env.DB_USERNAME = MSSQL.username;
    process.env.DB_PASSWORD = MSSQL.password;
    process.env.DB_NAME = MSSQL.database;
    process.env.DB_MSSQL_ENCRYPT = String(MSSQL.encrypt);
    process.env.DB_MSSQL_TRUST_CERT = String(MSSQL.trustServerCertificate);
    process.env.NODE_ENV = 'production'; // 關閉 synchronize
    return prev;
  }
  function restoreEnv(prev: Record<string, string | undefined>): void {
    for (const k of MSSQL_ENV_KEYS) {
      if (prev[k] === undefined) delete process.env[k];
      else process.env[k] = prev[k]!;
    }
  }

  it('TS-MSSQL-P1B1-ENTITY-002：完整 AppModule 於 mssql 啟動，各業務模組 forFeature 全數解析', async (ctx) => {
    ensureMssql(ctx);
    const prev = withMssqlEnv();
    let moduleRef: TestingModule | null = null;
    try {
      const { AppModule } = await import('@/app.module');
      moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
      const appDs = moduleRef.get(DataSource);
      expect(appDs.isInitialized).toBe(true);
      // 各業務模組 forFeature 解析成功（否則 compile 於 provider 實例化即拋 EntityMetadataNotFound）。
      // AD-E07-40 P2a：app.module ALL_ENTITIES 於 36 個業務 entity 之外新增 1 個佇列基礎建設 entity（QueueJob）→ 37。
      //   本區域測「真實 AppModule」故用 +1；P1b1 之本地 ALL_ENTITIES（36 業務表 baseline）之計數不受影響。
      expect(appDs.entityMetadatas.length).toBe(EXPECTED_ENTITY_COUNT + 1);
      expect((appDs.options as { type: string }).type).toBe('mssql');
    } finally {
      await moduleRef?.close();
      restoreEnv(prev);
    }
  });

  it('TS-MSSQL-P1B1-ENTITY-003：worker 模組（AssignmentWorkerModule）於 mssql 啟動，全 entity 解析且 pg-boss 安全降級', async (ctx) => {
    ensureMssql(ctx);
    // ⚠️ 偏離：WorkerAppModule 以 glob（*.entity.{ts,js}）載入 entity；TypeORM 之 require 於 vitest 下
    //   無法解析 .ts（Invalid or unexpected token）——此為 vitest 環境限制，非 production 問題（worker 走
    //   ts-node / 編譯後 .js）。故本案例改以顯式 ALL_ENTITIES 掛載真實 worker 業務模組 AssignmentWorkerModule
    //   （含 RunQueueConsumer / OrphanReaper + 依賴之 AssignmentModule），驗證 worker 模組圖於 mssql 可解析
    //   （forFeature 全數解析、pg-boss createPgBoss 於 mssql 回 null 安全降級）；glob 分支設定本身由 ENTITY-004 靜態守門。
    const prev = withMssqlEnv();
    let moduleRef: TestingModule | null = null;
    try {
      const { AssignmentWorkerModule } = await import('@/modules/assignment/assignment-worker.module');
      const { TypeOrmModule } = await import('@nestjs/typeorm');
      moduleRef = await Test.createTestingModule({
        imports: [
          ConfigModule.forRoot({ isGlobal: true }),
          TypeOrmModule.forRoot({
            ...mssqlOptions(SCHEMA),
            entities: ALL_ENTITIES,
            synchronize: false,
          } as never),
          AssignmentWorkerModule,
        ],
      }).compile();
      const workerDs = moduleRef.get(DataSource);
      expect(workerDs.isInitialized).toBe(true);
      expect(workerDs.entityMetadatas.length).toBe(EXPECTED_ENTITY_COUNT);
    } finally {
      await moduleRef?.close();
      restoreEnv(prev);
    }
  });

  it('TS-MSSQL-P1B1-ENTITY-004（I-MSSQL-ENTITY-LIST-PARITY-01 靜態守門）：三設定點無各自維護子集清單', () => {
    const src = (p: string) => readFileSync(join(__dirname, '..', '..', p), 'utf8');
    const appSrc = src('app.module.ts');
    const workerSrc = src('worker-app.module.ts');
    const dsSrc = src('database/data-source.ts');

    // app.module.ts：mssql 分支必須 entities: ALL_ENTITIES（與 sqlite/postgres 同一變數）。
    const appMssqlBranch = appSrc.slice(appSrc.indexOf("dbType === 'mssql'"));
    expect(appMssqlBranch).toMatch(/entities:\s*ALL_ENTITIES/);
    // app.module.ts：不得殘留硬寫 4-entity 子集陣列。
    expect(appSrc).not.toMatch(/entities:\s*\[User,\s*Role,\s*TokenBlocklist,\s*PasswordResetToken\]/);

    // worker-app.module.ts：mssql 分支使用既有 glob `entities` 變數，不硬寫子集。
    const workerMssqlBranch = workerSrc.slice(workerSrc.indexOf("dbType === 'mssql'"));
    expect(workerMssqlBranch).toMatch(/entities,/);
    expect(workerSrc).not.toMatch(/entities:\s*\[User,\s*Role,\s*TokenBlocklist,\s*PasswordResetToken\]/);

    // data-source.ts：glob 載入，postgres/mssql 共用。
    expect(dsSrc).toMatch(/\*\.entity\.\{ts,js\}/);
  });

  it('TS-MSSQL-P1B1-ENTITY-005（回歸）：sqlite/postgres 分支仍引用單一 ALL_ENTITIES（集合未縮減）', () => {
    const appSrc = readFileSync(join(__dirname, '..', '..', 'app.module.ts'), 'utf8');
    // 三 dialect 分支皆 entities: ALL_ENTITIES（sqlite + mssql + postgres），共 3 處。
    const occurrences = (appSrc.match(/entities:\s*ALL_ENTITIES/g) ?? []).length;
    expect(occurrences).toBe(3);
    // ALL_ENTITIES 定義含 36 個 entity（與 EXPECTED_ENTITY_COUNT 一致）。
    expect(ALL_ENTITIES.length).toBe(EXPECTED_ENTITY_COUNT);
  });

  it('TS-MSSQL-P1B1-ENTITY-006（P1b1 headline DoD）：sys.tables 精確 = entityMetadatas.length（零錯誤 synchronize）', async (ctx) => {
    ensureMssql(ctx);
    const rows = await ds!.query(
      `SELECT t.name FROM sys.tables t JOIN sys.schemas s ON t.schema_id=s.schema_id WHERE s.name='${SCHEMA}'`,
    );
    expect(rows.length).toBe(ds!.entityMetadatas.length);
    expect(rows.length).toBe(EXPECTED_ENTITY_COUNT);
  });
});

// ===========================================================================
// 五、DEFAULT — CURRENT_TIMESTAMP 8 欄自動填入
// ===========================================================================
describe('AD-E07-39 P1b1 DEFAULT（CURRENT_TIMESTAMP）', () => {
  const runId = randomUUID();

  it('TS-MSSQL-P1B1-DEFAULT-001：8 個 CURRENT_TIMESTAMP 欄位於 INSERT 不提供值時由 DB 自動填入', async (ctx) => {
    ensureMssql(ctx);
    // 父 assignment_run（供 snapshot / monthly_run_result FK）。
    await ds!.query(
      `INSERT INTO ${SCHEMA}.assignment_run (run_id, project_workym, status, triggered_by) VALUES (@0,@1,@2,@3)`,
      [runId, '202607', 'pending', randomUUID()],
    );
    await ds!.query(
      `INSERT INTO ${SCHEMA}.ob_assign_config (config_key, config_value) VALUES (@0,@1)`,
      ['p1b1_default_test', 'v'],
    );
    await ds!.query(
      `INSERT INTO ${SCHEMA}.assignment_run_snapshot (run_id, snapshot_type, payload) VALUES (@0,@1,@2)`,
      [runId, 'config', '{}'],
    );
    await ds!.query(
      `INSERT INTO ${SCHEMA}.assignment_approval (list_no, action, approver_id) VALUES (@0,@1,@2)`,
      ['L-DFLT-01', 'approve', randomUUID()],
    );
    await ds!.query(
      `INSERT INTO ${SCHEMA}.assignment_audit_log (entity_type, entity_id, action, actor_id, actor_name) VALUES (@0,@1,@2,@3,@4)`,
      ['test', 'e1', 'CREATE', randomUUID(), 'tester'],
    );
    await ds!.query(
      `INSERT INTO ${SCHEMA}.ob_monthly_run_result (run_id, list_no, orgno, appl_no) VALUES (@0,@1,@2,@3)`,
      [runId, 'L1', '01', 'A0000001'],
    );

    const checks: Array<[string, string, string]> = [
      [`SELECT updated_at AS v FROM ${SCHEMA}.ob_assign_config WHERE config_key='p1b1_default_test'`, 'ob_assign_config', 'updated_at'],
      [`SELECT created_at AS v FROM ${SCHEMA}.ob_monthly_run_result WHERE run_id='${runId}' AND appl_no='A0000001'`, 'ob_monthly_run_result', 'created_at'],
      [`SELECT updated_at AS v FROM ${SCHEMA}.ob_monthly_run_result WHERE run_id='${runId}' AND appl_no='A0000001'`, 'ob_monthly_run_result', 'updated_at'],
      [`SELECT created_at AS v FROM ${SCHEMA}.assignment_run_snapshot WHERE run_id='${runId}'`, 'assignment_run_snapshot', 'created_at'],
      [`SELECT approved_at AS v FROM ${SCHEMA}.assignment_approval WHERE list_no='L-DFLT-01'`, 'assignment_approval', 'approved_at'],
      [`SELECT created_at AS v FROM ${SCHEMA}.assignment_approval WHERE list_no='L-DFLT-01'`, 'assignment_approval', 'created_at'],
      [`SELECT created_at AS v FROM ${SCHEMA}.assignment_audit_log WHERE entity_id='e1'`, 'assignment_audit_log', 'created_at'],
      [`SELECT created_at AS v FROM ${SCHEMA}.assignment_run WHERE run_id='${runId}'`, 'assignment_run', 'created_at'],
    ];
    for (const [sql, t, c] of checks) {
      const rows = await ds!.query(sql);
      expect(rows[0]?.v, `${t}.${c}`).toBeTruthy();
      expect(rows[0].v, `${t}.${c}`).toBeInstanceOf(Date);
    }
  });

  it('TS-MSSQL-P1B1-DEFAULT-002：DB 自動填入時間戳與伺服器現在時間差在秒級容差內（非日期偏移）', async (ctx) => {
    ensureMssql(ctx);
    const rows = await ds!.query(
      `SELECT created_at AS v, SYSUTCDATETIME() AS now_srv FROM ${SCHEMA}.assignment_run WHERE run_id='${runId}'`,
    );
    const created = new Date(rows[0].v).getTime();
    const nowSrv = new Date(rows[0].now_srv).getTime();
    // 同為伺服器端時間基準（避免跨時區日期偏移誤判）；容差寬鬆至 5 分鐘涵蓋 synchronize/測試延遲。
    expect(Math.abs(nowSrv - created)).toBeLessThan(5 * 60 * 1000);
  });
});

// ===========================================================================
// 六、CASE / COLLATE — 全表大小寫 + Collation 一致性守門
// ===========================================================================
describe('AD-E07-39 P1b1 CASE / COLLATE', () => {
  it('TS-MSSQL-P1B1-CASE-001：全表 sys.tables 名稱皆為小寫', async (ctx) => {
    ensureMssql(ctx);
    const rows = await ds!.query(
      `SELECT t.name FROM sys.tables t JOIN sys.schemas s ON t.schema_id=s.schema_id WHERE s.name='${SCHEMA}'`,
    );
    expect(rows.length).toBeGreaterThan(0);
    // I-MSSQL-CASE-01：小寫 snake_case（允許數字，如 legacy OB 欄 addr1/tel1；核心守門 = 無大寫）。
    for (const r of rows) expect(r.name, r.name).toMatch(/^[a-z0-9_]+$/);
  });

  it('TS-MSSQL-P1B1-CASE-002：全表所有欄位名稱皆為小寫 snake_case', async (ctx) => {
    ensureMssql(ctx);
    const rows = await ds!.query(
      `SELECT c.name FROM sys.columns c
       JOIN sys.tables t ON c.object_id=t.object_id
       JOIN sys.schemas s ON t.schema_id=s.schema_id WHERE s.name='${SCHEMA}'`,
    );
    expect(rows.length).toBeGreaterThan(0);
    // 允許數字（legacy OB 欄 order1/addr1 等）；守門重點 = 無大寫字母。
    for (const r of rows) {
      expect(r.name, r.name).toMatch(/^[a-z0-9_]+$/);
      expect(r.name, r.name).toBe(r.name.toLowerCase());
    }
  });

  it('TS-MSSQL-P1B1-COLLATE-001：全表全欄 collation 唯一 = Chinese_Taiwan_Stroke_BIN', async (ctx) => {
    ensureMssql(ctx);
    const rows = await ds!.query(
      `SELECT DISTINCT c.collation_name FROM sys.columns c
       JOIN sys.tables t ON c.object_id=t.object_id
       JOIN sys.schemas s ON t.schema_id=s.schema_id
       WHERE s.name='${SCHEMA}' AND c.collation_name IS NOT NULL`,
    );
    expect(rows.map((r: { collation_name: string }) => r.collation_name)).toEqual(['Chinese_Taiwan_Stroke_BIN']);
  });

  it('TS-MSSQL-P1B1-COLLATE-002：無任何欄位層級 COLLATE 覆寫（皆繼承 DB 層級設定）', async (ctx) => {
    ensureMssql(ctx);
    const dbCollation = (await ds!.query(
      `SELECT CAST(DATABASEPROPERTYEX(DB_NAME(),'Collation') AS NVARCHAR(128)) AS coll`,
    ))[0].coll;
    // 任一字串欄位之 collation 與 DB 預設不同 → 代表有欄位層級 COLLATE 覆寫。應為 0。
    const overrides = await ds!.query(
      `SELECT t.name AS tbl, c.name AS col, c.collation_name FROM sys.columns c
       JOIN sys.tables t ON c.object_id=t.object_id
       JOIN sys.schemas s ON t.schema_id=s.schema_id
       WHERE s.name='${SCHEMA}' AND c.collation_name IS NOT NULL AND c.collation_name <> @0`,
      [dbCollation],
    );
    expect(overrides).toEqual([]);
  });
});

// ===========================================================================
// 七、PKWIDTH — I-MSSQL-PK-BYTELIMIT-01 動態索引鍵寬度守門
// ===========================================================================
describe('AD-E07-39 P1b1 PKWIDTH', () => {
  async function indexKeyWidths() {
    return ds!.query(
      `SELECT t.name AS table_name, i.name AS index_name, i.is_primary_key, i.is_unique,
              i.type_desc, SUM(c.max_length) AS key_bytes
       FROM sys.indexes i
       JOIN sys.tables t ON i.object_id = t.object_id
       JOIN sys.schemas s ON t.schema_id = s.schema_id
       JOIN sys.index_columns ic ON i.object_id = ic.object_id AND i.index_id = ic.index_id AND ic.is_included_column = 0
       JOIN sys.columns c ON ic.object_id = c.object_id AND ic.column_id = c.column_id
       WHERE s.name = '${SCHEMA}' AND (i.is_primary_key = 1 OR i.is_unique = 1)
       GROUP BY t.name, i.name, i.is_primary_key, i.is_unique, i.type_desc`,
    );
  }

  it('TS-MSSQL-P1B1-PKWIDTH-001：全表 PK/unique index 位元組寬度 ≤ 900(clustered)/1700(nonclustered)', async (ctx) => {
    ensureMssql(ctx);
    const rows = await indexKeyWidths();
    expect(rows.length).toBeGreaterThan(0);
    for (const r of rows) {
      const limit = r.type_desc === 'CLUSTERED' ? 900 : 1700;
      expect(Number(r.key_bytes), `${r.table_name}.${r.index_name} (${r.type_desc})`).toBeLessThanOrEqual(limit);
    }
    // B1 修復：token_blocklist PK = binary(32) = 32 bytes（遠低於 900）。
    const tb = rows.find((r: { table_name: string; is_primary_key: boolean }) => r.table_name === 'token_blocklist' && r.is_primary_key);
    expect(tb, 'token_blocklist PK').toBeTruthy();
    expect(Number(tb.key_bytes)).toBe(32);
  });

  it('TS-MSSQL-P1B1-PKWIDTH-002（meta）：守門為 sys.* 動態掃描（非寫死清單），涵蓋多表', async (ctx) => {
    ensureMssql(ctx);
    const rows = await indexKeyWidths();
    // 動態掃描 → 涵蓋大量表；含 token_blocklist（clustered PK）與 assignment_run_stage_log（複合 unique nonclustered）。
    expect(rows.length).toBeGreaterThanOrEqual(10);
    const tables = new Set(rows.map((r: { table_name: string }) => r.table_name));
    expect(tables.has('token_blocklist')).toBe(true);
    expect(tables.has('assignment_run_stage_log')).toBe(true);
    const stageUnique = rows.find(
      (r: { table_name: string; is_unique: boolean; is_primary_key: boolean }) =>
        r.table_name === 'assignment_run_stage_log' && r.is_unique && !r.is_primary_key,
    );
    expect(stageUnique, 'assignment_run_stage_log (run_id, stage_no) unique').toBeTruthy();
    // run_id uniqueidentifier(16) + stage_no smallint(2) = 18 bytes。
    expect(Number(stageUnique.key_bytes)).toBe(18);
  });
});

// ===========================================================================
// 八、REG — 跨分支回歸與型別/靜態閘（無 DB 相依，不 skip）
// ===========================================================================
describe('AD-E07-39 P1b1 REG（靜態閘）', () => {
  it('TS-MSSQL-P1B1-REG-004（I-MSSQL-HELPER-SCOPE-01 延伸）：全 entity 內無重複 process.env.DB_TYPE 條件判斷', () => {
    const entitiesDir = join(__dirname, '..', 'entities');
    const files = readdirSync(entitiesDir).filter((f) => f.endsWith('.entity.ts'));
    // AD-E07-40 P2a：新增 queue-job.entity.ts（佇列基礎建設 entity）→ 37（36 業務 + 1 佇列）。
    expect(files.length).toBe(37);
    for (const f of files) {
      const content = readFileSync(join(entitiesDir, f), 'utf8');
      expect(content.includes('process.env.DB_TYPE'), f).toBe(false);
    }
  });
});

// ===========================================================================
// 九、HASH-REG（模組重載）— 置於本檔最後：vi.resetModules() 不可污染前面 module-boot 測試
// ===========================================================================
describe('AD-E07-39 P1b1 HASH-REG（三分支重載，末端執行）', () => {
  it('TS-MSSQL-P1B1-HASH-REG-001：hashColumnType/hashColumnLength 三分支回傳值正確', async () => {
    const orig = process.env.DB_TYPE;
    try {
      for (const [t, expType, expLen] of [
        ['mssql', 'binary', 32],
        ['sqlite', 'blob', undefined],
        ['postgres', 'bytea', undefined],
      ] as const) {
        vi.resetModules();
        process.env.DB_TYPE = t;
        const mod = await import('@/common/database/column-types');
        expect(mod.hashColumnType, t).toBe(expType);
        expect(mod.hashColumnLength, t).toBe(expLen);
      }
    } finally {
      process.env.DB_TYPE = orig; // 還原 mssql
    }
  });
});
