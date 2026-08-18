import { useState, useEffect, useMemo, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Search,
  Plus,
  Lock,
  AlertTriangle,
  Layers,
  Loader,
  Stamp,
  CheckCircle2,
  Pencil,
  Building2,
  Users,
  Archive,
  Gauge,
} from 'lucide-react';
import { AppLayout } from '@/components/layout/app-layout';
import { MonthPicker } from '@/components/e07/MonthPicker';
import { useAssignmentWorkYm } from '@/contexts/assignment-work-ym-context';
import { useToast } from '@/components/ui/toast';
import {
  type AssignmentListItem,
  type ListListsResponse,
  type ListStage,
  type ConditionItem,
  disableList as apiDisableList,
  listLists,
} from '@/api/assignment-list';
import {
  advanceToDeptRatio,
  advanceToPersonnelRatio,
  advanceToApproval,
  rollbackToDraft,
  rollbackToDeptRatio,
  rollbackToApproval,
  approveList,
  rejectList,
} from '@/api/assignment-stage';
import { ConfirmModal } from '@/components/e07/ConfirmModal';
import { getEffectiveIdentity } from '@/stores/auth-store';
import type { EffectiveIdentity } from '@cdmp/shared';
import { RoleStageActions } from './_components/RoleStageActions';
import { ListDetailDrawer } from './_components/ListDetailDrawer';
import { ReadyCtaBanner } from './_components/ReadyCtaBanner';
import { DisableListModal } from './_components/DisableListModal';
import { RejectReasonModal } from './_components/reject-reason-modal';
import { readAndClearPendingToast } from './_utils/pending-toast';
import {
  useConditionDecoder,
  type ConditionDecoder,
} from './_hooks/use-condition-decoder';
import { formatConditionSummary, toSummaryDecoder } from './_utils/condition-summary';

/**
 * F048 v2.0 / F050 v2.2 / F049 v1.1 / F052 v2.1 / F061 v1.4 / F077 v1.3 / F081/F085/F089
 *
 * 對應 prototype: /prototypes/27-list-definition.html v2.3.1
 *
 * 主要區塊：
 *   - Banner: historical / locked / future-empty / sales-blocked
 *   - KPI: 4 卡（總/進行中/待簽核/準備完成）
 *   - 月份準備度進度條
 *   - 工具列: 搜尋 + 新增名單按鈕（v2.3 移除「Stage 0 試算」/「執行月名單分派」既有入口）
 *   - 5 欄 Kanban：draft / dept_ratio / personnel_ratio / approval / ready
 *     Ready 欄頂含 CTA Banner（commit 5 接入）
 *   - Modal: 停用 / 推進 / Rollback
 *   - Detail Drawer 4-tab（commit 5 接入）
 *   - sessionStorage cdmp.pendingToast consumer（commit 6 接入；本 commit 已先 useEffect）
 *
 * BR-10：user 整頁封鎖 → 顯示 sales-blocked card，不渲染 Kanban / Toolbar
 */

function toYYYYMM(yyyymm: string): string {
  if (!yyyymm) return '';
  return `${yyyymm.slice(0, 4)}-${yyyymm.slice(4, 6)}`;
}

function toYYYYMMRaw(yyyyMm: string): string {
  return yyyyMm.replace('-', '');
}

const STAGE_ORDER_RAW: ListStage[] = [
  'draft',
  'dept_ratio',
  'personnel_ratio',
  'approval',
  'ready',
];

const STAGE_LABEL: Record<ListStage, string> = {
  draft: '草稿',
  dept_ratio: '部門比例',
  personnel_ratio: '個別比例',
  approval: '待簽核',
  ready: '準備完成',
};

const STAGE_ICON: Record<ListStage, typeof Pencil> = {
  draft: Pencil,
  dept_ratio: Building2,
  personnel_ratio: Users,
  approval: Stamp,
  ready: CheckCircle2,
};

const STAGE_BORDER_CLASS: Record<ListStage, string> = {
  draft: 'border-gray-300 bg-gray-50',
  dept_ratio: 'border-blue-200 bg-blue-50',
  personnel_ratio: 'border-cyan-200 bg-cyan-50',
  approval: 'border-amber-200 bg-amber-50',
  ready: 'border-green-200 bg-green-50',
};

