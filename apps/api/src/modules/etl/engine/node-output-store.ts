/**
 * F042: NodeOutputStore
 * 管理 temp table 引用，支援引用計數以便及時 DROP
 * In-DB SQL Strategy: 記錄所有 temp table 名稱，供 cleanup 時 DROP
 */

import { DataSet } from './types';
import { QueryRunner } from 'typeorm';

export class NodeOutputStore {
  private store = new Map<string, DataSet>();

  set(nodeId: string, dataset: DataSet): void {
    this.store.set(nodeId, dataset);
  }

  get(nodeId: string): DataSet | undefined {
    return this.store.get(nodeId);
  }

  /**
   * 釋放單個節點的 temp table 引用（不做 SQL DROP，由 cleanupAll 統一處理）
   */
  release(nodeId: string): void {
    this.store.delete(nodeId);
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
   * 清理所有 temp tables（DROP TABLE IF EXISTS）
   */
  async cleanupAll(queryRunner: QueryRunner): Promise<void> {
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
  }
}
