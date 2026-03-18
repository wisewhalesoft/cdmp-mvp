import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ConfigService } from '@nestjs/config';
import { ExtractionTaskController } from './extraction-task.controller';
import { ExtractionTaskService } from './extraction-task.service';
import { ExtractionTask } from '@/database/entities/extraction-task.entity';
import { ExtractionLog } from '@/database/entities/extraction-log.entity';
import { Datasource } from '@/database/entities/datasource.entity';
import { TokenBlocklist } from '@/database/entities/token-blocklist.entity';
import { User } from '@/database/entities/user.entity';

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
  providers: [ExtractionTaskService],
  exports: [ExtractionTaskService],
})
export class ExtractionTaskModule {}
