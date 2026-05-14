/**
 * Iter 1 / F056 v1.5 / architecture-spec §E07-G:
 *   1711360000162-MigrateObTierTierLevelSuffix
 *
 * 目的：將既有 ob_tier.tier_level 舊後綴值統一遷移至 T1~T10：
 *   - 一般正則 `^T(\d+)` 取前綴：T1M / T1HM / T2HM / T3M / T3HM / T32 / T3C / T4M / T51 / T52 / T5M
 *     → T1 / T1 / T2 / T3 / T3 / T3 / T3 / T4 / T5 / T5 / T5
 *   - THC 特例 → T1（無數字前綴，依架構決策 architecture-spec §E07-G）
 *   - 過渡 CARD_TYPE 紀錄（HM/M3/HC/C3/HB/SEB/SEC）：M3/HC/C3 fallback 已有 seed（migration
 *     1711360000150-SeedObTierFallback）；本 migration 不刪除既有 fallback，僅做 tier_level
 *     後綴遷移；其他過渡 CARD_TYPE 由業務主管手動清理（spec OPEN-2 / D11 驗證）。
 *
 * 測試策略：mock QueryRunner，驗 up() 是否以正確 UPDATE SQL 呼叫 query()。
 *
 * 涵蓋 cases：
 *   up():
 *     1) THC → T1 特例 UPDATE
 *     2) 一般正則 UPDATE：以 regexp_replace（PG）或對每個舊值各一條 UPDATE
 *        T1M → T1、T1HM → T1
 *     3) T2HM → T2
 *     4) T3M / T3HM / T32 / T3C → T3
 *     5) T4M → T4
 *     6) T51 / T52 / T5M → T5
 *     7) 所有 UPDATE 只動 tier_level 不影響其他欄位
 *     8) 不刪除任何 ob_tier 紀錄（fallback / standard 都保留）
 *   down():
 *     9) 拋 Error（不可逆，舊後綴語意無法 1:1 還原）
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { QueryRunner } from 'typeorm';
import { MigrateObTierTierLevelSuffix1711360000162 } from '../1711360000162-MigrateObTierTierLevelSuffix';

describe('Migration 1711360000162: MigrateObTierTierLevelSuffix', () => {
  let migration: MigrateObTierTierLevelSuffix1711360000162;
  let queryRunner: { query: ReturnType<typeof vi.fn> };

  beforeEach(() => {
    migration = new MigrateObTierTierLevelSuffix1711360000162();
    queryRunner = {
      query: vi.fn().mockResolvedValue(undefined),
    };
  });

  describe('up()', () => {
    it('1) THC → T1 特例 UPDATE', async () => {
      await migration.up(queryRunner as unknown as QueryRunner);

      const allSql = queryRunner.query.mock.calls.map((c) => c[0]).join('\n');
      expect(allSql).toMatch(
        /UPDATE\s+ob_tier\s+SET\s+tier_level\s*=\s*'T1'\s+WHERE\s+tier_level\s*=\s*'THC'/i,
      );
    });

    it('2) T1M → T1、T1HM → T1（regex 取前綴或逐筆 UPDATE）', async () => {
      await migration.up(queryRunner as unknown as QueryRunner);

      const allSql = queryRunner.query.mock.calls.map((c) => c[0]).join('\n');
      // 接受兩種寫法：
      //   (a) regexp_replace 一條 UPDATE（PostgreSQL）：SET tier_level = 'T' || regexp_replace(...)
      //   (b) 逐筆 UPDATE：每個舊值各一條
      const hasRegexpReplace = /regexp_replace/i.test(allSql);
      const hasT1MUpdate =
        /UPDATE\s+ob_tier\s+SET\s+tier_level\s*=\s*'T1'\s+WHERE\s+tier_level\s*=\s*'T1M'/i.test(
          allSql,
        );
      const hasT1HMUpdate =
        /UPDATE\s+ob_tier\s+SET\s+tier_level\s*=\s*'T1'\s+WHERE\s+tier_level\s*=\s*'T1HM'/i.test(
          allSql,
        );
      expect(hasRegexpReplace || (hasT1MUpdate && hasT1HMUpdate)).toBe(true);
    });

    it('3) T2HM → T2', async () => {
      await migration.up(queryRunner as unknown as QueryRunner);

      const allSql = queryRunner.query.mock.calls.map((c) => c[0]).join('\n');
      const hasRegexpReplace = /regexp_replace/i.test(allSql);
      const hasT2HM =
        /UPDATE\s+ob_tier\s+SET\s+tier_level\s*=\s*'T2'\s+WHERE\s+tier_level\s*=\s*'T2HM'/i.test(
          allSql,
        );
      expect(hasRegexpReplace || hasT2HM).toBe(true);
    });

    it('4) T3M / T3HM / T32 / T3C → T3', async () => {
      await migration.up(queryRunner as unknown as QueryRunner);

      const allSql = queryRunner.query.mock.calls.map((c) => c[0]).join('\n');
      const hasRegexpReplace = /regexp_replace/i.test(allSql);
      const allT3 = ['T3M', 'T3HM', 'T32', 'T3C'].every((v) =>
        new RegExp(
          `UPDATE\\s+ob_tier\\s+SET\\s+tier_level\\s*=\\s*'T3'\\s+WHERE\\s+tier_level\\s*=\\s*'${v}'`,
          'i',
        ).test(allSql),
      );
      expect(hasRegexpReplace || allT3).toBe(true);
    });

    it('5) T4M → T4', async () => {
      await migration.up(queryRunner as unknown as QueryRunner);

      const allSql = queryRunner.query.mock.calls.map((c) => c[0]).join('\n');
      const hasRegexpReplace = /regexp_replace/i.test(allSql);
      const hasT4M =
        /UPDATE\s+ob_tier\s+SET\s+tier_level\s*=\s*'T4'\s+WHERE\s+tier_level\s*=\s*'T4M'/i.test(
          allSql,
        );
      expect(hasRegexpReplace || hasT4M).toBe(true);
    });

    it('6) T51 / T52 / T5M → T5', async () => {
      await migration.up(queryRunner as unknown as QueryRunner);

      const allSql = queryRunner.query.mock.calls.map((c) => c[0]).join('\n');
      const hasRegexpReplace = /regexp_replace/i.test(allSql);
      const allT5 = ['T51', 'T52', 'T5M'].every((v) =>
        new RegExp(
          `UPDATE\\s+ob_tier\\s+SET\\s+tier_level\\s*=\\s*'T5'\\s+WHERE\\s+tier_level\\s*=\\s*'${v}'`,
          'i',
        ).test(allSql),
      );
      expect(hasRegexpReplace || allT5).toBe(true);
    });

    it('7) 所有 UPDATE 只動 tier_level，不動其他欄位', async () => {
      await migration.up(queryRunner as unknown as QueryRunner);

      const updateCalls = queryRunner.query.mock.calls
        .map((c) => c[0] as string)
        .filter((sql) => /^\s*UPDATE\s+ob_tier/i.test(sql));

      expect(updateCalls.length).toBeGreaterThan(0);
      for (const sql of updateCalls) {
        // 抽出 SET 與 WHERE 之間的子句（非 char-class 寫法，正確匹配整個 SET 內容）
        const setClauseMatch = sql.match(/SET\s+(.+?)\s+WHERE\s+/i);
        expect(setClauseMatch).not.toBeNull();
        const setClause = setClauseMatch![1];
        // 必須有 tier_level = ...
        expect(setClause).toMatch(/\btier_level\s*=/i);
        // 不可同時 SET 其他欄位（如 card_type / card_level / list_nm）
        expect(setClause).not.toMatch(/\bcard_type\s*=/i);
        expect(setClause).not.toMatch(/\bcard_level\s*=/i);
        expect(setClause).not.toMatch(/\blist_nm\s*=/i);
      }
    });

    it('8) 不執行任何 DELETE FROM ob_tier（保留所有紀錄）', async () => {
      await migration.up(queryRunner as unknown as QueryRunner);

      const deleteCalls = queryRunner.query.mock.calls
        .map((c) => c[0] as string)
        .filter((sql) => /DELETE\s+FROM\s+ob_tier/i.test(sql));

      expect(deleteCalls).toHaveLength(0);
    });
  });

  describe('down()', () => {
    it('9) 拋 Error（不可逆 migration，舊後綴語意無法 1:1 還原）', async () => {
      await expect(
        migration.down(queryRunner as unknown as QueryRunner),
      ).rejects.toThrow(/not reversible/i);
    });
  });
});
