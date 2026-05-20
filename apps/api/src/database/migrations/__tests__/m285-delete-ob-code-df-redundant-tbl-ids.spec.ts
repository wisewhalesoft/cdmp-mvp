/**
 * TC-MIG-m285：DeleteObCodeDfRedundantTblIds migration
 *   F050 v2.1 重構（AD-E07-18 §18.3 M5 / §18.7 / §18.2.7 / §18.10 R7 / GAP-LIST §E7）
 *
 * ⚠️ 高風險：M5 為刪除資料列操作；必須與 F069 service 改讀 pooldata_field_option **同一 commit / 同一 PR** 部署。
 *
 * 對應 test spec：
 *   - MT-M5-002：M5 up() 刪除 tbl_id='PROD_KIND' 紀錄（C2 補修：英文常數，非 '02'）
 *   - MT-M5-003：M5 up() 刪除 tbl_id='SPEC_TP' / 'CASE_STATUS' 紀錄
 *   - MT-M5-004：M5 不誤刪其他 tbl_id 紀錄
 *   - MT-M5-005：M5 down() 為 partial restore（CI rollback only）
 *   - MT-M5-006：M5 後 F069 prodKindName 接替（由 service spec 驗證；本 spec 驗 migration 行為）
 *   - TS-F068-DEP-007：M5 後 ob_code_df tbl_id IN (PROD_KIND/SPEC_TP/CASE_STATUS) 紀錄不存在
 *
 * 涵蓋 cases：
 *   - up()：pre-condition check（讀 pooldata_field_option 確認 3 欄各有 active 資料）
 *   - up()：pre-condition fail → throw Error
 *   - up()：DELETE FROM ob_code_df WHERE tbl_id IN ('PROD_KIND', 'SPEC_TP', 'CASE_STATUS')
 *   - up()：WHERE clause 不可含數字 '02' / '05' / '09'（C2 補修紅線）
 *   - down()：partial restore 從 pooldata_field_option 反向 INSERT
 *   - 冪等：第二次 up() 不報錯
 *   - functional：SQLite in-memory 驗 DELETE + 不誤刪其他 tbl_id + down restore 行為
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import type { QueryRunner } from 'typeorm';
import { DataSource } from 'typeorm';
import { DeleteObCodeDfRedundantTblIds1711360000285 } from '../1711360000285-DeleteObCodeDfRedundantTblIds';

describe('Migration 1711360000285: DeleteObCodeDfRedundantTblIds (TC-MIG-m285 / MT-M5-001~006 / TS-F068-DEP-007)', () => {
  let migration: DeleteObCodeDfRedundantTblIds1711360000285;
  const originalDbType = process.env.DB_TYPE;

  beforeEach(() => {
    migration = new DeleteObCodeDfRedundantTblIds1711360000285();
  });

  afterEach(() => {
    if (originalDbType === undefined) delete process.env.DB_TYPE;
    else process.env.DB_TYPE = originalDbType;
  });

  describe('up() pre-condition check（拍板 C5：採 regression-guard 風格驗證）', () => {
    it('Pre-condition：pooldata_field_option 三欄（prod_kind/spec_tp/case_status）皆有 active 資料 → 通過', async () => {
      const queryRunner = {
        query: vi.fn().mockImplementation(async (sql: string) => {
          if (/COUNT/i.test(sql)) {
            // 模擬 3 欄各有資料
            return [{ cnt: 32 }];
          }
          return [];
        }),
      };

      await expect(
        migration.up(queryRunner as unknown as QueryRunner),
      ).resolves.toBeUndefined();
    });

    it('Pre-condition fail：prod_kind 無 active 資料 → throw Error 含 "M5 pre-condition failed"', async () => {
      const queryRunner = {
        query: vi.fn().mockImplementation(async (sql: string) => {
          // s flag：. 跨換行（migration SQL 為 multiline）
          if (/COUNT.*'prod_kind'/is.test(sql)) {
            return [{ cnt: 0 }];
          }
          if (/COUNT/is.test(sql)) {
            return [{ cnt: 32 }];
          }
          return [];
        }),
      };

      await expect(
        migration.up(queryRunner as unknown as QueryRunner),
      ).rejects.toThrow(/M5 pre-condition failed.*prod_kind/s);
    });

    it('Pre-condition fail：spec_tp 無 active 資料 → throw Error', async () => {
      const queryRunner = {
        query: vi.fn().mockImplementation(async (sql: string) => {
          if (/COUNT.*'spec_tp'/is.test(sql)) {
            return [{ cnt: 0 }];
          }
          if (/COUNT/is.test(sql)) {
            return [{ cnt: 32 }];
          }
          return [];
        }),
      };

      await expect(
        migration.up(queryRunner as unknown as QueryRunner),
      ).rejects.toThrow(/M5 pre-condition failed.*spec_tp/s);
    });

    it('Pre-condition fail：case_status 無 active 資料 → throw Error', async () => {
      const queryRunner = {
        query: vi.fn().mockImplementation(async (sql: string) => {
          if (/COUNT.*'case_status'/is.test(sql)) {
            return [{ cnt: 0 }];
          }
          if (/COUNT/is.test(sql)) {
            return [{ cnt: 32 }];
          }
          return [];
        }),
      };

      await expect(
        migration.up(queryRunner as unknown as QueryRunner),
      ).rejects.toThrow(/M5 pre-condition failed.*case_status/s);
    });

    it('Pre-condition fail：throw 後不應執行 DELETE', async () => {
      const queryRunner = {
        query: vi.fn().mockImplementation(async (sql: string) => {
          if (/COUNT/i.test(sql)) return [{ cnt: 0 }];
          return [];
        }),
      };

      await expect(
        migration.up(queryRunner as unknown as QueryRunner),
      ).rejects.toThrow();

      const sqls = queryRunner.query.mock.calls.map((c) => c[0] as string);
      const deleteCalls = sqls.filter((s) => /DELETE\s+FROM\s+ob_code_df/i.test(s));
      expect(deleteCalls.length).toBe(0);
    });
  });

  describe('up() DELETE 行為（C2 補修紅線：tbl_id 為英文常數）', () => {
    it('MT-M5-002 + MT-M5-003：DELETE FROM ob_code_df WHERE tbl_id IN (PROD_KIND, SPEC_TP, CASE_STATUS)', async () => {
      const queryRunner = {
        query: vi.fn().mockImplementation(async (sql: string) => {
          if (/COUNT/i.test(sql)) return [{ cnt: 32 }];
          return [];
        }),
      };

      await migration.up(queryRunner as unknown as QueryRunner);
      const sqls = queryRunner.query.mock.calls.map((c) => c[0] as string);
      const deleteSql = sqls.find((s) => /DELETE\s+FROM\s+ob_code_df/i.test(s));

      expect(deleteSql).toBeDefined();
      expect(deleteSql).toMatch(/'PROD_KIND'/);
      expect(deleteSql).toMatch(/'SPEC_TP'/);
      expect(deleteSql).toMatch(/'CASE_STATUS'/);
    });

    it('C2 紅線：DELETE WHERE clause 不得含數字 tbl_id（02/05/09/01/22 等）', async () => {
      const queryRunner = {
        query: vi.fn().mockImplementation(async (sql: string) => {
          if (/COUNT/i.test(sql)) return [{ cnt: 32 }];
          return [];
        }),
      };

      await migration.up(queryRunner as unknown as QueryRunner);
      const sqls = queryRunner.query.mock.calls.map((c) => c[0] as string);
      const deleteSql = sqls.find((s) => /DELETE\s+FROM\s+ob_code_df/i.test(s));

      // 不可出現任何數字 tbl_id 字串
      for (const numericTblId of ['01', '02', '05', '09', '22']) {
        // 用單引號包裹避免誤判（如 LIMIT 02）
        const pattern = new RegExp(`'${numericTblId}'`);
        expect(deleteSql).not.toMatch(pattern);
      }
    });

    it('Pre-condition 必先於 DELETE 執行', async () => {
      const queryRunner = {
        query: vi.fn().mockImplementation(async (sql: string) => {
          if (/COUNT/i.test(sql)) return [{ cnt: 32 }];
          return [];
        }),
      };

      await migration.up(queryRunner as unknown as QueryRunner);
      const sqls = queryRunner.query.mock.calls.map((c) => c[0] as string);
      const countIdx = sqls.findIndex((s) => /COUNT/i.test(s));
      const deleteIdx = sqls.findIndex((s) => /DELETE\s+FROM\s+ob_code_df/i.test(s));

      expect(countIdx).toBeGreaterThanOrEqual(0);
      expect(deleteIdx).toBeGreaterThanOrEqual(0);
      expect(countIdx).toBeLessThan(deleteIdx);
    });
  });

  describe('down() — partial restore（CI rollback only）', () => {
    it('MT-M5-005：down() 從 pooldata_field_option 反向 INSERT 至 ob_code_df（PROD_KIND/SPEC_TP/CASE_STATUS）', async () => {
      const queryRunner = {
        query: vi.fn().mockImplementation(async (sql: string) => {
          // 模擬 option 各 column_name 各 1 筆
          if (/SELECT\s+option_value.*FROM\s+pooldata_field_option/is.test(sql)) {
            if (/'prod_kind'/.test(sql)) return [{ option_value: '01', option_label: '汽車' }];
            if (/'spec_tp'/.test(sql)) return [{ option_value: '01', option_label: '新車' }];
            if (/'case_status'/.test(sql)) return [{ option_value: '01', option_label: '期中' }];
          }
          return [];
        }),
      };

      await migration.down(queryRunner as unknown as QueryRunner);
      const sqls = queryRunner.query.mock.calls.map((c) => c[0] as string);
      // 兼容 PG（INSERT INTO ... ON CONFLICT）與 SQLite（INSERT OR IGNORE INTO）
      const inserts = sqls.filter((s) =>
        /INSERT\s+(OR\s+IGNORE\s+)?INTO\s+ob_code_df/i.test(s),
      );

      // 至少 3 個 INSERT（每 tbl_id 1 筆）
      expect(inserts.length).toBeGreaterThanOrEqual(3);
      const all = inserts.join('\n');
      expect(all).toMatch(/'PROD_KIND'/);
      expect(all).toMatch(/'SPEC_TP'/);
      expect(all).toMatch(/'CASE_STATUS'/);
    });
  });

  describe('functional: SQLite in-memory', () => {
    it('MT-M5-002 + MT-M5-003 + TS-F068-DEP-007：跑 m285 後 ob_code_df 三個 tbl_id 紀錄=0', async () => {
      process.env.DB_TYPE = 'sqlite';
      const ds = await setupSqliteWithSeed();
      try {
        const qr = ds.createQueryRunner();
        try {
          await migration.up(qr);
        } finally {
          await qr.release();
        }

        const rows = await ds.query<Array<{ cnt: number }>>(
          `SELECT COUNT(*) as cnt FROM ob_code_df WHERE tbl_id IN ('PROD_KIND', 'SPEC_TP', 'CASE_STATUS')`,
        );
        expect(Number(rows[0].cnt)).toBe(0);
      } finally {
        await ds.destroy();
      }
    });

    it('MT-M5-004：不誤刪其他 tbl_id（如 BEST_CASE / LIST_TYPE 等保留）', async () => {
      process.env.DB_TYPE = 'sqlite';
      const ds = await setupSqliteWithSeed();
      try {
        const qr = ds.createQueryRunner();
        try {
          await migration.up(qr);
        } finally {
          await qr.release();
        }

        const rows = await ds.query<Array<{ tbl_id: string; cnt: number }>>(
          `SELECT tbl_id, COUNT(*) as cnt FROM ob_code_df GROUP BY tbl_id`,
        );
        const byTblId = new Map(rows.map((r) => [r.tbl_id, Number(r.cnt)]));
        // 保留之 tbl_id 仍應存在
        expect(byTblId.get('BEST_CASE') ?? 0).toBeGreaterThan(0);
        expect(byTblId.get('LIST_TYPE') ?? 0).toBeGreaterThan(0);
        // 刪除之 tbl_id 應為 0 / undefined
        expect(byTblId.get('PROD_KIND') ?? 0).toBe(0);
        expect(byTblId.get('SPEC_TP') ?? 0).toBe(0);
        expect(byTblId.get('CASE_STATUS') ?? 0).toBe(0);
      } finally {
        await ds.destroy();
      }
    });

    it('Pre-condition fail：option 空時 throw 且 ob_code_df 紀錄不被刪', async () => {
      process.env.DB_TYPE = 'sqlite';
      const ds = await setupSqliteWithSeed(/* skipOptionSeed */ true);
      try {
        const qr = ds.createQueryRunner();
        try {
          await expect(migration.up(qr)).rejects.toThrow(/M5 pre-condition failed/);
        } finally {
          await qr.release();
        }

        // ob_code_df 三組仍應有資料
        const rows = await ds.query<Array<{ cnt: number }>>(
          `SELECT COUNT(*) as cnt FROM ob_code_df WHERE tbl_id IN ('PROD_KIND', 'SPEC_TP', 'CASE_STATUS')`,
        );
        expect(Number(rows[0].cnt)).toBeGreaterThan(0);
      } finally {
        await ds.destroy();
      }
    });

    it('冪等：第二次 up() 不報錯（pre-condition 仍 PASS，DELETE 0 rows 也不錯）', async () => {
      process.env.DB_TYPE = 'sqlite';
      const ds = await setupSqliteWithSeed();
      try {
        const qr1 = ds.createQueryRunner();
        await migration.up(qr1);
        await qr1.release();

        const qr2 = ds.createQueryRunner();
        await expect(migration.up(qr2)).resolves.toBeUndefined();
        await qr2.release();
      } finally {
        await ds.destroy();
      }
    });
  });
});

