/**
 * F056 / OQ-E07-28 / data-model.md #ob-tier-entity：
 *   M3 / HC / C3 fallback seed migration 測試。
 *
 * 移植自舊系統 SP `Stage2_依照CardType分類TierLevel.sql` L93–123
 * 硬編碼 IF 分支，新系統改以 ob_tier 正常對應紀錄表達：
 *   - M3 → T5M（CARD_LEVEL = NULL，fallback）
 *   - HC → THC（CARD_LEVEL = NULL，fallback）
 *   - C3 → T3C（CARD_LEVEL = NULL，fallback）
 *
 * 測試策略（與 F068 migration spec 一致）：mock QueryRunner，驗證 up()
 * 是否以正確 SQL 呼叫 query()。實機驗證留待 docker exec psql 手動執行。
 *
 * 涵蓋 7 cases：
 *   1. up() 對 M3 INSERT 一筆 fallback（card_level = NULL，tier_level = T5M）
 *   2. up() 對 HC INSERT 一筆 fallback（card_level = NULL，tier_level = THC）
 *   3. up() 對 C3 INSERT 一筆 fallback（card_level = NULL，tier_level = T3C）
 *   4. 所有 INSERT 採 `ON CONFLICT DO NOTHING` 或等效 idempotent 語意（重跑不報錯）
 *   5. 總共 3 條 INSERT SQL
 *   6. down() 對 M3 / HC / C3 三筆做 DELETE（只刪 fallback row，card_level IS NULL）
 *   7. down() 不會誤刪標準對應紀錄
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { QueryRunner } from 'typeorm';
import { SeedObTierFallback1711360000150 } from '../1711360000150-SeedObTierFallback';

describe('Migration 1711360000150: SeedObTierFallback', () => {
  let migration: SeedObTierFallback1711360000150;
  let queryRunner: { query: ReturnType<typeof vi.fn> };

  beforeEach(() => {
    migration = new SeedObTierFallback1711360000150();
    queryRunner = {
      query: vi.fn().mockResolvedValue(undefined),
    };
  });

  describe('up()', () => {
    it("1) M3 fallback INSERT（card_level IS NULL → tier_level='T5M'）", async () => {
      await migration.up(queryRunner as unknown as QueryRunner);

      const allSql = queryRunner.query.mock.calls.map((c) => c[0]).join('\n');
      // INSERT INTO ob_tier (card_type, card_level, tier_level, list_nm) VALUES ('M3', NULL, 'T5M', ...)
      expect(allSql).toMatch(/INSERT\s+INTO\s+ob_tier/i);
      expect(allSql).toMatch(/'M3'\s*,\s*NULL\s*,\s*'T5M'/i);
    });

    it("2) HC fallback INSERT（card_level IS NULL → tier_level='THC'）", async () => {
      await migration.up(queryRunner as unknown as QueryRunner);

      const allSql = queryRunner.query.mock.calls.map((c) => c[0]).join('\n');
      expect(allSql).toMatch(/'HC'\s*,\s*NULL\s*,\s*'THC'/i);
    });

    it("3) C3 fallback INSERT（card_level IS NULL → tier_level='T3C'）", async () => {
      await migration.up(queryRunner as unknown as QueryRunner);

      const allSql = queryRunner.query.mock.calls.map((c) => c[0]).join('\n');
      expect(allSql).toMatch(/'C3'\s*,\s*NULL\s*,\s*'T3C'/i);
    });

    it('4) INSERT 採 idempotent 語意（ON CONFLICT 或 WHERE NOT EXISTS）以利重跑', async () => {
      await migration.up(queryRunner as unknown as QueryRunner);

      const insertCalls = queryRunner.query.mock.calls
        .map((c) => c[0] as string)
        .filter((sql) => /INSERT/i.test(sql));

      expect(insertCalls.length).toBeGreaterThan(0);
      for (const sql of insertCalls) {
        // 任一 idempotent 寫法皆可：ON CONFLICT / WHERE NOT EXISTS / IF NOT EXISTS
        const isIdempotent =
          /ON\s+CONFLICT/i.test(sql) ||
          /WHERE\s+NOT\s+EXISTS/i.test(sql) ||
          /IF\s+NOT\s+EXISTS/i.test(sql);
        expect(isIdempotent).toBe(true);
      }
    });

    it('5) 總共 3 條 INSERT SQL（M3 / HC / C3 各一）', async () => {
      await migration.up(queryRunner as unknown as QueryRunner);

      const insertCalls = queryRunner.query.mock.calls
        .map((c) => c[0] as string)
        .filter((sql) => /INSERT\s+INTO\s+ob_tier/i.test(sql));

      expect(insertCalls).toHaveLength(3);
    });
  });

  describe('down()', () => {
    it('6) 對 M3 / HC / C3 三筆 fallback 做 DELETE（限定 card_level IS NULL）', async () => {
      await migration.down(queryRunner as unknown as QueryRunner);

      const allSql = queryRunner.query.mock.calls.map((c) => c[0]).join('\n');
      expect(allSql).toMatch(/DELETE\s+FROM\s+ob_tier/i);
      // 每個 card_type 各刪一筆，且必須限定 card_level IS NULL（不誤刪標準對應）
      const deleteCalls = queryRunner.query.mock.calls
        .map((c) => c[0] as string)
        .filter((sql) => /DELETE\s+FROM\s+ob_tier/i.test(sql));

      const cardTypesInDeletes = deleteCalls
        .map((sql) => {
          const m = sql.match(/card_type\s*=\s*'(\w+)'/i);
          return m ? m[1] : null;
        })
        .filter(Boolean);

      expect(cardTypesInDeletes.sort()).toEqual(['C3', 'HC', 'M3']);
    });

    it('7) down() 所有 DELETE 都限定 card_level IS NULL（避免誤刪標準對應）', async () => {
      await migration.down(queryRunner as unknown as QueryRunner);

      const deleteCalls = queryRunner.query.mock.calls
        .map((c) => c[0] as string)
        .filter((sql) => /DELETE\s+FROM\s+ob_tier/i.test(sql));

      expect(deleteCalls.length).toBeGreaterThan(0);
      for (const sql of deleteCalls) {
        expect(sql).toMatch(/card_level\s+IS\s+NULL/i);
      }
    });
  });
});
