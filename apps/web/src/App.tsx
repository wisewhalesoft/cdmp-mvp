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
import { CustomerListPage } from '@/pages/c360/customer-list-page';
import { CustomerDetailPage } from '@/pages/c360/customer-detail-page';
import {
  AssignmentStubPage,
  BaseCodesPage,
  ScoringConfigPage,
  ListDefinitionPage,
  ListCreateDraftPage,
  ListEditDraftPage,
  Stage0EstimatePage,
  TriggerRunPage,
  RunProgressPage,
  FieldWhitelistPage,
  FieldOptionsPage,
  RunHistoryPage,
  RunSummaryPage,
  SnapshotDetailPage,
  RunComparePage,
} from '@/pages/assignment';
import {
  AdminRoute,
  DirectorOrSectionChiefRoute,
  DirectorRoute,
  ProtectedRoute,
  SalesManagerRoute,
} from '@/router/protected-route';

export function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route path="/forgot-password" element={<ForgotPasswordPage />} />
      <Route path="/reset-password" element={<ResetPasswordPage />} />
      <Route
        path="/user-info"
        element={
          <ProtectedRoute>
            <UserInfoPage />
          </ProtectedRoute>
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
        path="/c360/customers"
        element={
          <ProtectedRoute>
            <CustomerListPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/c360/customers/:customerId"
        element={
          <ProtectedRoute>
            <CustomerDetailPage />
          </ProtectedRoute>
        }
      />
      {/* E07 客戶名單分派 stub 路由（SalesManagerRoute Guard） */}
      {/* F068：代碼維護（PROD_KIND / SPEC_TP / CASE_STATUS） */}
      <Route
        path="/assignment/base-codes"
        element={
          <DirectorOrSectionChiefRoute>
            <BaseCodesPage />
          </DirectorOrSectionChiefRoute>
        }
      />
      {/* F075 / F076：POOLDATA 白名單 + 可選值管理 */}
      <Route
        path="/assignment/whitelist"
        element={
          <DirectorOrSectionChiefRoute>
            <FieldWhitelistPage />
          </DirectorOrSectionChiefRoute>
        }
      />
      <Route
        path="/assignment/whitelist/options"
        element={
          <DirectorOrSectionChiefRoute>
            <FieldOptionsPage />
          </DirectorOrSectionChiefRoute>
        }
      />
      {/* M02 計分卡：F002 §4.6 director only — section_chief / user 整頁封鎖 */}
      <Route
        path="/assignment/scoring"
        element={
          <DirectorRoute>
            <ScoringConfigPage />
          </DirectorRoute>
        }
      />
      {/* /assignment/ratios stub 已移除 — M03 比例設定併入名單定義頁 row actions (FE-4 inline 元件) */}
      {/* M01 名單定義：director + section_chief（讀），director only（寫入） */}
      <Route
        path="/assignment/list-definitions"
        element={
          <DirectorOrSectionChiefRoute>
            <ListDefinitionPage />
          </DirectorOrSectionChiefRoute>
        }
      />
      <Route
        path="/assignment/list-definitions/new"
        element={
          <DirectorRoute>
            <ListCreateDraftPage />
          </DirectorRoute>
        }
      />
      <Route
        path="/assignment/list-definitions/:listNo/edit"
        element={
          <DirectorRoute>
            <ListEditDraftPage />
          </DirectorRoute>
        }
      />
      {/* M03 Stage 0 試算：director only */}
      <Route
        path="/assignment/estimate"
        element={
          <DirectorRoute>
            <Stage0EstimatePage />
          </DirectorRoute>
        }
      />
      {/* M04 觸發月跑：director only */}
      <Route
        path="/assignment/run"
        element={
          <DirectorRoute>
            <TriggerRunPage />
          </DirectorRoute>
        }
      />
      {/* M04 執行進度：director + section_chief */}
      <Route
        path="/assignment/run-progress"
        element={
          <DirectorOrSectionChiefRoute>
            <RunProgressPage />
          </DirectorOrSectionChiefRoute>
        }
      />
      {/* M05 結果摘要 (F063) / 執行歷史 (F065) / 快照詳情 (F066) / 結果比對 (F067) */}
      <Route
        path="/assignment/run-summary"
        element={
          <DirectorOrSectionChiefRoute>
            <RunSummaryPage />
          </DirectorOrSectionChiefRoute>
        }
      />
      <Route
        path="/assignment/history"
        element={
          <DirectorOrSectionChiefRoute>
            <RunHistoryPage />
          </DirectorOrSectionChiefRoute>
        }
      />
      <Route
        path="/assignment/snapshots"
        element={
          <DirectorOrSectionChiefRoute>
            <SnapshotDetailPage />
          </DirectorOrSectionChiefRoute>
        }
      />
      <Route
        path="/assignment/compare"
        element={
          <DirectorOrSectionChiefRoute>
            <RunComparePage />
          </DirectorOrSectionChiefRoute>
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
