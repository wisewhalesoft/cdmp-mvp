/**
 * F110 / US-173 — CodeDecodeHandler 之 MSSQL 平行版（AD-E07-41 §13.2）。
 *
 * 泛用單趟多欄位代碼解碼：對「同一張」對照字典表，在一次資料流掃描中以任意數量、任意 filter 的
 * 多組 mapping 完成多欄解碼，取代 N 個各自就地全表 UPDATE 的 `lookup` 節點鏈。
 *
 * 執行策略（OQ-F110-01 裁示）：`SELECT <顯式欄位枚舉> INTO ##新暫存表 FROM ##主表 m <N 個 LEFT JOIN>
 * OPTION (HASH JOIN)`——單一循序全表寫出（比照 `derived-field-handler-mssql.ts`），非就地 ALTER+UPDATE。
 * 輸入 ##主表由 `NodeOutputStore.release()` 於下游消費完成後 eager-drop（P6c 既有機制，本節點不額外處理）。
 *
 * 五項不變式（AD-E07-41 §13.5，SQL 組裝逐一對應）：
 *   - I-CODEDECODE-JOIN-FILTER-01：filter 一律套於 LEFT JOIN 右側「字典衍生子查詢內部」的 WHERE，
 *     禁止置於主查詢層級對已 JOIN 結果做後置過濾（否則 LEFT JOIN 退化為 INNER，違反 LEFT/NULL 語意）。
 *   - I-CODEDECODE-DEDUP-TIEBREAK-01：字典衍生子查詢於 JOIN 前以 ROW_NUMBER() PARTITION BY 正規化鍵
 *     取首筆去重（決定性排序鍵優先 `_cdmp_id ASC`，字典表無此欄時 fallback `(SELECT NULL)`）。
 *   - I-CODEDECODE-NORMALIZE-01：JOIN 鍵值等式與輸出值一律 `TRIM(TRY_CAST(expr AS NVARCHAR(4000)))`
 *     （直接複製 `lookup-handler-mssql.ts` 之 `trimCast()`，不重新實作）。
 *   - I-CODEDECODE-COLLISION-01：輸出 SELECT 清單為「顯式欄位枚舉」，禁止 SELECT * / m.*；`outputAlias`
 *     與既有輸入欄同名時，該既有欄位排除於 passthrough（以解碼值覆蓋）。
 *   - I-CODEDECODE-EQ-01：輸出須與等價 `lookup` 節點鏈逐格一致（含 NULL / TRIM / 重複鍵取首筆）。
 *
 * 其餘方言：具名參數 `@0`（Pattern B）；legacy 解析用 `resolveRawTableMssql`（勿重造）；raw 對照表存在性
 * 檢查用大寫 `INFORMATION_SCHEMA.TABLES`（I-MSSQL-CATALOG-CASE-01）+ 具名參數；暫存表建立/內省用
 * `mssql/temp-table.util.ts` 既有 helper。
 */

import { NodeExecutor, NodeExecutionContext, DataSet, makeTempTableName, emptyDataSet } from '../types';
import { resolveRawTableMssql, ExtractionRef } from './resolve-raw-table-mssql';
import {
  createMssqlTempTable,
  getMssqlTempTableColumns,
  countMssqlTempTableRows,
} from './mssql/temp-table.util';
import { validateCodeDecodeConfig } from './code-decode-handler';

interface CodeDecodeOutputColumn {
  lookupColumn: string;
  outputAlias: string;
}

interface CodeDecodeMapping {
  matchColumn: string;
  lookupMatchColumn: string;
  filter?: string;
  outputColumns: CodeDecodeOutputColumn[];
}

/** 來源表無自身主鍵時，擷取引擎（AD-E04-8）附加之代理鍵；語意＝擷取寫入順序，作為決定性去重排序鍵。 */
const CDMP_ID_COLUMN = '_cdmp_id';

