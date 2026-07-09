/**
 * F042: NodeOutputStore
 * 管理 temp table 引用，支援引用計數以便及時 DROP
 * In-DB SQL Strategy: 記錄所有 temp table 名稱，供 cleanup 時 DROP
 */

import { DataSet } from './types';
import { QueryRunner } from 'typeorm';
import * as mssqlTempTable from './handlers/mssql/temp-table.util';

export class NodeOutputStore {
  private store = new Map<string, DataSet>();

  /**
   * AD-E07-41 P4a（CLEANUP-003 決策）：累積「本次 pipeline run 曾建立過」的暫存表名。
   *
   * `store` 於 `release()`（下游消費完上游後）會移除引用，故 `cleanupAll` 走 `store` 只看得到
   * 尚未釋放的節點。PG `CREATE TEMP TABLE` 於 session/交易結束自動回收，已釋放的中間表不需再顯式 DROP；
   * 但 MSSQL `##global temp` 於連線池 `release()` 後仍殘留（P4-spike-2 POINT4 實證），必須把
   * **所有曾建立**的 `##` 表都顯式清掉，否則已釋放的中間節點暫存表會洩漏到 session 結束。
   * 因此 mssql 分支改走此累積集合；PG/sqlite 分支維持原行為（走 `store`）逐位元組不變。
   */
  private createdTables = new Set<string>();

  set(nodeId: string, dataset: DataSet): void {
    this.store.set(nodeId, dataset);
    if (dataset.tempTable) {
      this.createdTables.add(dataset.tempTable);
    }
  }

  get(nodeId: string): DataSet | undefined {
    return this.store.get(nodeId);
  }

  /**
   * 釋放單個節點的 temp table 引用。
   *
   * P6c / I-MSSQL-TEMPTABLE-EAGER-DROP-01：MSSQL `##global temp` 累積在 **tempdb**，若延到
   * `cleanupAll`（pipeline 結束）才清，大 pipeline 於整個 run 期間會**同時保留全部節點的暫存表**
   * → tempdb 峰值 = Σ(所有節點輸出)，3.6M 列 × NVARCHAR(MAX) 直接撐爆 tempdb（P6c 實測第 2 節點即爆）。
   * 故本函式於 refcount 歸零（`releaseUpstreamIfDone`＝所有下游都消費完上游）之當下**立即 DROP**，
   * 把 tempdb 峰值壓到「同時存活的 ~2–3 張」。DROP 成功後從 `createdTables` 移除，避免 `cleanupAll`
   * 重複清（否則 CLEANUP-001「各表恰清 1 次」不成立）。DROP 失敗不阻斷 pipeline——保留於 `createdTables`，
   * 由結束時的 `cleanupAll` 再試（`IF OBJECT_ID` 冪等）。
   *
   * PG/sqlite 維持原行為（僅移除記憶體引用；PG `CREATE TEMP TABLE` 由 session/交易自動回收，
   * `cleanupAll` 為安全網）逐位元組不變——`store.delete` 於任何 await 前同步完成。
   */
  async release(nodeId: string, queryRunner?: QueryRunner): Promise<void> {
    const ds = this.store.get(nodeId);
    this.store.delete(nodeId);
    if (
      process.env.DB_TYPE === 'mssql' &&
      queryRunner &&
      ds?.tempTable &&
      this.createdTables.has(ds.tempTable)
    ) {
      try {
        await mssqlTempTable.dropMssqlTempTableIfExists(queryRunner, ds.tempTable);
        this.createdTables.delete(ds.tempTable);
      } catch {
        // 即時 DROP 失敗不阻斷 pipeline；保留於 createdTables，cleanupAll 結束時再試。
      }
    }
  }

  has(nodeId: string): boolean {
    return this.store.has(nodeId);
  }

  get size(): number {
    return this.store.size;
  }

  /**
   * 取得所有 temp table 名稱（供 cleanup 使用）
   */
  getAllTempTables(): string[] {
    const tables: string[] = [];
    for (const ds of this.store.values()) {
      if (ds.tempTable) {
        tables.push(ds.tempTable);
      }
    }
    return tables;
  }

  /**
   * 清理所有 temp tables（成功/失敗兩路徑皆由 pipeline-runner 呼叫）。
   *
   * - MSSQL（`DB_TYPE==='mssql'`）：顯式 `dropMssqlTempTableIfExists` 清掉**所有曾建立**的 `##` 表
   *   （I-MSSQL-TEMPTABLE-CLEANUP-01；含已 `release()` 的中間節點，見 `createdTables` 註解）。
   * - PG/sqlite：維持原行為（僅清 `store` 內尚存者，`DROP TABLE IF EXISTS "..."`）逐位元組不變。
   */
  async cleanupAll(queryRunner: QueryRunner): Promise<void> {
    if (process.env.DB_TYPE === 'mssql') {
      for (const table of this.createdTables) {
        try {
          await mssqlTempTable.dropMssqlTempTableIfExists(queryRunner, table);
        } catch {
          // Ignore errors during cleanup (table may already be dropped/auto-reclaimed)
        }
      }
      this.createdTables.clear();
      this.store.clear();
      return;
    }

    const tables = this.getAllTempTables();
    for (const table of tables) {
      try {
        await queryRunner.query(`DROP TABLE IF EXISTS "${table}"`);
      } catch {
        // Ignore errors during cleanup (table may already be dropped)
      }
    }
    this.store.clear();
  }

  /**
   * 僅清理記憶體引用（不做 SQL DROP）
   */
  clear(): void {
    this.store.clear();
    this.createdTables.clear();
  }
}
