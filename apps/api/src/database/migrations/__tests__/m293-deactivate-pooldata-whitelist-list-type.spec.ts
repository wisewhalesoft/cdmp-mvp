/**
 * TC-MIG-m293：DeactivatePooldataWhitelistListType migration
 *   F096 v1.0 / AD-E07-26 §26.7（白名單清理：list_type 停用）
 *
 * 對應 test spec（F096-test.md）：
 *   - TS-F096-MIG-001：up() 將 list_type 設為 is_active=false（僅 1 列受影響）
 *   - TS-F096-MIG-002：down() 還原 list_type 為 is_active=true（可逆）
 *   - TS-F096-MIG-003：冪等性 — 重複執行 up() 安全（總列數不變、is_active 仍 false）
 *   - TS-F096-MIG-004：最小影響範圍 — 僅 list_type 受影響，case_status / best_case 不變
 *
 * 測試層：mock queryRunner SQL 斷言（對齊 m284 既有 migration 測試慣例）
 *         + functional SQLite in-memory（真實 UPDATE 行為驗證；本專案無 PG TestContainer）
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import type { QueryRunner } from 'typeorm';
import { DataSource } from 'typeorm';
import { DeactivatePooldataWhitelistListType1711360000293 } from '../1711360000293-DeactivatePooldataWhitelistListType';

describe('Migration m293: DeactivatePooldataWhitelistListType (F096 / AD-E07-26 §26.7)', () => {
  let migration: DeactivatePooldataWhitelistListType1711360000293;
  let queryRunner: { query: ReturnType<typeof vi.fn> };
  const originalDbType = process.env.DB_TYPE;

  beforeEach(() => {
    migration = new DeactivatePooldataWhitelistListType1711360000293();
    queryRunner = { query: vi.fn().mockResolvedValue(undefined) };
  });

  afterEach(() => {
    if (originalDbType === undefined) delete process.env.DB_TYPE;
    else process.env.DB_TYPE = originalDbType;
  });

  // ---- TS-F096-MIG-001 ----
  describe('up() — PostgreSQL', () => {
    beforeEach(() => {
      delete process.env.DB_TYPE;
    });

    it('TS-F096-MIG-001a: UPDATE pooldata_field_whitelist SET is_active=FALSE WHERE column_name=list_type', async () => {
      await migration.up(queryRunner as unknown as QueryRunner);
      const sqls = queryRunner.query.mock.calls.map((c) => c[0] as string);
      const upd = sqls.find((s) =>
        /UPDATE\s+pooldata_field_whitelist/i.test(s) &&
        /SET\s+is_active\s*=\s*FALSE/i.test(s) &&
        /WHERE\s+column_name\s*=\s*'list_type'/i.test(s),
      );
      expect(upd).toBeDefined();
    });

    it('TS-F096-MIG-001b: up() 僅一條 UPDATE，WHERE 精準限定 list_type（不誤動其他欄位）', async () => {
      await migration.up(queryRunner as unknown as QueryRunner);
      const sqls = queryRunner.query.mock.calls.map((c) => c[0] as string);
      const updates = sqls.filter((s) => /UPDATE\s+pooldata_field_whitelist/i.test(s));
      expect(updates.length).toBe(1);
      // 每條 UPDATE 必含 WHERE column_name='list_type' 限定（無未限定 WHERE 的全表 UPDATE）
      expect(updates[0]).toMatch(/WHERE\s+column_name\s*=\s*'list_type'/i);
      expect(updates[0]).toMatch(/UPDATE\s+pooldata_field_whitelist[\s\S]*WHERE\s+column_name\s*=\s*'list_type'/i);
      // 不得限定其他欄位
      for (const other of ['case_status', 'best_case', 'prod_kind', 'spec_tp', 'caseyear', 'settle_src']) {
        expect(updates[0]).not.toContain(`'${other}'`);
      }
    });

    it('TS-F096-MIG-001c: up() 不執行 INSERT / DELETE / DROP（純 UPDATE 設定變更）', async () => {
      await migration.up(queryRunner as unknown as QueryRunner);
      const allSql = queryRunner.query.mock.calls.map((c) => c[0] as string).join('\n');
      expect(allSql).not.toMatch(/INSERT\s+INTO/i);
      expect(allSql).not.toMatch(/DELETE\s+FROM/i);
      expect(allSql).not.toMatch(/DROP\s+/i);
      expect(allSql).not.toMatch(/CREATE\s+/i);
    });
  });

  // ---- TS-F096-MIG-002 ----
  describe('down() — PostgreSQL（可逆）', () => {
    beforeEach(() => {
      delete process.env.DB_TYPE;
    });

    it('TS-F096-MIG-002a: UPDATE ... SET is_active=TRUE WHERE column_name=list_type（還原）', async () => {
      await migration.down(queryRunner as unknown as QueryRunner);
      const sqls = queryRunner.query.mock.calls.map((c) => c[0] as string);
      const upd = sqls.find((s) =>
        /UPDATE\s+pooldata_field_whitelist/i.test(s) &&
        /SET\s+is_active\s*=\s*TRUE/i.test(s) &&
        /WHERE\s+column_name\s*=\s*'list_type'/i.test(s),
      );
      expect(upd).toBeDefined();
    });

    it('TS-F096-MIG-002b: down() 僅還原 list_type，不動其他條目', async () => {
      await migration.down(queryRunner as unknown as QueryRunner);
      const updates = queryRunner.query.mock.calls
        .map((c) => c[0] as string)
        .filter((s) => /^\s*UPDATE\s+pooldata_field_whitelist/i.test(s));
      expect(updates.length).toBe(1);
      expect(updates[0]).toMatch(/WHERE\s+column_name\s*=\s*'list_type'/i);
    });
  });

  // ---- TS-F096-MIG-003 SQLite 字面 ----
  describe('SQLite — is_active 字面用 0/1', () => {
    beforeEach(() => {
      process.env.DB_TYPE = 'sqlite';
    });

    it('up() SQLite 用 is_active = 0', async () => {
      await migration.up(queryRunner as unknown as QueryRunner);
      const sql = queryRunner.query.mock.calls.map((c) => c[0] as string).join('\n');
      expect(sql).toMatch(/SET\s+is_active\s*=\s*0/i);
      expect(sql).not.toMatch(/SET\s+is_active\s*=\s*FALSE/i);
    });

    it('down() SQLite 用 is_active = 1', async () => {
      await migration.down(queryRunner as unknown as QueryRunner);
      const sql = queryRunner.query.mock.calls.map((c) => c[0] as string).join('\n');
      expect(sql).toMatch(/SET\s+is_active\s*=\s*1/i);
      expect(sql).not.toMatch(/SET\s+is_active\s*=\s*TRUE/i);
    });
  });

  // ---- functional：SQLite in-memory（真實 UPDATE 行為 / 冪等 / 最小影響 / 可逆）----
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
        CREATE TABLE pooldata_field_whitelist (
          column_name VARCHAR(64) PRIMARY KEY,
          display_name VARCHAR(100) NOT NULL,
          field_type VARCHAR(20) NOT NULL,
          is_active INTEGER NOT NULL DEFAULT 1,
          created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
          updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
        )
      `);
      // seed：list_type(active) + case_status(active) + best_case(active)
      for (const r of [
        { c: 'list_type', d: '名單類型', t: 'categorical', a: 1 },
        { c: 'case_status', d: '案件結清期別', t: 'categorical', a: 1 },
        { c: 'best_case', d: '優質案件', t: 'categorical', a: 1 },
      ]) {
        await ds.query(
          `INSERT INTO pooldata_field_whitelist (column_name, display_name, field_type, is_active)
           VALUES ('${r.c}', '${r.d}', '${r.t}', ${r.a})`,
        );
      }
      return ds;
    }

    async function activeOf(ds: DataSource, col: string): Promise<number> {
      const rows = await ds.query<Array<{ is_active: number }>>(
        `SELECT is_active FROM pooldata_field_whitelist WHERE column_name = '${col}'`,
      );
      return Number(rows[0].is_active);
    }

    it('TS-F096-MIG-001 + MIG-004：up() 後 list_type=0；case_status / best_case 不變；總列數不變', async () => {
      process.env.DB_TYPE = 'sqlite';
      const ds = await setupSqlite();
      try {
        const before = await ds.query<Array<{ cnt: number }>>(
          `SELECT COUNT(*) as cnt FROM pooldata_field_whitelist`,
        );

        const qr = ds.createQueryRunner();
        await migration.up(qr);
        await qr.release();

        expect(await activeOf(ds, 'list_type')).toBe(0);
        // 最小影響：case_status / best_case 仍 active
        expect(await activeOf(ds, 'case_status')).toBe(1);
        expect(await activeOf(ds, 'best_case')).toBe(1);

        const after = await ds.query<Array<{ cnt: number }>>(
          `SELECT COUNT(*) as cnt FROM pooldata_field_whitelist`,
        );
        // 非 INSERT/DELETE，列數不變
        expect(Number(after[0].cnt)).toBe(Number(before[0].cnt));
      } finally {
        await ds.destroy();
      }
    });

    it('TS-F096-MIG-003：冪等 — 重複 up() 後 list_type 仍 0，總列數不變，不 throw', async () => {
      process.env.DB_TYPE = 'sqlite';
      const ds = await setupSqlite();
      try {
        const qr1 = ds.createQueryRunner();
        await migration.up(qr1);
        await qr1.release();
        const qr2 = ds.createQueryRunner();
        await migration.up(qr2);
        await qr2.release();

        expect(await activeOf(ds, 'list_type')).toBe(0);
        const cnt = await ds.query<Array<{ cnt: number }>>(
          `SELECT COUNT(*) as cnt FROM pooldata_field_whitelist`,
        );
        expect(Number(cnt[0].cnt)).toBe(3);
      } finally {
        await ds.destroy();
      }
    });

    it('TS-F096-MIG-002：down() 還原 list_type=1（可逆）；其他不受影響', async () => {
      process.env.DB_TYPE = 'sqlite';
      const ds = await setupSqlite();
      try {
        const qrUp = ds.createQueryRunner();
        await migration.up(qrUp);
        await qrUp.release();
        expect(await activeOf(ds, 'list_type')).toBe(0);

        const qrDown = ds.createQueryRunner();
        await migration.down(qrDown);
        await qrDown.release();

        expect(await activeOf(ds, 'list_type')).toBe(1);
        expect(await activeOf(ds, 'case_status')).toBe(1);
        expect(await activeOf(ds, 'best_case')).toBe(1);
      } finally {
        await ds.destroy();
      }
    });
  });
});
