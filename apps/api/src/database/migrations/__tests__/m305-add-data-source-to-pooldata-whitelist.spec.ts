/**
 * TC-MIG-m305：AddDataSourceToPooldataFieldWhitelist（F109 / US-172 / AD-E07-37 §4.1）
 *
 * 對應 test spec（F109-test.md）：
 *   - WL-001：既有列 backfill data_source='ob_pool_data'（DEFAULT 自動套用）
 *   - MIGSEED-001：m305 重複執行不報錯（PG ADD COLUMN IF NOT EXISTS / SQLite PRAGMA guard）
 *
 * PG 分支以 mock queryRunner 斷言 SQL 形狀（ADD COLUMN IF NOT EXISTS + CHECK）；
 * SQLite 分支以 in-memory 功能驗證（ADD COLUMN + backfill + 冪等）。
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import type { QueryRunner } from 'typeorm';
import { DataSource } from 'typeorm';
import { AddDataSourceToPooldataFieldWhitelist1711360000305 } from '../1711360000305-AddDataSourceToPooldataFieldWhitelist';

describe('Migration m305: AddDataSourceToPooldataFieldWhitelist', () => {
  let migration: AddDataSourceToPooldataFieldWhitelist1711360000305;
  const originalDbType = process.env.DB_TYPE;

  beforeEach(() => {
    migration = new AddDataSourceToPooldataFieldWhitelist1711360000305();
  });

  afterEach(() => {
    if (originalDbType === undefined) delete process.env.DB_TYPE;
    else process.env.DB_TYPE = originalDbType;
  });

  describe('up() — PostgreSQL（mock SQL 形狀）', () => {
    beforeEach(() => {
      delete process.env.DB_TYPE;
    });

    it('WL-001 / AD §4.1：ADD COLUMN IF NOT EXISTS data_source VARCHAR(20) NOT NULL DEFAULT ob_pool_data + CHECK', async () => {
      const qr = { query: vi.fn().mockResolvedValue(undefined) };
      await migration.up(qr as unknown as QueryRunner);
      const sqls = qr.query.mock.calls.map((c) => c[0] as string);

      const addSql = sqls.find((s) => /ADD COLUMN IF NOT EXISTS data_source/i.test(s));
      expect(addSql).toBeDefined();
      expect(addSql).toMatch(/VARCHAR\(20\)/i);
      expect(addSql).toMatch(/NOT NULL/i);
      expect(addSql).toMatch(/DEFAULT '?ob_pool_data'?/i);

      const checkSql = sqls.find((s) => /chk_pooldata_whitelist_data_source/i.test(s));
      expect(checkSql).toBeDefined();
      expect(checkSql).toMatch(
        /data_source IN \(\s*'ob_pool_data'\s*,\s*'customer_core'\s*\)/i,
      );
    });
  });

  describe('up() — SQLite（in-memory 功能）', () => {
    beforeEach(() => {
      process.env.DB_TYPE = 'sqlite';
    });

    it('WL-001：既有列於 ADD COLUMN 後 backfill data_source=ob_pool_data；欄位 NOT NULL', async () => {
      const ds = await setupWhitelistNoDataSource();
      try {
        await ds.query(
          `INSERT INTO pooldata_field_whitelist (column_name, display_name, field_type, is_active, created_at, updated_at)
           VALUES ('prod_kind', '產品類別', 'categorical', 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
        );
        const qr = ds.createQueryRunner();
        await migration.up(qr);
        await qr.release();

        const rows = await ds.query<Array<{ column_name: string; data_source: string }>>(
          `SELECT column_name, data_source FROM pooldata_field_whitelist`,
        );
        expect(rows).toHaveLength(1);
        expect(rows[0].data_source).toBe('ob_pool_data');
      } finally {
        await ds.destroy();
      }
    });

    it('MIGSEED-001：重複執行 up() 不報錯（PRAGMA table_info guard，欄位已存在則跳過）', async () => {
      const ds = await setupWhitelistNoDataSource();
      try {
        const qr1 = ds.createQueryRunner();
        await migration.up(qr1);
        await qr1.release();
        const qr2 = ds.createQueryRunner();
        await expect(migration.up(qr2)).resolves.not.toThrow();
        await qr2.release();

        // 欄位仍只有一個 data_source
        const cols = await ds.query<Array<{ name: string }>>(
          `PRAGMA table_info('pooldata_field_whitelist')`,
        );
        expect(cols.filter((c) => c.name === 'data_source')).toHaveLength(1);
      } finally {
        await ds.destroy();
      }
    });
  });
});

async function setupWhitelistNoDataSource(): Promise<DataSource> {
  const ds = new DataSource({
    type: 'better-sqlite3',
    database: ':memory:',
    entities: [],
    synchronize: false,
  });
  await ds.initialize();
  await ds.query(`
    CREATE TABLE pooldata_field_whitelist (
      column_name VARCHAR(64) PRIMARY KEY,
      display_name VARCHAR(100) NOT NULL,
      field_type VARCHAR(20) NOT NULL,
      is_active INTEGER NOT NULL DEFAULT 1,
      is_system_fixed INTEGER NOT NULL DEFAULT 0,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `);
  return ds;
}
