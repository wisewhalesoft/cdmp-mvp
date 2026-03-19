export const EXTRACTION_EXECUTOR = 'EXTRACTION_EXECUTOR';

export interface ExtractionExecutorResult {
  totalCount: number;
  extractedCount: number;
  lastIncrementalValue?: string | null;
}

export interface ColumnMetadata {
  name: string;
  dataType: string;
  isPrimary: boolean;
}

export interface IExtractionExecutor {
  /**
   * Execute extraction against the target datasource/table.
   * Returns the count of rows extracted.
   * For MVP, this does COUNT(*) in batches via keyset pagination.
   */
  execute(params: {
    datasourceId: string;
    targetTable: string;
    sourceSchema?: string | null;
    mode: 'full' | 'incremental';
    incrementalColumn?: string | null;
    lastIncrementalValue?: string | null;
    batchSize: number;
  }): Promise<ExtractionExecutorResult>;

  /**
   * Get column metadata from the source table.
   */
  getSourceTableMetadata(params: {
    datasourceId: string;
    sourceTable: string;
    sourceSchema?: string | null;
  }): Promise<ColumnMetadata[]>;

  /**
   * Get count of rows to extract.
   */
  getSourceCount(params: {
    datasourceId: string;
    sourceTable: string;
    sourceSchema?: string | null;
    mode: 'full' | 'incremental';
    incrementalColumn?: string | null;
    lastIncrementalValue?: string | null;
  }): Promise<number>;

  /**
   * Read a batch of rows from the source table.
   */
  readBatch(params: {
    datasourceId: string;
    sourceTable: string;
    sourceSchema?: string | null;
    mode: 'full' | 'incremental';
    incrementalColumn?: string | null;
    lastIncrementalValue?: string | null;
    batchSize: number;
    lastKeyValue?: any;
    primaryKeyColumn?: string | null;
  }): Promise<{ rows: Record<string, any>[]; lastKeyValue?: any; hasMore: boolean }>;

  /**
   * List available schemas in the datasource.
   */
  listSchemas(params: { datasourceId: string }): Promise<string[]>;

  /**
   * List tables in a specific schema of the datasource.
   */
  listTables(params: { datasourceId: string; schema: string }): Promise<string[]>;
}
