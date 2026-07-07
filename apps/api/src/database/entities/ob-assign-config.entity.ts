// 對應 migration: 1711360000130-CreateObAssignConfigSetAndUserFlag.ts
// AD-E07-5: Key-Value 全域設定表（CR 回分等開關）

import { Entity, PrimaryColumn, Column } from 'typeorm';
import {
  dateColumnType,
  uuidColumnType,
  longTextColumnType,
  longTextColumnLength,
} from '@/common/database/column-types';

/**
 * [DEPRECATED-F102] ob_assign_config — Key-Value 全域設定表。
 *
 * F102 / AD-E07-30（US-154）：全域 CR 旗標 `cr_reassignment_enabled` 已正式廢棄；CR 開關唯一
 * 有效來源 = `ob_list_definition.cr_enabled`（per-list）。本 entity 與表**不 DROP**（保 TypeORM
 * schema sync 安全 + 其他 config_key 待查，OQ-4 裁定 I-CR-CONFIG-DEPR-01）；無任何 service /
 * controller 讀取 `cr_reassignment_enabled`（AC-12 靜態掃描為 0 = DoD 門檻）。
 *
 * 後續 sprint 查 `SELECT DISTINCT config_key FROM ob_assign_config`；若無其他有效 key，以獨立
 * migration DROP TABLE + 廢 entity（不在 F102 範疇）。
 */
@Entity('ob_assign_config')
export class ObAssignConfig {
  @PrimaryColumn({ name: 'config_key', type: 'varchar', length: 50 })
  config_key: string;

  @Column({ name: 'config_value', type: longTextColumnType, length: longTextColumnLength })
  config_value: string;

  // F-1（AD-E07-39 §0）：裸 'timestamp' 於 MSSQL = rowversion（唯讀 8-byte 版本戳記，非日期）→ 必改 dateColumnType。
  @Column({ name: 'updated_at', type: dateColumnType, default: () => 'CURRENT_TIMESTAMP' })
  updated_at: Date;

  @Column({ name: 'updated_by', type: uuidColumnType, nullable: true })
  updated_by: string | null;

  @Column({ name: 'description', type: longTextColumnType, length: longTextColumnLength, nullable: true })
  description: string | null;
}
