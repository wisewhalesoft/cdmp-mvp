/**
 * TC-MIG-m281: AddObListDefinitionConditionPayload migration（F050 v2.1 重構 / AD-E07-18 §18.3 M1）
 *
 * 對應 test spec：MT-M1-001 / MT-M1-002 / MT-M1-003 / MT-M1-004
 * 對應 spec：
 *   - architecture-spec.md §18.3 M1：ALTER TABLE ob_list_definition ADD COLUMN condition_payload JSONB（PG）/ TEXT（SQLite）+ GIN index
 *   - GAP-LIST §E1
 *
 * 涵蓋 case：
 *   1) PG up()：ADD COLUMN IF NOT EXISTS condition_payload JSONB + CREATE INDEX IF NOT EXISTS USING gin
 *   2) SQLite up()：PRAGMA table_info guard + ADD COLUMN condition_payload TEXT；不發 GIN
 *   3) PG down()：DROP INDEX + DROP COLUMN
 *   4) SQLite down()：DROP COLUMN（無 GIN index 可 DROP）
 *   5) functional：sqlite in-memory 序列跑 m100→m180→m181→m182→m281，既有 3 筆 condition_payload 為 null
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import type { QueryRunner } from 'typeorm';
import { DataSource } from 'typeorm';
import { AddObListDefinitionConditionPayload1711360000281 } from '../1711360000281-AddObListDefinitionConditionPayload';

describe('Migration 1711360000281: AddObListDefinitionConditionPayload (TC-MIG-m281 / MT-M1-001~004)', () => {
  let migration: AddObListDefinitionConditionPayload1711360000281;
  let queryRunner: {
    query: ReturnType<typeof vi.fn>;
  };
  const originalDbType = process.env.DB_TYPE;

  beforeEach(() => {
    migration = new AddObListDefinitionConditionPayload1711360000281();
    queryRunner = {
      query: vi.fn().mockResolvedValue([]),
    };
  });

  afterEach(() => {
    if (originalDbType === undefined) {
      delete process.env.DB_TYPE;
    } else {
      process.env.DB_TYPE = originalDbType;
    }
  });

  describe('up()', () => {
    it('MT-M1-001：PG ADD COLUMN IF NOT EXISTS condition_payload JSONB + GIN index', async () => {
      delete process.env.DB_TYPE;
      await migration.up(queryRunner as unknown as QueryRunner);
      const calls = queryRunner.query.mock.calls.map((c) => c[0] as string);

      const addColumn = calls.find((sql) =>
        /ALTER\s+TABLE\s+ob_list_definition\s+ADD\s+COLUMN\s+IF\s+NOT\s+EXISTS\s+condition_payload\s+JSONB/i.test(
          sql,
        ),
      );
      expect(addColumn).toBeDefined();
      // 應允許 NULL（backward-compat 舊資料）
      expect(addColumn).not.toMatch(/NOT\s+NULL/i);

      // MT-M1-002：GIN index
      const gin = calls.find((sql) =>
        /CREATE\s+INDEX\s+IF\s+NOT\s+EXISTS\s+idx_ob_list_def_cp_gin\s+ON\s+ob_list_definition\s+USING\s+gin\s*\(\s*condition_payload\s*\)/i.test(
          sql,
        ),
      );
      expect(gin).toBeDefined();
    });

    it('SQLite：PRAGMA guard + ADD COLUMN condition_payload TEXT；不發 GIN', async () => {
      process.env.DB_TYPE = 'sqlite';
      // PRAGMA 回傳已存在欄位列表（不含 condition_payload）→ 應補建
      queryRunner.query.mockImplementation(async (sql: string) => {
        if (/PRAGMA\s+table_info/i.test(sql)) {
          return [
            { name: 'list_no' },
            { name: 'list_nm' },
            { name: 'prod_kind' },
          ];
        }
        return [];
      });
      await migration.up(queryRunner as unknown as QueryRunner);
      const calls = queryRunner.query.mock.calls.map((c) => c[0] as string);

      // PRAGMA guard
      expect(
        calls.find((sql) => /PRAGMA\s+table_info\s*\(\s*ob_list_definition\s*\)/i.test(sql)),
      ).toBeDefined();

      // ADD COLUMN TEXT
      const addColumn = calls.find((sql) =>
        /ALTER\s+TABLE\s+ob_list_definition\s+ADD\s+COLUMN\s+condition_payload\s+TEXT/i.test(sql),
      );
      expect(addColumn).toBeDefined();

      // 不應發 GIN
      const gin = calls.find((sql) => /USING\s+gin/i.test(sql));
      expect(gin).toBeUndefined();
    });

    it('SQLite：PRAGMA 回傳已含 condition_payload → 不再 ADD COLUMN（idempotent）', async () => {
      process.env.DB_TYPE = 'sqlite';
      queryRunner.query.mockImplementation(async (sql: string) => {
        if (/PRAGMA\s+table_info/i.test(sql)) {
          return [
            { name: 'list_no' },
            { name: 'condition_payload' }, // 已存在
          ];
        }
        return [];
      });
      await migration.up(queryRunner as unknown as QueryRunner);
      const calls = queryRunner.query.mock.calls.map((c) => c[0] as string);
      const addColumn = calls.find((sql) =>
        /ALTER\s+TABLE\s+ob_list_definition\s+ADD\s+COLUMN\s+condition_payload/i.test(sql),
      );
      expect(addColumn).toBeUndefined(); // 應 skip
    });
  });

  describe('down()', () => {
    it('MT-M1-003：PG DROP INDEX + DROP COLUMN', async () => {
      delete process.env.DB_TYPE;
      await migration.down(queryRunner as unknown as QueryRunner);
      const calls = queryRunner.query.mock.calls.map((c) => c[0] as string);

      const dropIndex = calls.find((sql) =>
        /DROP\s+INDEX\s+IF\s+EXISTS\s+idx_ob_list_def_cp_gin/i.test(sql),
      );
      expect(dropIndex).toBeDefined();

      const dropColumn = calls.find((sql) =>
        /ALTER\s+TABLE\s+ob_list_definition\s+DROP\s+COLUMN\s+IF\s+EXISTS\s+condition_payload/i.test(
          sql,
        ),
      );
      expect(dropColumn).toBeDefined();
    });

    it('SQLite down()：DROP COLUMN（無 GIN index 可 DROP；用 PRAGMA guard）', async () => {
      process.env.DB_TYPE = 'sqlite';
      // PRAGMA 回傳已含 condition_payload → down 應發 DROP COLUMN（不帶 IF EXISTS）
      queryRunner.query.mockImplementation(async (sql: string) => {
        if (/PRAGMA\s+table_info/i.test(sql)) {
          return [{ name: 'list_no' }, { name: 'condition_payload' }];
        }
        return [];
      });
      await migration.down(queryRunner as unknown as QueryRunner);
      const calls = queryRunner.query.mock.calls.map((c) => c[0] as string);

      // 不應發 DROP INDEX
      const dropIndex = calls.find((sql) => /DROP\s+INDEX/i.test(sql));
      expect(dropIndex).toBeUndefined();

      const dropColumn = calls.find((sql) =>
        /ALTER\s+TABLE\s+ob_list_definition\s+DROP\s+COLUMN\s+condition_payload(?!\w)/i.test(
          sql,
        ),
      );
      expect(dropColumn).toBeDefined();
      // SQLite 不支援 IF EXISTS syntax
      expect(dropColumn).not.toMatch(/DROP\s+COLUMN\s+IF\s+EXISTS/i);
    });
  });

  describe('MT-M1-004 functional：既有 3 筆 condition_payload = NULL', () => {
    it('SQLite in-memory：跑 m281 後既有列 condition_payload 為 null', async () => {
      process.env.DB_TYPE = 'sqlite';

      // 用最小 in-memory schema 模擬 m100 已建好的 ob_list_definition
      const ds = new DataSource({
        type: 'better-sqlite3',
        database: ':memory:',
        entities: [],
        synchronize: false,
      });
      await ds.initialize();

      // 建 ob_list_definition（簡化版含必要 NOT NULL 欄位）
      await ds.query(`
        CREATE TABLE ob_list_definition (
          list_no VARCHAR(11) PRIMARY KEY,
          list_nm VARCHAR(45) NOT NULL,
          prod_kind VARCHAR(255) NOT NULL,
          list_type VARCHAR(255) NOT NULL,
          status VARCHAR(10) NOT NULL DEFAULT 'active'
        )
      `);

      // seed 3 筆
      for (let i = 1; i <= 3; i++) {
        await ds.query(
          `INSERT INTO ob_list_definition (list_no, list_nm, prod_kind, list_type, status)
           VALUES ('OB20260500${i}', 'List${i}', '0${i}', '01', 'active')`,
        );
      }

      // 跑 m281 up()
      const qr = ds.createQueryRunner();
      try {
        await migration.up(qr);
      } finally {
        await qr.release();
      }

      // 驗 condition_payload 欄位存在且全 null
      const rows = await ds.query<Array<{ list_no: string; condition_payload: unknown }>>(
        'SELECT list_no, condition_payload FROM ob_list_definition ORDER BY list_no',
      );
      expect(rows.length).toBe(3);
      rows.forEach((r) => expect(r.condition_payload).toBeNull());

      // 跑 down() 後欄位消失
      const qr2 = ds.createQueryRunner();
      try {
        await migration.down(qr2);
      } finally {
        await qr2.release();
      }
      const cols = await ds.query<Array<{ name: string }>>(
        'PRAGMA table_info(ob_list_definition)',
      );
      const colNames = cols.map((c) => c.name);
      expect(colNames).not.toContain('condition_payload');

      await ds.destroy();
    });
  });
});
