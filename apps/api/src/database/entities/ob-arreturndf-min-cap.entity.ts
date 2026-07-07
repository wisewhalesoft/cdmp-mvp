// 對應 migration：apps/api/src/database/migrations/1711360000140-CreateObArreturndfMinCap.ts
// 來源：reference/TableSchema/OB/OB_ARRETURNDF_MIN_CAP.sql
// ⚠️ Entity 必須與 migration 保持一致：任一邊改動，另一邊同步修

import { Entity, Column, PrimaryColumn } from 'typeorm';
import { dateColumnType } from '@/common/database/column-types';

@Entity('ob_arreturndf_min_cap')
export class ObArreturndfMinCap {
  // 遷移時補建 PK（[ASSUMPTION] 原表無 PK constraint）
  @PrimaryColumn({ name: 'appl_no', type: 'varchar', length: 20 })
  appl_no: string;

  @Column({ name: 'add_un_capital', type: 'numeric', precision: 15, scale: 0, nullable: true })
  add_un_capital: string | null; // numeric → string in TypeORM (避免 JS number 精度損失)

  // F-1（AD-E07-39 §0）：裸 'timestamp' 於 MSSQL = rowversion（唯讀 8-byte 版本戳記，非日期）→ 必改 dateColumnType。
  @Column({ name: '_cdmp_extracted_at', type: dateColumnType, nullable: false })
  _cdmp_extracted_at: Date;
}
