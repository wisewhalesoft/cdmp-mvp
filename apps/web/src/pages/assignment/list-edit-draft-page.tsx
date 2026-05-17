import { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Save, ArrowLeft, Plus, X, AlertTriangle } from 'lucide-react';
import { AppLayout } from '@/components/layout/app-layout';
import { Button } from '@/components/ui/button';
import { StageBadge, type Stage } from '@/components/e07/StageBadge';
import { RejectBanner } from '@/components/e07/RejectBanner';
import { useToast } from '@/components/ui/toast';
import { listLists, updateList, type AssignmentListItem } from '@/api/assignment-list';

/**
 * F051 v2.0 — 編輯草稿名單頁
 *
 * 對應 prototype: /prototypes/27b-list-edit-draft.html
 *
 * 階段守衛（spec BR-5）：
 *   - stage='draft' → 可編輯所有欄位
 *   - stage !== 'draft' → 顯示 RejectBanner（如有），表單欄位 read-only
 *
 * RBAC: DirectorRoute（section_chief 不可編輯）
 *
 * MVP：欄位 set 與 create 一致；若名單已退件，顯示 RejectBanner 引導 Rollback。
 */

interface ConditionRow {
  id: string;
  columnName: string;
  values: string;
}

function genId(): string {
  return Math.random().toString(36).slice(2, 10);
}

function splitMulti(joined: string | null | undefined): string {
  if (!joined) return '';
  return joined.split('$$').filter(Boolean).join(',');
}

