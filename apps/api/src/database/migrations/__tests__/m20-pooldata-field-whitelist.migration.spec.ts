/**
 * P1 B5 / m20 / F075 v1.3 / D-PFW-01：建立 pooldata_field_whitelist 表
 *
 * 測試策略（與 ob-card-type.migration.spec 同 pattern）：
 *   mock QueryRunner，驗證 up() / down() SQL 行為。
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import type { QueryRunner } from 'typeorm';
import { CreatePooldataFieldWhitelist1711360000200 } from '../1711360000200-CreatePooldataFieldWhitelist';

describe('Migration 1711360000200: CreatePooldataFieldWhitelist (D-PFW-01)', () => {
  let migration: CreatePooldataFieldWhitelist1711360000200;
  let queryRunner: {
    query: ReturnType<typeof vi.fn>;
    createTable: ReturnType<typeof vi.fn>;
    dropTable: ReturnType<typeof vi.fn>;
  };
  const originalDbType = process.env.DB_TYPE;

  beforeEach(() => {
    migration = new CreatePooldataFieldWhitelist1711360000200();
    queryRunner = {
      query: vi.fn().mockResolvedValue(undefined),
      createTable: vi.fn().mockResolvedValue(undefined),
      dropTable: vi.fn().mockResolvedValue(undefined),
    };
  });

  afterEach(() => {
    if (originalDbType === undefined) delete process.env.DB_TYPE;
    else process.env.DB_TYPE = originalDbType;
  });

  describe('up() — PostgreSQL', () => {
    beforeEach(() => {
      delete process.env.DB_TYPE;
    });

    it('TC-M20-001：建立 pooldata_field_whitelist 表，含 6 欄', async () => {
      await migration.up(queryRunner as unknown as QueryRunner);

      expect(queryRunner.createTable).toHaveBeenCalledTimes(1);
      const table = queryRunner.createTable.mock.calls[0][0];
      expect(table.name).toBe('pooldata_field_whitelist');
      const colNames = (table.columns as Array<{ name: string }>)
        .map((c) => c.name)
        .sort();
      expect(colNames).toEqual(
        [
          'column_name',
          'display_name',
          'field_type',
          'is_active',
          'created_at',
          'updated_at',
        ].sort(),
      );
    });

    it('TC-M20-002：column_name 為 PK', async () => {
      await migration.up(queryRunner as unknown as QueryRunner);
      const table = queryRunner.createTable.mock.calls[0][0];
      const pkCols = (
        table.columns as Array<{ name: string; isPrimary?: boolean }>
      )
        .filter((c) => c.isPrimary)
        .map((c) => c.name);
      expect(pkCols).toEqual(['column_name']);
    });

    it('TC-M20-003：PostgreSQL 加 field_type CHECK constraint', async () => {
      await migration.up(queryRunner as unknown as QueryRunner);
      const allSql = queryRunner.query.mock.calls.map((c) => c[0]).join('\n');
      expect(allSql).toMatch(/chk_pooldata_field_whitelist_field_type/i);
      expect(allSql).toMatch(
        /CHECK\s*\(\s*field_type\s+IN\s*\(\s*'numeric'\s*,\s*'categorical'\s*,\s*'date'\s*\)\s*\)/i,
      );
    });

    it('TC-M20-004：建立 idx_pooldata_field_whitelist_is_active 索引', async () => {
      await migration.up(queryRunner as unknown as QueryRunner);
      const allSql = queryRunner.query.mock.calls.map((c) => c[0]).join('\n');
      expect(allSql).toMatch(/idx_pooldata_field_whitelist_is_active/i);
    });
  });

  describe('up() — SQLite', () => {
    beforeEach(() => {
      process.env.DB_TYPE = 'sqlite';
    });

    it('TC-M20-005：SQLite 環境略過 PG 專屬 CHECK constraint', async () => {
      await migration.up(queryRunner as unknown as QueryRunner);
      const allSql = queryRunner.query.mock.calls.map((c) => c[0]).join('\n');
      expect(allSql).not.toMatch(/chk_pooldata_field_whitelist_field_type/i);
    });
  });

  describe('down()', () => {
    it('TC-M20-006：DROP TABLE pooldata_field_whitelist', async () => {
      await migration.down(queryRunner as unknown as QueryRunner);
      const droppedByApi = queryRunner.dropTable.mock.calls.some(
        (call) => call[0] === 'pooldata_field_whitelist',
      );
      const allSql = queryRunner.query.mock.calls.map((c) => c[0]).join('\n');
      const droppedBySql = /DROP\s+TABLE[^;]*pooldata_field_whitelist/i.test(allSql);
      expect(droppedByApi || droppedBySql).toBe(true);
    });
  });
});
