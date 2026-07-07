/**
 * AD-E07-41 P4c — `dedup-handler.ts` 之 MSSQL 平行版（PG 原檔逐位元組不動）。
 *
 * PG 核心（§4.1）：
 *   `CREATE TEMP TABLE "..." AS SELECT DISTINCT ON (key) * FROM input
 *      ORDER BY key, timestamp DESC NULLS LAST, ctid ASC`
 *   —— `ctid`（實體列位置）是「資料寫入暫存表的物理順序」副產品，扮演同 key 同 timestamp 時的決勝鍵。
 *
 * MSSQL 改寫（§4.2，I-MSSQL-DEDUP-TIEBREAK-01）：T-SQL 無 `DISTINCT ON`、無 `ctid`，改兩步：
 *   1. `SELECT IDENTITY(INT,1,1) AS _seq, * INTO ##raw_<x> FROM <input>`
 *      —— `_seq` 以 `SELECT INTO` 專用 IDENTITY 語法捕捉「列寫入 ##raw 的順序」，等同 ctid 角色。
 *   2. `SELECT <origCols> INTO ##dedup_<x> FROM (
 *          SELECT <origCols>, ROW_NUMBER() OVER (
 *            PARTITION BY <key>
 *            ORDER BY "<ts>" DESC, CASE WHEN "<ts>" IS NULL THEN 1 ELSE 0 END, _seq ASC
 *          ) AS rn FROM ##raw_<x>
 *        ) x WHERE rn = 1`
 *      —— `ts DESC` MSSQL 本即把 NULL 排最後不需 CASE，但 §4.2 要求「不依賴引擎 NULL 預設順序」故仍以
 *         `CASE WHEN <ts> IS NULL THEN 1 ELSE 0 END` 顯式補「NULLS LAST」（比照 P4a RESOLVE-002 慣例）；
 *         `_seq ASC` 為決定性 tie-breaker。最終 SELECT 僅列原始欄位，排除 `_seq`/`rn` 使輸出欄位集合與
 *         PG `SELECT DISTINCT ON (...) *` 完全一致。
 *
 * ##raw_<x> 為中繼表，從未透過 `DataSet.tempTable` 對外暴露（NodeOutputStore.cleanupAll 不追蹤它），
 * 故以 `try/finally` 於成功/失敗兩路徑皆顯式 `dropMssqlTempTableIfExists`（I-MSSQL-TEMPTABLE-CLEANUP-01）；
 * ##dedup_<x>（回傳之 tempTable）則交由既有 NodeOutputStore 機制清理（與 P4a/P4b 其餘 handler 同型）。
 *
 * §4.3：`ctid`→`_seq` 為「忠實翻譯一個原本就無業務含義的隱性排序」，保證決定性選出恰一列，
 *   非保證與 PG 選出「同一實體列」（兩引擎查詢計畫可能不同）。
 */

import { NodeExecutor, NodeExecutionContext, DataSet, makeTempTableName, emptyDataSet } from '../types';
import {
  createMssqlTempTable,
  getMssqlTempTableColumns,
  countMssqlTempTableRows,
  dropMssqlTempTableIfExists,
} from './mssql/temp-table.util';

export class DedupHandlerMssql implements NodeExecutor {
  readonly nodeType = 'dedup';

  async execute(context: NodeExecutionContext): Promise<DataSet> {
    const input = context.inputs['default'];
    if (!input || input.rowCount === 0) {
      return emptyDataSet();
    }

    const keyColumns = context.node.data.keyColumns as string[];
    const timestampColumn = context.node.data.timestampColumn as string;
    const inputTable = input.tempTable;

    // Validate key/timestamp columns exist（## 暫存表 → tempdb.sys.columns，非 information_schema）
    const columns = await this.getColumns(context, inputTable);
    for (const col of keyColumns) {
      if (!columns.includes(col)) {
        throw new Error(`Dedup 節點 key 欄位 ${col} 不存在於資料集中`);
      }
    }
    if (!columns.includes(timestampColumn)) {
      throw new Error(`Dedup 節點時間戳欄位 ${timestampColumn} 不存在於資料集中`);
    }

    const baseName = makeTempTableName(context.node.id, context.logId);
    const rawTable = `##raw_${baseName}`;
    const tempTable = `##${baseName}`;
    const keyColsSql = keyColumns.map((c) => `"${c}"`).join(', ');
    const origColsSql = columns.map((c) => `"${c}"`).join(', ');

    try {
      // 1) 捕捉抽取序：IDENTITY(INT,1,1) AS _seq（等同 PG ctid 決勝角色）
      await createMssqlTempTable(
        context.queryRunner,
        rawTable,
        `SELECT IDENTITY(INT,1,1) AS _seq, * FROM "${inputTable}"`,
      );

      // 2) ROW_NUMBER 決勝：ts DESC → NULLS LAST（CASE 顯式）→ _seq ASC tie-breaker；最終僅列原始欄位
      await createMssqlTempTable(
        context.queryRunner,
        tempTable,
        `SELECT ${origColsSql} FROM (` +
          `SELECT ${origColsSql}, ROW_NUMBER() OVER (` +
          `PARTITION BY ${keyColsSql} ` +
          `ORDER BY "${timestampColumn}" DESC, CASE WHEN "${timestampColumn}" IS NULL THEN 1 ELSE 0 END, _seq ASC` +
          `) AS rn FROM "${rawTable}"` +
          `) x WHERE rn = 1`,
      );
    } finally {
      // ##raw 中繼表未透過 DataSet 對外暴露 → 自行清理（成功/失敗兩路徑）
      await dropMssqlTempTableIfExists(context.queryRunner, rawTable);
    }

    const rowCount = await countMssqlTempTableRows(context.queryRunner, tempTable);

    return { tempTable, rowCount };
  }

  private async getColumns(context: NodeExecutionContext, tableName: string): Promise<string[]> {
    const cols = await getMssqlTempTableColumns(context.queryRunner, tableName);
    return cols.map((c) => c.name);
  }
}
