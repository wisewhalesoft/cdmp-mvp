/**
 * F043: TypeCastExecutor
 * CREATE TEMP TABLE AS SELECT *, CAST(col AS type) FROM input
 * In-DB SQL Strategy: SQL CAST，零記憶體佔用
 */

import { NodeExecutor, NodeExecutionContext, DataSet, makeTempTableName, emptyDataSet } from '../types';

interface CastRule {
  column: string;
  sourceType: string;
  targetType: string;
}

export class TypeCastHandler implements NodeExecutor {
  readonly nodeType = 'type_cast';

  async execute(context: NodeExecutionContext): Promise<DataSet> {
    const input = context.inputs['default'];
    if (!input || input.rowCount === 0) {
      return emptyDataSet();
    }

    const castRules = context.node.data.castRules as CastRule[];
    const inputTable = input.tempTable;

    // Validate cast rules
    for (const rule of castRules) {
      if (!['DECIMAL', 'INTEGER', 'DATE'].includes(rule.targetType)) {
        throw new Error(`不支援的目標型別：${rule.targetType}`);
      }
    }

    const columns = await this.getColumns(context, inputTable);
    const tempTable = makeTempTableName(context.node.id, context.logId);

    // Build SELECT with CAST expressions
    const selectParts: string[] = [];
    const castColumnSet = new Set(castRules.map((r) => r.column));

    for (const col of columns) {
      const rule = castRules.find((r) => r.column === col);
      if (rule) {
        const pgType = this.toPgType(rule.targetType);
        // Use CASE to handle invalid casts gracefully (return NULL)
        selectParts.push(
          `CASE WHEN "${col}" IS NOT NULL THEN ` +
          `CASE WHEN "${col}"::TEXT ~ ${this.getValidationRegex(rule.targetType)} THEN "${col}"::TEXT::${pgType} ELSE NULL END ` +
          `ELSE NULL END AS "${col}"`,
        );
      } else {
        selectParts.push(`"${col}"`);
      }
    }

    const sql = `CREATE TEMP TABLE "${tempTable}" AS SELECT ${selectParts.join(', ')} FROM "${inputTable}"`;
    await context.queryRunner.query(sql);

    const countResult = await context.queryRunner.query(
      `SELECT COUNT(*)::int AS cnt FROM "${tempTable}"`,
    );
    const rowCount = countResult[0]?.cnt ?? 0;

    return { tempTable, rowCount };
  }

  private toPgType(targetType: string): string {
    switch (targetType) {
      case 'DECIMAL': return 'NUMERIC';
      case 'INTEGER': return 'INTEGER';
      case 'DATE': return 'DATE';
      default: return 'TEXT';
    }
  }

  private getValidationRegex(targetType: string): string {
    switch (targetType) {
      case 'DECIMAL': return `'^-?[0-9]+(\\.[0-9]+)?$'`;
      case 'INTEGER': return `'^-?[0-9]+$'`;
      case 'DATE': return `'^[0-9]{4}-[0-9]{2}-[0-9]{2}'`; // ISO date prefix
      default: return `'.*'`;
    }
  }

  private async getColumns(context: NodeExecutionContext, tableName: string): Promise<string[]> {
    const result = await context.queryRunner.query(
      `SELECT column_name FROM information_schema.columns WHERE table_name = $1 ORDER BY ordinal_position`,
      [tableName],
    );
    return result.map((r: any) => r.column_name);
  }
}
