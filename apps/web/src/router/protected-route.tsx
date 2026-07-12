import { Navigate } from 'react-router-dom';
import {
  isAuthenticated,
  getUserRole,
  getIsSalesManager,
  getBusinessRole,
  getDefaultHomePath,
} from '@/stores/auth-store';
import type { ReactNode } from 'react';

interface ProtectedRouteProps {
  children: ReactNode;
}

/**
 * F002 v1.2 / v2.1.0：Route Guard 模型
 *
 * - ProtectedRoute：僅檢查 isAuthenticated（全身份可用）
 * - AdminRoute：role === 'admin'；未通過 redirect 至角色感知預設頁（getDefaultHomePath）
 * - Customer360Route（v2.1.0 / US-177 / F111）：admin 或 一般使用者（businessRole NOT IN
 *     ('director','section_chief')）可進；業務角色（director / section_chief）redirect
 *     至 /assignment/overview
 * - SalesManagerRoute：role === 'admin' OR isSalesManager === true；未通過 redirect
 *     至角色感知預設頁
 * - UserRoute：deprecated；保留 export 並 delegate 至 ProtectedRoute 以避免
 *     既有 import 出現 breaking 變更
 *
 * v2.1.0 變更：各 Guard 未通過時之 fallback 由硬編 /c360/customers 改為角色感知
 * getDefaultHomePath()——業務角色（director / section_chief）落在 /assignment/overview
 * （其已無 Customer 360 存取權），一般使用者落在 /c360/customers。
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
    // v2.1.0：角色感知 fallback（director / section_chief → /assignment/overview）
    return <Navigate to={getDefaultHomePath()} replace />;
  }
  return <>{children}</>;
}

/**
 * F002 v2.1.0 / US-177 / F111：Customer 360 路由守衛。
 *
 * 通過條件：role === 'admin' 或 businessRole NOT IN ('director','section_chief')
 * （即一般使用者，businessRole 為 null/undefined）。
 * 業務角色（director / section_chief）無 Customer 360 存取權 → redirect
 * 至 /assignment/overview（純前端強制；後端 E06 端點維持 authenticated）。
 */
export function Customer360Route({ children }: ProtectedRouteProps) {
  if (!isAuthenticated()) {
    return <Navigate to="/login" replace />;
  }
  const role = getUserRole();
  const businessRole = getBusinessRole();
  if (
    role !== 'admin' &&
    (businessRole === 'director' || businessRole === 'section_chief')
  ) {
    return <Navigate to="/assignment/overview" replace />;
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
    return <Navigate to={getDefaultHomePath()} replace />;
  }
  return <>{children}</>;
}

/**
 * F002 v2.0 / AD-E07 v3.0：4-角色 Route Guards
 *
 * - DirectorRoute：role === 'admin' OR businessRole === 'director'（M02 / M03a/c / M04 trigger / M03d Rollback）
 * - DirectorOrSectionChiefRoute：role === 'admin' OR businessRole IN ('director', 'section_chief')
 *
 * 失敗時 redirect 至角色感知預設頁（getDefaultHomePath；v2.1.0）。
 */

export function DirectorRoute({ children }: ProtectedRouteProps) {
  if (!isAuthenticated()) {
    return <Navigate to="/login" replace />;
  }
  const role = getUserRole();
  const businessRole = getBusinessRole();
  if (role !== 'admin' && businessRole !== 'director') {
    return <Navigate to={getDefaultHomePath()} replace />;
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
    return <Navigate to={getDefaultHomePath()} replace />;
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
