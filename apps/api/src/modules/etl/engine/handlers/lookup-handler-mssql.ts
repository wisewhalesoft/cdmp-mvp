/**
 * AD-E07-41 P4b — `lookup-handler.ts` 之 MSSQL 平行版。
 *
 * Enrich 策略：新增輸出欄位 + 原地 UPDATE（不複製多百萬列表）。回傳與輸入相同之 `##` 表。
 *
 * 三處必改站點（PG 語法於 T-SQL 為語法錯誤 / 語意錯誤，詳見 impl log 探測結論與偏差段）：
 *
 *   1. 新增欄位（最高風險）：PG 版帶冪等語法糖之新增欄位陳述式於 T-SQL 完全不合法。
 *      → 冪等性改以 **選項甲（ALTERCOL-GATE-001）**：JS 端先呼叫既有 `getMssqlTempTableColumns` 預查，
 *        僅在欄位尚不存在時發出純 `ALTER TABLE ##t ADD "alias" NVARCHAR(MAX)`（無條件式 DDL）。
 *
 *   2. UPDATE...FROM 重構（查證發現 4）：PG 於 UPDATE 子句就地宣告 target 別名之寫法為 PG 特有；
 *      T-SQL 必須把 target 顯式併入 `FROM`/`JOIN` →
 *        `UPDATE _src SET ... FROM ##t AS _src JOIN (sub) _lk ON <原 WHERE 條件>`。
 *      字串轉型 cast 一律改 `TRY_CAST(... AS NVARCHAR(4000))`；`TRIM` 2017+ 原生。
 *
 *   3. skip_row 之刪除陳述式（偏差 DEV-P4B-01）：target 別名須以兩段式宣告 →
 *        `DELETE _src FROM ##t AS _src WHERE NOT EXISTS (...)`（真實 MSSQL 探測結論，見 impl log）。
 *
 * 其餘方言：具名參數 `@0`（Pattern B）；legacy 解析用 `resolveRawTableMssql`（P4a 既有，勿重造）；
 * raw 對照表存在性檢查用大寫 `INFORMATION_SCHEMA.TABLES`（I-MSSQL-CATALOG-CASE-01）+ 具名參數。
 */

import { NodeExecutor, NodeExecutionContext, DataSet, emptyDataSet } from '../types';
import { resolveRawTableMssql, ExtractionRef } from './resolve-raw-table-mssql';
import { getMssqlTempTableColumns, countMssqlTempTableRows } from './mssql/temp-table.util';

interface LookupOutputColumn {
  lookupColumn: string;
  outputAlias: string;
}

/** 轉字串一律用 `TRY_CAST(... AS NVARCHAR(4000))`（P4a 一致慣例，NVARCHAR 轉型必然合法）。 */
function trimCast(expr: string): string {
  return `TRIM(TRY_CAST(${expr} AS NVARCHAR(4000)))`;
}

export class LookupHandlerMssql implements NodeExecutor {
  readonly nodeType = 'lookup';

