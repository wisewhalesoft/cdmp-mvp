import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import { DataSource, In, IsNull, Repository } from 'typeorm';
import {
  TARGET_TABLE_SCHEMAS,
  TargetTableSchema,
  TargetTableStat,
  TargetTableSummary,
} from './target-table-schemas';
import { EtlPipeline } from '@/database/entities/etl-pipeline.entity';
import { EtlPipelineVersion } from '@/database/entities/etl-pipeline-version.entity';
import { EtlPipelineLog } from '@/database/entities/etl-pipeline-log.entity';
import { getTableRowCounts } from '@/common/db/table-row-counts';
import { ERROR_CODES, ERROR_MESSAGES } from '@/common/errors/error-codes';

@Injectable()
export class TargetTableService {
  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    @InjectRepository(EtlPipeline)
    private readonly pipelineRepo: Repository<EtlPipeline>,
    @InjectRepository(EtlPipelineVersion)
    private readonly versionRepo: Repository<EtlPipelineVersion>,
    @InjectRepository(EtlPipelineLog)
    private readonly logRepo: Repository<EtlPipelineLog>,
  ) {}

  getAll(): { data: TargetTableSummary[] } {
    const data: TargetTableSummary[] = TARGET_TABLE_SCHEMAS.map((t) => ({
      tableName: t.tableName,
      displayName: t.displayName,
      domain: t.domain,
      columnCount: t.columns.length,
      description: t.description,
    }));
    return { data };
  }

  getSchema(tableName: string): TargetTableSchema {
    const schema = TARGET_TABLE_SCHEMAS.find((t) => t.tableName === tableName);
    if (!schema) {
      throw new NotFoundException({
        error: ERROR_CODES.PIPELINE_TARGET_TABLE_NOT_FOUND,
        message: ERROR_MESSAGES.PIPELINE_TARGET_TABLE_NOT_FOUND,
      });
    }
    return schema;
  }

  /**
   * ETL 目標資料表現況：每個 pipeline 之 target_load 目標表 + 真實筆數（metadata 快速查）+ 上次載入。
   *
   * 讓管理者一眼看出「pipeline log 顯示 completed，但目標表其實是空的」（多次 E2E 測試清表 → 月跑/試算
   * 靜默壞掉的根因）。pipeline 顯示名可自訂 → 一律以 definition 的 target_load targetTable 定位（穩定）。
   */
  async getTargetTableStats(): Promise<{ data: TargetTableStat[] }> {
    const pipelines = await this.pipelineRepo.find({
      where: { deleted_at: IsNull() },
    });
    if (pipelines.length === 0) return { data: [] };

    const versions = await this.versionRepo.find({
      where: { pipeline_id: In(pipelines.map((p) => p.id)) },
    });

    // pipeline → target_load 目標表（取當前版 definition，否則最新版）。
    const rows: Array<{ pipeline: EtlPipeline; tableName: string }> = [];
    for (const p of pipelines) {
      const own = versions.filter((v) => v.pipeline_id === p.id);
      if (own.length === 0) continue;
      const current =
        own.find((v) => v.version === p.version) ??
        own.reduce((a, b) => (b.version > a.version ? b : a));
      const nodes = (current.definition?.nodes ?? []) as Array<{
        data?: { nodeType?: string; targetTable?: string };
      }>;
      const target = nodes.find((n) => n?.data?.nodeType === 'target_load')?.data
        ?.targetTable;
      if (target) rows.push({ pipeline: p, tableName: target });
    }
    if (rows.length === 0) return { data: [] };

    // 真實筆數（metadata 快速查，避免大表全掃）。
    const counts = await getTableRowCounts(
      this.dataSource,
      rows.map((r) => r.tableName),
    );

    // 每 pipeline 最新一筆 log（上次載入時間 + 狀態）。
    const logs = await this.logRepo
      .createQueryBuilder('log')
      .where('log.pipeline_id IN (:...ids)', {
        ids: rows.map((r) => r.pipeline.id),
      })
      .orderBy('log.started_at', 'DESC')
      .getMany();
    const latestLogByPipeline = new Map<string, EtlPipelineLog>();
    for (const l of logs) {
      if (!latestLogByPipeline.has(l.pipeline_id)) {
        latestLogByPipeline.set(l.pipeline_id, l);
      }
    }

    const data: TargetTableStat[] = rows
      .map((r) => {
        const log = latestLogByPipeline.get(r.pipeline.id);
        const finishedAt = (log as any)?.finished_at as Date | null | undefined;
        return {
          tableName: r.tableName,
          pipelineName: r.pipeline.name,
          rowCount: counts.get(r.tableName) ?? 0,
          lastLoadedAt: finishedAt
            ? new Date(finishedAt).toISOString()
            : null,
          lastLoadStatus:
            (log?.status as TargetTableStat['lastLoadStatus']) ?? null,
        };
      })
      .sort((a, b) => a.tableName.localeCompare(b.tableName));

    return { data };
  }
}
