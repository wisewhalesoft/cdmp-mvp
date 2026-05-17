/**
 * P1 B5 / m21 / F076 v1.3 / D-PFO-01：建立 pooldata_field_option 表（複合 PK + FK CASCADE）
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import type { QueryRunner } from 'typeorm';
import { CreatePooldataFieldOption1711360000210 } from '../1711360000210-CreatePooldataFieldOption';

describe('Migration 1711360000210: CreatePooldataFieldOption (D-PFO-01)', () => {
  let migration: CreatePooldataFieldOption1711360000210;
  let queryRunner: {
    query: ReturnType<typeof vi.fn>;
    createTable: ReturnType<typeof vi.fn>;
    dropTable: ReturnType<typeof vi.fn>;
  };
  const originalDbType = process.env.DB_TYPE;

  beforeEach(() => {
    migration = new CreatePooldataFieldOption1711360000210();
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

    it('TC-M21-001：建立 pooldata_field_option 表，含 7 欄', async () => {
      await migration.up(queryRunner as unknown as QueryRunner);
      expect(queryRunner.createTable).toHaveBeenCalledTimes(1);
      const table = queryRunner.createTable.mock.calls[0][0];
      expect(table.name).toBe('pooldata_field_option');
      const colNames = (table.columns as Array<{ name: string }>)
        .map((c) => c.name)
        .sort();
      expect(colNames).toEqual(
        [
          'column_name',
          'option_value',
          'option_label',
          'is_active',
          'deactivation_reason',
          'created_at',
          'updated_at',
        ].sort(),
      );
    });

    it('TC-M21-002：複合 PK = (column_name, option_value)', async () => {
      await migration.up(queryRunner as unknown as QueryRunner);
      const table = queryRunner.createTable.mock.calls[0][0];
      const pkCols = (
        table.columns as Array<{ name: string; isPrimary?: boolean }>
      )
        .filter((c) => c.isPrimary)
        .map((c) => c.name)
        .sort();
      expect(pkCols).toEqual(['column_name', 'option_value']);
    });

    it('TC-M21-003：FK column_name → pooldata_field_whitelist + ON DELETE CASCADE', async () => {
      await migration.up(queryRunner as unknown as QueryRunner);
      const table = queryRunner.createTable.mock.calls[0][0];
      expect(table.foreignKeys).toBeDefined();
      const fk = (table.foreignKeys as Array<any>).find(
        (k) => k.columnNames?.includes('column_name'),
      );
      expect(fk).toBeDefined();
      expect(fk.referencedTableName).toBe('pooldata_field_whitelist');
      expect(fk.referencedColumnNames).toEqual(['column_name']);
      expect(fk.onDelete).toBe('CASCADE');
    });

    it('TC-M21-004：PostgreSQL 加 deactivation_reason CHECK constraint', async () => {
      await migration.up(queryRunner as unknown as QueryRunner);
      const allSql = queryRunner.query.mock.calls.map((c) => c[0]).join('\n');
      expect(allSql).toMatch(/chk_pooldata_field_option_deactivation_reason/i);
      expect(allSql).toMatch(/deactivation_reason\s+IS\s+NULL/i);
      expect(allSql).toMatch(/'manual'/);
      expect(allSql).toMatch(/'field_type_changed'/);
    });

    it('TC-M21-005：建立 idx_pooldata_field_option_column_active 複合索引', async () => {
      await migration.up(queryRunner as unknown as QueryRunner);
      const allSql = queryRunner.query.mock.calls.map((c) => c[0]).join('\n');
      expect(allSql).toMatch(/idx_pooldata_field_option_column_active/i);
      expect(allSql).toMatch(/\(\s*column_name\s*,\s*is_active\s*\)/i);
    });

    it('TC-M21-006：deactivation_reason 欄位 nullable', async () => {
      await migration.up(queryRunner as unknown as QueryRunner);
      const table = queryRunner.createTable.mock.calls[0][0];
      const col = (
        table.columns as Array<{ name: string; isNullable?: boolean }>
      ).find((c) => c.name === 'deactivation_reason');
      expect(col?.isNullable).toBe(true);
    });
  });

  describe('up() — SQLite', () => {
    beforeEach(() => {
      process.env.DB_TYPE = 'sqlite';
    });

    it('TC-M21-007：SQLite 環境略過 PG 專屬 CHECK constraint', async () => {
      await migration.up(queryRunner as unknown as QueryRunner);
      const allSql = queryRunner.query.mock.calls.map((c) => c[0]).join('\n');
      expect(allSql).not.toMatch(/chk_pooldata_field_option_deactivation_reason/i);
    });
  });

  describe('down()', () => {
    it('TC-M21-008：DROP TABLE pooldata_field_option', async () => {
      await migration.down(queryRunner as unknown as QueryRunner);
      const droppedByApi = queryRunner.dropTable.mock.calls.some(
        (call) => call[0] === 'pooldata_field_option',
      );
      const allSql = queryRunner.query.mock.calls.map((c) => c[0]).join('\n');
      const droppedBySql = /DROP\s+TABLE[^;]*pooldata_field_option/i.test(allSql);
      expect(droppedByApi || droppedBySql).toBe(true);
    });
  });
});
