/**
 * AD-E07-41 P4c — `target-load-handler.ts` 之 MSSQL 平行版（PG 原檔逐位元組不動）。
 *
 * 同一 handler 服務 6 條 pipeline（查證發現 2）：
 *   - customer_core UPSERT（`fullMode:false`）——§5.1 兩段式 `UPDATE...FROM` + `INSERT...WHERE NOT EXISTS`；
 *   - fullMode 全量替換 ×4（ob_arreturndf_min_cap / ob_calendar / ob_emphire / ob_pool_data）——TRUNCATE + INSERT；
 *   - partition_replace ×1（ob_pool_data_list）——DELETE WHERE partition + INSERT 標記 partitionValue。
 *
 * 方言轉換要點：
 *   - `ON CONFLICT ... DO UPDATE SET ... EXCLUDED.col` → 兩段式（§5.1）：`EXCLUDED.col` 無對應虛擬表，
 *     改直接引用 JOIN 來源別名 `src."col"`（UPSERT-UNIT-003）。
 *   - 內部 2 處 `DISTINCT ON`（fullMode PK 去重、UPSERT source_customer_no 去重，查證發現 1）→ 與 §一 DEDUP
 *     相同的 `IDENTITY(INT,1,1) AS _seq` + `ROW_NUMBER() OVER(... ORDER BY _seq ASC)` 決定性 tie-breaker
 *     （I-MSSQL-DEDUP-TIEBREAK-01 之設計精神；PG 兩處 `ORDER BY` 僅含 key，翻譯若沿用會 non-deterministic）。
 *   - `LENGTH(TRIM(...))` → `LEN(TRIM(...))`；`NULLIF(TRIM(col), '')` ANSI 相容不改；
 *   - `'${lit}'::TIMESTAMP`/`::UUID` 為系統產生字面值（型別已知必然合法）→ `CAST(... AS datetime2)`/
 *     `CAST(... AS uniqueidentifier)`（§5.3，非 `TRY_CAST`；datetime2 需去掉 ISO 'Z' 後綴，見 probe）；
 *   - `$n` → 具名 `@n`（Pattern B）；catalog 視圖大寫 `INFORMATION_SCHEMA.*`（I-MSSQL-CATALOG-CASE-01）；
 *   - `##` 輸入暫存表欄位內省用 `getMssqlTempTableColumns`（tempdb.sys.columns）；真實 `dbo` target 表用
 *     `INFORMATION_SCHEMA.COLUMNS`（查證發現 4，兩路徑不可混用）。
 *
 * 清理（查證發現 6，CLEANUP-GATE-001）：本 handler 回傳 `{ tempTable: '', rowCount }`，其內部 enriched
 *   `tempTable` 與 `dedupTable` 從未透過 `DataSet` 向 `NodeOutputStore` 註冊，`NodeOutputStore.cleanupAll()`
 *   天生不清理它們。故本 handler 以獨立 `try/finally` 於成功/失敗兩路徑皆顯式 `dropMssqlTempTableIfExists`
 *   ——此為 P4a/P4b 其餘 8 個 handler（皆交 NodeOutputStore 統一收斂）之唯一例外。
 */

import { NodeExecutor, NodeExecutionContext, DataSet, makeTempTableName, emptyDataSet } from '../types';
import {
  createMssqlTempTable,
  getMssqlTempTableColumns,
  countMssqlTempTableRows,
  dropMssqlTempTableIfExists,
} from './mssql/temp-table.util';

/** SQL Server 字串型別集合（供 `NULLIF(TRIM())` 正規化判斷；對照 PG `character varying`/`text`/`character`）。 */
const MSSQL_VARCHAR_TYPES = new Set(['varchar', 'nvarchar', 'char', 'nchar', 'text', 'ntext']);

export class TargetLoadHandlerMssql implements NodeExecutor {
  readonly nodeType = 'target_load';

