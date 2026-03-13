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

export const ERROR_CODES = {
  VALIDATION_ERROR: 'VALIDATION_ERROR',
  INVALID_CREDENTIALS: 'AUTH_INVALID_CREDENTIALS',
  ACCOUNT_DISABLED: 'AUTH_ACCOUNT_DISABLED',
  FORBIDDEN: 'AUTH_FORBIDDEN',
  RATE_LIMITED: 'RATE_LIMITED',
} as const;

export const ERROR_MESSAGES = {
  VALIDATION_ERROR: '請提供有效的 Email 與密碼',
  INVALID_CREDENTIALS: 'Email 或密碼錯誤',
  ACCOUNT_DISABLED: '您的帳號已被停用，請聯絡管理員。',
  FORBIDDEN: '您沒有權限執行此操作。',
  RATE_LIMITED: '登入嘗試過於頻繁，請稍後再試。',
  INVALID_EMAIL: '請輸入有效的 Email 地址',
  PASSWORD_REQUIRED: '請輸入密碼',
} as const;
