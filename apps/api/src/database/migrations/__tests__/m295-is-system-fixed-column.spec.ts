/**
 * TC-MIG-m295：AddIsSystemFixedToPooldataFieldWhitelist migration（M-B1）
 *   US-144 / AD-E07-18 §18.12.9
 *
 * 對應 test spec（F050-test.md §十六 O 群組）：
 *   - TS-F050-O01：up() PG ADD COLUMN is_system_fixed BOOLEAN NOT NULL DEFAULT false
 *   - TS-F050-O02：up() PG UPDATE best_case=true，ADD COLUMN 先於 UPDATE
 *   - TS-F050-O03：functional SQLite — best_case=true / prod_kind=false
 *   - TS-F050-O04：idempotent — 連續 2 次無 error，best_case 仍 true
 *   - TS-F050-O05：up() SQLite 使用 ALTER TABLE ... ADD COLUMN
 *   - TS-F050-O06：down() 移除 is_system_fixed 欄位
 *
 * cross-ref：F075-test.md §十 TS-F075-v17-001（seed 正確性）
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import type { QueryRunner } from 'typeorm';
import { DataSource } from 'typeorm';
import { AddIsSystemFixedToPooldataFieldWhitelist1711360000295 } from '../1711360000295-AddIsSystemFixedToPooldataFieldWhitelist';

describe('Migration 1711360000295: AddIsSystemFixedToPooldataFieldWhitelist (TS-F050-O01~O06)', () => {
  let migration: AddIsSystemFixedToPooldataFieldWhitelist1711360000295;
  let queryRunner: { query: ReturnType<typeof vi.fn> };
  const originalDbType = process.env.DB_TYPE;

  beforeEach(() => {
    migration = new AddIsSystemFixedToPooldataFieldWhitelist1711360000295();
    queryRunner = { query: vi.fn().mockResolvedValue([]) };
  });

  afterEach(() => {
    if (originalDbType === undefined) delete process.env.DB_TYPE;
    else process.env.DB_TYPE = originalDbType;
  });

  describe('up() — PostgreSQL (mock queryRunner)', () => {
    beforeEach(() => {
      delete process.env.DB_TYPE;
    });

    it('TS-F050-O01：ADD COLUMN is_system_fixed BOOLEAN NOT NULL DEFAULT false', async () => {
      await migration.up(queryRunner as unknown as QueryRunner);
      const sqls = queryRunner.query.mock.calls.map((c) => c[0] as string);
      const addColumnSql = sqls.find(
        (s) =>
          /ALTER\s+TABLE\s+pooldata_field_whitelist\s+ADD\s+COLUMN/i.test(s) &&
          /is_system_fixed/i.test(s),
      );
      expect(addColumnSql).toBeDefined();
      expect(addColumnSql).toMatch(/BOOLEAN/i);
      expect(addColumnSql).toMatch(/NOT\s+NULL/i);
      expect(addColumnSql).toMatch(/DEFAULT\s+false/i);
    });

    it('TS-F050-O02：UPDATE best_case=true，ADD COLUMN 索引 < UPDATE 索引', async () => {
      await migration.up(queryRunner as unknown as QueryRunner);
      const sqls = queryRunner.query.mock.calls.map((c) => c[0] as string);

      const addIdx = sqls.findIndex(
        (s) =>
          /ADD\s+COLUMN/i.test(s) && /is_system_fixed/i.test(s),
      );
      const updateBestCaseIdx = sqls.findIndex(
        (s) =>
          /UPDATE\s+pooldata_field_whitelist/i.test(s) &&
          /is_system_fixed\s*=\s*true/i.test(s) &&
          /'best_case'/.test(s),
      );

      expect(addIdx).toBeGreaterThanOrEqual(0);
      expect(updateBestCaseIdx).toBeGreaterThanOrEqual(0);
      expect(addIdx).toBeLessThan(updateBestCaseIdx);
    });
  });

  describe('up() — SQLite (mock queryRunner)', () => {
    beforeEach(() => {
      process.env.DB_TYPE = 'sqlite';
      // PRAGMA table_info 回傳不含 is_system_fixed → guard 觸發 ADD COLUMN
      queryRunner.query = vi.fn(async (sql: string) => {
        if (/PRAGMA\s+table_info/i.test(sql)) {
          return [{ name: 'column_name' }, { name: 'is_active' }];
        }
        return [];
      });
    });

    it('TS-F050-O05：使用 ALTER TABLE ... ADD COLUMN（SQLite 支援）', async () => {
      await migration.up(queryRunner as unknown as QueryRunner);
      const sqls = queryRunner.query.mock.calls.map((c) => c[0] as string);
      const addColumnSql = sqls.find(
        (s) =>
          /ALTER\s+TABLE\s+pooldata_field_whitelist\s+ADD\s+COLUMN/i.test(s) &&
          /is_system_fixed/i.test(s),
      );
      expect(addColumnSql).toBeDefined();
      // SQLite 不可使用 IF NOT EXISTS 於 ADD COLUMN（靠 PRAGMA guard）
      expect(addColumnSql).not.toMatch(/IF\s+NOT\s+EXISTS/i);
    });
  });

  describe('down() (mock queryRunner)', () => {
    beforeEach(() => {
      delete process.env.DB_TYPE;
    });

    it('TS-F050-O06：down() 移除 is_system_fixed 欄位（PG DROP COLUMN）', async () => {
      await migration.down(queryRunner as unknown as QueryRunner);
      const sqls = queryRunner.query.mock.calls.map((c) => c[0] as string);
      const dropSql = sqls.find(
        (s) =>
          /ALTER\s+TABLE\s+pooldata_field_whitelist\s+DROP\s+COLUMN/i.test(s) &&
          /is_system_fixed/i.test(s),
      );
      expect(dropSql).toBeDefined();
    });
  });

  describe('functional: SQLite in-memory', () => {
    it('TS-F050-O03：執行後 best_case.is_system_fixed=true；prod_kind.is_system_fixed=false', async () => {
      process.env.DB_TYPE = 'sqlite';
      const ds = await setupSqlite();
      try {
        const qr = ds.createQueryRunner();
        await migration.up(qr);
        await qr.release();

        const bestCase = await ds.query<Array<{ is_system_fixed: number }>>(
          `SELECT is_system_fixed FROM pooldata_field_whitelist WHERE column_name = 'best_case'`,
        );
        const prodKind = await ds.query<Array<{ is_system_fixed: number }>>(
          `SELECT is_system_fixed FROM pooldata_field_whitelist WHERE column_name = 'prod_kind'`,
        );
        expect(Number(bestCase[0].is_system_fixed)).toBe(1);
        expect(Number(prodKind[0].is_system_fixed)).toBe(0);
      } finally {
        await ds.destroy();
      }
    });

    it('TS-F050-O04：idempotent — 連續執行 2 次無 error；best_case 仍 true', async () => {
      process.env.DB_TYPE = 'sqlite';
      const ds = await setupSqlite();
      try {
        const qr1 = ds.createQueryRunner();
        await migration.up(qr1);
        await qr1.release();
        const qr2 = ds.createQueryRunner();
        await migration.up(qr2);
        await qr2.release();

        const bestCase = await ds.query<Array<{ is_system_fixed: number }>>(
          `SELECT is_system_fixed FROM pooldata_field_whitelist WHERE column_name = 'best_case'`,
        );
        expect(Number(bestCase[0].is_system_fixed)).toBe(1);

        // 欄位仍只有一個（PRAGMA guard 防重複 ADD COLUMN）
        const columns = await ds.query<Array<{ name: string }>>(
          `PRAGMA table_info(pooldata_field_whitelist)`,
        );
        const isfCount = columns.filter((c) => c.name === 'is_system_fixed').length;
        expect(isfCount).toBe(1);
      } finally {
        await ds.destroy();
      }
    });

    it('TS-F050-O06b：down() functional — 移除 is_system_fixed 欄位（SQLite 表內不再存在該欄）', async () => {
      process.env.DB_TYPE = 'sqlite';
      const ds = await setupSqlite();
      try {
        const qrUp = ds.createQueryRunner();
        await migration.up(qrUp);
        await qrUp.release();
        const qrDown = ds.createQueryRunner();
        await migration.down(qrDown);
        await qrDown.release();

        const columns = await ds.query<Array<{ name: string }>>(
          `PRAGMA table_info(pooldata_field_whitelist)`,
        );
        expect(columns.some((c) => c.name === 'is_system_fixed')).toBe(false);
      } finally {
        await ds.destroy();
      }
    });
  });
});

async function setupSqlite(): Promise<DataSource> {
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
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `);
  await ds.query(
    `INSERT INTO pooldata_field_whitelist (column_name, display_name, field_type, is_active, created_at, updated_at)
     VALUES ('best_case', '優質案件', 'categorical', 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
  );
  await ds.query(
    `INSERT INTO pooldata_field_whitelist (column_name, display_name, field_type, is_active, created_at, updated_at)
     VALUES ('prod_kind', '產品類別', 'categorical', 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
  );
  return ds;
}
