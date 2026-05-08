// 對應 migration: 1711360000130-CreateObAssignConfigSetAndUserFlag.ts
// AD-E07-9: L3 系統產出表（每月 Stage 0 重新計算寫入）

import { Entity, PrimaryGeneratedColumn, Column, Index, PrimaryColumn } from 'typeorm';

@Index('idx_ob_assign_set_workdt_list', ['workdt', 'list_no'])
@Entity('ob_assign_set')
export class ObAssignSet {
  // 原 OBASSIGNSET 無 PK；TypeORM 要求 entity 至少有一個 PK，補一個 surrogate id
  @PrimaryGeneratedColumn({ type: 'bigint' })
  id: string;

  @Column({ name: 'list_no', type: 'varchar', length: 20, nullable: true })
  list_no: string | null;

  @Column({ name: 'workdt', type: 'varchar', length: 10 })
  workdt: string;

  @Column({ name: 'casedt', type: 'varchar', length: 10 })
  casedt: string;

  @Column({ name: 'ratio_rate', type: 'integer' })
  ratio_rate: number;
}
