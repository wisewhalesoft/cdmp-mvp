/**
 * AD-E07-41 P4 — MSSQL ETL handler 共用暫存表 helper（§3.1）。
 *
 * 🔴 本檔於 P4-spike-2 階段先行落地「顯式清理」helper（`dropMssqlTempTableIfExists`），
 *    供 spike-2 之「崩潰清理」驗證直接呼叫真實 production 程式路徑（強化 de-risk 可信度）。
 *    其餘三個 helper（createMssqlTempTable / getMssqlTempTableColumns / countMssqlTempTableRows，
 *    見 AD-E07-41 §3.1）於 P4a 進場時補齊——本檔以 additive 方式擴充，勿於 P4a 覆寫本函式。
 *
 * 不變式：
 *   - I-MSSQL-TEMPTABLE-GLOBAL-01：節點間資料介質一律 `##global temp`（#local 不跨 query 存活，見 §1.3）。
 *   - I-MSSQL-TEMPTABLE-CLEANUP-01：成功/失敗兩路徑皆須顯式呼叫本 helper，不完全依賴 SQL Server 隱性回收。
 */

import { QueryRunner } from 'typeorm';

/**
 * 顯式清理全域暫存表（I-MSSQL-TEMPTABLE-CLEANUP-01）。
 *
 * `##global temp` 雖有 SQL Server 隱性生命週期管理（建立 session 結束＋無引用時自動 drop），
 * 但連線池化下「建立 session」不會於每次 pipeline run 之間結束（連線歸還池、session 續存），
 * 故 `##` 表在同一 worker 程序內可能殘留至下一輪；必須在成功與失敗兩條路徑顯式清理作為安全網
 * （`#local` 存活性假設已被 P4-spike 推翻一次，不應對 `##global` 的隱性回收做同等無驗證的信任）。
 *
 * 冪等：`IF OBJECT_ID(...) IS NOT NULL` 防禦——已被自動回收 / 從未成功建立時，呼叫不報錯。
 *
 * @param tempTableName 呼叫端已含 `##` 前綴之完整暫存表名（來源為 sanitized `makeTempTableName` + `##`，
 *                      非使用者可注入之外來字串，故可安全內插入 `DROP TABLE`——DDL 物件名無法參數化）。
 */
export async function dropMssqlTempTableIfExists(
  queryRunner: QueryRunner,
  tempTableName: string,
): Promise<void> {
  await queryRunner.query(
    `IF OBJECT_ID('tempdb..' + @0) IS NOT NULL DROP TABLE ${tempTableName}`,
    [tempTableName],
  );
}

/**
 * 暫存表欄位內省結果（AD §3.1 回傳型別）。
 *
 * P4c（CATALOG-GATE-001 選項甲）additive 擴充：新增 `dataType`（SQL Server 型別名，如
 * `varchar`/`nvarchar`/`int`/`datetime2`），供 target-load 之 `NULLIF(TRIM())` VARCHAR 判斷用
 * （inputColumnTypes/varcharColumns）。既有 `name`/`columnId` 語意不變（additive-only，STATIC-003）。
 */
export interface MssqlTempTableColumn {
  name: string;
  columnId: number;
  /** SQL Server 型別名（小寫，如 `varchar`/`nvarchar`/`int`/`datetime2`）。P4c 新增。 */
  dataType: string;
}

/**
 * 於 `SELECT ... FROM ...` 之**頂層** `FROM` 之前插入 `INTO ##name`（AD §3.1）。
 *
 * 不採「字串搜尋替換第一個出現的 FROM」——巢狀子查詢（`SELECT a.id FROM (SELECT id FROM t) a`）
 * 的第一個 `FROM` 才是頂層，內層子查詢的 `FROM` 不可誤植。故以括號深度 + 引號狀態掃描，
 * 只在深度 0、非字串/識別碼字面值內、以完整字（word boundary）匹配的第一個 `FROM` 之前插入。
 *
 * @param tempTableName 已含 `##` 前綴之完整全域暫存表名
 * @param selectSql     `SELECT ... FROM ...`（不含 INTO 子句本身）
 */
