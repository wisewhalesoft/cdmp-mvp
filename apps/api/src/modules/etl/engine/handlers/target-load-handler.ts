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
    // _etl_loaded_at / _etl_pipeline_id 永遠由 handler 重新填值（即使 input 也有這欄
    // 也要 overwrite），故從 matchedInputColumns 排除避免後續組 SQL 出現 duplicate col
    const HANDLER_OWNED_COLS = new Set(['_etl_loaded_at', '_etl_pipeline_id']);
    const matchedInputColumns = inputColumns.filter(
      (c) => targetColumns.has(c) && !HANDLER_OWNED_COLS.has(c),
    );
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
    const loadMode = context.node.data.loadMode as string | undefined;

    const batchSize = 5000;
    let totalUpserted = 0;

    // === F090 / AD-E07-21 §21.3 + v2.0 AD-E07-25 §25.3：partition-replace load mode ===
    // 適用於 ob_pool_data_list：只替換某一分區（v2.0 partitionValue='etl_load'），
    // fullMode 仍為 false → 引擎層不 TRUNCATE 全表（BR-3，保留表結構/索引）。
    //   1. DELETE FROM target WHERE "<partitionColumn>" = '<partitionValue>'
    //   2. INSERT 並對每列填 partitionValue（SELECT 加 '<value>' AS "<col>"）
    // v2.0 單源化：ob_pool_data_list 為 ETL 單一來源，月跑提案改寫 ob_monthly_run_result（F094），
    // 本表不再混入月跑資料；partition DELETE（data_source='etl_load'）等效全量覆寫
    // （殘留 'monthly_run' / NULL 舊列由全量覆寫自然淘汰，DP-AD25-5）。
    // 歷史限定（ASSIGNDAY < 本月第一天，DP-AD21-1）由 extract 層 sourceFilter 處理，
    // 非本 handler；handler 只負責 per-partition 截斷與標記。
    if (loadMode === 'partition_replace') {
      const partitionColumn = context.node.data.partitionColumn as string;
      const partitionValue = context.node.data.partitionValue as string;

      if (!partitionColumn || partitionValue === undefined || partitionValue === null) {
        throw new Error(
          `partition_replace 模式需設定 partitionColumn 與 partitionValue（node.data）`,
        );
      }

      // partitionColumn 不應出現在來源映射欄位中（由 handler 填值，避免重複 col）
      const insertColumns = allColumns.filter((c) => c !== partitionColumn);
      const insertColumnList = [...insertColumns, partitionColumn]
        .map((c) => `"${c}"`)
        .join(', ');
      const escapedPartitionValue = partitionValue.replace(/'/g, "''");

      // 1. per-partition 截斷（只刪本分區，保護其他來源列）
      try {
        await context.queryRunner.query(
          `DELETE FROM "${targetTable}" WHERE "${partitionColumn}" = '${escapedPartitionValue}'`,
        );
      } catch (err: any) {
        throw new Error(
          `partition_replace DELETE 失敗（${partitionColumn}='${partitionValue}'）：${err.message}`,
        );
      }

      // 2. 批次 INSERT，每列填 partitionValue
      const selectColsForInsert = insertColumns.map((c) => `"${c}"`).join(', ');
      for (let offset = 0; offset < input.rowCount; offset += batchSize) {
        const selectSql = `SELECT ${selectColsForInsert}, '${escapedPartitionValue}' AS "${partitionColumn}" FROM "${tempTable}" LIMIT ${batchSize} OFFSET ${offset}`;
        const insertSql = `INSERT INTO "${targetTable}" (${insertColumnList}) ${selectSql}`;

        try {
          await context.queryRunner.query(insertSql);
          totalUpserted += Math.min(batchSize, input.rowCount - offset);
        } catch (err: any) {
          throw new Error(
            `partition_replace INSERT 批次失敗（offset: ${offset}，已成功寫入: ${totalUpserted}）：${err.message}`,
          );
        }
      }

      await context.queryRunner.query(`DROP TABLE IF EXISTS "${tempTable}"`);
      return { tempTable: '', rowCount: totalUpserted };
    }

    if (fullMode) {
      // fullMode: 通用全量替換路徑（TRUNCATE + batch INSERT）
      // 跳過 customer_core 專屬的 ghost record gate 與 source_customer_no dedup，
      // 適用於 ob_pool_data / ob_emphire / ob_calendar 等通用目標表（AD-E07-12）

      // 防禦性 PK 去重：來源端 SQL Server schema（如 dbo.OBEMPHIRE / dbo.OBCALENDAR）
      // 未必有 PK / unique constraint，可能挾帶重複 row 進 raw 表。若 target 端有 PK，
      // 同批 INSERT 內部撞 PK 會直接拋 unique violation，需在 TRUNCATE 前先用
      // DISTINCT ON (pk_cols) 去重。
      const pkColumns = await this.getPrimaryKeyColumns(context, targetTable);
      let insertSourceTable = tempTable;
      let totalRows = input.rowCount;

      if (pkColumns.length > 0) {
        const dedupTable = `${tempTable}_dq`;
        const pkColList = pkColumns.map((c) => `"${c}"`).join(', ');
        await context.queryRunner.query(
          `CREATE TEMP TABLE "${dedupTable}" AS SELECT DISTINCT ON (${pkColList}) ${columnList} FROM "${tempTable}" ORDER BY ${pkColList}`,
        );
        const dedupCountResult = await context.queryRunner.query(
          `SELECT COUNT(*)::int AS cnt FROM "${dedupTable}"`,
        );
        totalRows = dedupCountResult[0]?.cnt ?? 0;
        insertSourceTable = dedupTable;
      }

      try {
        await context.queryRunner.query(`TRUNCATE TABLE "${targetTable}"`);
      } catch (err: any) {
        throw new Error(`fullMode TRUNCATE 失敗：${err.message}`);
      }

      for (let offset = 0; offset < totalRows; offset += batchSize) {
        const selectSql = `SELECT ${columnList} FROM "${insertSourceTable}" LIMIT ${batchSize} OFFSET ${offset}`;
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

      if (insertSourceTable !== tempTable) {
        await context.queryRunner.query(`DROP TABLE IF EXISTS "${insertSourceTable}"`);
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

    // BUG-2 fix: Data quality gate — ghost record filter ONLY.
    // source_customer_no 經 TRIM 後長度 >= 5 才視為有效（過短為 ghost record，跳過）。
    // TS-F044-018：不再隱性過濾「target NOT NULL 欄位為 null」的列 —— 那會誤刪業務上
    // 合法的資料（例如 name=null 仍是有效客戶）；NOT NULL 約束交由 DB 於 INSERT 階段強制，
    // 而非在此靜默丟棄。
    const ghostGate = `LENGTH(TRIM("source_customer_no")) >= 5`;

    // Create a deduped temp table for batched UPSERT (avoids "cannot affect row a second time")
    // DISTINCT ON handles collisions caused by NULLIF(TRIM()) normalization
    // (e.g., "A12345 " and "A12345" become the same after TRIM)。ghost gate 僅依
    // source_customer_no（即 dedup 鍵），故 dedup 後再套 gate 與 gate 後再 dedup 等價。
    const dedupTable = `${tempTable}_dq`;
    await context.queryRunner.query(
      `CREATE TEMP TABLE "${dedupTable}" AS SELECT DISTINCT ON ("source_customer_no") ${columnList} FROM "${tempTable}" ORDER BY "source_customer_no"`,
    );

    // Count valid rows after ghost record gate
    const validCountResult = await context.queryRunner.query(
      `SELECT COUNT(*)::int AS cnt FROM "${dedupTable}" WHERE ${ghostGate}`,
    );
    const validCount = validCountResult[0]?.cnt ?? 0;

    // UPSERT mode: batch INSERT ON CONFLICT — ghost gate 套在 INSERT 的 SELECT WHERE（TS-F044-019）
    for (let offset = 0; offset < validCount; offset += batchSize) {
      const selectSql = `SELECT ${columnList} FROM "${dedupTable}" WHERE ${ghostGate} ORDER BY "source_customer_no" LIMIT ${batchSize} OFFSET ${offset}`;
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

  private async getPrimaryKeyColumns(
    context: NodeExecutionContext,
    tableName: string,
  ): Promise<string[]> {
    const result = await context.queryRunner.query(
      `SELECT kcu.column_name
         FROM information_schema.table_constraints tc
         JOIN information_schema.key_column_usage kcu
           ON tc.constraint_name = kcu.constraint_name
          AND tc.table_schema = kcu.table_schema
        WHERE tc.table_name = $1
          AND tc.constraint_type = 'PRIMARY KEY'
        ORDER BY kcu.ordinal_position`,
      [tableName],
    );
    return result.map((r: any) => r.column_name);
  }
}
