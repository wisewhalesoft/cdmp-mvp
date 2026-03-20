import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ConfigService } from '@nestjs/config';
import { EtlPipelineController } from './etl-pipeline.controller';
import { EtlPipelineService } from './etl-pipeline.service';
import { EtlPipeline } from '@/database/entities/etl-pipeline.entity';
import { EtlPipelineLog } from '@/database/entities/etl-pipeline-log.entity';
import { TokenBlocklist } from '@/database/entities/token-blocklist.entity';
import { User } from '@/database/entities/user.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([EtlPipeline, EtlPipelineLog, TokenBlocklist, User]),
    JwtModule.registerAsync({
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => ({
        secret: configService.get<string>('JWT_SECRET', 'default-dev-secret'),
      }),
    }),
  ],
  controllers: [EtlPipelineController],
  providers: [EtlPipelineService],
  exports: [EtlPipelineService],
})
export class EtlModule {}
