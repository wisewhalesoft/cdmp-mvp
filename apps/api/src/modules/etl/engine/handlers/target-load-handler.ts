/**
 * F044: TargetLoadExecutor
 * INSERT INTO customer_core SELECT * FROM temp_table ON CONFLICT ...
 * In-DB SQL Strategy: 直接從 temp table UPSERT，零記憶體佔用
 */

import { NodeExecutor, NodeExecutionContext, DataSet, makeTempTableName, emptyDataSet } from '../types';

const MAX_PARAMS_PER_QUERY = 65535;
const DEFAULT_BATCH_SIZE = 5000;

export function calculateBatchSize(columnsPerRow: number, configuredBatchSize: number = DEFAULT_BATCH_SIZE): number {
  const maxBatchSize = Math.floor(MAX_PARAMS_PER_QUERY / columnsPerRow);
  return Math.min(configuredBatchSize, maxBatchSize);
}

export class TargetLoadHandler implements NodeExecutor {
  readonly nodeType = 'target_load';

  async execute(context: NodeExecutionContext): Promise<DataSet> {
    const input = context.inputs['default'];
    if (!input || input.rowCount === 0) {
      return emptyDataSet();
    }

    const targetTable = context.node.data.targetTable as string;

    // Validate target table exists
    const tableCheck = await context.queryRunner.query(
      `SELECT table_name FROM information_schema.tables WHERE table_name = $1`,
      [targetTable],
    );

    if (!tableCheck || tableCheck.length === 0) {
      throw new Error(`目標表 ${targetTable} 不存在，請確認 migration 已執行`);
    }

    // Test run: skip actual writes
    if (context.isTestRun) {
      return { tempTable: '', rowCount: input.rowCount };
    }

    const inputTable = input.tempTable;
    const tempTable = makeTempTableName(context.node.id, context.logId);

    // Prepare ETL tracking fields: add _etl_loaded_at and _etl_pipeline_id to input temp table
    const etlLoadedAt = new Date().toISOString();
    const etlPipelineId = context.pipelineId;

    // Get input columns and target table columns
    const inputColumns = await this.getColumns(context, inputTable);
    const targetColumns = new Set(await this.getColumns(context, targetTable));

    // Only include columns that exist in BOTH input and target (plus ETL tracking)
    const matchedInputColumns = inputColumns.filter((c) => targetColumns.has(c));
    const allColumns = [...matchedInputColumns, '_etl_loaded_at', '_etl_pipeline_id'];
    const selectParts = matchedInputColumns.map((c) => `"${c}"`);
    selectParts.push(`'${etlLoadedAt}'::TIMESTAMP AS "_etl_loaded_at"`);
    selectParts.push(`'${etlPipelineId}'::UUID AS "_etl_pipeline_id"`);

    // Create enriched temp table
    await context.queryRunner.query(
      `CREATE TEMP TABLE "${tempTable}" AS SELECT ${selectParts.join(', ')} FROM "${inputTable}"`,
    );

    // Columns to exclude from UPDATE
    const excludeFromUpdate = new Set(['customer_id', 'source_customer_no']);

    const updateCols = allColumns
      .filter((col) => !excludeFromUpdate.has(col))
      .map((col) => `"${col}" = EXCLUDED."${col}"`)
      .join(', ');

    const columnList = allColumns.map((c) => `"${c}"`).join(', ');

    // Get NOT NULL columns from target table to filter invalid rows
    const notNullCols = await context.queryRunner.query(
      `SELECT column_name FROM information_schema.columns
       WHERE table_name = $1 AND is_nullable = 'NO'
       AND column_name NOT IN ('customer_id', '_etl_loaded_at', '_etl_pipeline_id')`,
      [targetTable],
    );
    const notNullFilter = notNullCols
      .map((r: any) => `"${r.column_name}" IS NOT NULL`)
      .join(' AND ');

    // Count valid rows
    const validCountSql = notNullFilter
      ? `SELECT COUNT(*)::int AS cnt FROM "${tempTable}" WHERE ${notNullFilter}`
      : `SELECT COUNT(*)::int AS cnt FROM "${tempTable}"`;
    const validCountResult = await context.queryRunner.query(validCountSql);
    const validCount = validCountResult[0]?.cnt ?? 0;

    // Batch UPSERT with OFFSET/LIMIT
    const batchSize = 5000;
    let totalUpserted = 0;

    for (let offset = 0; offset < validCount; offset += batchSize) {
      const selectSql = notNullFilter
        ? `SELECT ${columnList} FROM "${tempTable}" WHERE ${notNullFilter} LIMIT ${batchSize} OFFSET ${offset}`
        : `SELECT ${columnList} FROM "${tempTable}" LIMIT ${batchSize} OFFSET ${offset}`;

      const upsertSql = `INSERT INTO "${targetTable}" (${columnList}) ${selectSql} ON CONFLICT ("source_customer_no") DO UPDATE SET ${updateCols}`;

      try {
        await context.queryRunner.query(upsertSql);
        totalUpserted += Math.min(batchSize, validCount - offset);
      } catch (err: any) {
        throw new Error(
          `UPSERT 批次失敗（offset: ${offset}，已成功寫入: ${totalUpserted}）：${err.message}`,
        );
      }
    }

    // Drop the enriched temp table
    await context.queryRunner.query(`DROP TABLE IF EXISTS "${tempTable}"`);

    return { tempTable: '', rowCount: totalUpserted };
  }

  private async getColumns(context: NodeExecutionContext, tableName: string): Promise<string[]> {
    const result = await context.queryRunner.query(
      `SELECT column_name FROM information_schema.columns WHERE table_name = $1 ORDER BY ordinal_position`,
      [tableName],
    );
    return result.map((r: any) => r.column_name);
  }
}
