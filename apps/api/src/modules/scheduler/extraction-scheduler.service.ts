import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { CronExpressionParser } from 'cron-parser';
import { ExtractionTask } from '@/database/entities/extraction-task.entity';
import { ExtractionExecutionService } from '@/modules/extraction-task/extraction-execution.service';

@Injectable()
export class ExtractionSchedulerService {
  private readonly logger = new Logger(ExtractionSchedulerService.name);

  constructor(
    @InjectRepository(ExtractionTask)
    private readonly taskRepository: Repository<ExtractionTask>,
    private readonly executionService: ExtractionExecutionService,
  ) {}

  @Cron('0 * * * * *')
  async handleScheduledExtraction(): Promise<void> {
    await this.scanAndExecute(new Date());
  }

  async scanAndExecute(now: Date): Promise<void> {
    let tasks: ExtractionTask[];
    try {
      tasks = await this.taskRepository
        .createQueryBuilder('task')
        .where('task.enabled = :enabled', { enabled: true })
        .andWhere('task.deleted_at IS NULL')
        .andWhere('task.status != :status', { status: 'running' })
        .getMany();
    } catch (err: any) {
      this.logger.error(`Failed to query scheduled tasks: ${err?.message || err}`);
      return;
    }

    for (const task of tasks) {
      if (!this.shouldTrigger(task.schedule, now)) {
        continue;
      }

      try {
        await this.executionService.triggerRun(task.id, 'schedule', task.created_by);
        this.logger.log(`Scheduled execution triggered for task ${task.id}`);
      } catch (err: any) {
        this.logger.error(
          `Failed to trigger scheduled execution for task ${task.id}: ${err?.message || err}`,
        );
      }
    }
  }

  private shouldTrigger(cronExpression: string, now: Date): boolean {
    try {
      // Offset by 1 second so that prev() returns the current minute's match
      // when now is exactly at second 0 (which is when the cron job fires)
      const checkDate = new Date(now.getTime() + 1000);
      const interval = CronExpressionParser.parse(cronExpression, {
        currentDate: checkDate,
        tz: 'UTC',
      });
      const prev = interval.prev().toDate();
      // Compare truncated to minute
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
