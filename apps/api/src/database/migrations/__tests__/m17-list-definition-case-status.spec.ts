/**
 * TC-MIG-m17: AddObListDefinitionCaseStatus migration（E07 重構 P1 B2 補完）
 *
 * 對應 spec：
 *   - F050 / F051 v2.0 DTO `caseStatus` 已存在但 entity / DB 無 column
 *   - data-model.md §ob_list_definition.case_status（多值 `$$` 分隔）
 *
 * 涵蓋 case：
 *   1) up(): ALTER TABLE ob_list_definition ADD COLUMN case_status VARCHAR(14) NULL
 *   2) down(): ALTER TABLE ob_list_definition DROP COLUMN case_status
 *   3) SQLite 環境亦執行 ADD COLUMN（無 CHECK，相容 e2e）
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import type { QueryRunner } from 'typeorm';
import { AddObListDefinitionCaseStatus1711360000181 } from '../1711360000181-AddObListDefinitionCaseStatus';

describe('Migration 1711360000181: AddObListDefinitionCaseStatus (TC-MIG-m17)', () => {
  let migration: AddObListDefinitionCaseStatus1711360000181;
  let queryRunner: {
    query: ReturnType<typeof vi.fn>;
  };
  const originalDbType = process.env.DB_TYPE;

  beforeEach(() => {
    migration = new AddObListDefinitionCaseStatus1711360000181();
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
    it('1) PostgreSQL：ADD COLUMN case_status VARCHAR(14) NULL', async () => {
      delete process.env.DB_TYPE;
      await migration.up(queryRunner as unknown as QueryRunner);
      const calls = queryRunner.query.mock.calls.map((c) => c[0] as string);
      const addColumn = calls.find((sql) =>
        /ALTER\s+TABLE\s+ob_list_definition\s+ADD\s+COLUMN\s+(IF\s+NOT\s+EXISTS\s+)?case_status/i.test(sql),
      );
      expect(addColumn).toBeDefined();
      expect(addColumn).toMatch(/VARCHAR\s*\(\s*14\s*\)/i);
      // 必須 NULL（多值欄位可空）
      expect(addColumn).not.toMatch(/NOT\s+NULL/i);
    });

    it('2) SQLite：ADD COLUMN 仍執行', async () => {
      process.env.DB_TYPE = 'sqlite';
      await migration.up(queryRunner as unknown as QueryRunner);
      const calls = queryRunner.query.mock.calls.map((c) => c[0] as string);
      const addColumn = calls.find((sql) =>
        /ALTER\s+TABLE\s+ob_list_definition\s+ADD\s+COLUMN.*case_status/i.test(sql),
      );
      expect(addColumn).toBeDefined();
    });
  });

  describe('down()', () => {
    it('3) DROP COLUMN case_status', async () => {
      delete process.env.DB_TYPE;
      await migration.down(queryRunner as unknown as QueryRunner);
      const calls = queryRunner.query.mock.calls.map((c) => c[0] as string);
      const dropColumn = calls.find((sql) =>
        /ALTER\s+TABLE\s+ob_list_definition\s+DROP\s+COLUMN\s+(IF\s+EXISTS\s+)?case_status/i.test(sql),
      );
      expect(dropColumn).toBeDefined();
    });
  });
});
