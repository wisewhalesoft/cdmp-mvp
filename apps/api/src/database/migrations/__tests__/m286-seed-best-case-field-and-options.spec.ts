/**
 * TC-MIG-m286：SeedBestCaseFieldAndOptions migration（M-A1）
 *   F050 v2.1.1 / US-129 / architecture-spec §18.11.3
 *
 * 對應 test spec：
 *   - TS-F050-A01：whitelist UPSERT 先於 options INSERT（FK 安全）
 *   - TS-F050-A02：whitelist UPSERT 含 best_case / 優質案件 / categorical / DO UPDATE
 *   - TS-F050-A03：Y/N options UPSERT 含 DO UPDATE SET option_label（非 DO NOTHING）
 *   - TS-F050-A04：UPSERT 覆寫驗證（最關鍵） — 模擬 m240 已存 N='一般案件'，執行後變為「非優質案件」
 *   - TS-F050-A05：idempotent — 連續執行 2 次後 options=2 / whitelist=1
 *   - TS-F050-A06：SQLite 使用 INSERT OR REPLACE INTO（非 ON CONFLICT）
 *   - TS-F050-A07：down() 僅刪 best_case Y/N options，不刪 whitelist，不影響其他欄位
 *
 * 大小寫警告（[[feedback_mock_real_system_contract]]）：
 *   best_case option_value 在 ob_pool_data 為 ETL 落地之 varchar(1) 大寫 'Y' / 'N'；
 *   本測試所有 assertion 一律大寫。
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import type { QueryRunner } from 'typeorm';
import { DataSource } from 'typeorm';
import { SeedBestCaseFieldAndOptions1711360000286 } from '../1711360000286-SeedBestCaseFieldAndOptions';

describe('Migration 1711360000286: SeedBestCaseFieldAndOptions (TC-MIG-m286 / TS-F050-A01~A07)', () => {
  let migration: SeedBestCaseFieldAndOptions1711360000286;
  let queryRunner: { query: ReturnType<typeof vi.fn> };
  const originalDbType = process.env.DB_TYPE;

  beforeEach(() => {
    migration = new SeedBestCaseFieldAndOptions1711360000286();
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

    it('TS-F050-A01：whitelist UPSERT 必先於 options INSERT（FK 安全序）', async () => {
      await migration.up(queryRunner as unknown as QueryRunner);
      const sqls = queryRunner.query.mock.calls.map((c) => c[0] as string);

      const whitelistIdx = sqls.findIndex(
        (s) =>
          /INSERT[^;]*pooldata_field_whitelist/i.test(s) &&
          /'best_case'/.test(s),
      );
      const firstOptionIdx = sqls.findIndex(
        (s) =>
          /INSERT[^;]*pooldata_field_option/i.test(s) &&
          /'best_case'/.test(s),
      );

      expect(whitelistIdx).toBeGreaterThanOrEqual(0);
      expect(firstOptionIdx).toBeGreaterThanOrEqual(0);
      expect(whitelistIdx).toBeLessThan(firstOptionIdx);
    });

    it('TS-F050-A02：whitelist UPSERT 含 best_case / 優質案件 / categorical / ON CONFLICT DO UPDATE', async () => {
      await migration.up(queryRunner as unknown as QueryRunner);
      const sqls = queryRunner.query.mock.calls.map((c) => c[0] as string);
      const whitelistSql = sqls.find((s) =>
        /INSERT[^;]*pooldata_field_whitelist/i.test(s),
      );

      expect(whitelistSql).toBeDefined();
      expect(whitelistSql).toMatch(/'best_case'/);
      expect(whitelistSql).toMatch(/'優質案件'/);
      expect(whitelistSql).toMatch(/'categorical'/);

      // 採 UPSERT（DO UPDATE），非 DO NOTHING（依 architecture-spec §18.11.3 Step 1）
      expect(whitelistSql).toMatch(
        /ON\s+CONFLICT\s*\(\s*column_name\s*\)\s+DO\s+UPDATE\s+SET/i,
      );
      expect(whitelistSql).toMatch(/is_active\s*=\s*(?:TRUE|true)/i);
      expect(whitelistSql).toMatch(/display_name\s*=\s*EXCLUDED\.display_name/i);
    });

    it('TS-F050-A03：Y/N 兩筆 options UPSERT — 含 DO UPDATE SET option_label（非 DO NOTHING）', async () => {
      await migration.up(queryRunner as unknown as QueryRunner);
      const optionSqls = queryRunner.query.mock.calls
        .map((c) => c[0] as string)
        .filter((s) => /INSERT[^;]*pooldata_field_option/i.test(s));

      expect(optionSqls.length).toBe(2);

      const allOptions = optionSqls.join('\n');
      // Y / 優質案件
      expect(allOptions).toMatch(/'best_case'[^;]*'Y'[^;]*'優質案件'/);
      // N / 非優質案件
      expect(allOptions).toMatch(/'best_case'[^;]*'N'[^;]*'非優質案件'/);

      for (const sql of optionSqls) {
        // 採 UPSERT（DO UPDATE），覆寫 m240 舊 label
        expect(sql).toMatch(
          /ON\s+CONFLICT\s*\(\s*column_name\s*,\s*option_value\s*\)\s+DO\s+UPDATE\s+SET/i,
        );
        expect(sql).toMatch(/option_label\s*=\s*EXCLUDED\.option_label/i);
        // 兩筆均 is_active TRUE
        expect(sql).toMatch(/TRUE/i);
      }
    });
  });

  describe('up() — SQLite', () => {
    beforeEach(() => {
      process.env.DB_TYPE = 'sqlite';
    });

    it('TS-F050-A06：SQLite 使用 INSERT OR REPLACE INTO（非 ON CONFLICT）', async () => {
      await migration.up(queryRunner as unknown as QueryRunner);
      const sqls = queryRunner.query.mock.calls.map((c) => c[0] as string);
      const inserts = sqls.filter((s) => /INSERT/i.test(s));

      // 至少 1 whitelist + 2 options
      expect(inserts.length).toBeGreaterThanOrEqual(3);

      for (const sql of inserts) {
        expect(sql).toMatch(/INSERT\s+OR\s+REPLACE\s+INTO/i);
        expect(sql).not.toMatch(/ON\s+CONFLICT/i);
        // INSERT OR IGNORE 不可使用（因會跳過 m240 殘留覆寫）
        expect(sql).not.toMatch(/INSERT\s+OR\s+IGNORE/i);
      }
    });
  });

  describe('down()', () => {
    it('TS-F050-A07：down() 僅刪 best_case Y/N options，不刪 whitelist，不影響其他欄位', async () => {
      await migration.down(queryRunner as unknown as QueryRunner);
      const sqls = queryRunner.query.mock.calls.map((c) => c[0] as string);

      // 存在 DELETE FROM pooldata_field_option WHERE column_name='best_case' AND option_value IN ('Y','N')
      const optionDeleteSql = sqls.find(
        (s) =>
          /DELETE\s+FROM\s+pooldata_field_option/i.test(s) &&
          /'best_case'/.test(s) &&
          /'Y'/.test(s) &&
          /'N'/.test(s),
      );
      expect(optionDeleteSql).toBeDefined();
      expect(optionDeleteSql).toMatch(
        /WHERE[^;]*column_name\s*=\s*'best_case'[^;]*option_value\s+IN\s*\(\s*'Y'\s*,\s*'N'\s*\)/i,
      );

      // 不存在針對 pooldata_field_whitelist 的 DELETE（best_case 不屬本 migration 新建）
      for (const sql of sqls) {
        expect(sql).not.toMatch(/DELETE\s+FROM\s+pooldata_field_whitelist/i);
      }

      // 不影響其他欄位
      const allSql = sqls.join('\n');
      for (const other of [
        'prod_kind',
        'spec_tp',
        'caseyear',
        'settle_src',
        'list_type',
        'case_status',
      ]) {
        const deletePattern = new RegExp(`DELETE\\s+FROM[^;]*'${other}'`, 'i');
        expect(allSql).not.toMatch(deletePattern);
      }
    });
  });

  describe('functional: SQLite in-memory', () => {
    it('TS-F050-A04：UPSERT 覆寫驗證（最關鍵） — 模擬 m240 已存 N=\'一般案件\'，執行 M-A1 後 N label 變為「非優質案件」', async () => {
      process.env.DB_TYPE = 'sqlite';
      const ds = await setupSqlite();
      try {
        // 模擬 m240 已 seed N='一般案件' 殘留
        await ds.query(
          `INSERT INTO pooldata_field_option
             (column_name, option_value, option_label, is_active, deactivation_reason, created_at, updated_at)
           VALUES ('best_case', 'N', '一般案件', 1, NULL, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
        );

        const qr = ds.createQueryRunner();
        await migration.up(qr);
        await qr.release();

        const rows = await ds.query<Array<{ option_label: string }>>(
          `SELECT option_label FROM pooldata_field_option WHERE column_name = 'best_case' AND option_value = 'N'`,
        );
        expect(rows.length).toBe(1);
        expect(rows[0].option_label).toBe('非優質案件');
        // 不應為 m240 殘留
        expect(rows[0].option_label).not.toBe('一般案件');
      } finally {
        await ds.destroy();
      }
    });

    it('TS-F050-A05：M-A1 idempotent — 連續執行 2 次後 options=2 / whitelist=1（不重複）', async () => {
      process.env.DB_TYPE = 'sqlite';
      const ds = await setupSqlite();
      try {
        const qr1 = ds.createQueryRunner();
        await migration.up(qr1);
        await qr1.release();
        const qr2 = ds.createQueryRunner();
        await migration.up(qr2);
        await qr2.release();

        const opts = await ds.query<Array<{ cnt: number }>>(
          `SELECT COUNT(*) as cnt FROM pooldata_field_option WHERE column_name = 'best_case'`,
        );
        expect(Number(opts[0].cnt)).toBe(2);

        const wls = await ds.query<Array<{ cnt: number }>>(
          `SELECT COUNT(*) as cnt FROM pooldata_field_whitelist WHERE column_name = 'best_case'`,
        );
        expect(Number(wls[0].cnt)).toBe(1);

        // 兩筆 option_value 為 Y / N（大寫,[[feedback_mock_real_system_contract]]）
        const optRows = await ds.query<
          Array<{ option_value: string; option_label: string }>
        >(
          `SELECT option_value, option_label FROM pooldata_field_option WHERE column_name = 'best_case' ORDER BY option_value`,
        );
        expect(optRows.map((r) => r.option_value)).toEqual(['N', 'Y']);
        expect(optRows.find((r) => r.option_value === 'Y')?.option_label).toBe(
          '優質案件',
        );
        expect(optRows.find((r) => r.option_value === 'N')?.option_label).toBe(
          '非優質案件',
        );

        // whitelist 欄位驗證
        const wlRow = await ds.query<
          Array<{ display_name: string; field_type: string; is_active: number }>
        >(
          `SELECT display_name, field_type, is_active FROM pooldata_field_whitelist WHERE column_name = 'best_case'`,
        );
        expect(wlRow[0].display_name).toBe('優質案件');
        expect(wlRow[0].field_type).toBe('categorical');
        expect(Number(wlRow[0].is_active)).toBe(1);
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
