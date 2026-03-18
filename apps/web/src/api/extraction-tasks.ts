import { apiClient } from './client';
import type { ExtractionTaskListQuery, ExtractionTaskListResponse } from '@cdmp/shared';

export interface CreateExtractionTaskRequest {
  name: string;
  datasourceId: string;
  mode: 'full' | 'incremental';
  targetTable: string;
  schedule: string;
  incrementalColumn?: string;
  lastIncrementalValue?: string;
}

export interface CreateExtractionTaskResponse {
  id: string;
  name: string;
  datasourceId: string;
  datasourceName: string;
  mode: 'full' | 'incremental';
  status: string;
  targetTable: string;
  incrementalColumn: string | null;
  lastIncrementalValue: string | null;
  schedule: string;
  enabled: boolean;
  lastExecutionAt: string | null;
  extractedCount: number;
  totalCount: number;
  progressPercent: number;
  avgDurationMs: number;
  executionCount: number;
  errorMessage: string | null;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

export interface DatasourceOption {
  id: string;
  name: string;
  type: string;
}

export async function createExtractionTask(
  data: CreateExtractionTaskRequest,
): Promise<CreateExtractionTaskResponse> {
  const response = await apiClient.post<CreateExtractionTaskResponse>('/extraction-tasks', data);
  return response.data;
}

export async function getDatasourceOptions(): Promise<DatasourceOption[]> {
  const response = await apiClient.get<{ data: DatasourceOption[] }>('/datasources', {
    params: { page: 1, limit: 100 },
  });
  return response.data.data;
}

export async function getExtractionTasks(
  query: ExtractionTaskListQuery,
): Promise<ExtractionTaskListResponse> {
  const response = await apiClient.get<ExtractionTaskListResponse>('/extraction-tasks', {
    params: query,
  });
  return response.data;
}
