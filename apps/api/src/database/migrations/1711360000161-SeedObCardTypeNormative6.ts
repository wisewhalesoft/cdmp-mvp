import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Iter 1 / F069~F072 / architecture-spec §E07-G:
 *   D-CT-02：Seed 6 個正規 CARD_TYPE
 *
 * 對照表（OQ-E07-33 ✅ Resolved，依 OBMLISTDF dump 實證）：
 *   H  → 期中     / PROD_KIND=01（汽車）
 *   S  → 中結     / PROD_KIND=01
 *   E  → 滿期     / PROD_KIND=01
 *   S5 → 中結5年  / PROD_KIND=01
 *   E5 → 滿期5年  / PROD_KIND=01
 *   M  → 機車     / PROD_KIND=02（機車）
 *
 * 過渡型 CARD_TYPE（HM/M3/HC/C3/HB/SEB/SEC 等）不在此 seed 範圍：
 *   - M3/HC/C3 fallback 對應已由 1711360000150-SeedObTierFallback seed 至 ob_tier
 *     （card_level IS NULL 的 fallback 規則紀錄）
 *   - 過渡型 CARD_TYPE 不入 ob_card_type 表，因業務不再支援新增此類卡別
 *
 * Idempotent：採 `ON CONFLICT (card_type) DO NOTHING`（PostgreSQL）/
 *   `INSERT OR IGNORE`（SQLite 條件分支），使 migration 可安全重跑。
 *
 * Down：DELETE FROM ob_card_type WHERE card_type IN ('H','S','E','S5','E5','M')
 *   —— 限定 6 個正規值，不誤刪業務主管透過 F070 手動新增的紀錄。
 */
export class SeedObCardTypeNormative61711360000161 implements MigrationInterface {
  name = 'SeedObCardTypeNormative61711360000161';

  public async up(queryRunner: QueryRunner): Promise<void> {
    const isSqlite = process.env.DB_TYPE === 'sqlite';

    // 6 個正規 CARD_TYPE 列表
    // 注意：與 constants/card-type.constants.ts 之 CARD_TYPE_NORMATIVE 保持一致。
    // Migration 不直接 import constants（避免應用程式碼異動時影響歷史 migration 行為），
    // 但變更時須兩邊同步調整。
    const rows: ReadonlyArray<{ card_type: string; card_name: string; prod_kind: string }> = [
      { card_type: 'H', card_name: '期中', prod_kind: '01' },
      { card_type: 'S', card_name: '中結', prod_kind: '01' },
      { card_type: 'E', card_name: '滿期', prod_kind: '01' },
      { card_type: 'S5', card_name: '中結5年', prod_kind: '01' },
      { card_type: 'E5', card_name: '滿期5年', prod_kind: '01' },
      { card_type: 'M', card_name: '機車', prod_kind: '02' },
    ];

    if (isSqlite) {
      // SQLite：INSERT OR IGNORE（依 card_type PK 衝突時忽略）
      for (const r of rows) {
        await queryRunner.query(
          `INSERT OR IGNORE INTO ob_card_type
             (card_type, card_name, prod_kind, status, created_at, created_by, updated_at, updated_by)
           VALUES ('${r.card_type}', '${r.card_name}', '${r.prod_kind}', 'active',
                   CURRENT_TIMESTAMP, 'SYSTEM', CURRENT_TIMESTAMP, 'SYSTEM')`,
        );
      }
    } else {
      // PostgreSQL：ON CONFLICT (card_type) DO NOTHING
      // 逐筆 INSERT（與 SeedObTierFallback 同 pattern，避免單條多 VALUES 在部分 PG 版本對 ON CONFLICT
      // 行為差異）
      for (const r of rows) {
        await queryRunner.query(
          `INSERT INTO ob_card_type
             (card_type, card_name, prod_kind, status, created_at, created_by, updated_at, updated_by)
           VALUES ('${r.card_type}', '${r.card_name}', '${r.prod_kind}', 'active',
                   CURRENT_TIMESTAMP, 'SYSTEM', CURRENT_TIMESTAMP, 'SYSTEM')
           ON CONFLICT (card_type) DO NOTHING`,
        );
      }
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // 限定 6 個正規值，避免誤刪業務主管透過 F070 手動新增的紀錄
    await queryRunner.query(
      `DELETE FROM ob_card_type
         WHERE card_type IN ('H', 'S', 'E', 'S5', 'E5', 'M')`,
    );
  }
}
