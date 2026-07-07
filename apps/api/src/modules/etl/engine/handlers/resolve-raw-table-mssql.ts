/**
 * AD-E07-41 P4a — `resolve-raw-table.ts` 之 MSSQL 平行版（本文件查證發現 2）。
 *
 * 與 PG 版（`resolve-raw-table.ts`）行為等價，僅方言差異：
 *   - `$1`/`$2` 具名參數 → `@0`/`@1`（Pattern B，AD §5.2）
 *   - `LIMIT 1` → `TOP (1)`（AD §3.2 未列此檔；本輪選用 `TOP (1)`，見 impl log RESOLVE 段）
 *   - `ORDER BY et.last_execution_at DESC NULLS LAST` → 以 `CASE WHEN ... IS NULL THEN 1 ELSE 0 END`
 *     為主鍵補「NULL 最後」語意（MSSQL `ORDER BY` 無 `NULLS LAST` 語法；不依賴引擎 NULL 預設順序，
 *     顯式化以求 PG/MSSQL 跨引擎一致，I-MSSQL-ETL-EQ-01）。
 *
 * 供 `extract-handler-mssql.ts`（及未來 `lookup-handler-mssql.ts`，P4b）共用。
 */

import { QueryRunner } from 'typeorm';
import { ExtractionRef } from './resolve-raw-table';

export type { ExtractionRef } from './resolve-raw-table';

/**
 * 由 extractionRef/lookupRef 解析 raw table 名（MSSQL 版）。
 * 行為與 PG 版逐項對齊（含 fallback / throw / console.warn 分支）。
 */
export async function resolveRawTableMssql(
  queryRunner: QueryRunner,
  ref: ExtractionRef | undefined,
  fallbackTable: string | undefined,
  refFieldName: string, // 'extractionRef' or 'lookupRef' — for error/warning messages
): Promise<string> {
  // No ref → use fallback directly (backward compatible)
  if (!ref) {
    if (!fallbackTable) {
      throw new Error(`${refFieldName} 未設定且無靜態表名可用`);
    }
    return fallbackTable;
  }

  // Query extraction_tasks JOIN datasources
  //   NULLS LAST 改寫：CASE WHEN last_execution_at IS NULL THEN 1 ELSE 0 END 為主鍵（非 NULL 者優先），
  //   再以 last_execution_at DESC 於非 NULL 群組內取最新；TOP (1) 取代 LIMIT 1。
  const result = await queryRunner.query(
    `SELECT TOP (1) et.raw_table_name FROM extraction_tasks et
JOIN datasources ds ON et.datasource_id = ds.id
WHERE ds.name = @0 AND et.source_table = @1
AND et.raw_table_name IS NOT NULL
ORDER BY CASE WHEN et.last_execution_at IS NULL THEN 1 ELSE 0 END ASC, et.last_execution_at DESC`,
    [ref.datasourceName, ref.sourceTable],
  );

  if (result && result.length > 0 && result[0].raw_table_name) {
    return result[0].raw_table_name;
  }

  // Ref query returned empty — try fallback
  if (fallbackTable) {
    console.warn(
      `${refFieldName} 解析失敗（datasourceName="${ref.datasourceName}", sourceTable="${ref.sourceTable}"），改用靜態表名 ${fallbackTable}`,
    );
    return fallbackTable;
  }

  // No fallback — throw
  throw new Error(
    `${refFieldName} 解析失敗且無靜態表名可 fallback（datasourceName="${ref.datasourceName}", sourceTable="${ref.sourceTable}"）— 無法取得 ${ref.datasourceName} / ${ref.sourceTable} 的 raw_table_name`,
  );
}
