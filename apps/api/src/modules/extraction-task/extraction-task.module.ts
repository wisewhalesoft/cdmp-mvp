import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { TypeOrmModule, getRepositoryToken } from '@nestjs/typeorm';
import { ConfigService } from '@nestjs/config';
import { Repository } from 'typeorm';
import { ExtractionTaskController } from './extraction-task.controller';
import { ExtractionTaskService } from './extraction-task.service';
import { ExtractionExecutionService } from './extraction-execution.service';
import { ExtractionDashboardService } from './extraction-dashboard.service';
import { RawDataService } from './raw-data.service';
import { ExtractionTask } from '@/database/entities/extraction-task.entity';
import { ExtractionLog } from '@/database/entities/extraction-log.entity';
import { Datasource } from '@/database/entities/datasource.entity';
import { TokenBlocklist } from '@/database/entities/token-blocklist.entity';
import { User } from '@/database/entities/user.entity';
import { EXTRACTION_EXECUTOR } from './extraction-executor.provider';
import { ExecutorFactory } from './executors/executor-factory';
import { DelegatingExecutor } from './executors/delegating-executor';

@Module({
  imports: [
    TypeOrmModule.forFeature([ExtractionTask, ExtractionLog, Datasource, TokenBlocklist, User]),
    JwtModule.registerAsync({
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => ({
        secret: configService.get<string>('JWT_SECRET', 'default-dev-secret'),
      }),
    }),
  ],
  controllers: [ExtractionTaskController],
  providers: [
    ExtractionTaskService,
    ExtractionExecutionService,
    ExtractionDashboardService,
    RawDataService,
    ExecutorFactory,
    {
      provide: EXTRACTION_EXECUTOR,
      useFactory: (dsRepo: Repository<Datasource>, factory: ExecutorFactory) =>
        new DelegatingExecutor(dsRepo, factory),
      inject: [getRepositoryToken(Datasource), ExecutorFactory],
    },
  ],
  exports: [ExtractionTaskService, ExtractionExecutionService, RawDataService, EXTRACTION_EXECUTOR],
})
export class ExtractionTaskModule {}
