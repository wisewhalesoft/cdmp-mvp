import type {
  CreateAccountRequest,
  CreateAccountResponse,
  UpdateAccountRequest,
  UpdateAccountResponse,
  AccountListQuery,
  AccountListResponse,
} from '@cdmp/shared';
import { apiClient } from './client';

export async function createAccount(data: CreateAccountRequest): Promise<CreateAccountResponse> {
  const response = await apiClient.post<CreateAccountResponse>('/accounts', data);
  return response.data;
}

export async function getAccounts(query?: AccountListQuery): Promise<AccountListResponse> {
  const params: Record<string, string> = {};
  if (query?.page) params.page = String(query.page);
  if (query?.limit) params.limit = String(query.limit);
  if (query?.search) params.search = query.search;
  if (query?.role) params.role = query.role;
  if (query?.status) params.status = query.status;

  const response = await apiClient.get<AccountListResponse>('/accounts', { params });
  return response.data;
}

export async function updateAccount(id: string, data: UpdateAccountRequest): Promise<UpdateAccountResponse> {
  const response = await apiClient.put<UpdateAccountResponse>(`/accounts/${id}`, data);
  return response.data;
}
