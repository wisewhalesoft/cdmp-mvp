// Shared types between API and Web

export interface LoginRequest {
  email: string;
  password: string;
  rememberMe?: boolean;
}

export interface LoginResponse {
  token: string;
  user: UserInfo;
}

export interface UserInfo {
  id: string;
  name: string;
  email: string;
  role: 'admin' | 'user';
}

export interface ApiError {
  error: string;
  message: string;
}

export interface LogoutResponse {
  message: string;
}

export interface CreateAccountRequest {
  name: string;
  email: string;
  password: string;
  role: 'admin' | 'user';
}

export interface CreateAccountResponse {
  id: string;
  name: string;
  email: string;
  role: 'admin' | 'user';
  status: 'active';
  created_at: string;
}

// F006: Edit Account
export interface UpdateAccountRequest {
  name: string;
  email: string;
}

export interface UpdateAccountResponse {
  id: string;
  name: string;
  email: string;
  role: 'admin' | 'user';
  status: 'active' | 'disabled';
  created_at: string;
  updated_at: string;
}

// F007: Toggle Account Status
export interface UpdateStatusRequest {
  status: 'active' | 'disabled';
}

export interface UpdateStatusResponse {
  id: string;
  name: string;
  email: string;
  role: 'admin' | 'user';
  status: 'active' | 'disabled';
  updated_at: string;
}

// F008: Change Role
export interface UpdateRoleRequest {
  role: 'admin' | 'user';
}

export interface UpdateRoleResponse {
  id: string;
  name: string;
  email: string;
  role: 'admin' | 'user';
  status: 'active' | 'disabled';
  updated_at: string;
}

// F005: Account List
export interface AccountListQuery {
  page?: number;
  limit?: number;
  search?: string;
  role?: 'admin' | 'user';
  status?: 'active' | 'disabled';
}

export interface AccountListItem {
  id: string;
  name: string;
  email: string;
  role: 'admin' | 'user';
  status: 'active' | 'disabled';
  created_at: string;
}

export interface AccountListResponse {
  data: AccountListItem[];
  total: number;
  page: number;
  limit: number;
}

// F009: Password Reset
export interface ForgotPasswordRequest {
  email: string;
}

export interface ForgotPasswordResponse {
  message: string;
}

export interface ResetPasswordRequest {
  token: string;
  newPassword: string;
}

export interface ResetPasswordResponse {
  message: string;
}

// F010: Admin Reset Password
export interface AdminResetPasswordRequest {
  newPassword: string;
}

export interface AdminResetPasswordResponse {
  message: string;
}

// F011: Datasource
export type DatasourceType = 'mysql' | 'postgresql' | 'sqlserver';
export type DatasourceStatus = 'connected' | 'disconnected' | 'unknown';

export interface CreateDatasourceRequest {
  name: string;
  type: DatasourceType;
  host: string;
  port: number;
  databaseName: string;
  username: string;
  password: string;
  description?: string;
}