  async execute(context: NodeExecutionContext): Promise<DataSet> {
    const input = context.inputs['default'];
    if (!input || input.rowCount === 0) {
      return emptyDataSet();
    }

    const targetTable = context.node.data.targetTable as string;

    // Validate target table exists — 真實 dbo 表，大寫 INFORMATION_SCHEMA.TABLES + 具名參數
    const tableCheck = await context.queryRunner.query(
      `SELECT table_name FROM INFORMATION_SCHEMA.TABLES WHERE table_name = @0`,
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
    const tempTable = '##' + makeTempTableName(context.node.id, context.logId);

    // Prepare ETL tracking fields
    const etlLoadedAt = new Date().toISOString();
    const etlPipelineId = context.pipelineId;
    // datetime2 CAST 不吃 ISO8601 的 'Z'（UTC designator）後綴 → 去除（見 probe 佐證）
    const etlLoadedAtLit = etlLoadedAt.replace('Z', '').replace(/'/g, "''");
    const etlPipelineIdLit = etlPipelineId.replace(/'/g, "''");

    // 輸入欄位（含型別）：## 暫存表 → tempdb.sys.columns（I-MSSQL-TEMP-METADATA-01）
    const inputColMeta = await getMssqlTempTableColumns(context.queryRunner, inputTable);
    const inputColumns = inputColMeta.map((c) => c.name);
    // 目標欄位：真實 dbo 表 → INFORMATION_SCHEMA.COLUMNS（大寫，查證發現 4）
    const targetColumns = new Set(await this.getRealTableColumns(context, targetTable));

    // Only include columns that exist in BOTH input and target (plus ETL tracking)
    const HANDLER_OWNED_COLS = new Set(['_etl_loaded_at', '_etl_pipeline_id']);
    const matchedInputColumns = inputColumns.filter(
      (c) => targetColumns.has(c) && !HANDLER_OWNED_COLS.has(c),
    );
    const etlTrackingCols: string[] = [];
    if (targetColumns.has('_etl_loaded_at')) etlTrackingCols.push('_etl_loaded_at');
    if (targetColumns.has('_etl_pipeline_id')) etlTrackingCols.push('_etl_pipeline_id');
    const fillCdmpExtractedAt =
      targetColumns.has('_cdmp_extracted_at') && !matchedInputColumns.includes('_cdmp_extracted_at');
    if (fillCdmpExtractedAt) etlTrackingCols.push('_cdmp_extracted_at');
    const allColumns = [...matchedInputColumns, ...etlTrackingCols];

    // VARCHAR 欄位（供 NULLIF(TRIM)）— 由 ## 輸入暫存表型別判斷（tempdb.sys.columns 之 dataType）
    const varcharColumns = new Set(
      inputColMeta
        .filter((c) => MSSQL_VARCHAR_TYPES.has((c.dataType || '').toLowerCase()))
        .map((c) => c.name),
    );

    // Enriched temp table：VARCHAR 套 NULLIF(TRIM())；系統字面值 CAST（非 TRY_CAST）
    const selectParts = matchedInputColumns.map((c) =>
      varcharColumns.has(c) ? `NULLIF(TRIM("${c}"), '') AS "${c}"` : `"${c}"`,
    );
    if (targetColumns.has('_etl_loaded_at')) {
      selectParts.push(`CAST('${etlLoadedAtLit}' AS datetime2) AS "_etl_loaded_at"`);
    }
    if (targetColumns.has('_etl_pipeline_id')) {
      selectParts.push(`CAST('${etlPipelineIdLit}' AS uniqueidentifier) AS "_etl_pipeline_id"`);
    }
    if (fillCdmpExtractedAt) {
      selectParts.push(`CAST('${etlLoadedAtLit}' AS datetime2) AS "_cdmp_extracted_at"`);
    }

    const columnList = allColumns.map((c) => `"${c}"`).join(', ');

    const fullMode = context.node.data.fullMode === true;
    const loadMode = context.node.data.loadMode as string | undefined;

    // dedupTable 於 fullMode/UPSERT 兩路徑內部建立；宣告於此供 finally 統一清理（CLEANUP-GATE-001）
    let dedupTable = '';

    try {
      await createMssqlTempTable(
        context.queryRunner,
        tempTable,
        `SELECT ${selectParts.join(', ')} FROM "${inputTable}"`,
      );

      // === partition_replace（ob_pool_data_list）：無 DISTINCT ON / tie-breaker ===
      if (loadMode === 'partition_replace') {
        const partitionColumn = context.node.data.partitionColumn as string;
        const partitionValue = context.node.data.partitionValue as string;

        if (!partitionColumn || partitionValue === undefined || partitionValue === null) {
          throw new Error(
            `partition_replace 模式需設定 partitionColumn 與 partitionValue（node.data）`,
          );
        }

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

        // 2. 單條 INSERT…SELECT，每列填 partitionValue
        const selectColsForInsert = insertColumns.map((c) => `"${c}"`).join(', ');
        const selectSql = `SELECT ${selectColsForInsert}, '${escapedPartitionValue}' AS "${partitionColumn}" FROM "${tempTable}"`;
        const insertSql = `INSERT INTO "${targetTable}" (${insertColumnList}) ${selectSql}`;

        try {
          await context.queryRunner.query(insertSql);
        } catch (err: any) {
          throw new Error(`partition_replace INSERT 失敗：${err.message}`);
        }

        return { tempTable: '', rowCount: input.rowCount };
      }

      // === fullMode（ob_pool_data / ob_emphire / ob_calendar / ob_arreturndf_min_cap）===
      if (fullMode) {
        // 防禦性 PK 去重：來源端 schema 未必有 PK/unique constraint，可能挾帶重複 row。
        // 若 target 端有 PK，同批 INSERT 內部撞 PK 會拋 unique violation → TRUNCATE 前先去重。
        const pkColumns = await this.getPrimaryKeyColumns(context, targetTable);
        let insertSourceTable = tempTable;
        let totalRows = input.rowCount;

        if (pkColumns.length > 0) {
          dedupTable = `${tempTable}_dq`;
          await this.buildDeterministicDedupTable(
            context,
            tempTable,
            dedupTable,
            pkColumns.map((c) => `"${c}"`),
            columnList,
          );
          totalRows = await countMssqlTempTableRows(context.queryRunner, dedupTable);
          insertSourceTable = dedupTable;
        }

        try {
          await context.queryRunner.query(`TRUNCATE TABLE "${targetTable}"`);
        } catch (err: any) {
          throw new Error(`fullMode TRUNCATE 失敗：${err.message}`);
        }

        const insertSql = `INSERT INTO "${targetTable}" (${columnList}) SELECT ${columnList} FROM "${insertSourceTable}"`;
        try {
          await context.queryRunner.query(insertSql);
        } catch (err: any) {
          throw new Error(`fullMode INSERT 失敗：${err.message}`);
        }

        return { tempTable: '', rowCount: totalRows };
      }

      // === customer_core 專屬 UPSERT 路徑（兩段式 UPDATE + INSERT WHERE NOT EXISTS，§5.1）===

      const excludeFromUpdate = new Set(['customer_id', 'source_customer_no']);
      const updateCols = allColumns
        .filter((col) => !excludeFromUpdate.has(col))
        .map((col) => `"${col}" = src."${col}"`)
        .join(', ');

      // 必填欄守門：target 端 NOT NULL 業務欄若為 null，整列排除（避免整批 INSERT rollback）。
      // 真實 dbo 表 → 大寫 INFORMATION_SCHEMA.COLUMNS + IS_NULLABLE + 具名參數。
      const notNullTargetCols = await context.queryRunner.query(
        `SELECT column_name FROM INFORMATION_SCHEMA.COLUMNS
          WHERE table_name = @0 AND is_nullable = 'NO'
            AND column_name NOT IN ('customer_id', '_etl_loaded_at', '_etl_pipeline_id', 'data_source')`,
        [targetTable],
      );
      const notNullChecks = notNullTargetCols
        .filter((r: any) => allColumns.includes(r.column_name))
        .map((r: any) => `src."${r.column_name}" IS NOT NULL`);
      // ghost gate：src 別名限定（UPDATE/INSERT 皆以 ##dedup src 為來源，避免 JOIN 兩表同名欄位歧義）
      const ghostGate = [
        `LEN(TRIM(src."source_customer_no")) >= 5`,
        ...notNullChecks,
      ].join(' AND ');

      // source_customer_no 去重（含 TRIM 正規化碰撞，查證發現 1）+ 決定性 _seq tie-breaker
      dedupTable = `${tempTable}_dq`;
      await this.buildDeterministicDedupTable(
        context,
        tempTable,
        dedupTable,
        ['"source_customer_no"'],
        columnList,
      );

      const validCountResult = await context.queryRunner.query(
        `SELECT COUNT(*) AS cnt FROM "${dedupTable}" src WHERE ${ghostGate}`,
      );
      const validCount = Number(validCountResult[0]?.cnt ?? 0);

      // 1) UPDATE 既有列（EXCLUDED.col → src.col；target 併入 FROM）
      const updateSql =
        `UPDATE tgt SET ${updateCols} ` +
        `FROM "${targetTable}" tgt ` +
        `JOIN "${dedupTable}" src ON tgt."source_customer_no" = src."source_customer_no" ` +
        `WHERE ${ghostGate}`;
      // 2) INSERT 新列（WHERE NOT EXISTS）
      const insertSql =
        `INSERT INTO "${targetTable}" (${columnList}) ` +
        `SELECT ${columnList} FROM "${dedupTable}" src ` +
        `WHERE ${ghostGate} ` +
        `AND NOT EXISTS (SELECT 1 FROM "${targetTable}" tgt WHERE tgt."source_customer_no" = src."source_customer_no")`;

      try {
        await context.queryRunner.query(updateSql);
        await context.queryRunner.query(insertSql);
      } catch (err: any) {
        throw new Error(`UPSERT 失敗：${err.message}`);
      }

      return { tempTable: '', rowCount: validCount };
    } finally {
      // 內部暫存表清理（成功/失敗兩路徑）——不依賴 NodeOutputStore.cleanupAll（CLEANUP-GATE-001）
      await dropMssqlTempTableIfExists(context.queryRunner, tempTable);
      if (dedupTable) {
        await dropMssqlTempTableIfExists(context.queryRunner, dedupTable);
      }
    }
  }

  /**
   * 決定性去重（§一 DEDUP 之 `_seq` 手法一致，I-MSSQL-DEDUP-TIEBREAK-01 精神；TLDEDUP-GATE-001）。
   *
   * 兩處 `DISTINCT ON`（fullMode PK 去重、UPSERT source_customer_no 去重）共用本 helper：
   *   1. `SELECT IDENTITY(INT,1,1) AS _seq, <cols> INTO ##<dest>_seq FROM <source>`（捕捉寫入序）；
   *   2. `SELECT <cols> INTO ##<dest> FROM (SELECT <cols>, ROW_NUMBER() OVER(
   *         PARTITION BY <keys> ORDER BY _seq ASC) AS rn FROM ##<dest>_seq) x WHERE rn = 1`。
   * `_seq ASC` 為決定性 tie-breaker（PG 原 `ORDER BY <key>` 對 ties 屬查詢計畫相依行為）。
   * 中繼 `##<dest>_seq` 於本 helper 內 `try/finally` 自行清理。
   */
  private async buildDeterministicDedupTable(
    context: NodeExecutionContext,
    sourceTable: string,
    destTable: string,
    keyColsQuoted: string[],
    selectColList: string,
  ): Promise<void> {
    const rawTable = `${destTable}_seq`;
    const partitionBy = keyColsQuoted.join(', ');
    try {
      await createMssqlTempTable(
        context.queryRunner,
        rawTable,
        `SELECT IDENTITY(INT,1,1) AS _seq, ${selectColList} FROM "${sourceTable}"`,
      );
      await createMssqlTempTable(
        context.queryRunner,
        destTable,
        `SELECT ${selectColList} FROM (` +
          `SELECT ${selectColList}, ROW_NUMBER() OVER (` +
          `PARTITION BY ${partitionBy} ORDER BY _seq ASC` +
          `) AS rn FROM "${rawTable}"` +
          `) x WHERE rn = 1`,
      );
    } finally {
      await dropMssqlTempTableIfExists(context.queryRunner, rawTable);
    }
  }

  /** 真實 dbo target 表欄位（大寫 INFORMATION_SCHEMA.COLUMNS + 具名參數，查證發現 4）。 */
  private async getRealTableColumns(
    context: NodeExecutionContext,
    tableName: string,
  ): Promise<string[]> {
    const result = await context.queryRunner.query(
      `SELECT column_name FROM INFORMATION_SCHEMA.COLUMNS WHERE table_name = @0 ORDER BY ordinal_position`,
      [tableName],
    );
    return result.map((r: any) => r.column_name);
  }

  /** PK 欄位（含 composite，依 ordinal_position 排序）— 大寫 INFORMATION_SCHEMA + 具名參數（查證發現 3）。 */
  private async getPrimaryKeyColumns(
    context: NodeExecutionContext,
    tableName: string,
  ): Promise<string[]> {
    const result = await context.queryRunner.query(
      `SELECT kcu.column_name
         FROM INFORMATION_SCHEMA.TABLE_CONSTRAINTS tc
         JOIN INFORMATION_SCHEMA.KEY_COLUMN_USAGE kcu
           ON tc.constraint_name = kcu.constraint_name
          AND tc.table_schema = kcu.table_schema
        WHERE tc.table_name = @0
          AND tc.constraint_type = 'PRIMARY KEY'
        ORDER BY kcu.ordinal_position`,
      [tableName],
    );
    return result.map((r: any) => r.column_name);
  }
}
