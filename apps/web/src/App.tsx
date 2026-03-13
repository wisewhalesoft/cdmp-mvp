import { Routes, Route, Navigate } from 'react-router-dom';
import { LoginPage } from '@/pages/login/login-page';
import { UserInfoPage } from '@/pages/user-info/user-info-page';
import { AdminRoute, UserRoute } from '@/router/protected-route';

export function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route
        path="/user-info"
        element={
          <UserRoute>
            <UserInfoPage />
          </UserRoute>
        }
      />
      <Route
        path="/"
        element={
          <AdminRoute>
            <div>Admin Dashboard</div>
          </AdminRoute>
        }
      />
      <Route path="*" element={<Navigate to="/login" replace />} />
    </Routes>
  );
}
