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
