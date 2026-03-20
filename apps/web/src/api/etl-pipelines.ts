import { apiClient } from './client';
import type {
  PipelineListQuery,
  PipelineListResponse,
  PipelineStatsResponse,
} from '@cdmp/shared';

export async function getPipelineStats(): Promise<PipelineStatsResponse> {
  const response = await apiClient.get<PipelineStatsResponse>('/etl/pipelines/stats');
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
