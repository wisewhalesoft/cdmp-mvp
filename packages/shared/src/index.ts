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
} as const;
