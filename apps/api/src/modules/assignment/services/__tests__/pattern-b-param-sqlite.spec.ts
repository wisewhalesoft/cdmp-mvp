/**
 * AD-E07-38 P1c — PARAM 站點 1/2 SQLite 回歸 + 邊界（PARAM-004 / 008 / 009 / 010）。
 *
 * 直接以真實 in-memory better-sqlite3 DataSource 驅動改寫後之 prefetchScoringSources：
 *   - 表不存在 → try/catch graceful degrade（空 Map，不拋）
 *   - :...applNos 於 sqlite 展開 `?,?` 正確取回（含長度 1 邊界）
 *   - 空陣列 → 既有 `.length > 0` guard 阻止查詢（非查詢失敗）
 *
 * 以 16 個 null + 真 dataSource 直接 new（prefetchScoringSources 僅用 this.dataSource.manager）。
 */
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { DataSource } from 'typeorm';
import { AssignmentRunPipelineService } from '../assignment-run-pipeline.service';

let ds: DataSource;
function makeSvc(): AssignmentRunPipelineService {
  // dataSource 為第 17 個建構參數（前 16 為 repo，皆 prefetch 未使用）。
  return new AssignmentRunPipelineService(
    ...(Array(16).fill(null) as never[]),
    ds,
  );
}
const poolOf = (rows: Array<{ appl_no?: string | null; custo_no?: string | null }>) =>
  rows as never[];

beforeAll(async () => {
  ds = new DataSource({ type: 'better-sqlite3', database: ':memory:', entities: [] });
  await ds.initialize();
});
afterAll(async () => {
  await ds.destroy();
});

describe('AD-E07-38 P1c PARAM SQLite 回歸（站點 1/2）', () => {
  // PARAM-004 + PARAM-010：兩表皆不存在 → graceful degrade（空 Map，不拋）
  it('TS-MSSQL-P1C-PARAM-004/010：customer_core / ob_arreturndf_min_cap 不存在 → 空 Map 不拋', async () => {
    const svc = makeSvc();
    const { ccMap, arMap } = await (svc as never as {
      prefetchScoringSources: (p: unknown[]) => Promise<{ ccMap: Map<string, unknown>; arMap: Map<string, unknown> }>;
    }).prefetchScoringSources(poolOf([{ appl_no: 'A1', custo_no: 'C1' }]));
    expect(ccMap.size).toBe(0);
    expect(arMap.size).toBe(0);
  });

  // PARAM-009：ob_arreturndf_min_cap 存在，IN (:...applNos) 於 sqlite 正確展開（多筆 + 長度 1 邊界）
  it('TS-MSSQL-P1C-PARAM-009：IN (:...applNos) 於 sqlite 展開正確（3 筆 / 1 筆邊界）', async () => {
    await ds.query('DROP TABLE IF EXISTS ob_arreturndf_min_cap');
    await ds.query(
      'CREATE TABLE ob_arreturndf_min_cap (appl_no TEXT PRIMARY KEY, add_un_capital TEXT)',
    );
    await ds.query(
      "INSERT INTO ob_arreturndf_min_cap (appl_no, add_un_capital) VALUES ('A1','100'),('A2','200'),('A3','300')",
    );
    const svc = makeSvc();
    const prefetch = (svc as never as {
      prefetchScoringSources: (p: unknown[]) => Promise<{ arMap: Map<string, { add_un_capital: string }> }>;
    }).prefetchScoringSources.bind(svc);

    const multi = await prefetch(poolOf([
      { appl_no: 'A1', custo_no: null },
      { appl_no: 'A2', custo_no: null },
      { appl_no: 'A3', custo_no: null },
    ]));
    expect([...multi.arMap.keys()].sort()).toEqual(['A1', 'A2', 'A3']);
    expect(multi.arMap.get('A2')!.add_un_capital).toBe('200');

    // 長度 1 邊界：IN (?) 合法，非 off-by-one
    const single = await prefetch(poolOf([{ appl_no: 'A2', custo_no: null }]));
    expect([...single.arMap.keys()]).toEqual(['A2']);

    await ds.query('DROP TABLE IF EXISTS ob_arreturndf_min_cap');
  });

  // PARAM-008：空 applNos → guard 阻止查詢（不因查詢失敗而空）
  it('TS-MSSQL-P1C-PARAM-008：applNos 空陣列 → 不執行查詢（.length>0 guard 保留）', async () => {
    const svc = makeSvc();
    const spy = vi.spyOn(ds.manager, 'query');
    // pool 全為 null appl_no / custo_no → custoNos=[]、applNos=[] → 兩 guard 皆短路
    const { ccMap, arMap } = await (svc as never as {
      prefetchScoringSources: (p: unknown[]) => Promise<{ ccMap: Map<string, unknown>; arMap: Map<string, unknown> }>;
    }).prefetchScoringSources(poolOf([{ appl_no: null, custo_no: null }]));
    expect(ccMap.size).toBe(0);
    expect(arMap.size).toBe(0);
    expect(spy).not.toHaveBeenCalled();
    spy.mockRestore();
  });
});
