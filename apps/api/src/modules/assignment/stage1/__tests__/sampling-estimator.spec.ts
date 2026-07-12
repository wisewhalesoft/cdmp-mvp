/**
 * AD-E07-45 §4 抽樣估算共用元件 — sampling-estimator.ts 純函式測試（F055/F056/F050 唯一核心測試位置）。
 *
 * 對應 F055-test.md I 組 TS-F055-028 ~ 037（純函式 / SQL 字串 shape，離線；038/039 需真實 MSSQL，見
 * sampling-estimator.mssql.spec.ts）。
 */

import { describe, it, expect, vi } from 'vitest';
import {
  POOL_DATA_SAMPLE_SIZE,
  POOL_DATA_SAMPLE_SEED,
  computeSamplePercent,
  buildPoolDataSampleFrom,
  scaleEstimate,
  getPoolDataTotalCount,
} from '../sampling-estimator';

describe('sampling-estimator (AD-E07-45)', () => {
  // ── TS-F055-028：常數值 ─────────────────────────────────────────────────
  it('TS-F055-028：POOL_DATA_SAMPLE_SIZE=50000 / POOL_DATA_SAMPLE_SEED=42（const，非參數）', () => {
    expect(POOL_DATA_SAMPLE_SIZE).toBe(50000);
    expect(POOL_DATA_SAMPLE_SEED).toBe(42);
  });

  // ── TS-F055-029：getPoolDataTotalCount 精確 COUNT(*) ─────────────────────
  it('TS-F055-029：getPoolDataTotalCount 回傳精確 COUNT(*)（無方言差異）', async () => {
    const repo = {
      query: vi.fn().mockResolvedValue([{ cnt: 120 }]),
    } as any;
    const total = await getPoolDataTotalCount(repo);
    expect(total).toBe(120);
    const sql = repo.query.mock.calls[0][0] as string;
    expect(sql).toMatch(/SELECT\s+COUNT\(\*\)/i);
    expect(sql).toMatch(/FROM\s+ob_pool_data/i);
  });

  it('TS-F055-029b：getPoolDataTotalCount 兼容字串型 COUNT（MSSQL/PG driver 回字串）', async () => {
    const repo = { query: vi.fn().mockResolvedValue([{ cnt: '4567' }]) } as any;
    expect(await getPoolDataTotalCount(repo)).toBe(4567);
  });

  // ── TS-F055-030：小母體 fallback ────────────────────────────────────────
  it('TS-F055-030：小母體 fallback（totalCount<=50000）兩 dialect 皆無 CTE、全表直連', () => {
    const mssql = buildPoolDataSampleFrom(30000, 'mssql');
    expect(mssql.ctePrefix).toBe('');
    expect(mssql.fromClause).toBe('ob_pool_data o');
    expect(mssql.effectiveSampleSize).toBe(30000);

    const pg = buildPoolDataSampleFrom(30000, 'postgres');
    expect(pg.ctePrefix).toBe('');
    expect(pg.fromClause).toBe('ob_pool_data AS o');
    expect(pg.effectiveSampleSize).toBe(30000);
  });

  it('TS-F055-030b：邊界 totalCount === 50000 仍走 fallback（<=）', () => {
    const r = buildPoolDataSampleFrom(50000, 'mssql');
    expect(r.ctePrefix).toBe('');
    expect(r.effectiveSampleSize).toBe(50000);
  });

  // ── TS-F055-031：MSSQL SQL shape ────────────────────────────────────────
  // 🔴 修正 AD-E07-45 §3.2 誤述：真實 SQL Server 要求別名先於 TABLESAMPLE（runtime 查證 2026-07-12，
  //   AD 稱「TABLESAMPLE 先於別名」會拋 syntax error）。本案例斷言語法正確之 alias-first 形式。
  it('TS-F055-031：大母體 MSSQL — 別名先於 TABLESAMPLE (n PERCENT) REPEATABLE (42)（真實 T-SQL 文法）', () => {
    const r = buildPoolDataSampleFrom(1679489, 'mssql');
    expect(r.ctePrefix).toContain(
      'FROM ob_pool_data AS o TABLESAMPLE (3.87 PERCENT) REPEATABLE (42)',
    );
    expect(r.ctePrefix).toContain('SELECT TOP (50000) o.*');
    expect(r.ctePrefix).toMatch(/ORDER BY ABS\(CHECKSUM\(o\.orgno, o\.appl_no, 42\)\)/);
    expect(r.fromClause).toBe('sampled_pool o');
    expect(r.effectiveSampleSize).toBe(50000);
  });

  // ── TS-F055-032：PG SQL shape（別名先於 TABLESAMPLE）────────────────────
  it('TS-F055-032：大母體 PG — 別名先於 TABLESAMPLE SYSTEM，含 LIMIT 50000', () => {
    const r = buildPoolDataSampleFrom(1679489, 'postgres');
    expect(r.ctePrefix).toContain(
      'FROM ob_pool_data AS o TABLESAMPLE SYSTEM (3.87) REPEATABLE (42)',
    );
    expect(r.ctePrefix).toContain('LIMIT 50000');
    expect(r.ctePrefix).toMatch(/hashtext\(o\.orgno \|\| o\.appl_no \|\| '42'\)/);
    expect(r.fromClause).toBe('sampled_pool o');
  });

  // ── TS-F055-033：samplePercent 公式 + 上限保護 ──────────────────────────
  it('TS-F055-033：samplePercent 公式（50000*1.3/N*100，兩位小數）+ min(100) 上限', () => {
    expect(computeSamplePercent(1679489)).toBe(3.87);
    // totalCount=60000 → 50000*1.3/60000*100 = 108.33 → min(100) = 100
    expect(computeSamplePercent(60000)).toBeLessThanOrEqual(100);
    expect(computeSamplePercent(60000)).toBe(100);
  });

  // ── TS-F055-034：I-SAMPLE-LITERAL-01 數值字面量、非具名參數 ────────────
  it('TS-F055-034：samplePercent/seed/size 為數值字面量嵌入 SQL，無具名參數 placeholder', () => {
    const { ctePrefix } = buildPoolDataSampleFrom(1679489, 'mssql');
    // 無 :name / @name placeholder
    expect(ctePrefix).not.toMatch(/[:@][A-Za-z]/);
    // 數值以字面量形式出現
    expect(ctePrefix).toContain('3.87');
    expect(ctePrefix).toContain('(42)');
    expect(ctePrefix).toContain('(50000)');
  });

  // ── TS-F055-035 / 036 / 037：scaleEstimate ──────────────────────────────
  it('TS-F055-035：scaleEstimate(2000, 50000, 1679489) === 67180', () => {
    expect(scaleEstimate(2000, 50000, 1679489)).toBe(67180);
  });

  it('TS-F055-036：scaleEstimate effectiveSampleSize<=0 防禦回 0（不拋除以零）', () => {
    expect(scaleEstimate(0, 0, 1679489)).toBe(0);
    expect(scaleEstimate(5, -1, 100)).toBe(0);
  });

  it('TS-F055-037：scaleEstimate .5 邊界標準四捨五入（Math.round，非無條件捨去）', () => {
    // 1/4*2 = 0.5 → Math.round(0.5) = 1
    expect(scaleEstimate(1, 4, 2)).toBe(1);
  });

  it('小母體 fallback 下 scaleEstimate 為恆等（effectiveSampleSize===totalCount）', () => {
    // 小母體：分母=totalCount → scaleEstimate(x, N, N) === x（無抽樣誤差）
    expect(scaleEstimate(20, 100, 100)).toBe(20);
    expect(scaleEstimate(37, 100, 100)).toBe(37);
  });
});
