import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Iter 1 / F056 v1.5 / architecture-spec §E07-G:
 *   1711360000162-MigrateObTierTierLevelSuffix
 *
 * 將 ob_tier.tier_level 既有舊後綴值統一遷移至 T1~T10：
 *   - 一般正則 `^T(\d+).*` 取數字前綴：
 *       T1M / T1HM           → T1
 *       T2HM                 → T2
 *       T3M / T3HM / T32 / T3C → T3
 *       T4M                  → T4
 *       T51 / T52 / T5M      → T5
 *   - 特例（無數字前綴）：
 *       THC → T1（依架構決策 architecture-spec §E07-G）
 *
 * 處理策略（DB_TYPE 條件分支）：
 *   - 採 11 筆獨立 UPDATE 寫法（不採用 regexp_replace），便於 SQLite/PostgreSQL 共用，
 *     且每筆 UPDATE 可獨立 audit / verify。
 *   - 對應表與 constants/card-type.constants.ts 之 TIER_LEVEL_SUFFIX_MIGRATION_MAP 一致；
 *     migration 不 import constants（避免應用程式碼異動影響歷史 migration 行為），但兩邊
 *     變更時須同步。
 *
 * 不刪除任何紀錄：
 *   - 既有 fallback（M3/HC/C3 card_level IS NULL）由 1711360000150-SeedObTierFallback
 *     維護；本 migration 僅做 tier_level 後綴遷移，不刪除任何 ob_tier 紀錄。
 *
 * Idempotent：所有 UPDATE 為 WHERE tier_level = '<舊值>'，重跑時若已遷移完畢則 0 列影響。
 *
 * Down：不可逆（toThrow）。理由：舊後綴語意（M / HM / C / 數字編號等）已合併至 T1~T10，
 *   無法 1:1 還原；如需復原，請從 dump snapshot restore（與 ExtendObCodeDfTblIdToVarchar11
 *   同 pattern）。
 */
export class MigrateObTierTierLevelSuffix1711360000162
  implements MigrationInterface
{
  name = 'MigrateObTierTierLevelSuffix1711360000162';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // 對照表（與 constants/card-type.constants.ts 同步）
    const migrations: ReadonlyArray<{ from: string; to: string }> = [
      // 特例優先處理
      { from: 'THC', to: 'T1' },
      // 一般正則 ^T(\d+).*
      { from: 'T1M', to: 'T1' },
      { from: 'T1HM', to: 'T1' },
      { from: 'T2HM', to: 'T2' },
      { from: 'T3M', to: 'T3' },
      { from: 'T3HM', to: 'T3' },
      { from: 'T32', to: 'T3' },
      { from: 'T3C', to: 'T3' },
      { from: 'T4M', to: 'T4' },
      { from: 'T51', to: 'T5' },
      { from: 'T52', to: 'T5' },
      { from: 'T5M', to: 'T5' },
    ];

    for (const m of migrations) {
      await queryRunner.query(
        `UPDATE ob_tier SET tier_level = '${m.to}' WHERE tier_level = '${m.from}'`,
      );
    }
  }

  public async down(_queryRunner: QueryRunner): Promise<void> {
    throw new Error(
      `Migration 1711360000162-MigrateObTierTierLevelSuffix is not reversible. ` +
        `Old suffix semantics (T1M/T1HM/T2HM/T3M/T3HM/T32/T3C/T4M/T51/T52/T5M/THC) have been ` +
        `collapsed into T1..T10 and cannot be uniquely restored. To recover, restore ob_tier ` +
        `from a pre-migration database snapshot.`,
    );
  }
}
