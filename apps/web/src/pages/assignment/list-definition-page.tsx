import { useState, useEffect, useMemo, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Search,
  Plus,
  Calculator,
  PlayCircle,
  Lock,
  AlertTriangle,
  Layers,
  Pencil,
  Loader,
  Stamp,
  CheckCircle2,
  RotateCcw,
  ArrowRight,
  Archive,
} from 'lucide-react';
import { AppLayout } from '@/components/layout/app-layout';
import { MonthPicker } from '@/components/e07/MonthPicker';
import { StageBadge, STAGE_ORDER, type Stage } from '@/components/e07/StageBadge';
import { ConfirmModal } from '@/components/e07/ConfirmModal';
import { useToast } from '@/components/ui/toast';
import {
  type AssignmentListItem,
  type ListListsResponse,
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
  type StageTransitionResponse,
} from '@/api/assignment-stage';
import { getEffectiveIdentity } from '@/stores/auth-store';
import type { EffectiveIdentity } from '@cdmp/shared';

/**
 * F048 / F050~F052 / F077 / F078 — 名單定義頁
 *
 * 對應 prototype: /prototypes/27-list-definition.html
 *
 * 主要區塊：
 *   - Header: MonthPicker（前後 1 年）
 *   - Banner: historical / locked / future-empty / sales-blocked
 *   - KPI: 5 階段卡片
 *   - 工具列: 搜尋 + Stage 0 試算 / 執行月跑 / 新增名單按鈕（director only 寫入）
 *   - 階段篩選 chips（multi-select）
 *   - 表格: list_no / list_nm / stage / 篩選條件 / CR / 建立者 / 時間 / 操作
 *   - Modal: 停用 / 推進 / Rollback（B5 留位）
 *
 * RBAC（F002 §4.6.2）：
 *   - 整頁：director_or_section_chief（一般 user 由 route guard 攔截，這裡不再封鎖）
 *   - 寫入按鈕（新增/停用/推進）：director only — 處長僅可瀏覽
 */

function toYYYYMM(yyyymm: string): string {
  // 'YYYYMM' → 'YYYY-MM' for display via MonthPicker
  return `${yyyymm.slice(0, 4)}-${yyyymm.slice(4, 6)}`;
}

function toYYYYMMRaw(yyyyMm: string): string {
  return yyyyMm.replace('-', '');
}

function formatDateTime(iso: string): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso.slice(0, 10);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/**
 * E07 P1：依名單 stage 決定「編輯」按鈕的跳轉目的地。
 *
 * - draft → list-edit-draft 編輯欄位
 * - dept_ratio → 部門比例設定頁
 * - personnel_ratio → 個別業務比例設定頁
 * - approval → 簽核審閱頁
 * - ready → ready-summary 詳情頁
 */
function stageNavTarget(listNo: string, stage: string): string {
  switch (stage) {
    case 'draft':
      return `/assignment/list-definitions/${listNo}/edit`;
    case 'dept_ratio':
      return `/assignment/lists/${listNo}/dept-ratio`;
    case 'personnel_ratio':
      return `/assignment/lists/${listNo}/personnel-ratio`;
    case 'approval':
      return `/assignment/lists/${listNo}/approval`;
    case 'ready':
      return `/assignment/ready-summary/${listNo}`;
    default:
      return `/assignment/list-definitions/${listNo}/edit`;
  }
}

/**
 * Phase 5d 波 10：v2.1 篩選條件預覽。
 *
 * 優先順序：
 *   1. conditionPayload != null → 從 conditions[] 萃取（新格式）
 *   2. conditionPayload == null（LEGACY）→ fallback 沿用 5 欄位（v2.0 舊行為），呼叫端應額外渲染 LEGACY 徽章
 *
 * 取前 3 個條件，超過則加「…」。
 */
