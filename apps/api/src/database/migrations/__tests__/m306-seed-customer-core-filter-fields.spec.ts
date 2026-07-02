/**
 * TC-MIG-m306：SeedCustomerCoreFilterFields（F109 / US-172 / AD-E07-37 §4.2）
 *
 * 對應 test spec（F109-test.md）：
 *   - WL-002：8 個 customer_core 白名單欄位（field_type / data_source / is_active / is_system_fixed）
 *   - WL-006 / OPT-008 / MIGSEED-002：seed 冪等（重跑 whitelist=8 / options=106 不變）
 *   - OPT-001~007：gender 3 code→label / occupation 55 / education 8 / marital 5 /
 *                  customer_type 4 / income 9 / city 22（臺字形）
 *   - OPT-009：date_of_birth 無 options
 *   - MIGSEED-003：down() 先刪 options 再刪 whitelist（FK 安全），8 欄完全移除
 *
 * PG 分支以 mock queryRunner 斷言 SQL 形狀（whitelist 先於 options / ON CONFLICT DO NOTHING /
 *   臺字形 / income 逗號）；SQLite 分支以 in-memory 功能驗證 count 與冪等。
 * 值取自 dev distinct 實查（feedback_mock_real_system_contract），此測試守 count 與代表性抽樣。
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import type { QueryRunner } from 'typeorm';
import { DataSource } from 'typeorm';
import { SeedCustomerCoreFilterFields1711360000306 } from '../1711360000306-SeedCustomerCoreFilterFields';

const CC_COLUMNS = [
  'gender',
  'date_of_birth',
  'occupation_desc',
  'education_desc',
  'marital_status_desc',
  'customer_type_desc',
  'monthly_income_desc',
  'cpost_city',
];

const OPTION_COUNTS: Record<string, number> = {
  gender: 3,
  occupation_desc: 55,
  education_desc: 8,
  marital_status_desc: 5,
  customer_type_desc: 4,
  monthly_income_desc: 9,
  cpost_city: 22,
};

describe('Migration m306: SeedCustomerCoreFilterFields', () => {
  let migration: SeedCustomerCoreFilterFields1711360000306;
  const originalDbType = process.env.DB_TYPE;

  beforeEach(() => {
    migration = new SeedCustomerCoreFilterFields1711360000306();
  });

  afterEach(() => {
    if (originalDbType === undefined) delete process.env.DB_TYPE;
    else process.env.DB_TYPE = originalDbType;
  });

  describe('up() — PostgreSQL（mock SQL 形狀）', () => {
    beforeEach(() => {
      delete process.env.DB_TYPE;
    });

    it('WL-002：whitelist INSERT 先於 options INSERT（FK 安全序）+ 8 欄含 customer_core / is_system_fixed FALSE', async () => {
      const qr = { query: vi.fn().mockResolvedValue(undefined) };
      await migration.up(qr as unknown as QueryRunner);
      const sqls = qr.query.mock.calls.map((c) => c[0] as string);

      const wlIdx = sqls.findIndex((s) =>
        /INSERT[^;]*pooldata_field_whitelist/i.test(s),
      );
      const firstOptIdx = sqls.findIndex((s) =>
        /INSERT[^;]*pooldata_field_option/i.test(s),
      );
      expect(wlIdx).toBeGreaterThanOrEqual(0);
      expect(firstOptIdx).toBeGreaterThan(wlIdx);

      const wlSql = sqls[wlIdx];
      for (const c of CC_COLUMNS) expect(wlSql).toContain(`'${c}'`);
      expect(wlSql).toMatch(/'customer_core'/);
      expect(wlSql).toMatch(/ON CONFLICT\s*\(\s*column_name\s*\)\s*DO NOTHING/i);
      // is_system_fixed = FALSE（8 欄非系統固定）
      expect(wlSql).toMatch(/FALSE/);
    });

    it('OPT-001：gender code→label（1/男、2/女、3/法人）；OPT-006：income 含逗號千分位；OPT-007：city 臺字形', async () => {
      const qr = { query: vi.fn().mockResolvedValue(undefined) };
      await migration.up(qr as unknown as QueryRunner);
      const all = qr.query.mock.calls.map((c) => c[0] as string).join('\n');

      expect(all).toMatch(/'gender',\s*'1',\s*'男'/);
      expect(all).toMatch(/'gender',\s*'2',\s*'女'/);
      expect(all).toMatch(/'gender',\s*'3',\s*'法人'/);
      // income 逗號
      expect(all).toContain("'20,001~30,000'");
      // city 臺字形（非「台」）
      expect(all).toContain("'臺北市'");
      expect(all).toContain("'臺中市'");
      expect(all).not.toMatch(/'台北市'/);
      // options ON CONFLICT (column_name, option_value) DO NOTHING
      const optSqls = qr.query.mock.calls
        .map((c) => c[0] as string)
        .filter((s) => /INSERT[^;]*pooldata_field_option/i.test(s));
      for (const s of optSqls) {
        expect(s).toMatch(
          /ON CONFLICT\s*\(\s*column_name\s*,\s*option_value\s*\)\s*DO NOTHING/i,
        );
      }
    });

    it('OPT-002：occupation_desc seed 完整 55 筆（含資料品質值「304」「無」，value=label）', async () => {
      const qr = { query: vi.fn().mockResolvedValue(undefined) };
      await migration.up(qr as unknown as QueryRunner);
      const occSql = qr.query.mock.calls
        .map((c) => c[0] as string)
        .find(
          (s) =>
            /'occupation_desc'/.test(s) &&
            /INSERT[^;]*pooldata_field_option/i.test(s),
        );
      expect(occSql).toBeDefined();
      // 每筆 VALUES ('occupation_desc', 'x', 'x', ...) → 統計 'occupation_desc' 出現次數 = 55
      const occurrences = (occSql!.match(/'occupation_desc'/g) ?? []).length;
      expect(occurrences).toBe(55);
      // 代表性抽樣（取自 dev 實際 distinct，含資料品質值「304」「無」；'工程師' 為 spec 示範值、非實際值故不取）
      expect(occSql).toContain("'製造業'");
      expect(occSql).toContain("'醫生'");
      expect(occSql).toContain("'304'");
      expect(occSql).toContain("'無'");
    });
  });

  describe('down() — 先刪 options 再刪 whitelist（FK 安全）', () => {
    it('MIGSEED-003：down() DELETE options 先於 DELETE whitelist，涵蓋 8 欄', async () => {
      const qr = { query: vi.fn().mockResolvedValue(undefined) };
      await migration.down(qr as unknown as QueryRunner);
      const sqls = qr.query.mock.calls.map((c) => c[0] as string);

      const optDelIdx = sqls.findIndex((s) =>
        /DELETE FROM pooldata_field_option/i.test(s),
      );
      const wlDelIdx = sqls.findIndex((s) =>
        /DELETE FROM pooldata_field_whitelist/i.test(s),
      );
      expect(optDelIdx).toBeGreaterThanOrEqual(0);
      expect(wlDelIdx).toBeGreaterThan(optDelIdx); // options 先刪
      for (const c of CC_COLUMNS) {
        expect(sqls[optDelIdx]).toContain(`'${c}'`);
        expect(sqls[wlDelIdx]).toContain(`'${c}'`);
      }
    });
  });

  describe('functional — SQLite in-memory', () => {
    it('WL-002 / OPT-001~009：8 白名單 + 106 options（逐欄 count）；date_of_birth 無 options', async () => {
      process.env.DB_TYPE = 'sqlite';
      const ds = await setupTables();
      try {
        const qr = ds.createQueryRunner();
        await migration.up(qr);
        await qr.release();

        const wl = await ds.query<
          Array<{ column_name: string; field_type: string; data_source: string; is_system_fixed: number }>
        >(
          `SELECT column_name, field_type, data_source, is_system_fixed
             FROM pooldata_field_whitelist WHERE data_source='customer_core' ORDER BY column_name`,
        );
        expect(wl).toHaveLength(8);
        for (const r of wl) {
          expect(r.data_source).toBe('customer_core');
          expect(Number(r.is_system_fixed)).toBe(0);
        }
        expect(wl.find((r) => r.column_name === 'date_of_birth')?.field_type).toBe('numeric');
        expect(wl.find((r) => r.column_name === 'gender')?.field_type).toBe('categorical');

        for (const [col, cnt] of Object.entries(OPTION_COUNTS)) {
          const rows = await ds.query<Array<{ c: number }>>(
            `SELECT COUNT(*) AS c FROM pooldata_field_option WHERE column_name = ?`,
            [col],
          );
          expect(Number(rows[0].c), `options count for ${col}`).toBe(cnt);
        }
        // OPT-009：date_of_birth 無 options
        const dobOpts = await ds.query<Array<{ c: number }>>(
          `SELECT COUNT(*) AS c FROM pooldata_field_option WHERE column_name='date_of_birth'`,
        );
        expect(Number(dobOpts[0].c)).toBe(0);

        // OPT-001：gender code→label（value≠label）
        const gender = await ds.query<Array<{ option_value: string; option_label: string }>>(
          `SELECT option_value, option_label FROM pooldata_field_option WHERE column_name='gender' ORDER BY option_value`,
        );
        expect(gender).toEqual([
          { option_value: '1', option_label: '男' },
          { option_value: '2', option_label: '女' },
          { option_value: '3', option_label: '法人' },
        ]);

        // _desc value=label（抽 education）
        const edu = await ds.query<Array<{ option_value: string; option_label: string }>>(
          `SELECT option_value, option_label FROM pooldata_field_option WHERE column_name='education_desc'`,
        );
        for (const e of edu) expect(e.option_value).toBe(e.option_label);
      } finally {
        await ds.destroy();
      }
    });

    it('WL-006 / OPT-008 / MIGSEED-002：冪等 — 重跑 up() 後 whitelist=8 / options=106 不變', async () => {
      process.env.DB_TYPE = 'sqlite';
      const ds = await setupTables();
      try {
        for (let i = 0; i < 2; i++) {
          const qr = ds.createQueryRunner();
          await migration.up(qr);
          await qr.release();
        }
        const wl = await ds.query<Array<{ c: number }>>(
          `SELECT COUNT(*) AS c FROM pooldata_field_whitelist WHERE data_source='customer_core'`,
        );
        expect(Number(wl[0].c)).toBe(8);
        const opt = await ds.query<Array<{ c: number }>>(
          `SELECT COUNT(*) AS c FROM pooldata_field_option
             WHERE column_name IN ('gender','occupation_desc','education_desc','marital_status_desc',
                                   'customer_type_desc','monthly_income_desc','cpost_city')`,
        );
        expect(Number(opt[0].c)).toBe(106);
      } finally {
        await ds.destroy();
      }
    });

    it('MIGSEED-003 functional：down() 後 8 欄 whitelist + options 全清（FK 安全，無報錯）', async () => {
      process.env.DB_TYPE = 'sqlite';
      const ds = await setupTables();
      try {
        const upQr = ds.createQueryRunner();
        await migration.up(upQr);
        await upQr.release();

        const downQr = ds.createQueryRunner();
        await expect(migration.down(downQr)).resolves.not.toThrow();
        await downQr.release();

        const wl = await ds.query<Array<{ c: number }>>(
          `SELECT COUNT(*) AS c FROM pooldata_field_whitelist WHERE data_source='customer_core'`,
        );
        expect(Number(wl[0].c)).toBe(0);
        const opt = await ds.query<Array<{ c: number }>>(
          `SELECT COUNT(*) AS c FROM pooldata_field_option
             WHERE column_name IN ('gender','occupation_desc','cpost_city')`,
        );
        expect(Number(opt[0].c)).toBe(0);
      } finally {
        await ds.destroy();
      }
    });
  });
});

async function setupTables(): Promise<DataSource> {
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
      data_source VARCHAR(20) NOT NULL DEFAULT 'ob_pool_data',
      is_active INTEGER NOT NULL DEFAULT 1,
      is_system_fixed INTEGER NOT NULL DEFAULT 0,
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
