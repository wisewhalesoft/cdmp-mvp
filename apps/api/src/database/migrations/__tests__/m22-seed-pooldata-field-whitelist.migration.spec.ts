/**
 * P1 B5 / m22 / F075 AC-1 / F076 AC-3 / v1.4.3 case 對齊：
 *   Seed 8 個白名單欄位 + 對應可選值（column_name 小寫對齊 ob_pool_data snake_case）
 *
 * 涵蓋 cases：
 *   - 8 個白名單欄位都 INSERT（prod_kind/list_type/best_case/spec_tp/caseyear/settle_src/month_cnt/payt_term）
 *   - payt_term is_active=false（spec AC-1 唯一停用欄位）
 *   - field_type 對照正確（6 categorical + 2 numeric）
 *   - idempotent：PostgreSQL ON CONFLICT DO NOTHING / SQLite INSERT OR IGNORE
 *   - prod_kind / list_type / caseyear / settle_src 可選值都 INSERT
 *   - down 限定 8 欄位 IN clause，先刪 option 再刪 whitelist
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import type { QueryRunner } from 'typeorm';
import { SeedPooldataFieldWhitelist1711360000220 } from '../1711360000220-SeedPooldataFieldWhitelist';

describe('Migration 1711360000220: SeedPooldataFieldWhitelist (D-PFW-02)', () => {
  let migration: SeedPooldataFieldWhitelist1711360000220;
  let queryRunner: { query: ReturnType<typeof vi.fn> };
  const originalDbType = process.env.DB_TYPE;

  beforeEach(() => {
    migration = new SeedPooldataFieldWhitelist1711360000220();
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

    it('TC-M22-001：seed 8 個白名單欄位（prod_kind/list_type/best_case/spec_tp/caseyear/settle_src/month_cnt/payt_term）', async () => {
      await migration.up(queryRunner as unknown as QueryRunner);
      const allSql = queryRunner.query.mock.calls.map((c) => c[0]).join('\n');
      const fields = [
        'prod_kind', 'list_type', 'best_case', 'spec_tp',
        'caseyear', 'settle_src', 'month_cnt', 'payt_term',
      ];
      for (const f of fields) {
        expect(allSql).toMatch(
          new RegExp(`INSERT[^;]*pooldata_field_whitelist[^;]*'${f}'`, 'i'),
        );
      }
    });

    it('TC-M22-002：payt_term is_active=false（spec AC-1 唯一停用欄位）', async () => {
      await migration.up(queryRunner as unknown as QueryRunner);
      const allSql = queryRunner.query.mock.calls.map((c) => c[0]).join('\n');
      // payt_term 該筆 INSERT 的 is_active 應為 FALSE
      const paytTermLine = allSql.match(/'payt_term'[^;]*?(TRUE|FALSE)/i);
      expect(paytTermLine).not.toBeNull();
      expect(paytTermLine![1].toUpperCase()).toBe('FALSE');
    });

    it('TC-M22-003：field_type 對照正確（categorical 6 個 + numeric 2 個）', async () => {
      await migration.up(queryRunner as unknown as QueryRunner);
      const allSql = queryRunner.query.mock.calls.map((c) => c[0]).join('\n');
      // categorical
      for (const f of ['prod_kind', 'list_type', 'best_case', 'spec_tp', 'caseyear', 'settle_src']) {
        expect(allSql).toMatch(new RegExp(`'${f}'[^;]*'categorical'`, 'i'));
      }
      // numeric
      for (const f of ['month_cnt', 'payt_term']) {
        expect(allSql).toMatch(new RegExp(`'${f}'[^;]*'numeric'`, 'i'));
      }
    });

    it('TC-M22-004：PostgreSQL ON CONFLICT (column_name) DO NOTHING (idempotent)', async () => {
      await migration.up(queryRunner as unknown as QueryRunner);
      const allSql = queryRunner.query.mock.calls.map((c) => c[0]).join('\n');
      expect(allSql).toMatch(/ON\s+CONFLICT\s*\(\s*column_name\s*\)\s+DO\s+NOTHING/i);
      // option 複合 PK 衝突忽略
      expect(allSql).toMatch(
        /ON\s+CONFLICT\s*\(\s*column_name\s*,\s*option_value\s*\)\s+DO\s+NOTHING/i,
      );
    });

    it('TC-M22-005：prod_kind seed 三筆可選值（01/02/03）', async () => {
      await migration.up(queryRunner as unknown as QueryRunner);
      const allSql = queryRunner.query.mock.calls.map((c) => c[0]).join('\n');
      expect(allSql).toMatch(/'prod_kind'[^;]*'01'[^;]*'汽車新車'/);
      expect(allSql).toMatch(/'prod_kind'[^;]*'02'[^;]*'機車'/);
      expect(allSql).toMatch(/'prod_kind'[^;]*'03'[^;]*'其他商品'/);
    });

    it('TC-M22-006：caseyear seed 8 筆可選值（0..6 + 99）', async () => {
      await migration.up(queryRunner as unknown as QueryRunner);
      const allSql = queryRunner.query.mock.calls.map((c) => c[0]).join('\n');
      for (const v of ['0', '1', '2', '3', '4', '5', '6', '99']) {
        expect(allSql).toMatch(
          new RegExp(`'caseyear'[^;]*'${v}'`, 'i'),
        );
      }
    });

    it('TC-M22-007：settle_src seed 二筆可選值（Y/N）', async () => {
      await migration.up(queryRunner as unknown as QueryRunner);
      const allSql = queryRunner.query.mock.calls.map((c) => c[0]).join('\n');
      expect(allSql).toMatch(/'settle_src'[^;]*'Y'[^;]*'含他行代償'/);
      expect(allSql).toMatch(/'settle_src'[^;]*'N'[^;]*'不含他行代償'/);
    });
  });

  describe('up() — SQLite', () => {
    beforeEach(() => {
      process.env.DB_TYPE = 'sqlite';
    });

    it('TC-M22-008：SQLite 採 INSERT OR IGNORE (idempotent)', async () => {
      await migration.up(queryRunner as unknown as QueryRunner);
      const allSql = queryRunner.query.mock.calls.map((c) => c[0]).join('\n');
      expect(allSql).toMatch(/INSERT\s+OR\s+IGNORE\s+INTO\s+pooldata_field_whitelist/i);
      expect(allSql).toMatch(/INSERT\s+OR\s+IGNORE\s+INTO\s+pooldata_field_option/i);
      expect(allSql).not.toMatch(/ON\s+CONFLICT/i);
    });
  });

  describe('down()', () => {
    it('TC-M22-009：DELETE 限定 8 欄位 IN clause；先刪 option 再刪 whitelist', async () => {
      await migration.down(queryRunner as unknown as QueryRunner);
      const sqls = queryRunner.query.mock.calls.map((c) => c[0] as string);

      const optionDeleteIdx = sqls.findIndex((s) =>
        /DELETE\s+FROM\s+pooldata_field_option/i.test(s),
      );
      const fieldDeleteIdx = sqls.findIndex((s) =>
        /DELETE\s+FROM\s+pooldata_field_whitelist/i.test(s),
      );

      expect(optionDeleteIdx).toBeGreaterThanOrEqual(0);
      expect(fieldDeleteIdx).toBeGreaterThanOrEqual(0);
      // option 必須先於 whitelist（FK 安全）
      expect(optionDeleteIdx).toBeLessThan(fieldDeleteIdx);

      const allDelete = sqls.filter((s) => /DELETE\s+FROM/i.test(s)).join('\n');
      for (const f of ['prod_kind', 'list_type', 'best_case', 'spec_tp',
        'caseyear', 'settle_src', 'month_cnt', 'payt_term']) {
        expect(allDelete).toMatch(new RegExp(`'${f}'`));
      }
    });
  });
});
