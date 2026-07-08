/**
 * TypeORM CLI DataSource — 用於 migration:run / revert / show
 *
 * 用法：
 *   cd apps/api && npm run migration:run        # 套用所有未跑的 migration
 *   cd apps/api && npm run migration:revert     # 回滾最後一個 migration
 *   npm run typeorm -- migration:show           # 列出所有 migration 與狀態
 *
 * 環境變數：DB_HOST / DB_PORT / DB_USERNAME / DB_PASSWORD / DB_NAME（讀自 .env）
 *
 * 與 NestJS app.module.ts 的 TypeOrmModule.forRootAsync 區分：
 *   - app.module 用於應用程式啟動（dev 採 synchronize:true 不跑 migration）
 *   - 本檔僅供 typeorm CLI 跑 migration（不啟動 NestJS app）
 */

import 'reflect-metadata';
import { DataSource } from 'typeorm';
import * as fs from 'fs';
import * as path from 'path';

// 零依賴 minimal .env loader（避免 dotenv dep；不覆寫已存在的 process.env）
function loadDotEnv(envPath: string): void {
  if (!fs.existsSync(envPath)) return;
  const content = fs.readFileSync(envPath, 'utf-8');
  for (const line of content.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq < 0) continue;
    const key = trimmed.slice(0, eq).trim();
    const val = trimmed.slice(eq + 1).trim();
    if (!(key in process.env)) process.env[key] = val;
  }
}

// 優先 .env.cli（測試 / 手動跑 migration 用），fallback 至 .env
loadDotEnv(path.resolve(__dirname, '../../.env.cli'));
loadDotEnv(path.resolve(__dirname, '../../.env'));

// AD-E07-38 D-1：顯式依 DB_TYPE 切 postgres | mssql（CLI 不吃 sqlite 分支）。
const dbType = process.env.DB_TYPE === 'mssql' ? 'mssql' : 'postgres';
const defaultPort = dbType === 'mssql' ? '1433' : '5432';

// AD-E07-39 P1b2：兩軌 baseline 各自獨立 glob，互不撿取對方的 baseline migration。
//   - mssql：專屬子目錄 migrations/mssql/*（手寫 T-SQL baseline，MssqlBaselineSchema）。
//   - postgres：維持 migrations/*.{ts,js}（非遞迴、單層 * 不含子目錄 → 不會撿到 mssql baseline）。
// 若共用單一 glob，mssql migration:run 會嘗試跑 PG baseline（public schema / uuid / jsonb 等）→ 失敗，
// 且 typeorm_migrations 會多出非預期紀錄（違反 BASELINE-003「恰 1 筆」）。
const migrationsGlob =
  dbType === 'mssql'
    ? [path.join(__dirname, 'migrations', 'mssql', '*.{ts,js}')]
    : [path.join(__dirname, 'migrations', '*.{ts,js}')];

const commonOptions = {
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT || defaultPort, 10),
  username: process.env.DB_USERNAME || 'cdmp',
  password: process.env.DB_PASSWORD || 'cdmp_secret',
  database: process.env.DB_NAME || (dbType === 'mssql' ? 'CDMP' : 'cdmp_dev'),
  entities: [path.join(__dirname, 'entities', '*.entity.{ts,js}')],
  migrations: migrationsGlob,
  migrationsTableName: 'typeorm_migrations',
  synchronize: false, // CLI 跑 migration 時必須 false
  logging: (process.env.TYPEORM_LOG === 'true'
    ? ['query', 'error']
    : ['error']) as ('query' | 'error')[],
};

const AppDataSource =
  dbType === 'mssql'
    ? new DataSource({
        type: 'mssql',
        ...commonOptions,
        options: {
          encrypt: (process.env.DB_MSSQL_ENCRYPT || 'true') === 'true',
          trustServerCertificate:
            (process.env.DB_MSSQL_TRUST_CERT || 'true') === 'true',
          // AD-E07-43 P5h / I-MSSQL-DATE-TZ-01：顯式 useUTC:true（CLI migration:run 連線；
          //   與主應用/worker 連線語意一致，避免 date/datetime2 讀寫時區分歧）。理由同 app.module.ts。
          useUTC: true,
        },
      })
    : new DataSource({
        type: 'postgres',
        ...commonOptions,
      });

// typeorm CLI 預期 export default
export default AppDataSource;
