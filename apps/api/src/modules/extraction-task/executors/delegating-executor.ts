import { Repository } from 'typeorm';
import { Datasource } from '@/database/entities/datasource.entity';
import {
  IExtractionExecutor,
  ExtractionExecutorResult,
  ColumnMetadata,
} from '../extraction-executor.provider';
import { ExecutorFactory } from './executor-factory';

/**
 * DelegatingExecutor: looks up the datasource type from DB,
 * then delegates to the appropriate database-specific executor.
 */
export class DelegatingExecutor implements IExtractionExecutor {
  constructor(
    private readonly datasourceRepository: Repository<Datasource>,
    private readonly factory: ExecutorFactory,
  ) {}

  private async resolve(datasourceId: string): Promise<IExtractionExecutor> {
    const ds = await this.datasourceRepository.findOne({
      where: { id: datasourceId },
    });
    if (!ds) {
      throw new Error(`Datasource not found: ${datasourceId}`);
    }
    return this.factory.getExecutor(ds.type);
  }

  async listSchemas(params: { datasourceId: string }): Promise<string[]> {
    const executor = await this.resolve(params.datasourceId);
    return executor.listSchemas(params);
  }

  async listTables(params: { datasourceId: string; schema: string }): Promise<string[]> {
    const executor = await this.resolve(params.datasourceId);
    return executor.listTables(params);
  }

  async getSourceTableMetadata(params: {
    datasourceId: string;
    sourceTable: string;
    sourceSchema?: string | null;
  }): Promise<ColumnMetadata[]> {
    const executor = await this.resolve(params.datasourceId);
    return executor.getSourceTableMetadata(params);
  }

  async getSourceCount(params: {
    datasourceId: string;
    sourceTable: string;
    sourceSchema?: string | null;
    mode: 'full' | 'incremental';
    incrementalColumn?: string | null;
    lastIncrementalValue?: string | null;
  }): Promise<number> {
    const executor = await this.resolve(params.datasourceId);
    return executor.getSourceCount(params);
  }

  async readBatch(params: {
    datasourceId: string;
    sourceTable: string;
    sourceSchema?: string | null;
    mode: 'full' | 'incremental';
    incrementalColumn?: string | null;
    lastIncrementalValue?: string | null;
    batchSize: number;
    lastKeyValue?: any;
  }): Promise<{ rows: Record<string, any>[]; lastKeyValue?: any; hasMore: boolean }> {
    const executor = await this.resolve(params.datasourceId);
    return executor.readBatch(params);
  }

  async execute(params: {
    datasourceId: string;
    targetTable: string;
    sourceSchema?: string | null;
    mode: 'full' | 'incremental';
    incrementalColumn?: string | null;
    lastIncrementalValue?: string | null;
    batchSize: number;
  }): Promise<ExtractionExecutorResult> {
    const executor = await this.resolve(params.datasourceId);
    return executor.execute(params);
  }
}
