import type { ColumnType } from 'typeorm';
import type { PrimaryGeneratedColumnType } from 'typeorm/driver/types/ColumnTypes';

/**
 * Returns the correct date column type for the current database.
 * - PostgreSQL: 'timestamp'
 * - better-sqlite3: 'datetime'
 */
export const dateColumnType: ColumnType =
  process.env.DB_TYPE === 'sqlite' ? 'datetime' : 'timestamp';

/**
 * Returns a JSON column type compatible with the current database.
 * - PostgreSQL: 'jsonb'（native）
 * - better-sqlite3: 'simple-json'（TypeORM 內建 portable，序列化為 TEXT）
 *
 * F068 / E2E sqlite 相容用：assignment_audit_log.before_value / after_value
 */
export const jsonColumnType: ColumnType =
  process.env.DB_TYPE === 'sqlite' ? 'simple-json' : 'jsonb';

/**
 * Surrogate PK 型別（@PrimaryGeneratedColumn）。
 * - PostgreSQL: 'bigint'（業務真機，64-bit ID 空間）
 * - better-sqlite3: 'integer'（sqlite AUTOINCREMENT 僅允許 INTEGER PRIMARY KEY）
 *
 * F053~F056 e2e 相容用：4 個 ob_levelcard_* 與 ob_tier surrogate PK。
 */
export const surrogatePkType: PrimaryGeneratedColumnType =
  process.env.DB_TYPE === 'sqlite' ? 'integer' : 'bigint';
