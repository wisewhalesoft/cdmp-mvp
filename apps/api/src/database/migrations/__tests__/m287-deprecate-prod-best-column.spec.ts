/**
 * TC-MIG-m287：DeprecateProdBestColumn migration（M-A2）
 *   F050 v2.1.1 / US-128 / Q-B B3 / architecture-spec §18.11.4
 *
 * 對應 test spec：
 *   - TS-F050-B01：PG Step 1 — UPDATE SET NULL WHERE IS NOT NULL
 *   - TS-F050-B02：PG Step 2 — ALTER COLUMN DROP NOT NULL，且 UPDATE 先於 ALTER
 *   - TS-F050-B03：SQLite 表重建模式 — 全欄位 CREATE TABLE，prod_best 不含 NOT NULL；
 *                  含 condition_payload / stage / cr_enabled（R9 風險緩解）
 *   - TS-F050-B04：functional SQLite — 執行前 prod_best NOT NULL，執行後 nullable；
 *                  既有非空資料全部變 NULL
 *   - TS-F050-B05：idempotent — 連續執行 2 次無 error，資料無差異
 *   - TS-F050-B06：down() — UPDATE NULL → 補空字串，ALTER SET NOT NULL，UPDATE 先於 ALTER
 *
 * R10 執行順序保護（architecture-spec §18.11.9）：
 *   M-A1 (m286) → M-A2 (m287) → entity 修改 → service 修改
 *   本測試以 in-memory SQLite 模擬全鏈，每次 setup 重新建表
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import type { QueryRunner } from 'typeorm';
import { DataSource } from 'typeorm';
import { DeprecateProdBestColumn1711360000287 } from '../1711360000287-DeprecateProdBestColumn';

describe('Migration 1711360000287: DeprecateProdBestColumn (TC-MIG-m287 / TS-F050-B01~B06)', () => {
  let migration: DeprecateProdBestColumn1711360000287;
  let queryRunner: { query: ReturnType<typeof vi.fn> };
  const originalDbType = process.env.DB_TYPE;

  beforeEach(() => {
    migration = new DeprecateProdBestColumn1711360000287();
    queryRunner = { query: vi.fn().mockResolvedValue([]) };
  });

  afterEach(() => {
    if (originalDbType === undefined) delete process.env.DB_TYPE;
    else process.env.DB_TYPE = originalDbType;
  });

  describe('up() — PostgreSQL', () => {
    beforeEach(() => {
      delete process.env.DB_TYPE;
    });

    it('TS-F050-B01：Step 1 — UPDATE ob_list_definition SET prod_best = NULL WHERE prod_best IS NOT NULL', async () => {
      await migration.up(queryRunner as unknown as QueryRunner);
      const sqls = queryRunner.query.mock.calls.map((c) => c[0] as string);
      const updateSql = sqls.find(
        (s) =>
          /UPDATE\s+ob_list_definition\s+SET\s+prod_best\s*=\s*NULL/i.test(s) &&
          /WHERE\s+prod_best\s+IS\s+NOT\s+NULL/i.test(s),
      );
      expect(updateSql).toBeDefined();
    });

    it('TS-F050-B02：Step 2 — ALTER COLUMN DROP NOT NULL，且 UPDATE 先於 ALTER', async () => {
      await migration.up(queryRunner as unknown as QueryRunner);
      const sqls = queryRunner.query.mock.calls.map((c) => c[0] as string);

      const updateIdx = sqls.findIndex(
        (s) => /UPDATE\s+ob_list_definition\s+SET\s+prod_best\s*=\s*NULL/i.test(s),
      );
      const alterIdx = sqls.findIndex(
        (s) =>
          /ALTER\s+TABLE\s+ob_list_definition\s+ALTER\s+COLUMN\s+prod_best\s+DROP\s+NOT\s+NULL/i.test(
            s,
          ),
      );

      expect(updateIdx).toBeGreaterThanOrEqual(0);
      expect(alterIdx).toBeGreaterThanOrEqual(0);
      expect(updateIdx).toBeLessThan(alterIdx);
    });
  });

  describe('up() — SQLite', () => {
    beforeEach(() => {
      process.env.DB_TYPE = 'sqlite';
      // queryRunner.query 預設 mock 為 [] — 模擬 PRAGMA table_info(ob_list_definition)
      // 為了讓表重建邏輯能進入，PRAGMA 必須回非空（代表表存在）
      queryRunner.query = vi.fn().mockImplementation((sql: string) => {
        if (/PRAGMA\s+table_info/i.test(sql)) {
          // 回傳模擬欄位（至少含 prod_best 表示尚未重建）
          return Promise.resolve([
            { name: 'list_no', type: 'VARCHAR(11)', notnull: 1, dflt_value: null, pk: 1 },
            { name: 'prod_best', type: 'VARCHAR(5)', notnull: 1, dflt_value: null, pk: 0 },
          ]);
        }
        return Promise.resolve([]);
      });
    });

    it('TS-F050-B03：表重建 — 含 CREATE TABLE 新表 / INSERT FROM old / DROP old / RENAME new', async () => {
      await migration.up(queryRunner as unknown as QueryRunner);
      const sqls = queryRunner.query.mock.calls.map((c) => c[0] as string);

      // 1. CREATE TABLE 新表（ob_list_definition_new）
      const createIdx = sqls.findIndex((s) =>
        /CREATE\s+TABLE\s+ob_list_definition_new/i.test(s),
      );
      expect(createIdx).toBeGreaterThanOrEqual(0);

      // 2. INSERT INTO ... SELECT ... FROM old；prod_best 由 SELECT NULL 注入（一步完成資料清空）
      const insertSql = sqls.find(
        (s) =>
          /INSERT\s+INTO\s+ob_list_definition_new[^;]*SELECT[^;]*FROM\s+ob_list_definition/i.test(s),
      );
      expect(insertSql).toBeDefined();
      expect(insertSql).toMatch(/NULL\s+AS\s+prod_best/i);
      const insertIdx = sqls.indexOf(insertSql as string);

      // 3. DROP TABLE 舊表
      const dropIdx = sqls.findIndex(
        (s) => /DROP\s+TABLE\s+ob_list_definition\b(?!_new)/i.test(s),
      );
      expect(dropIdx).toBeGreaterThanOrEqual(0);

      // 4. ALTER TABLE ... RENAME TO ob_list_definition
      const renameIdx = sqls.findIndex(
        (s) =>
          /ALTER\s+TABLE\s+ob_list_definition_new\s+RENAME\s+TO\s+ob_list_definition/i.test(s),
      );
      expect(renameIdx).toBeGreaterThanOrEqual(0);

      // 5. UPDATE SET NULL（幂等補強；於表重建後執行 — SQLite NOT NULL 拒絕 UPDATE，故順序逆於 PG path）
      const updateIdx = sqls.findIndex((s) =>
        /UPDATE\s+ob_list_definition\s+SET\s+prod_best\s*=\s*NULL/i.test(s),
      );
      expect(updateIdx).toBeGreaterThanOrEqual(0);

      // 順序驗證：CREATE → INSERT → DROP → RENAME（DDL 重建順序必須正確）
      expect(createIdx).toBeLessThan(insertIdx);
      expect(insertIdx).toBeLessThan(dropIdx);
      expect(dropIdx).toBeLessThan(renameIdx);
    });

    it('TS-F050-B03 (R9 風險緩解)：CREATE TABLE 含全欄位 — prod_best 不含 NOT NULL；含 condition_payload / stage / cr_enabled', async () => {
      await migration.up(queryRunner as unknown as QueryRunner);
      const sqls = queryRunner.query.mock.calls.map((c) => c[0] as string);
      const createSql = sqls.find((s) => /CREATE\s+TABLE[^;]*ob_list_definition/i.test(s));
      expect(createSql).toBeDefined();

      const sql = createSql as string;

      // R9：必含後期新增關鍵欄位（避免資料丟失）
      expect(sql).toMatch(/condition_payload/i);
      expect(sql).toMatch(/\bstage\b/i);
      expect(sql).toMatch(/cr_enabled/i);
      expect(sql).toMatch(/case_status/i);

      // prod_best 欄位存在但「不含 NOT NULL」
      // 抽出 prod_best 那一段做精確比對
      const prodBestMatch = sql.match(/prod_best[^,)\n]+/i);
      expect(prodBestMatch).not.toBeNull();
      const prodBestSegment = prodBestMatch![0];
      expect(prodBestSegment).not.toMatch(/NOT\s+NULL/i);

      // 同時驗證 28 個 entity column 全部出現（R9 緩解 — 不可遺漏）
      const expectedCols = [
        'list_no', 'list_nm', 'prod_kind', 'prod_best', 'spec_tp', 'list_type',
        'list_period_start', 'list_period_end', 'list_interval',
        'assigned_date', 'total_amount', 'reserved_amount', 'is_assigned',
        'project_workym', 'casenumber', 'name', 'caseyear', 'caseyearnm',
        'settle_src', 'card_type', 'status', 'stage', 'case_status', 'cr_enabled',
        'condition_payload',
        'created_by_prog', 'created_by', 'created_at',
        'updated_by_prog', 'updated_by', 'updated_at',
      ];
      for (const col of expectedCols) {
        expect(sql).toMatch(new RegExp(`\\b${col}\\b`));
      }
    });
  });

  describe('down() — PostgreSQL', () => {
    beforeEach(() => {
      delete process.env.DB_TYPE;
    });

    it('TS-F050-B06：UPDATE NULL → 補空字串，ALTER SET NOT NULL，UPDATE 先於 ALTER', async () => {
      await migration.down(queryRunner as unknown as QueryRunner);
      const sqls = queryRunner.query.mock.calls.map((c) => c[0] as string);

      const updateIdx = sqls.findIndex(
        (s) =>
          /UPDATE\s+ob_list_definition\s+SET\s+prod_best\s*=\s*''[^;]*WHERE\s+prod_best\s+IS\s+NULL/i.test(
            s,
          ),
      );
      const alterIdx = sqls.findIndex(
        (s) =>
          /ALTER\s+TABLE\s+ob_list_definition\s+ALTER\s+COLUMN\s+prod_best\s+SET\s+NOT\s+NULL/i.test(
            s,
          ),
      );

      expect(updateIdx).toBeGreaterThanOrEqual(0);
      expect(alterIdx).toBeGreaterThanOrEqual(0);
      expect(updateIdx).toBeLessThan(alterIdx);
    });
  });

  describe('functional: SQLite in-memory', () => {
    it('TS-F050-B04：執行前 prod_best NOT NULL，執行後 nullable；既有非空資料全部變 NULL', async () => {
      process.env.DB_TYPE = 'sqlite';
      const ds = await setupSqliteWithNotNullProdBest();
      try {
        // 插入 2 筆含非空 prod_best 的紀錄
        await ds.query(
          `INSERT INTO ob_list_definition
             (list_no, list_nm, prod_kind, prod_best, spec_tp, list_type,
              list_period_start, list_period_end, list_interval,
              card_type, status, stage, case_status, cr_enabled, condition_payload,
              created_by_prog, created_by, created_at,
              updated_by_prog, updated_by, updated_at)
           VALUES
             ('OB202605001', '名單1', '01', 'Y', NULL, '01',
              '1', '6', '1',
              'S5', 'active', 'draft', NULL, 0, NULL,
              'CDMP', 'tester', CURRENT_TIMESTAMP,
              'CDMP', 'tester', CURRENT_TIMESTAMP),
             ('OB202605002', '名單2', '02', 'N', NULL, '01',
              '1', '6', '1',
              'M', 'active', 'draft', NULL, 0, NULL,
              'CDMP', 'tester', CURRENT_TIMESTAMP,
              'CDMP', 'tester', CURRENT_TIMESTAMP)`,
        );

        // 執行 migration
        const qr = ds.createQueryRunner();
        await migration.up(qr);
        await qr.release();

        // 既有兩筆 prod_best 全部變 NULL
        const rows = await ds.query<Array<{ list_no: string; prod_best: string | null }>>(
          `SELECT list_no, prod_best FROM ob_list_definition ORDER BY list_no`,
        );
        expect(rows.length).toBe(2);
        expect(rows[0].prod_best).toBeNull();
        expect(rows[1].prod_best).toBeNull();

        // 驗證 nullable：INSERT 不提供 prod_best 應成功
        await expect(
          ds.query(
            `INSERT INTO ob_list_definition
               (list_no, list_nm, prod_kind, spec_tp, list_type,
                list_period_start, list_period_end, list_interval,
                card_type, status, stage, case_status, cr_enabled, condition_payload,
                created_by_prog, created_by, created_at,
                updated_by_prog, updated_by, updated_at)
             VALUES
               ('OB202605003', '名單3', '01', NULL, '01',
                '1', '6', '1',
                NULL, 'active', 'draft', NULL, 0, NULL,
                'CDMP', 'tester', CURRENT_TIMESTAMP,
                'CDMP', 'tester', CURRENT_TIMESTAMP)`,
          ),
        ).resolves.toBeDefined();

        // 取得該筆紀錄，prod_best 應為 null
        const newRow = await ds.query<Array<{ prod_best: string | null }>>(
          `SELECT prod_best FROM ob_list_definition WHERE list_no = 'OB202605003'`,
        );
        expect(newRow[0].prod_best).toBeNull();
      } finally {
        await ds.destroy();
      }
    });

    it('TS-F050-B05：M-A2 idempotent — 連續執行 2 次無 error，資料無差異', async () => {
      process.env.DB_TYPE = 'sqlite';
      const ds = await setupSqliteWithNotNullProdBest();
      try {
        await ds.query(
          `INSERT INTO ob_list_definition
             (list_no, list_nm, prod_kind, prod_best, spec_tp, list_type,
              list_period_start, list_period_end, list_interval,
              card_type, status, stage, case_status, cr_enabled, condition_payload,
              created_by_prog, created_by, created_at,
              updated_by_prog, updated_by, updated_at)
           VALUES
             ('OB202605001', '名單1', '01', 'Y', NULL, '01',
              '1', '6', '1',
              'S5', 'active', 'draft', NULL, 0, NULL,
              'CDMP', 'tester', CURRENT_TIMESTAMP,
              'CDMP', 'tester', CURRENT_TIMESTAMP)`,
        );

        // 跑兩次（第二次應為 no-op，不拋例外）
        const qr1 = ds.createQueryRunner();
        await migration.up(qr1);
        await qr1.release();

        const qr2 = ds.createQueryRunner();
        await expect(migration.up(qr2)).resolves.toBeUndefined();
        await qr2.release();

        const rows = await ds.query<Array<{ list_no: string; prod_best: string | null }>>(
          `SELECT list_no, prod_best FROM ob_list_definition ORDER BY list_no`,
        );
        expect(rows.length).toBe(1);
        expect(rows[0].prod_best).toBeNull();
      } finally {
        await ds.destroy();
      }
    });
  });
});

async function setupSqliteWithNotNullProdBest(): Promise<DataSource> {
  const ds = new DataSource({
    type: 'better-sqlite3',
    database: ':memory:',
    entities: [],
    synchronize: false,
  });
  await ds.initialize();
  // 模擬 m287 之前 schema：prod_best NOT NULL
  // 含 entity 全 28 個欄位（與 m287 重建後保持相同欄位集，唯一差異在 prod_best NOT NULL → NULL）
  await ds.query(`
    CREATE TABLE ob_list_definition (
      list_no VARCHAR(11) NOT NULL PRIMARY KEY,
      list_nm VARCHAR(45) NOT NULL,
      prod_kind VARCHAR(255) NOT NULL,
      prod_best VARCHAR(5) NOT NULL DEFAULT '',
      spec_tp VARCHAR(255),
      list_type VARCHAR(255) NOT NULL,
      list_period_start VARCHAR(3) NOT NULL,
      list_period_end VARCHAR(3) NOT NULL,
      list_interval VARCHAR(3) NOT NULL,
      assigned_date DATETIME,
      total_amount INTEGER,
      reserved_amount INTEGER,
      is_assigned VARCHAR(1),
      project_workym VARCHAR(6),
      casenumber VARCHAR(50),
      name VARCHAR(50),
      caseyear VARCHAR(255),
      caseyearnm VARCHAR(10),
      settle_src VARCHAR(6),
      card_type VARCHAR(5),
      status VARCHAR(10) NOT NULL DEFAULT 'active',
      stage VARCHAR(20) NOT NULL DEFAULT 'draft',
      case_status VARCHAR(14),
      cr_enabled INTEGER NOT NULL DEFAULT 0,
      condition_payload TEXT,
      created_by_prog VARCHAR(20) NOT NULL,
      created_by VARCHAR(20) NOT NULL,
      created_at DATETIME NOT NULL,
      updated_by_prog VARCHAR(20) NOT NULL,
      updated_by VARCHAR(20) NOT NULL,
      updated_at DATETIME NOT NULL
    )
  `);
  return ds;
}
