/**
 * AD-E07-41 P4a — `derived-field-handler.ts` 之 MSSQL 平行版（最高風險群組）。
 *
 * 方言轉換：
 *   - `gen_random_uuid()` → `NEWID()`（本文件查證發現 4）
 *   - `mergePhone()` 的 `~ '^0+$'`（全零判斷）→ `LEN(col) > 0 AND col NOT LIKE '%[^0]%'`
 *     （本文件查證發現 3；CONCAT 兩引擎皆 NULL-safe 不需轉換）
 *   - `padStart(col,n,char)`（PG `LPAD`）→ `CASE WHEN LEN(col) >= n THEN LEFT(col,n)
 *     ELSE RIGHT(REPLICATE(char,n) + col, n) END`（本文件查證發現 7：AD 建議公式漏 LEFT 分支，
 *     輸入長度 >= n 時 PG LPAD 保留「前」n 碼、AD 原式保留「後」n 碼，方向相反）
 *   - `CASE WHEN` passthrough（`resolveCaseWhenSql`）ANSI 相容，邏輯不變；欄位清單改用
 *     `getMssqlTempTableColumns`（I-MSSQL-TEMP-METADATA-01）。
 */

import { NodeExecutor, NodeExecutionContext, DataSet, makeTempTableName, emptyDataSet } from '../types';
import {
  createMssqlTempTable,
  getMssqlTempTableColumns,
  countMssqlTempTableRows,
} from './mssql/temp-table.util';

interface DerivedExpression {
  outputColumn: string;
  expression: string;
  outputType: string;
}

/** `::TEXT` 等價之字串轉型上限（padStart/字串運算用；customer_core 相關欄位皆短碼）。 */
const TEXT_CAST = 'NVARCHAR(4000)';

export class DerivedFieldHandlerMssql implements NodeExecutor {
  readonly nodeType = 'derived_field';

  async execute(context: NodeExecutionContext): Promise<DataSet> {
    const input = context.inputs['default'];
    if (!input || input.rowCount === 0) {
      return emptyDataSet();
    }

    const expressions = context.node.data.expressions as DerivedExpression[];
    const inputTable = input.tempTable;
    const columns = await this.getColumns(context, inputTable);

    const tempTable = '##' + makeTempTableName(context.node.id, context.logId);

    const selectParts: string[] = [];

    const derivedOutputCols = new Set(expressions.map((e) => e.outputColumn));
    for (const col of columns) {
      if (!derivedOutputCols.has(col)) {
        selectParts.push(`"${col}"`);
      }
    }

    for (const expr of expressions) {
      const sqlExpr = this.toSql(expr.expression, columns);
      selectParts.push(`${sqlExpr} AS "${expr.outputColumn}"`);
    }

    await createMssqlTempTable(
      context.queryRunner,
      tempTable,
      `SELECT ${selectParts.join(', ')} FROM "${inputTable}"`,
    );

    const rowCount = await countMssqlTempTableRows(context.queryRunner, tempTable);

    return { tempTable, rowCount };
  }

  /**
   * 將 DSL 表達式轉換為 MSSQL 表達式。
   */
  private toSql(expression: string, columns: string[]): string {
    // gen_random_uuid() → NEWID()
    if (expression.trim() === 'gen_random_uuid()') {
      return 'NEWID()';
    }

    // mergePhone(col1, col2) or mergePhone(col1, col2, col3)
    const mergePhoneMatch = expression.match(/^mergePhone\((\w+),\s*(\w+)(?:,\s*(\w+))?\)$/);
    if (mergePhoneMatch) {
      const areaCol = mergePhoneMatch[1];
      const telCol = mergePhoneMatch[2];
      const extenCol = mergePhoneMatch[3]; // optional
      const baseConcat = `CONCAT("${areaCol}", '-', "${telCol}")`;
      // exten 有效性：非 NULL、非空、且「非全零」。`!~ '^0+$'` → 有 <> '' 前提，故「含非零字元」= LIKE '%[^0]%'
      const fullConcat = extenCol
        ? `CASE WHEN "${extenCol}" IS NOT NULL AND "${extenCol}" <> '' AND "${extenCol}" LIKE '%[^0]%' ` +
          `THEN CONCAT("${areaCol}", '-', "${telCol}", '#', "${extenCol}") ` +
          `ELSE ${baseConcat} END`
        : baseConcat;
      // null/empty/all-zeros → null，否則 area-tel[#exten]
      return (
        `CASE ` +
        `WHEN "${areaCol}" IS NULL OR "${telCol}" IS NULL THEN NULL ` +
        `WHEN "${areaCol}" = '' OR "${telCol}" = '' THEN NULL ` +
        `WHEN (LEN("${areaCol}") > 0 AND "${areaCol}" NOT LIKE '%[^0]%') ` +
        `OR (LEN("${telCol}") > 0 AND "${telCol}" NOT LIKE '%[^0]%') THEN NULL ` +
        `ELSE ${fullConcat} END`
      );
    }

    // padStart(col, length, 'char')
    const padStartMatch = expression.match(/^padStart\((\w+),\s*(\d+),\s*'(.*)'\)$/);
    if (padStartMatch) {
      const col = padStartMatch[1];
      const length = parseInt(padStartMatch[2], 10);
      const char = padStartMatch[3].replace(/'/g, "''");
      const sv = `CAST("${col}" AS ${TEXT_CAST})`;
      // 🔴 本文件查證發現 7：輸入長度 >= n 須用 LEFT（保留前 n 碼，對齊 PG LPAD 截斷方向）。
      return (
        `CASE WHEN "${col}" IS NULL THEN NULL ` +
        `WHEN LEN(${sv}) >= ${length} THEN LEFT(${sv}, ${length}) ` +
        `ELSE RIGHT(REPLICATE('${char}', ${length}) + ${sv}, ${length}) END`
      );
    }

    // CASE WHEN ... END (pass through as SQL with column resolution)
    if (expression.trim().startsWith('CASE')) {
      return this.resolveCaseWhenSql(expression, columns);
    }

    throw new Error(`不支援的表達式函數：${this.extractFunctionName(expression)}`);
  }

  /**
   * 將 DSL 的 left./right. 前綴轉換為 SQL 欄位引用（與 PG 版邏輯完全相同，純 JS 字串處理）。
   */
  private resolveCaseWhenSql(expression: string, columns: string[]): string {
    let sql = expression;

    sql = sql.replace(/left\.(\w+)/g, (_, col) => `"${col}"`);

    sql = sql.replace(/right\.(\w+)/g, (_, col) => {
      const rightCol = col + '_right';
      if (columns.includes(rightCol)) {
        return `"${rightCol}"`;
      }
      return `"${col}"`;
    });

    return sql;
  }

  private extractFunctionName(expression: string): string {
    const match = expression.match(/^(\w+)\(/);
    return match ? match[1] : expression;
  }

  private async getColumns(context: NodeExecutionContext, tableName: string): Promise<string[]> {
    const cols = await getMssqlTempTableColumns(context.queryRunner, tableName);
    return cols.map((c) => c.name);
  }
}
