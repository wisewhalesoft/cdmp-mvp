import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ExtractionTask } from '@/database/entities/extraction-task.entity';
import { ExtractionLog } from '@/database/entities/extraction-log.entity';

function getTodayRangeUTC() {
  const now = new Date();
  const taipeiOffset = 8 * 60 * 60 * 1000;
  const taipeiNow = new Date(now.getTime() + taipeiOffset);
  const taipeiTodayStart = new Date(
    Date.UTC(taipeiNow.getUTCFullYear(), taipeiNow.getUTCMonth(), taipeiNow.getUTCDate()),
  );
  const todayStartUTC = new Date(taipeiTodayStart.getTime() - taipeiOffset);
  const tomorrowStartUTC = new Date(todayStartUTC.getTime() + 24 * 60 * 60 * 1000);
  return { todayStartUTC, tomorrowStartUTC };
}

@Injectable()
export class ExtractionDashboardService {
  constructor(
    @InjectRepository(ExtractionTask)
    private readonly taskRepository: Repository<ExtractionTask>,
    @InjectRepository(ExtractionLog)
    private readonly logRepository: Repository<ExtractionLog>,
  ) {}

  async getDashboard() {
    // Summary
    const totalTasks = await this.taskRepository
      .createQueryBuilder('task')
      .where('task.deleted_at IS NULL')
      .getCount();

    const running = await this.taskRepository
      .createQueryBuilder('task')
      .where('task.deleted_at IS NULL')
      .andWhere('task.status = :status', { status: 'running' })
      .getCount();

    const { todayStartUTC, tomorrowStartUTC } = getTodayRangeUTC();

    const todayLogs = await this.logRepository
      .createQueryBuilder('log')
      .select('log.status', 'status')
      .addSelect('COUNT(*)', 'count')
      .where('log.started_at >= :start', { start: todayStartUTC })
      .andWhere('log.started_at < :end', { end: tomorrowStartUTC })
      .andWhere('log.status IN (:...statuses)', { statuses: ['completed', 'failed'] })
      .groupBy('log.status')
      .getRawMany();

    let todaySuccess = 0;
    let todayFailed = 0;
    for (const row of todayLogs) {
      if (row.status === 'completed') todaySuccess = Number(row.count);
      if (row.status === 'failed') todayFailed = Number(row.count);
    }

    const successRate =
      todaySuccess + todayFailed > 0
        ? Math.round((todaySuccess / (todaySuccess + todayFailed)) * 1000) / 10
        : 0;

    // Running tasks
    const runningTasks = await this.taskRepository
      .createQueryBuilder('task')
      .leftJoinAndSelect('task.datasource', 'ds')
      .where('task.deleted_at IS NULL')
      .andWhere('task.status = :status', { status: 'running' })
      .getMany();

    const runningTasksData = runningTasks.map((task) => ({
      id: task.id,
      name: task.name,
      datasourceName: task.datasource?.name ?? '',
      extractedCount: task.extracted_count,
      totalCount: task.total_count,
      progressPercent: task.progress_percent,
    }));

    // Today's failures
    const failedLogs = await this.logRepository
      .createQueryBuilder('log')
      .leftJoin('log.task', 'task')
      .addSelect(['task.id', 'task.name'])
      .where('log.started_at >= :start', { start: todayStartUTC })
      .andWhere('log.started_at < :end', { end: tomorrowStartUTC })
      .andWhere('log.status = :status', { status: 'failed' })
      .orderBy('log.started_at', 'DESC')
      .getMany();

    const todayFailures = failedLogs.map((log) => ({
      taskId: log.task_id,
      taskName: log.task?.name ?? '',
      failedAt: log.finished_at?.toISOString() ?? log.started_at.toISOString(),
      errorSummary: log.error_message ?? '',
      logId: log.id,
    }));

    // Slowest tasks Top 5
    const slowestTasks = await this.taskRepository
      .createQueryBuilder('task')
      .where('task.deleted_at IS NULL')
      .andWhere('task.execution_count > 0')
      .orderBy('task.avg_duration_ms', 'DESC')
      .limit(5)
      .getMany();

    const slowestTasksData = slowestTasks.map((task) => ({
      taskId: task.id,
      taskName: task.name,
      avgDurationMs: task.avg_duration_ms,
      executionCount: task.execution_count,
    }));

    return {
      summary: {
        totalTasks,
        running,
        todaySuccess,
        todayFailed,
        successRate,
      },
      runningTasks: runningTasksData,
      todayFailures,
      slowestTasks: slowestTasksData,
    };
  }

  async getTrend(range: string) {
    const days = range === '30d' ? 30 : range === '14d' ? 14 : 7;

    const { todayStartUTC } = getTodayRangeUTC();
    const tomorrowStartUTC = new Date(todayStartUTC.getTime() + 24 * 60 * 60 * 1000);
    const rangeStartUTC = new Date(todayStartUTC.getTime() - (days - 1) * 24 * 60 * 60 * 1000);

    const logs = await this.logRepository
      .createQueryBuilder('log')
      .select('log.started_at', 'started_at')
      .addSelect('log.status', 'status')
      .where('log.started_at >= :start', { start: rangeStartUTC })
      .andWhere('log.started_at < :end', { end: tomorrowStartUTC })
      .andWhere('log.status IN (:...statuses)', { statuses: ['completed', 'failed'] })
      .getRawMany();

    // Group by date (in Taipei timezone)
    const taipeiOffset = 8 * 60 * 60 * 1000;
    const dateMap = new Map<string, { success: number; failed: number }>();

    for (const log of logs) {
      const startedAt = new Date(log.started_at);
      const taipeiTime = new Date(startedAt.getTime() + taipeiOffset);
      const dateStr = taipeiTime.toISOString().split('T')[0];

      if (!dateMap.has(dateStr)) {
        dateMap.set(dateStr, { success: 0, failed: 0 });
      }
      const entry = dateMap.get(dateStr)!;
      if (log.status === 'completed') entry.success++;
      else if (log.status === 'failed') entry.failed++;
    }

    // Build datapoints sorted by date
    const datapoints = Array.from(dateMap.entries())
      .map(([date, counts]) => ({
        date,
        success: counts.success,
        failed: counts.failed,
      }))
      .sort((a, b) => a.date.localeCompare(b.date));

    return { datapoints };
  }
}
