import type { CreateDatasourceRequest, CreateDatasourceResponse, DatasourceListQuery, DatasourceListResponse } from '@cdmp/shared';
import { apiClient } from './client';

export async function createDatasource(data: CreateDatasourceRequest): Promise<CreateDatasourceResponse> {
  const response = await apiClient.post<CreateDatasourceResponse>('/datasources', data);
  return response.data;
}

export async function getDatasources(query: DatasourceListQuery): Promise<DatasourceListResponse> {
  const response = await apiClient.get<DatasourceListResponse>('/datasources', { params: query });
  return response.data;
}