function buildConditionPreview(list: AssignmentListItem): string {
  // v2.1 path：以 conditionPayload 為來源
  if (list.conditionPayload && list.conditionPayload.conditions.length > 0) {
    const items = list.conditionPayload.conditions.map((c) => {
      if (c.fieldType === 'categorical') {
        const vs = (c.values ?? []).join(',');
        return `${c.columnName} in (${vs})`;
      }
      if (c.fieldType === 'numeric') {
        return `${c.columnName} between ${c.min}~${c.max}`;
      }
      if (c.fieldType === 'date') {
        return `${c.columnName} between ${c.dateStart}~${c.dateEnd}`;
      }
      return c.columnName;
    });
    if (items.length === 0) return '—';
    const head = items.slice(0, 3).join('、');
    return items.length > 3 ? `${head} …(+${items.length - 3})` : head;
  }

  // LEGACY path（v2.0 fallback）：沿用 5 欄位
  const items: string[] = [];
  if (list.prodKind) items.push(`PROD_KIND=${list.prodKind}`);
  if (list.specTp) {
    const vs = list.specTp.split('$$').filter(Boolean).join(',');
    items.push(`SPEC_TP in (${vs})`);
  }
  if (list.caseYear) {
    const vs = list.caseYear.split('$$').filter(Boolean).join(',');
    items.push(`CASEYEAR in (${vs})`);
  }
  if (list.caseStatus) {
    const vs = list.caseStatus.split('$$').filter(Boolean).join(',');
    items.push(`CASE_STATUS in (${vs})`);
  }
  if (list.settleSrc) items.push(`SETTLE_SRC=${list.settleSrc}`);
  if (list.cardType) items.push(`CARD_TYPE=${list.cardType}`);
  if (items.length === 0) return '—';
  const head = items.slice(0, 3).join('、');
  return items.length > 3 ? `${head} …(+${items.length - 3})` : head;
}

function stageNavLabel(stage: string): string {
  switch (stage) {
    case 'draft':
      return '編輯草稿';
    case 'dept_ratio':
      return '設定部門比例';
    case 'personnel_ratio':
      return '設定個別業務比例';
    case 'approval':
      return '進入簽核審閱';
    case 'ready':
      return '查看 ready 詳情';
    default:
      return '查看名單';
  }
}

interface StageFilterChipProps {
  stage: Stage;
  count: number;
  active: boolean;
  onToggle: () => void;
}

function StageFilterChip({ stage, count, active, onToggle }: StageFilterChipProps) {
  return (
    <button
      type="button"
      onClick={onToggle}
      data-testid={`stage-filter-${stage}`}
      className={`transition-all ${active ? 'opacity-100 ring-2 ring-primary/25' : 'opacity-50 hover:opacity-75'} rounded-full`}
    >
      <StageBadge stage={stage} withCount={count} />
    </button>
  );
}

interface KpiCardProps {
  icon: typeof Layers;
  iconBg: string;
  iconColor: string;
  label: string;
  value: number;
  subtitle?: string;
  valueColor?: string;
}

function KpiCard({
  icon: Icon,
  iconBg,
  iconColor,
  label,
  value,
  subtitle,
  valueColor,
}: KpiCardProps) {
  return (
    <div className="bg-white rounded-xl border border-gray-200 px-4 py-3 flex items-center gap-3">
      <div className={`w-10 h-10 rounded-lg ${iconBg} flex items-center justify-center`}>
        <Icon className={`w-5 h-5 ${iconColor}`} />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-[11px] text-gray-500">{label}</p>
        <p className={`text-2xl font-semibold leading-tight ${valueColor ?? 'text-gray-900'}`}>
          {value}
        </p>
        {subtitle && (
          <p className="text-[10px] text-gray-400 mt-0.5">{subtitle}</p>
        )}
      </div>
    </div>
  );
}

