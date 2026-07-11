import { DataSource } from 'typeorm';

/** 合法資料表識別字（防止 SQLite 分支之表名字串內插注入；表名一律來自 DB 管理之 pipeline 定義）。 */
const SAFE_IDENT = /^[A-Za-z_][A-Za-z0-9_]*$/;

/**
 * 取多張資料表的「真實筆數」（快速 metadata 查詢，非 `COUNT(*)` 全表掃描）。
 *
 * - MSSQL：`sys.partitions.rows`（維護於 DML，對使用者表為精確值；大表亦毫秒回，避免 7.9M 全掃）。
 * - SQLite（測試）：逐表 `COUNT(*)`（測試資料量小）。
 *
 * 查無之表回 0。用於 ETL 目標表現況顯示 + 月跑準備度「空表」檢查（0 = 表為空 / 未載入）。
 */
export async function getTableRowCounts(
  ds: DataSource,
  tableNames: string[],
): Promise<Map<string, number>> {
  const out = new Map<string, number>();
  const names = Array.from(new Set(tableNames.filter((t) => SAFE_IDENT.test(t))));
  if (names.length === 0) return out;

  const dbType = ds.options.type;
  if (dbType === 'mssql') {
    const placeholders = names.map((_, i) => `@${i}`).join(', ');
    const rows: Array<{ tbl: string; n: string | number }> = await ds.query(
      `SELECT t.name AS tbl, SUM(p.rows) AS n
         FROM sys.tables t
         JOIN sys.partitions p ON p.object_id = t.object_id AND p.index_id IN (0, 1)
        WHERE t.name IN (${placeholders})
        GROUP BY t.name`,
      names,
    );
    for (const r of rows) out.set(r.tbl, Number(r.n));
  } else {
    // sqlite（測試）：逐表 COUNT(*)（表名已通過 SAFE_IDENT 驗證）。
    for (const t of names) {
      try {
        const r: Array<{ n: number }> = await ds.query(
          `SELECT COUNT(*) AS n FROM "${t}"`,
        );
        out.set(t, Number(r[0]?.n ?? 0));
      } catch {
        out.set(t, 0); // 表不存在 → 0
      }
    }
  }

  for (const t of names) if (!out.has(t)) out.set(t, 0); // 查無 → 0
  return out;
}
