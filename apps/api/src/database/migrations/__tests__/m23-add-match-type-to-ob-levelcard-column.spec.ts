/**
 * TC-MIG-m23: AddMatchTypeToObLevelcardColumn migration
 * （F054 v1.3 / AD-E07-2 補充 / 2026-05-18）
 *
 * 對應 spec：
 *   - architecture-spec.md §AD-E07-2 補充（match_type 三分支計分）
 *   - data-model.md §ob_levelcard_column Migration 設計（v1.3）
 *
 * 涵蓋 case：
 *   1) up(): ADD COLUMN match_type VARCHAR(20) NULL
 *   2) up(): backfill UPDATE 依 ob_levelcard_score 推導 CATEGORY/RANGE
 *   3) up(): SET NOT NULL + ADD CHECK constraint（PostgreSQL only）
 *   4) up(): SQLite 環境略過 SET NOT NULL / CHECK
 *   5) up(): CHECK constraint 僅含 CATEGORY / RANGE / COMPOSITE 三正式值
 *   6) down(): DROP CONSTRAINT + DROP COLUMN（雙向可逆）
 *   7) up() 列舉值無 EXACT / NUMERIC / LITERAL 變體（防誤命名）
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import type { QueryRunner } from 'typeorm';
import { AddMatchTypeToObLevelcardColumn1711360000250 } from '../1711360000250-AddMatchTypeToObLevelcardColumn';

describe('Migration 1711360000250: AddMatchTypeToObLevelcardColumn (TC-MIG-m23)', () => {
  let migration: AddMatchTypeToObLevelcardColumn1711360000250;
  let queryRunner: {
    query: ReturnType<typeof vi.fn>;
  };
  const originalDbType = process.env.DB_TYPE;

  beforeEach(() => {
    migration = new AddMatchTypeToObLevelcardColumn1711360000250();
    queryRunner = {
      query: vi.fn().mockImplementation((sql: string) => {
        // assertion SELECT COUNT(*) 模擬回傳 0 列 NULL（backfill 成功）
        if (/SELECT\s+COUNT\(\*\)/i.test(sql)) {
          return Promise.resolve([{ cnt: 0 }]);
        }
        return Promise.resolve(undefined);
      }),
    };
  });

  afterEach(() => {
    if (originalDbType === undefined) {
      delete process.env.DB_TYPE;
    } else {
      process.env.DB_TYPE = originalDbType;
    }
  });

  describe('up() — PostgreSQL', () => {
    beforeEach(() => {
      delete process.env.DB_TYPE;
    });

    it('1) ADD COLUMN match_type VARCHAR(20) NULL', async () => {
      await migration.up(queryRunner as unknown as QueryRunner);
      const calls = queryRunner.query.mock.calls.map((c) => c[0] as string);
      const addSql = calls.find(
        (sql) =>
          /ALTER\s+TABLE\s+"?ob_levelcard_column"?\s+ADD\s+COLUMN\s+"?match_type"?\s+VARCHAR\s*\(\s*20\s*\)/i.test(
            sql,
          ),
      );
      expect(addSql).toBeDefined();
    });

    it('2) backfill UPDATE 依 ob_levelcard_score.level1 / level2_s 推導', async () => {
      await migration.up(queryRunner as unknown as QueryRunner);
      const calls = queryRunner.query.mock.calls.map((c) => c[0] as string);
      const updateSql = calls.find((sql) =>
        /UPDATE\s+"?ob_levelcard_column"?/i.test(sql),
      );
      expect(updateSql).toBeDefined();
      expect(updateSql).toMatch(/CATEGORY/);
      expect(updateSql).toMatch(/RANGE/);
      expect(updateSql).toMatch(/ob_levelcard_score/);
      expect(updateSql).toMatch(/level1/);
      expect(updateSql).toMatch(/level2_s/);
    });

    it('3) SET NOT NULL + ADD CHECK constraint', async () => {
      await migration.up(queryRunner as unknown as QueryRunner);
      const calls = queryRunner.query.mock.calls.map((c) => c[0] as string);

      const setNotNull = calls.find((sql) =>
        /ALTER\s+COLUMN\s+"?match_type"?\s+SET\s+NOT\s+NULL/i.test(sql),
      );
      expect(setNotNull).toBeDefined();

      const checkSql = calls.find((sql) =>
        /ADD\s+CONSTRAINT\s+"?chk_ob_levelcard_column_match_type"?/i.test(sql),
      );
      expect(checkSql).toBeDefined();
      expect(checkSql).toMatch(/CHECK/i);
    });

    it('5) CHECK constraint 僅含 CATEGORY / RANGE / COMPOSITE 三正式值', async () => {
      await migration.up(queryRunner as unknown as QueryRunner);
      const calls = queryRunner.query.mock.calls.map((c) => c[0] as string);
      const checkSql = calls.find((sql) =>
        /ADD\s+CONSTRAINT\s+"?chk_ob_levelcard_column_match_type"?/i.test(sql),
      );
      expect(checkSql).toMatch(/'CATEGORY'/);
      expect(checkSql).toMatch(/'RANGE'/);
      expect(checkSql).toMatch(/'COMPOSITE'/);
    });

    it('7) up() 不含 EXACT / NUMERIC / LITERAL 變體', async () => {
      await migration.up(queryRunner as unknown as QueryRunner);
      const allSql = queryRunner.query.mock.calls
        .map((c) => c[0] as string)
        .join('\n');
      expect(allSql).not.toMatch(/\bEXACT\b/);
      expect(allSql).not.toMatch(/\bNUMERIC\b/);
      expect(allSql).not.toMatch(/\bLITERAL\b/);
    });
  });

  describe('up() — SQLite', () => {
    beforeEach(() => {
      process.env.DB_TYPE = 'sqlite';
    });

    it('4) SQLite：略過 SET NOT NULL 與 CHECK constraint', async () => {
      await migration.up(queryRunner as unknown as QueryRunner);
      const calls = queryRunner.query.mock.calls.map((c) => c[0] as string);

      const setNotNull = calls.find((sql) =>
        /SET\s+NOT\s+NULL/i.test(sql),
      );
      expect(setNotNull).toBeUndefined();

      const checkSql = calls.find((sql) =>
        /chk_ob_levelcard_column_match_type/i.test(sql),
      );
      expect(checkSql).toBeUndefined();
    });

    it('4b) SQLite：仍執行 ADD COLUMN 與 backfill UPDATE', async () => {
      await migration.up(queryRunner as unknown as QueryRunner);
      const calls = queryRunner.query.mock.calls.map((c) => c[0] as string);

      const addSql = calls.find((sql) =>
        /ADD\s+COLUMN\s+"?match_type"?/i.test(sql),
      );
      expect(addSql).toBeDefined();

      const updateSql = calls.find((sql) =>
        /UPDATE\s+"?ob_levelcard_column"?/i.test(sql),
      );
      expect(updateSql).toBeDefined();
    });
  });

  describe('down() — 雙向可逆', () => {
    beforeEach(() => {
      delete process.env.DB_TYPE;
    });

    it('6) DROP CONSTRAINT + DROP COLUMN match_type', async () => {
      await migration.down(queryRunner as unknown as QueryRunner);
      const calls = queryRunner.query.mock.calls.map((c) => c[0] as string);

      const dropConstraint = calls.find((sql) =>
        /DROP\s+CONSTRAINT\s+(IF\s+EXISTS\s+)?"?chk_ob_levelcard_column_match_type"?/i.test(
          sql,
        ),
      );
      expect(dropConstraint).toBeDefined();

      const dropColumn = calls.find((sql) =>
        /DROP\s+COLUMN\s+(IF\s+EXISTS\s+)?"?match_type"?/i.test(sql),
      );
      expect(dropColumn).toBeDefined();
    });

    it('6b) down() 於 SQLite 僅 DROP COLUMN（無 CONSTRAINT 可 drop）', async () => {
      process.env.DB_TYPE = 'sqlite';
      await migration.down(queryRunner as unknown as QueryRunner);
      const calls = queryRunner.query.mock.calls.map((c) => c[0] as string);
      const dropColumn = calls.find((sql) =>
        /DROP\s+COLUMN\s+(IF\s+EXISTS\s+)?"?match_type"?/i.test(sql),
      );
      expect(dropColumn).toBeDefined();
    });
  });
});
