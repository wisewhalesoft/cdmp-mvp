import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { CronExpressionParser } from 'cron-parser';
import { EtlPipeline } from '@/database/entities/etl-pipeline.entity';
import { EtlPipelineExecutionService } from '@/modules/etl/etl-pipeline-execution.service';

@Injectable()
export class PipelineSchedulerService {
  private readonly logger = new Logger(PipelineSchedulerService.name);

  constructor(
    @InjectRepository(EtlPipeline)
    private readonly pipelineRepository: Repository<EtlPipeline>,
    private readonly executionService: EtlPipelineExecutionService,
  ) {}

  @Cron('0 * * * * *')
  async handleScheduledPipeline(): Promise<void> {
    await this.scanAndExecute(new Date());
  }

  async scanAndExecute(now: Date): Promise<void> {
    let pipelines: EtlPipeline[];
    try {
      pipelines = await this.pipelineRepository
        .createQueryBuilder('p')
        .where('p.enabled = :enabled', { enabled: true })
        .andWhere('p.deleted_at IS NULL')
        // 'active' + 'failed' 皆納入：一條 enabled 的 pipeline 若某次排程失敗（status='failed'），
        // 仍應在下一個排程時點自動重試（成功後由 executePipeline 依 enabled 還原為 'active'）；
        // 否則單次失敗即永久掉出排程，需人工 retry。對齊 extraction 排程「status!=running」的自癒行為。
        // 'running' 不納入（避免重入，且 triggerSchedule 對 running 會擲 409）；draft/disabled 已被 enabled=true 濾除。
        .andWhere('p.status IN (:...statuses)', { statuses: ['active', 'failed'] })
        .getMany();
    } catch (err: any) {
      this.logger.error(`Failed to query scheduled pipelines: ${err?.message || err}`);
      return;
    }

    for (const pipeline of pipelines) {
      if (!pipeline.schedule || !this.shouldTrigger(pipeline.schedule, now)) {
        continue;
      }

      try {
        await this.executionService.triggerSchedule(pipeline.id, pipeline.created_by);
        this.logger.log(`Scheduled execution triggered for pipeline ${pipeline.id}`);
      } catch (err: any) {
        this.logger.error(
          `Failed to trigger scheduled execution for pipeline ${pipeline.id}: ${err?.message || err}`,
        );
      }
    }
  }

  private shouldTrigger(cronExpression: string, now: Date): boolean {
    try {
      const checkDate = new Date(now.getTime() + 1000);
      const interval = CronExpressionParser.parse(cronExpression, {
        currentDate: checkDate,
        // 排程 cron 以台灣時間（UTC+8）解讀，與前端顯示一致（extraction 與 pipeline 一致）
        tz: 'Asia/Taipei',
      });
      const prev = interval.prev().toDate();
      const nowMinute = new Date(now);
      nowMinute.setUTCSeconds(0, 0);
      const prevMinute = new Date(prev);
      prevMinute.setUTCSeconds(0, 0);
      return nowMinute.getTime() === prevMinute.getTime();
    } catch {
      this.logger.warn(`Invalid cron expression: ${cronExpression}`);
      return false;
    }
  }
}
