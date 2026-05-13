import type { UserInfo } from '@cdmp/shared';

const AUTH_TOKEN_KEY = 'token';
const AUTH_USER_KEY = 'user';

export function getToken(): string | null {
  return localStorage.getItem(AUTH_TOKEN_KEY);
}

export function getUser(): UserInfo | null {
  const raw = localStorage.getItem(AUTH_USER_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as UserInfo;
  } catch {
    return null;
  }
}

export function setAuth(token: string, user: UserInfo): void {
  localStorage.setItem(AUTH_TOKEN_KEY, token);
  localStorage.setItem(AUTH_USER_KEY, JSON.stringify(user));
}

export function clearAuth(): void {
  localStorage.removeItem(AUTH_TOKEN_KEY);
  localStorage.removeItem(AUTH_USER_KEY);
}

export function isAuthenticated(): boolean {
  return getToken() !== null;
}

export function getUserRole(): 'admin' | 'user' | null {
  const user = getUser();
  return user?.role ?? null;
}

/**
 * F002 v1.2 / AD-E02-4：取得當前登入身份的業務主管旗標。
 *
 * 嚴格 === true 比對（RISK-AD-E02-4-1）：
 * - 舊 token 可能無 isSalesManager 欄位（undefined） → 視為 false
 * - 字串 "true"、數字 1 等 truthy 值 → 視為 false
 * - 僅 boolean true 才回傳 true
 */
export function getIsSalesManager(): boolean {
  const user = getUser();
  return user?.isSalesManager === true;
}
