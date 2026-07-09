/**
 * AD-E07-38 P1a — MSSQL integration 前置（比照 stage1/__tests__/pg-env-preload.ts）。
 *
 * 目的：將 DB_TYPE 設為 'mssql'，使 entity 之 dateColumnType / jsonColumnType / surrogatePkType
 * helper 於首次 import 時解析為 MSSQL 分支值（datetime2 / simple-json / bigint），
 * 讓 TypeORM synchronize 可對真 SQL Server 建表。
 *
 * ⚠️ 必須在任何 entity import 之前 import 本模組（side-effect import），因 column-types.ts 於模組載入時
 *    一次性讀取 process.env.DB_TYPE（test/setup.ts 全域預設 'sqlite'，本檔覆寫為 'mssql'）。
 *    僅影響 .mssql.spec.ts；其餘 spec 不 import 本模組，維持 sqlite。
 */
import * as net from 'net';
import * as dotenv from 'dotenv';

/**
 * 載入本機/dev MSSQL 連線（`apps/api/.env.test.mssql`，gitignored、密碼不入版控；範本見 `.env.test.mssql.example`）。
 * dotenv 預設「不覆寫已存在的 env」→ inline env / CI 提供的值優先，本檔僅補未設者；
 * 兩者皆無時，下方 MSSQL 物件的內建預設（localhost:1433 / CDMP_TEST）作最終 fallback。
 * 對指向新 dev / prod MSSQL：只需改 `.env.test.mssql` 單一處，所有 *.mssql.spec.ts 自動沿用。
 */
dotenv.config({ path: '.env.test.mssql' });

/** 記住覆寫前的值，供測試結束還原（避免污染同 worker 後續 SQLite spec 之 synchronize）。 */
export const PREV_DB_TYPE = process.env.DB_TYPE;
process.env.DB_TYPE = 'mssql';

/** 還原 DB_TYPE（MSSQL spec afterAll 呼叫）；不還原則同 worker 後續 SQLite spec 之 synchronize 會炸。 */
export function restoreDbType(): void {
  if (PREV_DB_TYPE === undefined) {
    delete process.env.DB_TYPE;
  } else {
    process.env.DB_TYPE = PREV_DB_TYPE;
  }
}

/**
 * 本機 dev / test 容器連線資訊（沿用 P0 起的 docker compose --profile mssql）。
 * DB_NAME 預設 CDMP_TEST（與 dev CDMP 隔離，見 R-MSSQL-P1A-01）。
 */
export const MSSQL = {
  host: process.env.MSSQL_TEST_HOST ?? process.env.DB_HOST ?? 'localhost',
  port: Number(process.env.MSSQL_TEST_PORT ?? process.env.DB_PORT ?? 1433),
  username: process.env.MSSQL_TEST_USER ?? process.env.DB_USERNAME ?? 'cdmp',
  password: process.env.MSSQL_TEST_PASSWORD ?? process.env.DB_PASSWORD ?? 'Cdmp_Dev_2026!',
  database: process.env.MSSQL_TEST_DB ?? 'CDMP_TEST',
  encrypt:
    (process.env.DB_MSSQL_ENCRYPT ?? 'true') === 'true',
  trustServerCertificate:
    (process.env.DB_MSSQL_TRUST_CERT ?? 'true') === 'true',
};

export const SKIP_REASON =
  '需 MSSQL（docker compose --profile mssql up -d mssql mssql-init）— 未實跑';

/**
 * TCP 連線可達性檢查（比照 pgPortReachable）。逾時 / 錯誤視為不可達 → describe.skip 全檔。
 */
export function mssqlPortReachable(timeoutMs = 1000): Promise<boolean> {
  return new Promise((resolve) => {
    const sock = net.connect({ host: MSSQL.host, port: MSSQL.port });
    const finish = (ok: boolean) => {
      sock.destroy();
      resolve(ok);
    };
    sock.setTimeout(timeoutMs);
    sock.once('connect', () => finish(true));
    sock.once('error', () => finish(false));
    sock.once('timeout', () => finish(false));
  });
}
