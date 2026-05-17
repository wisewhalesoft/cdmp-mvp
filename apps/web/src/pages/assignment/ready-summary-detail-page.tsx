import { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  ArrowLeft,
  Undo2,
  PlayCircle,
  CheckCircle2,
  Building2,
  Users,
  History,
  Crown,
  AlertTriangle,
  Calendar,
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
  type PersonnelRatioEmployee,
  type ApprovalHistoryItem,
} from '@/api/assignment-stage';
import { ListSummaryCard } from './_components/list-summary-card';
import {
  PersonnelRatioAccordion,
  type AccordionDept,
} from './_components/personnel-ratio-accordion';
import { ApprovalHistoryTimeline } from './_components/approval-history-timeline';
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
  const [personnelByDept, setPersonnelByDept] = useState<
    Record<string, PersonnelRatioEmployee[]>
  >({});
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
        const d = await getDeptRatios(listNo);
        if (aborted) return;
        setDepts(d.deptRatios ?? []);
        const byDept: Record<string, PersonnelRatioEmployee[]> = {};
        for (const dept of d.deptRatios ?? []) {
          try {
            const p = await getPersonnelRatios(listNo, dept.obdeptId);
            byDept[dept.obdeptId] = p.employees ?? [];
          } catch {
            byDept[dept.obdeptId] = [];
          }
        }
        if (!aborted) setPersonnelByDept(byDept);
      } catch {
        // ignore
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
      navigate(`/assignment/lists/${listNo}/approval`);
    } catch (err: unknown) {
      const e = err as { response?: { data?: { message?: string } } };
      showToast(e?.response?.data?.message ?? '退回失敗', 'error');
    } finally {
      setRollbacking(false);
    }
  };

  const totalEmployees = Object.values(personnelByDept).reduce(
    (a, emps) => a + emps.length,
    0,
  );
  const lastApprove = history.find((h) => h.action === 'approve');

  const accordionDepts: AccordionDept[] = depts.map((d) => {
    const emps = personnelByDept[d.obdeptId] ?? [];
    const sum =
      emps.length > 0
        ? Math.round(emps.reduce((a, e) => a + (e.ration ?? 0), 0) * 100) / 100
        : 0;
    return {
      deptCode: d.obdeptId,
      deptName: d.obdeptNm,
      sum,
      complete: Math.abs(sum - 100) <= 0.01,
    };
  });

  return (
    <AppLayout
      headerLeft={
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => navigate('/assignment/ready-summary')}
            className="text-gray-400 hover:text-gray-700"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <h1 className="text-base font-semibold text-gray-800">
            準備完成詳情
          </h1>
          {list && <StageBadge stage={list.stage as Stage} />}
        </div>
      }
    >
      <main className="flex-1 p-6 space-y-4">
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
                    {totalEmployees}
                  </p>
                </div>
                <div className="text-center">
                  <p className="text-[10px] text-gray-400 uppercase tracking-wider">
                    階段
                  </p>
                  <div className="mt-1.5 inline-flex items-center gap-1 px-2 py-0.5 text-xs font-medium rounded-full bg-green-100 text-green-700">
                    <CheckCircle2 className="w-3 h-3" />
                    準備完成
                  </div>
                </div>
                <div className="text-center" data-testid="detail-stat-history-count">
                  <p className="text-[10px] text-gray-400 uppercase tracking-wider">
                    簽核紀錄
                  </p>
                  <p className="text-xl font-semibold text-gray-800 tabular-nums mt-0.5">
                    {history.length}
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
                  return (
                    <table className="w-full text-sm">
                      <thead className="bg-gray-50 text-xs text-gray-500">
                        <tr>
                          <th className="text-left px-3 py-2 font-medium">員工編號</th>
                          <th className="text-left px-3 py-2 font-medium">姓名</th>
                          <th className="text-right px-3 py-2 font-medium">RATION</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-100">
                        {emps.map((e) => (
                          <tr key={e.empId}>
                            <td className="px-3 py-1.5 font-mono text-xs text-primary">
                              {e.empId}
                            </td>
                            <td className="px-3 py-1.5 text-gray-800">
                              {e.empName}
                            </td>
                            <td className="px-3 py-1.5 text-right font-mono">
                              {formatPct(e.ration ?? 0)}
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
