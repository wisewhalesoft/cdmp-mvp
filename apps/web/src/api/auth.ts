import type { LoginRequest, LoginResponse } from '@cdmp/shared';
import { apiClient } from './client';

export async function login(data: LoginRequest): Promise<LoginResponse> {
  const response = await apiClient.post<LoginResponse>('/auth/login', data);
  return response.data;
}
