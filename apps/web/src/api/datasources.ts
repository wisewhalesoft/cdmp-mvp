import type { CreateDatasourceRequest, CreateDatasourceResponse, DatasourceDetailResponse, UpdateDatasourceRequest, DatasourceListQuery, DatasourceListResponse } from '@cdmp/shared';
import { apiClient } from './client';

export async function createDatasource(data: CreateDatasourceRequest): Promise<CreateDatasourceResponse> {
  const response = await apiClient.post<CreateDatasourceResponse>('/datasources', data);
  return response.data;
}

export async function getDatasources(query: DatasourceListQuery): Promise<DatasourceListResponse> {
  const response = await apiClient.get<DatasourceListResponse>('/datasources', { params: query });
  return response.data;
}

export async function getDatasource(id: string): Promise<DatasourceDetailResponse> {
  const response = await apiClient.get<DatasourceDetailResponse>(`/datasources/${id}`);
  return response.data;
}

export async function updateDatasource(id: string, data: UpdateDatasourceRequest): Promise<DatasourceDetailResponse> {
  const response = await apiClient.put<DatasourceDetailResponse>(`/datasources/${id}`, data);
  return response.data;
}