/**
 * SQLite in-memory 含 ob_code_df + pooldata_field_option seed
 */
async function setupSqliteWithSeed(skipOptionSeed = false): Promise<DataSource> {
  const ds = new DataSource({
    type: 'better-sqlite3',
    database: ':memory:',
    entities: [],
    synchronize: false,
  });
  await ds.initialize();

  await ds.query(`
    CREATE TABLE ob_code_df (
      system_id VARCHAR(2) NOT NULL,
      tbl_id VARCHAR(11) NOT NULL,
      tbl_cd VARCHAR(20) NOT NULL,
      tbl_desc1 VARCHAR(100),
      tbl_desc2 VARCHAR(100),
      stadt VARCHAR(8),
      enddt VARCHAR(8),
      PRIMARY KEY (system_id, tbl_id, tbl_cd)
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

  // Seed ob_code_df：3 個要刪 tbl_id 各幾筆 + 2 個保留 tbl_id
  const seed = [
    { tbl_id: 'PROD_KIND', tbl_cd: '01', tbl_desc1: '汽車' },
    { tbl_id: 'PROD_KIND', tbl_cd: '02', tbl_desc1: '機車' },
    { tbl_id: 'SPEC_TP', tbl_cd: '01', tbl_desc1: '新車' },
    { tbl_id: 'SPEC_TP', tbl_cd: '02', tbl_desc1: '中古車' },
    { tbl_id: 'CASE_STATUS', tbl_cd: '01', tbl_desc1: '期中' },
    { tbl_id: 'CASE_STATUS', tbl_cd: '02', tbl_desc1: '中結' },
    // 保留之 tbl_id
    { tbl_id: 'BEST_CASE', tbl_cd: 'Y', tbl_desc1: '優質' },
    { tbl_id: 'BEST_CASE', tbl_cd: 'N', tbl_desc1: '一般' },
    { tbl_id: 'LIST_TYPE', tbl_cd: '01', tbl_desc1: '期中' },
  ];
  for (const r of seed) {
    await ds.query(
      `INSERT INTO ob_code_df (system_id, tbl_id, tbl_cd, tbl_desc1, stadt, enddt)
       VALUES ('OB', '${r.tbl_id}', '${r.tbl_cd}', '${r.tbl_desc1}', '20000101', '20991231')`,
    );
  }

  if (!skipOptionSeed) {
    const opts = [
      { column_name: 'prod_kind', option_value: '01', option_label: '汽車' },
      { column_name: 'spec_tp', option_value: '01', option_label: '新車' },
      { column_name: 'case_status', option_value: '01', option_label: '期中' },
    ];
    for (const o of opts) {
      await ds.query(
        `INSERT INTO pooldata_field_option (column_name, option_value, option_label, is_active, deactivation_reason, created_at, updated_at)
         VALUES ('${o.column_name}', '${o.option_value}', '${o.option_label}', 1, NULL, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
      );
    }
  }

  return ds;
}
