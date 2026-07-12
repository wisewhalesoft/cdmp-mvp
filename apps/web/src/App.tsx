import { Routes, Route, Navigate, Outlet } from 'react-router-dom';
import { AssignmentWorkYmProvider } from '@/contexts/assignment-work-ym-context';
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
  AssignmentOverviewPage,
  ScoringConfigPage,
  ListDefinitionPage,
  ListCreateDraftPage,
  ListEditDraftPage,
  Stage0EstimatePage,
  TriggerRunPage,
  RunProgressPage,
  FieldBasePage,
  RunHistoryPage,
  RunSummaryPage,
  SnapshotDetailPage,
  RunComparePage,
  DeptRatioConfigPage,
  PersonnelRatioConfigPage,
  ReadySummaryListPage,
  ReadySummaryDetailPage,
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
      {/* F050 v2.1 / J4：「代碼維護」+「篩選欄位管理」+「可選值管理」三舊路由合併為單一新 route
        對齊 prototype 37-base-code.html 2-Tab 容器設計（?tab=fields|options） */}
      <Route
        path="/assignment/field-base"
        element={
          <DirectorOrSectionChiefRoute>
            <FieldBasePage />
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
      {/* F097 / US-137 / AD-E07-27 §27.5：四頁共享「分派作業月份」狀態（AssignmentWorkYmProvider）。
          以 layout route 包覆，使四頁間導航時 Provider 不卸載 → 一處切換、跨頁同步。
          run-history（/assignment/history）與下游結果頁不納入此 Provider。 */}
      <Route
        element={
          <AssignmentWorkYmProvider>
            <Outlet />
          </AssignmentWorkYmProvider>
        }
      >
        {/* F111 / US-177：分派總覽儀表板（客戶名單分派模組新入口首頁；共享分派作業月份，AC-3）
            Guard 沿用 DirectorOrSectionChiefRoute（比照 Stage 0 試算頁；user 整頁封鎖） */}
        <Route
          path="/assignment/overview"
          element={
            <DirectorOrSectionChiefRoute>
              <AssignmentOverviewPage />
            </DirectorOrSectionChiefRoute>
          }
        />
        {/* M01 名單定義：director + section_chief（讀），director only（寫入） */}
        <Route
          path="/assignment/list-definitions"
          element={
            <DirectorOrSectionChiefRoute>
              <ListDefinitionPage />
            </DirectorOrSectionChiefRoute>
          }
        />
        {/* M03d 準備完成名單清單：director + section_chief（共享分派作業月份） */}
        <Route
          path="/assignment/ready-summary"
          element={
            <DirectorOrSectionChiefRoute>
              <ReadySummaryListPage />
            </DirectorOrSectionChiefRoute>
          }
        />
        {/* M03 Stage 0 試算：F049 v2.0 / US-168 放寬至 director + section_chief（處長唯讀） */}
        <Route
          path="/assignment/estimate"
          element={
            <DirectorOrSectionChiefRoute>
              <Stage0EstimatePage />
            </DirectorOrSectionChiefRoute>
          }
        />
        {/* M04 觸發月名單分派：director only（共享分派作業月份） */}
        <Route
          path="/assignment/run"
          element={
            <DirectorRoute>
              <TriggerRunPage />
            </DirectorRoute>
          }
        />
      </Route>
      {/* —— 以下頁面不納入 AssignmentWorkYmProvider —— */}
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
      {/* M03a 部門比例設定：director（寫入），section_chief 可進但唯讀 */}
      <Route
        path="/assignment/lists/:listNo/dept-ratio"
        element={
          <DirectorOrSectionChiefRoute>
            <DeptRatioConfigPage />
          </DirectorOrSectionChiefRoute>
        }
      />
      {/* M03b 個別業務比例設定：director + section_chief */}
      <Route
        path="/assignment/lists/:listNo/personnel-ratio"
        element={
          <DirectorOrSectionChiefRoute>
            <PersonnelRatioConfigPage />
          </DirectorOrSectionChiefRoute>
        }
      />
      {/* M03c 簽核：核准/拒絕已改為名單定義頁卡片就地操作（29c 審閱頁於 2026-05-26 移除） */}
      {/* M03d 準備完成名單詳情：director + section_chief（單筆詳情，不共享月份 Context） */}
      <Route
        path="/assignment/ready-summary/:listNo"
        element={
          <DirectorOrSectionChiefRoute>
            <ReadySummaryDetailPage />
          </DirectorOrSectionChiefRoute>
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
