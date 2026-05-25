import { forwardRef, useEffect, useImperativeHandle, useMemo, useState } from 'react';
import { Save, Building2, Archive, UserCog, X, ArrowRight, Undo2, CheckCircle, AlertCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { RatioInput } from '@/components/e07/RatioInput';
import { useToast } from '@/components/ui/toast';
import {
  getDeptRatios,
  setDeptRatios,
  type DeptRatioItem,
} from '@/api/assignment-stage';

/**
 * M03a — 部門比例設定表單（F079）
 *
 * 對應 prototype: /prototypes/29a-dept-ratio-config.html
 * 對應 spec:      F079 §5.1 / §5.2
 *
 * 範圍：
 *   - 後端 GET 回的部門列為系統資料源（ob_emphire 在職部門 ∪ ob_dept_pct 既有紀錄）。
 *   - 使用者僅能改 ration，不能新增/刪除部門列、不能改 obdeptId/Nm。
 *   - 表格欄位：部門代碼 / 部門名稱（含「已下線」徽章） / 處長 / RATION (%) /
 *     預估案件數 / 操作（清空）。
 *   - 加總即時校驗以獨立 Sum Banner 顯示（三狀態：綠 OK / 紅 超 / 紅 差）。
 *   - 提交 PUT /assignment/ratios/dept/:listNo（覆寫式：先 DELETE 再 INSERT）。
 *
 * RBAC: Director / Admin（嵌入頁面已由 route guard 攔截；處長唯讀於頁面層處理）。
 */

export interface DeptRatioFormProps {
  listNo: string;
  /** 名單預估命中總數，用於計算各部門「預估案件數」(= totalEstimate × ration / 100)。
   *  尚無 Stage 0 整合時可省略或傳 null，UI 改顯示「—」。 */
  totalEstimate?: number | null;
  /** 完成寫入後通知父層（用於 refresh + 推進邏輯）。 */
  onSaved?: () => void;
  /** 唯讀（stage !== 'dept_ratio' 或 status !== 'active' 時鎖定）。 */
  readOnly?: boolean;
  /** 「儲存並推進」按鈕點擊；父層負責 modal 與 advance API。 */
  onRequestAdvance?: () => void;
  /** 「退回草稿」按鈕點擊；父層負責 modal 與 rollback API。 */
  onRequestRollback?: () => void;
  /** 「取消」按鈕點擊（返回名單列表）；父層提供導航。 */
  onCancel?: () => void;
}

/**
 * forwardRef 對外契約：父層可呼叫 saveCurrent() 取得「將目前表單值 PUT 至後端」
 * 的能力，用於「儲存並推進」一鍵流（先 save 再 advance；任一步失敗中止）。
 *
 * - 加總非 100% / 無列 → 拋 Error（與 btn-save-dept-ratio disable 條件對齊）
 * - 後端 4xx/5xx → 透傳 axios 錯誤；呼叫者自行決定 UX
 * - 成功不觸發 toast / onSaved；交由呼叫者決定（避免「儲存 toast + 推進 toast」雙跳）
 */
export interface DeptRatioFormHandle {
  saveCurrent: () => Promise<void>;
}

export const DeptRatioForm = forwardRef<DeptRatioFormHandle, DeptRatioFormProps>(function DeptRatioForm({
  listNo,
  totalEstimate,
  onSaved,
  readOnly,
  onRequestAdvance,
  onRequestRollback,
  onCancel,
}: DeptRatioFormProps, ref) {
  const { showToast } = useToast();
  const [rows, setRows] = useState<DeptRatioItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let aborted = false;
    void (async () => {
      setLoading(true);
      setError(null);
      try {
        const data = await getDeptRatios(listNo);
        if (aborted) return;
        setRows(data.deptRatios ?? []);
      } catch (err: unknown) {
        const e = err as { response?: { data?: { message?: string } } };
        if (!aborted) setError(e?.response?.data?.message ?? '載入部門比例失敗');
      } finally {
        if (!aborted) setLoading(false);
      }
    })();
    return () => {
      aborted = true;
    };
  }, [listNo]);

  const values = useMemo(() => rows.map((r) => r.ration ?? 0), [rows]);
  const sum = useMemo(
    () => Math.round(values.reduce((a, b) => a + b, 0) * 100) / 100,
    [values],
  );
  const sumValid = Math.abs(sum - 100) <= 0.01;
  const diff = sum - 100;

  const updateRation = (obdeptId: string, ration: number) =>
    setRows((prev) =>
      prev.map((r) => (r.obdeptId === obdeptId ? { ...r, ration } : r)),
    );

  const clearRation = (obdeptId: string) => updateRation(obdeptId, 0);

  /** 核心 PUT 流程（共用於「儲存」按鈕與「儲存並推進」一鍵流）。
   *  - 前置條件不符 → throw（呼叫者自行 toast）
   *  - 後端錯誤 → 透傳 axios 錯誤
   *  - 成功 → 不 toast、不呼叫 onSaved（由呼叫者決定 UX 連動）。 */
  const performSave = async (): Promise<void> => {
    if (rows.length === 0) {
      throw new Error('無可設定部門（ob_emphire 在職員工為空）');
    }
    if (!sumValid) {
      throw new Error(`加總須為 100%，目前為 ${sum.toFixed(2)}%`);
    }
    const payload = rows.map((r) => ({
      obdeptId: r.obdeptId,
      obdeptNm: r.obdeptNm,
      ration: Number(r.ration ?? 0),
    }));
    setSaving(true);
    try {
      await setDeptRatios(listNo, { deptRatios: payload });
    } finally {
      setSaving(false);
    }
  };

  useImperativeHandle(ref, () => ({ saveCurrent: performSave }), [rows, sumValid, sum, listNo]);

  const handleSave = async () => {
    setError(null);
    try {
      await performSave();
      showToast(`部門比例已儲存（${rows.length} 部門 / 加總 ${sum}%）`, 'success');
      onSaved?.();
    } catch (err: unknown) {
      const e = err as { response?: { status?: number; data?: { message?: string } } };
      const msg = e?.response?.data?.message ?? (err instanceof Error ? err.message : '儲存失敗，請稍後再試');
      setError(msg);
      showToast(msg, 'error');
    }
  };

  if (loading) {
    return (
      <div className="p-6 text-center text-gray-400" data-testid="dept-ratio-loading">
        載入部門比例中...
      </div>
    );
  }

  const caseCountFor = (ration: number): string => {
    if (totalEstimate == null) return '—';
    return Math.round((totalEstimate * ration) / 100).toLocaleString();
  };

  return (
    <div className="space-y-4" data-testid="dept-ratio-form">
      {/* ===== 部門表格區 ===== */}
      <section className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div className="px-5 py-3 border-b border-gray-200 bg-gray-50/40 flex items-center gap-3 flex-wrap">
          <h2 className="text-sm font-semibold text-gray-800 flex items-center gap-1.5">
            <Building2 className="w-4 h-4 text-primary" />各部門 RATION 設定
          </h2>
          <span className="text-xs text-gray-400">
            資料表 <code className="font-mono">ob_dept_pct</code> · per-LIST_NO
          </span>
          <span className="ml-auto text-xs text-gray-500">
            部門清單來源：<code className="font-mono">ob_emphire WHERE resign_date IS NULL</code>
          </span>
        </div>

        {error && (
          <div
            data-testid="dept-ratio-error"
            className="mx-5 mt-3 rounded-md p-3 bg-red-50 border border-red-200 text-xs text-red-800"
          >
            {error}
          </div>
        )}

        {rows.length === 0 ? (
          <div
            className="m-5 rounded-lg border border-dashed border-gray-200 p-6 flex flex-col items-center text-center"
            data-testid="dept-ratio-empty"
          >
            <Building2 className="w-6 h-6 text-gray-400 mb-2" />
            <p className="text-xs text-gray-500">目前無在職部門可設定</p>
            <p className="text-[11px] text-gray-400 mt-0.5">請先確認 ob_emphire 資料同步狀態</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-200 bg-gray-50/30 text-xs text-gray-500 uppercase tracking-wider">
                  <th className="text-left px-5 py-2.5 font-medium" style={{ width: '15%' }}>部門代碼</th>
                  <th className="text-left px-5 py-2.5 font-medium" style={{ width: '25%' }}>部門名稱</th>
                  <th className="text-left px-5 py-2.5 font-medium" style={{ width: '15%' }}>處長</th>
                  <th className="text-right px-5 py-2.5 font-medium" style={{ width: '20%' }}>RATION (%)</th>
                  <th className="text-right px-5 py-2.5 font-medium" style={{ width: '15%' }}>預估案件數</th>
                  <th className="text-right px-5 py-2.5 font-medium" style={{ width: '10%' }}>操作</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {rows.map((r) => (
                  <tr
                    key={r.obdeptId}
                    data-testid={`dept-row-${r.obdeptId}`}
                    className={`hover:bg-blue-50/30 ${!r.isActive ? 'bg-gray-50' : ''}`}
                  >
                    <td className="px-5 py-3 font-mono text-sm text-gray-700">{r.obdeptId}</td>
                    <td className="px-5 py-3">
                      <div className="flex items-center gap-1">
                        <span className="text-sm font-medium text-gray-800">{r.obdeptNm}</span>
                        {!r.isActive && (
                          <span
                            data-testid={`dept-inactive-badge-${r.obdeptId}`}
                            className="ml-1 inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium bg-gray-200 text-gray-600"
                          >
                            <Archive className="w-2.5 h-2.5" />已下線
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="px-5 py-3">
                      {r.directorName ? (
                        <span
                          data-testid={`dept-director-${r.obdeptId}`}
                          className="text-xs text-gray-600 inline-flex items-center gap-1"
                        >
                          <UserCog className="w-3 h-3 text-purple-600" />
                          {r.directorName}
                        </span>
                      ) : (
                        <span
                          data-testid={`dept-director-none-${r.obdeptId}`}
                          className="text-xs text-gray-400"
                        >—</span>
                      )}
                    </td>
                    <td className="px-5 py-3 text-right">
                      <RatioInput
                        value={r.ration}
                        disabled={readOnly}
                        onChange={(v) => updateRation(r.obdeptId, v)}
                        aria-label={`ratio-${r.obdeptId}`}
                      />
                    </td>
                    <td
                      className="px-5 py-3 text-right text-sm text-gray-600 tabular-nums"
                      data-testid={`dept-case-count-${r.obdeptId}`}
                    >
                      {caseCountFor(r.ration ?? 0)}
                    </td>
                    <td className="px-5 py-3 text-right">
                      {!readOnly ? (
                        <button
                          type="button"
                          data-testid={`btn-clear-${r.obdeptId}`}
                          onClick={() => clearRation(r.obdeptId)}
                          aria-label={`清空 ${r.obdeptNm}`}
                          className="inline-flex items-center gap-1 px-2 py-1 text-xs text-gray-500 hover:text-red-600 hover:bg-red-50 rounded"
                          title="清空"
                        >
                          <X className="w-3.5 h-3.5" />
                        </button>
                      ) : (
                        <span className="text-xs text-gray-300">—</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* ===== 即時加總 Sum Banner（B1 元件三狀態） ===== */}
      {rows.length > 0 && (
        <section
          data-testid="dept-ratio-sum-banner"
          data-valid={sumValid ? 'true' : 'false'}
          className={`rounded-xl border-2 p-4 transition-colors flex items-center justify-between gap-4 ${
            sumValid
              ? 'bg-green-50 border-green-300'
              : 'bg-red-50 border-red-300'
          }`}
        >
          <div className="flex items-center gap-3">
            <div
              className={`w-10 h-10 rounded-full flex items-center justify-center shrink-0 text-white ${
                sumValid ? 'bg-green-500' : 'bg-red-500'
              }`}
            >
              {sumValid ? <CheckCircle className="w-5 h-5" /> : <AlertCircle className="w-5 h-5" />}
            </div>
            <div>
              <p className={`text-base font-semibold ${sumValid ? 'text-green-700' : 'text-red-700'}`}>
                {sumValid
                  ? `目前總和：${sum.toFixed(1)}% ✓`
                  : `目前總和：${sum.toFixed(1)}%（${diff > 0 ? `超 ${diff.toFixed(1)}%` : `差 ${(-diff).toFixed(1)}%`} 需調整至 100%）`}
              </p>
              <p className={`text-xs mt-0.5 ${sumValid ? 'text-green-700' : 'text-red-700'}`}>
                {sumValid
                  ? '所有部門 RATION 加總落於容忍範圍 [99.99, 100.01]，可儲存並推進。'
                  : diff > 0
                  ? '加總超過 100%，請調降部分部門 RATION（或將某些部門設為 0%）。'
                  : '加總未達 100%，請補足剩餘比例（0% 為合法值表示該部門本月不分派）。'}
              </p>
            </div>
          </div>
          <div className="text-right">
            <p className="text-[10px] text-gray-400 uppercase tracking-wider">即時加總</p>
            <p
              className={`text-3xl font-bold tabular-nums ${
                sumValid ? 'text-green-700' : 'text-red-700'
              }`}
            >
              {sum.toFixed(1)}<span className="text-base font-normal">%</span>
            </p>
          </div>
        </section>
      )}

      {/* ===== 操作按鈕區（空 deptRatios 時仍顯示 cancel/rollback；save/advance 才條件 gated） ===== */}
      {!readOnly && (
        <div className="bg-white rounded-xl border border-gray-200 px-5 py-4 flex items-center justify-between gap-3">
          {onCancel ? (
            <button
              type="button"
              onClick={onCancel}
              className="text-sm text-gray-500 hover:text-gray-700 inline-flex items-center gap-1"
            >
              <X className="w-4 h-4" />取消（返回名單列表）
            </button>
          ) : <span />}
          <div className="flex items-center gap-2">
            {onRequestRollback && (
              <Button
                type="button"
                variant="warning"
                data-testid="btn-rollback-draft"
                onClick={onRequestRollback}
              >
                <span className="inline-flex items-center gap-1.5">
                  <Undo2 className="w-4 h-4" />退回草稿
                </span>
              </Button>
            )}
            {rows.length > 0 && (
              <Button
                type="button"
                variant="secondary"
                data-testid="btn-save-dept-ratio"
                loading={saving}
                loadingText="儲存中..."
                disabled={!sumValid}
                onClick={handleSave}
              >
                <span className="inline-flex items-center gap-1.5">
                  <Save className="w-4 h-4" />儲存
                </span>
              </Button>
            )}
            {rows.length > 0 && onRequestAdvance && (
              <Button
                type="button"
                variant="primary"
                data-testid="btn-advance-personnel-ratio"
                disabled={!sumValid}
                onClick={onRequestAdvance}
              >
                <span className="inline-flex items-center gap-1.5">
                  <ArrowRight className="w-4 h-4" />儲存並推進至個別業務比例
                </span>
              </Button>
            )}
          </div>
        </div>
      )}
    </div>
  );
});
