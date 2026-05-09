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
    // ETL tracking cols 只在 target 端真的有時才追加
    // - customer_core: _etl_loaded_at / _etl_pipeline_id
    // - OB 通用表（ob_pool_data / ob_arreturndf_min_cap）: _cdmp_extracted_at（NOT NULL）
    //   field_mapping dropUnmapped:true 會把 raw 端 _cdmp_extracted_at 丟掉，
    //   handler 在 target 有此欄但 input 不帶時補 NOW() 載入時刻
    const etlTrackingCols: string[] = [];
    if (targetColumns.has('_etl_loaded_at')) etlTrackingCols.push('_etl_loaded_at');
    if (targetColumns.has('_etl_pipeline_id')) etlTrackingCols.push('_etl_pipeline_id');
    const fillCdmpExtractedAt =
      targetColumns.has('_cdmp_extracted_at') && !matchedInputColumns.includes('_cdmp_extracted_at');
    if (fillCdmpExtractedAt) etlTrackingCols.push('_cdmp_extracted_at');
    const allColumns = [...matchedInputColumns, ...etlTrackingCols];

    // BUG-2 fix: Get column types from INPUT temp table for NULLIF(TRIM) normalization
    // Use input table types (not target table) because temp table types reflect actual data
    const inputColumnTypes = await context.queryRunner.query(
      `SELECT column_name, data_type FROM information_schema.columns WHERE table_name = $1 ORDER BY ordinal_position`,
      [inputTable],
    );
    const varcharColumns = new Set(
      inputColumnTypes
        .filter((r: any) => ['character varying', 'text', 'character'].includes(r.data_type))
        .map((r: any) => r.column_name),
    );

    // BUG-2 fix: Apply NULLIF(TRIM(col), '') for VARCHAR columns in enriched temp table
    const selectParts = matchedInputColumns.map((c) => {
      if (varcharColumns.has(c)) {
        return `NULLIF(TRIM("${c}"), '') AS "${c}"`;
      }
      return `"${c}"`;
    });
    if (targetColumns.has('_etl_loaded_at')) {
      selectParts.push(`'${etlLoadedAt}'::TIMESTAMP AS "_etl_loaded_at"`);
    }
    if (targetColumns.has('_etl_pipeline_id')) {
      selectParts.push(`'${etlPipelineId}'::UUID AS "_etl_pipeline_id"`);
    }
    if (fillCdmpExtractedAt) {
      selectParts.push(`'${etlLoadedAt}'::TIMESTAMP AS "_cdmp_extracted_at"`);
    }

    // Create enriched temp table
    await context.queryRunner.query(
      `CREATE TEMP TABLE "${tempTable}" AS SELECT ${selectParts.join(', ')} FROM "${inputTable}"`,
    );

    const columnList = allColumns.map((c) => `"${c}"`).join(', ');

    // Determine write mode
    const fullMode = context.node.data.fullMode === true;

    const batchSize = 5000;
    let totalUpserted = 0;

    if (fullMode) {
      // fullMode: 通用全量替換路徑（TRUNCATE + batch INSERT）
      // 跳過 customer_core 專屬的 ghost record gate 與 source_customer_no dedup，
      // 適用於 ob_pool_data / ob_emphire / ob_calendar 等通用目標表（AD-E07-12）
      try {
        await context.queryRunner.query(`TRUNCATE TABLE "${targetTable}"`);
      } catch (err: any) {
        throw new Error(`fullMode TRUNCATE 失敗：${err.message}`);
      }

      const totalRows = input.rowCount;
      for (let offset = 0; offset < totalRows; offset += batchSize) {
        const selectSql = `SELECT ${columnList} FROM "${tempTable}" LIMIT ${batchSize} OFFSET ${offset}`;
        const insertSql = `INSERT INTO "${targetTable}" (${columnList}) ${selectSql}`;

        try {
          await context.queryRunner.query(insertSql);
          totalUpserted += Math.min(batchSize, totalRows - offset);
        } catch (err: any) {
          throw new Error(
            `fullMode INSERT 批次失敗（offset: ${offset}，已成功寫入: ${totalUpserted}）：${err.message}`,
          );
        }
      }

      await context.queryRunner.query(`DROP TABLE IF EXISTS "${tempTable}"`);
      return { tempTable: '', rowCount: totalUpserted };
    }

    // === 以下為 customer_core 專屬 UPSERT 路徑 (!fullMode) ===

    // Columns to exclude from UPDATE (customer_core 主鍵)
    const excludeFromUpdate = new Set(['customer_id', 'source_customer_no']);

    const updateCols = allColumns
      .filter((col) => !excludeFromUpdate.has(col))
      .map((col) => `"${col}" = EXCLUDED."${col}"`)
      .join(', ');

    // BUG-2 fix: Data quality gate
    // 1. Ghost record filter: source_customer_no length >= 5
    // 2. NOT NULL business key filter: skip rows where DB NOT NULL columns are null
    //    (these would fail on INSERT anyway; filtering here avoids batch-level failures)
    const notNullTargetCols = await context.queryRunner.query(
      `SELECT column_name FROM information_schema.columns
       WHERE table_name = $1 AND is_nullable = 'NO'
       AND column_name NOT IN ('customer_id', '_etl_loaded_at', '_etl_pipeline_id', 'data_source')`,
      [targetTable],
    );
    const notNullChecks = notNullTargetCols
      .filter((r: any) => allColumns.includes(r.column_name))
      .map((r: any) => `"${r.column_name}" IS NOT NULL`);

    const ghostGate = [
      `LENGTH(TRIM("source_customer_no")) >= 5`,
      ...notNullChecks,
    ].join(' AND ');

    // Count valid rows (after data quality gate filtering + post-normalization dedup)
    // DISTINCT ON handles collisions caused by NULLIF(TRIM()) normalization
    // (e.g., "A12345 " and "A12345" become the same after TRIM)
    const validCountSql = `SELECT COUNT(*)::int AS cnt FROM (SELECT DISTINCT ON ("source_customer_no") * FROM "${tempTable}" WHERE ${ghostGate} ORDER BY "source_customer_no") _dq`;
    const validCountResult = await context.queryRunner.query(validCountSql);
    const validCount = validCountResult[0]?.cnt ?? 0;

    // Create a deduped temp table for batched UPSERT (avoids "cannot affect row a second time")
    const dedupTable = `${tempTable}_dq`;
    await context.queryRunner.query(
      `CREATE TEMP TABLE "${dedupTable}" AS SELECT DISTINCT ON ("source_customer_no") ${columnList} FROM "${tempTable}" WHERE ${ghostGate} ORDER BY "source_customer_no"`,
    );

    // UPSERT mode: batch INSERT ON CONFLICT
    for (let offset = 0; offset < validCount; offset += batchSize) {
      const selectSql = `SELECT ${columnList} FROM "${dedupTable}" LIMIT ${batchSize} OFFSET ${offset}`;
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

    // Drop temp tables
    await context.queryRunner.query(`DROP TABLE IF EXISTS "${dedupTable}"`);
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
