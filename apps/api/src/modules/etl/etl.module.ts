import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ConfigService } from '@nestjs/config';
import { EtlPipelineController } from './etl-pipeline.controller';
import { EtlLogController } from './etl-log.controller';
import { EtlDashboardController } from './etl-dashboard.controller';
import { EtlPipelineService } from './etl-pipeline.service';
import { EtlPipelineExecutionService } from './etl-pipeline-execution.service';
import { EtlDashboardService } from './etl-dashboard.service';
import { EtlPipeline } from '@/database/entities/etl-pipeline.entity';
import { EtlPipelineLog } from '@/database/entities/etl-pipeline-log.entity';
import { EtlPipelineVersion } from '@/database/entities/etl-pipeline-version.entity';
import { TokenBlocklist } from '@/database/entities/token-blocklist.entity';
import { User } from '@/database/entities/user.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([EtlPipeline, EtlPipelineLog, EtlPipelineVersion, TokenBlocklist, User]),
    JwtModule.registerAsync({
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => ({
        secret: configService.get<string>('JWT_SECRET', 'default-dev-secret'),
      }),
    }),
  ],
  controllers: [EtlPipelineController, EtlLogController, EtlDashboardController],
  providers: [EtlPipelineService, EtlPipelineExecutionService, EtlDashboardService],
  exports: [EtlPipelineService, EtlPipelineExecutionService, EtlDashboardService],
})
export class EtlModule {}
