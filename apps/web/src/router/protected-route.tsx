import { Navigate } from 'react-router-dom';
import { isAuthenticated, getUserRole } from '@/stores/auth-store';
import type { ReactNode } from 'react';

interface ProtectedRouteProps {
  children: ReactNode;
}

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
    return <Navigate to="/user-info" replace />;
  }
  return <>{children}</>;
}

export function UserRoute({ children }: ProtectedRouteProps) {
  if (!isAuthenticated()) {
    return <Navigate to="/login" replace />;
  }
  const role = getUserRole();
  if (role !== 'user') {
    return <Navigate to="/" replace />;
  }
  return <>{children}</>;
}
