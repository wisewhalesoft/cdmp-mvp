import { useState, useEffect, useCallback, useMemo } from 'react';
import {
  Package,
  Layers,
  CheckCircle,
  Search,
  RotateCcw,
  Plus,
  Pencil,
  Ban,
  Lock,
  AlertTriangle,
  Info,
  X,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react';
import { AppLayout } from '@/components/layout/app-layout';
import {
  ASSIGNMENT_TBL_IDS,
  TBL_ID_LABELS,
  type AssignmentTblId,
  type AssignmentCodeItem,
  listAssignmentCodes,
  createAssignmentCode,
  updateAssignmentCode,
  disableAssignmentCode,
} from '@/api/assignment-codes';

/**
 * F068：E07 代碼維護頁面。
 *
 * 對應 prototype: /prototypes/37-base-code.html
 *
 * 三 Tabs（PROD_KIND / SPEC_TP / CASE_STATUS）、Demo Bar、搜尋 + 狀態篩選、
 * CASE_STATUS 業務語意對照 banner、新增 / 編輯 / 停用 Modal。
 *
 * Demo Bar 為純前端顯示開關（控制 statusFilter），對齊 prototype 行為。
 */

type StatusFilter = 'all' | 'active' | 'future' | 'expired';

interface FormState {
  mode: 'create' | 'edit';
  tblCd: string;
  tblDesc1: string;
  tblDesc2: string;
  stadt: string;
  enddt: string;
}

function getTodayYmdInTaipei(): string {
  const now = new Date();
  const taipei = new Date(now.getTime() + 8 * 60 * 60 * 1000);
  const yyyy = taipei.getUTCFullYear().toString().padStart(4, '0');
  const mm = (taipei.getUTCMonth() + 1).toString().padStart(2, '0');
  const dd = taipei.getUTCDate().toString().padStart(2, '0');
  return `${yyyy}${mm}${dd}`;
}

function statusOf(item: AssignmentCodeItem, today: string): StatusFilter {
  if ((item.stadt ?? '') > today) return 'future';
  if (item.enddt && item.enddt < today) return 'expired';
  return 'active';
}

function StatusBadge({ status }: { status: StatusFilter }) {
  if (status === 'active') {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 text-xs font-medium rounded-full bg-green-100 text-[#22C55E]">
        <span className="w-1.5 h-1.5 rounded-full bg-[#22C55E]" />
        生效中
      </span>
    );
  }
  if (status === 'future') {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 text-xs font-medium rounded-full bg-blue-100 text-blue-700">
        <span className="w-1.5 h-1.5 rounded-full bg-blue-500" />
        未生效
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 text-xs font-medium rounded-full bg-gray-100 text-gray-500">
      <span className="w-1.5 h-1.5 rounded-full bg-gray-400" />
      已過期
    </span>
  );
}

const TAB_ICONS: Record<AssignmentTblId, typeof Package> = {
  PROD_KIND: Package,
  SPEC_TP: Layers,
  CASE_STATUS: CheckCircle,
};

export function BaseCodesPage() {
  const today = useMemo(() => getTodayYmdInTaipei(), []);
  const [currentTbl, setCurrentTbl] = useState<AssignmentTblId>('PROD_KIND');
  const [codes, setCodes] = useState<Record<AssignmentTblId, AssignmentCodeItem[]>>({
    PROD_KIND: [],
    SPEC_TP: [],
    CASE_STATUS: [],
  });
  const [keyword, setKeyword] = useState('');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Modals
  const [codeModalOpen, setCodeModalOpen] = useState(false);
  const [disableModalOpen, setDisableModalOpen] = useState(false);
  const [form, setForm] = useState<FormState>({
    mode: 'create',
    tblCd: '',
    tblDesc1: '',
    tblDesc2: '',
    stadt: today,
    enddt: '99991231',
  });
  const [disableTarget, setDisableTarget] = useState<{ tblCd: string; tblDesc1: string } | null>(
    null,
  );
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const fetchTab = useCallback(
    async (tbl: AssignmentTblId) => {
      setLoading(true);
      setErrorMsg(null);
      try {
        const res = await listAssignmentCodes(tbl, true);
        setCodes((prev) => ({ ...prev, [tbl]: res.data }));
      } catch (err: any) {
        const msg = err?.response?.data?.message || '讀取失敗';
        setErrorMsg(msg);
      } finally {
        setLoading(false);
      }
    },
    [],
  );

  // 初次載入：載入三個 tab 以正確計算 badge count
  useEffect(() => {
    ASSIGNMENT_TBL_IDS.forEach((t) => fetchTab(t));
  }, [fetchTab]);

  const currentList = codes[currentTbl];
  const filtered = useMemo(() => {
    const kw = keyword.toLowerCase();
    return currentList.filter((c) => {
      const matchKw =
        !kw ||
        c.tblCd.toLowerCase().includes(kw) ||
        (c.tblDesc1 ?? '').toLowerCase().includes(kw) ||
        (c.tblDesc2 ?? '').toLowerCase().includes(kw);
      if (!matchKw) return false;
      if (statusFilter === 'all') return true;
      return statusOf(c, today) === statusFilter;
    });
  }, [currentList, keyword, statusFilter, today]);

  const activeCounts = useMemo(() => {
    const acc: Record<AssignmentTblId, number> = {
      PROD_KIND: 0,
      SPEC_TP: 0,
      CASE_STATUS: 0,
    };
    ASSIGNMENT_TBL_IDS.forEach((t) => {
      acc[t] = codes[t].filter((c) => statusOf(c, today) === 'active').length;
    });
    return acc;
  }, [codes, today]);

  function openCreateModal() {
    setForm({
      mode: 'create',
      tblCd: '',
      tblDesc1: '',
      tblDesc2: '',
      stadt: today,
      enddt: '99991231',
    });
    setFormError(null);
    setCodeModalOpen(true);
  }

  function openEditModal(item: AssignmentCodeItem) {
    setForm({
      mode: 'edit',
      tblCd: item.tblCd,
      tblDesc1: item.tblDesc1 ?? '',
      tblDesc2: item.tblDesc2 ?? '',
      stadt: item.stadt ?? today,
      enddt: item.enddt ?? '99991231',
    });
    setFormError(null);
    setCodeModalOpen(true);
  }

  function openDisableModal(item: AssignmentCodeItem) {
    setDisableTarget({ tblCd: item.tblCd, tblDesc1: item.tblDesc1 ?? '' });
    setDisableModalOpen(true);
  }

  async function handleSubmit() {
    setFormError(null);
    if (!form.tblCd || !form.tblDesc1) {
      setFormError('tbl_cd 與 tbl_desc1 為必填');
      return;
    }
    setSubmitting(true);
    try {
      if (form.mode === 'create') {
        await createAssignmentCode({
          tblId: currentTbl,
          tblCd: form.tblCd,
          tblDesc1: form.tblDesc1,
          tblDesc2: form.tblDesc2 || undefined,
          stadt: form.stadt || undefined,
          enddt: form.enddt || undefined,
        });
      } else {
        await updateAssignmentCode(currentTbl, form.tblCd, {
          tblDesc1: form.tblDesc1,
          tblDesc2: form.tblDesc2 || undefined,
        });
      }
      setCodeModalOpen(false);
      await fetchTab(currentTbl);
    } catch (err: any) {
      const msg = err?.response?.data?.message || '操作失敗';
      setFormError(msg);
    } finally {
      setSubmitting(false);
    }
  }

  async function handleDisable() {
    if (!disableTarget) return;
    setSubmitting(true);
    try {
      await disableAssignmentCode(currentTbl, disableTarget.tblCd);
      setDisableModalOpen(false);
      setDisableTarget(null);
      await fetchTab(currentTbl);
    } catch (err: any) {
      const msg = err?.response?.data?.message || '停用失敗';
      setErrorMsg(msg);
      setDisableModalOpen(false);
    } finally {
      setSubmitting(false);
    }
  }

  function clearFilters() {
    setKeyword('');
    setStatusFilter('all');
  }

  function applyDemo(state: 'normal' | 'effective-only' | 'expired-included') {
    setKeyword('');
    if (state === 'normal') setStatusFilter('all');
    else if (state === 'effective-only') setStatusFilter('active');
    else setStatusFilter('expired');
  }

  return (
    <AppLayout title="代碼維護">
      <main className="flex-1">
        {/* ===== Demo Bar ===== */}
        <div className="bg-white border-b border-[#E5E7EB] px-6 py-2 flex items-center gap-2 flex-wrap">
          <span className="text-xs text-gray-400 mr-1">Demo:</span>
          {[
            { key: 'normal', label: '正常清單' },
            { key: 'effective-only', label: '僅顯示生效中' },
            { key: 'expired-included', label: '含已過期代碼' },
          ].map((d) => {
            const active =
              (d.key === 'normal' && statusFilter === 'all' && !keyword) ||
              (d.key === 'effective-only' && statusFilter === 'active') ||
              (d.key === 'expired-included' && statusFilter === 'expired');
            return (
              <button
                key={d.key}
                type="button"
                onClick={() => applyDemo(d.key as any)}
                className={
                  active
                    ? 'px-3 py-1 text-xs rounded border border-[#2563EB] bg-blue-50 text-[#2563EB]'
                    : 'px-3 py-1 text-xs rounded border border-gray-300 bg-white hover:bg-gray-50'
                }
              >
                {d.label}
              </button>
            );
          })}
        </div>

        <div className="p-6">
          {/* ===== Scope 提示 ===== */}
          <div className="mb-4 flex items-start gap-2 p-3 bg-blue-50/50 border border-blue-100 rounded-lg text-sm text-gray-700">
            <Lock className="w-4 h-4 text-[#2563EB] mt-0.5 shrink-0" />
            <div>
              <p className="font-semibold text-[#2563EB]">本功能限定 E07 三類代碼維護（BR-1）</p>
              <p className="text-xs text-gray-600 mt-0.5">
                <code>PROD_KIND</code>（產品類別）/ <code>SPEC_TP</code>（專案類別）/{' '}
                <code>CASE_STATUS</code>（案件結清期別）。其他 <code>tbl_id</code> 一律回傳 422{' '}
                <code>CODE_TYPE_INVALID</code>。資料表 <code>ob_code_df</code> ·{' '}
                <code>system_id = 'OB'</code>（OQ-E07-11 ✅ 2026-05-05 確認）
              </p>
              <p className="text-xs text-gray-500 mt-1">
                <Info className="w-3 h-3 inline-block align-text-bottom mr-0.5" />
                <span className="font-medium">AD-E07-14 tbl_id 英文常數映射</span>：原系統{' '}
                <code>'01'</code>→<code>PROD_KIND</code>、<code>'02'</code>→<code>SPEC_TP</code>、
                <code>'22'</code>→<code>CASE_STATUS</code>（CDMP 兩階段 migration 後改用英文常數）。
              </p>
              <p className="text-xs text-amber-700 mt-1 flex items-start gap-1">
                <AlertTriangle className="w-3 h-3 mt-0.5 shrink-0" />
                <span>
                  <span className="font-medium">CASEYEAR 不在本功能維護範圍</span>：舊系統 CASEYEAR
                  為前端 hard-coded 0~10 共 11 個 CheckBox，CDMP 沿用此設計，由 F050/F051 表單前端固定提供。
                </span>
              </p>
            </div>
          </div>

          {/* ===== Tabs + Filter ===== */}
          <div className="bg-white rounded-t-lg border border-[#E5E7EB] border-b-0">
            <div className="flex items-center justify-between px-4 border-b border-[#E5E7EB]">
              <div className="flex items-center gap-1">
                {ASSIGNMENT_TBL_IDS.map((tbl) => {
                  const Icon = TAB_ICONS[tbl];
                  const isActive = currentTbl === tbl;
                  return (
                    <button
                      key={tbl}
                      type="button"
                      onClick={() => setCurrentTbl(tbl)}
                      className={
                        'relative px-4 py-3 text-sm font-medium transition ' +
                        (isActive
                          ? 'text-[#2563EB]'
                          : 'text-gray-500 hover:text-gray-800')
                      }
                    >
                      <Icon className="w-3.5 h-3.5 inline mr-1" />
                      {tbl}
                      <span className="ml-1 text-xs text-gray-400">{TBL_ID_LABELS[tbl]}</span>
                      <span
                        className={
                          'ml-1 inline-flex items-center justify-center min-w-[1.25rem] h-5 px-1.5 text-xs font-medium rounded-full ' +
                          (isActive
                            ? 'bg-blue-50 text-[#2563EB]'
                            : 'bg-gray-100 text-gray-500')
                        }
                      >
                        {activeCounts[tbl]}
                      </span>
                      {isActive && (
                        <span className="absolute left-0 right-0 -bottom-px h-0.5 bg-[#2563EB]" />
                      )}
                    </button>
                  );
                })}
              </div>
              <div className="pr-3">
                <code className="text-xs text-gray-400">
                  tbl_id ={' '}
                  <span className="text-gray-600 font-medium">{currentTbl}</span>
                </code>
              </div>
            </div>

            <div className="px-4 py-3 border-b border-[#E5E7EB] bg-gray-50/40 flex items-center gap-3 flex-wrap">
              <div className="relative flex-1 min-w-[240px] max-w-[400px]">
                <Search className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                <input
                  type="text"
                  value={keyword}
                  onChange={(e) => setKeyword(e.target.value)}
                  placeholder="搜尋 tbl_cd / tbl_desc1 / tbl_desc2..."
                  className="w-full pl-9 pr-3 py-1.5 text-sm border border-[#E5E7EB] rounded-md bg-white focus:outline-none focus:ring-2 focus:ring-[#2563EB]/20 focus:border-[#2563EB]"
                />
              </div>
              <div className="relative">
                <select
                  value={statusFilter}
                  onChange={(e) => setStatusFilter(e.target.value as StatusFilter)}
                  className="pl-3 pr-8 py-1.5 text-sm border border-[#E5E7EB] rounded-md bg-white focus:outline-none focus:ring-2 focus:ring-[#2563EB]/20 focus:border-[#2563EB] appearance-none"
                >
                  <option value="all">狀態：全部</option>
                  <option value="active">僅顯示生效中（stadt ≤ 今日 ≤ enddt）</option>
                  <option value="future">未生效（stadt &gt; 今日）</option>
                  <option value="expired">已過期（enddt &lt; 今日）</option>
                </select>
                <ChevronDown className="w-4 h-4 text-gray-400 absolute right-2 top-1/2 -translate-y-1/2 pointer-events-none" />
              </div>
              <button
                type="button"
                onClick={clearFilters}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm text-gray-600 border border-[#E5E7EB] rounded-md hover:bg-white transition"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                清除
              </button>
              <span className="ml-auto text-xs text-gray-400">
                今日 <span className="font-mono">{today}</span>
              </span>
              <button
                type="button"
                onClick={openCreateModal}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-[#2563EB] text-white text-xs font-medium rounded-md hover:bg-blue-700 transition shadow-sm"
              >
                <Plus className="w-3.5 h-3.5" />
                新增代碼
              </button>
            </div>
          </div>

          {/* CASE_STATUS 業務語意對照 banner */}
          {currentTbl === 'CASE_STATUS' && <CaseStatusSemanticBanner />}

          {/* 表格 panel */}
          <div className="bg-white rounded-b-lg border border-[#E5E7EB] border-t-0 shadow-sm">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-[#E5E7EB] bg-gray-50/60">
                    <th className="text-left px-5 py-3 font-semibold text-gray-600">system_id</th>
                    <th className="text-left px-5 py-3 font-semibold text-gray-600">tbl_id</th>
                    <th className="text-left px-5 py-3 font-semibold text-gray-600">tbl_cd</th>
                    <th className="text-left px-5 py-3 font-semibold text-gray-600">tbl_desc1</th>
                    <th className="text-left px-5 py-3 font-semibold text-gray-600">tbl_desc2</th>
                    <th className="text-left px-5 py-3 font-semibold text-gray-600">stadt</th>
                    <th className="text-left px-5 py-3 font-semibold text-gray-600">enddt</th>
                    <th className="text-left px-5 py-3 font-semibold text-gray-600">狀態</th>
                    <th className="text-right px-5 py-3 font-semibold text-gray-600">操作</th>
                  </tr>
                </thead>
                <tbody>
                  {loading && (
                    <tr>
                      <td colSpan={9} className="text-center py-12 text-gray-400 text-sm">
                        載入中...
                      </td>
                    </tr>
                  )}
                  {!loading && filtered.length === 0 && (
                    <tr>
                      <td colSpan={9} className="text-center py-12 text-gray-400 text-sm">
                        無符合條件的代碼
                      </td>
                    </tr>
                  )}
                  {!loading &&
                    filtered.map((c) => {
                      const status = statusOf(c, today);
                      const isActive = status === 'active';
                      return (
                        <tr
                          key={c.tblCd}
                          className={
                            'border-b border-[#E5E7EB] hover:bg-gray-50/50 transition ' +
                            (!isActive ? 'opacity-70' : '')
                          }
                        >
                          <td className="px-5 py-3 font-mono text-xs text-gray-500">OB</td>
                          <td className="px-5 py-3 font-mono text-xs text-gray-700">
                            {currentTbl}
                          </td>
                          <td className="px-5 py-3 font-mono text-sm font-semibold text-gray-900">
                            {c.tblCd}
                          </td>
                          <td className="px-5 py-3 text-gray-900">{c.tblDesc1 ?? ''}</td>
                          <td className="px-5 py-3 text-xs text-gray-500">
                            {c.tblDesc2 ?? <span className="text-gray-300">—</span>}
                          </td>
                          <td className="px-5 py-3 font-mono text-xs text-gray-600">{c.stadt}</td>
                          <td
                            className={
                              'px-5 py-3 font-mono text-xs ' +
                              (c.enddt === '99991231' ? 'text-emerald-600' : 'text-gray-600')
                            }
                          >
                            {c.enddt}
                          </td>
                          <td className="px-5 py-3">
                            <StatusBadge status={status} />
                          </td>
                          <td className="px-5 py-3 text-right">
                            <div className="inline-flex items-center gap-1">
                              <button
                                type="button"
                                onClick={() => openEditModal(c)}
                                title="修改"
                                className="p-1.5 text-gray-500 hover:text-[#2563EB] hover:bg-blue-50 rounded transition"
                              >
                                <Pencil className="w-4 h-4" />
                              </button>
                              <button
                                type="button"
                                onClick={() => openDisableModal(c)}
                                disabled={!isActive}
                                title="停用"
                                className={
                                  'p-1.5 text-gray-500 hover:text-[#F59E0B] hover:bg-amber-50 rounded transition ' +
                                  (!isActive ? 'opacity-30 pointer-events-none' : '')
                                }
                              >
                                <Ban className="w-4 h-4" />
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                </tbody>
              </table>
            </div>
            <div className="flex items-center justify-between px-5 py-3 border-t border-[#E5E7EB]">
              <span className="text-sm text-gray-500">
                顯示 1-{filtered.length} / 共 {filtered.length} 筆
              </span>
              <div className="flex items-center gap-1">
                <button
                  disabled
                  className="px-3 py-1.5 text-sm border border-[#E5E7EB] rounded-md text-gray-300 bg-white cursor-not-allowed"
                >
                  <ChevronLeft className="w-4 h-4" />
                </button>
                <button className="px-3 py-1.5 text-sm border border-[#2563EB] rounded-md text-white bg-[#2563EB] font-medium">
                  1
                </button>
                <button
                  disabled
                  className="px-3 py-1.5 text-sm border border-[#E5E7EB] rounded-md text-gray-300 bg-white cursor-not-allowed"
                >
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>
            </div>
          </div>

          {/* footer note */}
          <div className="mt-4 flex items-start gap-2 p-3 bg-blue-50/50 border border-blue-100 rounded-lg text-xs text-gray-600">
            <Info className="w-4 h-4 text-[#2563EB] mt-0.5 shrink-0" />
            <div>
              <p className="font-medium text-gray-700 mb-0.5">代碼維護操作說明</p>
              <p>
                停用為軟刪除（更新 <code>enddt</code>，BR-2 不刪除紀錄）。停用代碼不再出現於
                F050/F051 名單定義表單下拉，但既有名單定義中已選用的代碼值不被回溯修改（BR-4）。
                代碼值唯一性檢查範圍為同 tbl_id 下啟用期間紀錄（BR-3，違反時 422{' '}
                <code>CODE_IN_USE</code>）。Admin 與業務主管均可存取（BR-5）。
              </p>
            </div>
          </div>

          {errorMsg && (
            <div className="mt-4 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700 flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 shrink-0" />
              <span>{errorMsg}</span>
            </div>
          )}
        </div>
      </main>

      {/* ===== Modal: 新增 / 編輯 ===== */}
      {codeModalOpen && (
        <div className="fixed inset-0 z-50">
          <div
            className="absolute inset-0 bg-black/50"
            onClick={() => !submitting && setCodeModalOpen(false)}
          />
          <div className="absolute inset-0 flex items-center justify-center p-4">
            <div className="bg-white rounded-xl shadow-2xl w-full max-w-lg relative">
              <div className="flex items-center justify-between px-6 py-4 border-b border-[#E5E7EB]">
                <div>
                  <h3 className="text-lg font-semibold text-gray-900">
                    {form.mode === 'create' ? '新增代碼' : '修改代碼'}
                  </h3>
                  <p className="text-xs text-gray-500 mt-0.5">tbl_id = {currentTbl}</p>
                </div>
                <button
                  type="button"
                  onClick={() => !submitting && setCodeModalOpen(false)}
                  className="p-1 hover:bg-gray-100 rounded-md"
                >
                  <X className="w-5 h-5 text-gray-400" />
                </button>
              </div>
              <div className="px-6 py-5 space-y-4">
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-medium text-gray-700 mb-1">system_id</label>
                    <input
                      type="text"
                      value="OB"
                      disabled
                      className="w-full px-3 py-2 text-sm border border-[#E5E7EB] rounded-lg bg-gray-50 text-gray-500 font-mono"
                    />
                    <p className="text-xs text-gray-400 mt-1">固定 'OB'（OQ-E07-11）</p>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-700 mb-1">tbl_id</label>
                    <input
                      type="text"
                      value={currentTbl}
                      disabled
                      className="w-full px-3 py-2 text-sm border border-[#E5E7EB] rounded-lg bg-gray-50 text-gray-500 font-mono"
                    />
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1.5">
                    tbl_cd <span className="text-[#EF4444]">*</span>
                  </label>
                  <input
                    type="text"
                    value={form.tblCd}
                    onChange={(e) => setForm({ ...form, tblCd: e.target.value })}
                    maxLength={4}
                    disabled={form.mode === 'edit'}
                    placeholder="例：05"
                    className="w-full px-3 py-2 text-sm border border-[#E5E7EB] rounded-lg font-mono focus:outline-none focus:ring-2 focus:ring-[#2563EB]/20 focus:border-[#2563EB] disabled:bg-gray-50 disabled:text-gray-500"
                  />
                  <p className="text-xs text-gray-400 mt-1">
                    VARCHAR(4)，同 tbl_id 下啟用期間唯一{form.mode === 'edit' ? '（PK 不可改）' : ''}
                  </p>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1.5">
                    tbl_desc1 <span className="text-[#EF4444]">*</span>
                  </label>
                  <input
                    type="text"
                    value={form.tblDesc1}
                    onChange={(e) => setForm({ ...form, tblDesc1: e.target.value })}
                    maxLength={40}
                    placeholder="例：商用車貸款"
                    className="w-full px-3 py-2 text-sm border border-[#E5E7EB] rounded-lg focus:outline-none focus:ring-2 focus:ring-[#2563EB]/20 focus:border-[#2563EB]"
                  />
                  <p className="text-xs text-gray-400 mt-1">最多 40 字元（顯示名稱）</p>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1.5">
                    tbl_desc2（optional）
                  </label>
                  <input
                    type="text"
                    value={form.tblDesc2}
                    onChange={(e) => setForm({ ...form, tblDesc2: e.target.value })}
                    maxLength={40}
                    placeholder="例：商業用途汽車貸款"
                    className="w-full px-3 py-2 text-sm border border-[#E5E7EB] rounded-lg focus:outline-none focus:ring-2 focus:ring-[#2563EB]/20 focus:border-[#2563EB]"
                  />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1.5">stadt 生效日</label>
                    <input
                      type="text"
                      value={form.stadt}
                      onChange={(e) => setForm({ ...form, stadt: e.target.value })}
                      maxLength={8}
                      placeholder="YYYYMMDD"
                      disabled={form.mode === 'edit'}
                      className="w-full px-3 py-2 text-sm border border-[#E5E7EB] rounded-lg font-mono focus:outline-none focus:ring-2 focus:ring-[#2563EB]/20 focus:border-[#2563EB] disabled:bg-gray-50 disabled:text-gray-500"
                    />
                    <p className="text-xs text-gray-400 mt-1">YYYYMMDD（預設今日）</p>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1.5">enddt 失效日</label>
                    <input
                      type="text"
                      value={form.enddt}
                      onChange={(e) => setForm({ ...form, enddt: e.target.value })}
                      maxLength={8}
                      placeholder="99991231"
                      disabled={form.mode === 'edit'}
                      className="w-full px-3 py-2 text-sm border border-[#E5E7EB] rounded-lg font-mono focus:outline-none focus:ring-2 focus:ring-[#2563EB]/20 focus:border-[#2563EB] disabled:bg-gray-50 disabled:text-gray-500"
                    />
                    <p className="text-xs text-gray-400 mt-1">99991231 表示無時限</p>
                  </div>
                </div>

                <div className="bg-blue-50 border border-blue-100 rounded-lg p-3 text-xs text-gray-700 flex items-start gap-2">
                  <Info className="w-4 h-4 text-[#2563EB] mt-0.5 shrink-0" />
                  <div>
                    <p>
                      新增 / 修改寫入 <code>assignment_audit_log</code>（action=CREATE / UPDATE，
                      entity_type=ob_code_df，entity_id = tbl_id:tbl_cd）。違反唯一性 → 422{' '}
                      <code>CODE_IN_USE</code>。
                    </p>
                  </div>
                </div>

                {formError && (
                  <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-xs text-red-700 flex items-start gap-2">
                    <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                    <span>{formError}</span>
                  </div>
                )}
              </div>
              <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-[#E5E7EB]">
                <button
                  type="button"
                  onClick={() => setCodeModalOpen(false)}
                  disabled={submitting}
                  className="px-4 py-2 text-sm font-medium text-gray-700 border border-[#E5E7EB] rounded-lg hover:bg-gray-50 disabled:opacity-50"
                >
                  取消
                </button>
                <button
                  type="button"
                  onClick={handleSubmit}
                  disabled={submitting}
                  className="px-4 py-2 text-sm font-medium text-white bg-[#2563EB] rounded-lg hover:bg-blue-700 shadow-sm disabled:opacity-50"
                >
                  {submitting ? '處理中...' : '儲存'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ===== Modal: 停用確認 ===== */}
      {disableModalOpen && disableTarget && (
        <div className="fixed inset-0 z-50">
          <div
            className="absolute inset-0 bg-black/50"
            onClick={() => !submitting && setDisableModalOpen(false)}
          />
          <div className="absolute inset-0 flex items-center justify-center p-4">
            <div className="bg-white rounded-xl shadow-2xl w-full max-w-md relative">
              <div className="px-6 pt-6 pb-2 text-center">
                <div className="w-12 h-12 rounded-full bg-amber-50 flex items-center justify-center mx-auto mb-4">
                  <AlertTriangle className="w-6 h-6 text-[#F59E0B]" />
                </div>
                <h3 className="text-lg font-semibold text-gray-900 mb-2">停用代碼</h3>
                <p className="text-sm text-gray-600 leading-relaxed">
                  確定停用代碼{' '}
                  <code className="font-mono font-semibold text-gray-800">
                    {disableTarget.tblCd}
                  </code>
                  <br />
                  「<span className="font-semibold text-gray-800">{disableTarget.tblDesc1}</span>」？
                </p>
              </div>
              <div className="px-6 pb-2">
                <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-xs text-gray-700">
                  <div className="flex items-start gap-2">
                    <Info className="w-4 h-4 text-[#F59E0B] mt-0.5 shrink-0" />
                    <div>
                      <p className="font-semibold text-[#F59E0B] mb-1">軟刪除（更新 enddt）</p>
                      <ul className="list-disc list-inside space-y-0.5 text-gray-600">
                        <li>停用後 F050/F051 表單將不再顯示此選項</li>
                        <li>既有名單定義中已選用的此代碼值不被回溯修改</li>
                        <li>寫入 assignment_audit_log（action=DISABLE）</li>
                      </ul>
                    </div>
                  </div>
                </div>
              </div>
              <div className="flex items-center justify-end gap-3 px-6 py-4">
                <button
                  type="button"
                  onClick={() => setDisableModalOpen(false)}
                  disabled={submitting}
                  className="px-4 py-2 text-sm font-medium text-gray-700 border border-[#E5E7EB] rounded-lg hover:bg-gray-50 disabled:opacity-50"
                >
                  取消
                </button>
                <button
                  type="button"
                  onClick={handleDisable}
                  disabled={submitting}
                  className="px-4 py-2 text-sm font-medium text-white bg-[#F59E0B] rounded-lg hover:bg-amber-600 shadow-sm disabled:opacity-50"
                >
                  {submitting ? '停用中...' : '確認停用'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </AppLayout>
  );
}

function CaseStatusSemanticBanner() {
  return (
    <div className="bg-blue-50/40 border-l border-r border-[#E5E7EB]">
      <details className="group" open>
        <summary className="cursor-pointer list-none flex items-start gap-2 px-4 py-2.5 hover:bg-blue-50/70 transition border-b border-blue-100/60">
          <Info className="w-4 h-4 text-[#2563EB] mt-0.5 shrink-0" />
          <div className="flex-1 text-xs">
            <div className="flex items-center justify-between">
              <span className="font-medium text-gray-700">
                4 個代碼業務語意對照
                <span className="text-gray-500 font-normal">
                  {' '}— 同為「滿期」字面，但{' '}
                  <code className="text-[#2563EB] font-semibold">03</code> 與{' '}
                  <code className="text-[#2563EB] font-semibold">04</code> 案件實況截然不同
                </span>
              </span>
              <ChevronDown className="w-4 h-4 text-gray-400 group-open:rotate-180 transition-transform shrink-0" />
            </div>
          </div>
        </summary>
        <div className="overflow-x-auto bg-white border-b border-[#E5E7EB]">
          <table className="w-full text-xs">
            <thead>
              <tr className="bg-blue-50/30 border-b border-blue-100">
                <th className="text-left px-4 py-2 font-semibold text-gray-600 w-16">代碼</th>
                <th className="text-left px-3 py-2 font-semibold text-gray-600 w-40">
                  名稱（tbl_desc1）
                </th>
                <th className="text-left px-3 py-2 font-semibold text-gray-600 w-32">
                  對應 STA_CODE
                </th>
                <th className="text-left px-3 py-2 font-semibold text-gray-600">案件實況</th>
                <th className="text-left px-3 py-2 font-semibold text-gray-600 w-40">業務目標</th>
              </tr>
            </thead>
            <tbody>
              <tr className="border-b border-blue-50">
                <td className="px-4 py-2 font-mono font-semibold text-[#2563EB]">01</td>
                <td className="px-3 py-2 text-gray-700">期中(不含當月滿期)</td>
                <td className="px-3 py-2 font-mono text-gray-600">05~89（active）</td>
                <td className="px-3 py-2 text-gray-600">
                  處理中，距滿期 &gt; 1 個月 或 剩餘期數 &gt; 2
                </td>
                <td className="px-3 py-2 text-gray-700">一般期中案件管理</td>
              </tr>
              <tr className="border-b border-blue-50">
                <td className="px-4 py-2 font-mono font-semibold text-[#2563EB]">02</td>
                <td className="px-3 py-2 text-gray-700">中結</td>
                <td className="px-3 py-2 font-mono text-gray-600">98</td>
                <td className="px-3 py-2 text-gray-600">已中途結清</td>
                <td className="px-3 py-2 text-gray-700">中結客戶聯繫</td>
              </tr>
              <tr className="border-b border-blue-50 bg-amber-50/30">
                <td className="px-4 py-2 font-mono font-semibold text-amber-700">03</td>
                <td className="px-3 py-2 text-gray-700">滿期(含當月滿期)</td>
                <td className="px-3 py-2 font-mono text-gray-700">
                  <span className="inline-flex items-center px-1.5 py-0.5 mr-1 text-[10px] font-semibold rounded bg-green-100 text-green-700">
                    active
                  </span>
                  05~89
                </td>
                <td className="px-3 py-2 text-gray-700">
                  本月即將到期但<span className="font-semibold">尚未結清</span>
                </td>
                <td className="px-3 py-2 text-amber-800 font-medium">主動續貸 / 防流失</td>
              </tr>
              <tr className="bg-gray-50/40">
                <td className="px-4 py-2 font-mono font-semibold text-gray-700">04</td>
                <td className="px-3 py-2 text-gray-700">滿期</td>
                <td className="px-3 py-2 font-mono text-gray-700">
                  <span className="inline-flex items-center px-1.5 py-0.5 mr-1 text-[10px] font-semibold rounded bg-gray-200 text-gray-600">
                    已完成
                  </span>
                  90
                </td>
                <td className="px-3 py-2 text-gray-700">
                  <span className="font-semibold">已完整結清完成</span>
                </td>
                <td className="px-3 py-2 text-gray-700 font-medium">回找維繫 / 再行銷</td>
              </tr>
            </tbody>
          </table>
          <div className="px-4 py-2 text-[11px] text-gray-500 bg-gray-50/30 border-t border-blue-50">
            <span className="font-medium text-gray-600">語意來源：</span>舊系統 SP{' '}
            <code>USP_OB_OBPOOLDATA.sql:189-216</code> 依 <code>obccfdate.STA_CODE</code>{' '}
            判斷案件狀態並寫入 dump 表的 <code>list_type</code> 欄。新系統 Stage 1 沿用相同 4 個值匹配{' '}
            <code>ob_pool_data.list_type</code>，業務語意由匯入端維持。
          </div>
        </div>
      </details>
    </div>
  );
}
