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
