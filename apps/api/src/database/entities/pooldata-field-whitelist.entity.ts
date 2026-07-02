// F075 v1.3 / 2026-05-17 / architecture-spec §E07 M06：POOLDATA 篩選欄位白名單
// 對應 migration：1711360000200-CreatePooldataFieldWhitelist.ts
// ⚠️ Entity 必須與 migration 保持一致：任一邊改動，另一邊同步修

import { Entity, Column, PrimaryColumn } from 'typeorm';
import { dateColumnType } from '@/common/database/column-types';

/**
 * pooldata_field_whitelist — POOLDATA 篩選欄位白名單（含 field_type metadata）
 *
 * 為 F050 新名單定義表單條件篩選欄位之動態來源（取代 v1.x 硬編碼欄位）；
 * 部長 / Admin 可寫入，處長唯讀。
 *
 * 關鍵設計（spec §5.x / §6）：
 *   - Natural PK：column_name VARCHAR(64)（OBPOOLDATA 欄位名稱字串，不維護 FK 至 OBPOOLDATA）
 *   - field_type：'numeric' / 'categorical' / 'date'（PostgreSQL CHECK；SQLite 由應用層保證）
 *   - is_active：軟刪除旗標；停用後不回溯既有名單條件（BR-4）
 *   - 日期欄位採 `dateColumnType` helper（PostgreSQL timestamp / SQLite datetime）
 *
 * F076-C 軟停用級聯（F075 v1.3 BR-7）：field_type 從 categorical 切離時，
 *   service 層同 transaction 批次 SET pooldata_field_option.is_active=false
 *   + deactivation_reason='field_type_changed'；不採 DB CASCADE，由應用層保證。
 */
@Entity('pooldata_field_whitelist')
export class PooldataFieldWhitelist {
  @PrimaryColumn({ name: 'column_name', type: 'varchar', length: 64 })
  column_name: string;

  @Column({ name: 'display_name', type: 'varchar', length: 100 })
  display_name: string;

  @Column({ name: 'field_type', type: 'varchar', length: 20 })
  field_type: 'numeric' | 'categorical' | 'date';

  @Column({ name: 'is_active', type: 'boolean', default: true })
  is_active: boolean;

  /**
   * F109 / US-172 / AD-E07-37 §4.1：篩選欄位資料來源。
   *
   * `'ob_pool_data'`（案件資料，既有 7 筆 + 經 API 新增者一律 DEFAULT）/
   * `'customer_core'`（客戶資料，F109 seed 之 8 欄）。
   *
   * 對齊 m305 migration（PG: VARCHAR(20) NOT NULL DEFAULT 'ob_pool_data'
   *   + CHECK (data_source IN ('ob_pool_data','customer_core')) / SQLite: 無 CHECK，應用層保證）。
   *
   * 驅動：M06 列表「資料來源」欄 + F050/F051「新增條件」選單分組（依 dataSource 旗標渲染）；
   *   Stage 1 條件式 LEFT JOIN customer_core 之 data_source 判定固化來源（stampConditionDataSource）。
   */
  @Column({
    name: 'data_source',
    type: 'varchar',
    length: 20,
    default: 'ob_pool_data',
  })
  dataSource: 'ob_pool_data' | 'customer_core';

  /**
   * US-144 / AD-E07-18 §18.12.3：系統固定篩選欄位旗標。
   *
   * `is_system_fixed = true` 之欄位（目前唯一：`best_case`）：
   *   - createList / updateList 強制注入其固定值（SYSTEM_FIXED_VALUE_MAP；best_case → ['Y']）
   *   - validateConditionPayload 最低條件數計算排除此欄位（§18.12.8）
   *   - M06 管理頁不可停用（service 層 deactivation guard 回 422
   *     SYSTEM_FIXED_FIELD_CANNOT_DEACTIVATE）
   *
   * 對齊 m295 migration（PG: BOOLEAN NOT NULL DEFAULT false / SQLite: INTEGER NOT NULL DEFAULT 0）。
   */
  @Column({ name: 'is_system_fixed', type: 'boolean', default: false })
  isSystemFixed: boolean;

  @Column({ name: 'created_at', type: dateColumnType })
  created_at: Date;

  @Column({ name: 'updated_at', type: dateColumnType })
  updated_at: Date;
}
