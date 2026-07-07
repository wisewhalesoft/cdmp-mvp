// 對應 migration: migrations/mssql/1751884800002-MssqlQueueJobSchema.ts（AD-E07-40 §1）

import { Entity, PrimaryGeneratedColumn, Column, Index } from 'typeorm';
import {
  dateColumnType,
  longTextColumnType,
  longTextColumnLength,
} from '@/common/database/column-types';

/**
 * AD-E07-40 P2a — 自建 T-SQL 佇列表（取代 pg-boss，MSSQL 全面遷移 P2）。
 *
 * 設計選擇（AD §1 RESOLVED）：queue_job 在所有 driver 上通用建立，entity/migration 不做
 *   driver-conditional schema 邏輯。postgres 分支在 cutover 前完全使用 pg-boss 自己的 pgboss schema，
 *   queue_job 在 PG 上會是一張建了但未使用的空表（無害簡化，見 AD §9.3）。
 *
 * 索引兩軌策略（AD §1）：
 *   - 本 entity 之 @Index 為「一般索引」（portable、synchronize 可產生，dev 用）。
 *   - 真正 `WHERE state='created'` / `WHERE state='active'` 的 filtered index 不透過 decorator 表達
 *     （不可假設 TypeORM @Index({where}) 跨 driver 行為一致），改於手寫 baseline migration 補上
 *     （migrations/mssql/1751884800002-MssqlQueueJobSchema.ts）。
 *
 * uuid：沿用 @PrimaryGeneratedColumn('uuid') 產生策略（P1a 已證於 mssql driver 正確映射 uniqueidentifier，
 *   不需 uuidColumnType helper — 那是給裸 @Column({type:'uuid'}) 字面值用）。
 */
@Entity('queue_job')
@Index('idx_queue_job_pending', ['queue_name', 'state'])
@Index('idx_queue_job_active_expiry', ['state', 'expire_at'])
export class QueueJob {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'queue_name', type: 'varchar', length: 100 })
  queue_name: string;

  /** JSON.stringify(RunJobPayload)；長文字 → mssql nvarchar(MAX) / pg・sqlite text。 */
  @Column({ name: 'payload', type: longTextColumnType, length: longTextColumnLength })
  payload: string;

  @Column({ name: 'state', type: 'varchar', length: 20, default: 'created' })
  state: 'created' | 'active' | 'completed' | 'cancelled' | 'expired';

  @Column({ name: 'retry_limit', type: 'int', default: 0 })
  retry_limit: number;

  @Column({ name: 'created_at', type: dateColumnType, default: () => 'CURRENT_TIMESTAMP' })
  created_at: Date;

  @Column({ name: 'started_at', type: dateColumnType, nullable: true })
  started_at: Date | null;

  @Column({ name: 'expire_at', type: dateColumnType, nullable: true })
  expire_at: Date | null;

  @Column({ name: 'completed_at', type: dateColumnType, nullable: true })
  completed_at: Date | null;
}
