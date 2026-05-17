import {
  type BusinessRole,
  type EffectiveIdentity,
  type UserInfo,
  deriveEffectiveIdentity,
} from '@cdmp/shared';

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
 * ⚠️ DEPRECATED (AD-E07 v3.0)：由 getBusinessRole / getEffectiveIdentity 取代。
 * 過渡期保留：admin 視為 true，business_role 非 null 視為 true。
 */
export function getIsSalesManager(): boolean {
  const user = getUser();
  if (!user) return false;
  if (user.isSalesManager === true) return true;
  if (user.role === 'admin') return true;
  return user.businessRole === 'director' || user.businessRole === 'section_chief';
}

/**
 * F002 v2.0 / AD-E07 v3.0：取得當前登入身份的業務角色。
 * 'director' / 'section_chief' / null（一般使用者或 admin）。
 */
export function getBusinessRole(): BusinessRole {
  const user = getUser();
  if (!user) return null;
  if (user.businessRole === 'director' || user.businessRole === 'section_chief') {
    return user.businessRole;
  }
  return null;
}

/**
 * F002 v2.0 / AD-E07 v3.0：取得當前登入身份的 4-角色實質身份 label。
 * admin / director / section_chief / user。未登入時回傳 'user'。
 */
export function getEffectiveIdentity(): EffectiveIdentity {
  const user = getUser();
  if (!user) return 'user';
  return deriveEffectiveIdentity(user.role, user.businessRole);
}
