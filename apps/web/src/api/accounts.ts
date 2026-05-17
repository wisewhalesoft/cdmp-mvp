import type {
  CreateAccountRequest,
  CreateAccountResponse,
  UpdateAccountRequest,
  UpdateAccountResponse,
  UpdateStatusRequest,
  UpdateStatusResponse,
  UpdateRoleRequest,
  UpdateRoleResponse,
  UpdateBusinessRoleRequest,
  UpdateBusinessRoleResponse,
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

// F006a v1.0 / AD-E07 v3.0 (2026-05-16)：唯一 business_role 寫入入口
// PATCH /api/v1/accounts/:id/business-role（Admin only）
// 同 transaction 觸發 password_changed_at，使該 user 既有 JWT 全數失效。
export async function updateBusinessRole(
  id: string,
  data: UpdateBusinessRoleRequest,
): Promise<UpdateBusinessRoleResponse> {
  const response = await apiClient.patch<UpdateBusinessRoleResponse>(
    `/accounts/${id}/business-role`,
    data,
  );
  return response.data;
}

export async function adminResetPassword(id: string, data: AdminResetPasswordRequest): Promise<AdminResetPasswordResponse> {
  const response = await apiClient.post<AdminResetPasswordResponse>(`/accounts/${id}/reset-password`, data);
  return response.data;
}
