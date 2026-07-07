/**
 * AD-E07-41 P4b — `merge-handler.ts` 之 MSSQL 平行版。
 *
 * PG 核心：`CREATE TEMP TABLE "..." AS SELECT ... FROM left FULL OUTER JOIN right ON ...`
 * MSSQL：
 *   - CTAS → `createMssqlTempTable`（`SELECT ... INTO ##... FROM ... FULL OUTER JOIN ...`）；
 *   - 上游 `##` 暫存表欄位內省改用 `getMssqlTempTableColumns`（非 `information_schema.columns`，
 *     I-MSSQL-TEMP-METADATA-01；本文件查證發現 6）；
 *   - 列數 `COUNT(*)::int` → `countMssqlTempTableRows`（T-SQL 無 `::int`）。
 *
 * 業務邏輯完全不變（AD §9 不變式）：`FULL OUTER JOIN` MSSQL 原生支援不需改；COALESCE / `_left`/`_right`
 * 衍生欄位 / `findUniqueAlias` 去重 / 鏈式 merge 跳過上游 `_left`/`_right` 欄位（BUG-1 修正）皆逐字保留。
 * 雙引號識別碼於 MSSQL（QUOTED_IDENTIFIER ON 預設）可用，見 P4a QUOTE-003 決策關卡結論。
 */

import { NodeExecutor, NodeExecutionContext, DataSet, makeTempTableName, emptyDataSet } from '../types';
import {
  createMssqlTempTable,
  getMssqlTempTableColumns,
  countMssqlTempTableRows,
} from './mssql/temp-table.util';

export class MergeHandlerMssql implements NodeExecutor {
  readonly nodeType = 'merge';

  async execute(context: NodeExecutionContext): Promise<DataSet> {
    const leftDs = context.inputs['left-input'];
    const rightDs = context.inputs['right-input'];

    if (!leftDs) throw new Error('Merge 節點缺少左側輸入（left-input）');
    if (!rightDs) throw new Error('Merge 節點缺少右側輸入（right-input）');

    if (leftDs.rowCount === 0 && rightDs.rowCount === 0) {
      return emptyDataSet();
    }

    const conditions = context.node.data.conditions as { leftColumn: string; rightColumn: string }[];
    const leftKey = conditions[0].leftColumn;
    const rightKey = conditions[0].rightColumn;
    const sameKeyName = leftKey === rightKey;

    const leftTable = leftDs.tempTable;
    const rightTable = rightDs.tempTable;

    // Get column lists from the temp tables（## 暫存表 → tempdb.sys.columns，非 information_schema）
    const leftCols = await this.getColumns(context, leftTable);
    const rightCols = await this.getColumns(context, rightTable);

    // Validate key columns exist
    if (leftCols.length > 0 && !leftCols.includes(leftKey)) {
      throw new Error(`Merge 節點 JOIN key 欄位 ${leftKey} 不存在於左側資料集中`);
    }
    if (rightCols.length > 0 && !rightCols.includes(rightKey)) {
      throw new Error(`Merge 節點 JOIN key 欄位 ${rightKey} 不存在於右側資料集中`);
    }

    const tempTable = '##' + makeTempTableName(context.node.id, context.logId);

    // Build SELECT clause
    const selectParts: string[] = [];
    const usedNames = new Set<string>();

    // JOIN key: COALESCE
    if (sameKeyName) {
      selectParts.push(`COALESCE(l."${leftKey}", r."${rightKey}") AS "${leftKey}"`);
      usedNames.add(leftKey);

      // BUG-1 fix: output _left and _right for same-name join key
      // Use unique alias if _left/_right already exists (e.g., chained merges like m2→m3)
      const leftAlias = this.findUniqueAlias(`${leftKey}_left`, usedNames);
      selectParts.push(`l."${leftKey}" AS "${leftAlias}"`);
      usedNames.add(leftAlias);

      const rightAlias = this.findUniqueAlias(`${rightKey}_right`, usedNames);
      selectParts.push(`r."${rightKey}" AS "${rightAlias}"`);
      usedNames.add(rightAlias);
    } else {
      selectParts.push(`l."${leftKey}"`);
      usedNames.add(leftKey);
    }

    // Left columns (excluding join key and its _left/_right variants from upstream merges)
    for (const col of leftCols) {
      if (col === leftKey) continue;
      // Skip upstream _left/_right key columns — they are already handled above or will conflict
      if (sameKeyName && (col === `${leftKey}_left` || col === `${leftKey}_right`)) continue;
      selectParts.push(`l."${col}"`);
      usedNames.add(col);
    }

    // Right columns (excluding join key if same name, deduplicate with suffix)
    for (const col of rightCols) {
      if (sameKeyName && col === rightKey) continue;
      // Skip upstream _left/_right key columns from right side too
      if (sameKeyName && (col === `${rightKey}_left` || col === `${rightKey}_right`)) continue;
      if (!usedNames.has(col)) {
        selectParts.push(`r."${col}"`);
        usedNames.add(col);
      } else {
        // Find a unique alias: col_right, col_right_2, col_right_3, ...
        const alias = this.findUniqueAlias(`${col}_right`, usedNames);
        selectParts.push(`r."${col}" AS "${alias}"`);
        usedNames.add(alias);
      }
    }

    await createMssqlTempTable(
      context.queryRunner,
      tempTable,
      `SELECT ${selectParts.join(', ')} FROM "${leftTable}" l FULL OUTER JOIN "${rightTable}" r ON l."${leftKey}" = r."${rightKey}"`,
    );

    const rowCount = await countMssqlTempTableRows(context.queryRunner, tempTable);

    return { tempTable, rowCount };
  }

  private findUniqueAlias(preferred: string, usedNames: Set<string>): string {
    if (!usedNames.has(preferred)) return preferred;
    let counter = 2;
    while (usedNames.has(`${preferred}_${counter}`)) counter++;
    return `${preferred}_${counter}`;
  }

  private async getColumns(context: NodeExecutionContext, tableName: string): Promise<string[]> {
    if (!tableName) return [];
    const cols = await getMssqlTempTableColumns(context.queryRunner, tableName);
    return cols.map((c) => c.name);
  }
}
