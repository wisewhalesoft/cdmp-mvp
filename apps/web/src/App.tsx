import { Routes, Route, Navigate } from 'react-router-dom';
import { LoginPage } from '@/pages/login/login-page';

export function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route path="*" element={<Navigate to="/login" replace />} />
    </Routes>
  );
}
