/**
 * AD-E07-41 P4a — `extract-handler.ts` 之 MSSQL 平行版。
 *
 * PG 核心：`CREATE TEMP TABLE "..." AS SELECT * FROM "raw_xxx"${whereClause}`
 * MSSQL：`createMssqlTempTable`（`SELECT * INTO ##... FROM "raw_xxx"${whereClause}`）；
 *   來源 raw 表存在性檢查改用 `INFORMATION_SCHEMA.TABLES`（大寫，I-MSSQL-CATALOG-CASE-01）+ 具名參數；
 *   列數改用 `countMssqlTempTableRows`。
 *
 * 業務邏輯（sourceFilter / 保留字解析 / 運算子白名單 / 欄位名防注入）完全不變（AD §9 不變式）。
 */

import { NodeExecutor, NodeExecutionContext, DataSet, makeTempTableName } from '../types';
import { resolveRawTableMssql, ExtractionRef } from './resolve-raw-table-mssql';
import { createMssqlTempTable, countMssqlTempTableRows } from './mssql/temp-table.util';

/** 與 PG 版同結構（extract 層歷史限定過濾設定，F090 / AD-E07-21 DP-AD21-1）。 */
interface ExtractSourceFilter {
  column: string;
  operator?: string;
  valueExpr?: string;
}

const ALLOWED_FILTER_OPERATORS = new Set(['<', '<=', '>', '>=', '=', '<>']);

export class ExtractHandlerMssql implements NodeExecutor {
  readonly nodeType = 'raw_data_extract';

  async execute(context: NodeExecutionContext): Promise<DataSet> {
    const extractionRef = context.node.data.extractionRef as ExtractionRef | undefined;
    const staticRawTable = context.node.data.rawTable as string | undefined;
    const sourceFilter = context.node.data.sourceFilter as ExtractSourceFilter | undefined;

    // Resolve raw table name (dynamic via ref or static fallback) — MSSQL 版依賴
    const rawTable = await resolveRawTableMssql(
      context.queryRunner,
      extractionRef,
      staticRawTable,
      'extractionRef',
    );

    // Validate table exists — 一般實體表，用大寫 INFORMATION_SCHEMA.TABLES + 具名參數
    const tableCheck = await context.queryRunner.query(
      `SELECT table_name FROM INFORMATION_SCHEMA.TABLES WHERE table_name = @0`,
      [rawTable],
    );

    if (!tableCheck || tableCheck.length === 0) {
      throw new Error(`原始資料表 ${rawTable} 不存在`);
    }

    const tempTable = '##' + makeTempTableName(context.node.id, context.logId);
    const whereClause = this.buildSourceFilterClause(sourceFilter);

    try {
      await createMssqlTempTable(
        context.queryRunner,
        tempTable,
        `SELECT * FROM "${rawTable}"${whereClause}`,
      );
    } catch (err: any) {
      throw new Error(`原始資料表 ${rawTable} 讀取失敗：${err.message}`);
    }

    const rowCount = await countMssqlTempTableRows(context.queryRunner, tempTable);

    return { tempTable, rowCount };
  }

  /**
   * 由 sourceFilter 設定組出 `WHERE "<col>" <op> '<value>'` 子句（與 PG 版邏輯完全相同）。
   * 雙引號識別碼於 MSSQL（QUOTED_IDENTIFIER ON 預設）可用，見 P4a QUOTE 決策關卡結論。
   */
  private buildSourceFilterClause(filter?: ExtractSourceFilter): string {
    if (!filter || !filter.column) return '';

    const operator = filter.operator ?? '<';
    if (!ALLOWED_FILTER_OPERATORS.has(operator)) {
      throw new Error(`sourceFilter 不支援的運算子：${operator}`);
    }

    // 欄位名只允許英數與底線（防注入）
    if (!/^[A-Za-z0-9_]+$/.test(filter.column)) {
      throw new Error(`sourceFilter 欄位名不合法：${filter.column}`);
    }

    const value = this.resolveFilterValue(filter.valueExpr);
    const escaped = value.replace(/'/g, "''");
    return ` WHERE "${filter.column}" ${operator} '${escaped}'`;
  }

  private resolveFilterValue(valueExpr?: string): string {
    if (valueExpr === 'currentWorkym') {
      const now = new Date();
      return `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}`;
    }
    if (valueExpr === 'currentMonthFirstDay') {
      const now = new Date();
      const ym = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}`;
      return `${ym}01`;
    }
    return valueExpr ?? '';
  }
}