const STAGE_BAR_COLOR: Record<ListStage, string> = {
  draft: 'bg-gray-400',
  dept_ratio: 'bg-blue-500',
  personnel_ratio: 'bg-cyan-500',
  approval: 'bg-amber-500',
  ready: 'bg-green-500',
};

/**
 * Condition chips 短描述：取前 2 個 condition，超過顯示 +N。
 * 欄位名稱與（類別型）值代碼皆經 decoder 轉為使用者友善中文；查無對照回傳原始代碼。
 */
/**
 * F119 / BR-10 / I-CATOP-DISPLAY-SINGLE-01：條件描述字串一律由 `formatConditionSummary()`
 * 產生（含文字運算子），本處不得自拼——既有 `IN []` 類顯示缺陷正源於各頁各自組字串。
 * 過長時以 CSS `truncate` + `title` 收斂（附錄 C C-14），不做字串層截斷。
 */
function renderConditionChips(
  conditions: ConditionItem[],
  decoder: ConditionDecoder,
): { chips: string[]; extra: number } {
  const summaryDecoder = toSummaryDecoder(decoder);
  const chips = conditions
    .slice(0, 2)
    .map((c) => formatConditionSummary(c, summaryDecoder));
  return { chips, extra: Math.max(0, conditions.length - 2) };
}

interface KanbanCardProps {
  list: AssignmentListItem;
  identity: EffectiveIdentity;
  decoder: ConditionDecoder;
  isHistorical: boolean;
  isLocked: boolean;
  onView: (l: AssignmentListItem) => void;
  onEdit: (l: AssignmentListItem) => void;
  onAdvance: (l: AssignmentListItem) => void;
  onDisable: (l: AssignmentListItem) => void;
  onConfigure: (l: AssignmentListItem) => void;
  onRollback: (l: AssignmentListItem) => void;
  onReview: (l: AssignmentListItem) => void;
  onApprove: (l: AssignmentListItem) => void;
  onReject: (l: AssignmentListItem) => void;
  onQuickTemplate: (l: AssignmentListItem) => void;
  onSetMyDept: (l: AssignmentListItem) => void;
}

function KanbanCard({
  list,
  identity,
  decoder,
  isHistorical,
  isLocked,
  onView,
  onEdit,
  onAdvance,
  onDisable,
  onConfigure,
  onRollback,
  onReview,
  onApprove,
  onReject,
  onQuickTemplate,
  onSetMyDept,
}: KanbanCardProps) {
  const isLegacy = list.conditionPayload === null;
  const conditions = list.conditionPayload?.conditions ?? [];
  const { chips, extra } = renderConditionChips(conditions, decoder);

  return (
    <div
      data-testid={`kanban-card-${list.listNo}`}
      className="bg-white rounded-lg border border-gray-200 p-2.5 hover:border-gray-300 transition"
    >
      <div className="flex items-center justify-between mb-1">
        <code className="font-mono text-[10px] text-blue-700 truncate">{list.listNo}</code>
        {list.crEnabled ? (
          <span className="inline-flex items-center gap-1 px-1.5 py-0.5 bg-green-50 text-green-700 rounded-full text-[9px]">
            <span className="w-1 h-1 rounded-full bg-green-600" />
            CR
          </span>
        ) : (
          <span className="inline-flex items-center gap-1 px-1.5 py-0.5 bg-gray-100 text-gray-500 rounded-full text-[9px]">
            <span className="w-1 h-1 rounded-full bg-gray-400" />
            CR 停
          </span>
        )}
      </div>
      <div className="text-xs font-medium text-gray-800 mb-1.5 leading-tight">{list.listNm}</div>
      <div className="flex flex-wrap gap-1 mb-1.5">
        {isLegacy ? (
          <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[9px] font-semibold uppercase bg-slate-100 text-slate-600 border border-slate-200">
            <Archive className="w-2.5 h-2.5" />
            LEGACY
          </span>
        ) : (
          <>
            {chips.map((chip, idx) => (
              <span
                key={idx}
                data-condition-summary
                title={chip}
                className="inline-block max-w-full truncate align-bottom px-1.5 py-0.5 bg-blue-50 text-blue-700 border border-blue-100 rounded text-[10px]"
              >
                {chip}
              </span>
            ))}
            {extra > 0 && (
              <span className="text-[10px] text-gray-400">+{extra}</span>
            )}
          </>
        )}
      </div>
      <div className="flex items-center justify-between text-[10px] text-gray-500 mb-2">
        <span className="truncate">{list.createdBy}</span>
        <span className="font-mono">{(list.createdAt ?? '').slice(0, 10)}</span>
      </div>
      <RoleStageActions
        list={list}
        identity={identity}
        isHistorical={isHistorical}
        isLocked={isLocked}
        onView={onView}
        onEdit={onEdit}
        onAdvance={onAdvance}
        onDisable={onDisable}
        onConfigure={onConfigure}
        onRollback={onRollback}
        onReview={onReview}
        onApprove={onApprove}
        onReject={onReject}
        onQuickTemplate={onQuickTemplate}
        onSetMyDept={onSetMyDept}
      />
    </div>
  );
}

