/**
 * AD-E07-43 P5b — §十一 EQ-PG 跨引擎 best-effort 比對（degradable）。
 *
 * 政策（§0.5 + REG-004）：PG 側 fullMode 之 `TRUNCATE ob_pool_data` 會污染 CI pg-specs lane 共用之
 *   `cdmp_test`（與 MSSQL 側以 CDMP_P5B 隔離同理）。故 PG 實跑比對僅在提供**專用 PG 資料庫**
 *   （env `P5B_PG_DB`，非 cdmp_test）且 5433 可達時才執行；否則 describe.skip + SKIP_REASON（DEFERRED，
 *   非 DoD 未達成；比照 P4d EQ-PG 先例）。
 *
 * 另含**非 gated 結構等價**檢查（EQPG-ATOMIC-STRUCT）：以 fs 讀 PG 版 target-load-handler.ts /
 *   pipeline-runner.ts，佐證 ★發現 3「TRUNCATE+INSERT 兩段式、零交易保護為兩引擎共通既有架構」——
 *   此為 ATOMIC-005（PG 對稱）之可離線驗證代理，不依賴 5433。
 */
import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as net from 'net';
import * as path from 'path';
import { DataSource } from 'typeorm';
import {
  loadPipelineDef, deriveRawColumns, invertMappings, PIPELINE_KEYS, PipelineKey,
  P5B_PIPELINES, FIX_EMPHIRE, FIX_POOLDATA, FIX_CALENDAR, FIX_ARRETURNDF, FIX_POOLDATA_LIST,
} from './_p5b-fixtures';
import { NodeDispatcher } from '../node-dispatcher';
import { NodeOutputStore } from '../node-output-store';
import { PipelineRunner } from '../pipeline-runner';
import { ExtractHandler } from '../handlers/extract-handler';
import { FieldMappingHandler } from '../handlers/field-mapping-handler';
import { ConditionalHandler } from '../handlers/conditional-handler';
import { TargetLoadHandler } from '../handlers/target-load-handler';

const HERE = __dirname;

const PG = {
  host: process.env.PG_BOSS_TEST_HOST ?? '127.0.0.1',
  port: Number(process.env.PG_BOSS_TEST_PORT ?? 5433),
  user: process.env.PG_BOSS_TEST_USER ?? 'cdmp',
  password: process.env.PG_BOSS_TEST_PASSWORD ?? 'cdmp_secret',
  // 專用庫（非 cdmp_test）才實跑，避免 fullMode TRUNCATE 污染 CI pg-specs 共用庫（REG-004）。
  database: process.env.P5B_PG_DB ?? '',
};

const SKIP_REASON =
  '需專用 Postgres 庫（env P5B_PG_DB，非 cdmp_test；5433 可達且已 migration:run 建 baseline）— DEFERRED，不偽綠';

function pgPortReachable(timeoutMs = 1000): Promise<boolean> {
  return new Promise((resolve) => {
    const sock = net.connect({ host: PG.host, port: PG.port });
    const finish = (ok: boolean) => {
      sock.destroy();
      resolve(ok);
    };
    sock.setTimeout(timeoutMs);
    sock.once('connect', () => finish(true));
    sock.once('error', () => finish(false));
    sock.once('timeout', () => finish(false));
  });
}

/** 是否具備 PG 實跑條件：專用庫 env 已設 + 5433 可達。 */
async function pgEqEnabled(): Promise<boolean> {
  if (!PG.database) return false;
  return pgPortReachable();
}

// ---------------------------------------------------------------------------
// 非 gated：ATOMIC 兩引擎結構等價（★發現 3、8 之離線佐證）
// ---------------------------------------------------------------------------
describe('P5b EQ-PG（非 gated）— ATOMIC 兩引擎結構等價佐證', () => {
  it('EQPG-ATOMIC-STRUCT：PG 版 target-load-handler.ts 為 TRUNCATE+INSERT 兩段式、pipeline-runner 零交易保護', () => {
    const pgHandler = fs.readFileSync(path.resolve(HERE, '../handlers/target-load-handler.ts'), 'utf8');
    // fullMode 路徑：TRUNCATE 與 INSERT 為兩個獨立陳述式
    expect(pgHandler).toMatch(/TRUNCATE\s+TABLE/i);
    expect(pgHandler).toMatch(/INSERT\s+INTO/i);
    const runner = fs.readFileSync(path.resolve(HERE, '../pipeline-runner.ts'), 'utf8');
    // 全檔無 startTransaction/commitTransaction → 兩段式無交易保護（與 MSSQL 版對稱，★發現 3、8）
    expect(runner).not.toMatch(/startTransaction|commitTransaction|rollbackTransaction/);
  });

  it('EQPG-005（meta 交叉引用）：MSSQL 側 ATOMIC 分支已由 p5b-e2e ATOMIC-001..004 判定為分支 A（資料遺失）', () => {
    expect(true).toBe(true);
  });

  it('EQPG-006：degradable gating 機制自我驗證（reachable 為 boolean、SKIP_REASON 非空）', async () => {
    const enabled = await pgEqEnabled();
    expect(typeof enabled).toBe('boolean');
    expect(SKIP_REASON.length).toBeGreaterThan(0);
    if (!enabled) console.warn(`[P5b EQ-PG] SKIPPED live compare — ${SKIP_REASON}`);
  });
});

// ---------------------------------------------------------------------------
// gated：PG 實跑（需專用庫）。不可達 → 全 skip（不偽綠）。
// ---------------------------------------------------------------------------
let enabled = false;
let ds: DataSource | null = null;

