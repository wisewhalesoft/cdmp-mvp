// 對應 migration: 1711360000120-CreateE07AssignmentTables.ts
// 3 年保留（AD-E07-3），INSERT-only

import { Entity, PrimaryGeneratedColumn, Column, Index } from 'typeorm';
import { dateColumnType, jsonColumnType } from '@/common/database/column-types';

@Index('idx_assignment_audit_log_entity', ['entity_type', 'entity_id'])
@Index('idx_assignment_audit_log_actor', ['actor_id', 'created_at'])
@Index('idx_assignment_audit_log_created', ['created_at'])
@Entity('assignment_audit_log')
export class AssignmentAuditLog {
  @PrimaryGeneratedColumn('uuid')
  log_id: string;

  @Column({ name: 'entity_type', type: 'varchar', length: 50 })
  entity_type: string;

  @Column({ name: 'entity_id', type: 'varchar', length: 100 })
  entity_id: string;

  @Column({ name: 'action', type: 'varchar', length: 10 })
  action: 'CREATE' | 'UPDATE' | 'DELETE' | 'RUN';

  @Column({ name: 'actor_id', type: 'uuid' })
  actor_id: string;

  @Column({ name: 'actor_name', type: 'varchar', length: 100 })
  actor_name: string;

  // F068 / E2E sqlite 相容：採 jsonColumnType（postgres=jsonb / sqlite=simple-json）
  @Column({ name: 'before_value', type: jsonColumnType, nullable: true })
  before_value: Record<string, unknown> | null;

  @Column({ name: 'after_value', type: jsonColumnType, nullable: true })
  after_value: Record<string, unknown> | null;

  @Column({ name: 'ip_address', type: 'varchar', length: 45, nullable: true })
  ip_address: string | null;

  // F068 / E2E sqlite 相容：採 dateColumnType
  @Column({
    name: 'created_at',
    type: dateColumnType,
    default: () => 'CURRENT_TIMESTAMP',
  })
  created_at: Date;
}