/** 正規化（I-CODEDECODE-NORMALIZE-01）：與 lookup-handler-mssql.ts 之 `trimCast()` 完全相同。 */
function trimCast(expr: string): string {
  return `TRIM(TRY_CAST(${expr} AS NVARCHAR(4000)))`;
}

export class CodeDecodeHandlerMssql implements NodeExecutor {
  readonly nodeType = 'code_decode';

  async execute(context: NodeExecutionContext): Promise<DataSet> {
    const mainInput = context.inputs['default'];
    if (!mainInput) {
      throw new Error('code_decode 節點缺少主資料流輸入');
    }

    const { data } = context.node;
    const mappings = (data.mappings as CodeDecodeMapping[]) || [];
    validateCodeDecodeConfig(mappings);

    // 空輸入：回傳空 DataSet，節點 completed（與 F043 全節點慣例一致，F110 §10）。
    if (mainInput.rowCount === 0) {
      return emptyDataSet();
    }

    // 字典來源：雙輸入模式（lookup-input）優先，否則向下相容模式（lookupRef 動態解析 → lookupSource fallback）。
    const lookupInput = context.inputs['lookup-input'];
    let dictTable: string;
    if (lookupInput?.tempTable) {
      dictTable = lookupInput.tempTable;
    } else {
      const lookupRef = data.lookupRef as ExtractionRef | undefined;
      const lookupSource = data.lookupSource as string | undefined;
      dictTable = await resolveRawTableMssql(context.queryRunner, lookupRef, lookupSource, 'lookupRef');

      // raw 對照表為一般實體表，用大寫 INFORMATION_SCHEMA.TABLES + 具名參數（I-MSSQL-CATALOG-CASE-01）。
      const tableCheck = await context.queryRunner.query(
        `SELECT table_name FROM INFORMATION_SCHEMA.TABLES WHERE table_name = @0`,
        [dictTable],
      );
      if (!tableCheck || tableCheck.length === 0) {
        throw new Error(`對照表 ${dictTable} 不存在`);
      }
    }

    const inputTable = mainInput.tempTable;
    const inputColumns = await this.getColumns(context, inputTable);
    const dictHasCdmpId = await this.dictHasCdmpId(context, dictTable);

    const tempTable = '##' + makeTempTableName(context.node.id, context.logId);
    const selectSql = this.buildSelectSql(inputTable, dictTable, mappings, inputColumns, dictHasCdmpId);

    // filter 語法錯誤等於此處拋出（沿用 lookup 慣例文案，F110 §13）。
    try {
      await createMssqlTempTable(context.queryRunner, tempTable, selectSql);
    } catch (err: any) {
      throw new Error(`對照表查詢失敗：${err?.message ?? String(err)}`);
    }

    const rowCount = await countMssqlTempTableRows(context.queryRunner, tempTable);

    return { tempTable, rowCount };
  }

