import { useQuery } from '@tanstack/react-query';
import { Contact, Lock, RefreshCw, ScanEye, Info } from 'lucide-react';
import { Link } from 'react-router-dom';
import { AppLayout } from '@/components/layout/app-layout';
import { MonthPicker } from '@/components/e07/MonthPicker';
import { useAssignmentWorkYm } from '@/contexts/assignment-work-ym-context';
import { getEffectiveIdentity } from '@/stores/auth-store';
import { getAssignmentOverview } from '@/api/assignment-overview';
import { StageTodoPanel } from './_components/overview/stage-todo-panel';
import { RunReadinessPanel } from './_components/overview/run-readiness-panel';
import { DialingVolumePanel } from './_components/overview/dialing-volume-panel';
import { RecentRunPanel } from './_components/overview/recent-run-panel';

/**
 * F111 / US-177 分派總覽儀表板（客戶名單分派模組新入口首頁；路由 /assignment/overview）。
 *
 * 對應 prototype 38-assignment-overview.html。純唯讀彙總視圖：四大區塊全部彙總既有服務資料，
 * 所有可點擊項目僅限導覽（AC-16 / I-OVW-NO-WRITE-01）。TanStack Query 單一 key
 * `['assignment','overview',ym]`（四區塊共用同一次 fetch，各自依 `block.error` 分流三態，AC-15）。
 *
 * 角色：director / admin 全公司 + 觸發連結；section_chief 唯讀 + 僅轄區（scope 由後端安全邊界回傳）；
 * user 整頁封鎖（本頁自身封鎖狀態，獨立於路由層 guard）。
 */

function toHyphen(yyyymm: string): string {
  if (!yyyymm || yyyymm.length < 6) return '';
  return `${yyyymm.slice(0, 4)}-${yyyymm.slice(4, 6)}`;
}

export function AssignmentOverviewPage() {
  const identity = getEffectiveIdentity();
  const canView = identity !== 'user';

  const { currentWorkYm, targetWorkYm, setTargetWorkYm } = useAssignmentWorkYm();
  const ym = targetWorkYm; // 選定月份（YYYYMM）；預設 = 下月（AC-3）
  const enabled = canView && ym.length === 6;

  const { data, isError, refetch } = useQuery({
    queryKey: ['assignment', 'overview', ym],
    queryFn: () => getAssignmentOverview(ym),
    enabled,
  });

  const loading = !data && !isError;

  const monthPicker =
    ym.length === 6 ? (
      <div className="flex items-center gap-2" data-testid="overview-month-picker">
        <span className="text-xs text-gray-500 whitespace-nowrap">
          分派作業月份
        </span>
        <MonthPicker
          value={toHyphen(ym)}
          currentYm={toHyphen(currentWorkYm) || toHyphen(ym)}
          onChange={(next) => setTargetWorkYm(next.replace('-', ''))}
        />
      </div>
    ) : undefined;

  const actions = (
    <div className="flex items-center gap-3">
      {monthPicker}
      <button
        type="button"
        data-testid="overview-refresh"
        title="重新整理（一次刷新四區塊）"
        onClick={() => void refetch()}
        className="inline-flex items-center gap-1.5 px-3 h-8 border border-[#E5E7EB] rounded-md text-xs font-medium text-gray-600 hover:bg-gray-50 hover:border-primary hover:text-primary"
      >
        <RefreshCw className="w-3.5 h-3.5" />
        重新整理
      </button>
    </div>
  );

  // ---- user 整頁封鎖（AC-1 / FE-ROLE-003）----
  if (!canView) {
    return (
      <AppLayout title="分派總覽">
        <main className="flex-1 p-6">
          <div
            data-testid="overview-blocked"
            className="bg-white rounded-xl border border-[#E5E7EB] p-12 flex flex-col items-center text-center"
          >
            <div className="w-16 h-16 rounded-full bg-gray-100 flex items-center justify-center mb-4">
              <Lock className="w-8 h-8 text-gray-400" />
            </div>
            <h3 className="text-lg font-semibold text-gray-800 mb-1">
              分派總覽為部長 / 處長 / Admin 專屬功能
            </h3>
            <p className="text-sm text-gray-500 max-w-md">
              「分派總覽」彙總本月名單分派營運狀況，供業務部長、業務處長與系統管理者檢視。一般使用者角色無此檢視權限；請至
              Customer 360 查看您被分派的客戶名單。
            </p>
            <Link
              to="/c360/customers"
              className="mt-4 inline-flex items-center gap-1.5 px-4 py-2 bg-primary text-white text-sm rounded-md hover:bg-blue-700"
            >
              <Contact className="w-4 h-4" />
              前往 Customer 360
            </Link>
          </div>
        </main>
      </AppLayout>
    );
  }

  const scope = data?.scope;
  const scoped = scope?.scoped === true;
  const scopeDeptName =
    scoped && data && data.dialingVolume.error === false
      ? data.dialingVolume.selected.departments.find(
          (d) => d.deptCode === scope?.deptCode,
        )?.deptName ?? null
      : null;

  return (
    <AppLayout title="分派總覽" actions={actions}>
      <main className="flex-1 p-6 space-y-4">
        {scoped && (
          <div
            data-testid="scope-banner"
            className="rounded-lg p-3 bg-purple-50 border border-purple-200 flex items-start gap-2 text-sm"
          >
            <ScanEye className="w-4 h-4 text-purple-700 mt-0.5 shrink-0" />
            <div className="flex-1">
              <p className="font-semibold text-purple-900">
                轄區檢視：僅顯示您轄區部門
                {scopeDeptName ? `（${scopeDeptName}）` : ''}的分派資料
              </p>
              <p className="text-xs text-purple-700 mt-0.5">
                此頁為唯讀。組織級加總、缺口與部門佔比在轄區視角下不顯示；您無法在此觸發月名單分派。
              </p>
            </div>
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold shrink-0 bg-purple-100 text-purple-700">
              <ScanEye className="w-3 h-3" />
              轄區檢視
            </span>
          </div>
        )}

        <StageTodoPanel
          block={data?.stageTodo}
          loading={loading}
          onRetry={() => void refetch()}
        />
        <RunReadinessPanel
          block={data?.runReadiness}
          loading={loading}
          onRetry={() => void refetch()}
        />
        <DialingVolumePanel
          block={data?.dialingVolume}
          loading={loading}
          onRetry={() => void refetch()}
        />
        <RecentRunPanel
          block={data?.recentRun}
          loading={loading}
          onRetry={() => void refetch()}
        />

        <div className="flex items-start gap-2 p-3 bg-blue-50/50 border border-blue-100 rounded-lg text-xs text-gray-600">
          <Info className="w-4 h-4 text-primary mt-0.5 shrink-0" />
          <p>
            本頁為純唯讀彙總，不觸發任何分派或寫入操作；所有可點擊項目僅導覽至對應功能頁。實際分派件數以月名單分派執行結果為準。
          </p>
        </div>
      </main>
    </AppLayout>
  );
}
