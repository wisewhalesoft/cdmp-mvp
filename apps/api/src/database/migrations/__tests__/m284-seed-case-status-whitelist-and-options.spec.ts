/**
 * TC-MIG-m284：SeedCaseStatusWhitelistAndOptions migration
 *   F050 v2.1 重構（AD-E07-18 §18.3 M4 / F075 v1.5 / F076 v1.5 / US-125 AC-2 / GAP-LIST §E3+§E4）
 *
 * 對應 test spec：
 *   - MT-M4-001：M4 up() 後 case_status options 共 4 筆（01/02/03/04）
 *   - MT-M4-002：M4 up() 同時將 case_status 加入 pooldata_field_whitelist
 *   - MT-M4-003：M4 up() 重複執行不產生重複（DO NOTHING 冪等）
 *   - MT-M4-004：M4 down() 移除 case_status options 與 whitelist 記錄
 *   - TS-F076-001：case_status 4 筆 seed 冪等執行後正確存在
 *   - TS-F076-005：case_status seed 重複執行不產生重複
 *
 * 來源資料：reference/DumpData/OBMCODEDF_20260505.csv TBL_ID='22'（m150 轉碼後 'CASE_STATUS'）
 *   01 期中(不含當月滿期) / 02 中結 / 03 滿期(含當月滿期) / 04 滿期
 *
 * 涵蓋 cases：
 *   - PG up()：INSERT whitelist + 4 筆 options，皆 ON CONFLICT DO NOTHING
 *   - SQLite up()：INSERT OR IGNORE
 *   - whitelist INSERT 必先於 options（FK 安全）
 *   - down()：DELETE options（先子表）→ DELETE whitelist（再母表）
 *   - functional：跑 m284 後 count 正確；重複跑不增加
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import type { QueryRunner } from 'typeorm';
import { DataSource } from 'typeorm';
import { SeedCaseStatusWhitelistAndOptions1711360000284 } from '../1711360000284-SeedCaseStatusWhitelistAndOptions';

describe('Migration 1711360000284: SeedCaseStatusWhitelistAndOptions (TC-MIG-m284 / MT-M4-001~004 / TS-F076-001/005)', () => {
  let migration: SeedCaseStatusWhitelistAndOptions1711360000284;
  let queryRunner: { query: ReturnType<typeof vi.fn> };
  const originalDbType = process.env.DB_TYPE;

  beforeEach(() => {
    migration = new SeedCaseStatusWhitelistAndOptions1711360000284();
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

    it('MT-M4-002：whitelist INSERT 必先於 options INSERT（FK 安全）', async () => {
      await migration.up(queryRunner as unknown as QueryRunner);
      const sqls = queryRunner.query.mock.calls.map((c) => c[0] as string);
      const whitelistIdx = sqls.findIndex((s) =>
        /INSERT[^;]*pooldata_field_whitelist/i.test(s) &&
        /'case_status'/.test(s),
      );
      const firstOptionIdx = sqls.findIndex((s) =>
        /INSERT[^;]*pooldata_field_option/i.test(s) &&
        /'case_status'/.test(s),
      );
      expect(whitelistIdx).toBeGreaterThanOrEqual(0);
      expect(firstOptionIdx).toBeGreaterThanOrEqual(0);
      expect(whitelistIdx).toBeLessThan(firstOptionIdx);
    });

    it('MT-M4-002 / F075 v1.5：whitelist INSERT case_status (categorical, 案件結清期別)', async () => {
      await migration.up(queryRunner as unknown as QueryRunner);
      const sqls = queryRunner.query.mock.calls.map((c) => c[0] as string);
      const whitelistSql = sqls.find((s) =>
        /INSERT[^;]*pooldata_field_whitelist/i.test(s),
      );
      expect(whitelistSql).toBeDefined();
      expect(whitelistSql).toMatch(/'case_status'/);
      expect(whitelistSql).toMatch(/'案件結清期別'/);
      expect(whitelistSql).toMatch(/'categorical'/);
    });

    it('MT-M4-001：INSERT 4 筆 options（01/02/03/04 對應期中/中結/滿期）', async () => {
      await migration.up(queryRunner as unknown as QueryRunner);
      const optionSqls = queryRunner.query.mock.calls
        .map((c) => c[0] as string)
        .filter((s) => /INSERT[^;]*pooldata_field_option/i.test(s));
      expect(optionSqls.length).toBe(4);

      const all = optionSqls.join('\n');
      expect(all).toMatch(/'case_status'[^;]*'01'[^;]*'期中\(不含當月滿期\)'/);
      expect(all).toMatch(/'case_status'[^;]*'02'[^;]*'中結'/);
      expect(all).toMatch(/'case_status'[^;]*'03'[^;]*'滿期\(含當月滿期\)'/);
      expect(all).toMatch(/'case_status'[^;]*'04'[^;]*'滿期'(?!\()/);
    });

    it('MT-M4-003 / TS-F076-005：whitelist INSERT 含 ON CONFLICT (column_name) DO NOTHING', async () => {
      await migration.up(queryRunner as unknown as QueryRunner);
      const sqls = queryRunner.query.mock.calls.map((c) => c[0] as string);
      const whitelistSql = sqls.find((s) =>
        /INSERT[^;]*pooldata_field_whitelist/i.test(s),
      );
      expect(whitelistSql).toMatch(
        /ON\s+CONFLICT\s*\(\s*column_name\s*\)\s+DO\s+NOTHING/i,
      );
    });

    it('MT-M4-003：option INSERT 含 ON CONFLICT (column_name, option_value) DO NOTHING', async () => {
      await migration.up(queryRunner as unknown as QueryRunner);
      const optionSqls = queryRunner.query.mock.calls
        .map((c) => c[0] as string)
        .filter((s) => /INSERT[^;]*pooldata_field_option/i.test(s));
      for (const sql of optionSqls) {
        expect(sql).toMatch(
          /ON\s+CONFLICT\s*\(\s*column_name\s*,\s*option_value\s*\)\s+DO\s+NOTHING/i,
        );
      }
    });

    it('4 筆 options is_active 全 TRUE', async () => {
      await migration.up(queryRunner as unknown as QueryRunner);
      const optionSqls = queryRunner.query.mock.calls
        .map((c) => c[0] as string)
        .filter((s) => /INSERT[^;]*pooldata_field_option/i.test(s));
      for (const sql of optionSqls) {
        expect(sql).toMatch(/TRUE/);
        expect(sql).not.toMatch(/FALSE/);
      }
    });
  });

  describe('up() — SQLite', () => {
    beforeEach(() => {
      process.env.DB_TYPE = 'sqlite';
    });

    it('SQLite 用 INSERT OR IGNORE（pooldata_field_whitelist 與 pooldata_field_option 均）', async () => {
      await migration.up(queryRunner as unknown as QueryRunner);
      const sqls = queryRunner.query.mock.calls.map((c) => c[0] as string);
      const inserts = sqls.filter((s) => /INSERT/i.test(s));
      expect(inserts.length).toBeGreaterThanOrEqual(5); // 1 whitelist + 4 options
      for (const sql of inserts) {
        expect(sql).toMatch(/INSERT\s+OR\s+IGNORE/i);
        expect(sql).not.toMatch(/ON\s+CONFLICT/i);
      }
    });
  });

  describe('down()', () => {
    it('MT-M4-004：DELETE options 必先於 DELETE whitelist（FK 安全 — 先子表）', async () => {
      await migration.down(queryRunner as unknown as QueryRunner);
      const sqls = queryRunner.query.mock.calls.map((c) => c[0] as string);
      const optionDeleteIdx = sqls.findIndex((s) =>
        /DELETE\s+FROM\s+pooldata_field_option[^;]*'case_status'/i.test(s),
      );
      const whitelistDeleteIdx = sqls.findIndex((s) =>
        /DELETE\s+FROM\s+pooldata_field_whitelist[^;]*'case_status'/i.test(s),
      );
      expect(optionDeleteIdx).toBeGreaterThanOrEqual(0);
      expect(whitelistDeleteIdx).toBeGreaterThanOrEqual(0);
      expect(optionDeleteIdx).toBeLessThan(whitelistDeleteIdx);
    });

    it('down() DELETE 限定 case_status，不誤刪其他欄位', async () => {
      await migration.down(queryRunner as unknown as QueryRunner);
      const allSql = queryRunner.query.mock.calls.map((c) => c[0]).join('\n');
      for (const other of [
        'prod_kind',
        'spec_tp',
        'caseyear',
        'settle_src',
        'list_type',
        'best_case',
      ]) {
        const deletePattern = new RegExp(`DELETE\\s+FROM[^;]*'${other}'`, 'i');
        expect(allSql).not.toMatch(deletePattern);
      }
    });
  });

  describe('functional: SQLite in-memory', () => {
    it('MT-M4-001 + MT-M4-002 + MT-M4-003：跑 m284 up() 後 options=4 / whitelist=1，重複跑不增加', async () => {
      process.env.DB_TYPE = 'sqlite';
      const ds = await setupSqlite();
      try {
        // 跑兩次
        const qr1 = ds.createQueryRunner();
        await migration.up(qr1);
        await qr1.release();
        const qr2 = ds.createQueryRunner();
        await migration.up(qr2);
        await qr2.release();

        const opts = await ds.query<Array<{ cnt: number }>>(
          `SELECT COUNT(*) as cnt FROM pooldata_field_option WHERE column_name = 'case_status'`,
        );
        expect(Number(opts[0].cnt)).toBe(4);

        const wls = await ds.query<Array<{ cnt: number }>>(
          `SELECT COUNT(*) as cnt FROM pooldata_field_whitelist WHERE column_name = 'case_status'`,
        );
        expect(Number(wls[0].cnt)).toBe(1);

        // whitelist 欄位驗證
        const wlRow = await ds.query<
          Array<{ column_name: string; display_name: string; field_type: string; is_active: number }>
        >(
          `SELECT column_name, display_name, field_type, is_active FROM pooldata_field_whitelist WHERE column_name = 'case_status'`,
        );
        expect(wlRow[0].display_name).toBe('案件結清期別');
        expect(wlRow[0].field_type).toBe('categorical');
        expect(Number(wlRow[0].is_active)).toBe(1);

        // 4 個 option_value 完整
        const optRows = await ds.query<Array<{ option_value: string; option_label: string }>>(
          `SELECT option_value, option_label FROM pooldata_field_option WHERE column_name = 'case_status' ORDER BY option_value`,
        );
        expect(optRows.map((r) => r.option_value)).toEqual(['01', '02', '03', '04']);
        expect(optRows[0].option_label).toBe('期中(不含當月滿期)');
        expect(optRows[1].option_label).toBe('中結');
        expect(optRows[2].option_label).toBe('滿期(含當月滿期)');
        expect(optRows[3].option_label).toBe('滿期');
      } finally {
        await ds.destroy();
      }
    });

    it('MT-M4-004：down() 後 options=0 / whitelist 無 case_status', async () => {
      process.env.DB_TYPE = 'sqlite';
      const ds = await setupSqlite();
      try {
        const qrUp = ds.createQueryRunner();
        await migration.up(qrUp);
        await qrUp.release();

        const qrDown = ds.createQueryRunner();
        await migration.down(qrDown);
        await qrDown.release();

        const opts = await ds.query<Array<{ cnt: number }>>(
          `SELECT COUNT(*) as cnt FROM pooldata_field_option WHERE column_name = 'case_status'`,
        );
        expect(Number(opts[0].cnt)).toBe(0);

        const wls = await ds.query<Array<{ cnt: number }>>(
          `SELECT COUNT(*) as cnt FROM pooldata_field_whitelist WHERE column_name = 'case_status'`,
        );
        expect(Number(wls[0].cnt)).toBe(0);
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
  await ds.query(`
    CREATE TABLE pooldata_field_option (
      column_name VARCHAR(64) NOT NULL,
      option_value VARCHAR(64) NOT NULL,
      option_label VARCHAR(100) NOT NULL,
      is_active INTEGER NOT NULL DEFAULT 1,
      deactivation_reason VARCHAR(30),
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (column_name, option_value)
    )
  `);
  return ds;
}