function buildSelectIntoSql(tempTableName: string, selectSql: string): string {
  const idx = findTopLevelFromIndex(selectSql);
  if (idx < 0) {
    throw new Error(
      `createMssqlTempTable：selectSql 找不到頂層 FROM，無法插入 INTO 子句：${selectSql}`,
    );
  }
  return `${selectSql.slice(0, idx)}INTO ${tempTableName} ${selectSql.slice(idx)}`;
}

function isIdentChar(ch: string | undefined): boolean {
  return ch !== undefined && /[A-Za-z0-9_]/.test(ch);
}

/** 掃描頂層（括號深度 0、非字串/雙引號識別碼內）第一個完整字 `FROM` 的起始索引；找不到回 -1。 */
function findTopLevelFromIndex(sql: string): number {
  let depth = 0;
  let inSingle = false;
  let inDouble = false;
  for (let i = 0; i < sql.length; i++) {
    const ch = sql[i];
    if (inSingle) {
      if (ch === "'") inSingle = false;
      continue;
    }
    if (inDouble) {
      if (ch === '"') inDouble = false;
      continue;
    }
    if (ch === "'") {
      inSingle = true;
      continue;
    }
    if (ch === '"') {
      inDouble = true;
      continue;
    }
    if (ch === '(') {
      depth++;
      continue;
    }
    if (ch === ')') {
      depth--;
      continue;
    }
    if (depth === 0 && (ch === 'F' || ch === 'f')) {
      const word = sql.slice(i, i + 4);
      if (
        /^from$/i.test(word) &&
        !isIdentChar(sql[i - 1]) &&
        !isIdentChar(sql[i + 4])
      ) {
        return i;
      }
    }
  }
  return -1;
}

/**
 * 建立全域暫存表（`SELECT ... INTO ##temp FROM ...`，I-MSSQL-TEMPTABLE-GLOBAL-01）。
 * v1.1：P4-spike 發現 `#local` 不跨 `queryRunner.query()` 存活（封鎖級，見 AD §1.3），改用 `##global`。
 *
 * @param tempTableName 呼叫端已含 `##` 前綴之完整暫存表名
 * @param selectSql     `SELECT ... FROM ...`（不含 INTO 子句，由本函式插入頂層 FROM 之前）
 */
export async function createMssqlTempTable(
  queryRunner: QueryRunner,
  tempTableName: string,
  selectSql: string,
): Promise<void> {
  await queryRunner.query(buildSelectIntoSql(tempTableName, selectSql));
}

/**
 * 內省暫存表欄位（`tempdb.sys.columns` + `OBJECT_ID`，I-MSSQL-TEMP-METADATA-01；對 `#`／`##` 皆適用）。
 * 依 `column_id` 序回傳，直接原樣映射 SQL `ORDER BY` 結果（不於 JS 端重新排序）。
 */
export async function getMssqlTempTableColumns(
  queryRunner: QueryRunner,
  tempTableName: string,
): Promise<MssqlTempTableColumn[]> {
  const rows = await queryRunner.query(
    `SELECT c.name AS column_name, c.column_id, t.name AS data_type
       FROM tempdb.sys.columns c
       JOIN tempdb.sys.types t ON c.user_type_id = t.user_type_id
      WHERE c.object_id = OBJECT_ID('tempdb..' + @0)
      ORDER BY c.column_id`,
    [tempTableName],
  );
  return rows.map((r: any) => ({
    name: r.column_name,
    columnId: r.column_id,
    dataType: r.data_type,
  }));
}

/**
 * 列數查詢（各 handler 共用，取代 PG 版 `SELECT COUNT(*)::int`；T-SQL 無 `::int` 語法）。
 */
export async function countMssqlTempTableRows(
  queryRunner: QueryRunner,
  tempTableName: string,
): Promise<number> {
  const rows = await queryRunner.query(`SELECT COUNT(*) AS cnt FROM ${tempTableName}`);
  return Number(rows[0].cnt);
}
