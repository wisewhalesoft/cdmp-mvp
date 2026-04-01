import { Repository } from 'typeorm';
import { Datasource } from '@/database/entities/datasource.entity';
import { CryptoUtil } from '@/common/crypto/crypto.util';
import {
  IExtractionExecutor,
  ExtractionExecutorResult,
  ColumnMetadata,
} from '../extraction-executor.provider';

export interface DatasourceConnectionInfo {
  host: string;
  port: number;
  database: string;
  username: string;
  password: string;
}

export abstract class BaseExecutor implements IExtractionExecutor {
  constructor(
    protected readonly datasourceRepository: Repository<Datasource>,
  ) {}

  /**
   * Resolve datasource by ID and decrypt its password.
   */
  protected async resolveConnection(datasourceId: string): Promise<DatasourceConnectionInfo> {
    const ds = await this.datasourceRepository.findOne({
      where: { id: datasourceId },
    });

    if (!ds) {
      throw new Error(`Datasource not found: ${datasourceId}`);
    }

    const password = CryptoUtil.decrypt(ds.encrypted_password);

    return {
      host: ds.host,
      port: ds.port,
      database: ds.database_name,
      username: ds.username,
      password,
    };
  }

  // --- Abstract methods for DB-specific identifier quoting ---
  protected abstract quoteIdentifier(name: string): string;

  /**
   * Build a fully qualified table reference: schema.table
   */
  protected qualifiedTable(schema: string | null | undefined, table: string): string {
    if (schema) {
      return `${this.quoteIdentifier(schema)}.${this.quoteIdentifier(table)}`;
    }
    return this.quoteIdentifier(table);
  }

  // --- IExtractionExecutor interface ---

  abstract listSchemas(params: { datasourceId: string }): Promise<string[]>;

  abstract listTables(params: { datasourceId: string; schema: string }): Promise<string[]>;

  abstract getSourceTableMetadata(params: {
    datasourceId: string;
    sourceTable: string;
    sourceSchema?: string | null;
  }): Promise<ColumnMetadata[]>;

  abstract getSourceCount(params: {
    datasourceId: string;
    sourceTable: string;
    sourceSchema?: string | null;
    mode: 'full' | 'incremental';
    incrementalColumn?: string | null;
    lastIncrementalValue?: string | null;
  }): Promise<number>;

  abstract readBatch(params: {
    datasourceId: string;
    sourceTable: string;
    sourceSchema?: string | null;
    mode: 'full' | 'incremental';
    incrementalColumn?: string | null;
    lastIncrementalValue?: string | null;
    batchSize: number;
    lastKeyValue?: any;
    primaryKeyColumn?: string | null;
    offset?: number;
  }): Promise<{ rows: Record<string, any>[]; lastKeyValue?: any; hasMore: boolean }>;

  async execute(params: {
    datasourceId: string;
    targetTable: string;
    sourceSchema?: string | null;
    mode: 'full' | 'incremental';
    incrementalColumn?: string | null;
    lastIncrementalValue?: string | null;
    batchSize: number;
  }): Promise<ExtractionExecutorResult> {
    // Delegate to getSourceCount + readBatch for backward compatibility
    const totalCount = await this.getSourceCount({
      datasourceId: params.datasourceId,
      sourceTable: params.targetTable,
      sourceSchema: params.sourceSchema,
      mode: params.mode,
      incrementalColumn: params.incrementalColumn,
      lastIncrementalValue: params.lastIncrementalValue,
    });

    let extractedCount = 0;
    let lastKeyValue: any = undefined;
    let offset = 0;
    let lastIncrementalValue: string | null = null;

    while (true) {
      const batch = await this.readBatch({
        datasourceId: params.datasourceId,
        sourceTable: params.targetTable,
        sourceSchema: params.sourceSchema,
        mode: params.mode,
        incrementalColumn: params.incrementalColumn,
        lastIncrementalValue: params.lastIncrementalValue,
        batchSize: params.batchSize,
        lastKeyValue,
        offset,
      });

      extractedCount += batch.rows.length;
      lastKeyValue = batch.lastKeyValue;
      offset += batch.rows.length;

      if (params.incrementalColumn && batch.rows.length > 0) {
        const lastRow = batch.rows[batch.rows.length - 1];
        lastIncrementalValue = String(lastRow[params.incrementalColumn]);
      }

      if (!batch.hasMore) break;
    }

    return { totalCount, extractedCount, lastIncrementalValue };
  }
}
