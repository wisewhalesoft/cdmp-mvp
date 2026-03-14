import type { ColumnType } from 'typeorm';

/**
 * Returns the correct date column type for the current database.
 * - PostgreSQL: 'timestamp'
 * - better-sqlite3: 'datetime'
 */
export const dateColumnType: ColumnType =
  process.env.DB_TYPE === 'sqlite' ? 'datetime' : 'timestamp';
