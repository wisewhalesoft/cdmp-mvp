/**
 * TC-MIG-m18: AddObListDefinitionCrEnabled migration（E07 重構 P1 B2 補完）
 *
 * 對應 spec：
 *   - F050 / F051 v2.0 DTO `crEnabled` 已存在但 entity / DB 無 column
 *   - 取代 F059 全域 OBASSIGNSET，per-LIST CR 回分開關
 *
 * 涵蓋 case：
 *   1) up(): ALTER TABLE ob_list_definition ADD COLUMN cr_enabled BOOLEAN NOT NULL DEFAULT false
 *   2) down(): DROP COLUMN cr_enabled
 *   3) SQLite 環境亦執行
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import type { QueryRunner } from 'typeorm';
import { AddObListDefinitionCrEnabled1711360000182 } from '../1711360000182-AddObListDefinitionCrEnabled';

describe('Migration 1711360000182: AddObListDefinitionCrEnabled (TC-MIG-m18)', () => {
  let migration: AddObListDefinitionCrEnabled1711360000182;
  let queryRunner: {
    query: ReturnType<typeof vi.fn>;
  };
  const originalDbType = process.env.DB_TYPE;

  beforeEach(() => {
    migration = new AddObListDefinitionCrEnabled1711360000182();
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

  describe('up()', () => {
    it('1) PostgreSQL：ADD COLUMN cr_enabled BOOLEAN NOT NULL DEFAULT false', async () => {
      delete process.env.DB_TYPE;
      await migration.up(queryRunner as unknown as QueryRunner);
      const calls = queryRunner.query.mock.calls.map((c) => c[0] as string);
      const addColumn = calls.find((sql) =>
        /ALTER\s+TABLE\s+ob_list_definition\s+ADD\s+COLUMN\s+(IF\s+NOT\s+EXISTS\s+)?cr_enabled/i.test(sql),
      );
      expect(addColumn).toBeDefined();
      expect(addColumn).toMatch(/BOOLEAN/i);
      expect(addColumn).toMatch(/NOT\s+NULL/i);
      expect(addColumn).toMatch(/DEFAULT\s+(false|0)/i);
    });

    it('2) SQLite：ADD COLUMN 仍執行（type 改用 INTEGER 相容）', async () => {
      process.env.DB_TYPE = 'sqlite';
      await migration.up(queryRunner as unknown as QueryRunner);
      const calls = queryRunner.query.mock.calls.map((c) => c[0] as string);
      const addColumn = calls.find((sql) =>
        /ALTER\s+TABLE\s+ob_list_definition\s+ADD\s+COLUMN.*cr_enabled/i.test(sql),
      );
      expect(addColumn).toBeDefined();
      // SQLite BOOLEAN 可被 better-sqlite3 接受（內部 INTEGER），不檢核細節
    });
  });

  describe('down()', () => {
    it('3) DROP COLUMN cr_enabled', async () => {
      delete process.env.DB_TYPE;
      await migration.down(queryRunner as unknown as QueryRunner);
      const calls = queryRunner.query.mock.calls.map((c) => c[0] as string);
      const dropColumn = calls.find((sql) =>
        /ALTER\s+TABLE\s+ob_list_definition\s+DROP\s+COLUMN\s+(IF\s+EXISTS\s+)?cr_enabled/i.test(sql),
      );
      expect(dropColumn).toBeDefined();
    });
  });
});
