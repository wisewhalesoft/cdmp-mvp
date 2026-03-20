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
