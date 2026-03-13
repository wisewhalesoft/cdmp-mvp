import type { LoginRequest, LoginResponse, LogoutResponse } from '@cdmp/shared';
import { apiClient } from './client';

export async function login(data: LoginRequest): Promise<LoginResponse> {
  const response = await apiClient.post<LoginResponse>('/auth/login', data);
  return response.data;
}

export async function logout(): Promise<LogoutResponse> {
  const response = await apiClient.post<LogoutResponse>('/auth/logout');
  return response.data;
}