export function ListDefinitionPage() {
  const { showToast } = useToast();
  const navigate = useNavigate();
  const identity: EffectiveIdentity = getEffectiveIdentity();
  // 4-角色寫入權限：admin OR director 才有寫入按鈕；section_chief 只讀
  const canWrite = identity === 'admin' || identity === 'director';

  // 當前選定月份（YYYY-MM 顯示用）
  const [ym, setYm] = useState<string>('');
  // backend 回傳之 currentWorkYm（YYYY-MM 顯示用；轉自 YYYYMM）
  const [currentWorkYm, setCurrentWorkYm] = useState<string>('');

  const [data, setData] = useState<ListListsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // UI state
  const [search, setSearch] = useState('');
  const [activeStages, setActiveStages] = useState<Set<Stage>>(
    new Set(STAGE_ORDER),
  );

  // Modal state
  const [disableTarget, setDisableTarget] = useState<AssignmentListItem | null>(
    null,
  );
  const [disableLoading, setDisableLoading] = useState(false);

  // Stage transition modal state
  type StageActionKind = 'advance' | 'rollback';
  const [stageActionTarget, setStageActionTarget] = useState<{
    list: AssignmentListItem;
    kind: StageActionKind;
  } | null>(null);
  const [stageActionLoading, setStageActionLoading] = useState(false);

  const fetchData = useCallback(
    async (selectedYm: string) => {
      setLoading(true);
      setErrorMsg(null);
      try {
        const ymParam = selectedYm ? toYYYYMMRaw(selectedYm) : undefined;
        const result = await listLists({ ym: ymParam });
        setData(result);
        if (!selectedYm) setYm(toYYYYMM(result.selectedYm));
        setCurrentWorkYm(toYYYYMM(result.currentWorkYm));
      } catch (err: unknown) {
        const e = err as {
          response?: { data?: { error?: string; message?: string } };
        };
        setErrorMsg(e?.response?.data?.message ?? '載入名單失敗，請稍後再試');
      } finally {
        setLoading(false);
      }
    },
    [],
  );

  useEffect(() => {
    void fetchData('');
  }, [fetchData]);

  // Re-fetch when ym changes (post-initial)
  useEffect(() => {
    if (!ym || !data) return;
    if (toYYYYMM(data.selectedYm) === ym) return;
    void fetchData(ym);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ym]);

  const filteredLists = useMemo(() => {
    const all = data?.lists ?? [];
    const q = search.trim().toLowerCase();
    return all.filter((l) => {
      if (!activeStages.has(l.stage as Stage)) return false;
      if (!q) return true;
      return (
        l.listNo.toLowerCase().includes(q) ||
        (l.listNm ?? '').toLowerCase().includes(q)
      );
    });
  }, [data, search, activeStages]);

  const stageCounts = data?.stageCounts ?? {
    draft: 0,
    dept_ratio: 0,
    personnel_ratio: 0,
    approval: 0,
    ready: 0,
    disabled: 0,
  };

  const totalCount = data?.lists.length ?? 0;
  const inProgressCount =
    stageCounts.dept_ratio + stageCounts.personnel_ratio + stageCounts.approval;

  const toggleStage = (s: Stage) => {
    setActiveStages((prev) => {
      const next = new Set(prev);
      if (next.has(s)) next.delete(s);
      else next.add(s);
      return next;
    });
  };

  const resetStageFilter = () => setActiveStages(new Set(STAGE_ORDER));

  const handleDisableConfirm = async () => {
    if (!disableTarget) return;
    setDisableLoading(true);
    try {
      await apiDisableList(disableTarget.listNo);
      showToast(`名單 ${disableTarget.listNo} 已停用`, 'success');
      setDisableTarget(null);
      void fetchData(ym);
    } catch (err: unknown) {
      const e = err as {
        response?: { status?: number; data?: { error?: string; message?: string } };
      };
      const msg = e?.response?.data?.message ?? '停用失敗，請稍後再試';
      showToast(msg, 'error');
    } finally {
      setDisableLoading(false);
    }
  };

  // Stage transition: advance / rollback based on current stage
  const doStageTransition = async (
    list: AssignmentListItem,
    kind: StageActionKind,
  ): Promise<StageTransitionResponse | null> => {
    if (kind === 'advance') {
      if (list.stage === 'draft') return advanceToDeptRatio(list.listNo);
      if (list.stage === 'dept_ratio') return advanceToPersonnelRatio(list.listNo);
      if (list.stage === 'personnel_ratio') return advanceToApproval(list.listNo);
    } else {
      if (list.stage === 'dept_ratio') return rollbackToDraft(list.listNo);
      if (list.stage === 'personnel_ratio') return rollbackToDeptRatio(list.listNo);
      if (list.stage === 'ready') return rollbackToApproval(list.listNo);
    }
    return null;
  };

  const stageActionLabel = (list: AssignmentListItem, kind: StageActionKind): string => {
    if (kind === 'advance') {
      if (list.stage === 'draft') return '推進至部門比例';
      if (list.stage === 'dept_ratio') return '推進至個別比例';
      if (list.stage === 'personnel_ratio') return '推進至簽核';
    } else {
      if (list.stage === 'dept_ratio') return 'Rollback 至草稿';
      if (list.stage === 'personnel_ratio') return 'Rollback 至部門比例';
      if (list.stage === 'ready') return 'Rollback 至簽核';
    }
    return '階段變更';
  };

  const handleStageActionConfirm = async () => {
    if (!stageActionTarget) return;
    setStageActionLoading(true);
    try {
      const resp = await doStageTransition(
        stageActionTarget.list,
        stageActionTarget.kind,
      );
      if (resp) {
        showToast(
          `名單 ${stageActionTarget.list.listNo} ${stageActionLabel(stageActionTarget.list, stageActionTarget.kind)} 完成`,
          'success',
        );
      }
      setStageActionTarget(null);
      void fetchData(ym);
    } catch (err: unknown) {
      const e = err as { response?: { data?: { message?: string } } };
      showToast(e?.response?.data?.message ?? '階段變更失敗', 'error');
    } finally {
      setStageActionLoading(false);
    }
  };

  const isHistorical = data?.isHistorical ?? false;
  const isLocked = data?.lockState.locked ?? false;
  const writeDisabled = !canWrite || isHistorical || isLocked;

  return (
    <AppLayout
      title="客戶名單分派 — 名單定義"
      actions={
        ym && (
          <MonthPicker
            value={ym}
            onChange={setYm}
            currentYm={currentWorkYm || ym}
          />
        )
      }
    >
      <main className="flex-1 p-6 space-y-4">
        {/* Historical readonly banner */}
        {isHistorical && (
          <div
            data-testid="historical-banner"
            className="rounded-lg p-3 bg-red-50 border border-red-200 flex items-start gap-2 text-sm"
          >
            <Lock className="w-4 h-4 text-danger mt-0.5 shrink-0" />
            <div className="flex-1">
              <p className="font-semibold text-red-800">歷史月份資料為唯讀，不可修改</p>
              <p className="text-xs text-red-700 mt-0.5">
                您正在檢視 <span className="font-mono font-semibold">{ym}</span> 的歷史快照。
                所有新增 / 編輯 / 推進 / 簽核 / 月跑觸發按鈕已自動隱藏。如需編輯請切換至當月（
                <span className="font-mono font-semibold">{currentWorkYm}</span>）。
              </p>
            </div>
          </div>
        )}

        {/* Locked banner */}
        {isLocked && (
          <div
            data-testid="locked-banner"
            className="rounded-lg p-3 bg-amber-50 border border-amber-200 flex items-start gap-2 text-sm"
          >
            <AlertTriangle className="w-4 h-4 text-warning mt-0.5 shrink-0" />
            <div className="flex-1">
              <p className="font-semibold text-amber-900">分派執行中，名單定義暫時鎖定</p>
              <p className="text-xs text-amber-800 mt-0.5">
                本月 <span className="font-mono font-semibold">assignment_run.status = running</span>，
                無法進行新增、編輯或停用操作；可繼續查看現有名單。
              </p>
            </div>
          </div>
        )}

        {/* KPI cards */}
        <section className="grid grid-cols-5 gap-3" data-testid="kpi-section">
          <KpiCard
            icon={Layers}
            iconBg="bg-gray-100"
            iconColor="text-gray-600"
            label="名單總數"
            value={totalCount}
          />
          <KpiCard
            icon={Pencil}
            iconBg="bg-gray-100"
            iconColor="text-gray-600"
            label="草稿階段"
            value={stageCounts.draft}
            valueColor="text-gray-600"
          />
          <KpiCard
            icon={Loader}
            iconBg="bg-blue-100"
            iconColor="text-blue-800"
            label="進行中"
            value={inProgressCount}
            valueColor="text-blue-800"
            subtitle={`部門 ${stageCounts.dept_ratio} · 個別 ${stageCounts.personnel_ratio} · 簽核 ${stageCounts.approval}`}
          />
          <KpiCard
            icon={Stamp}
            iconBg="bg-amber-100"
            iconColor="text-amber-800"
            label="待簽核"
            value={stageCounts.approval}
            valueColor="text-amber-800"
          />
          <KpiCard
            icon={CheckCircle2}
            iconBg="bg-green-100"
            iconColor="text-green-800"
            label="準備完成"
            value={stageCounts.ready}
            valueColor="text-green-800"
          />
        </section>

        {/* Toolbar + Stage filter */}
        <section className="bg-white rounded-xl border border-gray-200 p-4 space-y-3">
          <div className="flex items-center gap-2 flex-wrap">
            <div className="relative flex-1 max-w-md min-w-[240px]">
              <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="搜尋名單名稱或 LIST_NO..."
                className="w-full pl-9 pr-3 py-2 border border-gray-200 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-primary"
              />
            </div>
            <div className="flex items-center gap-2 ml-auto">
              <button
                type="button"
                data-testid="btn-stage0-estimate"
                onClick={() => navigate('/assignment/estimate')}
                className="inline-flex items-center gap-1.5 px-3 py-2 text-sm text-gray-700 border border-gray-200 rounded-md hover:bg-gray-50"
              >
                <Calculator className="w-4 h-4" />
                Stage 0 試算
              </button>
              <button
                type="button"
                data-testid="btn-ready-summary"
                onClick={() => navigate('/assignment/ready-summary')}
                className="inline-flex items-center gap-1.5 px-3 py-2 text-sm text-gray-700 border border-gray-200 rounded-md hover:bg-gray-50"
              >
                <PlayCircle className="w-4 h-4" />
                執行月跑
              </button>
              <button
                type="button"
                data-testid="btn-create-list"
                disabled={writeDisabled}
                onClick={() =>
                  navigate(`/assignment/list-definitions/new?ym=${ym ?? ''}`)
                }
                className="inline-flex items-center gap-1.5 px-4 py-2 text-sm font-medium text-white bg-primary rounded-md hover:bg-blue-700 shadow-sm disabled:opacity-40 disabled:cursor-not-allowed"
              >
                <Plus className="w-4 h-4" />
                新增名單
              </button>
            </div>
          </div>

          <div className="flex items-center gap-2 flex-wrap pt-1 border-t border-gray-200">
            <span className="text-xs text-gray-500 mr-1">階段篩選：</span>
            {STAGE_ORDER.map((s) => (
              <StageFilterChip
                key={s}
                stage={s}
                count={stageCounts[s] ?? 0}
                active={activeStages.has(s)}
                onToggle={() => toggleStage(s)}
              />
            ))}
            <span className="text-[11px] text-gray-400 ml-2">
              點擊 chip 切換顯示；預設全部選中
            </span>
            <button
              type="button"
              onClick={resetStageFilter}
              className="ml-auto text-xs text-primary hover:underline"
            >
              重設篩選
            </button>
          </div>
        </section>

        {/* Table */}
        <section className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          {loading ? (
            <div className="p-12 text-center text-gray-400" data-testid="lists-loading">
              載入中...
            </div>
          ) : errorMsg ? (
            <div className="p-12 text-center text-red-600" data-testid="lists-error">
              {errorMsg}
            </div>
          ) : filteredLists.length === 0 ? (
            <div
              className="p-12 flex flex-col items-center text-center"
              data-testid="empty-state"
            >
              <div className="w-16 h-16 rounded-full bg-gray-100 flex items-center justify-center mb-4">
                <Layers className="w-8 h-8 text-gray-400" />
              </div>
              <h3 className="text-lg font-semibold text-gray-800 mb-1">
                {totalCount === 0 ? '本月尚無名單' : '無符合條件的名單'}
              </h3>
              <p className="text-sm text-gray-500 max-w-md mb-4">
                {totalCount === 0
                  ? '請點擊上方「新增名單」按鈕建立第一份名單，於月跑前完成定義 → 部門比例 → 個別比例 → 簽核 → 準備完成五階段流程。'
                  : '請調整搜尋關鍵字或階段篩選'}
              </p>
              {isHistorical && (
                <p className="text-xs text-gray-400 italic mt-1">歷史月份不可新增名單</p>
              )}
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead
                  data-testid="list-definition-table-head"
                  className="bg-gray-50 border-b border-gray-200 text-xs text-gray-500 uppercase"
                >
                  <tr>
                    <th className="text-left px-4 py-3 font-medium w-[11%]">LIST_NO</th>
                    <th className="text-left px-4 py-3 font-medium w-[18%]">名單名稱</th>
                    <th className="text-left px-4 py-3 font-medium w-[10%]">階段</th>
                    <th className="text-left px-4 py-3 font-medium w-[20%]">篩選條件</th>
                    <th className="text-left px-4 py-3 font-medium w-[7%]">CR 開關</th>
                    <th className="text-left px-4 py-3 font-medium w-[10%]">建立者</th>
                    <th className="text-left px-4 py-3 font-medium w-[11%]">建立時間</th>
                    <th className="text-right px-4 py-3 font-medium w-[13%]">操作</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200">
                  {filteredLists.map((list) => (
                    <tr key={list.listNo} className="hover:bg-gray-50/50">
                      <td className="px-4 py-3 font-mono text-primary">
                        {list.listNo}
                      </td>
                      <td className="px-4 py-3 text-gray-900">{list.listNm}</td>
                      <td className="px-4 py-3">
                        <StageBadge stage={(list.status === 'inactive' ? 'disabled' : list.stage) as Stage} />
                      </td>
                      <td
                        className="px-4 py-3 text-gray-600 text-xs"
                        data-testid={`list-conditions-${list.listNo}`}
                        title={buildConditionPreview(list)}
                      >
                        <span className="block truncate max-w-[260px]">
                          {buildConditionPreview(list)}
                        </span>
                        {/* Phase 5d 波 10：conditionPayload IS NULL 顯示 LEGACY 小徽章 */}
                        {list.conditionPayload === null && (
                          <span
                            data-testid={`legacy-badge-${list.listNo}`}
                            className="mt-0.5 inline-flex items-center px-1.5 py-0.5 rounded text-[9px] font-semibold uppercase tracking-wider bg-slate-200 text-slate-600 border border-slate-300"
                          >
                            <Archive className="w-2.5 h-2.5 mr-0.5" />
                            LEGACY v2.0
                          </span>
                        )}
                      </td>
                      <td
                        className="px-4 py-3 text-xs"
                        data-testid={`list-cr-${list.listNo}`}
                      >
                        {list.crEnabled === true ? (
                          <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[10px] font-medium bg-green-100 text-green-700">
                            <CheckCircle2 className="w-3 h-3" />
                            啟用
                          </span>
                        ) : list.crEnabled === false ? (
                          <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[10px] font-medium bg-gray-100 text-gray-500">
                            停用
                          </span>
                        ) : (
                          <span className="text-gray-300">—</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-gray-600">{list.createdBy}</td>
                      <td className="px-4 py-3 text-gray-500 text-xs font-mono">
                        {formatDateTime(list.createdAt)}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <div className="inline-flex items-center gap-1">
                          <button
                            type="button"
                            title={stageNavLabel(list.stage)}
                            data-testid={`btn-open-${list.listNo}`}
                            onClick={() =>
                              navigate(stageNavTarget(list.listNo, list.stage))
                            }
                            className="p-1.5 text-xs text-primary hover:bg-blue-50 rounded transition-colors"
                          >
                            <Pencil className="w-3.5 h-3.5" />
                          </button>
                          {canWrite && !writeDisabled && list.stage === 'draft' && (
                            <>
                              <button
                                type="button"
                                title="推進至部門比例"
                                data-testid={`btn-advance-${list.listNo}`}
                                onClick={() =>
                                  setStageActionTarget({ list, kind: 'advance' })
                                }
                                className="p-1.5 text-xs text-primary hover:bg-blue-50 rounded transition-colors"
                              >
                                <ArrowRight className="w-3.5 h-3.5" />
                              </button>
                              <button
                                type="button"
                                title="停用名單"
                                onClick={() => setDisableTarget(list)}
                                className="p-1.5 text-xs text-danger hover:bg-red-50 rounded transition-colors"
                              >
                                <Archive className="w-3.5 h-3.5" />
                              </button>
                            </>
                          )}
                          {canWrite && !writeDisabled && (list.stage === 'dept_ratio' || list.stage === 'personnel_ratio') && (
                            <button
                              type="button"
                              title={stageActionLabel(list, 'advance')}
                              data-testid={`btn-advance-${list.listNo}`}
                              onClick={() => setStageActionTarget({ list, kind: 'advance' })}
                              className="p-1.5 text-xs text-primary hover:bg-blue-50 rounded transition-colors"
                            >
                              <ArrowRight className="w-3.5 h-3.5" />
                            </button>
                          )}
                          {canWrite && !writeDisabled && list.stage !== 'draft' && list.stage !== 'approval' && (
                            <button
                              type="button"
                              title={stageActionLabel(list, 'rollback')}
                              data-testid={`btn-rollback-${list.listNo}`}
                              onClick={() => setStageActionTarget({ list, kind: 'rollback' })}
                              className="p-1.5 text-xs text-warning hover:bg-amber-50 rounded transition-colors"
                            >
                              <RotateCcw className="w-3.5 h-3.5" />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        {/* Footer info */}
        <div className="text-xs text-gray-400 flex items-center justify-between">
          <span>
            顯示 <span data-testid="visible-count">{filteredLists.length}</span> /{' '}
            <span data-testid="total-count">{totalCount}</span> 份名單
          </span>
          <span>
            資料來源：
            <code className="font-mono">
              GET /api/v1/assignment/lists?ym={ym && toYYYYMMRaw(ym)}
            </code>
          </span>
        </div>
      </main>

      {/* 階段推進 / Rollback Modal（F078~F089） + Phase 3 P2-5：含條件數 / CR 狀態詳情 */}
      <ConfirmModal
        open={stageActionTarget !== null}
        variant={stageActionTarget?.kind === 'rollback' ? 'warning' : 'info'}
        title={
          stageActionTarget
            ? `確認${stageActionLabel(stageActionTarget.list, stageActionTarget.kind)}名單 ${stageActionTarget.list.listNo}？`
            : ''
        }
        description={
          stageActionTarget && (
            <div className="space-y-2 text-xs text-gray-600">
              <p>
                名單 <code className="font-mono text-primary">{stageActionTarget.list.listNo}</code> 將{stageActionLabel(stageActionTarget.list, stageActionTarget.kind)}。
              </p>
              {/* Phase 3 P2-5：推進前顯示條件數 + CR 狀態 */}
              <div
                data-testid="stage-action-detail"
                className="rounded-md bg-gray-50 border border-gray-200 p-3 text-xs space-y-1 text-left"
              >
                <div className="flex justify-between">
                  <span className="text-gray-500">名單名稱</span>
                  <span className="text-gray-800 font-medium">
                    {stageActionTarget.list.listNm}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-500">商品 / 卡別</span>
                  <span className="text-gray-800 font-medium">
                    {stageActionTarget.list.prodKind ?? '—'}
                    {stageActionTarget.list.cardType
                      ? ` / ${stageActionTarget.list.cardType}`
                      : ''}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-500">CR 狀態</span>
                  <span className="text-gray-800 font-medium">
                    {stageActionTarget.list.crEnabled === true
                      ? '啟用'
                      : stageActionTarget.list.crEnabled === false
                        ? '停用'
                        : '—'}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-500">篩選條件</span>
                  <span className="text-gray-800 font-medium text-right max-w-[60%]">
                    {buildConditionPreview(stageActionTarget.list)}
                  </span>
                </div>
              </div>
              {stageActionTarget.kind === 'rollback' && (
                <p className="text-amber-700">
                  Rollback 將清空當前階段設定，請確認此操作。
                </p>
              )}
            </div>
          )
        }
        confirmLabel={
          stageActionTarget?.kind === 'rollback' ? '確認 Rollback' : '確認推進'
        }
        loading={stageActionLoading}
        loadingText="處理中..."
        onConfirm={handleStageActionConfirm}
        onCancel={() => setStageActionTarget(null)}
      />

      {/* 停用名單 Modal（F052） */}
      <ConfirmModal
        open={disableTarget !== null}
        variant="danger"
        title={`確認停用名單 ${disableTarget?.listNo ?? ''}？`}
        description={
          disableTarget && (
            <div className="space-y-2">
              <p className="text-xs text-red-700">
                此操作將軟刪除名單；無法直接還原。如名單已非 draft 階段，後端將回 422 LIST_NOT_DRAFT。
              </p>
              <div className="rounded-md bg-gray-50 border border-gray-200 p-3 text-xs space-y-1 text-left">
                <div className="flex justify-between">
                  <span className="text-gray-500">名單名稱</span>
                  <span className="text-gray-800 font-medium">{disableTarget.listNm}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-500">階段</span>
                  <span className="text-gray-800 font-medium">
                    <StageBadge stage={disableTarget.stage as Stage} />
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-500">建立者</span>
                  <span className="text-gray-800 font-medium">{disableTarget.createdBy}</span>
                </div>
              </div>
            </div>
          )
        }
        confirmLabel="確認停用"
        cancelLabel="取消"
        loading={disableLoading}
        loadingText="停用中..."
        onConfirm={handleDisableConfirm}
        onCancel={() => setDisableTarget(null)}
      />
    </AppLayout>
  );
}
