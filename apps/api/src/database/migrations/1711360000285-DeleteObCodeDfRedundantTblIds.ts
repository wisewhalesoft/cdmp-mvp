import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * m285 / F050 v2.1 重構（AD-E07-18 §18.3 M5 / §18.7 / §18.2.7 / §18.10 R7 / GAP-LIST §E7）
 *
 * ⚠️ 高風險：刪除 ob_code_df 中與 F068 廢除模組相關之三組 tbl_id 紀錄。
 *
 * ⚠️ DEPLOYMENT GATE（§18.2.7 拍板）：本 migration **必須與 F069 service 改讀
 * pooldata_field_option 同一 commit / 同一 PR 部署**（card-type.service.ts +
 * prod-kind.helper.ts 已於本 commit 同步改寫）。
 *
 * up() 邏輯：
 *   1. Pre-condition：讀 pooldata_field_option 確認 column_name IN
 *      ('prod_kind', 'spec_tp', 'case_status') 三組各有 is_active=true 之資料；
 *      缺任一 throw Error 阻止繼續（防 F069 stale 部署）
 *   2. DELETE FROM ob_code_df WHERE tbl_id IN ('PROD_KIND', 'SPEC_TP', 'CASE_STATUS')
 *      → C2 紅線：tbl_id 為英文常數（m150 轉碼後值），禁止使用數字 '01' / '02' / '22'
 *
 * down() 邏輯（partial restore for CI rollback only）：
 *   - 從 pooldata_field_option 反向 INSERT 回 ob_code_df，map 對照：
 *       'prod_kind'   → 'PROD_KIND'
 *       'spec_tp'     → 'SPEC_TP'
 *       'case_status' → 'CASE_STATUS'
 *   - production rollback 須從 DB snapshot 還原（down 為 best-effort，不還原 stadt/enddt 精確值）
 *
 * Idempotency：
 *   - DELETE 0 rows 不報錯
 *   - 第二次 up() 之 pre-condition 仍 PASS（option 資料已 seed）
 *   - DELETE 之後 ob_code_df 三組已空，第二次 DELETE 0 affected
 *
 * 對應 test spec：MT-M5-001 / MT-M5-002 / MT-M5-003 / MT-M5-004 / MT-M5-005 / MT-M5-006 /
 *   TS-F068-DEP-007
 */
export class DeleteObCodeDfRedundantTblIds1711360000285
  implements MigrationInterface
{
  name = 'DeleteObCodeDfRedundantTblIds1711360000285';

  /**
   * pooldata_field_option.column_name → ob_code_df.tbl_id 映射（與 m150 轉碼一致）
   */
  private static readonly COLUMN_TO_TBL_ID: ReadonlyArray<{
    column_name: string;
    tbl_id: 'PROD_KIND' | 'SPEC_TP' | 'CASE_STATUS';
  }> = [
    { column_name: 'prod_kind', tbl_id: 'PROD_KIND' },
    { column_name: 'spec_tp', tbl_id: 'SPEC_TP' },
    { column_name: 'case_status', tbl_id: 'CASE_STATUS' },
  ];

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Step 1: Pre-condition — 三欄各須有 active 資料
    for (const { column_name } of DeleteObCodeDfRedundantTblIds1711360000285.COLUMN_TO_TBL_ID) {
      const result = await queryRunner.query(
        `SELECT COUNT(*) AS cnt FROM pooldata_field_option
          WHERE column_name = '${column_name}' AND is_active = ${
          process.env.DB_TYPE === 'sqlite' ? '1' : 'TRUE'
        }`,
      );
      const cnt = Number(
        result?.[0]?.cnt ?? result?.[0]?.count ?? Object.values(result?.[0] ?? {})[0] ?? 0,
      );
      if (cnt === 0) {
        throw new Error(
          `M5 pre-condition failed: pooldata_field_option has no active rows for column_name='${column_name}'. ` +
            `Run M3 (spec_tp) / M4 (case_status) and verify prod_kind seed (m22 / m280) before executing M5. ` +
            `M5 is part of the F069 deployment gate (AD-E07-18 §18.2.7).`,
        );
      }
    }

    // Step 2: DELETE — C2 紅線：tbl_id 為英文常數
    await queryRunner.query(
      `DELETE FROM ob_code_df WHERE tbl_id IN ('PROD_KIND', 'SPEC_TP', 'CASE_STATUS')`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Partial restore（CI rollback only — production 須從 DB snapshot 還原）
    for (const { column_name, tbl_id } of DeleteObCodeDfRedundantTblIds1711360000285.COLUMN_TO_TBL_ID) {
      const rows = await queryRunner.query(
        `SELECT option_value, option_label FROM pooldata_field_option WHERE column_name = '${column_name}'`,
      );
      if (!Array.isArray(rows)) continue;

      for (const r of rows) {
        const optionValue = String(r.option_value ?? '').replace(/'/g, "''");
        const optionLabel = String(r.option_label ?? '').replace(/'/g, "''");
        const insertSql =
          process.env.DB_TYPE === 'sqlite'
            ? `INSERT OR IGNORE INTO ob_code_df
                 (system_id, tbl_id, tbl_cd, tbl_desc1, tbl_desc2, stadt, enddt)
               VALUES ('OB', '${tbl_id}', '${optionValue}', '${optionLabel}', NULL, '20000101', '20991231')`
            : `INSERT INTO ob_code_df
                 (system_id, tbl_id, tbl_cd, tbl_desc1, tbl_desc2, stadt, enddt)
               VALUES ('OB', '${tbl_id}', '${optionValue}', '${optionLabel}', NULL, '20000101', '20991231')
               ON CONFLICT (system_id, tbl_id, tbl_cd) DO NOTHING`;
        await queryRunner.query(insertSql);
      }
    }
  }
}
