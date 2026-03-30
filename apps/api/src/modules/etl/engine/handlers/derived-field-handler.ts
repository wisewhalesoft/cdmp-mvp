/**
 * F043: DerivedFieldExecutor
 * CREATE TEMP TABLE AS SELECT *, expression AS new_col FROM input
 * In-DB SQL Strategy: SQL 表達式計算，零記憶體佔用
 */

import { NodeExecutor, NodeExecutionContext, DataSet, makeTempTableName, emptyDataSet } from '../types';

interface DerivedExpression {
  outputColumn: string;
  expression: string;
  outputType: string;
}

export class DerivedFieldHandler implements NodeExecutor {
  readonly nodeType = 'derived_field';

  async execute(context: NodeExecutionContext): Promise<DataSet> {
    const input = context.inputs['default'];
    if (!input || input.rowCount === 0) {
      return emptyDataSet();
    }

    const expressions = context.node.data.expressions as DerivedExpression[];
    const inputTable = input.tempTable;
    const columns = await this.getColumns(context, inputTable);

    const tempTable = makeTempTableName(context.node.id, context.logId);

    // Build SELECT: all existing columns + derived expressions
    const selectParts: string[] = [];

    // Existing columns (excluding any that will be overwritten by derived expressions)
    const derivedOutputCols = new Set(expressions.map((e) => e.outputColumn));
    for (const col of columns) {
      if (!derivedOutputCols.has(col)) {
        selectParts.push(`"${col}"`);
      }
    }

    // Derived expressions
    for (const expr of expressions) {
      const sqlExpr = this.toSql(expr.expression, columns);
      selectParts.push(`${sqlExpr} AS "${expr.outputColumn}"`);
    }

    const sql = `CREATE TEMP TABLE "${tempTable}" AS SELECT ${selectParts.join(', ')} FROM "${inputTable}"`;
    await context.queryRunner.query(sql);

    const countResult = await context.queryRunner.query(
      `SELECT COUNT(*)::int AS cnt FROM "${tempTable}"`,
    );
    const rowCount = countResult[0]?.cnt ?? 0;

    return { tempTable, rowCount };
  }

  /**
   * 將 DSL 表達式轉換為 SQL 表達式
   */
  private toSql(expression: string, columns: string[]): string {
    // gen_random_uuid()
    if (expression.trim() === 'gen_random_uuid()') {
      return 'gen_random_uuid()';
    }

    // mergePhone(col1, col2)
    const mergePhoneMatch = expression.match(/^mergePhone\((\w+),\s*(\w+)\)$/);
    if (mergePhoneMatch) {
      const areaCol = mergePhoneMatch[1];
      const telCol = mergePhoneMatch[2];
      // Replicate mergePhone logic: null/empty/all-zeros → null, else area-tel
      return `CASE ` +
        `WHEN "${areaCol}" IS NULL OR "${telCol}" IS NULL THEN NULL ` +
        `WHEN "${areaCol}" = '' OR "${telCol}" = '' THEN NULL ` +
        `WHEN "${areaCol}" ~ '^0+$' OR "${telCol}" ~ '^0+$' THEN NULL ` +
        `ELSE CONCAT("${areaCol}", '-', "${telCol}") END`;
    }

    // padStart(col, length, 'char')
    const padStartMatch = expression.match(/^padStart\((\w+),\s*(\d+),\s*'(.*)'\)$/);
    if (padStartMatch) {
      const col = padStartMatch[1];
      const length = parseInt(padStartMatch[2], 10);
      const char = padStartMatch[3];
      return `CASE WHEN "${col}" IS NULL THEN NULL ELSE LPAD("${col}"::TEXT, ${length}, '${char}') END`;
    }

    // CASE WHEN ... END (pass through as SQL with column resolution)
    if (expression.trim().startsWith('CASE')) {
      return this.resolveCaseWhenSql(expression, columns);
    }

    throw new Error(`不支援的表達式函數：${this.extractFunctionName(expression)}`);
  }

  /**
   * 將 DSL 的 left./right. 前綴轉換為 SQL 欄位引用
   * left.col → "col"
   * right.col → "col_right" (if _right column exists, otherwise "col")
   */
  private resolveCaseWhenSql(expression: string, columns: string[]): string {
    let sql = expression;

    // Replace left.{col} → "{col}"
    sql = sql.replace(/left\.(\w+)/g, (_, col) => `"${col}"`);

    // Replace right.{col} → "{col}_right" if exists, else "{col}"
    sql = sql.replace(/right\.(\w+)/g, (_, col) => {
      const rightCol = col + '_right';
      if (columns.includes(rightCol)) {
        return `"${rightCol}"`;
      }
      return `"${col}"`;
    });

    // Replace string literals: 'xxx' is already valid SQL
    return sql;
  }

  private extractFunctionName(expression: string): string {
    const match = expression.match(/^(\w+)\(/);
    return match ? match[1] : expression;
  }

  private async getColumns(context: NodeExecutionContext, tableName: string): Promise<string[]> {
    const result = await context.queryRunner.query(
      `SELECT column_name FROM information_schema.columns WHERE table_name = $1 ORDER BY ordinal_position`,
      [tableName],
    );
    return result.map((r: any) => r.column_name);
  }
}
