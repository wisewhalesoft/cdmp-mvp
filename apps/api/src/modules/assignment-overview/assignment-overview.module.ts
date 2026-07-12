import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { TypeOrmModule } from '@nestjs/typeorm';
import { User } from '@/database/entities/user.entity';
import { TokenBlocklist } from '@/database/entities/token-blocklist.entity';
import { AssignmentListModule } from '@/modules/assignment-list/assignment-list.module';
import { AssignmentModule } from '@/modules/assignment/assignment.module';
import { SystemModule } from '@/modules/system/system.module';
import { AssignmentOverviewController } from './assignment-overview.controller';
import { AssignmentOverviewService } from './assignment-overview.service';

/**
 * F111 / AD-E07-46 §3.1 — 獨立 AssignmentOverviewModule（不塞入既有 M01/M04 模組）。
 *
 * imports：
 *   - AssignmentListModule → export AssignmentListService / Stage0EstimateService
 *   - AssignmentModule     → export MonthlyRunReadinessService / AssignmentRunService /
 *                            AssignmentRunReportService（後兩者由 §3.2 exports 擴充補上）
 *   - SystemModule         → export SystemService
 *   - JwtModule + TypeOrmModule.forFeature([User, TokenBlocklist])：class 級 AuthGuard
 *     於本模組 injector 實例化，需 JwtService + User / TokenBlocklist repo（比照其他 E07
 *     controller 模組之既有慣例，如 AssignmentListModule）。
 */
@Module({
  imports: [
    TypeOrmModule.forFeature([User, TokenBlocklist]),
    JwtModule.registerAsync({
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => ({
        secret: configService.get<string>('JWT_SECRET', 'default-dev-secret'),
      }),
    }),
    AssignmentListModule,
    AssignmentModule,
    SystemModule,
  ],
  controllers: [AssignmentOverviewController],
  providers: [AssignmentOverviewService],
})
export class AssignmentOverviewModule {}
