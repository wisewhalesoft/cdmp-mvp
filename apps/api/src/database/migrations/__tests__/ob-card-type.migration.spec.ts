/**
 * Iter 1 / F069~F072 / architecture-spec §E07-G:
 *   D-CT-01：建立 ob_card_type 表
 *   D-CT-02：Seed 6 個正規 CARD_TYPE（H/S/E/S5/E5 → 01，M → 02）
 *
 * 測試策略（與 SeedObTierFallback / ExtendObCodeDfTblIdToVarchar11 同 pattern）：
 *   mock QueryRunner，驗證 up() / down() 是否以正確 SQL 呼叫 query()。
 *   PostgreSQL CHECK constraint 與真機 ALTER 留待 npm run migration:run 手動驗收。
 *
 * 涵蓋 cases：
 *   D-CT-01 up():
 *     1) 建立 ob_card_type 表，含 card_type / card_name / prod_kind / status / created_at /
 *        created_by / updated_at / updated_by 共 8 欄
 *     2) card_type 為 PK
 *     3) PostgreSQL 環境加 chk_ob_card_type_status / chk_ob_card_type_code_format CHECK
 *     4) SQLite 環境略過 regex CHECK（DB_TYPE='sqlite' 條件分支）
 *     5) 建立 idx_ob_card_type_status 索引
 *   D-CT-01 down():
 *     6) DROP TABLE ob_card_type
 *
 *   D-CT-02 up():
 *     7) seed 6 個正規 CARD_TYPE，PROD_KIND 對照正確（H/S/E/S5/E5→01，M→02）
 *     8) INSERT 採 idempotent 語意（ON CONFLICT DO NOTHING 或 WHERE NOT EXISTS）
 *   D-CT-02 down():
 *     9) DELETE 6 筆正規 CARD_TYPE（不誤刪業務主管手動新增的紀錄）
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import type { QueryRunner } from 'typeorm';
import { CreateObCardType1711360000160 } from '../1711360000160-CreateObCardType';
import { SeedObCardTypeNormative61711360000161 } from '../1711360000161-SeedObCardTypeNormative6';

describe('Migration 1711360000160: CreateObCardType (D-CT-01)', () => {
  let migration: CreateObCardType1711360000160;
  let queryRunner: {
    query: ReturnType<typeof vi.fn>;
    createTable: ReturnType<typeof vi.fn>;
    dropTable: ReturnType<typeof vi.fn>;
    createIndex: ReturnType<typeof vi.fn>;
  };
  const originalDbType = process.env.DB_TYPE;

  beforeEach(() => {
    migration = new CreateObCardType1711360000160();
    queryRunner = {
      query: vi.fn().mockResolvedValue(undefined),
      createTable: vi.fn().mockResolvedValue(undefined),
      dropTable: vi.fn().mockResolvedValue(undefined),
      createIndex: vi.fn().mockResolvedValue(undefined),
    };
  });

  afterEach(() => {
    if (originalDbType === undefined) {
      delete process.env.DB_TYPE;
    } else {
      process.env.DB_TYPE = originalDbType;
    }
  });

  describe('up() — PostgreSQL', () => {
    beforeEach(() => {
      delete process.env.DB_TYPE; // 預設視為 postgres
    });

    it('1) 建立 ob_card_type 表，含 8 欄 (card_type/card_name/prod_kind/status/created_at/created_by/updated_at/updated_by)', async () => {
      await migration.up(queryRunner as unknown as QueryRunner);

      expect(queryRunner.createTable).toHaveBeenCalledTimes(1);
      const table = queryRunner.createTable.mock.calls[0][0];
      expect(table.name).toBe('ob_card_type');
      const colNames = (table.columns as Array<{ name: string }>).map((c) => c.name);
      expect(colNames.sort()).toEqual(
        [
          'card_type',
          'card_name',
          'prod_kind',
          'status',
          'created_at',
          'created_by',
          'updated_at',
          'updated_by',
        ].sort(),
      );
    });

    it('2) card_type 為 PK', async () => {
      await migration.up(queryRunner as unknown as QueryRunner);

      const table = queryRunner.createTable.mock.calls[0][0];
      const pkCols = (
        table.columns as Array<{ name: string; isPrimary?: boolean }>
      )
        .filter((c) => c.isPrimary)
        .map((c) => c.name);
      expect(pkCols).toEqual(['card_type']);
    });

    it('3) PostgreSQL 環境加 status CHECK 與 code_format regex CHECK', async () => {
      await migration.up(queryRunner as unknown as QueryRunner);

      const allSql = queryRunner.query.mock.calls.map((c) => c[0]).join('\n');
      expect(allSql).toMatch(/chk_ob_card_type_status/i);
      expect(allSql).toMatch(/CHECK\s*\(\s*status\s+IN\s*\(\s*'active'\s*,\s*'inactive'\s*\)\s*\)/i);
      expect(allSql).toMatch(/chk_ob_card_type_code_format/i);
      expect(allSql).toMatch(/CHECK[^;]*card_type[^;]*~[^;]*\^\[A-Z0-9\]\{1,5\}\$/i);
    });

    it('5) 建立 idx_ob_card_type_status 索引', async () => {
      await migration.up(queryRunner as unknown as QueryRunner);

      const allSql = queryRunner.query.mock.calls.map((c) => c[0]).join('\n');
      const createIndexCalls = queryRunner.createIndex.mock.calls;
      // 索引可由 createIndex API 或 raw SQL 建立
      const hasIndex =
        /idx_ob_card_type_status/i.test(allSql) ||
        createIndexCalls.some((call) => {
          const idx = call[1];
          return (
            idx?.name === 'idx_ob_card_type_status' ||
            (Array.isArray(idx?.columnNames) &&
              idx.columnNames.includes('status'))
          );
        });
      expect(hasIndex).toBe(true);
    });
  });

  describe('up() — SQLite', () => {
    beforeEach(() => {
      process.env.DB_TYPE = 'sqlite';
    });

    it('4) SQLite 環境略過 code_format regex CHECK（由應用層保證）', async () => {
      await migration.up(queryRunner as unknown as QueryRunner);

      const allSql = queryRunner.query.mock.calls.map((c) => c[0]).join('\n');
      // SQLite 不支援 ~ 運算子；應略過此 CHECK
      expect(allSql).not.toMatch(/card_type[^;]*~[^;]*\^\[A-Z0-9\]/i);
    });
  });

  describe('down()', () => {
    it('6) DROP TABLE ob_card_type', async () => {
      await migration.down(queryRunner as unknown as QueryRunner);

      // 可用 dropTable API 或 raw SQL DROP
      const droppedByApi = queryRunner.dropTable.mock.calls.some(
        (call) => call[0] === 'ob_card_type',
      );
      const allSql = queryRunner.query.mock.calls.map((c) => c[0]).join('\n');
      const droppedBySql = /DROP\s+TABLE[^;]*ob_card_type/i.test(allSql);

      expect(droppedByApi || droppedBySql).toBe(true);
    });
  });
});

describe('Migration 1711360000161: SeedObCardTypeNormative6 (D-CT-02)', () => {
  let migration: SeedObCardTypeNormative61711360000161;
  let queryRunner: { query: ReturnType<typeof vi.fn> };
  const originalDbType = process.env.DB_TYPE;

  beforeEach(() => {
    migration = new SeedObCardTypeNormative61711360000161();
    queryRunner = {
      query: vi.fn().mockResolvedValue(undefined),
    };
  });

  afterEach(() => {
    if (originalDbType === undefined) {
      delete process.env.DB_TYPE;
    } else {
      process.env.DB_TYPE = originalDbType;
    }
  });

  // 通用 regex：兩種 DB 寫法都能匹配
  //   PostgreSQL: `INSERT INTO ob_card_type ...`
  //   SQLite    : `INSERT OR IGNORE INTO ob_card_type ...`
  const INSERT_OB_CARD_TYPE_RE = /INSERT(\s+OR\s+IGNORE)?\s+INTO\s+ob_card_type/i;

  describe('up() — PostgreSQL', () => {
    beforeEach(() => {
      delete process.env.DB_TYPE;
    });

    it('7) seed 6 個正規 CARD_TYPE，PROD_KIND 對照正確（H/S/E/S5/E5→01，M→02；PostgreSQL ON CONFLICT）', async () => {
      await migration.up(queryRunner as unknown as QueryRunner);

      const allSql = queryRunner.query.mock.calls.map((c) => c[0]).join('\n');
      expect(allSql).toMatch(INSERT_OB_CARD_TYPE_RE);
      expect(allSql).toMatch(/ON\s+CONFLICT\s*\(\s*card_type\s*\)\s+DO\s+NOTHING/i);

      // 6 個正規 CARD_TYPE 必須出現
      expect(allSql).toMatch(/'H'\s*,\s*'期中'\s*,\s*'01'/);
      expect(allSql).toMatch(/'S'\s*,\s*'中結'\s*,\s*'01'/);
      expect(allSql).toMatch(/'E'\s*,\s*'滿期'\s*,\s*'01'/);
      expect(allSql).toMatch(/'S5'\s*,\s*'中結5年'\s*,\s*'01'/);
      expect(allSql).toMatch(/'E5'\s*,\s*'滿期5年'\s*,\s*'01'/);
      expect(allSql).toMatch(/'M'\s*,\s*'機車'\s*,\s*'02'/);
    });

    it('8) INSERT 採 idempotent 語意（PostgreSQL ON CONFLICT DO NOTHING）', async () => {
      await migration.up(queryRunner as unknown as QueryRunner);

      const insertCalls = queryRunner.query.mock.calls
        .map((c) => c[0] as string)
        .filter((sql) => INSERT_OB_CARD_TYPE_RE.test(sql));

      expect(insertCalls.length).toBeGreaterThan(0);
      for (const sql of insertCalls) {
        const isIdempotent =
          /ON\s+CONFLICT/i.test(sql) ||
          /WHERE\s+NOT\s+EXISTS/i.test(sql) ||
          /OR\s+IGNORE/i.test(sql); // SQLite 分支
        expect(isIdempotent).toBe(true);
      }
    });
  });

  describe('up() — SQLite', () => {
    beforeEach(() => {
      process.env.DB_TYPE = 'sqlite';
    });

    it('8b) SQLite 環境採 INSERT OR IGNORE（idempotent）', async () => {
      await migration.up(queryRunner as unknown as QueryRunner);

      const allSql = queryRunner.query.mock.calls.map((c) => c[0]).join('\n');
      expect(allSql).toMatch(/INSERT\s+OR\s+IGNORE\s+INTO\s+ob_card_type/i);
      // SQLite 分支不該出現 ON CONFLICT 子句
      expect(allSql).not.toMatch(/ON\s+CONFLICT/i);
    });
  });

  describe('down()', () => {
    it('9) DELETE 6 筆正規 CARD_TYPE（限定 card_type IN (...) 不誤刪業務新增）', async () => {
      await migration.down(queryRunner as unknown as QueryRunner);

      const allSql = queryRunner.query.mock.calls.map((c) => c[0]).join('\n');
      expect(allSql).toMatch(/DELETE\s+FROM\s+ob_card_type/i);

      // 必須限定 card_type IN ('H','S','E','S5','E5','M')，避免誤刪業務手動新增紀錄
      const deleteCalls = queryRunner.query.mock.calls
        .map((c) => c[0] as string)
        .filter((sql) => /DELETE\s+FROM\s+ob_card_type/i.test(sql));

      expect(deleteCalls.length).toBeGreaterThan(0);
      const joined = deleteCalls.join('\n');
      expect(joined).toMatch(/card_type\s+IN\s*\(/i);
      // 6 個正規值都必須在 IN clause 內
      for (const code of ['H', 'S', 'E', 'S5', 'E5', 'M']) {
        expect(joined).toMatch(new RegExp(`'${code}'`));
      }
    });
  });
});
