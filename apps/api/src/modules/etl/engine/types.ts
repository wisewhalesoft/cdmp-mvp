/**
 * ETL Engine Core Types
 * F042: 執行引擎核心框架介面定義
 * In-DB SQL Strategy: 所有資料透過 PostgreSQL temp table 傳遞，避免 OOM
 */

import { DataSource, QueryRunner } from 'typeorm';

/**
 * DataSet 代表一個 temp table 引用，而非記憶體中的資料陣列。
 * 節點之間透過 temp table 名稱傳遞資料，所有轉換用 SQL 完成。
 */
export interface DataSet {
  tempTable: string;  // e.g. "etl_tmp_e1_abc12345"
  rowCount: number;
}

export interface PipelineNode {
  id: string;
  type: string;
  position: { x: number; y: number };
  data: {
    nodeType: string;
    label: string;
    subtitle?: string;
    [key: string]: unknown;
  };
}

export interface PipelineEdge {
  id: string;
  source: string;
  target: string;
  targetHandle?: string; // 'left-input' | 'right-input' | undefined
}

export interface PipelineDefinition {
  nodes: PipelineNode[];
  edges: PipelineEdge[];
}

export interface NodeExecutionContext {
  node: PipelineNode;
  inputs: Record<string, DataSet>;
  pipelineId: string;
  logId: string;
  isTestRun: boolean;
  queryRunner: QueryRunner;
}

export interface NodeExecutor {
  readonly nodeType: string;
  execute(context: NodeExecutionContext): Promise<DataSet>;
}

export interface NodeLogEntry {
  nodeId: string;
  nodeType: string;
  nodeName: string;
  status: 'pending' | 'running' | 'completed' | 'failed' | 'skipped';
  durationMs: number;
  inputRowCount?: number;
  outputRowCount?: number;
  errorMessage?: string | null;
}

export interface PipelineRunnerConfig {
  batchSize: number;        // Extract batch read size (default 10,000)
  upsertBatchSize: number;  // Load batch UPSERT size (default 500)
  isTestRun: boolean;
  pipelineId: string;
  logId: string;
}

/**
 * 產生 temp table 名稱，格式: etl_tmp_{nodeId}_{logId前8碼}
 * 避免並發衝突
 */
export function makeTempTableName(nodeId: string, logId: string): string {
  const safeNodeId = nodeId.replace(/[^a-zA-Z0-9_]/g, '_');
  const logPrefix = logId.replace(/-/g, '').substring(0, 8);
  return `etl_tmp_${safeNodeId}_${logPrefix}`;
}

/**
 * 空 DataSet：temp table 名稱為空字串，rowCount 為 0
 */
export function emptyDataSet(): DataSet {
  return { tempTable: '', rowCount: 0 };
}
