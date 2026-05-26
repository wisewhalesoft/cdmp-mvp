import { useState, useEffect } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import {
  ArrowLeft,
  Undo2,
  PlayCircle,
  Building2,
  Users,
  UserCog,
  UserMinus,
  History,
  Crown,
  AlertTriangle,
  Calendar,
  ChevronRight,
} from 'lucide-react';
import { AppLayout } from '@/components/layout/app-layout';
import { Button } from '@/components/ui/button';
import { ConfirmModal } from '@/components/e07/ConfirmModal';
import { StageBadge, type Stage } from '@/components/e07/StageBadge';
import { useToast } from '@/components/ui/toast';
import {
  listLists,
  type AssignmentListItem,
} from '@/api/assignment-list';
import {
  getDeptRatios,
  getPersonnelRatios,
  getApprovalHistory,
  rollbackToApproval,
  type DeptRatioItem,
  type PersonnelRatioDepartment,
  type ApprovalHistoryItem,
} from '@/api/assignment-stage';
import { getListEstimate } from '@/api/assignment-run';
import { ListSummaryCard } from './_components/list-summary-card';
import {
  PersonnelRatioAccordion,
  type AccordionDept,
} from './_components/personnel-ratio-accordion';
import { ApprovalHistoryTimeline } from './_components/approval-history-timeline';
import { StageBreadcrumb } from './_components/stage-breadcrumb';
import { getBusinessRole } from '@/stores/auth-store';

/**
 * F088 / F089 — 準備完成單一名單詳情頁（29d 模式 B）
 *
 * 對應 prototype: /prototypes/29d-ready-summary.html L243-362
 *
 * 路由：/assignment/ready-summary/:listNo
 * RBAC：DirectorOrSectionChiefRoute；F089 Rollback 寫入 director only
 *
 * 主要區塊：
 *   - 名單標題卡 + 4 stat（部門數 / 業務員數 / 預估案件數 / 簽核紀錄數）
 *   - 篩選條件 chips（透過 ListSummaryCard）
 *   - 部門比例唯讀表
 *   - 個別比例 accordion（唯讀，預設摺疊）
 *   - 簽核歷史時間軸
 *   - 操作：返回 / 退回簽核 (director only) / 執行月跑
 */

function splitConditionsFromList(list: AssignmentListItem): string[] {
  const conditions: string[] = [];
  if (list.prodKind) conditions.push(`PROD_KIND = ${list.prodKind}`);
  if (list.specTp) {
    const items = list.specTp.split('$$').filter(Boolean);
    conditions.push(`SPEC_TP in (${items.join(', ')})`);
  }
  if (list.caseYear) {
    const items = list.caseYear.split('$$').filter(Boolean);
    conditions.push(`CASEYEAR in (${items.join(', ')})`);
  }
  if (list.cardType) conditions.push(`CARD_TYPE = ${list.cardType}`);
  if (list.settleSrc) conditions.push(`SETTLE_SRC = ${list.settleSrc}`);
  return conditions;
}

function formatPct(n: number): string {
  return `${(Math.round(n * 100) / 100).toFixed(2)}%`;
}

