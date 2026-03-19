import { Module } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';
import { TypeOrmModule } from '@nestjs/typeorm';
import { DatasourceModule } from '@/modules/datasource/datasource.module';
import { ExtractionTaskModule } from '@/modules/extraction-task/extraction-task.module';
import { Datasource } from '@/database/entities/datasource.entity';
import { ExtractionTask } from '@/database/entities/extraction-task.entity';
import { HealthCheckService } from './health-check.service';
import { ExtractionSchedulerService } from './extraction-scheduler.service';

@Module({
  imports: [
    ScheduleModule.forRoot(),
    DatasourceModule,
    ExtractionTaskModule,
    TypeOrmModule.forFeature([Datasource, ExtractionTask]),
  ],
  providers: [HealthCheckService, ExtractionSchedulerService],
})
export class SchedulerModule {}
