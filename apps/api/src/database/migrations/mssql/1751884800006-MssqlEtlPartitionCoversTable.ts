import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * partition_replace 之 `partitionCoversTable` 旗標補寫 migration（MSSQL）。
 *
 * ## 為什麼需要這支 migration
 *
 * 旗標已加入 seed（`seeds/data/etl-pipelines.json`），但 `seedEtlPipelines` 對既有
 * pipeline 是「依 name 存在即 SKIP」，故 seed 只對全新環境生效。執行期讀的是
 * `etl_pipeline_versions.definition` 這個已存起來的 JSON blob，既有環境不補寫就仍走
 * 逐列 DELETE。
 *
 * ## 事故背景
 *
 * 正式環境 CDMP_log 為 20GB 且 `max_size == size`（已無成長空間）。
 * `ob_pool_data_list` 的 partition_replace 於單一交易內執行
 * `DELETE WHERE data_source='etl_load'`（819 萬列、`data_source` 無索引）＋
 * `INSERT…SELECT`（819 萬列），兩者皆完整記錄、合計約 30GB 且直到 commit 才釋放 log →
 * `The transaction log for database 'CDMP' is full due to 'ACTIVE_TRANSACTION'`（9002）。
 * 旗標為真時清除步驟改走 TRUNCATE（最小化記錄），搭配 handler 的 `WITH (TABLOCK)`
 * 使 SIMPLE recovery 下兩步皆最小化記錄。
 *
 * ## 定位方式：targetTable，不是 pipeline 顯示名
 *
 * pipeline 顯示名可由使用者於 UI 改動，故一律以 `definition.nodes[].data.targetTable`
 * 定位（既有慣例）。白名單只含**已逐表查證**確為單一來源的目標表：
 *   - `ob_pool_data_list`：v2.0 單源化後月名單分派改寫 `ob_monthly_run_result`；
 *     正式環境 `SELECT data_source, COUNT(*) GROUP BY data_source` 回空（表為空）。
 *   - `customer_financial`：全 codebase 僅 ETL target-load 一個寫入者，其餘引用皆唯讀；
 *     無 FK 參考；正式環境同查詢亦回空。
 * 兩表皆無 FK 參考（TRUNCATE 之先決條件）。
 *
 * ## 冪等
 *
 * 逐版本比對，已為 true 則不寫入；無相符 pipeline（fresh deploy，尚未 seed）則 no-op。
 */
export class MssqlEtlPartitionCoversTable1751884800006
  implements MigrationInterface
{
  name = 'MssqlEtlPartitionCoversTable1751884800006';

  /** 已查證為單一來源、分區即全表的 target_load 目標表。 */
  private static readonly COVERS_TABLE_TARGETS = new Set([
    'ob_pool_data_list',
    'customer_financial',
  ]);

  public async up(queryRunner: QueryRunner): Promise<void> {
    await this.apply(queryRunner, true);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await this.apply(queryRunner, false);
  }

  /**
   * 掃描所有未軟刪 pipeline 的**全部**版本，對符合白名單的 partition_replace
   * target_load 節點設定／移除旗標。
   *
   * 補寫全部版本（而非僅最新版）：舊版本可能被重新發佈，屆時會再次帶回逐列 DELETE。
   * 旗標描述的是「目標表是單一來源」這個表層事實，與 definition 的版本無關。
   */
  private async apply(queryRunner: QueryRunner, enable: boolean): Promise<void> {
    const rows: Array<{ id: string; definition: string | null }> =
      await queryRunner.query(
        `SELECT v.id, v.definition
           FROM etl_pipeline_versions v
           JOIN etl_pipelines p ON p.id = v.pipeline_id
          WHERE p.deleted_at IS NULL`,
      );

    let patched = 0;
    for (const row of rows) {
      if (!row.definition) continue;

      let definition: { nodes?: Array<{ data?: Record<string, unknown> }> };
      try {
        definition =
          typeof row.definition === 'string'
            ? JSON.parse(row.definition)
            : (row.definition as any);
      } catch {
        // 非預期內容不阻擋 migration（其他版本仍需補寫）；該版本維持原狀。
        continue;
      }
      if (!Array.isArray(definition.nodes)) continue;

      let changed = false;
      for (const node of definition.nodes) {
        const data = node?.data;
        if (!data) continue;
        if (data.nodeType !== 'target_load') continue;
        if (data.loadMode !== 'partition_replace') continue;
        if (
          !MssqlEtlPartitionCoversTable1751884800006.COVERS_TABLE_TARGETS.has(
            String(data.targetTable),
          )
        ) {
          continue;
        }

        if (enable) {
          if (data.partitionCoversTable === true) continue; // 冪等
          data.partitionCoversTable = true;
          changed = true;
        } else {
          if (!('partitionCoversTable' in data)) continue; // 冪等
          delete data.partitionCoversTable;
          changed = true;
        }
      }

      if (!changed) continue;

      // definition 欄為 simple-json（MSSQL ntext）：寫入 JSON.stringify 字串，
      // 由 ORM 於讀取端統一反序列化（沿用 1751884800003 之慣例）。
      await queryRunner.query(
        `UPDATE etl_pipeline_versions SET definition = @0 WHERE id = @1`,
        [JSON.stringify(definition), row.id],
      );
      patched++;
    }

    if (patched > 0) {
      console.log(
        `  MssqlEtlPartitionCoversTable: ${enable ? '補寫' : '移除'} partitionCoversTable 於 ${patched} 個 pipeline 版本`,
      );
    }
  }
}
