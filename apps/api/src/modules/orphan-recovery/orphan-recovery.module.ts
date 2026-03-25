import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ExtractionTask } from '@/database/entities/extraction-task.entity';
import { ExtractionLog } from '@/database/entities/extraction-log.entity';
import { EtlPipeline } from '@/database/entities/etl-pipeline.entity';
import { EtlPipelineLog } from '@/database/entities/etl-pipeline-log.entity';
import { OrphanRecoveryService } from './orphan-recovery.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      ExtractionTask,
      ExtractionLog,
      EtlPipeline,
      EtlPipelineLog,
    ]),
  ],
  providers: [OrphanRecoveryService],
})
export class OrphanRecoveryModule {}
