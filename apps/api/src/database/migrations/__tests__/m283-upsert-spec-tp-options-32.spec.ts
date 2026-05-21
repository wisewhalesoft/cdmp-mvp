/**
 * TC-MIG-m283：UpsertSpecTpOptions32 migration
 *   F050 v2.1 重構（AD-E07-18 §18.3 M3 / F076 v1.5 §AC-3 / GAP-LIST §E5）
 *
 * 對應 test spec：
 *   - MT-M3-001：M3 up() 後 spec_tp 共 52 筆
 *   - MT-M3-002：M3 up() 重複執行不產生重複（UPSERT 冪等）
 *   - MT-M3-003：M3 down() 移除 spec_tp 所有 option 記錄
 *   - TS-F076-003：seed spec_tp 52 筆（真實 OBMCODEDF dump）非 placeholder 3 筆
 *   - TS-F076-004：spec_tp seed 重複執行不產生重複（UPSERT 冪等）
 *
 * 來源資料：reference/DumpData/OBMCODEDF_20260505.csv **TBL_ID='12'**（OBMSPEC_TP 真實 dump，
 *   含本牌 / 他牌 / 重車 等品牌前綴細分；m150 轉碼後 DB 為 'SPEC_TP'）
 *   - v1（commit 273fc0b）：32 筆來源誤指向 `TBL_ID='02'`（OBPROD_KIND 產品大類，3 筆），
 *     業務語意對應「汽車/機車/一般商品」三大類，與名單篩選欄位實際需求不符。
 *   - v2（本次）：改回真正的 `TBL_ID='12'` 52 筆（OBPOOLDATA.SPEC_TP 實際出現代碼集）。
 *
 * 涵蓋 cases：
 *   - PostgreSQL up()：DELETE column_name='spec_tp' → INSERT 52 筆 → ON CONFLICT DO UPDATE
 *   - SQLite up()：DELETE column_name='spec_tp' → INSERT OR REPLACE 52 筆
 *   - 52 筆內容含典型 TBL_CD（01 本牌/新車 / 11 他牌/新車 / 42 重車_新車 / 99 其他）
 *   - 52 筆全 is_active = true / TRUE
 *   - DELETE 限定 column_name='spec_tp'，不誤刪其他欄位
 *   - down()：DELETE column_name='spec_tp' + INSERT m24 placeholder 3 筆（01/02/03）
 *   - functional：SQLite in-memory 跑 m283 後 count=52
 *   - functional：第二次跑 up()（UPSERT 冪等）count 仍 52
 *   - functional：down() 後僅剩 m24 placeholder 3 筆
 *   - 不涉 pooldata_field_whitelist（spec_tp whitelist 由 m22 owns）
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import type { QueryRunner } from 'typeorm';
import { DataSource } from 'typeorm';
import { UpsertSpecTpOptions321711360000283 } from '../1711360000283-UpsertSpecTpOptions32';

describe('Migration 1711360000283: UpsertSpecTpOptions32 (TC-MIG-m283 / MT-M3-001~003 / TS-F076-003/004)', () => {
  let migration: UpsertSpecTpOptions321711360000283;
  let queryRunner: { query: ReturnType<typeof vi.fn> };
  const originalDbType = process.env.DB_TYPE;

  beforeEach(() => {
    migration = new UpsertSpecTpOptions321711360000283();
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

    it('MT-M3-001 / TS-F076-003：DELETE column_name=spec_tp → INSERT 52 筆', async () => {
      await migration.up(queryRunner as unknown as QueryRunner);
      const sqls = queryRunner.query.mock.calls.map((c) => c[0] as string);

      // 第一條應為 DELETE（清 m24 placeholder 3 筆）
      const deleteIdx = sqls.findIndex((s) =>
        /DELETE\s+FROM\s+pooldata_field_option\s+WHERE\s+column_name\s*=\s*'spec_tp'/i.test(s),
      );
      expect(deleteIdx).toBeGreaterThanOrEqual(0);

      // 52 筆 INSERT（每筆獨立 SQL）
      const inserts = sqls.filter((s) =>
        /INSERT\s+INTO\s+pooldata_field_option/i.test(s) &&
        /'spec_tp'/.test(s),
      );
      expect(inserts.length).toBe(52);

      // DELETE 必先於 INSERT
      const firstInsertIdx = sqls.findIndex((s) =>
        /INSERT\s+INTO\s+pooldata_field_option/i.test(s),
      );
      expect(deleteIdx).toBeLessThan(firstInsertIdx);
    });

    it('MT-M3-002 / TS-F076-004：每筆 INSERT 帶 ON CONFLICT (column_name, option_value) DO UPDATE（UPSERT 冪等）', async () => {
      await migration.up(queryRunner as unknown as QueryRunner);
      const inserts = queryRunner.query.mock.calls
        .map((c) => c[0] as string)
        .filter((s) => /INSERT\s+INTO\s+pooldata_field_option/i.test(s));

      for (const sql of inserts) {
        expect(sql).toMatch(
          /ON\s+CONFLICT\s*\(\s*column_name\s*,\s*option_value\s*\)\s+DO\s+UPDATE/i,
        );
      }
    });

    it('52 筆內容含典型 TBL_CD（01 本牌/新車 / 11 他牌/新車 / 42 重車_新車 / 99 其他）', async () => {
      await migration.up(queryRunner as unknown as QueryRunner);
      const allInsertSql = queryRunner.query.mock.calls
        .map((c) => c[0] as string)
        .filter((s) => /INSERT\s+INTO\s+pooldata_field_option/i.test(s))
        .join('\n');

      // 典型值（CSV TBL_ID='12' 取 TBL_CD / TBL_DESC1）
      expect(allInsertSql).toMatch(/'spec_tp'[^;]*'01'[^;]*'本牌\/新車'/);
      expect(allInsertSql).toMatch(/'spec_tp'[^;]*'11'[^;]*'他牌\/新車'/);
      expect(allInsertSql).toMatch(/'spec_tp'[^;]*'42'[^;]*'重車_新車'/);
      expect(allInsertSql).toMatch(/'spec_tp'[^;]*'99'[^;]*'其他'/);
      // 2026-04 新增之 3C/居家/娛樂類別
      expect(allInsertSql).toMatch(/'spec_tp'[^;]*'48'[^;]*'3C通訊家電'/);
      expect(allInsertSql).toMatch(/'spec_tp'[^;]*'53'[^;]*'B專案\(附擔保\)'/);
    });

    it('52 筆 is_active 全為 TRUE', async () => {
      await migration.up(queryRunner as unknown as QueryRunner);
      const inserts = queryRunner.query.mock.calls
        .map((c) => c[0] as string)
        .filter((s) => /INSERT\s+INTO\s+pooldata_field_option/i.test(s));

      for (const sql of inserts) {
        // PG 用 TRUE literal
        expect(sql).toMatch(/TRUE/);
        expect(sql).not.toMatch(/FALSE/);
      }
    });

    it('DELETE 限定 column_name=spec_tp，不誤刪其他欄位（不出現 prod_kind/caseyear/case_status/settle_src/best_case）', async () => {
      await migration.up(queryRunner as unknown as QueryRunner);
      const deleteSqls = queryRunner.query.mock.calls
        .map((c) => c[0] as string)
        .filter((s) => /DELETE\s+FROM\s+pooldata_field_option/i.test(s))
        .join('\n');

      for (const other of [
        'prod_kind',
        'caseyear',
        'case_status',
        'settle_src',
        'best_case',
        'list_type',
      ]) {
        expect(deleteSqls).not.toMatch(new RegExp(`'${other}'`));
      }
    });

    it('不重複 INSERT pooldata_field_whitelist（spec_tp whitelist 由 m22 owns）', async () => {
      await migration.up(queryRunner as unknown as QueryRunner);
      const allSql = queryRunner.query.mock.calls.map((c) => c[0]).join('\n');
      expect(allSql).not.toMatch(/INSERT[^;]*pooldata_field_whitelist/i);
    });
  });

  describe('up() — SQLite', () => {
    beforeEach(() => {
      process.env.DB_TYPE = 'sqlite';
    });

    it('SQLite 用 INSERT OR REPLACE INTO pooldata_field_option（無 ON CONFLICT）', async () => {
      await migration.up(queryRunner as unknown as QueryRunner);
      const inserts = queryRunner.query.mock.calls
        .map((c) => c[0] as string)
        .filter((s) => /INSERT/i.test(s) && /pooldata_field_option/i.test(s));

      expect(inserts.length).toBe(52);
      for (const sql of inserts) {
        expect(sql).toMatch(/INSERT\s+OR\s+REPLACE\s+INTO\s+pooldata_field_option/i);
        expect(sql).not.toMatch(/ON\s+CONFLICT/i);
      }
    });

    it('SQLite is_active literal 用 1（boolean 數字）', async () => {
      await migration.up(queryRunner as unknown as QueryRunner);
      const inserts = queryRunner.query.mock.calls
        .map((c) => c[0] as string)
        .filter((s) => /INSERT\s+OR\s+REPLACE/i.test(s));

      for (const sql of inserts) {
        // SQLite 布林用 1/0
        expect(sql).not.toMatch(/TRUE/i);
        expect(sql).not.toMatch(/FALSE/i);
      }
    });
  });

  describe('down()', () => {
    it('MT-M3-003：DELETE column_name=spec_tp（清空 52 筆）', async () => {
      await migration.down(queryRunner as unknown as QueryRunner);
      const sqls = queryRunner.query.mock.calls.map((c) => c[0] as string);
      const deleteSql = sqls.find((s) =>
        /DELETE\s+FROM\s+pooldata_field_option\s+WHERE\s+column_name\s*=\s*'spec_tp'/i.test(s),
      );
      expect(deleteSql).toBeDefined();
    });

    it('down() 還原 m24 placeholder 3 筆（01 / 02 / 03）以維持 down 對稱', async () => {
      await migration.down(queryRunner as unknown as QueryRunner);
      const sqls = queryRunner.query.mock.calls.map((c) => c[0] as string);
      const inserts = sqls.filter(
        (s) => /INSERT/i.test(s) && /pooldata_field_option/i.test(s) && /'spec_tp'/i.test(s),
      );
      expect(inserts.length).toBe(3);

      const all = inserts.join('\n');
      expect(all).toMatch(/'spec_tp'[^;]*'01'/);
      expect(all).toMatch(/'spec_tp'[^;]*'02'/);
      expect(all).toMatch(/'spec_tp'[^;]*'03'/);
    });

    it('down() 不動 pooldata_field_whitelist（m22 owns）', async () => {
      await migration.down(queryRunner as unknown as QueryRunner);
      const allSql = queryRunner.query.mock.calls.map((c) => c[0]).join('\n');
      expect(allSql).not.toMatch(/DELETE\s+FROM\s+pooldata_field_whitelist/i);
      expect(allSql).not.toMatch(/INSERT[^;]*pooldata_field_whitelist/i);
    });
  });

  describe('functional: SQLite in-memory', () => {
    it('MT-M3-001：跑 m283 up() 後 spec_tp count=52', async () => {
      process.env.DB_TYPE = 'sqlite';
      const ds = await setupSqlite();
      try {
        const qr = ds.createQueryRunner();
        try {
          await migration.up(qr);
        } finally {
          await qr.release();
        }

        const rows = await ds.query<Array<{ cnt: number }>>(
          `SELECT COUNT(*) as cnt FROM pooldata_field_option WHERE column_name = 'spec_tp'`,
        );
        expect(Number(rows[0].cnt)).toBe(52);

        // is_active 全 1
        const active = await ds.query<Array<{ cnt: number }>>(
          `SELECT COUNT(*) as cnt FROM pooldata_field_option WHERE column_name = 'spec_tp' AND is_active = 1`,
        );
        expect(Number(active[0].cnt)).toBe(52);
      } finally {
        await ds.destroy();
      }
    });

    it('MT-M3-002 / TS-F076-004：第二次 up() 不增加 count（UPSERT 冪等）', async () => {
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

        const rows = await ds.query<Array<{ cnt: number }>>(
          `SELECT COUNT(*) as cnt FROM pooldata_field_option WHERE column_name = 'spec_tp'`,
        );
        expect(Number(rows[0].cnt)).toBe(52);
      } finally {
        await ds.destroy();
      }
    });

    it('MT-M3-003：down() 後 count 為 m24 placeholder 3 筆（不是 0；維持 down 對稱）', async () => {
      process.env.DB_TYPE = 'sqlite';
      const ds = await setupSqlite();
      try {
        const qrUp = ds.createQueryRunner();
        await migration.up(qrUp);
        await qrUp.release();

        const qrDown = ds.createQueryRunner();
        await migration.down(qrDown);
        await qrDown.release();

        const rows = await ds.query<Array<{ cnt: number }>>(
          `SELECT COUNT(*) as cnt FROM pooldata_field_option WHERE column_name = 'spec_tp'`,
        );
        expect(Number(rows[0].cnt)).toBe(3);
      } finally {
        await ds.destroy();
      }
    });

    it('functional：down() 後 m22 之 prod_kind options 未受影響', async () => {
      process.env.DB_TYPE = 'sqlite';
      const ds = await setupSqlite();
      try {
        // pre-seed prod_kind 3 筆模擬 m22
        await ds.query(
          `INSERT INTO pooldata_field_option (column_name, option_value, option_label, is_active, deactivation_reason, created_at, updated_at)
           VALUES ('prod_kind', '01', '汽車新車', 1, NULL, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
        );
        await ds.query(
          `INSERT INTO pooldata_field_option (column_name, option_value, option_label, is_active, deactivation_reason, created_at, updated_at)
           VALUES ('prod_kind', '02', '機車', 1, NULL, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
        );

        const qrUp = ds.createQueryRunner();
        await migration.up(qrUp);
        await qrUp.release();

        const qrDown = ds.createQueryRunner();
        await migration.down(qrDown);
        await qrDown.release();

        const rows = await ds.query<Array<{ cnt: number }>>(
          `SELECT COUNT(*) as cnt FROM pooldata_field_option WHERE column_name = 'prod_kind'`,
        );
        expect(Number(rows[0].cnt)).toBe(2);
      } finally {
        await ds.destroy();
      }
    });
  });
});

/**
 * 建立簡化版 pooldata_field_option SQLite schema（不含 FK 以利測試獨立性）
 */
async function setupSqlite(): Promise<DataSource> {
  const ds = new DataSource({
    type: 'better-sqlite3',
    database: ':memory:',
    entities: [],
    synchronize: false,
  });
  await ds.initialize();
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
