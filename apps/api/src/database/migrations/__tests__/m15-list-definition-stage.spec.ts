/**
 * TC-MIG-stage: AddObListDefinitionStage migration（AD-E07-17 議題 1 / E07 重構 P1 B1）
 *
 * 對應 spec：
 *   - data-model.md L848 §ob_list_definition.stage 欄位
 *   - F077 BR-9 五階段流程（draft / dept_ratio / personnel_ratio / approval / ready）
 *
 * 涵蓋 6 個 case：
 *   1) up(): ALTER TABLE ob_list_definition ADD COLUMN stage VARCHAR(20) NOT NULL DEFAULT 'draft'
 *   2) up(): ADD CHECK constraint chk_ob_list_definition_stage [PostgreSQL only]
 *   3) up(): backfill — 既有 status != 'inactive' 紀錄 → stage='ready'（向下相容 v1.x 啟用名單）
 *   4) up(): SQLite 環境略過 ADD CONSTRAINT（相容 e2e）
 *   5) down(): ALTER TABLE DROP COLUMN stage（PostgreSQL）
 *   6) up() 順序：ADD COLUMN → backfill UPDATE → ADD CONSTRAINT
 *
 * 測試策略沿用 m14 mock QueryRunner pattern。
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import type { QueryRunner } from 'typeorm';
import { AddObListDefinitionStage1711360000180 } from '../1711360000180-AddObListDefinitionStage';

describe('Migration 1711360000180: AddObListDefinitionStage (TC-MIG-stage)', () => {
  let migration: AddObListDefinitionStage1711360000180;
  let queryRunner: {
    query: ReturnType<typeof vi.fn>;
  };
  const originalDbType = process.env.DB_TYPE;

  beforeEach(() => {
    migration = new AddObListDefinitionStage1711360000180();
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
      delete process.env.DB_TYPE;
    });

    it('1) ADD COLUMN stage VARCHAR(20) NOT NULL DEFAULT \'draft\'', async () => {
      await migration.up(queryRunner as unknown as QueryRunner);
      const calls = queryRunner.query.mock.calls.map((c) => c[0] as string);
      const addColumn = calls.find((sql) =>
        /ALTER\s+TABLE\s+ob_list_definition\s+ADD\s+COLUMN\s+(IF\s+NOT\s+EXISTS\s+)?stage/i.test(sql),
      );
      expect(addColumn).toBeDefined();
      expect(addColumn).toMatch(/VARCHAR\s*\(\s*20\s*\)/i);
      expect(addColumn).toMatch(/NOT\s+NULL/i);
      expect(addColumn).toMatch(/DEFAULT\s+'draft'/i);
    });

    it('2) ADD CONSTRAINT chk_ob_list_definition_stage CHECK (stage IN ...)', async () => {
      await migration.up(queryRunner as unknown as QueryRunner);
      const calls = queryRunner.query.mock.calls.map((c) => c[0] as string);
      const constraintSql = calls.find(
        (sql) => /chk_ob_list_definition_stage/i.test(sql) && /CHECK/i.test(sql),
      );
      expect(constraintSql).toBeDefined();
      expect(constraintSql).toMatch(/'draft'/i);
      expect(constraintSql).toMatch(/'dept_ratio'/i);
      expect(constraintSql).toMatch(/'personnel_ratio'/i);
      expect(constraintSql).toMatch(/'approval'/i);
      expect(constraintSql).toMatch(/'ready'/i);
    });

    it('3) backfill — 既有 status != \'inactive\' 紀錄 → stage=\'ready\'', async () => {
      await migration.up(queryRunner as unknown as QueryRunner);
      const calls = queryRunner.query.mock.calls.map((c) => c[0] as string);
      const backfill = calls.find(
        (sql) => /UPDATE\s+ob_list_definition\s+SET\s+stage\s*=\s*'ready'/i.test(sql),
      );
      expect(backfill).toBeDefined();
      expect(backfill).toMatch(/status\s*(!=|<>)\s*'inactive'/i);
    });

    it('6) up() 順序：ADD COLUMN → backfill UPDATE → ADD CONSTRAINT', async () => {
      await migration.up(queryRunner as unknown as QueryRunner);
      const calls = queryRunner.query.mock.calls.map((c) => c[0] as string);
      const addIdx = calls.findIndex((sql) => /ADD\s+COLUMN.*stage/i.test(sql));
      const backfillIdx = calls.findIndex((sql) => /UPDATE\s+ob_list_definition\s+SET\s+stage/i.test(sql));
      const constraintIdx = calls.findIndex((sql) => /chk_ob_list_definition_stage/i.test(sql));
      expect(addIdx).toBeGreaterThanOrEqual(0);
      expect(backfillIdx).toBeGreaterThan(addIdx);
      expect(constraintIdx).toBeGreaterThan(backfillIdx);
    });
  });

  describe('up() — SQLite', () => {
    beforeEach(() => {
      process.env.DB_TYPE = 'sqlite';
    });

    it('4) SQLite：ADD COLUMN 仍執行；ADD CONSTRAINT 略過', async () => {
      await migration.up(queryRunner as unknown as QueryRunner);
      const calls = queryRunner.query.mock.calls.map((c) => c[0] as string);
      const addColumn = calls.find((sql) =>
        /ALTER\s+TABLE\s+ob_list_definition\s+ADD\s+COLUMN.*stage/i.test(sql),
      );
      expect(addColumn).toBeDefined();
      const constraintSql = calls.find(
        (sql) => /ADD\s+CONSTRAINT.*chk_ob_list_definition_stage/i.test(sql),
      );
      expect(constraintSql).toBeUndefined();
    });
  });

  describe('down()', () => {
    beforeEach(() => {
      delete process.env.DB_TYPE;
    });

    it('5) down() DROP COLUMN stage', async () => {
      await migration.down(queryRunner as unknown as QueryRunner);
      const calls = queryRunner.query.mock.calls.map((c) => c[0] as string);
      const dropConstraint = calls.find(
        (sql) => /DROP\s+CONSTRAINT\s+(IF\s+EXISTS\s+)?chk_ob_list_definition_stage/i.test(sql),
      );
      expect(dropConstraint).toBeDefined();
      const dropColumn = calls.find(
        (sql) => /ALTER\s+TABLE\s+ob_list_definition\s+DROP\s+COLUMN\s+(IF\s+EXISTS\s+)?stage/i.test(sql),
      );
      expect(dropColumn).toBeDefined();
    });
  });
});
