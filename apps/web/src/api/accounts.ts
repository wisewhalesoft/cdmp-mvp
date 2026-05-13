import type {
  CreateAccountRequest,
  CreateAccountResponse,
  UpdateAccountRequest,
  UpdateAccountResponse,
  UpdateStatusRequest,
  UpdateStatusResponse,
  UpdateRoleRequest,
  UpdateRoleResponse,
  UpdateSalesManagerFlagRequest,
  UpdateSalesManagerFlagResponse,
  AccountListQuery,
  AccountListResponse,
  AdminResetPasswordRequest,
  AdminResetPasswordResponse,
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

export async function updateAccountStatus(id: string, data: UpdateStatusRequest): Promise<UpdateStatusResponse> {
  const response = await apiClient.patch<UpdateStatusResponse>(`/accounts/${id}/status`, data);
  return response.data;
}

export async function updateAccountRole(id: string, data: UpdateRoleRequest): Promise<UpdateRoleResponse> {
  const response = await apiClient.patch<UpdateRoleResponse>(`/accounts/${id}/role`, data);
  return response.data;
}

// F008 v3.2: 切換業務主管旗標
export async function updateAccountSalesManagerFlag(
  id: string,
  data: UpdateSalesManagerFlagRequest,
): Promise<UpdateSalesManagerFlagResponse> {
  const response = await apiClient.patch<UpdateSalesManagerFlagResponse>(
    `/accounts/${id}/sales-manager-flag`,
    data,
  );
  return response.data;
}

export async function adminResetPassword(id: string, data: AdminResetPasswordRequest): Promise<AdminResetPasswordResponse> {
  const response = await apiClient.post<AdminResetPasswordResponse>(`/accounts/${id}/reset-password`, data);
  return response.data;
}
