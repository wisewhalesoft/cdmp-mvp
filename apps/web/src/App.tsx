import { Routes, Route, Navigate } from 'react-router-dom';
import { LoginPage } from '@/pages/login/login-page';
import { UserInfoPage } from '@/pages/user-info/user-info-page';
import { AccountListPage } from '@/pages/accounts/account-list-page';
import { ForgotPasswordPage } from '@/pages/forgot-password/forgot-password-page';
import { ResetPasswordPage } from '@/pages/reset-password/reset-password-page';
import { AddDatasourcePage } from '@/pages/datasources/add-datasource-page';
import { DatasourceListPage } from '@/pages/datasources/datasource-list-page';
import { AdminRoute, UserRoute } from '@/router/protected-route';

export function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route path="/forgot-password" element={<ForgotPasswordPage />} />
      <Route path="/reset-password" element={<ResetPasswordPage />} />
      <Route
        path="/user-info"
        element={
          <UserRoute>
            <UserInfoPage />
          </UserRoute>
        }
      />
      <Route
        path="/datasources"
        element={
          <AdminRoute>
            <DatasourceListPage />
          </AdminRoute>
        }
      />
      <Route
        path="/datasources/new"
        element={
          <AdminRoute>
            <AddDatasourcePage />
          </AdminRoute>
        }
      />
      <Route
        path="/"
        element={
          <AdminRoute>
            <AccountListPage />
          </AdminRoute>
        }
      />
      <Route path="*" element={<Navigate to="/login" replace />} />
    </Routes>
  );
}
