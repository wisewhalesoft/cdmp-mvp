import { MigrationInterface, Logger as _Logger, QueryRunner } from 'typeorm';
import { Logger } from '@nestjs/common';

/**
 * m282 / F050 v2.1 重構（AD-E07-18 §18.3 M2 / 拍板 2 一次性 backfill）
 *
 * 將 ob_list_definition 既有名單的 5 個 backward-compat entity column
 *   （prod_kind / caseyear / spec_tp / case_status / settle_src，`$$` 分隔字串）
 * 轉換為 condition_payload JSONB；只處理 condition_payload IS NULL 之列（冪等）。
 *
 * 邏輯（§18.6 衍生規則反向）：
 *   - 每欄位以 `$$` 分隔再 filter(Boolean) 取非空 token
 *   - 有 token → 加入 conditions: [{ columnName, fieldType: 'categorical', values: [...] }]
 *   - 全 5 欄均空 → conditions=[] + _backfill_empty: true（OQ-TEST-002 / §18.5.2）
 *
 * SQLite / PG 處理差異：
 *   - PG：UPDATE ... SET condition_payload = $1::jsonb
 *   - SQLite：UPDATE ... SET condition_payload = ?（simple-json TEXT）
 *
 * 對應 test spec：MT-M2-001 / 002 / 003 / 005 / 006
 *   （MT-M2-004 SKIP — entity 無 numeric 欄位）
 */
export class BackfillListDefinitionConditionPayload1711360000282
  implements MigrationInterface
{
  name = 'BackfillListDefinitionConditionPayload1711360000282';

  private readonly logger = new Logger(
    BackfillListDefinitionConditionPayload1711360000282.name,
  );

  public async up(queryRunner: QueryRunner): Promise<void> {
    const isSqlite = process.env.DB_TYPE === 'sqlite';

    // 1. 取出所有 condition_payload IS NULL 之列
    const rows = await queryRunner.query(
      `SELECT list_no, prod_kind, caseyear, spec_tp, case_status, settle_src
         FROM ob_list_definition
        WHERE condition_payload IS NULL`,
    );

    if (!Array.isArray(rows) || rows.length === 0) {
      this.logger.log('[M2 backfill] 無需 backfill（condition_payload 全部已填）');
      return;
    }
    this.logger.log(`[M2 backfill] 共 ${rows.length} 筆待處理`);

    let processed = 0;
    let emptyCount = 0;

    for (const row of rows) {
      const conditions: Array<{
        columnName: string;
        fieldType: 'categorical';
        values: string[];
      }> = [];
      const buildCategorical = (
        colName: string,
        raw: string | null | undefined,
      ): void => {
        if (raw === null || raw === undefined) return;
        const values = String(raw)
          .split('$$')
          .filter((v) => v.length > 0);
        if (values.length === 0) return;
        conditions.push({
          columnName: colName,
          fieldType: 'categorical',
          values,
        });
      };

      buildCategorical('prod_kind', row.prod_kind);
      buildCategorical('caseyear', row.caseyear);
      buildCategorical('spec_tp', row.spec_tp);
      buildCategorical('case_status', row.case_status);
      buildCategorical('settle_src', row.settle_src);

      let payloadObj: Record<string, unknown>;
      if (conditions.length === 0) {
        payloadObj = { conditions: [], logic: 'AND', _backfill_empty: true };
        emptyCount++;
        this.logger.warn(
          `[M2 backfill] list ${row.list_no} 5 個 entity column 全空 → _backfill_empty=true`,
        );
      } else {
        payloadObj = { conditions, logic: 'AND' };
      }

      const jsonStr = JSON.stringify(payloadObj);

      if (isSqlite) {
        await queryRunner.query(
          `UPDATE ob_list_definition SET condition_payload = ? WHERE list_no = ?`,
          [jsonStr, row.list_no],
        );
      } else {
        await queryRunner.query(
          `UPDATE ob_list_definition SET condition_payload = $1::jsonb WHERE list_no = $2`,
          [jsonStr, row.list_no],
        );
      }

      processed++;
      if (processed % 100 === 0) {
        this.logger.log(`[M2 backfill] 進度 ${processed}/${rows.length}`);
      }
    }

    this.logger.log(
      `[M2 backfill] 完成：共 ${processed} 筆；其中 ${emptyCount} 筆標記 _backfill_empty=true`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // down：清除全部 condition_payload；m281 down 會 DROP 欄位
    await queryRunner.query(
      `UPDATE ob_list_definition SET condition_payload = NULL`,
    );
  }
}
