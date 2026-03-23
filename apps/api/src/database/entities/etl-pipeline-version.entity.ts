import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { EtlPipeline } from './etl-pipeline.entity';
import { User } from './user.entity';
import { dateColumnType } from '@/common/database/column-types';

@Entity('etl_pipeline_versions')
export class EtlPipelineVersion {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  pipeline_id: string;

  @ManyToOne(() => EtlPipeline)
  @JoinColumn({ name: 'pipeline_id' })
  pipeline: EtlPipeline;

  @Column({ type: 'int' })
  version: number;

  @Column({ type: 'simple-json' })
  definition: { nodes: any[]; edges: any[] };

  @Column({ type: 'varchar', length: 20, default: 'draft' })
  status: 'draft' | 'testing' | 'published';

  @Column({ type: 'varchar', length: 500, nullable: true, default: null })
  change_summary: string | null;

  @Column({ type: 'uuid' })
  created_by: string;

  @ManyToOne(() => User)
  @JoinColumn({ name: 'created_by' })
  creator: User;

  @Column({ type: dateColumnType, nullable: true, default: null })
  published_at: Date | null;

  @CreateDateColumn()
  created_at: Date;
}
