import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * m288 / E07 ratio 欄位 prod 對齊 migration（2026-05-25）
 *
 * 統一補本輪 dev synchronize 已生效但 prod migration 未跟上的 entity 改動：
 *
 * 1. ration scale 1 → 2（commit 98a2f56）
 *    - ob_dept_pct.ration:  NUMERIC(9,1)  → NUMERIC(9,2)
 *    - ob_empl_set.ration:  NUMERIC(10,1) → NUMERIC(10,2)
 *    - 原 scale=1 會把 4.55 round 成 4.6 → 22 員工均等分配 sum = 21×4.6 + 4.5 = 101.1
 *      不符 FE RatioInput step=0.01 與 spec F082 BR-2 容忍 ±0.01% 的雙小數設計
 *    - ration 為 PK 欄位之一；PG ALTER COLUMN TYPE 會自動 rebuild PK index
 *
 * 2. audit 欄位 length 10/20 → 50（commits 736e9c4 / bcedc04 follow-up）
 *    - ob_dept_pct.created_by / updated_by: VARCHAR(10) → VARCHAR(50)
 *    - ob_empl_set.created_by / updated_by: VARCHAR(10) → VARCHAR(50)
 *    - ob_list_definition.created_by / updated_by: VARCHAR(20) → VARCHAR(50)
 *      （bcedc04 hotfix 只動 entity，prod migration 未跟上之 follow-up）
 *    - 對齊 users.id UUID 36 字元寫入需求
 *
 * 既有資料無損：
 *   - NUMERIC widening：1-decimal 4.6 → 2-decimal 4.60 自動擴展，無 rounding
 *   - VARCHAR widening：原值長度 ≤ 10/20 字元，擴 → 50 無溢位
 *
 * 影響範圍：
 *   - PG prod：本 migration 套用後 entity / DB schema 一致
 *   - SQLite e2e：因 sqlite ALTER COLUMN TYPE 限制大（需 recreate table），
 *     且 e2e 走 synchronize:true 自動同步 entity → 本 migration up/down 對
 *     sqlite no-op；entity 為單一事實來源
 *
 * 對應 spec：
 *   - F079 v1.3（data-model.md ob_dept_pct 欄位表 2026-05-25 更新）
 *   - F082 v1.6（data-model.md ob_empl_set 欄位表 2026-05-25 更新）
 *   - data-model.md「Follow-up：prod migration」段落
 */
export class AlignE07RatioColumnTypes1711360000288 implements MigrationInterface {
  name = 'AlignE07RatioColumnTypes1711360000288';

  public async up(queryRunner: QueryRunner): Promise<void> {
    const isSqlite = process.env.DB_TYPE === 'sqlite';
    if (isSqlite) {
      // SQLite e2e 走 entity synchronize:true；migration no-op
      return;
    }

    // 1. ration scale 1 → 2（ob_dept_pct / ob_empl_set；皆為 PK 欄位，PG 會自動 rebuild PK index）
    await queryRunner.query(
      `ALTER TABLE ob_dept_pct ALTER COLUMN ration TYPE NUMERIC(9,2)`,
    );
    await queryRunner.query(
      `ALTER TABLE ob_empl_set ALTER COLUMN ration TYPE NUMERIC(10,2)`,
    );

    // 2. audit 欄位 length → 50（ob_dept_pct / ob_empl_set / ob_list_definition）
    //    PG VARCHAR widening 不需 USING clause；既有資料無溢位
    await queryRunner.query(
      `ALTER TABLE ob_dept_pct ALTER COLUMN created_by TYPE VARCHAR(50)`,
    );
    await queryRunner.query(
      `ALTER TABLE ob_dept_pct ALTER COLUMN updated_by TYPE VARCHAR(50)`,
    );
    await queryRunner.query(
      `ALTER TABLE ob_empl_set ALTER COLUMN created_by TYPE VARCHAR(50)`,
    );
    await queryRunner.query(
      `ALTER TABLE ob_empl_set ALTER COLUMN updated_by TYPE VARCHAR(50)`,
    );
    await queryRunner.query(
      `ALTER TABLE ob_list_definition ALTER COLUMN created_by TYPE VARCHAR(50)`,
    );
    await queryRunner.query(
      `ALTER TABLE ob_list_definition ALTER COLUMN updated_by TYPE VARCHAR(50)`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const isSqlite = process.env.DB_TYPE === 'sqlite';
    if (isSqlite) return;

    // Down：縮回原型別。若 prod 已有 ration=4.55 / created_by=<UUID 36 字元>
    // 等實際 2-decimal / 50-char 資料，down 會失敗或截斷；故加 USING clause
    // 顯式做 round / substr，避免 silent data loss。生產環境 rollback 仍須
    // ops 確認是否有資料寬度依賴。

    // ration 縮回 scale=1（USING round）
    await queryRunner.query(
      `ALTER TABLE ob_empl_set ALTER COLUMN ration TYPE NUMERIC(10,1) USING ROUND(ration, 1)`,
    );
    await queryRunner.query(
      `ALTER TABLE ob_dept_pct ALTER COLUMN ration TYPE NUMERIC(9,1) USING ROUND(ration, 1)`,
    );

    // audit 欄位縮回（USING substr 截斷至原長度）
    await queryRunner.query(
      `ALTER TABLE ob_list_definition ALTER COLUMN updated_by TYPE VARCHAR(20) USING SUBSTRING(updated_by, 1, 20)`,
    );
    await queryRunner.query(
      `ALTER TABLE ob_list_definition ALTER COLUMN created_by TYPE VARCHAR(20) USING SUBSTRING(created_by, 1, 20)`,
    );
    await queryRunner.query(
      `ALTER TABLE ob_empl_set ALTER COLUMN updated_by TYPE VARCHAR(10) USING SUBSTRING(updated_by, 1, 10)`,
    );
    await queryRunner.query(
      `ALTER TABLE ob_empl_set ALTER COLUMN created_by TYPE VARCHAR(10) USING SUBSTRING(created_by, 1, 10)`,
    );
    await queryRunner.query(
      `ALTER TABLE ob_dept_pct ALTER COLUMN updated_by TYPE VARCHAR(10) USING SUBSTRING(updated_by, 1, 10)`,
    );
    await queryRunner.query(
      `ALTER TABLE ob_dept_pct ALTER COLUMN created_by TYPE VARCHAR(10) USING SUBSTRING(created_by, 1, 10)`,
    );
  }
}
