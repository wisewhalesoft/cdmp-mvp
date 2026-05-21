import { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  ArrowLeft,
  Check,
  XCircle,
  Filter,
  Building2,
  Users,
  History,
  AlertTriangle,
  Clock,
  MessageSquareWarning,
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
  approveList,
  rejectList,
  getDeptRatios,
  getPersonnelRatios,
  getApprovalHistory,
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
import { RejectReasonChips } from './_components/reject-reason-chips';
import { getBusinessRole } from '@/stores/auth-store';
import { writePendingToast } from './_utils/pending-toast';

/**
 * F086 / F087 — 簽核審閱獨立頁
 *
 * 對應 prototype: /prototypes/29c-approval-review.html
 *
 * 路由：/assignment/lists/:listNo/approval
 * RBAC：DirectorRoute（寫入：approve / reject）；section_chief 可進入但只能讀
 *
 * 主要區塊：
 *   - ListSummaryCard
 *   - 部門比例唯讀表（4 欄：部門代碼 / 名稱 / 處長 / RATION）
 *   - 個別比例 accordion（依部門展開，內含唯讀員工表）
 *   - 簽核歷史時間軸
 *   - 操作 bar：返回 / 拒絕（含 reject-reason chips + textarea） / 核准
 *
 * 階段守衛：list.stage 必為 'approval'
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

export function ApprovalReviewPage() {
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
  const [showApprove, setShowApprove] = useState(false);
  const [showReject, setShowReject] = useState(false);
  const [approving, setApproving] = useState(false);
  const [rejecting, setRejecting] = useState(false);
  const [rejectReason, setRejectReason] = useState('');

  const businessRole = getBusinessRole();
  const isSectionChief = businessRole === 'section_chief';
  const canWrite = !isSectionChief;

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

  // 載入 dept ratios + 各部門員工
  useEffect(() => {
    if (!listNo) return;
    let aborted = false;
    void (async () => {
      try {
        const d = await getDeptRatios(listNo);
        if (aborted) return;
        setDepts(d.deptRatios ?? []);
        // 載入每部門員工
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

  // 載入 approval history
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

  const stageMismatch = list && list.stage !== 'approval';
  const trimmedReason = rejectReason.trim();
  const reasonValid = trimmedReason.length > 0;

  const handleApprove = async () => {
    if (!listNo) return;
    setApproving(true);
    try {
      await approveList(listNo);
      writePendingToast({
        type: 'success',
        msg: `名單 ${listNo} 已核准`,
        sub: '進入準備完成階段',
      });
      setShowApprove(false);
      navigate('/assignment/list-definitions');
    } catch (err: unknown) {
      const e = err as { response?: { data?: { message?: string } } };
      showToast(e?.response?.data?.message ?? '核准失敗', 'error');
    } finally {
      setApproving(false);
    }
  };

  const handleReject = async () => {
    if (!listNo || !reasonValid) return;
    setRejecting(true);
    try {
      await rejectList(listNo, { rejectReason: trimmedReason });
      writePendingToast({
        type: 'warning',
        msg: `名單 ${listNo} 已拒絕`,
        sub: '退回個別業務比例階段',
      });
      setShowReject(false);
      setRejectReason('');
      navigate('/assignment/list-definitions');
    } catch (err: unknown) {
      const e = err as { response?: { data?: { message?: string } } };
      showToast(e?.response?.data?.message ?? '拒絕失敗', 'error');
    } finally {
      setRejecting(false);
    }
  };

  // 將 dept + personnel 組成 accordion 結構
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
            onClick={() => navigate('/assignment/list-definitions')}
            className="text-gray-400 hover:text-gray-700"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <h1 className="text-base font-semibold text-gray-800">簽核審閱</h1>
          {list && <StageBadge stage={list.stage as Stage} />}
        </div>
      }
    >
      <main className="flex-1 p-6 space-y-4">
        {loading && (
          <div
            className="text-center text-gray-400 py-12"
            data-testid="approval-review-loading"
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
                    名單目前階段為 <strong>{list.stage}</strong>，不在簽核審閱階段
                  </p>
                </div>
              </div>
            )}

            <ListSummaryCard
              listNo={list.listNo}
              listNm={list.listNm}
              title="簽核審閱"
              description="請仔細審閱以下名單完整摘要後，於頁尾選擇核准推進至「準備完成」階段，或拒絕退回個別業務比例。"
              createdBy={list.createdBy}
              createdAt={list.createdAt.slice(0, 10)}
              conditions={splitConditionsFromList(list)}
              crEnabled={true}
            />

            {/* 部門比例（唯讀表） */}
            <section
              className="bg-white rounded-xl border border-gray-200 p-5"
              data-testid="approval-dept-ratio-table"
            >
              <h2 className="text-base font-semibold text-gray-800 inline-flex items-center gap-2 mb-3">
                <Building2 className="w-4 h-4 text-blue-700" />
                部門比例
                <span className="text-xs text-gray-400 font-normal">（已鎖定）</span>
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

            {/* 個別比例 accordion（唯讀） */}
            <section className="bg-white rounded-xl border border-gray-200 p-5">
              <h2 className="text-base font-semibold text-gray-800 inline-flex items-center gap-2 mb-3">
                <Users className="w-4 h-4 text-cyan-700" />
                個別業務比例
                <span className="text-xs text-gray-400 font-normal">（依部門展開 / 唯讀）</span>
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
                簽核歷史時間軸
                <span className="text-xs text-gray-400 font-normal">
                  （assignment_approval 倒序）
                </span>
              </h2>
              <ApprovalHistoryTimeline
                history={history}
                loading={historyLoading}
              />
            </section>

            {/* 操作 bar */}
            {canWrite && !stageMismatch && (
              <div className="bg-white rounded-xl border border-gray-200 px-5 py-4 flex items-center justify-between gap-3">
                <button
                  type="button"
                  onClick={() => navigate('/assignment/list-definitions')}
                  className="text-sm text-gray-500 hover:text-gray-700 inline-flex items-center gap-1"
                >
                  <ArrowLeft className="w-4 h-4" />
                  返回名單列表
                </button>
                <div className="flex items-center gap-2">
                  <Button
                    type="button"
                    variant="warning"
                    data-testid="btn-reject"
                    onClick={() => setShowReject(true)}
                  >
                    <span className="inline-flex items-center gap-1.5">
                      <XCircle className="w-4 h-4" />
                      拒絕（退回個別業務比例）
                    </span>
                  </Button>
                  <Button
                    type="button"
                    variant="primary"
                    data-testid="btn-approve"
                    onClick={() => setShowApprove(true)}
                  >
                    <span className="inline-flex items-center gap-1.5">
                      <Check className="w-4 h-4" />
                      核准（推進至準備完成）
                    </span>
                  </Button>
                </div>
              </div>
            )}
          </>
        )}
      </main>

      {/* 核准 confirm modal */}
      <ConfirmModal
        open={showApprove}
        variant="success"
        title={`核准名單 ${listNo}？`}
        description={
          <div className="space-y-2 text-xs text-gray-600">
            <p>名單將進入「準備完成」階段，並於下次月跑觸發時參與分派。</p>
            <p>assignment_approval 將寫入 1 筆 approve 紀錄。</p>
          </div>
        }
        confirmLabel="確認核准"
        loading={approving}
        loadingText="核准中..."
        onConfirm={handleApprove}
        onCancel={() => !approving && setShowApprove(false)}
        testId="confirm-approve-modal"
        confirmTestId="btn-confirm-approve"
      />

      {/* 拒絕 modal（自製，因含 textarea 與 chips） */}
      {showReject && (
        <div className="fixed inset-0 z-50" data-testid="reject-modal">
          <div
            className="absolute inset-0 bg-black/50"
            onClick={() => !rejecting && setShowReject(false)}
          />
          <div className="absolute inset-0 flex items-center justify-center p-4">
            <div className="bg-white rounded-xl shadow-2xl w-full max-w-xl">
              <div className="px-5 py-4 border-b border-gray-200 flex items-center gap-2">
                <div className="w-9 h-9 rounded-full bg-amber-100 flex items-center justify-center">
                  <MessageSquareWarning className="w-5 h-5 text-amber-700" />
                </div>
                <div className="flex-1">
                  <h3 className="text-base font-semibold text-gray-800">
                    拒絕名單並退回個別業務比例？
                  </h3>
                  <p className="text-xs text-gray-500 mt-0.5">
                    stage: approval → personnel_ratio（清空 ob_empl_set）
                  </p>
                </div>
              </div>
              <div className="p-5 space-y-3">
                <div className="rounded-lg bg-amber-50/60 border border-amber-200 p-3 flex items-start gap-2 text-xs text-amber-900">
                  <AlertTriangle className="w-4 h-4 text-amber-600 mt-0.5 shrink-0" />
                  <div>
                    <p className="font-semibold">拒絕後將觸發：</p>
                    <ul className="list-disc pl-4 mt-1 space-y-0.5">
                      <li>名單退回「個別業務比例」階段</li>
                      <li>清空所有部門的個別業務員 RATION</li>
                      <li>部門比例保留不變</li>
                      <li>拒絕原因於下次編輯頁主動顯示（latestRejection banner）</li>
                    </ul>
                  </div>
                </div>

                <div>
                  <label
                    htmlFor="reject-reason-textarea"
                    className="block text-xs font-semibold text-gray-700 mb-1.5"
                  >
                    拒絕原因 <span className="text-danger">*</span>
                    <span className="text-gray-400 font-normal">
                      （必填，1-500 字）
                    </span>
                  </label>
                  <textarea
                    id="reject-reason-textarea"
                    data-testid="reject-reason-textarea"
                    rows={4}
                    maxLength={500}
                    value={rejectReason}
                    onChange={(e) => setRejectReason(e.target.value)}
                    placeholder="請填寫具體原因，讓處長能據以調整個別業務員比例"
                    className="w-full px-3 py-2 text-sm border border-gray-200 rounded-md focus:outline-none focus:border-amber-400 focus:ring-2 focus:ring-amber-100 resize-none"
                  />
                  <div className="flex items-center justify-end mt-1">
                    <p className="text-xs text-gray-400">
                      <span>{rejectReason.length}</span> / 500
                    </p>
                  </div>
                </div>

                <RejectReasonChips
                  onApply={(reason) => setRejectReason(reason)}
                  disabled={rejecting}
                />
              </div>
              <div className="flex items-center justify-end gap-3 px-5 py-4 border-t border-gray-200 bg-gray-50/50">
                <button
                  type="button"
                  onClick={() => !rejecting && setShowReject(false)}
                  disabled={rejecting}
                  className="px-4 py-2 text-sm font-medium text-gray-700 border border-gray-200 rounded-lg hover:bg-white disabled:opacity-40"
                >
                  取消
                </button>
                <Button
                  type="button"
                  variant="warning"
                  loading={rejecting}
                  loadingText="拒絕中..."
                  disabled={!reasonValid}
                  onClick={handleReject}
                  data-testid="btn-confirm-reject"
                >
                  <span className="inline-flex items-center gap-1.5">
                    <Clock className="w-4 h-4" />
                    確認拒絕
                  </span>
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}
    </AppLayout>
  );
}
