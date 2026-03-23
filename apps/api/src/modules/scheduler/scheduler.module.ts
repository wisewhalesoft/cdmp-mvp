import { Module } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';
import { TypeOrmModule } from '@nestjs/typeorm';
import { DatasourceModule } from '@/modules/datasource/datasource.module';
import { ExtractionTaskModule } from '@/modules/extraction-task/extraction-task.module';
import { EtlModule } from '@/modules/etl/etl.module';
import { Datasource } from '@/database/entities/datasource.entity';
import { ExtractionTask } from '@/database/entities/extraction-task.entity';
import { EtlPipeline } from '@/database/entities/etl-pipeline.entity';
import { HealthCheckService } from './health-check.service';
import { ExtractionSchedulerService } from './extraction-scheduler.service';
import { PipelineSchedulerService } from './pipeline-scheduler.service';

@Module({
  imports: [
    ScheduleModule.forRoot(),
    DatasourceModule,
    ExtractionTaskModule,
    EtlModule,
    TypeOrmModule.forFeature([Datasource, ExtractionTask, EtlPipeline]),
  ],
  providers: [HealthCheckService, ExtractionSchedulerService, PipelineSchedulerService],
})
export class SchedulerModule {}
