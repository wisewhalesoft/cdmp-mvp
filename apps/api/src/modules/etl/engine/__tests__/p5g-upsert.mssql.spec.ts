/**
 * P5g §四 UPSERT-ATOMIC — customer_core 兩段式 UPDATE+INSERT 部分套用風險之修法驗收（真實 MSSQL / CDMP_TEST）。
 *
 * ★發現 1：I-ETL-ATOMIC-LOAD-01 文字僅列 fullMode/partition_replace，未涵蓋 customer_core UPSERT 兩段式路徑
 *   （UPDATE 既有列 → INSERT 新列）。本輪基於「同一 handler、同一修法機制」原則主動納入交易保護。
 *
 * Harness：沿用 P4d CDMP_TEST（customer_core 存在）；共用表 + 前綴隔離（P5G_）+ 精準 DELETE（禁 TRUNCATE）。
 *   以 P4c 直驅 handler 手法（synthetic ## 輸入 + 直接 execute），可控地構造「UPDATE 成功、INSERT 失敗」情境。
 * ⚠️ 必須 side-effect import mssql-env-preload；CDMP_TEST(MSSQL) 不可達 → 全檔 skip（不偽綠）。
 */
import '@/database/__tests__/mssql-env-preload';
import { describe, it, beforeAll, afterAll, afterEach, expect, vi } from 'vitest';
import { restoreDbType } from '@/database/__tests__/mssql-env-preload';
import { connectMssql, teardownMssql, uniqueLogId, MssqlHarness } from './_p4a-mssql-harness';
import { ensureTargetTable } from './_p4c-target-tables';
import { TargetLoadHandlerMssql } from '../handlers/target-load-handler-mssql';
import { NodeExecutionContext, DataSet } from '../types';

vi.setConfig({ testTimeout: 60000 });

const GUID = '88888888-9999-aaaa-bbbb-cccccccccccc';
let h: MssqlHarness;
const cleanupPrefixes: string[] = [];

beforeAll(async () => {
  h = await connectMssql();
  if (h.reachable && h.qr) {
    await ensureTargetTable(h.qr, 'customer_core');
  }
});
afterEach(async () => {
  if (!h?.qr) return;
  for (const pfx of cleanupPrefixes.splice(0)) {
    await h.qr.query(`DELETE FROM customer_core WHERE source_customer_no LIKE '${pfx}%'`);
  }
});
afterAll(async () => {
  await teardownMssql(h);
  restoreDbType();
});
const gate = () => !h?.reachable || !h?.qr;

/** 唯一前綴（P5G_ + 6 hex），afterEach 精準刪除。 */
function newPfx(): string {
  const p = 'P5G_' + uniqueLogId().slice(0, 6);
  cleanupPrefixes.push(p);
  return p;
}
/** synthetic ## 輸入表（VALUES → SELECT INTO）。 */
async function fixture(valuesSql: string, cols: string): Promise<string> {
  const name = '##sgfx_' + uniqueLogId().slice(0, 10);
  await h.qr!.query(`SELECT * INTO ${name} FROM (VALUES ${valuesSql}) AS v(${cols})`);
  return name;
}
function tlCtx(inputTable: string, rowCount: number): NodeExecutionContext {
  return {
    node: { id: 'tl1', type: 'pipelineNode', position: { x: 0, y: 0 }, data: { nodeType: 'target_load', label: 'T', targetTable: 'customer_core', fullMode: false } },
    inputs: { default: { tempTable: inputTable, rowCount } as DataSet },
    pipelineId: GUID,
    logId: uniqueLogId(),
    isTestRun: false,
    queryRunner: h.qr!,
  };
}
async function readCore(code: string): Promise<any | null> {
  const r = await h.qr!.query(`SELECT source_customer_no, customer_type_code, name FROM customer_core WHERE source_customer_no=N'${code}'`);
  return r[0] ?? null;
}
async function seedExisting(code: string, typeCode: string, name: string): Promise<void> {
  await h.qr!.query(
    `INSERT INTO customer_core (source_customer_no, customer_type_code, name, data_source, _etl_pipeline_id) ` +
      `VALUES (N'${code}', N'${typeCode}', N'${name}', N'seed', '${GUID}')`,
  );
}

describe('P5g UPSERT-ATOMIC（MSSQL / customer_core 兩段式）', () => {
  it('UPSERTATOMIC-001（MUST-FIX，範圍擴張）：UPDATE 成功 + INSERT 失敗 → 整個回滾（既有列恢復更新前值、新列不存在）', async () => {
    if (gate()) return;
    const p = newPfx();
    const existing = `${p}E01`; // 既有列（供 UPDATE 命中）
    const brandNew = `${p}N01`; // 新列（INSERT 因 customer_type_code 溢位 varchar(2) 而失敗）
    await seedExisting(existing, '01', 'OLD');

    // 輸入批次：existing 之乾淨更新值（'02'/'NEW'） + brandNew 之壞值（customer_type_code='XYZ' 超過 varchar(2)）
    const fx = await fixture(
      `(N'${existing}',N'02',N'NEW',N'etl_load'),(N'${brandNew}',N'XYZ',N'NewGuy',N'etl_load')`,
      'source_customer_no,customer_type_code,name,data_source',
    );

    // 修法後：兩段式 UPDATE+INSERT 同屬一交易 → INSERT 溢位失敗 → 整個回滾
    await expect(new TargetLoadHandlerMssql().execute(tlCtx(fx, 2))).rejects.toThrow(/UPSERT 失敗/);

    // 既有列恢復更新前值（UPDATE 被回滾），而非停留在「已更新 'NEW'/'02'」的中間態
    const ex = await readCore(existing);
    expect(ex).not.toBeNull();
    expect(ex.name).toBe('OLD');
    expect(ex.customer_type_code).toBe('01');
    // 新列不存在
    expect(await readCore(brandNew)).toBeNull();
    expect(h.qr!.isTransactionActive).toBe(false);
  });

  it('SUCC-003（DoD 核心，回歸）：乾淨批次 UPSERT → 既有列 UPDATE、新列 INSERT 皆正確（交易包裝不破壞成功路徑）', async () => {
    if (gate()) return;
    const p = newPfx();
    const existing = `${p}E02`;
    const brandNew = `${p}N02`;
    await seedExisting(existing, '01', 'OLD');

    const fx = await fixture(
      `(N'${existing}',N'02',N'UPDATED',N'etl_load'),(N'${brandNew}',N'03',N'INSERTED',N'etl_load')`,
      'source_customer_no,customer_type_code,name,data_source',
    );
    const res = await new TargetLoadHandlerMssql().execute(tlCtx(fx, 2));
    expect(res.rowCount).toBe(2);

    const ex = await readCore(existing);
    expect(ex.name).toBe('UPDATED');
    expect(ex.customer_type_code).toBe('02');
    const nw = await readCore(brandNew);
    expect(nw).not.toBeNull();
    expect(nw.name).toBe('INSERTED');
    expect(nw.customer_type_code).toBe('03');
    expect(h.qr!.isTransactionActive).toBe(false);
  });
});
