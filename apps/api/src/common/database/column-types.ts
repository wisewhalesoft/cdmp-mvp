import type { ColumnType } from 'typeorm';

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
