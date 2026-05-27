import { apiClient } from './client';
import type {
  PipelineListQuery,
  PipelineListResponse,
  PipelineStatsResponse,
  CreatePipelineRequest,
  CreatePipelineResponse,
  GetDefinitionResponse,
  SaveDefinitionRequest,
  SaveDefinitionResponse,
  RawTablesResponse,
  ExecutePipelineResponse,
  TestPipelineResponse,
  PipelineProgressResponse,
  TogglePipelineResponse,
  UpdatePipelineRequest,
  UpdatePipelineResponse,
  DeletePipelineResponse,
  PublishVersionResponse,
  PipelineLogListResponse,
  PipelineLogDetailResponse,
  PipelineVersionListResponse,
  PipelineVersionDetailResponse,
  PipelineVersionDiffResponse,
  RollbackVersionResponse,
  EtlDashboardStatsResponse,
  EtlDashboardTrendResponse,
  EtlDashboardRunningResponse,
  EtlDashboardFailuresResponse,
  EtlDashboardSlowestResponse,
  TargetTableListResponse,
  TargetTableSchemaResponse,
} from '@cdmp/shared';

export async function getPipelineStats(): Promise<PipelineStatsResponse> {
  const response = await apiClient.get<PipelineStatsResponse>('/etl/pipelines/stats');
  return response.data;
}

export async function createPipeline(data: CreatePipelineRequest): Promise<CreatePipelineResponse> {
  const response = await apiClient.post<CreatePipelineResponse>('/etl/pipelines', data);
  return response.data;
}

export async function getPipelines(
  query: PipelineListQuery = {},
): Promise<PipelineListResponse> {
  const response = await apiClient.get<PipelineListResponse>('/etl/pipelines', {
    params: query,
  });
  return response.data;
}

export async function getPipelineDefinition(
  pipelineId: string,
): Promise<GetDefinitionResponse> {
  const response = await apiClient.get<GetDefinitionResponse>(
    `/etl/pipelines/${pipelineId}/definition`,
  );
  return response.data;
}

export async function savePipelineDefinition(
  pipelineId: string,
  data: SaveDefinitionRequest,
): Promise<SaveDefinitionResponse> {
  const response = await apiClient.put<SaveDefinitionResponse>(
    `/etl/pipelines/${pipelineId}/definition`,
    data,
  );
  return response.data;
}

export async function getRawTables(): Promise<RawTablesResponse> {
  const response = await apiClient.get<RawTablesResponse>('/extraction-tasks/raw-tables');
  return response.data;
}

export async function getRawTableColumns(tableName: string): Promise<{ data: string[] }> {
  const response = await apiClient.get<{ data: string[] }>(`/extraction-tasks/raw-tables/${tableName}/columns`);
  return response.data;
}

export async function executePipeline(id: string): Promise<ExecutePipelineResponse> {
  const response = await apiClient.post<ExecutePipelineResponse>(
    `/etl/pipelines/${id}/execute`,
  );
  return response.data;
}

export async function testPipeline(id: string): Promise<TestPipelineResponse> {
  const response = await apiClient.post<TestPipelineResponse>(
    `/etl/pipelines/${id}/test`,
  );
  return response.data;
}

export async function getPipelineProgress(id: string): Promise<PipelineProgressResponse> {
  const response = await apiClient.get<PipelineProgressResponse>(
    `/etl/pipelines/${id}/progress`,
  );
  return response.data;
}

export async function deletePipeline(id: string): Promise<DeletePipelineResponse> {
  const response = await apiClient.delete<DeletePipelineResponse>(`/etl/pipelines/${id}`);
  return response.data;
}

export async function togglePipeline(id: string, enabled: boolean): Promise<TogglePipelineResponse> {
  const response = await apiClient.patch<TogglePipelineResponse>(
    `/etl/pipelines/${id}/toggle`,
    { enabled },
  );
  return response.data;
}