export function ListDefinitionPage() {
  const { showToast } = useToast();
  const navigate = useNavigate();
  const identity: EffectiveIdentity = getEffectiveIdentity();
  const isWriter = identity === 'admin' || identity === 'director';
  const isSalesBlocked = identity === 'user';

  // F097 / US-137：分派作業月份取自共享 Context（target_work_ym），四頁同步
  const {
    currentWorkYm: ctxCurrentWorkYm,
    targetWorkYm,
    setTargetWorkYm,
  } = useAssignmentWorkYm();
  const ym = toYYYYMM(targetWorkYm); // 本頁內部沿用 YYYY-MM
  const setYm = (next: string) => setTargetWorkYm(toYYYYMMRaw(next));
  const currentWorkYm = toYYYYMM(ctxCurrentWorkYm);
  const [data, setData] = useState<ListListsResponse | null>(null);
  const [, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [search, setSearch] = useState('');

  // F048 v2.0 / F050 v2.2 Detail Drawer：當前開啟的 listNo（null = 關閉）
  const [drawerListNo, setDrawerListNo] = useState<string | null>(null);

  // F052 v2.1 停用 modal target（null = 關閉）
  const [disableTarget, setDisableTarget] = useState<AssignmentListItem | null>(null);
  const [disableLoading, setDisableLoading] = useState(false);

  // F086/F087 簽核就地操作（29c 審閱頁移除後改在卡片就地核准/拒絕）
  const [approveTarget, setApproveTarget] = useState<AssignmentListItem | null>(null);
  const [approving, setApproving] = useState(false);
  const [rejectTarget, setRejectTarget] = useState<AssignmentListItem | null>(null);
  const [rejecting, setRejecting] = useState(false);

  // F050 v2.2 BR-13 / US-133：mount 時 consume pending toast（commit 6 完整接入）
  useEffect(() => {
    const payload = readAndClearPendingToast();
    if (payload) {
      // toast type: 'success' | 'info' | 'warning' | 'error'
      const message = payload.sub ? `${payload.msg} - ${payload.sub}` : payload.msg;
      showToast(message, payload.type);
    }
    // 僅 mount 一次
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const fetchData = useCallback(async (selectedYm: string) => {
    setLoading(true);
    setErrorMsg(null);
    try {
      const ymParam = selectedYm ? toYYYYMMRaw(selectedYm) : undefined;
      const result = await listLists({ ym: ymParam });
      setData(result);
    } catch (err: unknown) {
      const e = err as { response?: { data?: { error?: string; message?: string } } };
      setErrorMsg(e?.response?.data?.message ?? '載入名單失敗，請稍後再試');
    } finally {
      setLoading(false);
    }
  }, []);

  // F097：以共享 Context 之 target_work_ym（ym）驅動載入；ym 變更即重抓（一處切換全頁同步）
  useEffect(() => {
    if (isSalesBlocked) {
      setLoading(false);
      return;
    }
    if (!ym) return; // Context 初始化前不抓
    void fetchData(ym);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ym, isSalesBlocked]);

  const isHistorical = data?.isHistorical ?? false;
  const isLocked = data?.lockState?.locked ?? false;

  // 條件 chip 代碼 → 中文解碼器：彙整全部名單引用之欄位，延遲載入對應 options。
  const conditionColumns = useMemo(
    () =>
      (data?.lists ?? []).flatMap(
        (l) => l.conditionPayload?.conditions?.map((c) => c.columnName) ?? [],
      ),
    [data],
  );
  const decoder = useConditionDecoder(conditionColumns);

  const filteredByStage = useMemo(() => {
    const all = data?.lists ?? [];
    const q = search.trim().toLowerCase();
    const matched = q
      ? all.filter(
          (l) =>
            l.listNo.toLowerCase().includes(q) ||
            (l.listNm ?? '').toLowerCase().includes(q),
        )
      : all;
    const map: Record<ListStage, AssignmentListItem[]> = {
      draft: [],
      dept_ratio: [],
      personnel_ratio: [],
      approval: [],
      ready: [],
    };
    for (const l of matched) {
      if (STAGE_ORDER_RAW.includes(l.stage as ListStage)) {
        map[l.stage as ListStage].push(l);
      }
    }
    return map;
  }, [data, search]);

  const stageCounts = data?.stageCounts ?? {
    draft: 0,
    dept_ratio: 0,
    personnel_ratio: 0,
    approval: 0,
    ready: 0,
    disabled: 0,
  };

  const totalActive =
    (stageCounts.draft ?? 0) +
    (stageCounts.dept_ratio ?? 0) +
    (stageCounts.personnel_ratio ?? 0) +
    (stageCounts.approval ?? 0) +
    (stageCounts.ready ?? 0);
  const inProgress =
    (stageCounts.dept_ratio ?? 0) +
    (stageCounts.personnel_ratio ?? 0) +
    (stageCounts.approval ?? 0);
  const readyCount = stageCounts.ready ?? 0;
  const remaining = totalActive - readyCount;

  // Handlers
  const handleView = (l: AssignmentListItem) => {
    setDrawerListNo(l.listNo);
  };
  const handleTriggerRun = () => {
    navigate('/assignment/run');
  };
  const handleEdit = (l: AssignmentListItem) =>
    navigate(`/assignment/list-definitions/${l.listNo}/edit`);
  const handleAdvance = async (l: AssignmentListItem) => {
    try {
      if (l.stage === 'draft') await advanceToDeptRatio(l.listNo);
      else if (l.stage === 'dept_ratio') await advanceToPersonnelRatio(l.listNo);
      else if (l.stage === 'personnel_ratio') await advanceToApproval(l.listNo);
      showToast(`名單 ${l.listNo} 已推進階段`, 'success');
      await fetchData(ym);
    } catch (err: unknown) {
      const e = err as { response?: { data?: { message?: string } } };
      showToast(e?.response?.data?.message ?? '推進失敗', 'error');
    }
  };
  const handleDisable = (l: AssignmentListItem) => {
    // 開啟 DisableListModal，等使用者勾選 checkbox 後再呼叫 API
    setDisableTarget(l);
  };

  const handleDisableConfirm = async () => {
    if (!disableTarget) return;
    setDisableLoading(true);
    try {
      await apiDisableList(disableTarget.listNo);
      showToast(`名單 ${disableTarget.listNo} 已停用`, 'success');
      setDisableTarget(null);
      await fetchData(ym);
    } catch (err: unknown) {
      const e = err as { response?: { data?: { message?: string } } };
      showToast(e?.response?.data?.message ?? '停用失敗', 'error');
    } finally {
      setDisableLoading(false);
    }
  };
  const handleConfigure = (l: AssignmentListItem) => {
    if (l.stage === 'dept_ratio') navigate(`/assignment/lists/${l.listNo}/dept-ratio`);
    else if (l.stage === 'personnel_ratio')
      navigate(`/assignment/lists/${l.listNo}/personnel-ratio`);
  };
  const handleRollback = async (l: AssignmentListItem) => {
    // commit 8 補 info toast + 卡片即時遷移
    try {
      if (l.stage === 'dept_ratio') await rollbackToDraft(l.listNo);
      else if (l.stage === 'personnel_ratio') await rollbackToDeptRatio(l.listNo);
      else if (l.stage === 'ready') await rollbackToApproval(l.listNo);
      showToast(`名單 ${l.listNo} 已退回`, 'info');
      await fetchData(ym);
    } catch (err: unknown) {
      const e = err as { response?: { data?: { message?: string } } };
      showToast(e?.response?.data?.message ?? '退回失敗', 'error');
    }
  };
  const handleReview = (l: AssignmentListItem) =>
    navigate(`/assignment/lists/${l.listNo}/personnel-ratio`);
  // F086/F087：核准 / 拒絕改為卡片就地彈 modal，確認後就地呼叫 API + refetch（不離開頁面）
  const handleApprove = (l: AssignmentListItem) => setApproveTarget(l);
  const handleReject = (l: AssignmentListItem) => setRejectTarget(l);

  const handleApproveConfirm = async () => {
    if (!approveTarget) return;
    setApproving(true);
    try {
      await approveList(approveTarget.listNo);
      showToast(`名單 ${approveTarget.listNo} 已核准`, 'success');
      setApproveTarget(null);
      await fetchData(ym);
    } catch (err: unknown) {
      const e = err as { response?: { data?: { message?: string } } };
      showToast(e?.response?.data?.message ?? '核准失敗', 'error');
    } finally {
      setApproving(false);
    }
  };

  const handleRejectConfirm = async (reason: string) => {
    if (!rejectTarget) return;
    setRejecting(true);
    try {
      await rejectList(rejectTarget.listNo, { rejectReason: reason });
      showToast(`名單 ${rejectTarget.listNo} 已拒絕`, 'warning');
      setRejectTarget(null);
      await fetchData(ym);
    } catch (err: unknown) {
      const e = err as { response?: { data?: { message?: string } } };
      showToast(e?.response?.data?.message ?? '拒絕失敗', 'error');
    } finally {
      setRejecting(false);
    }
  };
  const handleQuickTemplate = (l: AssignmentListItem) =>
    navigate(`/assignment/lists/${l.listNo}/personnel-ratio`);
  const handleSetMyDept = (l: AssignmentListItem) =>
    navigate(`/assignment/lists/${l.listNo}/personnel-ratio`);

  // ============================================================
  // BR-10：user 整頁封鎖
  // ============================================================
  if (isSalesBlocked) {
    return (
      <AppLayout title="客戶名單分派 — 名單定義">
        <main className="flex-1 p-6">
          <div
            data-testid="sales-blocked-banner"
            className="bg-white rounded-xl border border-gray-200 p-12 flex flex-col items-center text-center"
          >
            <div className="w-16 h-16 rounded-full bg-gray-100 flex items-center justify-center mb-4">
              <Lock className="w-8 h-8 text-gray-400" />
            </div>
            <h3 className="text-lg font-semibold text-gray-800 mb-1">您無此頁面權限</h3>
            <p className="text-sm text-gray-500 max-w-md">
              「名單定義」為部長 / 處長 / Admin 專屬功能。
            </p>
          </div>
        </main>
      </AppLayout>
    );
  }

  return (
    <AppLayout
      title="客戶名單分派 — 名單定義"
      actions={
        ym ? (
          <div
            className="flex items-center gap-2"
            data-testid="list-definition-month-picker"
          >
            <span className="text-xs text-gray-500 whitespace-nowrap">
              分派作業月份
            </span>
            <MonthPicker
              value={ym}
              onChange={setYm}
              currentYm={currentWorkYm || ym}
            />
          </div>
        ) : undefined
      }
    >
      <main className="flex-1 p-6 space-y-4">
        {/* Banner: historical readonly */}
        {isHistorical && (
          <div
            data-testid="historical-banner"
            className="rounded-lg p-3 bg-red-50 border border-red-200 flex items-start gap-2 text-sm"
          >
            <Lock className="w-4 h-4 text-red-600 mt-0.5 shrink-0" />
            <div className="flex-1">
              <p className="font-semibold text-red-800">歷史月份資料為唯讀</p>
              <p className="text-xs text-red-700 mt-0.5">
                您正在檢視 <span className="font-mono font-semibold">{ym}</span>{' '}
                的歷史快照。寫入操作已自動隱藏。
              </p>
            </div>
          </div>
        )}

        {/* Banner: locked (月名單分派執行中) */}
        {isLocked && (
          <div
            data-testid="locked-banner"
            className="rounded-lg p-3 bg-amber-50 border border-amber-200 flex items-start gap-2 text-sm"
          >
            <AlertTriangle className="w-4 h-4 text-amber-600 mt-0.5 shrink-0" />
            <div className="flex-1">
              <p className="font-semibold text-amber-800">分派執行中，名單定義暫時鎖定</p>
              <p className="text-xs text-amber-700 mt-0.5">
                所有寫入按鈕已禁用，請待月名單分派完成後再進行操作。
              </p>
            </div>
          </div>
        )}

        {errorMsg && (
          <div className="rounded-lg p-3 bg-red-50 border border-red-200 text-sm text-red-800">
            {errorMsg}
          </div>
        )}

        {/* KPI 4 卡 */}
        <section className="grid grid-cols-4 gap-3">
          <KpiCard testId="kpi-total" icon={Layers} label="名單總數" value={totalActive} />
          <KpiCard
            testId="kpi-in-progress"
            icon={Loader}
            label="進行中"
            value={inProgress}
            iconColor="text-blue-600"
            iconBg="bg-blue-100"
          />
          <KpiCard
            testId="kpi-approval"
            icon={Stamp}
            label="待簽核"
            value={stageCounts.approval ?? 0}
            iconColor="text-amber-700"
            iconBg="bg-amber-100"
          />
          <KpiCard
            testId="kpi-ready"
            icon={CheckCircle2}
            label="準備完成"
            value={readyCount}
            iconColor="text-green-700"
            iconBg="bg-green-100"
          />
        </section>

        {/* 月份準備度進度條 */}
        <section
          data-testid="ready-progress-bar"
          className="bg-white rounded-xl border border-gray-200 p-4"
        >
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <Gauge className="w-4 h-4 text-blue-700" />
              <h3 className="text-sm font-semibold text-gray-800">
                {ym} 月份準備度
              </h3>
              <span className="text-xs text-gray-500">|</span>
              <span className="text-xs text-gray-600">
                已完成{' '}
                <span className="font-semibold text-green-700">{readyCount}</span> /{' '}
                <span className="font-semibold">{totalActive}</span>
              </span>
            </div>
            <span className="text-xs text-gray-500">
              尚有 <span className="font-semibold text-amber-600">{remaining}</span> 份未完成準備
            </span>
          </div>
          <div className="h-2 rounded-full bg-gray-100 overflow-hidden flex">
            {STAGE_ORDER_RAW.map((s) => {
              const cnt = stageCounts[s] ?? 0;
              const w = totalActive === 0 ? 0 : (cnt / totalActive) * 100;
              return (
                <div key={s} className={`h-full ${STAGE_BAR_COLOR[s]}`} style={{ width: `${w}%` }} />
              );
            })}
          </div>
        </section>

        {/* Toolbar */}
        <section
          data-testid="toolbar"
          className="bg-white rounded-xl border border-gray-200 p-3 flex items-center gap-2 flex-wrap"
        >
          <div className="relative flex-1 max-w-md min-w-[240px]">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              data-testid="search-input"
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="搜尋名單名稱或編號…"
              className="w-full pl-9 pr-3 py-2 border border-gray-200 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <div className="flex items-center gap-2 ml-auto">
            <button
              type="button"
              data-testid="btn-create"
              onClick={() =>
                navigate(`/assignment/list-definitions/new?ym=${ym}`)
              }
              disabled={!isWriter || isHistorical || isLocked}
              className="inline-flex items-center gap-1.5 px-4 py-2 text-sm font-medium text-white bg-blue-700 rounded-md hover:bg-blue-800 shadow-sm disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <Plus className="w-4 h-4" />
              新增名單
            </button>
          </div>
        </section>

        {/* 5 欄 Kanban */}
        <section
          data-testid="kanban-board"
          className="grid grid-cols-5 gap-3"
        >
          {STAGE_ORDER_RAW.map((s) => {
            const Icon = STAGE_ICON[s];
            const colItems = filteredByStage[s];
            const totalInStage = stageCounts[s] ?? 0;
            const colPct = totalActive === 0 ? 0 : (totalInStage / totalActive) * 100;
            return (
              <div
                key={s}
                data-testid={`kanban-column-${s}`}
                className={`rounded-xl border-2 overflow-hidden flex flex-col ${STAGE_BORDER_CLASS[s]}`}
              >
                <div className="px-3 py-2.5 border-b-2 flex items-center justify-between bg-white">
                  <div className="flex items-center gap-1.5">
                    <Icon className="w-4 h-4 text-gray-700" />
                    <span className="text-xs font-semibold text-gray-700">{STAGE_LABEL[s]}</span>
                  </div>
                  <span
                    data-testid={`column-count-${s}`}
                    className={`inline-flex items-center justify-center min-w-[24px] h-5 px-1.5 rounded-full text-[11px] font-bold text-white ${STAGE_BAR_COLOR[s]}`}
                  >
                    {totalInStage}
                  </span>
                </div>
                <div className="px-3 pt-2 pb-1 bg-white">
                  <div className="h-1 rounded-full bg-gray-100 overflow-hidden">
                    <div className={`h-full ${STAGE_BAR_COLOR[s]}`} style={{ width: `${colPct}%` }} />
                  </div>
                </div>
                {/* Ready 欄頂 CTA Banner — F049 v1.1 + F061 v1.4 */}
                {s === 'ready' && totalInStage > 0 && !isHistorical && (
                  <ReadyCtaBanner
                    readyCount={totalInStage}
                    workYm={ym}
                    isLocked={isLocked}
                    onTriggerRun={handleTriggerRun}
                  />
                )}
                <div className="flex-1 p-2 space-y-2 bg-white min-h-[100px]">
                  {colItems.length === 0 ? (
                    <div className="p-4 text-center text-[11px] text-gray-400 italic">無名單</div>
                  ) : (
                    colItems.map((l) => (
                      <KanbanCard
                        key={l.listNo}
                        list={l}
                        identity={identity}
                        decoder={decoder}
                        isHistorical={isHistorical}
                        isLocked={isLocked}
                        onView={handleView}
                        onEdit={handleEdit}
                        onAdvance={handleAdvance}
                        onDisable={handleDisable}
                        onConfigure={handleConfigure}
                        onRollback={handleRollback}
                        onReview={handleReview}
                        onApprove={handleApprove}
                        onReject={handleReject}
                        onQuickTemplate={handleQuickTemplate}
                        onSetMyDept={handleSetMyDept}
                      />
                    ))
                  )}
                </div>
              </div>
            );
          })}
        </section>

        {/* Detail Drawer — F048 v2.0 + F050 v2.2 §6.2 */}
        <ListDetailDrawer listNo={drawerListNo} onClose={() => setDrawerListNo(null)} />

        {/* F052 v2.1 停用名單確認對話框（「停用」全寫） */}
        <DisableListModal
          target={disableTarget}
          loading={disableLoading}
          onConfirm={handleDisableConfirm}
          onCancel={() => setDisableTarget(null)}
        />

        {/* F086 核准確認對話框（就地） */}
        <ConfirmModal
          open={!!approveTarget}
          variant="success"
          title={`核准名單 ${approveTarget?.listNo ?? ''}？`}
          description={
            <div className="space-y-2 text-xs text-gray-600">
              <p>名單將進入「準備完成」階段，並於下次月名單分派觸發時參與分派。</p>
            </div>
          }
          confirmLabel="確認核准"
          loading={approving}
          loadingText="核准中..."
          onConfirm={handleApproveConfirm}
          onCancel={() => !approving && setApproveTarget(null)}
          testId="confirm-approve-modal"
          confirmTestId="btn-confirm-approve"
        />

        {/* F087 拒絕對話框（就地；含必填原因 + 快速 chip） */}
        {rejectTarget && (
          <RejectReasonModal
            open
            listNo={rejectTarget.listNo}
            loading={rejecting}
            onConfirm={handleRejectConfirm}
            onCancel={() => setRejectTarget(null)}
          />
        )}
      </main>
    </AppLayout>
  );
}

interface KpiCardProps {
  testId: string;
  icon: typeof Layers;
  label: string;
  value: number;
  iconColor?: string;
  iconBg?: string;
}
function KpiCard({
  testId,
  icon: Icon,
  label,
  value,
  iconColor = 'text-gray-700',
  iconBg = 'bg-gray-100',
}: KpiCardProps) {
  return (
    <div className="bg-white rounded-xl border border-gray-200 px-4 py-3 flex items-center gap-3">
      <div className={`w-10 h-10 rounded-lg ${iconBg} flex items-center justify-center`}>
        <Icon className={`w-5 h-5 ${iconColor}`} />
      </div>
      <div>
        <p className="text-[11px] text-gray-500">{label}</p>
        <p data-testid={testId} className="text-2xl font-semibold text-gray-900 leading-tight">
          {value}
        </p>
      </div>
    </div>
  );
}
