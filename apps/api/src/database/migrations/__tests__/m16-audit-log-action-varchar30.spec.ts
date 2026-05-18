/**
 * TC-MIG-audit: AddAuditLogActionVarchar30 migration（AD-E07-17 議題 2 / E07 重構 P1 B1）
 *
 * 對應 spec：
 *   - architecture-spec §AssignmentAuditLog action union（含 STAGE_ADVANCE / STAGE_ROLLBACK / STAGE_REJECT / ASSIGN_ROLE / REVOKE_ROLE）
 *   - StageTransitionService 寫入完整 action name（移除 P0 truncate workaround）
 *
 * 涵蓋 4 case：
 *   1) up(): ALTER TABLE assignment_audit_log ALTER COLUMN action TYPE VARCHAR(30) [PostgreSQL]
 *   2) up(): SQLite 環境略過（SQLite 不支援 ALTER COLUMN TYPE）
 *   3) down(): ALTER COLUMN action TYPE VARCHAR(10) [PostgreSQL]
 *   4) up() 不破壞既有資料（無 UPDATE）
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import type { QueryRunner } from 'typeorm';
import { AddAuditLogActionVarchar301711360000181 } from '../1711360000181-AddAuditLogActionVarchar30';
import { AddScoringAuditFieldsToAssignmentAuditLog1711360000270 } from '../1711360000270-AddScoringAuditFieldsToAssignmentAuditLog';

describe('Migration 1711360000181: AddAuditLogActionVarchar30 (TC-MIG-audit)', () => {
  let migration: AddAuditLogActionVarchar301711360000181;
  let queryRunner: {
    query: ReturnType<typeof vi.fn>;
  };
  const originalDbType = process.env.DB_TYPE;

  beforeEach(() => {
    migration = new AddAuditLogActionVarchar301711360000181();
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

    it('1) ALTER COLUMN action TYPE VARCHAR(30)', async () => {
      await migration.up(queryRunner as unknown as QueryRunner);
      const calls = queryRunner.query.mock.calls.map((c) => c[0] as string);
      const alterSql = calls.find(
        (sql) => /ALTER\s+TABLE\s+assignment_audit_log\s+ALTER\s+COLUMN\s+action\s+TYPE\s+VARCHAR\s*\(\s*30\s*\)/i.test(sql),
      );
      expect(alterSql).toBeDefined();
    });

    it('4) up() 不執行 UPDATE / backfill（純擴 column type）', async () => {
      await migration.up(queryRunner as unknown as QueryRunner);
      const calls = queryRunner.query.mock.calls.map((c) => c[0] as string);
      const hasUpdate = calls.some((sql) => /^\s*UPDATE\s+assignment_audit_log/i.test(sql));
      expect(hasUpdate).toBe(false);
    });
  });

  describe('up() — SQLite', () => {
    beforeEach(() => {
      process.env.DB_TYPE = 'sqlite';
    });

    it('2) SQLite：略過 ALTER COLUMN（SQLite 不支援）', async () => {
      await migration.up(queryRunner as unknown as QueryRunner);
      const calls = queryRunner.query.mock.calls.map((c) => c[0] as string);
      const alterSql = calls.find(
        (sql) => /ALTER\s+COLUMN\s+action\s+TYPE/i.test(sql),
      );
      expect(alterSql).toBeUndefined();
    });
  });

  // ============================================================
  // F061 v1.3 新增：audit_log 欄位擴充（run_id / card_type / column_name / rule_violated / violated_row_count）
  // 對應 migration：{timestamp}-add-scoring-audit-fields-to-assignment-audit-log.ts
  // ============================================================

  describe('F061 v1.3 — audit_log 新欄位 migration（add-scoring-audit-fields）', () => {
    let scoringMig: AddScoringAuditFieldsToAssignmentAuditLog1711360000270;
    let qr: { query: ReturnType<typeof vi.fn> };

    beforeEach(() => {
      scoringMig = new AddScoringAuditFieldsToAssignmentAuditLog1711360000270();
      qr = { query: vi.fn().mockResolvedValue(undefined) };
    });

    it('up() — 新增 run_id / card_type / column_name / rule_violated / violated_row_count（nullable）', async () => {
      delete process.env.DB_TYPE;
      await scoringMig.up(qr as unknown as QueryRunner);
      const sqls = qr.query.mock.calls.map((c) => c[0] as string).join(' ; ');
      expect(sqls).toMatch(/ADD COLUMN IF NOT EXISTS "run_id" UUID/i);
      expect(sqls).toMatch(/ADD COLUMN IF NOT EXISTS "card_type" VARCHAR\(10\)/i);
      expect(sqls).toMatch(/ADD COLUMN IF NOT EXISTS "column_name" VARCHAR\(30\)/i);
      expect(sqls).toMatch(/ADD COLUMN IF NOT EXISTS "rule_violated" VARCHAR\(100\)/i);
      expect(sqls).toMatch(/ADD COLUMN IF NOT EXISTS "violated_row_count" INTEGER/i);
    });

    it('down() — 刪除 v1.3 新增欄位', async () => {
      delete process.env.DB_TYPE;
      await scoringMig.down(qr as unknown as QueryRunner);
      const sqls = qr.query.mock.calls.map((c) => c[0] as string).join(' ; ');
      expect(sqls).toMatch(/DROP COLUMN IF EXISTS "run_id"/i);
      expect(sqls).toMatch(/DROP COLUMN IF EXISTS "card_type"/i);
      expect(sqls).toMatch(/DROP COLUMN IF EXISTS "column_name"/i);
      expect(sqls).toMatch(/DROP COLUMN IF EXISTS "rule_violated"/i);
      expect(sqls).toMatch(/DROP COLUMN IF EXISTS "violated_row_count"/i);
    });

    it('up() 不執行 UPDATE / backfill（純增欄位，backward compatible）', async () => {
      delete process.env.DB_TYPE;
      await scoringMig.up(qr as unknown as QueryRunner);
      const calls = qr.query.mock.calls.map((c) => c[0] as string);
      const hasUpdate = calls.some((sql) =>
        /^\s*UPDATE\s+assignment_audit_log/i.test(sql),
      );
      expect(hasUpdate).toBe(false);
    });

    it('SQLite 環境：完全略過 ADD COLUMN（synchronize 已涵蓋）', async () => {
      process.env.DB_TYPE = 'sqlite';
      await scoringMig.up(qr as unknown as QueryRunner);
      expect(qr.query).not.toHaveBeenCalled();
    });

    // ============================================================
    // F054 v1.3 / 2026-05-18：audit_log action union 補 SCORING_INTEGRITY_WARN
    // ============================================================
    it('SCORING_INTEGRITY_WARN 仍在 VARCHAR(30) 範圍內（25 chars）', () => {
      const action = 'SCORING_INTEGRITY_WARN';
      expect(action.length).toBeLessThanOrEqual(30);
    });
  });

  describe('down() — PostgreSQL', () => {
    beforeEach(() => {
      delete process.env.DB_TYPE;
    });

    it('3) down() 反序 — VARCHAR(30) → VARCHAR(10)', async () => {
      await migration.down(queryRunner as unknown as QueryRunner);
      const calls = queryRunner.query.mock.calls.map((c) => c[0] as string);
      const revertSql = calls.find(
        (sql) => /ALTER\s+TABLE\s+assignment_audit_log\s+ALTER\s+COLUMN\s+action\s+TYPE\s+VARCHAR\s*\(\s*10\s*\)/i.test(sql),
      );
      expect(revertSql).toBeDefined();
    });
  });
});
