/**
 * F043: RawDataExtractExecutor
 * CREATE TEMP TABLE AS SELECT * FROM raw_xxx
 * In-DB SQL Strategy: 直接在 DB 中建立 temp table，零記憶體佔用
 */

import { NodeExecutor, NodeExecutionContext, DataSet, makeTempTableName } from '../types';
import { resolveRawTable, ExtractionRef } from './resolve-raw-table';

/**
 * F090 / AD-E07-21 DP-AD21-1：extract 層歷史限定過濾設定。
 * 須在 field_mapping dropUnmapped 丟掉過濾欄位（如 PROJECT_WORKYM）之前套用。
 *   column      過濾欄位（來源表欄位名）
 *   operator    比較運算子（白名單：< <= > >= = <>）
 *   valueExpr   比較值。'currentWorkym' 為保留字 → 解析為本月份字串 YYYYMM；
 *               其他視為已預格式化的字串常數。
 */
interface ExtractSourceFilter {
  column: string;
  operator?: string;
  valueExpr?: string;
}

const ALLOWED_FILTER_OPERATORS = new Set(['<', '<=', '>', '>=', '=', '<>']);

export class ExtractHandler implements NodeExecutor {
  readonly nodeType = 'raw_data_extract';

  async execute(context: NodeExecutionContext): Promise<DataSet> {
    const extractionRef = context.node.data.extractionRef as ExtractionRef | undefined;
    const staticRawTable = context.node.data.rawTable as string | undefined;
    const sourceFilter = context.node.data.sourceFilter as ExtractSourceFilter | undefined;

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
    const whereClause = this.buildSourceFilterClause(sourceFilter);

    try {
      await context.queryRunner.query(
        `CREATE TEMP TABLE "${tempTable}" AS SELECT * FROM "${rawTable}"${whereClause}`,
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

  /**
   * 由 sourceFilter 設定組出 `WHERE "<col>" <op> '<value>'` 子句。
   * 無設定或欄位為空 → 回空字串（不過濾，載入全量）。
   * 保留字 valueExpr：
   *   - 'currentWorkym'        → 當下年月 YYYYMM 字串
   *   - 'currentMonthFirstDay' → 本月第一天 YYYYMM01 字串（F090 歷史限定用，
   *                              對齊 F091 去重之 ASSIGNDAY yyyyMMdd 比對語意）
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
      // 本月年月 YYYYMM
      const now = new Date();
      return `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}`;
    }
    if (valueExpr === 'currentMonthFirstDay') {
      // 本月第一天 YYYYMM01（ASSIGNDAY 為 yyyyMMdd 字串，< 本月第一天 = 只取上月底以前的歷史）
      const now = new Date();
      const ym = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}`;
      return `${ym}01`;
    }
    return valueExpr ?? '';
  }
}
