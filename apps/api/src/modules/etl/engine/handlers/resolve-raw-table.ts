/**
 * Shared utility: resolve raw_table_name from extractionRef/lookupRef
 * via extraction_tasks JOIN datasources query.
 *
 * Used by both ExtractHandler and LookupHandler.
 */

import { QueryRunner } from 'typeorm';

export interface ExtractionRef {
  datasourceName: string;
  sourceTable: string;
}

/**
 * Resolve a raw table name from an extraction reference.
 *
 * 1. If ref is provided, query extraction_tasks JOIN datasources
 * 2. If query succeeds, return the dynamic raw_table_name
 * 3. If query returns empty and fallback is provided, return fallback + console.warn
 * 4. If query returns empty and no fallback, throw Error
 * 5. If no ref, return fallback directly (backward compatible)
 */
export async function resolveRawTable(
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
  const result = await queryRunner.query(
    `SELECT et.raw_table_name FROM extraction_tasks et
JOIN datasources ds ON et.datasource_id = ds.id
WHERE ds.name = $1 AND et.source_table = $2
AND et.raw_table_name IS NOT NULL
ORDER BY et.last_execution_at DESC NULLS LAST LIMIT 1`,
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