  async execute(context: NodeExecutionContext): Promise<DataSet> {
    const mainInput = context.inputs['default'];
    if (!mainInput || mainInput.rowCount === 0) {
      return emptyDataSet();
    }

    const { data } = context.node;
    const matchColumn = data.matchColumn as string;
    const lookupMatchColumn = data.lookupMatchColumn as string;
    const outputColumns = (data.outputColumns as LookupOutputColumn[]) || [];
    const noMatchStrategy = (data.noMatchStrategy as string) || 'null';

    if (!matchColumn) throw new Error('Lookup 節點缺少比對欄位（主表）');
    if (!lookupMatchColumn) throw new Error('Lookup 節點缺少比對欄位（對照表）');
    if (outputColumns.length === 0) throw new Error('Lookup 節點缺少輸出欄位');

    // Determine lookup table: dual-input mode vs legacy mode
    const lookupInput = context.inputs['lookup-input'];
    const lookupFilter = (data.lookupFilter as string) || '';

    let lookupTable: string;

    if (lookupInput?.tempTable) {
      // Dual-input mode: use upstream DataSet directly（不觸發 resolve / 存在性檢查）
      lookupTable = lookupInput.tempTable;
    } else {
      // Legacy mode: resolve via lookupRef or static lookupSource（重用 P4a resolve-raw-table-mssql）
      const lookupRef = data.lookupRef as ExtractionRef | undefined;
      const lookupSource = data.lookupSource as string | undefined;

      lookupTable = await resolveRawTableMssql(
        context.queryRunner,
        lookupRef,
        lookupSource,
        'lookupRef',
      );

      // Validate the raw table exists — 一般實體表，用大寫 INFORMATION_SCHEMA.TABLES + 具名參數
      const tableCheck = await context.queryRunner.query(
        `SELECT table_name FROM INFORMATION_SCHEMA.TABLES WHERE table_name = @0`,
        [lookupTable],
      );
      if (!tableCheck || tableCheck.length === 0) {
        throw new Error(`對照表 ${lookupTable} 不存在`);
      }
    }

    const inputTable = mainInput.tempTable;

    // Build lookup sub-query with optional filter（雙引號識別碼 / 字面值等式，無 PG 專屬 cast/正則）
    let lookupSubQuery = `SELECT * FROM "${lookupTable}"`;
    if (lookupFilter.trim()) {
      lookupSubQuery += ` WHERE ${lookupFilter}`;
    }

    // 1) 新增輸出欄位（冪等：JS 端預查，選項甲）
    await this.addOutputColumns(context, inputTable, outputColumns);

    // 2) UPDATE 命中列（null / skip_row / default_value 三分支共用同一 UPDATE 骨幹）
    await context.queryRunner.query(
      this.buildUpdateFromSql(inputTable, matchColumn, lookupMatchColumn, lookupSubQuery, outputColumns),
    );

    if (noMatchStrategy === 'skip_row') {
      // INNER JOIN 語意：刪除未命中列。兩段式（target 別名於 FROM 宣告，見 impl log DEV-P4B-01）。
      await context.queryRunner.query(
        `DELETE _src FROM "${inputTable}" AS _src WHERE NOT EXISTS (SELECT 1 FROM (${lookupSubQuery}) _lk WHERE ${trimCast('_src."' + matchColumn + '"')} = ${trimCast('_lk."' + lookupMatchColumn + '"')})`,
      );
    } else if (noMatchStrategy === 'default_value') {
      // 未命中列（仍為 NULL）填入預設值（Pattern B 具名參數；單純 UPDATE，無 JOIN 對象，免 FROM 重構）
      const defaultValue = (data.defaultValue as string) || '';
      for (const col of outputColumns) {
        const alias = col.outputAlias || col.lookupColumn;
        await context.queryRunner.query(
          `UPDATE "${inputTable}" SET "${alias}" = @0 WHERE "${alias}" IS NULL`,
          [defaultValue],
        );
      }
    }
    // noMatchStrategy === 'null'：僅新增欄位 + UPDATE，未命中列保持 NULL（LEFT JOIN 語意），無額外處理。

    const rowCount = await countMssqlTempTableRows(context.queryRunner, inputTable);

    // Return the SAME temp table (in-place modification, no new table created)
    return { tempTable: inputTable, rowCount };
  }

  /**
   * 冪等新增輸出欄位（ALTERCOL-GATE-001 選項甲）。
   * 先以 `getMssqlTempTableColumns` 取現有欄位集合，僅對「尚不存在」之 alias 發出純
   * `ALTER TABLE ADD "alias" NVARCHAR(MAX)`；忠實保留 PG 版之冪等語意。
   */
  private async addOutputColumns(
    context: NodeExecutionContext,
    inputTable: string,
    outputColumns: LookupOutputColumn[],
  ): Promise<void> {
    const existing = new Set(
      (await getMssqlTempTableColumns(context.queryRunner, inputTable)).map((c) => c.name),
    );
    for (const col of outputColumns) {
      const alias = col.outputAlias || col.lookupColumn;
      if (existing.has(alias)) continue;
      await context.queryRunner.query(
        `ALTER TABLE "${inputTable}" ADD "${alias}" NVARCHAR(MAX)`,
      );
      existing.add(alias);
    }
  }

  /**
   * UPDATE...FROM 重構（查證發現 4）：target 顯式併入 `FROM`/`JOIN`，非 PG 就地宣告別名。
   * `UPDATE _src SET "alias"=TRIM(TRY_CAST(_lk."col" AS NVARCHAR(4000))) FROM ##t AS _src`
   * `  JOIN (sub) _lk ON TRIM(TRY_CAST(_src."m" AS NVARCHAR(4000))) = TRIM(TRY_CAST(_lk."k" AS NVARCHAR(4000)))`
   */
  private buildUpdateFromSql(
    inputTable: string,
    matchColumn: string,
    lookupMatchColumn: string,
    lookupSubQuery: string,
    outputColumns: LookupOutputColumn[],
  ): string {
    const setClauses = outputColumns.map((col) => {
      const alias = col.outputAlias || col.lookupColumn;
      return `"${alias}" = ${trimCast('_lk."' + col.lookupColumn + '"')}`;
    });
    return (
      `UPDATE _src SET ${setClauses.join(', ')} ` +
      `FROM "${inputTable}" AS _src ` +
      `JOIN (${lookupSubQuery}) _lk ` +
      `ON ${trimCast('_src."' + matchColumn + '"')} = ${trimCast('_lk."' + lookupMatchColumn + '"')}`
    );
  }
}
