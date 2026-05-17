import { useState, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import {
  Hash,
  FileText,
  Save,
  ArrowLeft,
  Plus,
  X,
  Copy,
  CheckCircle2,
} from 'lucide-react';
import { AppLayout } from '@/components/layout/app-layout';
import { Button } from '@/components/ui/button';
import { useToast } from '@/components/ui/toast';
import {
  createList,
  listLists,
  type AssignmentListItem,
} from '@/api/assignment-list';
import {
  CopyFromPrevMonthModal,
  computePrevYm,
} from './_components/copy-from-prev-month-modal';

/**
 * F050 v2.0 — 建立草稿名單頁
 *
 * 對應 prototype: /prototypes/27a-list-create-draft.html
 *
 * 範圍（MVP）：
 *   - 基本資訊（list_nm）
 *   - CR 回分開關（per-LIST）
 *   - 動態篩選條件（簡化版：column + values comma-separated）
 *   - 商品 / 卡別 / 期別 / 結清來源 等基礎欄位
 *
 * 進階功能（待 P2 補）：
 *   - 從上月複製（copyFromListNo source picker）
 *   - 完整 condition_payload builder（操作子 / fieldType / 多 value selector）
 *   - PROD_KIND / CASE_STATUS 之 code lookup（從 pooldata-fields/options 動態載入）
 *
 * RBAC: DirectorRoute 已包；section_chief 無建立權。
 */

interface ConditionRow {
  id: string;
  columnName: string;
  values: string; // comma-separated，提交時 split → string[]
}

function genId(): string {
  return Math.random().toString(36).slice(2, 10);
}

export function ListCreateDraftPage() {
  const navigate = useNavigate();
  const { showToast } = useToast();
  const [searchParams] = useSearchParams();
  const fromYm = searchParams.get('ym') ?? '';

  // Form fields
  const [listNm, setListNm] = useState('');
  const [prodKind, setProdKind] = useState('');
  const [caseYear, setCaseYear] = useState('');
  const [specTp, setSpecTp] = useState('');
  const [caseStatus, setCaseStatus] = useState('');
  const [listPeriodStart, setListPeriodStart] = useState<string>('0');
  const [listPeriodEnd, setListPeriodEnd] = useState<string>('999');
  const [listInterval, setListInterval] = useState<string>('30');
  const [settleSrc, setSettleSrc] = useState('');
  const [cardType, setCardType] = useState('');
  // prodBest 在 spec 為選填且 MVP 表單暫不暴露 UI（待 P2 補完）
  const [prodBest] = useState('');
  const [crEnabled, setCrEnabled] = useState(true);
  const [conditions, setConditions] = useState<ConditionRow[]>([]);

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Phase 3 P2-6：從上月複製 modal state
  const currentYm = fromYm
    ? fromYm.replace('-', '')
    : (() => {
        const now = new Date();
        return `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}`;
      })();
  const prevYm = computePrevYm(currentYm);

  const [copyModalOpen, setCopyModalOpen] = useState(false);
  const [prevLists, setPrevLists] = useState<AssignmentListItem[]>([]);
  const [prevLoading, setPrevLoading] = useState(false);
  const [copyFromListNo, setCopyFromListNo] = useState<string | null>(null);

  useEffect(() => {
    if (fromYm) {
      // 預填名稱前綴
      setListNm(`${fromYm} `);
    }
  }, [fromYm]);

  const handleOpenCopyModal = async () => {
    setCopyModalOpen(true);
    if (prevLists.length > 0 || !prevYm) return;
    setPrevLoading(true);
    try {
      const data = await listLists({ ym: prevYm });
      setPrevLists(
        (data.lists ?? []).filter((l) => l.status === 'active'),
      );
    } catch {
      setPrevLists([]);
    } finally {
      setPrevLoading(false);
    }
  };

  // P2-6 BR：複製後僅帶入欄位（CR 開關 / 篩選條件 / 商品 / 期別）；名稱重新建立
  const handleCopyApply = (src: AssignmentListItem) => {
    setProdKind(src.prodKind ?? '');
    setCaseYear((src.caseYear ?? '').split('$$').filter(Boolean).join(','));
    setSpecTp((src.specTp ?? '').split('$$').filter(Boolean).join(','));
    setCaseStatus((src.caseStatus ?? '').split('$$').filter(Boolean).join(','));
    setListPeriodStart(String(src.listPeriodStart ?? 0));
    setListPeriodEnd(String(src.listPeriodEnd ?? 999));
    setListInterval(String(src.listInterval ?? 30));
    setSettleSrc(src.settleSrc ?? '');
    setCardType(src.cardType ?? '');
    setCrEnabled(src.crEnabled ?? true);
    setCopyFromListNo(src.listNo);
    setCopyModalOpen(false);
    showToast(`已從 ${src.listNo} 帶入欄位`, 'success');
  };

  const addCondition = () => {
    setConditions((prev) => [...prev, { id: genId(), columnName: '', values: '' }]);
  };

  const removeCondition = (id: string) => {
    setConditions((prev) => prev.filter((c) => c.id !== id));
  };

  const updateCondition = (id: string, patch: Partial<ConditionRow>) => {
    setConditions((prev) =>
      prev.map((c) => (c.id === id ? { ...c, ...patch } : c)),
    );
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!listNm.trim()) {
      setError('名單名稱為必填');
      return;
    }
    if (!prodKind || !caseYear || !specTp || !caseStatus || !settleSrc) {
      setError('請填寫所有必填欄位（商品 / 年期 / 商品次類 / 結清期別 / 結清來源）');
      return;
    }

    const dto: Record<string, unknown> = {
      listNm: listNm.trim(),
      prodKind,
      caseYear: caseYear.split(',').map((s) => s.trim()).filter(Boolean).join('$$'),
      specTp: specTp.split(',').map((s) => s.trim()).filter(Boolean).join('$$'),
      caseStatus: caseStatus.split(',').map((s) => s.trim()).filter(Boolean).join('$$'),
      listPeriodStart: parseInt(listPeriodStart, 10) || 0,
      listPeriodEnd: parseInt(listPeriodEnd, 10) || 999,
      listInterval: parseInt(listInterval, 10) || 30,
      settleSrc,
      crEnabled,
    };
    if (cardType) dto.cardType = cardType;
    if (prodBest) dto.prodBest = prodBest;
    if (copyFromListNo) dto.copyFromListNo = copyFromListNo;

    const validConds = conditions
      .map((c) => ({
        columnName: c.columnName.trim(),
        values: c.values.split(',').map((s) => s.trim()).filter(Boolean),
      }))
      .filter((c) => c.columnName && c.values.length > 0);

    if (validConds.length > 0) {
      dto.conditionPayload = { conditions: validConds, logic: 'AND' };
    }

    setSubmitting(true);
    try {
      const result = (await createList(dto)) as { listNo: string };
      showToast(`名單 ${result.listNo} 已建立`, 'success');
      navigate('/assignment/list-definitions');
    } catch (err: unknown) {
      const e = err as {
        response?: { status?: number; data?: { error?: string; message?: string } };
      };
      const msg = e?.response?.data?.message ?? '建立失敗，請稍後再試';
      setError(msg);
      showToast(msg, 'error');
    } finally {
      setSubmitting(false);
    }
  };

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
          <h1 className="text-base font-semibold text-gray-800">建立草稿名單</h1>
        </div>
      }
      actions={
        <button
          type="button"
          data-testid="btn-open-copy-modal"
          onClick={handleOpenCopyModal}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm text-primary border border-blue-200 rounded-md hover:bg-blue-50"
        >
          <Copy className="w-4 h-4" />
          從上月複製
        </button>
      }
    >
      <main className="flex-1 p-6">
        <div className="max-w-3xl mx-auto space-y-4">
          {/* Phase 3 P2-6：複製成功 banner */}
          {copyFromListNo && (
            <div
              data-testid="copy-applied-banner"
              className="rounded-lg p-3 bg-green-50 border border-green-200 flex items-start gap-2 text-sm"
            >
              <CheckCircle2 className="w-4 h-4 text-green-700 mt-0.5 shrink-0" />
              <div className="flex-1">
                <p className="font-semibold text-green-900">
                  已從{' '}
                  <code className="font-mono">{copyFromListNo}</code>{' '}
                  帶入欄位
                </p>
                <p className="text-xs text-green-800 mt-0.5">
                  名稱與 LIST_NO 將重新建立；CR 開關、商品、期別、篩選條件均已套用，您仍可手動調整。
                </p>
              </div>
              <button
                type="button"
                onClick={() => setCopyFromListNo(null)}
                aria-label="關閉"
                className="text-green-700 hover:bg-green-100 p-1 rounded"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          )}

          {error && (
            <div
              data-testid="form-error"
              className="rounded-lg p-3 bg-red-50 border border-red-200 text-sm text-red-800"
            >
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            {/* 1: 基本資訊 */}
            <section className="bg-white rounded-xl border border-gray-200 p-5 space-y-4">
              <div className="flex items-center gap-2">
                <span className="w-6 h-6 rounded-full bg-primary text-white text-xs font-semibold inline-flex items-center justify-center">
                  1
                </span>
                <h2 className="text-base font-semibold text-gray-800">基本資訊</h2>
              </div>

              <div>
                <label className="block text-xs text-gray-500 mb-1">
                  LIST_NO（系統自動產生）
                </label>
                <div className="inline-flex items-center gap-2 px-3 py-2 bg-gray-50 border border-gray-200 rounded-md font-mono text-sm text-gray-500">
                  <Hash className="w-4 h-4 text-gray-400" />
                  儲存時依當月序號產生
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">
                  名單名稱 <span className="text-danger">*</span>
                  <span className="text-[10px] text-gray-400 font-normal ml-1">1~45 字</span>
                </label>
                <input
                  data-testid="input-listNm"
                  type="text"
                  required
                  maxLength={45}
                  value={listNm}
                  onChange={(e) => setListNm(e.target.value)}
                  placeholder="例：2026-05 業務一部 主力催收"
                  className="w-full px-3 py-2 border border-gray-200 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                />
              </div>
            </section>

            {/* 2: CR */}
            <section className="bg-white rounded-xl border border-gray-200 p-5 space-y-3">
              <div className="flex items-center gap-2">
                <span className="w-6 h-6 rounded-full bg-primary text-white text-xs font-semibold inline-flex items-center justify-center">
                  2
                </span>
                <h2 className="text-base font-semibold text-gray-800">CR 回分規則</h2>
                <span className="text-[10px] text-gray-400 ml-1">per-LIST 設定</span>
              </div>
              <label className="flex items-center gap-3 cursor-pointer">
                <input
                  type="checkbox"
                  data-testid="input-crEnabled"
                  checked={crEnabled}
                  onChange={(e) => setCrEnabled(e.target.checked)}
                  className="h-4 w-4 rounded border-gray-300 text-primary focus:ring-2 focus:ring-primary/20"
                />
                <span className="text-sm text-gray-700">本名單啟用 CR 回分</span>
                <span className={`text-xs ${crEnabled ? 'text-success' : 'text-gray-400'}`}>
                  {crEnabled
                    ? '啟用中：曾被分派但未成交的客戶將重新納入'
                    : '已停用：僅納入新增及尚未被分派的客戶'}
                </span>
              </label>
            </section>

            {/* 3: 商品/期別/結清 (必填) */}
            <section className="bg-white rounded-xl border border-gray-200 p-5 space-y-4">
              <div className="flex items-center gap-2">
                <span className="w-6 h-6 rounded-full bg-primary text-white text-xs font-semibold inline-flex items-center justify-center">
                  3
                </span>
                <h2 className="text-base font-semibold text-gray-800">商品與期別</h2>
                <span className="text-[10px] text-gray-400 ml-1">多值欄位以逗號分隔</span>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1.5">
                    商品類別 <span className="text-danger">*</span>
                  </label>
                  <input
                    data-testid="input-prodKind"
                    type="text"
                    required
                    value={prodKind}
                    onChange={(e) => setProdKind(e.target.value)}
                    placeholder="例：A1（汽車貸款）"
                    className="w-full px-3 py-2 border border-gray-200 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1.5">
                    商品次類 <span className="text-danger">*</span>
                  </label>
                  <input
                    data-testid="input-specTp"
                    type="text"
                    required
                    value={specTp}
                    onChange={(e) => setSpecTp(e.target.value)}
                    placeholder="例：01,02"
                    className="w-full px-3 py-2 border border-gray-200 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1.5">
                    年期 <span className="text-danger">*</span>
                  </label>
                  <input
                    data-testid="input-caseYear"
                    type="text"
                    required
                    value={caseYear}
                    onChange={(e) => setCaseYear(e.target.value)}
                    placeholder="例：1,2"
                    className="w-full px-3 py-2 border border-gray-200 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1.5">
                    結清期別 <span className="text-danger">*</span>
                  </label>
                  <input
                    data-testid="input-caseStatus"
                    type="text"
                    required
                    value={caseStatus}
                    onChange={(e) => setCaseStatus(e.target.value)}
                    placeholder="例：01,02"
                    className="w-full px-3 py-2 border border-gray-200 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1.5">
                    結清來源 <span className="text-danger">*</span>
                  </label>
                  <input
                    data-testid="input-settleSrc"
                    type="text"
                    required
                    value={settleSrc}
                    onChange={(e) => setSettleSrc(e.target.value)}
                    placeholder="例：S1"
                    className="w-full px-3 py-2 border border-gray-200 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1.5">
                    卡別（選填）
                  </label>
                  <input
                    data-testid="input-cardType"
                    type="text"
                    maxLength={5}
                    value={cardType}
                    onChange={(e) => setCardType(e.target.value)}
                    placeholder="例：M3"
                    className="w-full px-3 py-2 border border-gray-200 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                  />
                </div>
              </div>

              <div className="grid grid-cols-3 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1.5">
                    期別起 <span className="text-danger">*</span>
                  </label>
                  <input
                    data-testid="input-listPeriodStart"
                    type="number"
                    min={0}
                    max={999}
                    required
                    value={listPeriodStart}
                    onChange={(e) => setListPeriodStart(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-200 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1.5">
                    期別迄 <span className="text-danger">*</span>
                  </label>
                  <input
                    data-testid="input-listPeriodEnd"
                    type="number"
                    min={0}
                    max={999}
                    required
                    value={listPeriodEnd}
                    onChange={(e) => setListPeriodEnd(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-200 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1.5">
                    間隔 <span className="text-danger">*</span>
                  </label>
                  <input
                    data-testid="input-listInterval"
                    type="number"
                    min={0}
                    max={999}
                    required
                    value={listInterval}
                    onChange={(e) => setListInterval(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-200 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                  />
                </div>
              </div>
            </section>

            {/* 4: 動態篩選條件 (MVP 簡化) */}
            <section className="bg-white rounded-xl border border-gray-200 p-5 space-y-3">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <span className="w-6 h-6 rounded-full bg-primary text-white text-xs font-semibold inline-flex items-center justify-center">
                    4
                  </span>
                  <h2 className="text-base font-semibold text-gray-800">篩選條件（選填）</h2>
                  <span className="text-[10px] text-gray-400 ml-1">
                    每筆條件 column + 多 value，以「且」（AND）連接
                  </span>
                </div>
                <button
                  type="button"
                  onClick={addCondition}
                  data-testid="btn-add-condition"
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm border border-primary text-primary rounded-md hover:bg-blue-50"
                >
                  <Plus className="w-4 h-4" />
                  新增條件
                </button>
              </div>

              {conditions.length === 0 ? (
                <div className="rounded-lg border border-dashed border-gray-200 p-6 flex flex-col items-center text-center">
                  <FileText className="w-6 h-6 text-gray-400 mb-2" />
                  <p className="text-xs text-gray-500">尚未新增任何篩選條件</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {conditions.map((c, idx) => (
                    <div
                      key={c.id}
                      data-testid={`condition-row-${idx}`}
                      className="flex items-start gap-2 p-3 bg-gray-50/50 border border-gray-200 rounded-md"
                    >
                      <input
                        type="text"
                        placeholder="欄位名（如 BANK_BR_NO）"
                        value={c.columnName}
                        onChange={(e) =>
                          updateCondition(c.id, { columnName: e.target.value })
                        }
                        className="w-48 px-3 py-1.5 border border-gray-200 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                      />
                      <input
                        type="text"
                        placeholder="值（逗號分隔，如 001,002,003）"
                        value={c.values}
                        onChange={(e) =>
                          updateCondition(c.id, { values: e.target.value })
                        }
                        className="flex-1 px-3 py-1.5 border border-gray-200 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                      />
                      <button
                        type="button"
                        onClick={() => removeCondition(c.id)}
                        className="p-1.5 text-gray-400 hover:text-danger hover:bg-red-50 rounded-md"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </section>

            {/* Footer actions */}
            <div className="flex items-center justify-end gap-3 pt-2">
              <Button
                type="button"
                variant="secondary"
                onClick={() => navigate('/assignment/list-definitions')}
              >
                取消
              </Button>
              <Button
                type="submit"
                variant="primary"
                loading={submitting}
                loadingText="儲存中..."
              >
                <span className="inline-flex items-center gap-1.5">
                  <Save className="w-4 h-4" />
                  儲存為草稿
                </span>
              </Button>
            </div>
          </form>
        </div>
      </main>

      {/* Phase 3 P2-6：從上月複製 modal */}
      <CopyFromPrevMonthModal
        open={copyModalOpen}
        prevYm={prevYm}
        lists={prevLists}
        loading={prevLoading}
        onCopy={handleCopyApply}
        onClose={() => setCopyModalOpen(false)}
      />
    </AppLayout>
  );
}
