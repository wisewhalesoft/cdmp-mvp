// 對應 migration：apps/api/src/database/migrations/1711360000140-CreateObArreturndfMinCap.ts
// 來源：reference/TableSchema/OB/OB_ARRETURNDF_MIN_CAP.sql
// ⚠️ Entity 必須與 migration 保持一致：任一邊改動，另一邊同步修

import { Entity, Column, PrimaryColumn } from 'typeorm';

@Entity('ob_arreturndf_min_cap')
export class ObArreturndfMinCap {
  // 遷移時補建 PK（[ASSUMPTION] 原表無 PK constraint）
  @PrimaryColumn({ name: 'appl_no', type: 'varchar', length: 20 })
  appl_no: string;

  @Column({ name: 'add_un_capital', type: 'numeric', precision: 15, scale: 0, nullable: true })
  add_un_capital: string | null; // numeric → string in TypeORM (避免 JS number 精度損失)

  @Column({ name: '_cdmp_extracted_at', type: 'timestamp', nullable: false })
  _cdmp_extracted_at: Date;
}
