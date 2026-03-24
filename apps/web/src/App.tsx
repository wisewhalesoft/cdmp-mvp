import { Routes, Route, Navigate } from 'react-router-dom';
import { LoginPage } from '@/pages/login/login-page';
import { UserInfoPage } from '@/pages/user-info/user-info-page';
import { AccountListPage } from '@/pages/accounts/account-list-page';
import { ForgotPasswordPage } from '@/pages/forgot-password/forgot-password-page';
import { ResetPasswordPage } from '@/pages/reset-password/reset-password-page';
import { AddDatasourcePage } from '@/pages/datasources/add-datasource-page';
import { EditDatasourcePage } from '@/pages/datasources/edit-datasource-page';
import { DatasourceListPage } from '@/pages/datasources/datasource-list-page';
import { AddExtractionTaskPage } from '@/pages/extraction-tasks/add-extraction-task-page';
import { EditExtractionTaskPage } from '@/pages/extraction-tasks/edit-extraction-task-page';
import { ExtractionTaskListPage } from '@/pages/extraction-tasks/extraction-task-list-page';
import { RawDataPreviewPage } from '@/pages/extraction-tasks/raw-data-preview-page';
import { PipelineListPage } from '@/pages/etl-pipelines/pipeline-list-page';
import { PipelineDashboardPage } from '@/pages/etl-pipelines/pipeline-dashboard-page';
import { PipelineLogsPage } from '@/pages/etl-pipelines/pipeline-logs-page';
import { PipelineEditorPage } from '@/pages/etl-pipelines/editor';
import { PipelineVersionsPage } from '@/pages/etl-pipelines/versions';
import { TargetTablesPage } from '@/pages/etl-pipelines/target-tables-page';
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
        path="/datasources/:id/edit"
        element={
          <AdminRoute>
            <EditDatasourcePage />
          </AdminRoute>
        }
      />
      <Route
        path="/extraction-tasks"
        element={
          <AdminRoute>
            <ExtractionTaskListPage />
          </AdminRoute>
        }
      />
      <Route
        path="/extraction-tasks/new"
        element={
          <AdminRoute>
            <AddExtractionTaskPage />
          </AdminRoute>
        }
      />
      <Route
        path="/extraction-tasks/:id/edit"
        element={
          <AdminRoute>
            <EditExtractionTaskPage />
          </AdminRoute>
        }
      />
      <Route
        path="/extraction-tasks/:taskId/raw-data"
        element={
          <AdminRoute>
            <RawDataPreviewPage />
          </AdminRoute>
        }
      />
      <Route
        path="/etl-pipelines"
        element={
          <AdminRoute>
            <PipelineDashboardPage />
          </AdminRoute>
        }
      />
      <Route
        path="/etl-pipelines/list"
        element={
          <AdminRoute>
            <PipelineListPage />
          </AdminRoute>
        }
      />
      <Route
        path="/etl-pipelines/target-tables"
        element={
          <AdminRoute>
            <TargetTablesPage />
          </AdminRoute>
        }
      />
      <Route
        path="/etl-pipelines/:id/logs"
        element={
          <AdminRoute>
            <PipelineLogsPage />
          </AdminRoute>
        }
      />
      <Route
        path="/etl-pipelines/:id/versions"
        element={
          <AdminRoute>
            <PipelineVersionsPage />
          </AdminRoute>
        }
      />
      <Route
        path="/etl-pipelines/:id/editor"
        element={
          <AdminRoute>
            <PipelineEditorPage />
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
