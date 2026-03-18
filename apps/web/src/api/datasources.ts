import type { CreateDatasourceRequest, CreateDatasourceResponse, DeleteDatasourceResponse, DatasourceDetailResponse, UpdateDatasourceRequest, DatasourceListQuery, DatasourceListResponse, TestConnectionResponse, DashboardResponse, MetricsResponse, AlertsResponse, DatasourceSchemasResponse, DatasourceTablesResponse } from '@cdmp/shared';
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

export async function deleteDatasource(id: string): Promise<DeleteDatasourceResponse> {
  const response = await apiClient.delete<DeleteDatasourceResponse>(`/datasources/${id}`);
  return response.data;
}

export async function testDatasourceConnection(id: string): Promise<TestConnectionResponse> {
  const response = await apiClient.post<TestConnectionResponse>(`/datasources/${id}/test`);
  return response.data;
}

// F016: Dashboard APIs
export async function getDashboard(): Promise<DashboardResponse> {
  const response = await apiClient.get<DashboardResponse>('/datasources/dashboard');
  return response.data;
}

export async function getMetrics(datasourceId: string, range: string = '24h'): Promise<MetricsResponse> {
  const response = await apiClient.get<MetricsResponse>(`/datasources/${datasourceId}/metrics`, { params: { range } });
  return response.data;
}

export async function getAlerts(): Promise<AlertsResponse> {
  const response = await apiClient.get<AlertsResponse>('/datasources/alerts');
  return response.data;
}

// Schema/Table discovery for cascade dropdowns
export async function getDatasourceSchemas(id: string): Promise<DatasourceSchemasResponse> {
  const response = await apiClient.get<DatasourceSchemasResponse>(`/datasources/${id}/schemas`);
  return response.data;
}

export async function getDatasourceTables(id: string, schema: string): Promise<DatasourceTablesResponse> {
  const response = await apiClient.get<DatasourceTablesResponse>(
    `/datasources/${id}/schemas/${encodeURIComponent(schema)}/tables`,
  );
  return response.data;
}