  /**
   * 組出單趟多 LEFT JOIN 之 `SELECT ... FROM ... OPTION (HASH JOIN)`（不含 INTO；由 createMssqlTempTable 插入）。
   * 每組 mapping ⇒ 一個「已篩選 + 已去重」的字典衍生子查詢，以 `_cd_m{i}` 別名 LEFT JOIN 主表。
   */
  private buildSelectSql(
    inputTable: string,
    dictTable: string,
    mappings: CodeDecodeMapping[],
    inputColumns: string[],
    dictHasCdmpId: boolean,
  ): string {
    // I-CODEDECODE-COLLISION-01：outputAlias 同名之既有輸入欄排除於 passthrough（以解碼值覆蓋）。
    const outputAliases = new Set<string>();
    for (const mapping of mappings) {
      for (const oc of mapping.outputColumns) outputAliases.add(oc.outputAlias);
    }

    // 顯式欄位枚舉（禁 SELECT * / m.*）：passthrough 欄位 + 各 mapping 之解碼欄位。
    const selectParts: string[] = [];
    for (const col of inputColumns) {
      if (!outputAliases.has(col)) selectParts.push(`m."${col}"`);
    }

    // I-CODEDECODE-DEDUP-TIEBREAK-01：決定性排序鍵（節點級字典表單次判定）。
    const orderKey = dictHasCdmpId ? `d."${CDMP_ID_COLUMN}" ASC` : `(SELECT NULL)`;

    const joinParts: string[] = [];
    mappings.forEach((mapping, idx) => {
      const alias = `_cd_m${idx + 1}`;
      const keyExpr = trimCast(`d."${mapping.lookupMatchColumn}"`);

      // 輸出欄投影（決定性順序：mapping 順序 → outputColumns 順序，F110 §6.2）。
      for (const oc of mapping.outputColumns) {
        selectParts.push(`"${alias}"."${oc.outputAlias}" AS "${oc.outputAlias}"`);
      }

      const valueCols = mapping.outputColumns.map(
        (oc) => `${trimCast(`d."${oc.lookupColumn}"`)} AS "${oc.outputAlias}"`,
      );

      // I-CODEDECODE-JOIN-FILTER-01：filter 套於字典衍生子查詢內部 WHERE（未限定別名之欄名於單表 scope 下正確解析）。
      const whereClause =
        mapping.filter && mapping.filter.trim() ? ` WHERE ${mapping.filter}` : '';

      joinParts.push(
        `LEFT JOIN (` +
          `SELECT * FROM (` +
          `SELECT ${keyExpr} AS "_cd_key", ${valueCols.join(', ')}, ` +
          `ROW_NUMBER() OVER (PARTITION BY ${keyExpr} ORDER BY ${orderKey}) AS "_cd_rn" ` +
          `FROM "${dictTable}" d${whereClause}` +
          `) _ranked WHERE "_cd_rn" = 1` +
          `) "${alias}" ON "${alias}"."_cd_key" = ${trimCast(`m."${mapping.matchColumn}"`)}`,
      );
    });

    // OPTION (HASH JOIN)：陳述式層級 query hint，單一宣告涵蓋全部 N 個 JOIN（同 lookup-handler-mssql.ts
    // I-MSSQL-LOOKUP-HASHJOIN-01：計算式 join key + ##temp 無統計 → 大主表避 optimizer 誤選 nested-loop）。
    return (
      `SELECT ${selectParts.join(', ')} ` +
      `FROM "${inputTable}" m ${joinParts.join(' ')} ` +
      `OPTION (HASH JOIN)`
    );
  }

  /** 輸入 ##暫存表欄位（passthrough 枚舉用）；MSSQL 版沿用 `getMssqlTempTableColumns`（tempdb.sys.columns）。 */
  private async getColumns(context: NodeExecutionContext, tableName: string): Promise<string[]> {
    const cols = await getMssqlTempTableColumns(context.queryRunner, tableName);
    return cols.map((c) => c.name);
  }

  /**
   * 字典表是否具 `_cdmp_id` 欄（決定去重排序鍵）；節點級單次內省。
   * `##`/`#` 暫存表（雙輸入模式）走 `tempdb.sys.columns`；一般 raw 實體表走大寫 INFORMATION_SCHEMA.COLUMNS。
   */
  private async dictHasCdmpId(context: NodeExecutionContext, dictTable: string): Promise<boolean> {
    if (dictTable.startsWith('#')) {
      const cols = await getMssqlTempTableColumns(context.queryRunner, dictTable);
      return cols.some((c) => c.name === CDMP_ID_COLUMN);
    }
    const rows = await context.queryRunner.query(
      `SELECT column_name FROM INFORMATION_SCHEMA.COLUMNS WHERE table_name = @0`,
      [dictTable],
    );
    return (rows || []).some((r: any) => r.column_name === CDMP_ID_COLUMN);
  }
}
