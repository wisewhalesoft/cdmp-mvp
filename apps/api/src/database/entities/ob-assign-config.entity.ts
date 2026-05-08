// 對應 migration: 1711360000130-CreateObAssignConfigSetAndUserFlag.ts
// AD-E07-5: Key-Value 全域設定表（CR 回分等開關）

import { Entity, PrimaryColumn, Column } from 'typeorm';

@Entity('ob_assign_config')
export class ObAssignConfig {
  @PrimaryColumn({ name: 'config_key', type: 'varchar', length: 50 })
  config_key: string;

  @Column({ name: 'config_value', type: 'text' })
  config_value: string;

  @Column({ name: 'updated_at', type: 'timestamp', default: () => 'CURRENT_TIMESTAMP' })
  updated_at: Date;

  @Column({ name: 'updated_by', type: 'uuid', nullable: true })
  updated_by: string | null;

  @Column({ name: 'description', type: 'text', nullable: true })
  description: string | null;
}
