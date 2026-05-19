/**
 * m28 / F075 v1.4.6 / F076 v1.4.6：對齊舊系統 OBZ020 之 5 欄篩選欄位
 *
 * 涵蓋 cases：
 *   - up()：DELETE 3 欄（best_case / month_cnt / payt_term）之 option + whitelist；先 option 再 whitelist（FK 安全）
 *   - up()：belt-and-braces 重 seed 5 個保留欄位（idempotent ON CONFLICT / INSERT OR IGNORE）
 *   - up()：不誤刪 5 個保留欄位之 option（DELETE 限定 IN clause）
 *   - up()：PostgreSQL 用 ON CONFLICT (column_name) DO NOTHING；SQLite 用 INSERT OR IGNORE
 *   - down()：還原 3 筆 whitelist + best_case Y/N options（idempotent）
 *   - down()：payt_term is_active=false（沿用 m22 v1.4.3 stance）
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import type { QueryRunner } from 'typeorm';
import { RealignWhitelistToObz0201711360000280 } from '../1711360000280-RealignWhitelistToObz020';

describe('Migration 1711360000280: RealignWhitelistToObz020 (F075/F076 v1.4.6)', () => {
  let migration: RealignWhitelistToObz0201711360000280;
  let queryRunner: { query: ReturnType<typeof vi.fn> };
  const originalDbType = process.env.DB_TYPE;

  beforeEach(() => {
    migration = new RealignWhitelistToObz0201711360000280();
    queryRunner = { query: vi.fn().mockResolvedValue(undefined) };
  });

  afterEach(() => {
    if (originalDbType === undefined) delete process.env.DB_TYPE;
    else process.env.DB_TYPE = originalDbType;
  });

  describe('up() — PostgreSQL', () => {
    beforeEach(() => {
      delete process.env.DB_TYPE;
    });

    it('TC-M28-001：DELETE option 必須先於 DELETE whitelist（FK 安全）', async () => {
      await migration.up(queryRunner as unknown as QueryRunner);
      const sqls = queryRunner.query.mock.calls.map((c) => c[0] as string);

      const optionDeleteIdx = sqls.findIndex((s) =>
        /DELETE\s+FROM\s+pooldata_field_option/i.test(s),
      );
      const fieldDeleteIdx = sqls.findIndex((s) =>
        /DELETE\s+FROM\s+pooldata_field_whitelist/i.test(s),
      );

      expect(optionDeleteIdx).toBeGreaterThanOrEqual(0);
      expect(fieldDeleteIdx).toBeGreaterThanOrEqual(0);
      expect(optionDeleteIdx).toBeLessThan(fieldDeleteIdx);
    });

    it('TC-M28-002：DELETE IN clause 涵蓋 best_case / month_cnt / payt_term', async () => {
      await migration.up(queryRunner as unknown as QueryRunner);
      const allSql = queryRunner.query.mock.calls.map((c) => c[0]).join('\n');
      const deletes = allSql
        .split('\n')
        .filter((line) => /DELETE\s+FROM/i.test(line))
        .join('\n');
      const allDeleteSql = queryRunner.query.mock.calls
        .map((c) => c[0] as string)
        .filter((s) => /DELETE\s+FROM/i.test(s))
        .join('\n');

      for (const f of ['best_case', 'month_cnt', 'payt_term']) {
        expect(allDeleteSql).toMatch(new RegExp(`'${f}'`));
      }
      // 不洩漏 sentinel
      expect(deletes.length).toBeGreaterThan(0);
    });

    it('TC-M28-003：DELETE 不可動到 5 個保留欄位之 option（IN clause 限定）', async () => {
      await migration.up(queryRunner as unknown as QueryRunner);
      const allDeleteSql = queryRunner.query.mock.calls
        .map((c) => c[0] as string)
        .filter((s) => /DELETE\s+FROM/i.test(s))
        .join('\n');

      for (const f of ['prod_kind', 'list_type', 'spec_tp', 'caseyear', 'settle_src']) {
        expect(allDeleteSql).not.toMatch(new RegExp(`'${f}'`));
      }
    });

    it('TC-M28-004：belt-and-braces 重 seed 5 個保留欄位（INSERT ... ON CONFLICT DO NOTHING）', async () => {
      await migration.up(queryRunner as unknown as QueryRunner);
      const allSql = queryRunner.query.mock.calls.map((c) => c[0]).join('\n');

      for (const f of ['prod_kind', 'list_type', 'spec_tp', 'caseyear', 'settle_src']) {
        expect(allSql).toMatch(
          new RegExp(`INSERT[^;]*pooldata_field_whitelist[^;]*'${f}'[^;]*'categorical'`, 'i'),
        );
      }
      expect(allSql).toMatch(/ON\s+CONFLICT\s*\(\s*column_name\s*\)\s+DO\s+NOTHING/i);
    });

    it('TC-M28-005：重 seed 5 欄位之 is_active 皆為 TRUE（v1.4.6 全部啟用）', async () => {
      await migration.up(queryRunner as unknown as QueryRunner);
      const inserts = queryRunner.query.mock.calls
        .map((c) => c[0] as string)
        .filter((s) => /INSERT[^;]*pooldata_field_whitelist/i.test(s));

      // 5 個保留欄位都應有 INSERT 且 is_active = TRUE
      const fieldInsertMap = new Map<string, string>();
      for (const sql of inserts) {
        const match = sql.match(/'(prod_kind|list_type|spec_tp|caseyear|settle_src)'/);
        if (match) fieldInsertMap.set(match[1], sql);
      }
      expect(fieldInsertMap.size).toBe(5);

      for (const sql of fieldInsertMap.values()) {
        expect(sql).toMatch(/TRUE/);
        expect(sql).not.toMatch(/FALSE/);
      }
    });

    it('TC-M28-006：本 migration 不重 seed 5 欄位之 option（只動 whitelist；m22 既有 option 保留）', async () => {
      await migration.up(queryRunner as unknown as QueryRunner);
      const allSql = queryRunner.query.mock.calls.map((c) => c[0]).join('\n');
      // up() 只應 INSERT pooldata_field_whitelist，不應 INSERT pooldata_field_option
      expect(allSql).not.toMatch(/INSERT[^;]*pooldata_field_option/i);
    });
  });

  describe('up() — SQLite', () => {
    beforeEach(() => {
      process.env.DB_TYPE = 'sqlite';
    });

    it('TC-M28-007：SQLite 採 INSERT OR IGNORE（無 ON CONFLICT）', async () => {
      await migration.up(queryRunner as unknown as QueryRunner);
      const allSql = queryRunner.query.mock.calls.map((c) => c[0]).join('\n');
      expect(allSql).toMatch(/INSERT\s+OR\s+IGNORE\s+INTO\s+pooldata_field_whitelist/i);
      expect(allSql).not.toMatch(/ON\s+CONFLICT/i);
    });
  });

  describe('down()', () => {
    beforeEach(() => {
      delete process.env.DB_TYPE;
    });

    it('TC-M28-008：還原 3 筆 whitelist（best_case categorical / month_cnt numeric / payt_term numeric inactive）', async () => {
      await migration.down(queryRunner as unknown as QueryRunner);
      const allSql = queryRunner.query.mock.calls.map((c) => c[0]).join('\n');

      expect(allSql).toMatch(/INSERT[^;]*pooldata_field_whitelist[^;]*'best_case'[^;]*'categorical'/i);
      expect(allSql).toMatch(/INSERT[^;]*pooldata_field_whitelist[^;]*'month_cnt'[^;]*'numeric'/i);
      expect(allSql).toMatch(/INSERT[^;]*pooldata_field_whitelist[^;]*'payt_term'[^;]*'numeric'/i);

      // payt_term 必須 inactive（沿用 m22 v1.4.3 stance）
      const paytTermLine = allSql.match(/'payt_term'[^;]*?(TRUE|FALSE)/i);
      expect(paytTermLine).not.toBeNull();
      expect(paytTermLine![1].toUpperCase()).toBe('FALSE');
    });

    it('TC-M28-009：還原 best_case Y/N options', async () => {
      await migration.down(queryRunner as unknown as QueryRunner);
      const allSql = queryRunner.query.mock.calls.map((c) => c[0]).join('\n');

      expect(allSql).toMatch(/'best_case'[^;]*'Y'[^;]*'優質案件'/);
      expect(allSql).toMatch(/'best_case'[^;]*'N'[^;]*'一般案件'/);
    });

    it('TC-M28-010：down() 之 INSERT 也採 idempotent（ON CONFLICT / INSERT OR IGNORE）', async () => {
      await migration.down(queryRunner as unknown as QueryRunner);
      const allSql = queryRunner.query.mock.calls.map((c) => c[0]).join('\n');
      expect(allSql).toMatch(/ON\s+CONFLICT\s*\(\s*column_name\s*\)\s+DO\s+NOTHING/i);
      expect(allSql).toMatch(/ON\s+CONFLICT\s*\(\s*column_name\s*,\s*option_value\s*\)\s+DO\s+NOTHING/i);
    });
  });
});
