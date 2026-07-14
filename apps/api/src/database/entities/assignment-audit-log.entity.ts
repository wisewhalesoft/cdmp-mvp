// 對應 migration: 1711360000120-CreateE07AssignmentTables.ts
// 3 年保留（AD-E07-3），INSERT-only

import { Entity, PrimaryGeneratedColumn, Column, Index } from 'typeorm';
import { dateColumnType, jsonColumnType, uuidColumnType } from '@/common/database/column-types';

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

  // m16 / AD-E07-17 議題 2 / 2026-05-16：length 由 10 擴為 30，
  // union 補充 STAGE_ADVANCE / STAGE_ROLLBACK / STAGE_REJECT / ASSIGN_ROLE / REVOKE_ROLE
  // P1 B6 / F064 AC-5 / 2026-05-17：補 EXPORT（分派結果匯出稽核）
  // F062 / Phase 2 / 2026-05-17：補 CANCEL（月名單分派取消稽核）
  // F054 v1.3 / 2026-05-18：補 SCORING_INTEGRITY_WARN（計分設定完整性稽核警告，25 chars，仍在 VARCHAR(30) 內）
  // F115 / 2026-07-14：補 WRITEBACK（分派結果回寫外部 OBPOOLDATA_LIST 稽核；9 chars，VARCHAR(30) 內，無需 migration）
  @Column({ name: 'action', type: 'varchar', length: 30 })
  action:
    | 'CREATE'
    | 'UPDATE'
    | 'DELETE'
    | 'RUN'
    | 'EXPORT'
    | 'CANCEL'
    | 'STAGE_ADVANCE'
    | 'STAGE_ROLLBACK'
    | 'STAGE_REJECT'
    | 'ASSIGN_ROLE'
    | 'REVOKE_ROLE'
    | 'SCORING_INTEGRITY_WARN'
    | 'WRITEBACK';

  @Column({ name: 'actor_id', type: uuidColumnType })
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
