/**
 * TC-MIG-m294：FixProdKindOptionLabels migration
 *   F076 v1.6（prod_kind option 標籤對齊 OBMCODEDF dump TBL_ID='01'）
 *
 * 對應 test spec（F076-test.md）：
 *   - TS-F076-MIG-294-001：up() 將 01→'汽車'、03→'一般商品'
 *   - TS-F076-MIG-294-002：down() 還原 01→'汽車新車'、03→'其他商品'（可逆）
 *   - TS-F076-MIG-294-003：冪等性 — 重複執行 up() 安全（總列數不變、標籤仍正確）
 *   - TS-F076-MIG-294-004：最小影響 — 僅 prod_kind 01/03；02 機車與其他欄位不變
 *
 * 測試層：mock queryRunner SQL 斷言（對齊 m284 / m293 既有 migration 測試慣例）
 *         + functional SQLite in-memory（真實 UPDATE 行為驗證）
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import type { QueryRunner } from 'typeorm';
import { DataSource } from 'typeorm';
import { FixProdKindOptionLabels1711360000294 } from '../1711360000294-FixProdKindOptionLabels';

describe('Migration m294: FixProdKindOptionLabels (F076 v1.6)', () => {
  let migration: FixProdKindOptionLabels1711360000294;
  let queryRunner: { query: ReturnType<typeof vi.fn> };
  const originalDbType = process.env.DB_TYPE;

  beforeEach(() => {
    migration = new FixProdKindOptionLabels1711360000294();
    queryRunner = { query: vi.fn().mockResolvedValue(undefined) };
  });

  afterEach(() => {
    if (originalDbType === undefined) delete process.env.DB_TYPE;
    else process.env.DB_TYPE = originalDbType;
  });

  // ---- TS-F076-MIG-294-001 ----
  describe('up() — SQL 斷言', () => {
    it('TS-294-001a: 01 → UPDATE option_label=汽車 WHERE column_name=prod_kind AND option_value=01', async () => {
      await migration.up(queryRunner as unknown as QueryRunner);
      const sqls = queryRunner.query.mock.calls.map((c) => c[0] as string);
      const upd = sqls.find(
        (s) =>
          /UPDATE\s+pooldata_field_option/i.test(s) &&
          /SET\s+option_label\s*=\s*'汽車'/.test(s) &&
          /column_name\s*=\s*'prod_kind'/i.test(s) &&
          /option_value\s*=\s*'01'/i.test(s),
      );
      expect(upd).toBeDefined();
    });

    it('TS-294-001b: 03 → UPDATE option_label=一般商品 WHERE option_value=03', async () => {
      await migration.up(queryRunner as unknown as QueryRunner);
      const sqls = queryRunner.query.mock.calls.map((c) => c[0] as string);
      const upd = sqls.find(
        (s) =>
          /UPDATE\s+pooldata_field_option/i.test(s) &&
          /SET\s+option_label\s*=\s*'一般商品'/.test(s) &&
          /option_value\s*=\s*'03'/i.test(s),
      );
      expect(upd).toBeDefined();
    });

    it('TS-294-001c: up() 只有兩條 UPDATE、皆限定 prod_kind；不誤動 02 機車', async () => {
      await migration.up(queryRunner as unknown as QueryRunner);
      const updates = queryRunner.query.mock.calls
        .map((c) => c[0] as string)
        .filter((s) => /UPDATE\s+pooldata_field_option/i.test(s));
      expect(updates.length).toBe(2);
      for (const u of updates) {
        expect(u).toMatch(/column_name\s*=\s*'prod_kind'/i);
        expect(u).not.toMatch(/option_value\s*=\s*'02'/i);
      }
    });

    it('TS-294-001d: up() 不執行 INSERT / DELETE / DROP / CREATE（純 UPDATE）', async () => {
      await migration.up(queryRunner as unknown as QueryRunner);
      const allSql = queryRunner.query.mock.calls.map((c) => c[0] as string).join('\n');
      expect(allSql).not.toMatch(/INSERT\s+INTO/i);
      expect(allSql).not.toMatch(/DELETE\s+FROM/i);
      expect(allSql).not.toMatch(/DROP\s+/i);
      expect(allSql).not.toMatch(/CREATE\s+/i);
    });
  });

  // ---- TS-F076-MIG-294-002 ----
  describe('down() — 可逆', () => {
    it('TS-294-002a: down() 還原 01→汽車新車、03→其他商品', async () => {
      await migration.down(queryRunner as unknown as QueryRunner);
      const allSql = queryRunner.query.mock.calls.map((c) => c[0] as string).join('\n');
      expect(allSql).toMatch(/SET\s+option_label\s*=\s*'汽車新車'[\s\S]*option_value\s*=\s*'01'/);
      expect(allSql).toMatch(/SET\s+option_label\s*=\s*'其他商品'[\s\S]*option_value\s*=\s*'03'/);
    });
  });

  // ---- functional：SQLite in-memory ----
  describe('functional: SQLite in-memory', () => {
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
          deactivation_reason VARCHAR(255),
          created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
          updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
          PRIMARY KEY (column_name, option_value)
        )
      `);
      // seed：模擬 m22 原始（誤）標籤 + 另一欄位（list_type）作最小影響對照
      for (const r of [
        { c: 'prod_kind', v: '01', l: '汽車新車' },
        { c: 'prod_kind', v: '02', l: '機車' },
        { c: 'prod_kind', v: '03', l: '其他商品' },
        { c: 'list_type', v: '01', l: '期中' },
      ]) {
        await ds.query(
          `INSERT INTO pooldata_field_option (column_name, option_value, option_label)
           VALUES ('${r.c}', '${r.v}', '${r.l}')`,
        );
      }
      return ds;
    }

    async function labelOf(ds: DataSource, col: string, val: string): Promise<string> {
      const rows = await ds.query<Array<{ option_label: string }>>(
        `SELECT option_label FROM pooldata_field_option WHERE column_name='${col}' AND option_value='${val}'`,
      );
      return rows[0].option_label;
    }

    it('TS-294-001 + 004：up() 後 01=汽車、03=一般商品；02 機車與 list_type 不變；列數不變', async () => {
      const ds = await setupSqlite();
      try {
        const before = await ds.query<Array<{ cnt: number }>>(
          `SELECT COUNT(*) as cnt FROM pooldata_field_option`,
        );

        const qr = ds.createQueryRunner();
        await migration.up(qr);
        await qr.release();

        expect(await labelOf(ds, 'prod_kind', '01')).toBe('汽車');
        expect(await labelOf(ds, 'prod_kind', '03')).toBe('一般商品');
        // 最小影響：02 機車與其他欄位不動
        expect(await labelOf(ds, 'prod_kind', '02')).toBe('機車');
        expect(await labelOf(ds, 'list_type', '01')).toBe('期中');

        const after = await ds.query<Array<{ cnt: number }>>(
          `SELECT COUNT(*) as cnt FROM pooldata_field_option`,
        );
        expect(Number(after[0].cnt)).toBe(Number(before[0].cnt));
      } finally {
        await ds.destroy();
      }
    });

    it('TS-294-003：冪等 — 重複 up() 後標籤仍正確、列數不變、不 throw', async () => {
      const ds = await setupSqlite();
      try {
        const qr1 = ds.createQueryRunner();
        await migration.up(qr1);
        await qr1.release();
        const qr2 = ds.createQueryRunner();
        await migration.up(qr2);
        await qr2.release();

        expect(await labelOf(ds, 'prod_kind', '01')).toBe('汽車');
        expect(await labelOf(ds, 'prod_kind', '03')).toBe('一般商品');
        const cnt = await ds.query<Array<{ cnt: number }>>(
          `SELECT COUNT(*) as cnt FROM pooldata_field_option`,
        );
        expect(Number(cnt[0].cnt)).toBe(4);
      } finally {
        await ds.destroy();
      }
    });

    it('TS-294-002：down() 還原 01=汽車新車、03=其他商品（可逆）；02 不受影響', async () => {
      const ds = await setupSqlite();
      try {
        const qrUp = ds.createQueryRunner();
        await migration.up(qrUp);
        await qrUp.release();
        expect(await labelOf(ds, 'prod_kind', '01')).toBe('汽車');

        const qrDown = ds.createQueryRunner();
        await migration.down(qrDown);
        await qrDown.release();

        expect(await labelOf(ds, 'prod_kind', '01')).toBe('汽車新車');
        expect(await labelOf(ds, 'prod_kind', '03')).toBe('其他商品');
        expect(await labelOf(ds, 'prod_kind', '02')).toBe('機車');
      } finally {
        await ds.destroy();
      }
    });
  });
});
