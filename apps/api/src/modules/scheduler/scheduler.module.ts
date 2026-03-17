import { Module } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';
import { TypeOrmModule } from '@nestjs/typeorm';
import { DatasourceModule } from '@/modules/datasource/datasource.module';
import { Datasource } from '@/database/entities/datasource.entity';
import { HealthCheckService } from './health-check.service';

@Module({
  imports: [
    ScheduleModule.forRoot(),
    DatasourceModule,
    TypeOrmModule.forFeature([Datasource]),
  ],
  providers: [HealthCheckService],
})
export class SchedulerModule {}
