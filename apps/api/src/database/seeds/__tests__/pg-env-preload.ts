/**
 * B2 seed reconcile PG integration 前置：將 DB_TYPE 設為 'postgres'，使 entity 之
 * dateColumnType helper 於首次 import 時解析為 PG 型別（timestamp），讓 TypeORM
 * synchronize 可對真 Postgres 建表。
 *
 * ⚠️ 必須在任何 entity import 之前 import 本模組（side-effect import），因 column-types.ts
 *    於模組載入時一次性讀取 process.env.DB_TYPE（test/setup.ts 全域預設 'sqlite'，
 *    本檔覆寫為 'postgres'）。僅影響 .pg.spec.ts；其餘 spec 不 import，維持 sqlite。
 */
/** 記住覆寫前的值，供測試結束還原（避免污染同 worker 後續 spec — vitest 每檔重評 column-types）。 */
export const PREV_DB_TYPE = process.env.DB_TYPE;
process.env.DB_TYPE = 'postgres';

/** 還原 DB_TYPE（PG spec afterAll 呼叫）；不還原則同 worker 後續 SQLite spec 之 synchronize 會炸。 */
export function restoreDbType(): void {
  if (PREV_DB_TYPE === undefined) {
    delete process.env.DB_TYPE;
  } else {
    process.env.DB_TYPE = PREV_DB_TYPE;
  }
}
