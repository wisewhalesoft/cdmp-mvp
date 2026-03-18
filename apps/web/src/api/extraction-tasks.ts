import { apiClient } from './client';
import type { ExtractionTaskListQuery, ExtractionTaskListResponse, RunExtractionTaskResponse, RawDataResponse } from '@cdmp/shared';

export interface CreateExtractionTaskRequest {
  name: string;
  datasourceId: string;
  mode: 'full' | 'incremental';
  sourceTable: string;
  sourceSchema?: string;
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
  sourceTable: string;
  sourceSchema: string | null;
  rawTableName: string | null;
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

export interface UpdateExtractionTaskRequest {
  name?: string;
  datasourceId?: string;
  mode?: 'full' | 'incremental';
  sourceTable?: string;
  sourceSchema?: string;
  schedule?: string;
  incrementalColumn?: string;
  lastIncrementalValue?: string;
}

export async function getExtractionTask(id: string): Promise<CreateExtractionTaskResponse> {
  const response = await apiClient.get<CreateExtractionTaskResponse>(`/extraction-tasks/${id}`);
  return response.data;
}

export async function updateExtractionTask(
  id: string,
  data: UpdateExtractionTaskRequest,
): Promise<CreateExtractionTaskResponse> {
  const response = await apiClient.patch<CreateExtractionTaskResponse>(`/extraction-tasks/${id}`, data);
  return response.data;
}

export async function toggleExtractionTask(
  id: string,
  enabled: boolean,
): Promise<CreateExtractionTaskResponse> {
  const response = await apiClient.patch<CreateExtractionTaskResponse>(
    `/extraction-tasks/${id}/toggle`,
    { enabled },
  );
  return response.data;
}

export async function runExtractionTask(
  id: string,
  triggeredBy: 'manual' | 'retry',
): Promise<RunExtractionTaskResponse> {
  const response = await apiClient.post<RunExtractionTaskResponse>(
    `/extraction-tasks/${id}/run`,
    { triggeredBy },
  );
  return response.data;
}

export async function getExtractionTasks(
  query: ExtractionTaskListQuery,
): Promise<ExtractionTaskListResponse> {
  const response = await apiClient.get<ExtractionTaskListResponse>('/extraction-tasks', {
    params: query,
  });
  return response.data;
}

export async function getRawData(
  taskId: string,
  params?: {
    page?: number;
    limit?: number;
    sortBy?: string;
    sortOrder?: 'asc' | 'desc';
  },
): Promise<RawDataResponse> {
  const response = await apiClient.get<RawDataResponse>(`/extraction-tasks/${taskId}/raw-data`, {
    params,
  });
  return response.data;
}
