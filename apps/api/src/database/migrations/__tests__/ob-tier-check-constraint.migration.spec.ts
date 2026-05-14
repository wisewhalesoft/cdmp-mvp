/**
 * Iter 1 / F056 v1.5 / architecture-spec §E07-G:
 *   1711360000163-AddObTierTierLevelCheck (D-CT-03)
 *
 * 為 ob_tier.tier_level 加上 CHECK constraint `tier_level IN (T1..T10)`：
 *   - 僅 PostgreSQL 環境執行；SQLite 環境略過（由應用層 TIER_LEVEL_ENUM 守護）
 *   - up() 內含 pre-condition guard：執行 D11 驗證 SQL，若有違規列直接 throw Error
 *     中止 migration（避免風險 14：D-CT-03 早於 TIER 後綴 UPDATE 執行）
 *
 * 測試策略：mock QueryRunner.query()
 *   - 違規 D11：mock query 回傳含違規 row 陣列 → 期望 throw
 *   - 通過 D11：mock query 回傳 []  → 期望執行 ALTER TABLE ADD CONSTRAINT
 *
 * 涵蓋 cases：
 *   up() — PostgreSQL：
 *     1) 先執行 D11 違規驗證 SQL（SELECT ... tier_level NOT IN (...) ...）
 *     2) 違規列存在 → throw Error，不執行 ALTER
 *     3) D11 通過（回 []）→ ALTER TABLE ob_tier ADD CONSTRAINT chk_ob_tier_tier_level CHECK
 *        (tier_level IN ('T1'..'T10'))
 *   up() — SQLite：
 *     4) 略過所有 DDL（不 ALTER，不 throw）
 *   down() — PostgreSQL：
 *     5) DROP CONSTRAINT chk_ob_tier_tier_level
 *   down() — SQLite：
 *     6) 略過（noop）
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import type { QueryRunner } from 'typeorm';
import { AddObTierTierLevelCheck1711360000163 } from '../1711360000163-AddObTierTierLevelCheck';

describe('Migration 1711360000163: AddObTierTierLevelCheck (D-CT-03)', () => {
  let migration: AddObTierTierLevelCheck1711360000163;
  let queryRunner: { query: ReturnType<typeof vi.fn> };
  const originalDbType = process.env.DB_TYPE;

  beforeEach(() => {
    migration = new AddObTierTierLevelCheck1711360000163();
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

  describe('up() — PostgreSQL', () => {
    beforeEach(() => {
      delete process.env.DB_TYPE;
    });

    it('1) 先執行 D11 違規驗證 SQL（SELECT ... tier_level NOT IN (...)）', async () => {
      queryRunner.query.mockResolvedValue([]); // 0 違規列
      await migration.up(queryRunner as unknown as QueryRunner);

      const firstCall = queryRunner.query.mock.calls[0][0] as string;
      expect(firstCall).toMatch(/SELECT/i);
      expect(firstCall).toMatch(/tier_level/i);
      expect(firstCall).toMatch(/NOT\s+IN/i);
      // 必須涵蓋 T1~T10
      for (const v of ['T1', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7', 'T8', 'T9', 'T10']) {
        expect(firstCall).toMatch(new RegExp(`'${v}'`));
      }
    });

    it('2) D11 有違規列存在 → throw Error，且不執行 ALTER', async () => {
      // mock 第一次 query (D11) 回傳違規列
      queryRunner.query.mockResolvedValueOnce([
        { tier_level: 'T5M', count: 1 },
      ]);

      await expect(
        migration.up(queryRunner as unknown as QueryRunner),
      ).rejects.toThrow(/D11|tier_level|invalid/i);

      // 應只執行 D11 那次 query；不應呼叫 ALTER TABLE
      const alterCalls = queryRunner.query.mock.calls
        .map((c) => c[0] as string)
        .filter((sql) => /ALTER\s+TABLE/i.test(sql));
      expect(alterCalls).toHaveLength(0);
    });

    it('3) D11 通過（回 []）→ ALTER TABLE ADD CONSTRAINT chk_ob_tier_tier_level', async () => {
      queryRunner.query.mockResolvedValue([]); // 0 違規
      await migration.up(queryRunner as unknown as QueryRunner);

      const allSql = queryRunner.query.mock.calls.map((c) => c[0]).join('\n');
      expect(allSql).toMatch(/ALTER\s+TABLE\s+ob_tier/i);
      expect(allSql).toMatch(/ADD\s+CONSTRAINT\s+chk_ob_tier_tier_level/i);
      expect(allSql).toMatch(/CHECK\s*\(/i);
      for (const v of ['T1', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7', 'T8', 'T9', 'T10']) {
        expect(allSql).toMatch(new RegExp(`'${v}'`));
      }
    });
  });

  describe('up() — SQLite', () => {
    beforeEach(() => {
      process.env.DB_TYPE = 'sqlite';
    });

    it('4) 略過所有 DDL（不 ALTER，不 throw）', async () => {
      await migration.up(queryRunner as unknown as QueryRunner);

      const alterCalls = queryRunner.query.mock.calls
        .map((c) => c[0] as string)
        .filter((sql) => /ALTER\s+TABLE/i.test(sql));
      expect(alterCalls).toHaveLength(0);
    });
  });

  describe('down() — PostgreSQL', () => {
    beforeEach(() => {
      delete process.env.DB_TYPE;
    });

    it('5) DROP CONSTRAINT chk_ob_tier_tier_level', async () => {
      await migration.down(queryRunner as unknown as QueryRunner);

      const allSql = queryRunner.query.mock.calls.map((c) => c[0]).join('\n');
      expect(allSql).toMatch(/ALTER\s+TABLE\s+ob_tier/i);
      expect(allSql).toMatch(/DROP\s+CONSTRAINT[^;]*chk_ob_tier_tier_level/i);
    });
  });

  describe('down() — SQLite', () => {
    beforeEach(() => {
      process.env.DB_TYPE = 'sqlite';
    });

    it('6) 略過 DROP CONSTRAINT（noop）', async () => {
      await migration.down(queryRunner as unknown as QueryRunner);

      const dropCalls = queryRunner.query.mock.calls
        .map((c) => c[0] as string)
        .filter((sql) => /DROP\s+CONSTRAINT/i.test(sql));
      expect(dropCalls).toHaveLength(0);
    });
  });
});
