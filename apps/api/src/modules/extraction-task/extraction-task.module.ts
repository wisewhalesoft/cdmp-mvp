import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ConfigService } from '@nestjs/config';
import { ExtractionTaskController } from './extraction-task.controller';
import { ExtractionTaskService } from './extraction-task.service';
import { ExtractionExecutionService } from './extraction-execution.service';
import { RawDataService } from './raw-data.service';
import { ExtractionTask } from '@/database/entities/extraction-task.entity';
import { ExtractionLog } from '@/database/entities/extraction-log.entity';
import { Datasource } from '@/database/entities/datasource.entity';
import { TokenBlocklist } from '@/database/entities/token-blocklist.entity';
import { User } from '@/database/entities/user.entity';
import { EXTRACTION_EXECUTOR } from './extraction-executor.provider';

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
    RawDataService,
    {
      provide: EXTRACTION_EXECUTOR,
      useValue: {
        execute: async () => ({ totalCount: 0, extractedCount: 0 }),
        getSourceTableMetadata: async () => [
          { name: 'id', dataType: 'integer', isPrimary: true },
          { name: 'name', dataType: 'varchar', isPrimary: false },
        ],
        getSourceCount: async () => 0,
        readBatch: async () => ({ rows: [], hasMore: false }),
        listSchemas: async () => ['public'],
        listTables: async () => ['example_table'],
      },
    },
  ],
  exports: [ExtractionTaskService, ExtractionExecutionService, RawDataService, EXTRACTION_EXECUTOR],
})
export class ExtractionTaskModule {}
