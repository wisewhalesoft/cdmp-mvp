import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { EtlPipeline } from '@/database/entities/etl-pipeline.entity';
import { EtlPipelineLog } from '@/database/entities/etl-pipeline-log.entity';

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
export class EtlDashboardService {
  constructor(
    @InjectRepository(EtlPipeline)
    private readonly pipelineRepository: Repository<EtlPipeline>,
    @InjectRepository(EtlPipelineLog)
    private readonly logRepository: Repository<EtlPipelineLog>,
  ) {}

  async getStats() {
    // totalPipelines: non-deleted pipelines
    const totalPipelines = await this.pipelineRepository
      .createQueryBuilder('p')
      .where('p.deleted_at IS NULL')
      .getCount();

    // running: pipelines with status = 'running' (not deleted)
    const running = await this.pipelineRepository
      .createQueryBuilder('p')
      .where('p.deleted_at IS NULL')
      .andWhere('p.status = :s', { s: 'running' })
      .getCount();

    const { todayStartUTC, tomorrowStartUTC } = getTodayRangeUTC();

    // todaySuccess: logs with status=completed, is_test_run=false, finished_at in today (UTC+8)
    const todaySuccess = await this.logRepository
      .createQueryBuilder('log')
      .where('log.status = :status', { status: 'completed' })
      .andWhere('log.is_test_run = :isTest', { isTest: false })
      .andWhere('log.finished_at >= :start', { start: todayStartUTC })
      .andWhere('log.finished_at < :end', { end: tomorrowStartUTC })
      .getCount();

    // todayFailed: logs with status=failed, is_test_run=false, finished_at in today (UTC+8)
    const todayFailed = await this.logRepository
      .createQueryBuilder('log')
      .where('log.status = :status', { status: 'failed' })
      .andWhere('log.is_test_run = :isTest', { isTest: false })
      .andWhere('log.finished_at >= :start', { start: todayStartUTC })
      .andWhere('log.finished_at < :end', { end: tomorrowStartUTC })
      .getCount();

    // successRate: todaySuccess / (todaySuccess + todayFailed) * 100
    const total = todaySuccess + todayFailed;
    const successRate = total > 0
      ? Math.round((todaySuccess / total) * 1000) / 10
      : 0.0;

    return { totalPipelines, running, todaySuccess, todayFailed, successRate };
  }

