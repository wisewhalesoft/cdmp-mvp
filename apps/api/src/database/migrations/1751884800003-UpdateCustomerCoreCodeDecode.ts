import { MigrationInterface, QueryRunner } from 'typeorm';
import {
  CUSTOMER_CORE_CODE_DECODE_DEFINITION,
  CUSTOMER_CORE_NEW_VERSION,
  CUSTOMER_CORE_NEW_STEP_COUNT,
  CUSTOMER_CORE_PRE_MIGRATION_VERSION,
  CUSTOMER_CORE_PRE_MIGRATION_STEP_COUNT,
  CUSTOMER_CORE_PIPELINE_NAME_EXPORT,
} from './shared/customer-core-code-decode-definition';

/**
 * F110 / US-173（AD-E07-41 §13.6.3）— `ETL for Customer Core` pipeline definition
 * 收斂之 data-update migration（PostgreSQL）。
 *
 * 背景：`prod-data-seed.ts` 對已存在同名 pipeline 為整筆略過（不覆寫），故 fresh-deploy
 * 由 data-seed 直接以新 JSON 完整落地；但「已部署、已有舊 31-lookup definition」之既有
 * 環境不會自動更新——本 migration 即為 patch 既有環境而存在。
 *
 * 策略（§13.6.3）：新增一列 `version=14`（`status='published'`），不覆寫既有 `version=13`
 * 列。執行引擎一律 `ORDER BY version DESC LIMIT 1` 取用最新版本，故新增列即自動生效；
 * `down()` 只需刪除新增列 + 還原 `etl_pipelines` 指標欄位，無需在檔內重建/內嵌舊 31-lookup
 * JSON（I-CODEDECODE-MIGRATION-01）。
 *
 * definition payload 由 `migrations/shared/customer-core-code-decode-definition.ts`
 * 匯入（PG／MSSQL 兩支共用同一物件參照 → JSON.stringify byte-identical）。
 */
export class UpdateCustomerCoreCodeDecode1751884800003
  implements MigrationInterface
{
  name = 'UpdateCustomerCoreCodeDecode1751884800003';

  public async up(queryRunner: QueryRunner): Promise<void> {
    const rows = await queryRunner.query(
      `SELECT id, version FROM etl_pipelines WHERE name = $1 AND deleted_at IS NULL`,
      [CUSTOMER_CORE_PIPELINE_NAME_EXPORT],
    );
    if (rows.length === 0) return; // fresh-deploy：pipeline 尚未 seed，本 migration no-op
    const pipelineId = rows[0].id;
    const currentVersion = Number(rows[0].version);
    if (currentVersion >= CUSTOMER_CORE_NEW_VERSION) return; // 已套用過（冪等 guard）

    const createdByRows = await queryRunner.query(
      `SELECT created_by FROM etl_pipelines WHERE id = $1`,
      [pipelineId],
    );
    const createdBy = createdByRows[0].created_by; // 沿用既有 pipeline 之 created_by（合法 FK）

    const now = new Date();
    await queryRunner.query(
      `INSERT INTO etl_pipeline_versions (pipeline_id, version, definition, status, change_summary, created_by, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [
        pipelineId,
        CUSTOMER_CORE_NEW_VERSION,
        JSON.stringify(CUSTOMER_CORE_CODE_DECODE_DEFINITION),
        'published',
        'F110/US-173：31 個 lookup 收斂為 9 個 code_decode 節點（data-update migration）',
        createdBy,
        now,
      ],
    );
    await queryRunner.query(
      `UPDATE etl_pipelines SET version = $1, step_count = $2, updated_at = $3 WHERE id = $4`,
      [CUSTOMER_CORE_NEW_VERSION, CUSTOMER_CORE_NEW_STEP_COUNT, now, pipelineId],
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const rows = await queryRunner.query(
      `SELECT id, version FROM etl_pipelines WHERE name = $1 AND deleted_at IS NULL`,
      [CUSTOMER_CORE_PIPELINE_NAME_EXPORT],
    );
    if (rows.length === 0) return;
    const pipelineId = rows[0].id;
    const currentVersion = Number(rows[0].version);
    if (currentVersion !== CUSTOMER_CORE_NEW_VERSION) return; // 非本 migration 造成的狀態，不動

    await queryRunner.query(
      `DELETE FROM etl_pipeline_versions WHERE pipeline_id = $1 AND version = $2`,
      [pipelineId, CUSTOMER_CORE_NEW_VERSION],
    );
    await queryRunner.query(
      `UPDATE etl_pipelines SET version = $1, step_count = $2, updated_at = $3 WHERE id = $4`,
      [
        CUSTOMER_CORE_PRE_MIGRATION_VERSION,
        CUSTOMER_CORE_PRE_MIGRATION_STEP_COUNT,
        new Date(),
        pipelineId,
      ],
    );
  }
}
