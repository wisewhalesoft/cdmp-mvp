import { Navigate } from 'react-router-dom';
import {
  isAuthenticated,
  getUserRole,
  getIsSalesManager,
  getBusinessRole,
} from '@/stores/auth-store';
import type { ReactNode } from 'react';

interface ProtectedRouteProps {
  children: ReactNode;
}

/**
 * F002 v1.2 / AD-E02-4-A：Route Guard 模型
 *
 * - ProtectedRoute：僅檢查 isAuthenticated（全身份可用）
 * - AdminRoute：role === 'admin'；未通過 redirect /c360/customers
 * - SalesManagerRoute：role === 'admin' OR isSalesManager === true；
 *     未通過 redirect /c360/customers
 * - UserRoute：deprecated；保留 export 並 delegate 至 ProtectedRoute 以避免
 *     既有 import 出現 breaking 變更
 */

export function ProtectedRoute({ children }: ProtectedRouteProps) {
  if (!isAuthenticated()) {
    return <Navigate to="/login" replace />;
  }
  return <>{children}</>;
}

export function AdminRoute({ children }: ProtectedRouteProps) {
  if (!isAuthenticated()) {
    return <Navigate to="/login" replace />;
  }
  const role = getUserRole();
  if (role !== 'admin') {
    // AD-E02-4-A 變更：redirect 目標 /user-info → /c360/customers
    return <Navigate to="/c360/customers" replace />;
  }
  return <>{children}</>;
}

export function SalesManagerRoute({ children }: ProtectedRouteProps) {
  if (!isAuthenticated()) {
    return <Navigate to="/login" replace />;
  }
  const role = getUserRole();
  // 嚴格 === true 比對（RISK-AD-E02-4-1）：admin 為超集，無需持有旗標
  if (role !== 'admin' && getIsSalesManager() !== true) {
    return <Navigate to="/c360/customers" replace />;
  }
  return <>{children}</>;
}

/**
 * F002 v2.0 / AD-E07 v3.0：4-角色 Route Guards
 *
 * - DirectorRoute：role === 'admin' OR businessRole === 'director'（M02 / M03a/c / M04 trigger / M03d Rollback）
 * - DirectorOrSectionChiefRoute：role === 'admin' OR businessRole IN ('director', 'section_chief')
 *
 * 失敗時 redirect 至 /c360/customers（沿用既有 fallback 行為）。
 */

export function DirectorRoute({ children }: ProtectedRouteProps) {
  if (!isAuthenticated()) {
    return <Navigate to="/login" replace />;
  }
  const role = getUserRole();
  const businessRole = getBusinessRole();
  if (role !== 'admin' && businessRole !== 'director') {
    return <Navigate to="/c360/customers" replace />;
  }
  return <>{children}</>;
}

export function DirectorOrSectionChiefRoute({ children }: ProtectedRouteProps) {
  if (!isAuthenticated()) {
    return <Navigate to="/login" replace />;
  }
  const role = getUserRole();
  const businessRole = getBusinessRole();
  if (
    role !== 'admin' &&
    businessRole !== 'director' &&
    businessRole !== 'section_chief'
  ) {
    return <Navigate to="/c360/customers" replace />;
  }
  return <>{children}</>;
}

/**
 * @deprecated AD-E02-4-A：UserRoute 已廢棄。/user-info 改用 ProtectedRoute。
 * 此 export 僅作為避免既有 import 編譯錯誤的橋接層，內部 delegate 至
 * ProtectedRoute。新程式請改用 ProtectedRoute。
 */
export function UserRoute({ children }: ProtectedRouteProps) {
  return <ProtectedRoute>{children}</ProtectedRoute>;
}