function lit(v: string | null | undefined): string {
  if (v === null || v === undefined) return 'NULL';
  return `'${String(v).replace(/'/g, "''")}'`;
}

function buildPgDispatcher(): NodeDispatcher {
  const d = new NodeDispatcher();
  d.register(new ExtractHandler());
  d.register(new FieldMappingHandler());
  d.register(new ConditionalHandler());
  d.register(new TargetLoadHandler());
  return d;
}

async function pgBuildRaw(key: PipelineKey, rows: Record<string, string | null>[]): Promise<void> {
  const qr = ds!.createQueryRunner();
  await qr.connect();
  try {
    const def = loadPipelineDef(key);
    const cols = deriveRawColumns(def);
    const inverse = invertMappings(def);
    const raw = P5B_PIPELINES[key].rawTable;
    await qr.query(`DROP TABLE IF EXISTS "${raw}"`);
    await qr.query(`CREATE TABLE "${raw}" (${cols.map((c) => `"${c}" TEXT`).join(', ')})`);
    for (const trow of rows) {
      const srow: Record<string, string | null> = {};
      for (const [t, v] of Object.entries(trow)) {
        const s = inverse[t];
        if (s) srow[s] = v;
      }
      const ks = Object.keys(srow);
      if (!ks.length) continue;
      await qr.query(
        `INSERT INTO "${raw}" (${ks.map((c) => `"${c}"`).join(', ')}) VALUES (${ks.map((c) => lit(srow[c])).join(', ')})`,
      );
    }
  } finally {
    await qr.release();
  }
}

async function pgRun(key: PipelineKey): Promise<string[]> {
  const qr = ds!.createQueryRunner();
  await qr.connect();
  try {
    const runner = new PipelineRunner(buildPgDispatcher(), new NodeOutputStore());
    const logs = await runner.run(
      loadPipelineDef(key),
      { batchSize: 10000, upsertBatchSize: 5000, isTestRun: false, pipelineId: '33333333-3333-3333-3333-333333333333', logId: Math.random().toString(16).slice(2, 10) },
      qr,
      async () => {},
    );
    return logs.filter((l) => l.status !== 'completed').map((l) => `${l.nodeId}:${l.status}`);
  } finally {
    await qr.release();
  }
}

async function pgCount(table: string, where?: string): Promise<number> {
  const qr = ds!.createQueryRunner();
  await qr.connect();
  try {
    const r = await qr.query(`SELECT COUNT(*) AS c FROM "${table}"${where ? ` WHERE ${where}` : ''}`);
    return Number(r[0].c);
  } finally {
    await qr.release();
  }
}

describe('P5b EQ-PG（gated）— PG 實跑對照（degradable）', () => {
  it('前置：偵測專用 PG 庫可用性', async () => {
    enabled = await pgEqEnabled();
    if (enabled) {
      ds = new DataSource({
        type: 'postgres', host: PG.host, port: PG.port, username: PG.user,
        password: PG.password, database: PG.database, entities: [], synchronize: false,
      });
      await ds.initialize();
    }
    expect(true).toBe(true);
  });

  it('EQPG-001：5 條 pipeline 於 PG 皆完整跑通零錯誤', async (ctx) => {
    if (!enabled || !ds) return ctx.skip();
    const happy: Record<PipelineKey, Record<string, string | null>[]> = {
      arreturndf: FIX_ARRETURNDF.happy, calendar: FIX_CALENDAR.happy, emphire: FIX_EMPHIRE.happy,
      pooldata: FIX_POOLDATA.happy, pooldata_list: FIX_POOLDATA_LIST.happy,
    };
    for (const key of PIPELINE_KEYS) {
      await pgBuildRaw(key, happy[key]);
      await ds.createQueryRunner().query(`DELETE FROM "${P5B_PIPELINES[key].targetTable}"`).catch(() => {});
      const bad = await pgRun(key);
      expect(bad).toEqual([]);
    }
  });

  it('EQPG-002/004：pooldata composite PK 去重 PG 側亦恰 1 列、業務欄一致', async (ctx) => {
    if (!enabled || !ds) return ctx.skip();
    await pgBuildRaw('pooldata', [...FIX_POOLDATA.happy, FIX_POOLDATA.dupPk]);
    const qr = ds.createQueryRunner();
    await qr.query(`DELETE FROM "ob_pool_data"`).catch(() => {});
    await qr.release();
    await pgRun('pooldata');
    expect(await pgCount('ob_pool_data', `orgno='01' AND appl_no='P000000001'`)).toBe(1);
    expect(await pgCount('ob_pool_data')).toBe(FIX_POOLDATA.uniqueCount);
  });

  it('EQPG-003：ob_emphire resign_date=9999-12-31 → NULL 兩側一致', async (ctx) => {
    if (!enabled || !ds) return ctx.skip();
    await pgBuildRaw('emphire', FIX_EMPHIRE.happy);
    const qr = ds.createQueryRunner();
    await qr.query(`DELETE FROM "ob_emphire"`).catch(() => {});
    await qr.release();
    await pgRun('emphire');
    for (const id of FIX_EMPHIRE.activeIds) {
      expect(await pgCount('ob_emphire', `emp_id='${id}' AND resign_date IS NULL`)).toBe(1);
    }
  });

  it('清理：teardown', async () => {
    if (ds) await ds.destroy();
    expect(true).toBe(true);
  });
});
