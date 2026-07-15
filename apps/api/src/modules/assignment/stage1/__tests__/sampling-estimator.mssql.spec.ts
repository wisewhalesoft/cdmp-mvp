/**
 * AD-E07-45 §8 — sampling-estimator 真實 MSSQL 行為驗證（TABLESAMPLE REPEATABLE 決定性 + 精確修剪）。
 *
 * 對應 F055-test.md I 組 TS-F055-038 / 039（唯一需真實 MSSQL 之核心元件案例）。
 *   TS-F055-038：相同種子相同輸入，兩次連續查詢回傳完全相同之 (orgno, appl_no) 集合。
 *   TS-F055-039：大母體情境下實際修剪後恰 50000 列（TOP + 過抽係數緩衝生效）。
 *
 * 純讀取（僅 SELECT ob_pool_data），不寫入 / 不 DELETE；共用 dev CDMP 之 ob_pool_data（3.6M 列 > 50000）。
 * 不可達 MSSQL 時整檔 describe.skip + SKIP_REASON（feedback_mock_real_system_contract：不假綠）。
 */

import { restoreDbType, MSSQL, mssqlPortReachable, SKIP_REASON } from '@/database/__tests__/mssql-env-preload';
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { DataSource } from 'typeorm';
import { ObPoolData } from '@/database/entities/ob-pool-data.entity';
import {
  buildPoolDataSampleFrom,
  getPoolDataTotalCount,
  POOL_DATA_SAMPLE_SIZE,
} from '../sampling-estimator';

vi.setConfig({ testTimeout: 120000, hookTimeout: 60000 });

let reachable = false;
let ds: DataSource | null = null;
let totalCount = 0;

beforeAll(async () => {
  reachable = await mssqlPortReachable(1500);
  if (!reachable) return;
  try {
    ds = new DataSource({
      type: 'mssql',
      host: MSSQL.host,
      port: MSSQL.port,
      username: MSSQL.username,
      password: MSSQL.password,
      database: MSSQL.database,
      options: {
        encrypt: MSSQL.encrypt,
        trustServerCertificate: MSSQL.trustServerCertificate,
      },
      entities: [ObPoolData],
      synchronize: false,
    });
    await ds.initialize();
    totalCount = await getPoolDataTotalCount(ds.getRepository(ObPoolData) as any);
  } catch (e) {
    // eslint-disable-next-line no-console
    console.warn('[AD-E07-45 MSSQL] init failed → skip:', (e as Error)?.message);
    reachable = false;
    ds = null;
  }
});

afterAll(async () => {
  if (ds?.isInitialized) await ds.destroy();
  restoreDbType();
});

async function sampleKeys(): Promise<Set<string>> {
  const { ctePrefix, fromClause } = buildPoolDataSampleFrom(totalCount, 'mssql');
  const sql = `${ctePrefix}SELECT o.orgno AS orgno, o.appl_no AS appl_no FROM ${fromClause}`;
  const rows: Array<{ orgno: string; appl_no: string }> = await ds!.query(sql);
  return new Set(rows.map((r) => `${r.orgno}${r.appl_no}`));
}

describe('sampling-estimator — 真實 MSSQL TABLESAMPLE REPEATABLE（AD-E07-45 §8）', () => {
  it('環境可達性（不可達則本檔其餘案例 skip）', () => {
    if (!reachable) {
      // eslint-disable-next-line no-console
      console.warn(`[AD-E07-45 MSSQL] ${SKIP_REASON}`);
    }
    expect(true).toBe(true);
  });

  it('TS-F055-038：REPEATABLE 決定性 — 兩次連續查詢回傳完全相同之 (orgno, appl_no) 集合', async (ctx) => {
    if (!reachable || !ds) return ctx.skip();
    // CI 空庫（schema-only）ob_pool_data 母體為 0 → 本純讀取案例無意義，skip（不假綠）；populated DB 照跑。
    if (totalCount === 0) return ctx.skip('需真實母體資料（ob_pool_data），CI 空庫 skip');
    // 大母體前提（dev CDMP ob_pool_data ~3.6M > 50000），否則本案例無意義
    expect(totalCount).toBeGreaterThan(POOL_DATA_SAMPLE_SIZE);

    const set1 = await sampleKeys();
    const set2 = await sampleKeys();

    expect(set1.size).toBe(set2.size);
    for (const k of set1) expect(set2.has(k)).toBe(true);
  });

  it('TS-F055-039：大母體實際修剪後恰 50000 列（過抽係數 1.3 緩衝生效）', async (ctx) => {
    if (!reachable || !ds) return ctx.skip();
    if (totalCount === 0) return ctx.skip('需真實母體資料（ob_pool_data），CI 空庫 skip');
    expect(totalCount).toBeGreaterThan(POOL_DATA_SAMPLE_SIZE);

    const { ctePrefix, fromClause } = buildPoolDataSampleFrom(totalCount, 'mssql');
    const rows: Array<{ cnt: number }> = await ds.query(
      `${ctePrefix}SELECT COUNT(*) AS cnt FROM ${fromClause}`,
    );
    expect(Number(rows[0].cnt)).toBe(POOL_DATA_SAMPLE_SIZE);
  });
});
