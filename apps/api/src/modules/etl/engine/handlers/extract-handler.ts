/**
 * F043: RawDataExtractExecutor
 * CREATE TEMP TABLE AS SELECT * FROM raw_xxx
 * In-DB SQL Strategy: 直接在 DB 中建立 temp table，零記憶體佔用
 */

import { NodeExecutor, NodeExecutionContext, DataSet, makeTempTableName } from '../types';
import { resolveRawTable, ExtractionRef } from './resolve-raw-table';

export class ExtractHandler implements NodeExecutor {
  readonly nodeType = 'raw_data_extract';

  async execute(context: NodeExecutionContext): Promise<DataSet> {
    const extractionRef = context.node.data.extractionRef as ExtractionRef | undefined;
    const staticRawTable = context.node.data.rawTable as string | undefined;

    // Resolve raw table name (dynamic via ref or static fallback)
    const rawTable = await resolveRawTable(
      context.queryRunner,
      extractionRef,
      staticRawTable,
      'extractionRef',
    );

    // Validate table exists
    const tableCheck = await context.queryRunner.query(
      `SELECT table_name FROM information_schema.tables WHERE table_name = $1`,
      [rawTable],
    );

    if (!tableCheck || tableCheck.length === 0) {
      throw new Error(`原始資料表 ${rawTable} 不存在`);
    }

    const tempTable = makeTempTableName(context.node.id, context.logId);

    try {
      await context.queryRunner.query(
        `CREATE TEMP TABLE "${tempTable}" AS SELECT * FROM "${rawTable}"`,
      );
    } catch (err: any) {
      throw new Error(`原始資料表 ${rawTable} 讀取失敗：${err.message}`);
    }

    // Get row count
    const countResult = await context.queryRunner.query(
      `SELECT COUNT(*)::int AS cnt FROM "${tempTable}"`,
    );
    const rowCount = countResult[0]?.cnt ?? 0;

    return { tempTable, rowCount };
  }
}
