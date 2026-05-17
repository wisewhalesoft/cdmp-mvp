/**
 * v2.0 補 / m24 / F076 v1.3 AC-3：BEST_CASE / SPEC_TP 可選值 seed
 *
 * 對應 spec：F076 §4 / AC-3 與 m22 §22 留項（"SPEC_TP / BEST_CASE：依 OBMCODEDF 之後另行補"）。
 *
 * 涵蓋 cases：
 *   - TC-SEED-BEST-CASE-001：BEST_CASE 至少 seed 2 筆 Y/N 可選值
 *   - TC-SEED-SPEC-TP-001：SPEC_TP 至少 seed 3 筆 placeholder 可選值
 *   - TC-SEED-IDEMPOTENT-PG：PostgreSQL ON CONFLICT (column_name, option_value) DO NOTHING
 *   - TC-SEED-IDEMPOTENT-SQLITE：SQLite INSERT OR IGNORE
 *   - TC-SEED-DOWN：DELETE 限定 BEST_CASE / SPEC_TP 兩個 column_name
 *   - TC-SEED-ASSUMPTION-MARK：migration source 含 [ASSUMPTION] 標註待真實 OBMCODEDF dump 確認
 *
 * 不破壞 m22 已 seed 的其他 6 個欄位（PROD_KIND/LIST_TYPE/CASEYEAR/SETTLE_SRC/MONTH_CNT/PAYT_TERM）。
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import type { QueryRunner } from 'typeorm';
import * as fs from 'fs';
import * as path from 'path';
import { SeedBestCaseSpecTpOptions1711360000240 } from '../1711360000240-SeedBestCaseSpecTpOptions';

describe('Migration 1711360000240: SeedBestCaseSpecTpOptions (v2.0 補 m22 留項)', () => {
  let migration: SeedBestCaseSpecTpOptions1711360000240;
  let queryRunner: { query: ReturnType<typeof vi.fn> };
  const originalDbType = process.env.DB_TYPE;

  beforeEach(() => {
    migration = new SeedBestCaseSpecTpOptions1711360000240();
    queryRunner = { query: vi.fn().mockResolvedValue(undefined) };
  });

  afterEach(() => {
    if (originalDbType === undefined) delete process.env.DB_TYPE;
    else process.env.DB_TYPE = originalDbType;
  });

  describe('up() — PostgreSQL', () => {
    beforeEach(() => {
      delete process.env.DB_TYPE;
    });

    it('TC-SEED-BEST-CASE-001：BEST_CASE seed 至少 Y / N 兩筆可選值', async () => {
      await migration.up(queryRunner as unknown as QueryRunner);
      const allSql = queryRunner.query.mock.calls.map((c) => c[0]).join('\n');
      expect(allSql).toMatch(/'BEST_CASE'[^;]*'Y'/);
      expect(allSql).toMatch(/'BEST_CASE'[^;]*'N'/);
    });

    it('TC-SEED-SPEC-TP-001：SPEC_TP seed 至少 3 筆 placeholder（01 / 02 / 03）', async () => {
      await migration.up(queryRunner as unknown as QueryRunner);
      const allSql = queryRunner.query.mock.calls.map((c) => c[0]).join('\n');
      expect(allSql).toMatch(/'SPEC_TP'[^;]*'01'/);
      expect(allSql).toMatch(/'SPEC_TP'[^;]*'02'/);
      expect(allSql).toMatch(/'SPEC_TP'[^;]*'03'/);
    });

    it('TC-SEED-IDEMPOTENT-PG：ON CONFLICT (column_name, option_value) DO NOTHING', async () => {
      await migration.up(queryRunner as unknown as QueryRunner);
      const allSql = queryRunner.query.mock.calls.map((c) => c[0]).join('\n');
      expect(allSql).toMatch(
        /ON\s+CONFLICT\s*\(\s*column_name\s*,\s*option_value\s*\)\s+DO\s+NOTHING/i,
      );
    });

    it('TC-SEED-NO-WHITELIST-INSERT：本 migration 只 seed pooldata_field_option，不重複 INSERT whitelist（已由 m22 處理）', async () => {
      await migration.up(queryRunner as unknown as QueryRunner);
      const allSql = queryRunner.query.mock.calls.map((c) => c[0]).join('\n');
      expect(allSql).not.toMatch(/INSERT[^;]*pooldata_field_whitelist/i);
    });
  });

  describe('up() — SQLite', () => {
    beforeEach(() => {
      process.env.DB_TYPE = 'sqlite';
    });

    it('TC-SEED-IDEMPOTENT-SQLITE：SQLite INSERT OR IGNORE INTO pooldata_field_option', async () => {
      await migration.up(queryRunner as unknown as QueryRunner);
      const allSql = queryRunner.query.mock.calls.map((c) => c[0]).join('\n');
      expect(allSql).toMatch(/INSERT\s+OR\s+IGNORE\s+INTO\s+pooldata_field_option/i);
      expect(allSql).not.toMatch(/ON\s+CONFLICT/i);
    });
  });

  describe('down()', () => {
    it('TC-SEED-DOWN：DELETE 限定 BEST_CASE / SPEC_TP IN clause', async () => {
      await migration.down(queryRunner as unknown as QueryRunner);
      const allSql = queryRunner.query.mock.calls.map((c) => c[0]).join('\n');
      expect(allSql).toMatch(/DELETE\s+FROM\s+pooldata_field_option/i);
      // 必須以 IN clause 限定範圍，避免清空整張表
      expect(allSql).toMatch(/'BEST_CASE'/);
      expect(allSql).toMatch(/'SPEC_TP'/);
      // 不可動到其他 6 個 m22 欄位
      expect(allSql).not.toMatch(/'PROD_KIND'/);
      expect(allSql).not.toMatch(/'LIST_TYPE'/);
      expect(allSql).not.toMatch(/'CASEYEAR'/);
      expect(allSql).not.toMatch(/'SETTLE_SRC'/);
      // 不可刪 whitelist（m22 owns）
      expect(allSql).not.toMatch(/DELETE\s+FROM\s+pooldata_field_whitelist/i);
    });
  });

  describe('source code annotations', () => {
    it('TC-SEED-ASSUMPTION-MARK：migration source 含 [ASSUMPTION] 標註待真實 OBMCODEDF dump 確認', () => {
      const migrationPath = path.resolve(
        __dirname,
        '..',
        '1711360000240-SeedBestCaseSpecTpOptions.ts',
      );
      const src = fs.readFileSync(migrationPath, 'utf8');
      expect(src).toMatch(/\[ASSUMPTION\][^\n]*OBMCODEDF/i);
    });
  });
});