export function ListEditDraftPage() {
  const navigate = useNavigate();
  const { showToast } = useToast();
  const { listNo } = useParams<{ listNo: string }>();

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [list, setList] = useState<AssignmentListItem | null>(null);

  // Form state (mirror of create page)
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
  const [crEnabled, setCrEnabled] = useState(true);
  const [conditions, setConditions] = useState<ConditionRow[]>([]);

  useEffect(() => {
    if (!listNo) return;
    let aborted = false;
    void (async () => {
      setLoading(true);
      setError(null);
      try {
        // 因 backend 無單筆 GET /:listNo（spec 待補），暫從 list endpoint 找
        const data = await listLists({});
        if (aborted) return;
        const found = data.lists.find((l) => l.listNo === listNo);
        if (!found) {
          setError(`找不到名單 ${listNo}`);
          return;
        }
        setList(found);
        setListNm(found.listNm);
        setProdKind(found.prodKind ?? '');
        setCaseYear(splitMulti(found.caseYear));
        setSpecTp(splitMulti(found.specTp));
        // caseStatus 未在 list response 中暴露；保留空白由 user 重填
        setListPeriodStart(String(found.listPeriodStart ?? 0));
        setListPeriodEnd(String(found.listPeriodEnd ?? 999));
        setListInterval(String(found.listInterval ?? 30));
        setSettleSrc(found.settleSrc ?? '');
        setCardType(found.cardType ?? '');
      } catch (err: unknown) {
        const e = err as { response?: { data?: { message?: string } } };
        setError(e?.response?.data?.message ?? '載入名單失敗');
      } finally {
        setLoading(false);
      }
    })();
    return () => {
      aborted = true;
    };
  }, [listNo]);

  const isDraft = list?.stage === 'draft';
  const readOnly = !isDraft;

  const addCondition = () =>
    setConditions((prev) => [...prev, { id: genId(), columnName: '', values: '' }]);
  const removeCondition = (id: string) =>
    setConditions((prev) => prev.filter((c) => c.id !== id));
  const updateCondition = (id: string, patch: Partial<ConditionRow>) =>
    setConditions((prev) => prev.map((c) => (c.id === id ? { ...c, ...patch } : c)));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!listNo || readOnly) return;
    setError(null);

    if (!listNm.trim() || !prodKind || !caseYear || !specTp || !caseStatus || !settleSrc) {
      setError('請填寫所有必填欄位');
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
      await updateList(listNo, dto);
      showToast(`名單 ${listNo} 已更新`, 'success');
      navigate('/assignment/list-definitions');
    } catch (err: unknown) {
      const e = err as { response?: { data?: { message?: string } } };
      const msg = e?.response?.data?.message ?? '更新失敗，請稍後再試';
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
          <h1 className="text-base font-semibold text-gray-800">
            編輯草稿名單 <code className="font-mono text-primary text-sm">{listNo}</code>
          </h1>
          {list && <StageBadge stage={list.stage as Stage} />}
        </div>
      }
    >
      <main className="flex-1 p-6">
        <div className="max-w-3xl mx-auto space-y-4">
          {loading && (
            <div className="text-center text-gray-400 py-12" data-testid="edit-loading">
              載入中...
            </div>
          )}

          {!loading && error && (
            <div
              data-testid="form-error"
              className="rounded-lg p-3 bg-red-50 border border-red-200 text-sm text-red-800"
            >
              {error}
            </div>
          )}

          {!loading && list && (
            <>
              {/* 階段守衛：非 draft 顯示 RejectBanner */}
              {readOnly && (
                <RejectBanner
                  storageKey={`reject-banner:${listNo}:stage-${list.stage}`}
                  title={`此名單目前階段為「${list.stage}」，無法編輯`}
                  reason="僅 stage='draft' 階段允許修改欄位。若需修改請先 Rollback 至草稿。"
                  rejectedBy={list.createdBy}
                  rejectedAt={list.updatedAt.slice(0, 10)}
                />
              )}

              {readOnly && (
                <div
                  data-testid="readonly-notice"
                  className="rounded-lg p-3 bg-amber-50 border border-amber-200 flex items-start gap-2 text-sm"
                >
                  <AlertTriangle className="w-4 h-4 text-warning mt-0.5 shrink-0" />
                  <div className="flex-1 text-amber-800">
                    <p className="font-semibold">唯讀模式</p>
                    <p className="text-xs mt-0.5">
                      此名單已推進至 <strong>{list.stage}</strong> 階段；欄位無法修改。
                    </p>
                  </div>
                </div>
              )}

              <form onSubmit={handleSubmit} className="space-y-4">
                <section className="bg-white rounded-xl border border-gray-200 p-5 space-y-4">
                  <h2 className="text-base font-semibold text-gray-800">基本資訊</h2>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1.5">
                      名單名稱 <span className="text-danger">*</span>
                    </label>
                    <input
                      data-testid="input-listNm"
                      type="text"
                      required
                      maxLength={45}
                      disabled={readOnly}
                      value={listNm}
                      onChange={(e) => setListNm(e.target.value)}
                      className="w-full px-3 py-2 border border-gray-200 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-primary disabled:bg-gray-50 disabled:text-gray-500"
                    />
                  </div>
                  <label className="flex items-center gap-3 cursor-pointer">
                    <input
                      type="checkbox"
                      data-testid="input-crEnabled"
                      checked={crEnabled}
                      disabled={readOnly}
                      onChange={(e) => setCrEnabled(e.target.checked)}
                      className="h-4 w-4 rounded border-gray-300 text-primary focus:ring-2 focus:ring-primary/20 disabled:opacity-50"
                    />
                    <span className="text-sm text-gray-700">CR 回分啟用</span>
                  </label>
                </section>

                <section className="bg-white rounded-xl border border-gray-200 p-5 space-y-4">
                  <h2 className="text-base font-semibold text-gray-800">商品與期別</h2>
                  <div className="grid grid-cols-2 gap-4">
                    <Field label="商品類別" required>
                      <input
                        data-testid="input-prodKind"
                        type="text"
                        required
                        disabled={readOnly}
                        value={prodKind}
                        onChange={(e) => setProdKind(e.target.value)}
                        className="w-full px-3 py-2 border border-gray-200 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-primary disabled:bg-gray-50"
                      />
                    </Field>
                    <Field label="商品次類" required>
                      <input
                        data-testid="input-specTp"
                        type="text"
                        required
                        disabled={readOnly}
                        value={specTp}
                        onChange={(e) => setSpecTp(e.target.value)}
                        className="w-full px-3 py-2 border border-gray-200 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-primary disabled:bg-gray-50"
                      />
                    </Field>
                    <Field label="年期" required>
                      <input
                        data-testid="input-caseYear"
                        type="text"
                        required
                        disabled={readOnly}
                        value={caseYear}
                        onChange={(e) => setCaseYear(e.target.value)}
                        className="w-full px-3 py-2 border border-gray-200 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-primary disabled:bg-gray-50"
                      />
                    </Field>
                    <Field label="結清期別" required>
                      <input
                        data-testid="input-caseStatus"
                        type="text"
                        required
                        disabled={readOnly}
                        value={caseStatus}
                        onChange={(e) => setCaseStatus(e.target.value)}
                        className="w-full px-3 py-2 border border-gray-200 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-primary disabled:bg-gray-50"
                      />
                    </Field>
                    <Field label="結清來源" required>
                      <input
                        data-testid="input-settleSrc"
                        type="text"
                        required
                        disabled={readOnly}
                        value={settleSrc}
                        onChange={(e) => setSettleSrc(e.target.value)}
                        className="w-full px-3 py-2 border border-gray-200 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-primary disabled:bg-gray-50"
                      />
                    </Field>
                    <Field label="卡別">
                      <input
                        data-testid="input-cardType"
                        type="text"
                        maxLength={5}
                        disabled={readOnly}
                        value={cardType}
                        onChange={(e) => setCardType(e.target.value)}
                        className="w-full px-3 py-2 border border-gray-200 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-primary disabled:bg-gray-50"
                      />
                    </Field>
                  </div>

                  <div className="grid grid-cols-3 gap-4">
                    <Field label="期別起" required>
                      <input
                        data-testid="input-listPeriodStart"
                        type="number"
                        min={0}
                        max={999}
                        required
                        disabled={readOnly}
                        value={listPeriodStart}
                        onChange={(e) => setListPeriodStart(e.target.value)}
                        className="w-full px-3 py-2 border border-gray-200 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-primary disabled:bg-gray-50"
                      />
                    </Field>
                    <Field label="期別迄" required>
                      <input
                        data-testid="input-listPeriodEnd"
                        type="number"
                        min={0}
                        max={999}
                        required
                        disabled={readOnly}
                        value={listPeriodEnd}
                        onChange={(e) => setListPeriodEnd(e.target.value)}
                        className="w-full px-3 py-2 border border-gray-200 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-primary disabled:bg-gray-50"
                      />
                    </Field>
                    <Field label="間隔" required>
                      <input
                        data-testid="input-listInterval"
                        type="number"
                        min={0}
                        max={999}
                        required
                        disabled={readOnly}
                        value={listInterval}
                        onChange={(e) => setListInterval(e.target.value)}
                        className="w-full px-3 py-2 border border-gray-200 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-primary disabled:bg-gray-50"
                      />
                    </Field>
                  </div>
                </section>

                <section className="bg-white rounded-xl border border-gray-200 p-5 space-y-3">
                  <div className="flex items-center justify-between">
                    <h2 className="text-base font-semibold text-gray-800">篩選條件（選填）</h2>
                    {!readOnly && (
                      <button
                        type="button"
                        onClick={addCondition}
                        data-testid="btn-add-condition"
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm border border-primary text-primary rounded-md hover:bg-blue-50"
                      >
                        <Plus className="w-4 h-4" />
                        新增條件
                      </button>
                    )}
                  </div>
                  {conditions.length === 0 ? (
                    <p className="text-xs text-gray-400">尚未新增任何篩選條件</p>
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
                            placeholder="欄位名"
                            disabled={readOnly}
                            value={c.columnName}
                            onChange={(e) =>
                              updateCondition(c.id, { columnName: e.target.value })
                            }
                            className="w-48 px-3 py-1.5 border border-gray-200 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-primary disabled:bg-gray-50"
                          />
                          <input
                            type="text"
                            placeholder="值（逗號分隔）"
                            disabled={readOnly}
                            value={c.values}
                            onChange={(e) =>
                              updateCondition(c.id, { values: e.target.value })
                            }
                            className="flex-1 px-3 py-1.5 border border-gray-200 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-primary disabled:bg-gray-50"
                          />
                          {!readOnly && (
                            <button
                              type="button"
                              onClick={() => removeCondition(c.id)}
                              className="p-1.5 text-gray-400 hover:text-danger hover:bg-red-50 rounded-md"
                            >
                              <X className="w-4 h-4" />
                            </button>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </section>

                <div className="flex items-center justify-end gap-3 pt-2">
                  <Button
                    type="button"
                    variant="secondary"
                    onClick={() => navigate('/assignment/list-definitions')}
                  >
                    返回
                  </Button>
                  {!readOnly && (
                    <Button
                      type="submit"
                      variant="primary"
                      loading={submitting}
                      loadingText="儲存中..."
                    >
                      <span className="inline-flex items-center gap-1.5">
                        <Save className="w-4 h-4" />
                        儲存變更
                      </span>
                    </Button>
                  )}
                </div>
              </form>
            </>
          )}
        </div>
      </main>
    </AppLayout>
  );
}

function Field({
  label,
  required,
  children,
}: {
  label: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label className="block text-sm font-medium text-gray-700 mb-1.5">
        {label}
        {required && <span className="text-danger ml-0.5">*</span>}
      </label>
      {children}
    </div>
  );
}
