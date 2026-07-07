// F076 v1.3 / 2026-05-17 / architecture-spec §E07 M06：類別型欄位可選值
// 對應 schema：1711360000000-BaselineSchema.ts（含 display_order 排序欄位）
// ⚠️ Entity 必須與 baseline migration 保持一致：任一邊改動，另一邊同步修

import { Entity, Column, PrimaryColumn } from 'typeorm';
import { dateColumnType, boolColumnType } from '@/common/database/column-types';

/**
 * pooldata_field_option — 類別型欄位可選值（F075 categorical 欄位之子表）
 *
 * 為 F050 新名單定義表單多選元件之動態來源；複合 PK (column_name, option_value)；
 * 部長 / Admin 可寫入，處長唯讀。
 *
 * 關鍵設計（spec §5.0 / §6）：
 *   - 複合 PK：(column_name, option_value)
 *   - FK：column_name → pooldata_field_whitelist.column_name（ON DELETE CASCADE）
 *   - is_active：軟刪除旗標；停用後不回溯既有名單條件（BR-4）
 *   - deactivation_reason：軟停用原因 ENUM（v1.3 補修 / PO 決議 F076-C 落地）
 *       'manual'              → 透過 §5.4 deactivate 端點手動停用
 *       'field_type_changed'  → F075 PATCH 將 field_type 從 categorical 切離時批次軟停用
 *       is_active=true → NULL；is_active=false → 必填
 *
 * 日期欄位採 `dateColumnType` helper（PostgreSQL timestamp / SQLite datetime）。
 */
@Entity('pooldata_field_option')
export class PooldataFieldOption {
  @PrimaryColumn({ name: 'column_name', type: 'varchar', length: 64 })
  column_name: string;

  @PrimaryColumn({ name: 'option_value', type: 'varchar', length: 64 })
  option_value: string;

  @Column({ name: 'option_label', type: 'varchar', length: 100 })
  option_label: string;

  /**
   * 排序功能（F076 持久化排序）；display_order = 陣列索引，數值越小越靠前。
   * 新增選項預設接續在既有最大值之後（append at end）；由 §5.5 reorder 端點批次覆寫。
   */
  @Column({ name: 'display_order', type: 'int', default: 0 })
  display_order: number;

  @Column({ name: 'is_active', type: boolColumnType, default: true })
  is_active: boolean;

  /**
   * 軟停用原因 ENUM（F076 v1.3 §5.0）
   *   - 'manual' / 'field_type_changed'
   *   - is_active=true 時為 NULL
   *   - PostgreSQL CHECK constraint；SQLite 由應用層保證
   */
  @Column({
    name: 'deactivation_reason',
    type: 'varchar',
    length: 30,
    nullable: true,
  })
  deactivation_reason: 'manual' | 'field_type_changed' | null;

  @Column({ name: 'created_at', type: dateColumnType })
  created_at: Date;

  @Column({ name: 'updated_at', type: dateColumnType })
  updated_at: Date;
}
