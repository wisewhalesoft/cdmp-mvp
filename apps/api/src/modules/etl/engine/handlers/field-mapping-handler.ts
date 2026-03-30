/**
 * F043: FieldMappingExecutor
 * CREATE TEMP TABLE AS SELECT src AS target, ... FROM input
 * In-DB SQL Strategy: SQL 欄位重新命名 + dropUnmapped，零記憶體佔用
 */

import { NodeExecutor, NodeExecutionContext, DataSet, makeTempTableName, emptyDataSet } from '../types';

interface FieldMapping {
  sourceColumn: string;
  targetColumn: string;
  defaultValue: unknown | null;
}

export class FieldMappingHandler implements NodeExecutor {
  readonly nodeType = 'field_mapping';

  async execute(context: NodeExecutionContext): Promise<DataSet> {
    const input = context.inputs['default'];
    if (!input || input.rowCount === 0) {
      return emptyDataSet();
    }

    const mappings = context.node.data.mappings as FieldMapping[];
    const dropUnmapped = context.node.data.dropUnmapped as boolean;
    const inputTable = input.tempTable;
    const columns = await this.getColumns(context, inputTable);

    const tempTable = makeTempTableName(context.node.id, context.logId);
    const selectParts: string[] = [];

    if (dropUnmapped) {
      // Output only mapped columns
      for (const mapping of mappings) {
        if (columns.includes(mapping.sourceColumn)) {
          selectParts.push(`"${mapping.sourceColumn}" AS "${mapping.targetColumn}"`);
        } else if (mapping.defaultValue !== null && mapping.defaultValue !== undefined) {
          selectParts.push(`${this.toSqlLiteral(mapping.defaultValue)} AS "${mapping.targetColumn}"`);
        } else {
          selectParts.push(`NULL AS "${mapping.targetColumn}"`);
        }
      }
    } else {
      // Keep all original columns
      for (const col of columns) {
        selectParts.push(`"${col}"`);
      }
      // Add mapped columns
      for (const mapping of mappings) {
        if (columns.includes(mapping.sourceColumn)) {
          selectParts.push(`"${mapping.sourceColumn}" AS "${mapping.targetColumn}"`);
        } else if (mapping.defaultValue !== null && mapping.defaultValue !== undefined) {
          selectParts.push(`${this.toSqlLiteral(mapping.defaultValue)} AS "${mapping.targetColumn}"`);
        } else {
          selectParts.push(`NULL AS "${mapping.targetColumn}"`);
        }
      }
    }

    // Handle empty mappings with dropUnmapped=true: no columns selected
    if (selectParts.length === 0) {
      // Create an empty-column table with same row count
      // Use a dummy column then drop it — or use a CTE
      const sql = `CREATE TEMP TABLE "${tempTable}" AS SELECT FROM "${inputTable}"`;
      await context.queryRunner.query(sql);
    } else {
      const sql = `CREATE TEMP TABLE "${tempTable}" AS SELECT ${selectParts.join(', ')} FROM "${inputTable}"`;
      await context.queryRunner.query(sql);
    }

    const countResult = await context.queryRunner.query(
      `SELECT COUNT(*)::int AS cnt FROM "${tempTable}"`,
    );
    const rowCount = countResult[0]?.cnt ?? 0;

    return { tempTable, rowCount };
  }

  private toSqlLiteral(value: unknown): string {
    if (typeof value === 'string') return `'${value.replace(/'/g, "''")}'`;
    if (typeof value === 'number') return String(value);
    if (typeof value === 'boolean') return value ? 'TRUE' : 'FALSE';
    return 'NULL';
  }

  private async getColumns(context: NodeExecutionContext, tableName: string): Promise<string[]> {
    const result = await context.queryRunner.query(
      `SELECT column_name FROM information_schema.columns WHERE table_name = $1 ORDER BY ordinal_position`,
      [tableName],
    );
    return result.map((r: any) => r.column_name);
  }
}
