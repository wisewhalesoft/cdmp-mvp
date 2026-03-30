/**
 * F043: ConditionalExecutor
 * CREATE TEMP TABLE AS SELECT *, CASE WHEN ... END AS col FROM input
 * In-DB SQL Strategy: SQL CASE WHEN 條件規則，零記憶體佔用
 */

import { NodeExecutor, NodeExecutionContext, DataSet, makeTempTableName, emptyDataSet } from '../types';

interface ConditionalCondition {
  when: string;
  then: string;
}

interface ConditionalRule {
  targetColumn: string;
  conditions: ConditionalCondition[];
  elseValue: string;
}

export class ConditionalHandler implements NodeExecutor {
  readonly nodeType = 'conditional';

  async execute(context: NodeExecutionContext): Promise<DataSet> {
    const input = context.inputs['default'];
    if (!input || input.rowCount === 0) {
      return emptyDataSet();
    }

    const rules = context.node.data.rules as ConditionalRule[];
    const inputTable = input.tempTable;
    const columns = await this.getColumns(context, inputTable);

    const tempTable = makeTempTableName(context.node.id, context.logId);

    // Build SELECT: all columns (with overrides for targetColumns)
    const targetColumns = new Set(rules.map((r) => r.targetColumn));
    const selectParts: string[] = [];

    for (const col of columns) {
      if (!targetColumns.has(col)) {
        selectParts.push(`"${col}"`);
      }
    }

    // Add CASE WHEN expressions for each rule
    for (const rule of rules) {
      const caseSql = this.buildCaseSql(rule, columns);
      selectParts.push(`${caseSql} AS "${rule.targetColumn}"`);
    }

    const sql = `CREATE TEMP TABLE "${tempTable}" AS SELECT ${selectParts.join(', ')} FROM "${inputTable}"`;
    await context.queryRunner.query(sql);

    const countResult = await context.queryRunner.query(
      `SELECT COUNT(*)::int AS cnt FROM "${tempTable}"`,
    );
    const rowCount = countResult[0]?.cnt ?? 0;

    return { tempTable, rowCount };
  }

  private buildCaseSql(rule: ConditionalRule, columns: string[]): string {
    // Detect columns referenced by left./right. in conditions to add NULL-safe guards
    const thenSql = this.resolveValue(rule.conditions[0]?.then ?? rule.elseValue, columns);
    const elseSql = this.resolveValue(rule.elseValue, columns);

    // Extract left/right column references from WHEN clauses for NULL-safety
    const leftCols = new Set<string>();
    const rightCols = new Set<string>();
    for (const cond of rule.conditions) {
      const leftMatches = cond.when.matchAll(/left\.(\w+)/g);
      for (const m of leftMatches) leftCols.add(m[1]);
      const rightMatches = cond.when.matchAll(/right\.(\w+)/g);
      for (const m of rightMatches) {
        const col = m[1];
        rightCols.add(columns.includes(col + '_right') ? col + '_right' : col);
      }
    }

    // Build NULL-safe CASE:
    // 1. If all right-side comparison columns are NULL → take left value (right has no data)
    // 2. If all left-side comparison columns are NULL → take else/right value (left has no data)
    // 3. Otherwise evaluate the original conditions
    let sql = 'CASE';

    // Guard: right side is NULL → pick left (THEN) value
    if (rightCols.size > 0) {
      const rightNullCheck = [...rightCols].map((c) => `"${c}" IS NULL`).join(' AND ');
      sql += ` WHEN ${rightNullCheck} THEN ${thenSql}`;
    }

    // Guard: left side is NULL → pick right (ELSE) value
    if (leftCols.size > 0) {
      const leftNullCheck = [...leftCols].map((c) => `"${c}" IS NULL`).join(' AND ');
      sql += ` WHEN ${leftNullCheck} THEN ${elseSql}`;
    }

    // Original conditions
    for (const condition of rule.conditions) {
      const whenSql = this.resolveWhen(condition.when, columns);
      const condThenSql = this.resolveValue(condition.then, columns);
      sql += ` WHEN ${whenSql} THEN ${condThenSql}`;
    }

    sql += ` ELSE ${elseSql} END`;

    return sql;
  }

  private resolveWhen(when: string, columns: string[]): string {
    let sql = when;

    // AND is valid SQL, keep as-is

    // Replace left.{col} IS NOT NULL → "{col}" IS NOT NULL
    sql = sql.replace(/left\.(\w+)\s+IS\s+NOT\s+NULL/gi, (_, col) => `"${col}" IS NOT NULL`);
    sql = sql.replace(/right\.(\w+)\s+IS\s+NOT\s+NULL/gi, (_, col) => {
      const rightCol = col + '_right';
      return columns.includes(rightCol) ? `"${rightCol}" IS NOT NULL` : `"${col}" IS NOT NULL`;
    });

    // Replace left.{col} >= right.{col}
    sql = sql.replace(/left\.(\w+)\s*>=\s*right\.(\w+)/gi, (_, leftCol, rightCol) => {
      const resolvedRight = columns.includes(rightCol + '_right') ? rightCol + '_right' : rightCol;
      return `"${leftCol}" >= "${resolvedRight}"`;
    });

    // Replace other left./right. references
    sql = sql.replace(/left\.(\w+)/g, (_, col) => `"${col}"`);
    sql = sql.replace(/right\.(\w+)/g, (_, col) => {
      const rightCol = col + '_right';
      return columns.includes(rightCol) ? `"${rightCol}"` : `"${col}"`;
    });

    return sql;
  }

  private resolveValue(valueExpr: string, columns: string[]): string {
    // String literal: 'xxx' — already valid SQL
    if (valueExpr.match(/^'.*'$/)) {
      return valueExpr;
    }

    // left.{col}
    const leftMatch = valueExpr.match(/^left\.(\w+)$/);
    if (leftMatch) {
      return `"${leftMatch[1]}"`;
    }

    // right.{col}
    const rightMatch = valueExpr.match(/^right\.(\w+)$/);
    if (rightMatch) {
      const col = rightMatch[1];
      const rightCol = col + '_right';
      return columns.includes(rightCol) ? `"${rightCol}"` : `"${col}"`;
    }

    // Plain value (pass through)
    return valueExpr;
  }

  private async getColumns(context: NodeExecutionContext, tableName: string): Promise<string[]> {
    const result = await context.queryRunner.query(
      `SELECT column_name FROM information_schema.columns WHERE table_name = $1 ORDER BY ordinal_position`,
      [tableName],
    );
    return result.map((r: any) => r.column_name);
  }
}
