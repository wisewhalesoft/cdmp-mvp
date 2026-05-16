/**
 * TC-MIG-m14: AddBusinessRoleDropLegacyFlags
 *
 * 對應 spec: data-model.md §User 實體補充 §m14 Migration 規範（v2.0 / E07 合併重構）
 *
 * 涵蓋 8 個 case：
 *   1) up(): ALTER TABLE users ADD COLUMN business_role VARCHAR(20) NULL
 *   2) up(): ALTER TABLE users ADD CONSTRAINT chk_users_business_role CHECK (...) [PostgreSQL only]
 *   3) up(): CREATE INDEX idx_users_business_role ON users (business_role) WHERE business_role IS NOT NULL [PostgreSQL partial; SQLite plain]
 *   4) up(): ALTER TABLE users DROP COLUMN IF EXISTS is_sales_manager
 *   5) up(): ALTER TABLE users DROP COLUMN IF EXISTS e07_role
 *   6) up(): NOT 執行 UPDATE / backfill（不向下相容、不保留舊值；PO 決議）
 *   7) down(): 反序 — 重建 is_sales_manager + DROP business_role 相關 (index / constraint / column)
 *   8) up() SQL 順序：先 ADD column → ADD constraint → CREATE index → DROP legacy columns
 *
 * 測試策略沿用 ob-card-type.migration.spec.ts 之 mock QueryRunner pattern。
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import type { QueryRunner } from 'typeorm';
import { AddBusinessRoleDropLegacyFlags1711360000170 } from '../1711360000170-AddBusinessRoleDropLegacyFlags';

describe('Migration 1711360000170: AddBusinessRoleDropLegacyFlags (TC-MIG-m14)', () => {
  let migration: AddBusinessRoleDropLegacyFlags1711360000170;
  let queryRunner: {
    query: ReturnType<typeof vi.fn>;
  };
  const originalDbType = process.env.DB_TYPE;

  beforeEach(() => {
    migration = new AddBusinessRoleDropLegacyFlags1711360000170();
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

  describe('up() — PostgreSQL', () => {
    beforeEach(() => {
      delete process.env.DB_TYPE; // 預設視為 postgres
    });

    it('1) ADD COLUMN business_role VARCHAR(20) NULL', async () => {
      await migration.up(queryRunner as unknown as QueryRunner);
      const calls = queryRunner.query.mock.calls.map((c) => c[0] as string);
      const addColumn = calls.find((sql) => /ALTER\s+TABLE\s+users\s+ADD\s+COLUMN\s+(IF\s+NOT\s+EXISTS\s+)?business_role/i.test(sql));
      expect(addColumn).toBeDefined();
      expect(addColumn).toMatch(/VARCHAR\s*\(\s*20\s*\)/i);
      expect(addColumn).toMatch(/NULL/i);
    });

    it('2) ADD CONSTRAINT chk_users_business_role CHECK (...)', async () => {
      await migration.up(queryRunner as unknown as QueryRunner);
      const calls = queryRunner.query.mock.calls.map((c) => c[0] as string);
      const constraintSql = calls.find((sql) => /chk_users_business_role/i.test(sql) && /CHECK/i.test(sql));
      expect(constraintSql).toBeDefined();
      // CHECK 內容必須允許 NULL 與 'director'/'section_chief'
      expect(constraintSql).toMatch(/business_role\s+IS\s+NULL\s+OR\s+business_role\s+IN/i);
      expect(constraintSql).toMatch(/'director'/i);
      expect(constraintSql).toMatch(/'section_chief'/i);
    });

    it('3) CREATE INDEX idx_users_business_role (partial WHERE NOT NULL)', async () => {
      await migration.up(queryRunner as unknown as QueryRunner);
      const calls = queryRunner.query.mock.calls.map((c) => c[0] as string);
      const indexSql = calls.find((sql) => /CREATE\s+INDEX\s+(IF\s+NOT\s+EXISTS\s+)?idx_users_business_role/i.test(sql));
      expect(indexSql).toBeDefined();
      expect(indexSql).toMatch(/WHERE\s+business_role\s+IS\s+NOT\s+NULL/i);
    });

    it('4) DROP COLUMN IF EXISTS is_sales_manager', async () => {
      await migration.up(queryRunner as unknown as QueryRunner);
      const calls = queryRunner.query.mock.calls.map((c) => c[0] as string);
      const dropSm = calls.find((sql) => /ALTER\s+TABLE\s+users\s+DROP\s+COLUMN\s+IF\s+EXISTS\s+is_sales_manager/i.test(sql));
      expect(dropSm).toBeDefined();
    });

    it('5) DROP COLUMN IF EXISTS e07_role', async () => {
      await migration.up(queryRunner as unknown as QueryRunner);
      const calls = queryRunner.query.mock.calls.map((c) => c[0] as string);
      const dropE07 = calls.find((sql) => /ALTER\s+TABLE\s+users\s+DROP\s+COLUMN\s+IF\s+EXISTS\s+e07_role/i.test(sql));
      expect(dropE07).toBeDefined();
    });

    it('6) NOT 執行 UPDATE / backfill — 不寫入歷史值', async () => {
      await migration.up(queryRunner as unknown as QueryRunner);
      const calls = queryRunner.query.mock.calls.map((c) => c[0] as string);
      const hasUpdate = calls.some((sql) => /^\s*UPDATE\s+users/i.test(sql));
      expect(hasUpdate).toBe(false);
    });

    it('8) up() 執行順序：ADD COLUMN → ADD CONSTRAINT → CREATE INDEX → DROP legacy', async () => {
      await migration.up(queryRunner as unknown as QueryRunner);
      const calls = queryRunner.query.mock.calls.map((c) => c[0] as string);
      const idx = {
        add: calls.findIndex((sql) => /ADD\s+COLUMN.*business_role/i.test(sql)),
        constraint: calls.findIndex((sql) => /chk_users_business_role/i.test(sql)),
        index: calls.findIndex((sql) => /idx_users_business_role/i.test(sql)),
        dropSm: calls.findIndex((sql) => /DROP\s+COLUMN\s+IF\s+EXISTS\s+is_sales_manager/i.test(sql)),
        dropE07: calls.findIndex((sql) => /DROP\s+COLUMN\s+IF\s+EXISTS\s+e07_role/i.test(sql)),
      };
      expect(idx.add).toBeGreaterThanOrEqual(0);
      expect(idx.constraint).toBeGreaterThan(idx.add);
      expect(idx.index).toBeGreaterThan(idx.add);
      expect(idx.dropSm).toBeGreaterThan(idx.add);
      expect(idx.dropE07).toBeGreaterThan(idx.add);
    });
  });

  describe('up() — SQLite (e2e relaxed)', () => {
    beforeEach(() => {
      process.env.DB_TYPE = 'sqlite';
    });

    it('SQLite：ADD COLUMN business_role 仍執行；CHECK constraint 略過（SQLite 不支援 ALTER TABLE ADD CONSTRAINT）', async () => {
      await migration.up(queryRunner as unknown as QueryRunner);
      const calls = queryRunner.query.mock.calls.map((c) => c[0] as string);
      const addColumn = calls.find((sql) => /ALTER\s+TABLE\s+users\s+ADD\s+COLUMN.*business_role/i.test(sql));
      expect(addColumn).toBeDefined();
      // CHECK constraint 必須略過（SQLite ALTER TABLE ADD CONSTRAINT 不支援）
      const constraintSql = calls.find((sql) => /ADD\s+CONSTRAINT.*chk_users_business_role/i.test(sql));
      expect(constraintSql).toBeUndefined();
    });
  });

  describe('down()', () => {
    beforeEach(() => {
      delete process.env.DB_TYPE;
    });

    it('7) down() 反序：重建 is_sales_manager / DROP business_role 相關 (index / constraint / column)', async () => {
      await migration.down(queryRunner as unknown as QueryRunner);
      const calls = queryRunner.query.mock.calls.map((c) => c[0] as string);

      const reAddSm = calls.find((sql) => /ALTER\s+TABLE\s+users\s+ADD\s+COLUMN\s+(IF\s+NOT\s+EXISTS\s+)?is_sales_manager/i.test(sql));
      expect(reAddSm).toBeDefined();

      const dropIndex = calls.find((sql) => /DROP\s+INDEX\s+(IF\s+EXISTS\s+)?idx_users_business_role/i.test(sql));
      expect(dropIndex).toBeDefined();

      const dropConstraint = calls.find((sql) => /DROP\s+CONSTRAINT\s+(IF\s+EXISTS\s+)?chk_users_business_role/i.test(sql));
      expect(dropConstraint).toBeDefined();

      const dropColumn = calls.find((sql) => /ALTER\s+TABLE\s+users\s+DROP\s+COLUMN\s+(IF\s+EXISTS\s+)?business_role/i.test(sql));
      expect(dropColumn).toBeDefined();
    });
  });
});
