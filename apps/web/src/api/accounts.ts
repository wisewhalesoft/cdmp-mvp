import type { CreateAccountRequest, CreateAccountResponse } from '@cdmp/shared';
import { apiClient } from './client';

export async function createAccount(data: CreateAccountRequest): Promise<CreateAccountResponse> {
  const response = await apiClient.post<CreateAccountResponse>('/accounts', data);
  return response.data;
}
