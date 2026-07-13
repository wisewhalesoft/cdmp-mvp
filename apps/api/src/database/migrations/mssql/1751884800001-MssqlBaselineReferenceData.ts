import { MigrationInterface, QueryRunner } from 'typeorm';
import {
  BASELINE_ROLES,
  BASELINE_WHITELIST,
  BASELINE_OPTIONS,
} from '../../seeds/baseline-reference-data';

/**
 * AD-E07-39 P1b3 — MSSQL baseline 參考/設定資料（PG `1711360000001-BaselineReferenceData.ts` 之 MSSQL 對應）。
 *
 * PG-only 的 reference-data migration 使用 `INSERT INTO public.…`、`ON CONFLICT DO NOTHING`、
 * 裸布林 `true`/`false`、`::int` cast 等 PG 專屬語法，於 MSSQL 無法執行。本 migration 以共用資料模組
 * `seeds/baseline-reference-data.ts`（由 PG migration 忠實解析產生）為單一事實來源，改以：
 *   - 參數化 INSERT（@0..；中文值由 tedious NVarChar → varchar 隱式轉換，逐字元 round-trip，見 P1b1 CHI）
 *   - 布林 → JS boolean 綁定（tedious → bit）
 *   - 時間戳 → JS Date 綁定（→ datetime2）
 *   - 冪等：roles 逐筆 `IF NOT EXISTS`；whitelist / option 僅於空表時插入（比照 PG 版語意）
 *
 * 排序：檔名 timestamp 1751884800001 > schema baseline 1751884800000 → migration:run 於建表後才灌資料。
 * 灌入後筆數：roles 2 / pooldata_field_whitelist 20 / pooldata_field_option 462
 *   （以 dev CDMP 為 ground truth；2026-07 已硬刪除 brand_no/list_type 兩欄。baseline 與 data-seed 之
 *    pooldata-field-*.json 保持同一份 dev 現況，兩者筆數一致）。
 */
export class MssqlBaselineReferenceData1751884800001 implements MigrationInterface {
  name = 'MssqlBaselineReferenceData1751884800001';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // roles（冪等：逐筆 IF NOT EXISTS，對應 PG 版 ON CONFLICT (role_code) DO NOTHING）。
    for (const r of BASELINE_ROLES) {
      const existing = await queryRunner.query(
        `SELECT TOP(1) role_code FROM roles WHERE role_code = @0`,
        [r.role_code],
      );
      if (existing.length === 0) {
        await queryRunner.query(
          `INSERT INTO roles (role_code, display_name, alias, type) VALUES (@0, @1, @2, @3)`,
          [r.role_code, r.display_name, r.alias, r.type],
        );
      }
    }

    // pooldata_field_whitelist：僅於空表時插入（比照 PG 版；migration 追蹤本已保證單次）。
    const wlCount = await queryRunner.query(`SELECT COUNT(*) AS c FROM pooldata_field_whitelist`);
    if (Number(wlCount[0].c) === 0) {
      for (const w of BASELINE_WHITELIST) {
        await queryRunner.query(
          `INSERT INTO pooldata_field_whitelist
             (column_name, display_name, field_type, is_active, created_at, updated_at, is_system_fixed, data_source)
           VALUES (@0, @1, @2, @3, @4, @5, @6, @7)`,
          [
            w.column_name,
            w.display_name,
            w.field_type,
            w.is_active,
            new Date(w.created_at),
            new Date(w.updated_at),
            w.is_system_fixed,
            w.data_source,
          ],
        );
      }
    }

    // pooldata_field_option：僅於空表時插入（比照 PG 版）。display_order 由 DB 預設 0。
    const optCount = await queryRunner.query(`SELECT COUNT(*) AS c FROM pooldata_field_option`);
    if (Number(optCount[0].c) === 0) {
      for (const o of BASELINE_OPTIONS) {
        await queryRunner.query(
          `INSERT INTO pooldata_field_option
             (column_name, option_value, option_label, is_active, deactivation_reason, created_at, updated_at)
           VALUES (@0, @1, @2, @3, @4, @5, @6)`,
          [
            o.column_name,
            o.option_value,
            o.option_label,
            o.is_active,
            o.deactivation_reason,
            new Date(o.created_at),
            new Date(o.updated_at),
          ],
        );
      }
    }
  }

  public async down(): Promise<void> {
    // baseline 參考資料不提供獨立 down（比照 PG 版；schema down 已 DROP TABLE）。
  }
}
