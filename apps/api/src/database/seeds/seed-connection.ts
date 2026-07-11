/**
 * AD-E07-39 P1b3 — Seed 腳本共用連線 + 跨 driver 可攜 raw SQL 輔助。
 *
 * 三支 seed 腳本（seed.ts / seed-datasource.ts / prod-data-seed.ts）原本各自硬編碼
 * `new DataSource({ type: 'postgres', ... })`，完全無視 `DB_TYPE`（比 raw SQL 語法問題更早
 * 阻擋 MSSQL 執行）。本模組集中提供：
 *   1. seedConnectionOptions()：依 `DB_TYPE` 產生 postgres / mssql 連線設定（比照 data-source.ts）。
 *   2. bindSql() / pquery()：把可攜 `?` 佔位符轉為當前 driver 原生佔位（pg `$1..` / mssql `@0..`），
 *      使同一份 SQL 字串可同時服務 PostgreSQL 與 SQL Server（cutover 前 PG 不可壞）。
 *   3. top1()：`LIMIT 1`（pg）vs `TOP(1)`（mssql）之可攜「取一列」語法（避免 `LIMIT` 於 MSSQL 語法錯誤）。
 *
 * 註：`IS NOT DISTINCT FROM`（PG 專屬）之可攜化採「依值是否為 NULL 條件產生 `col IS NULL` / `col = ?`」
 *     在呼叫端（prod-data-seed.ts keyMatch）處理——不可用 `? IS NULL`（PG 對此參數無型別錨點會拋錯）。
 */
import type { QueryRunner } from 'typeorm';

export function isMssql(): boolean {
  return process.env.DB_TYPE === 'mssql';
}

/**
 * 回傳 seed 用連線設定（MSSQL 全面遷移後僅支援 mssql；比照 `data-source.ts`）。
 * 呼叫端自行補上 entities / synchronize（各腳本需求不同）。
 */
export function seedConnectionOptions(): Record<string, unknown> {
  return {
    type: 'mssql',
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT || '1433', 10),
    username: process.env.DB_USERNAME || 'cdmp',
    password: process.env.DB_PASSWORD || 'cdmp_secret',
    database: process.env.DB_NAME || 'CDMP',
    // P6c / I-MSSQL-REQ-TIMEOUT-01：tedious 預設 15s 對 seed 大批寫入不足。
    //   env DB_MSSQL_REQUEST_TIMEOUT 覆蓋（預設 1hr）。理由同 data-source.ts。
    requestTimeout: Number(process.env.DB_MSSQL_REQUEST_TIMEOUT ?? 3600000),
    options: {
      encrypt: (process.env.DB_MSSQL_ENCRYPT || 'true') === 'true',
      trustServerCertificate: (process.env.DB_MSSQL_TRUST_CERT || 'true') === 'true',
      // AD-E07-43 P5h / I-MSSQL-DATE-TZ-01：顯式 useUTC:true（seed 腳本連線；
      //   與主應用/worker/CLI 連線語意一致）。理由同 data-source.ts。
      useUTC: true,
    },
  };
}

/**
 * 將可攜 `?` 佔位符依序轉為當前 driver 原生佔位。
 *   - postgres：`$1, $2, ...`（1-based）
 *   - mssql：`@0, @1, ...`（0-based，TypeORM mssql driver 慣例）
 * 參數陣列順序不變（呼叫端照 `?` 出現順序 push）。
 */
export function bindSql(sql: string): string {
  const mssql = isMssql();
  let n = 0;
  return sql.replace(/\?/g, () => (mssql ? `@${n++}` : `$${++n}`));
}

/** 執行以可攜 `?` 為佔位符的查詢（driver-agnostic）。 */
export function pquery(
  qr: QueryRunner,
  sql: string,
  params: unknown[] = [],
): Promise<any> {
  return qr.query(bindSql(sql), params);
}

/**
 * 「取一列」可攜語法。回傳 { prefix, suffix }：
 *   - postgres：{ prefix:'', suffix:' LIMIT 1' }
 *   - mssql：{ prefix:'TOP(1) ', suffix:'' }（TOP 置於欄位清單前；含 ORDER BY 時仍取排序後首列）
 * 用法：`SELECT ${top1().prefix}id FROM t WHERE ...${top1().suffix}`
 */
export function top1(): { prefix: string; suffix: string } {
  return isMssql()
    ? { prefix: 'TOP(1) ', suffix: '' }
    : { prefix: '', suffix: ' LIMIT 1' };
}