export function ReadySummaryDetailPage() {
  const navigate = useNavigate();
  const { showToast } = useToast();
  const { listNo } = useParams<{ listNo: string }>();

  const [loading, setLoading] = useState(true);
  const [list, setList] = useState<AssignmentListItem | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [depts, setDepts] = useState<DeptRatioItem[]>([]);
  const [personnelDepts, setPersonnelDepts] = useState<
    PersonnelRatioDepartment[]
  >([]);
  const [estimate, setEstimate] = useState<number | null>(null);
  const [estimateLoading, setEstimateLoading] = useState(true);
  const [history, setHistory] = useState<ApprovalHistoryItem[]>([]);
  const [historyLoading, setHistoryLoading] = useState(true);
  const [showRollback, setShowRollback] = useState(false);
  const [rollbacking, setRollbacking] = useState(false);

  const businessRole = getBusinessRole();
  const isSectionChief = businessRole === 'section_chief';
  const canRollback = !isSectionChief; // F089 director only

  useEffect(() => {
    if (!listNo) return;
    let aborted = false;
    void (async () => {
      setLoading(true);
      setNotFound(false);
      try {
        const data = await listLists({});
        if (aborted) return;
        const found = data.lists.find((l) => l.listNo === listNo);
        if (!found) {
          setNotFound(true);
          setList(null);
        } else {
          setList(found);
        }
      } catch (err: unknown) {
        const e = err as { response?: { data?: { message?: string } } };
        showToast(e?.response?.data?.message ?? '載入名單失敗', 'error');
      } finally {
        if (!aborted) setLoading(false);
      }
    })();
    return () => {
      aborted = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [listNo]);

  useEffect(() => {
    if (!listNo) return;
    let aborted = false;
    void (async () => {
      try {
        const [d, p] = await Promise.all([
          getDeptRatios(listNo),
          getPersonnelRatios(listNo),
        ]);
        if (aborted) return;
        setDepts(d.deptRatios ?? []);
        setPersonnelDepts(p.departments ?? []);
      } catch {
        // ignore
      }
    })();
    return () => {
      aborted = true;
    };
  }, [listNo]);

  // 預估案件數（F049 Stage 0 試算）— 失敗 / 缺資料時顯示「—」，不阻擋頁面
  useEffect(() => {
    if (!listNo) return;
    let aborted = false;
    void (async () => {
      setEstimateLoading(true);
      try {
        const data = await getListEstimate(listNo);
        if (aborted) return;
        setEstimate(data?.count ?? data?.estimatedCount ?? null);
      } catch {
        if (!aborted) setEstimate(null);
      } finally {
        if (!aborted) setEstimateLoading(false);
      }
    })();
    return () => {
      aborted = true;
    };
  }, [listNo]);

  useEffect(() => {
    if (!listNo) return;
    let aborted = false;
    void (async () => {
      setHistoryLoading(true);
      try {
        const data = await getApprovalHistory(listNo);
        if (!aborted) setHistory(data.history ?? []);
      } catch {
        if (!aborted) setHistory([]);
      } finally {
        if (!aborted) setHistoryLoading(false);
      }
    })();
    return () => {
      aborted = true;
    };
  }, [listNo]);

  const stageMismatch = list && list.stage !== 'ready';

  const handleRollbackConfirm = async () => {
    if (!listNo) return;
    setRollbacking(true);
    try {
      await rollbackToApproval(listNo);
      showToast(`名單 ${listNo} 已退回簽核階段`, 'warning');
      setShowRollback(false);
      // 29c 審閱頁已移除：退回後導回名單定義頁，於「待簽核」欄卡片就地重新核准/拒絕
      navigate('/assignment/list-definitions');
    } catch (err: unknown) {
      const e = err as { response?: { data?: { message?: string } } };
      showToast(e?.response?.data?.message ?? '退回失敗', 'error');
    } finally {
      setRollbacking(false);
    }
  };

  // deptCode → 員工清單（給 accordion body 與分配占比計算）
  const personnelByDept: Record<string, PersonnelRatioDepartment['employees']> =
    Object.fromEntries(personnelDepts.map((d) => [d.deptCode, d.employees]));

  // 在職 / 離職人數（在職業務員 stat；離職不計副字）
  const activeEmployees = personnelDepts.reduce(
    (a, d) => a + d.activeCount,
    0,
  );
  const resignedEmployees = personnelDepts.reduce(
    (a, d) => a + d.employees.filter((e) => e.isResigned).length,
    0,
  );

  // 簽核 approve / reject 拆分
  const approveCount = history.filter((h) => h.action === 'approve').length;
  const rejectCount = history.filter((h) => h.action === 'reject').length;
  const lastApprove = history.find((h) => h.action === 'approve');

  // 部門配額查表（deptCode → RATION），給員工「名單分配占比」計算
  const deptQuotaByCode: Record<string, number> = Object.fromEntries(
    depts.map((d) => [d.obdeptId, d.ration]),
  );

  // accordion：以部門比例表為主，合併個別比例 department metadata（處長/在職/狀態）
  const accordionDepts: AccordionDept[] = depts.map((d) => {
    const pd = personnelDepts.find((p) => p.deptCode === d.obdeptId);
    const emps = pd?.employees ?? [];
    const sum =
      emps.length > 0
        ? Math.round(
            emps.reduce((a, e) => a + (e.ration ?? 0), 0) * 100,
          ) / 100
        : 0;
    const status: AccordionDept['status'] = pd
      ? pd.allResigned || pd.sumValidated
        ? 'done'
        : pd.deptSum > 0
          ? 'pending'
          : 'todo'
      : Math.abs(sum - 100) <= 0.01
        ? 'done'
        : 'todo';
    return {
      deptCode: d.obdeptId,
      deptName: d.obdeptNm,
      directorName: pd?.directorName ?? d.directorName,
      deptRatio: d.ration,
      activeCount: pd?.activeCount ?? emps.filter((e) => !e.isResigned).length,
      sum,
      status,
      offline: pd?.allResigned ?? false,
    };
  });

  return (
    <AppLayout
      headerLeft={
        <div
          className="flex items-center gap-2 text-sm"
          data-testid="ready-detail-breadcrumb"
        >
          <Link
            to="/assignment/list-definitions"
            className="text-gray-500 hover:text-primary transition"
          >
            名單定義
          </Link>
          <ChevronRight className="w-3.5 h-3.5 text-gray-300" />
          <span className="font-semibold text-gray-800">準備完成摘要 — 詳情</span>
          {list && <StageBadge stage={list.stage as Stage} />}
          {listNo && (
            <span className="font-mono text-xs text-gray-400">{listNo}</span>
          )}
        </div>
      }
    >
      <main className="flex-1 p-6 space-y-4">
        <StageBreadcrumb currentStage="ready" featureIds="F088 v1.1 / F089" />

        {loading && (
          <div
            className="text-center text-gray-400 py-12"
            data-testid="ready-detail-loading"
          >
            載入中...
          </div>
        )}

        {notFound && (
          <div
            data-testid="list-not-found"
            className="rounded-lg p-6 bg-red-50 border border-red-200 text-sm text-red-800"
          >
            <p className="font-semibold mb-1">找不到名單</p>
            <p className="text-xs">
              找不到 listNo = <code className="font-mono">{listNo}</code>。
            </p>
          </div>
        )}

        {!loading && list && (
          <>
            {stageMismatch && (
              <div
                data-testid="stage-mismatch-warning"
                className="rounded-lg p-3 bg-amber-50 border border-amber-200 flex items-start gap-2 text-sm"
              >
                <AlertTriangle className="w-4 h-4 text-amber-600 mt-0.5 shrink-0" />
                <div className="flex-1">
                  <p className="font-semibold text-amber-900">
                    名單目前階段為 <strong>{list.stage}</strong>，不在準備完成階段
                  </p>
                </div>
              </div>
            )}

            {/* 名單標題卡 + 4 stat */}
            <section className="bg-white rounded-xl border border-gray-200 p-5">
              <div className="flex items-start justify-between gap-4 mb-3">
                <div>
                  <h1 className="text-xl font-semibold text-gray-800">
                    {list.listNm}
                    <span className="ml-2 text-base text-gray-500 font-normal">
                      — <span className="font-mono">{list.listNo}</span>
                    </span>
                  </h1>
                  <p className="text-xs text-gray-500 mt-1">
                    本名單已通過部長核准，等待月跑啟動 Stage 1~3 計算（亦可由部長 / Admin Rollback 重新審核）。
                  </p>
                </div>
                {lastApprove && (
                  <div className="text-right shrink-0">
                    <p className="text-[10px] text-gray-400 uppercase tracking-wider">
                      最終核准資訊
                    </p>
                    <p className="text-sm font-medium text-gray-700 mt-0.5 inline-flex items-center gap-1">
                      <Crown className="w-3 h-3 text-primary" />
                      {lastApprove.approverName ?? lastApprove.approverId}
                    </p>
                    <p className="text-xs text-gray-500 inline-flex items-center gap-1">
                      <Calendar className="w-3 h-3" />
                      {lastApprove.approvedAt.slice(0, 10)} 核准
                    </p>
                  </div>
                )}
              </div>

              <div className="grid grid-cols-4 gap-3 mt-4 pt-4 border-t border-gray-200">
                <div className="text-center" data-testid="detail-stat-dept-count">
                  <p className="text-[10px] text-gray-400 uppercase tracking-wider">
                    部門數
                  </p>
                  <p className="text-xl font-semibold text-gray-800 tabular-nums mt-0.5">
                    {depts.length}
                  </p>
                </div>
                <div className="text-center" data-testid="detail-stat-emp-count">
                  <p className="text-[10px] text-gray-400 uppercase tracking-wider">
                    在職業務員
                  </p>
                  <p className="text-xl font-semibold text-gray-800 tabular-nums mt-0.5">
                    {activeEmployees}
                  </p>
                  {resignedEmployees > 0 && (
                    <p className="text-[10px] text-gray-500">
                      {resignedEmployees} 位離職不計
                    </p>
                  )}
                </div>
                <div className="text-center" data-testid="detail-stat-estimate">
                  <p className="text-[10px] text-gray-400 uppercase tracking-wider">
                    預估案件數
                  </p>
                  <p className="text-xl font-semibold text-primary tabular-nums mt-0.5">
                    {estimateLoading
                      ? '—'
                      : estimate != null
                        ? `~${estimate.toLocaleString()}`
                        : '—'}
                  </p>
                  <p className="text-[10px] text-gray-500">由 Stage 0 試算</p>
                </div>
                <div className="text-center" data-testid="detail-stat-history-count">
                  <p className="text-[10px] text-gray-400 uppercase tracking-wider">
                    簽核紀錄
                  </p>
                  <p className="text-xl font-semibold text-green-700 tabular-nums mt-0.5">
                    {history.length}
                  </p>
                  <p className="text-[10px] text-gray-500">
                    {approveCount} approve · {rejectCount} reject
                  </p>
                </div>
              </div>
            </section>

            {/* 篩選條件 + CR（透過 ListSummaryCard 已包含） — 因頂部卡已自製，再插一張 */}
            <ListSummaryCard
              listNo={list.listNo}
              listNm={list.listNm}
              title="篩選條件與商品設定"
              description="（建立時設定，已鎖定）"
              createdBy={list.createdBy}
              createdAt={list.createdAt.slice(0, 10)}
              conditions={splitConditionsFromList(list)}
              crEnabled={true}
            />

            {/* 部門比例唯讀表 */}
            <section
              className="bg-white rounded-xl border border-gray-200 p-5"
              data-testid="detail-dept-ratio-table"
            >
              <h2 className="text-base font-semibold text-gray-800 inline-flex items-center gap-2 mb-3">
                <Building2 className="w-4 h-4 text-blue-700" />
                部門比例
              </h2>
              <div className="overflow-hidden rounded-lg border border-gray-200">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50 text-xs text-gray-500">
                    <tr>
                      <th className="text-left px-4 py-2 font-medium">部門代碼</th>
                      <th className="text-left px-4 py-2 font-medium">部門名稱</th>
                      <th className="text-left px-4 py-2 font-medium">處長</th>
                      <th className="text-right px-4 py-2 font-medium">RATION</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-200 bg-white">
                    {depts.map((d) => (
                      <tr key={d.obdeptId}>
                        <td className="px-4 py-2 font-mono text-primary">
                          {d.obdeptId}
                        </td>
                        <td className="px-4 py-2 text-gray-800">{d.obdeptNm}</td>
                        <td className="px-4 py-2 text-xs text-gray-600">
                          {d.directorName ? (
                            <span className="inline-flex items-center gap-1">
                              <UserCog className="w-3 h-3 text-purple-600" />
                              {d.directorName}
                            </span>
                          ) : (
                            <span className="text-gray-300">—</span>
                          )}
                        </td>
                        <td className="px-4 py-2 text-right font-mono">
                          {formatPct(d.ration)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>

            {/* 個別比例 accordion（預設摺疊） */}
            <section className="bg-white rounded-xl border border-gray-200 p-5">
              <h2 className="text-base font-semibold text-gray-800 inline-flex items-center gap-2 mb-3">
                <Users className="w-4 h-4 text-cyan-700" />
                個別業務比例
                <span className="text-xs text-gray-400 font-normal">（唯讀）</span>
              </h2>
              <PersonnelRatioAccordion
                depts={accordionDepts}
                defaultOpen={false}
                renderDept={(dept) => {
                  const emps = personnelByDept[dept.deptCode] ?? [];
                  if (emps.length === 0) {
                    return (
                      <p className="text-xs text-gray-400 text-center py-3">
                        無員工比例資料
                      </p>
                    );
                  }
                  const quota = deptQuotaByCode[dept.deptCode] ?? 0;
                  return (
                    <table className="w-full text-sm">
                      <thead className="bg-gray-50 text-xs text-gray-500">
                        <tr>
                          <th className="text-left px-3 py-2 font-medium">員工編號</th>
                          <th className="text-left px-3 py-2 font-medium">姓名</th>
                          <th className="text-right px-3 py-2 font-medium">
                            RATION（部門內）
                          </th>
                          <th className="text-right px-3 py-2 font-medium">
                            名單分配占比
                          </th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-100">
                        {emps.map((e) => (
                          <tr
                            key={e.empId}
                            className={e.isResigned ? 'opacity-55 bg-gray-50' : ''}
                          >
                            <td className="px-3 py-1.5 font-mono text-xs text-primary">
                              {e.empId}
                            </td>
                            <td className="px-3 py-1.5 text-gray-800">
                              {e.empName}
                              {e.isResigned && (
                                <span className="ml-1.5 inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium bg-gray-200 text-gray-500">
                                  <UserMinus className="w-2.5 h-2.5" />
                                  離職
                                </span>
                              )}
                            </td>
                            <td className="px-3 py-1.5 text-right font-mono">
                              {e.isResigned ? '—' : formatPct(e.ration ?? 0)}
                            </td>
                            <td className="px-3 py-1.5 text-right font-mono text-xs text-gray-500">
                              {e.isResigned
                                ? '—'
                                : formatPct((quota * (e.ration ?? 0)) / 100)}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  );
                }}
              />
            </section>

            {/* 簽核歷史 */}
            <section className="bg-white rounded-xl border border-gray-200 p-5">
              <h2 className="text-base font-semibold text-gray-800 inline-flex items-center gap-2 mb-3">
                <History className="w-4 h-4 text-gray-600" />
                簽核歷史
              </h2>
              <ApprovalHistoryTimeline
                history={history}
                loading={historyLoading}
              />
            </section>

            {/* 操作 bar */}
            <div className="bg-white rounded-xl border border-gray-200 px-5 py-4 flex items-center justify-between gap-3">
              <button
                type="button"
                onClick={() => navigate('/assignment/ready-summary')}
                className="text-sm text-gray-500 hover:text-gray-700 inline-flex items-center gap-1"
              >
                <ArrowLeft className="w-4 h-4" />
                返回 ready 名單清單
              </button>
              <div className="flex items-center gap-2">
                {canRollback && !stageMismatch && (
                  <Button
                    type="button"
                    variant="warning"
                    data-testid="btn-rollback-approval"
                    onClick={() => setShowRollback(true)}
                  >
                    <span className="inline-flex items-center gap-1.5">
                      <Undo2 className="w-4 h-4" />
                      退回簽核
                    </span>
                  </Button>
                )}
                <Button
                  type="button"
                  variant="primary"
                  data-testid="btn-run-month"
                  onClick={() => navigate('/assignment/run')}
                >
                  <span className="inline-flex items-center gap-1.5">
                    <PlayCircle className="w-4 h-4" />
                    執行月跑
                  </span>
                </Button>
              </div>
            </div>
          </>
        )}
      </main>

      <ConfirmModal
        open={showRollback}
        variant="warning"
        title={`Rollback 名單 ${listNo} 至簽核階段？`}
        description={
          <div className="space-y-2 text-xs text-amber-700">
            <p>名單將退回 <strong>簽核</strong> 階段；準備完成的設定保留不變。</p>
            <p>assignment_approval 紀錄保留。</p>
          </div>
        }
        confirmLabel="確認 Rollback"
        loading={rollbacking}
        loadingText="退回中..."
        onConfirm={handleRollbackConfirm}
        onCancel={() => !rollbacking && setShowRollback(false)}
        testId="confirm-rollback-modal"
        confirmTestId="btn-confirm-rollback"
      />
    </AppLayout>
  );
}