export interface CreateDatasourceResponse {
  id: string;
  name: string;
  type: DatasourceType;
  host: string;
  port: number;
  databaseName: string;
  username: string;
  description: string | null;
  status: string;
  lastTestedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

// F013: Edit Datasource
export interface UpdateDatasourceRequest {
  name: string;
  type: DatasourceType;
  host: string;
  port: number;
  databaseName: string;
  username: string;
  password?: string | null;
  description?: string | null;
}

// Reuse the same response shape for GET /:id and PUT /:id
export type DatasourceDetailResponse = CreateDatasourceResponse;

// F014: Delete Datasource
export interface DeleteDatasourceResponse {
  message: string;
  id: string;
}

// F012: Datasource List
export interface DatasourceListQuery {
  page?: number;
  limit?: number;
  search?: string;
  type?: DatasourceType;
  status?: DatasourceStatus;
}

export interface DatasourceListItem {
  id: string;
  name: string;
  type: DatasourceType;
  host: string;
  port: number;
  databaseName: string;
  username: string;
  description: string | null;
  status: DatasourceStatus;
  lastTestedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface DatasourceListResponse {
  data: DatasourceListItem[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

export const ERROR_CODES = {
  VALIDATION_ERROR: 'VALIDATION_ERROR',
  INVALID_CREDENTIALS: 'AUTH_INVALID_CREDENTIALS',
  ACCOUNT_DISABLED: 'AUTH_ACCOUNT_DISABLED',
  FORBIDDEN: 'AUTH_FORBIDDEN',
  ACCOUNT_EMAIL_EXISTS: 'ACCOUNT_EMAIL_EXISTS',
  RATE_LIMITED: 'RATE_LIMITED',
  TOKEN_REVOKED: 'AUTH_TOKEN_REVOKED',
  TOKEN_EXPIRED: 'AUTH_TOKEN_EXPIRED',
  TOKEN_MISSING: 'AUTH_TOKEN_MISSING',
  ACCOUNT_EMAIL_IN_USE: 'ACCOUNT_EMAIL_IN_USE',
  ACCOUNT_NOT_FOUND: 'ACCOUNT_NOT_FOUND',
  ACCOUNT_SELF_DISABLE: 'ACCOUNT_SELF_DISABLE',
  ACCOUNT_LAST_ADMIN: 'ACCOUNT_LAST_ADMIN',
  VALIDATION_INVALID_ROLE: 'VALIDATION_INVALID_ROLE',
  RESET_TOKEN_EXPIRED: 'AUTH_RESET_TOKEN_EXPIRED',
  RESET_TOKEN_USED: 'AUTH_RESET_TOKEN_USED',
  RESET_TOKEN_INVALID: 'AUTH_RESET_TOKEN_INVALID',
  VALIDATION_PASSWORD_LENGTH: 'VALIDATION_PASSWORD_LENGTH',
  EMAIL_SEND_FAILED: 'SYSTEM_EMAIL_SEND_FAILED',
  ACCOUNT_SELF_RESET: 'ACCOUNT_SELF_RESET',
  // F011: Datasource
  DS_NAME_EXISTS: 'DS_NAME_EXISTS',
  DS_NOT_FOUND: 'DS_NOT_FOUND',
  VALIDATION_INVALID_TYPE: 'VALIDATION_INVALID_TYPE',
  VALIDATION_PORT_RANGE: 'VALIDATION_PORT_RANGE',
} as const;

export const ERROR_MESSAGES = {
  VALIDATION_ERROR: '請提供有效的 Email 與密碼',
  INVALID_CREDENTIALS: 'Email 或密碼錯誤',
  ACCOUNT_DISABLED: '您的帳號已被停用，請聯絡管理員。',
  FORBIDDEN: '您沒有權限執行此操作。',
  RATE_LIMITED: '登入嘗試過於頻繁，請稍後再試。',
  ACCOUNT_EMAIL_EXISTS: '此 Email 已有帳號存在',
  INVALID_EMAIL: '請輸入有效的 Email 地址',
  PASSWORD_REQUIRED: '請輸入密碼',
  TOKEN_REVOKED: 'Session 已失效，請重新登入。',
  TOKEN_EXPIRED: 'Session 已過期，請重新登入。',
  TOKEN_MISSING: '請先登入。',
  ACCOUNT_EMAIL_IN_USE: '此 Email 已被使用',
  ACCOUNT_NOT_FOUND: '找不到指定的帳號',
  ACCOUNT_SELF_DISABLE: '您無法停用自己的帳號',
  ACCOUNT_LAST_ADMIN: '無法移除最後一位 Admin，系統必須至少保留一個 Admin 帳號。',
  VALIDATION_INVALID_ROLE: '角色必須為 admin 或 user',
  RESET_TOKEN_EXPIRED: '此連結已過期，請重新申請密碼重設',
  RESET_TOKEN_USED: '此連結已失效',
  RESET_TOKEN_INVALID: '重設連結無效',
  VALIDATION_PASSWORD_LENGTH: '密碼長度不得少於 8 個字元',
  EMAIL_SEND_FAILED: '郵件發送失敗，請稍後再試',
  ACCOUNT_SELF_RESET: '請透過個人設定變更您自己的密碼',
  // F011: Datasource
  DS_NAME_EXISTS: '此名稱的資料來源已存在',
  DS_NOT_FOUND: '找不到指定的資料來源',
  VALIDATION_INVALID_TYPE: '資料來源類型必須為 mysql、postgresql 或 sqlserver',
  VALIDATION_PORT_RANGE: '連接埠必須介於 1 到 65535 之間',
} as const;