  async getTrend(range: string) {
    const days = range === '30d' ? 30 : range === '14d' ? 14 : 7;
    const taipeiOffset = 8 * 60 * 60 * 1000;

    // Calculate start of range in UTC
    const now = new Date();
    const taipeiNow = new Date(now.getTime() + taipeiOffset);
    const taipeiTodayStart = new Date(
      Date.UTC(taipeiNow.getUTCFullYear(), taipeiNow.getUTCMonth(), taipeiNow.getUTCDate()),
    );
    const todayStartUTC = new Date(taipeiTodayStart.getTime() - taipeiOffset);
    const rangeStartUTC = new Date(todayStartUTC.getTime() - (days - 1) * 24 * 60 * 60 * 1000);
    const tomorrowStartUTC = new Date(todayStartUTC.getTime() + 24 * 60 * 60 * 1000);

    // Query all non-test logs in range
    const logs = await this.logRepository
      .createQueryBuilder('log')
      .where('log.is_test_run = :isTest', { isTest: false })
      .andWhere('log.finished_at >= :start', { start: rangeStartUTC })
      .andWhere('log.finished_at < :end', { end: tomorrowStartUTC })
      .andWhere('log.status IN (:...statuses)', { statuses: ['completed', 'failed'] })
      .getMany();

    // Build date map
    const dateMap = new Map<string, { success: number; failed: number }>();

    // Initialize all days with zero values
    for (let i = 0; i < days; i++) {
      const dayStartUTC = new Date(rangeStartUTC.getTime() + i * 24 * 60 * 60 * 1000);
      const taipeiDay = new Date(dayStartUTC.getTime() + taipeiOffset);
      const dateStr = taipeiDay.toISOString().split('T')[0];
      dateMap.set(dateStr, { success: 0, failed: 0 });
    }

    // Fill in actual data
    for (const log of logs) {
      const finishedAt = log.finished_at instanceof Date
        ? log.finished_at
        : new Date(log.finished_at as any);
      const taipeiTime = new Date(finishedAt.getTime() + taipeiOffset);
      const dateStr = taipeiTime.toISOString().split('T')[0];
      const entry = dateMap.get(dateStr);
      if (entry) {
        if (log.status === 'completed') {
          entry.success++;
        } else if (log.status === 'failed') {
          entry.failed++;
        }
      }
    }

    // Convert to sorted array
    const datapoints = Array.from(dateMap.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, counts]) => ({
        date,
        success: counts.success,
        failed: counts.failed,
      }));

    return { datapoints };
  }

  async getRunning() {
    // Find running logs and join with pipeline for name
    const logs = await this.logRepository
      .createQueryBuilder('log')
      .leftJoinAndSelect('log.pipeline', 'pipeline')
      .where('log.status = :status', { status: 'running' })
      .orderBy('log.started_at', 'ASC')
      .getMany();

    const data = logs.map((log) => {
      let totalCount = 0;
      let currentNodeName: string | null = null;

      // Parse node_logs for totalCount and current node
      if (log.node_logs) {
        try {
          const nodeLogs = typeof log.node_logs === 'string'
            ? JSON.parse(log.node_logs)
            : log.node_logs;
          if (Array.isArray(nodeLogs)) {
            totalCount = nodeLogs.length;
            const runningNode = nodeLogs.find((n: any) => n.status === 'running');
            if (runningNode) {
              currentNodeName = runningNode.nodeName ?? null;
            }
          }
        } catch {
          // ignore parse errors
        }
      }

      const processedCount = log.processed_count;
      const progressPercent = totalCount > 0
        ? Math.round((processedCount / totalCount) * 1000) / 10
        : 0.0;

      return {
        id: log.id,
        name: log.pipeline?.name ?? '',
        processedCount,
        totalCount,
        progressPercent,
        startedAt: log.started_at instanceof Date ? log.started_at.toISOString() : String(log.started_at),
        currentNodeName,
      };
    });

    return { data };
  }

  async getFailures() {
    const { todayStartUTC, tomorrowStartUTC } = getTodayRangeUTC();

    const logs = await this.logRepository
      .createQueryBuilder('log')
      .leftJoinAndSelect('log.pipeline', 'pipeline')
      .where('log.status = :status', { status: 'failed' })
      .andWhere('log.is_test_run = :isTest', { isTest: false })
      .andWhere('log.finished_at >= :start', { start: todayStartUTC })
      .andWhere('log.finished_at < :end', { end: tomorrowStartUTC })
      .orderBy('log.finished_at', 'DESC')
      .getMany();

    const data = logs.map((log) => ({
      pipelineId: log.pipeline_id,
      pipelineName: log.pipeline?.name ?? '',
      failedAt: log.finished_at instanceof Date ? log.finished_at.toISOString() : String(log.finished_at),
      errorSummary: log.error_message ?? '',
      logId: log.id,
    }));

    return { data };
  }

  async getSlowest() {
    // Get all completed, non-test logs grouped by pipeline
    const results = await this.logRepository
      .createQueryBuilder('log')
      .leftJoin('log.pipeline', 'pipeline')
      .select('log.pipeline_id', 'pipelineId')
      .addSelect('pipeline.name', 'pipelineName')
      .addSelect('AVG(log.duration_ms)', 'avgDurationMs')
      .addSelect('COUNT(*)', 'executionCount')
      .where('log.status = :status', { status: 'completed' })
      .andWhere('log.is_test_run = :isTest', { isTest: false })
      .andWhere('log.duration_ms IS NOT NULL')
      .andWhere('pipeline.deleted_at IS NULL')
      .groupBy('log.pipeline_id')
      .addGroupBy('pipeline.name')
      .orderBy('"avgDurationMs"', 'DESC')
      .limit(5)
      .getRawMany();

    const data = results.map((r) => ({
      pipelineId: r.pipelineId,
      pipelineName: r.pipelineName,
      avgDurationMs: Math.round(Number(r.avgDurationMs)),
      executionCount: Number(r.executionCount),
    }));

    return { data };
  }
}
