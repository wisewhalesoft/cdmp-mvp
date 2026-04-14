/**
 * F043: MergeExecutor
 * CREATE TEMP TABLE AS SELECT ... FROM left FULL OUTER JOIN right ON ...
 * In-DB SQL Strategy: SQL FULL OUTER JOIN，零記憶體佔用
 */

import { NodeExecutor, NodeExecutionContext, DataSet, makeTempTableName, emptyDataSet } from '../types';

export class MergeHandler implements NodeExecutor {
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

    // Get column lists from the temp tables
    const leftCols = await this.getColumns(context, leftTable);
    const rightCols = await this.getColumns(context, rightTable);

    // Validate key columns exist
    if (leftCols.length > 0 && !leftCols.includes(leftKey)) {
      throw new Error(`Merge 節點 JOIN key 欄位 ${leftKey} 不存在於左側資料集中`);
    }
    if (rightCols.length > 0 && !rightCols.includes(rightKey)) {
      throw new Error(`Merge 節點 JOIN key 欄位 ${rightKey} 不存在於右側資料集中`);
    }

    const tempTable = makeTempTableName(context.node.id, context.logId);

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

    const sql = `CREATE TEMP TABLE "${tempTable}" AS SELECT ${selectParts.join(', ')} FROM "${leftTable}" l FULL OUTER JOIN "${rightTable}" r ON l."${leftKey}" = r."${rightKey}"`;

    await context.queryRunner.query(sql);

    const countResult = await context.queryRunner.query(
      `SELECT COUNT(*)::int AS cnt FROM "${tempTable}"`,
    );
    const rowCount = countResult[0]?.cnt ?? 0;

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
    const result = await context.queryRunner.query(
      `SELECT column_name FROM information_schema.columns WHERE table_name = $1 ORDER BY ordinal_position`,
      [tableName],
    );
    return result.map((r: any) => r.column_name);
  }
}
