/**
 * AD-E07-41 P4a — `conditional-handler.ts` 之 MSSQL 平行版（最低風險群組）。
 *
 * `CASE WHEN ... END` 為 ANSI 相容，條件/NULL-safety guard/left./right. 前綴解析全部純 JS 字串處理，
 * 與 PG 版邏輯完全相同（AD §3.2 判定「不需改」）。方言差異僅：
 *   - `CREATE TEMP TABLE AS` → `createMssqlTempTable`（`SELECT ... INTO ##`）
 *   - 欄位清單改用 `getMssqlTempTableColumns`（I-MSSQL-TEMP-METADATA-01）
 *   - 列數改用 `countMssqlTempTableRows`
 */

import { NodeExecutor, NodeExecutionContext, DataSet, makeTempTableName, emptyDataSet } from '../types';
import {
  createMssqlTempTable,
  getMssqlTempTableColumns,
  countMssqlTempTableRows,
} from './mssql/temp-table.util';

interface ConditionalCondition {
  when: string;
  then: string;
}

interface ConditionalRule {
  targetColumn: string;
  conditions: ConditionalCondition[];
  elseValue: string;
}

export class ConditionalHandlerMssql implements NodeExecutor {
  readonly nodeType = 'conditional';

  async execute(context: NodeExecutionContext): Promise<DataSet> {
    const input = context.inputs['default'];
    if (!input || input.rowCount === 0) {
      return emptyDataSet();
    }

    const rules = context.node.data.rules as ConditionalRule[];
    const inputTable = input.tempTable;
    const columns = await this.getColumns(context, inputTable);

    const tempTable = '##' + makeTempTableName(context.node.id, context.logId);

    const targetColumns = new Set(rules.map((r) => r.targetColumn));
    const selectParts: string[] = [];

    for (const col of columns) {
      if (!targetColumns.has(col)) {
        selectParts.push(`"${col}"`);
      }
    }

    for (const rule of rules) {
      const caseSql = this.buildCaseSql(rule, columns);
      selectParts.push(`${caseSql} AS "${rule.targetColumn}"`);
    }

    await createMssqlTempTable(
      context.queryRunner,
      tempTable,
      `SELECT ${selectParts.join(', ')} FROM "${inputTable}"`,
    );

    const rowCount = await countMssqlTempTableRows(context.queryRunner, tempTable);

    return { tempTable, rowCount };
  }

  private buildCaseSql(rule: ConditionalRule, columns: string[]): string {
    const thenSql = this.resolveValue(rule.conditions[0]?.then ?? rule.elseValue, columns);
    const elseSql = this.resolveValue(rule.elseValue, columns);

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

    let sql = 'CASE';

    if (rightCols.size > 0) {
      const rightNullCheck = [...rightCols].map((c) => `"${c}" IS NULL`).join(' AND ');
      sql += ` WHEN ${rightNullCheck} THEN ${thenSql}`;
    }

    if (leftCols.size > 0) {
      const leftNullCheck = [...leftCols].map((c) => `"${c}" IS NULL`).join(' AND ');
      sql += ` WHEN ${leftNullCheck} THEN ${elseSql}`;
    }

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

    sql = sql.replace(/left\.(\w+)\s+IS\s+NOT\s+NULL/gi, (_, col) => `"${col}" IS NOT NULL`);
    sql = sql.replace(/right\.(\w+)\s+IS\s+NOT\s+NULL/gi, (_, col) => {
      const rightCol = col + '_right';
      return columns.includes(rightCol) ? `"${rightCol}" IS NOT NULL` : `"${col}" IS NOT NULL`;
    });

    sql = sql.replace(/left\.(\w+)\s*>=\s*right\.(\w+)/gi, (_, leftCol, rightCol) => {
      const resolvedRight = columns.includes(rightCol + '_right') ? rightCol + '_right' : rightCol;
      return `"${leftCol}" >= "${resolvedRight}"`;
    });

    sql = sql.replace(/left\.(\w+)/g, (_, col) => `"${col}"`);
    sql = sql.replace(/right\.(\w+)/g, (_, col) => {
      const rightCol = col + '_right';
      return columns.includes(rightCol) ? `"${rightCol}"` : `"${col}"`;
    });

    return sql;
  }

  private resolveValue(valueExpr: string, columns: string[]): string {
    if (valueExpr.match(/^'.*'$/)) {
      return valueExpr;
    }

    const leftMatch = valueExpr.match(/^left\.(\w+)$/);
    if (leftMatch) {
      return `"${leftMatch[1]}"`;
    }

    const rightMatch = valueExpr.match(/^right\.(\w+)$/);
    if (rightMatch) {
      const col = rightMatch[1];
      const rightCol = col + '_right';
      return columns.includes(rightCol) ? `"${rightCol}"` : `"${col}"`;
    }

    return valueExpr;
  }

  private async getColumns(context: NodeExecutionContext, tableName: string): Promise<string[]> {
    const cols = await getMssqlTempTableColumns(context.queryRunner, tableName);
    return cols.map((c) => c.name);
  }
}
