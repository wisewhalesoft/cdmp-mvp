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
