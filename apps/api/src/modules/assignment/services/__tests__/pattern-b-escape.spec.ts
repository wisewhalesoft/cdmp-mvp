/**
 * AD-E07-38 P1c — ESCAPE 群組（driver 具名參數展開，I-MSSQL-PARAM-01）。
 *
 * 全數純函式驗證：僅需 `new DataSource({type,entities:[]})` 建構出 driver 物件（不 `.initialize()`），
 * 呼叫 `driver.escapeQueryWithParameters`（純字串轉換）。CI 恆常執行、不連任何資料庫、訊號最快。
 *
 * 對應測試設計 AD-E07-38-P1c-test.md §一 TS-MSSQL-P1C-ESCAPE-001~005。
 */
import { describe, it, expect } from 'vitest';
import { DataSource } from 'typeorm';

function driverOf(type: 'postgres' | 'better-sqlite3' | 'mssql') {
  const opts =
    type === 'better-sqlite3'
      ? ({ type, database: ':memory:', entities: [] } as const)
      : ({
          type,
          host: 'localhost',
          port: type === 'mssql' ? 1433 : 5432,
          username: 'x',
          password: 'x',
          database: 'x',
          entities: [],
        } as const);
  // 建構即建立 driver 物件；escapeQueryWithParameters 為純字串轉換，不需 initialize()。
  return new DataSource(opts as never).driver;
}

describe('AD-E07-38 P1c ESCAPE — driver 具名參數展開', () => {
  // ESCAPE-001
  it('TS-MSSQL-P1C-ESCAPE-001：IN (:...arr) 於 mssql 展開為合法 @0,@1,@2', () => {
    const [sql, params] = driverOf('mssql').escapeQueryWithParameters(
      'SELECT * FROM t WHERE x IN (:...custoNos)',
      { custoNos: ['A', 'B', 'C'] },
      {},
    );
    expect(sql).toContain('IN (@0, @1, @2)');
    expect(params).toEqual(['A', 'B', 'C']);
  });

  // ESCAPE-002
  it('TS-MSSQL-P1C-ESCAPE-002：:runId 單一具名參數 → @0', () => {
    const [sql, params] = driverOf('mssql').escapeQueryWithParameters(
      'WHERE run_id = :runId',
      { runId: 'RUN001' },
      {},
    );
    expect(sql).toContain('run_id = @0');
    expect(params).toEqual(['RUN001']);
  });

  // ESCAPE-003（🔴 混合情境，決定性驗證 §0.2 稽核結論）
  it('TS-MSSQL-P1C-ESCAPE-003：:runId + :...emplIds 同字串依出現順序展開（@0 / @1,@2）', () => {
    const [sql, params] = driverOf('mssql').escapeQueryWithParameters(
      'WHERE r.run_id = :runId AND r.emplid IN (:...emplIds)',
      { runId: 'RUN001', emplIds: ['E1', 'E2'] },
      {},
    );
    // 依字串出現順序：runId 先 → @0；emplIds 後 → @1,@2
    expect(sql).toContain('run_id = @0 AND r.emplid IN (@1, @2)');
    expect(params).toEqual(['RUN001', 'E1', 'E2']);
    // PG 端對照（buildExportQuery 於 prod 走 PG）：$1 / $2,$3，證實與現行手動編號一致
    const [pgSql, pgParams] = driverOf('postgres').escapeQueryWithParameters(
      'WHERE r.run_id = :runId AND r.emplid IN (:...emplIds)',
      { runId: 'RUN001', emplIds: ['E1', 'E2'] },
      {},
    );
    expect(pgSql).toContain('run_id = $1 AND r.emplid IN ($2, $3)');
    expect(pgParams).toEqual(['RUN001', 'E1', 'E2']);
  });

  // ESCAPE-004（空陣列 IN () 陷阱 — 確認 buildExportQuery 之 1=0 guard 仍必要）
  it('TS-MSSQL-P1C-ESCAPE-004：空陣列 :...arr 展開為語法非法之 IN ()（故上游 guard 不可移除）', () => {
    for (const t of ['postgres', 'better-sqlite3', 'mssql'] as const) {
      const [sql, params] = driverOf(t).escapeQueryWithParameters(
        'x IN (:...emplIds)',
        { emplIds: [] },
        {},
      );
      // escapeQueryWithParameters 不自行防禦空陣列 → 產出 `IN ()`（多數 dialect 語法錯誤）。
      expect(sql).toContain('IN ()');
      expect(params).toEqual([]);
    }
  });

  // ESCAPE-005（三 driver 對照：語法合法且參數順序一致）
  it('TS-MSSQL-P1C-ESCAPE-005：同一 IN (:...arr) 於 pg/sqlite/mssql 佔位符不同但參數順序一致', () => {
    const named = 'a IN (:...arr)';
    const args = { arr: ['A', 'B', 'C'] };
    const [pg, pgP] = driverOf('postgres').escapeQueryWithParameters(named, args, {});
    const [lite, liteP] = driverOf('better-sqlite3').escapeQueryWithParameters(named, args, {});
    const [ms, msP] = driverOf('mssql').escapeQueryWithParameters(named, args, {});
    expect(pg).toContain('IN ($1, $2, $3)');
    expect(lite).toContain('IN (?, ?, ?)');
    expect(ms).toContain('IN (@0, @1, @2)');
    // 參數陣列元素順序完全一致（語意等價，僅佔位符文法不同）
    expect(pgP).toEqual(['A', 'B', 'C']);
    expect(liteP).toEqual(['A', 'B', 'C']);
    expect(msP).toEqual(['A', 'B', 'C']);
  });
});
