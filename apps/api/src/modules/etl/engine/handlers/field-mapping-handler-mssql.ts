/**
 * AD-E07-41 P4a — `field-mapping-handler.ts` 之 MSSQL 平行版。
 *
 * PG 核心：`CREATE TEMP TABLE "..." AS SELECT src AS target, ... FROM input`
 * MSSQL：`createMssqlTempTable`；輸入欄位清單改用 `getMssqlTempTableColumns`（I-MSSQL-TEMP-METADATA-01）；
 *   boolean `defaultValue` 不可產生裸 `TRUE`/`FALSE`（T-SQL 無此關鍵字）→ `CAST(1 AS BIT)`/`CAST(0 AS BIT)`
 *   （本文件查證發現 5）。
 */

import { NodeExecutor, NodeExecutionContext, DataSet, makeTempTableName, emptyDataSet } from '../types';
import {
  createMssqlTempTable,
  getMssqlTempTableColumns,
  countMssqlTempTableRows,
} from './mssql/temp-table.util';

interface FieldMapping {
  sourceColumn: string;
  targetColumn: string;
  defaultValue: unknown | null;
}

export class FieldMappingHandlerMssql implements NodeExecutor {
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

    const tempTable = '##' + makeTempTableName(context.node.id, context.logId);
    const selectParts: string[] = [];

    if (dropUnmapped) {
      for (const mapping of mappings) {
        selectParts.push(this.buildMappedPart(mapping, columns));
      }
    } else {
      for (const col of columns) {
        selectParts.push(`"${col}"`);
      }
      for (const mapping of mappings) {
        selectParts.push(this.buildMappedPart(mapping, columns));
      }
    }

    // dropUnmapped=true 且 mappings=[] → 零欄位 SELECT。
    // T-SQL `SELECT INTO` 不支援空 select-list（PG 支援），且此路徑於真實 customer_core 不可達
    // （7 個 field_mapping 節點 mappings.length>0）→ 顯式拋錯（FIELDMAP-UNIT-006 決策關卡結論，見 impl log）。
    if (selectParts.length === 0) {
      throw new Error(
        'field_mapping：dropUnmapped=true 且無任何 mapping 欄位，MSSQL SELECT INTO 不支援零欄位結果集',
      );
    }

    await createMssqlTempTable(
      context.queryRunner,
      tempTable,
      `SELECT ${selectParts.join(', ')} FROM "${inputTable}"`,
    );

    const rowCount = await countMssqlTempTableRows(context.queryRunner, tempTable);

    return { tempTable, rowCount };
  }

  private buildMappedPart(mapping: FieldMapping, columns: string[]): string {
    if (columns.includes(mapping.sourceColumn)) {
      return `"${mapping.sourceColumn}" AS "${mapping.targetColumn}"`;
    }
    if (mapping.defaultValue !== null && mapping.defaultValue !== undefined) {
      return `${this.toSqlLiteral(mapping.defaultValue)} AS "${mapping.targetColumn}"`;
    }
    return `NULL AS "${mapping.targetColumn}"`;
  }

  private toSqlLiteral(value: unknown): string {
    if (typeof value === 'string') return `'${value.replace(/'/g, "''")}'`;
    if (typeof value === 'number') return String(value);
    // T-SQL 無裸 TRUE/FALSE 關鍵字 → 用 BIT 字面值（本文件查證發現 5）
    if (typeof value === 'boolean') return value ? 'CAST(1 AS BIT)' : 'CAST(0 AS BIT)';
    return 'NULL';
  }

  private async getColumns(context: NodeExecutionContext, tableName: string): Promise<string[]> {
    const cols = await getMssqlTempTableColumns(context.queryRunner, tableName);
    return cols.map((c) => c.name);
  }
}
