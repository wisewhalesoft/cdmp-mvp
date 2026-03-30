/**
 * F043: DedupExecutor
 * CREATE TEMP TABLE AS SELECT DISTINCT ON (key) * FROM input ORDER BY key, timestamp DESC
 * In-DB SQL Strategy: SQL DISTINCT ON，零記憶體佔用
 */

import { NodeExecutor, NodeExecutionContext, DataSet, makeTempTableName, emptyDataSet } from '../types';

export class DedupHandler implements NodeExecutor {
  readonly nodeType = 'dedup';

  async execute(context: NodeExecutionContext): Promise<DataSet> {
    const input = context.inputs['default'];
    if (!input || input.rowCount === 0) {
      return emptyDataSet();
    }

    const keyColumns = context.node.data.keyColumns as string[];
    const timestampColumn = context.node.data.timestampColumn as string;
    const inputTable = input.tempTable;

    // Validate key columns exist
    const columns = await this.getColumns(context, inputTable);
    for (const col of keyColumns) {
      if (!columns.includes(col)) {
        throw new Error(`Dedup 節點 key 欄位 ${col} 不存在於資料集中`);
      }
    }
    if (!columns.includes(timestampColumn)) {
      throw new Error(`Dedup 節點時間戳欄位 ${timestampColumn} 不存在於資料集中`);
    }

    const tempTable = makeTempTableName(context.node.id, context.logId);
    const keyColsSql = keyColumns.map((c) => `"${c}"`).join(', ');

    // DISTINCT ON with ORDER BY: keep latest timestamp, then first row by ctid for tie-breaking
    const sql = `CREATE TEMP TABLE "${tempTable}" AS SELECT DISTINCT ON (${keyColsSql}) * FROM "${inputTable}" ORDER BY ${keyColsSql}, "${timestampColumn}" DESC NULLS LAST, ctid ASC`;

    await context.queryRunner.query(sql);

    const countResult = await context.queryRunner.query(
      `SELECT COUNT(*)::int AS cnt FROM "${tempTable}"`,
    );
    const rowCount = countResult[0]?.cnt ?? 0;

    return { tempTable, rowCount };
  }

  private async getColumns(context: NodeExecutionContext, tableName: string): Promise<string[]> {
    const result = await context.queryRunner.query(
      `SELECT column_name FROM information_schema.columns WHERE table_name = $1 ORDER BY ordinal_position`,
      [tableName],
    );
    return result.map((r: any) => r.column_name);
  }
}
