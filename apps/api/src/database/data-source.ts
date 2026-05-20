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

const AppDataSource = new DataSource({
  type: 'postgres',
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT || '5432', 10),
  username: process.env.DB_USERNAME || 'cdmp',
  password: process.env.DB_PASSWORD || 'cdmp_secret',
  database: process.env.DB_NAME || 'cdmp_dev',
  entities: [path.join(__dirname, 'entities', '*.entity.{ts,js}')],
  migrations: [path.join(__dirname, 'migrations', '*.{ts,js}')],
  migrationsTableName: 'typeorm_migrations',
  synchronize: false, // CLI 跑 migration 時必須 false
  logging: process.env.TYPEORM_LOG === 'true' ? ['query', 'error'] : ['error'],
});

// typeorm CLI 預期 export default
export default AppDataSource;
