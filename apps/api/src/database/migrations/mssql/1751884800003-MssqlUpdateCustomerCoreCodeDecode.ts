import { MigrationInterface, QueryRunner } from 'typeorm';
import {
  CUSTOMER_CORE_CODE_DECODE_DEFINITION,
  CUSTOMER_CORE_NEW_VERSION,
  CUSTOMER_CORE_NEW_STEP_COUNT,
  CUSTOMER_CORE_PRE_MIGRATION_VERSION,
  CUSTOMER_CORE_PRE_MIGRATION_STEP_COUNT,
  CUSTOMER_CORE_PIPELINE_NAME_EXPORT,
} from '../shared/customer-core-code-decode-definition';

/**
 * F110 / US-173（AD-E07-41 §13.6.3）— `ETL for Customer Core` pipeline definition
 * 收斂之 data-update migration（MSSQL）。
 *
 * 與 PG 版（`../1751884800003-UpdateCustomerCoreCodeDecode.ts`）邏輯完全同構，僅
 * 參數化 placeholder 不同（PG `$1,$2,...`／MSSQL `@0,@1,...`，AD-E07-38 Pattern B）。
 *
 * definition payload 由 `migrations/shared/customer-core-code-decode-definition.ts`
 * 匯入（PG／MSSQL 兩支共用同一物件參照 → JSON.stringify byte-identical，
 * I-CODEDECODE-MIGRATION-01）。`definition` 欄為 simple-json（MSSQL ntext），直接寫入
 * `JSON.stringify(...)` 字串，由 ORM 於讀取端統一反序列化。
 */
export class MssqlUpdateCustomerCoreCodeDecode1751884800003
  implements MigrationInterface
{
  name = 'MssqlUpdateCustomerCoreCodeDecode1751884800003';

  public async up(queryRunner: QueryRunner): Promise<void> {
    const rows = await queryRunner.query(
      `SELECT id, version FROM etl_pipelines WHERE name = @0 AND deleted_at IS NULL`,
      [CUSTOMER_CORE_PIPELINE_NAME_EXPORT],
    );
    if (rows.length === 0) return; // fresh-deploy：pipeline 尚未 seed，本 migration no-op
    const pipelineId = rows[0].id;
    const currentVersion = Number(rows[0].version);
    if (currentVersion >= CUSTOMER_CORE_NEW_VERSION) return; // 已套用過（冪等 guard）

    const createdByRows = await queryRunner.query(
      `SELECT created_by FROM etl_pipelines WHERE id = @0`,
      [pipelineId],
    );
    const createdBy = createdByRows[0].created_by; // 沿用既有 pipeline 之 created_by（合法 FK）

    const now = new Date();
    await queryRunner.query(
      `INSERT INTO etl_pipeline_versions (pipeline_id, version, definition, status, change_summary, created_by, created_at)
       VALUES (@0, @1, @2, @3, @4, @5, @6)`,
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
      `UPDATE etl_pipelines SET version = @0, step_count = @1, updated_at = @2 WHERE id = @3`,
      [CUSTOMER_CORE_NEW_VERSION, CUSTOMER_CORE_NEW_STEP_COUNT, now, pipelineId],
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const rows = await queryRunner.query(
      `SELECT id, version FROM etl_pipelines WHERE name = @0 AND deleted_at IS NULL`,
      [CUSTOMER_CORE_PIPELINE_NAME_EXPORT],
    );
    if (rows.length === 0) return;
    const pipelineId = rows[0].id;
    const currentVersion = Number(rows[0].version);
    if (currentVersion !== CUSTOMER_CORE_NEW_VERSION) return; // 非本 migration 造成的狀態，不動

    await queryRunner.query(
      `DELETE FROM etl_pipeline_versions WHERE pipeline_id = @0 AND version = @1`,
      [pipelineId, CUSTOMER_CORE_NEW_VERSION],
    );
    await queryRunner.query(
      `UPDATE etl_pipelines SET version = @0, step_count = @1, updated_at = @2 WHERE id = @3`,
      [
        CUSTOMER_CORE_PRE_MIGRATION_VERSION,
        CUSTOMER_CORE_PRE_MIGRATION_STEP_COUNT,
        new Date(),
        pipelineId,
      ],
    );
  }
}
