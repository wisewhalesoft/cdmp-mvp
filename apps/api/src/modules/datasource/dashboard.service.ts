import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, MoreThan } from 'typeorm';
import { Datasource } from '@/database/entities/datasource.entity';
import { DatasourceHealthLog } from '@/database/entities/datasource-health-log.entity';
import { ERROR_CODES, ERROR_MESSAGES } from '@/common/errors/error-codes';

export interface DashboardResult {
  summary: {
    total: number;
    connected: number;
    disconnected: number;
    unknown: number;
    typeCounts: Record<string, number>;
  };
  datasources: {
    id: string;
    name: string;
    type: string;
    status: string;
    lastTestedAt: Date | null;
    consecutiveFailures: number;
    lastErrorMessage: string | null;
  }[];
}

export interface MetricsResult {
  datasourceId: string;
  range: string;
  datapoints: {
    timestamp: Date;
    responseTimeMs: number | null;
    success: boolean;
  }[];
}

export interface AlertItemResult {
  datasourceId: string;
  name: string;
  type: string;
  consecutiveFailures: number;
  firstFailureTime: Date;
  lastErrorMessage: string | null;
}

@Injectable()
export class DashboardService {
  constructor(
    @InjectRepository(Datasource)
    private readonly datasourceRepository: Repository<Datasource>,
    @InjectRepository(DatasourceHealthLog)
    private readonly healthLogRepository: Repository<DatasourceHealthLog>,
  ) {}

  async getDashboard(): Promise<DashboardResult> {
    // Get all non-deleted datasources
    const datasources = await this.datasourceRepository
      .createQueryBuilder('ds')
      .where('ds.deleted_at IS NULL')
      .orderBy('ds.created_at', 'DESC')
      .getMany();

    // Calculate summary
    const summary = {
      total: datasources.length,
      connected: 0,
      disconnected: 0,
      unknown: 0,
      typeCounts: {} as Record<string, number>,
    };

    for (const ds of datasources) {
      if (ds.status === 'connected') summary.connected++;
      else if (ds.status === 'disconnected') summary.disconnected++;
      else summary.unknown++;

      summary.typeCounts[ds.type] = (summary.typeCounts[ds.type] || 0) + 1;
    }

    // Calculate consecutive failures for each datasource in JS layer
    const datasourceResults = await Promise.all(
      datasources.map(async (ds) => {
        const { consecutiveFailures, lastErrorMessage } =
          await this.calculateConsecutiveFailures(ds.id);
        return {
          id: ds.id,
          name: ds.name,
          type: ds.type,
          status: ds.status,
          lastTestedAt: ds.last_tested_at,
          consecutiveFailures,
          lastErrorMessage,
        };
      }),
    );

    return { summary, datasources: datasourceResults };
  }

  async getMetrics(datasourceId: string, range: string): Promise<MetricsResult> {
    // Verify datasource exists
    const ds = await this.datasourceRepository
      .createQueryBuilder('ds')
      .where('ds.id = :id', { id: datasourceId })
      .andWhere('ds.deleted_at IS NULL')
      .getOne();

    if (!ds) {
      throw new NotFoundException({
        error: ERROR_CODES.DS_NOT_FOUND,
        message: ERROR_MESSAGES.DS_NOT_FOUND,
      });
    }

    // Calculate time range
    const now = new Date();
    const rangeMs = this.parseRange(range);
    const since = new Date(now.getTime() - rangeMs);

    // Query health logs within range
    const logs = await this.healthLogRepository
      .createQueryBuilder('log')
      .where('log.datasource_id = :dsId', { dsId: datasourceId })
      .andWhere('log.checked_at > :since', { since })
      .orderBy('log.checked_at', 'ASC')
      .getMany();

    return {
      datasourceId,
      range,
      datapoints: logs.map((log) => ({
        timestamp: log.checked_at,
        responseTimeMs: log.success ? log.response_time_ms : null,
        success: log.success,
      })),
    };
  }

  async getAlerts(): Promise<{ alerts: AlertItemResult[] }> {
    // Get all non-deleted datasources
    const datasources = await this.datasourceRepository
      .createQueryBuilder('ds')
      .where('ds.deleted_at IS NULL')
      .getMany();

    const alerts: AlertItemResult[] = [];

    for (const ds of datasources) {
      const { consecutiveFailures, lastErrorMessage, firstFailureTime } =
        await this.calculateConsecutiveFailures(ds.id);

      if (consecutiveFailures >= 2 && firstFailureTime) {
        alerts.push({
          datasourceId: ds.id,
          name: ds.name,
          type: ds.type,
          consecutiveFailures,
          firstFailureTime,
          lastErrorMessage,
        });
      }
    }

    // Sort by consecutiveFailures DESC
    alerts.sort((a, b) => b.consecutiveFailures - a.consecutiveFailures);

    return { alerts };
  }

  /**
   * Calculate consecutive failures from the most recent health logs (JS layer).
   * Counts backwards from the latest log until a success is found.
   */
  private async calculateConsecutiveFailures(
    datasourceId: string,
  ): Promise<{
    consecutiveFailures: number;
    lastErrorMessage: string | null;
    firstFailureTime: Date | null;
  }> {
    const logs = await this.healthLogRepository
      .createQueryBuilder('log')
      .where('log.datasource_id = :dsId', { dsId: datasourceId })
      .orderBy('log.checked_at', 'DESC')
      .getMany();

    let consecutiveFailures = 0;
    let lastErrorMessage: string | null = null;
    let firstFailureTime: Date | null = null;

    for (const log of logs) {
      if (log.success) {
        break;
      }
      consecutiveFailures++;
      if (consecutiveFailures === 1) {
        lastErrorMessage = log.error_message;
      }
      firstFailureTime = log.checked_at;
    }

    return { consecutiveFailures, lastErrorMessage, firstFailureTime };
  }

  private parseRange(range: string): number {
    switch (range) {
      case '7d':
        return 7 * 24 * 60 * 60 * 1000;
      case '30d':
        return 30 * 24 * 60 * 60 * 1000;
      case '24h':
      default:
        return 24 * 60 * 60 * 1000;
    }
  }
}