// F093: Edit Pipeline metadata (name / description / schedule)
export async function updatePipeline(
  id: string,
  payload: UpdatePipelineRequest,
): Promise<UpdatePipelineResponse> {
  const response = await apiClient.patch<UpdatePipelineResponse>(
    `/etl/pipelines/${id}`,
    payload,
  );
  return response.data;
}

export async function getPipelineLogs(
  pipelineId: string,
  query: { page?: number; pageSize?: number } = {},
): Promise<PipelineLogListResponse> {
  const response = await apiClient.get<PipelineLogListResponse>(
    `/etl/pipelines/${pipelineId}/logs`,
    { params: query },
  );
  return response.data;
}

export async function getLogDetail(logId: string): Promise<PipelineLogDetailResponse> {
  const response = await apiClient.get<PipelineLogDetailResponse>(
    `/etl/logs/${logId}`,
  );
  return response.data;
}

export async function publishPipelineVersion(
  pipelineId: string,
  versionId: string,
): Promise<PublishVersionResponse> {
  const response = await apiClient.patch<PublishVersionResponse>(
    `/etl/pipelines/${pipelineId}/versions/${versionId}/publish`,
  );
  return response.data;
}

export async function getPipelineVersions(
  pipelineId: string,
): Promise<PipelineVersionListResponse> {
  const response = await apiClient.get<PipelineVersionListResponse>(
    `/etl/pipelines/${pipelineId}/versions`,
  );
  return response.data;
}

export async function getPipelineVersionDetail(
  pipelineId: string,
  versionId: string,
): Promise<PipelineVersionDetailResponse> {
  const response = await apiClient.get<PipelineVersionDetailResponse>(
    `/etl/pipelines/${pipelineId}/versions/${versionId}`,
  );
  return response.data;
}

export async function getPipelineVersionDiff(
  pipelineId: string,
  from: number,
  to: number,
): Promise<PipelineVersionDiffResponse> {
  const response = await apiClient.get<PipelineVersionDiffResponse>(
    `/etl/pipelines/${pipelineId}/versions/diff`,
    { params: { from, to } },
  );
  return response.data;
}

export async function rollbackPipelineVersion(
  pipelineId: string,
  versionId: string,
): Promise<RollbackVersionResponse> {
  const response = await apiClient.post<RollbackVersionResponse>(
    `/etl/pipelines/${pipelineId}/versions/${versionId}/rollback`,
  );
  return response.data;
}

// F035: Dashboard API
export async function getDashboardStats(): Promise<EtlDashboardStatsResponse> {
  const response = await apiClient.get<EtlDashboardStatsResponse>('/etl/dashboard/stats');
  return response.data;
}

export async function getDashboardTrend(
  range: '7d' | '14d' | '30d' = '7d',
): Promise<EtlDashboardTrendResponse> {
  const response = await apiClient.get<EtlDashboardTrendResponse>('/etl/dashboard/trend', {
    params: { range },
  });
  return response.data;
}

export async function getDashboardRunning(): Promise<EtlDashboardRunningResponse> {
  const response = await apiClient.get<EtlDashboardRunningResponse>('/etl/dashboard/running');
  return response.data;
}

export async function getDashboardFailures(): Promise<EtlDashboardFailuresResponse> {
  const response = await apiClient.get<EtlDashboardFailuresResponse>('/etl/dashboard/failures');
  return response.data;
}

export async function getDashboardSlowest(): Promise<EtlDashboardSlowestResponse> {
  const response = await apiClient.get<EtlDashboardSlowestResponse>('/etl/dashboard/slowest');
  return response.data;
}

// F036: Target Table APIs
export async function getTargetTables(): Promise<TargetTableListResponse> {
  const response = await apiClient.get<TargetTableListResponse>('/etl/target-tables');
  return response.data;
}

export async function getTargetTableSchema(tableName: string): Promise<TargetTableSchemaResponse> {
  const response = await apiClient.get<TargetTableSchemaResponse>(
    `/etl/target-tables/${tableName}/schema`,
  );
  return response.data;
}
