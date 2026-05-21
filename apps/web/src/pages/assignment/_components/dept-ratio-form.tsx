import { useState, useEffect, useMemo } from 'react';
import { Save, Building2, Archive } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { RatioInput, RatioSumIndicator } from '@/components/e07/RatioInput';
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
 *   - 後端 GET 回的部門列為系統資料源（ob_emphire 在職部門 ∪ ob_dept_pct 既有紀錄）；
 *     使用者僅能改 ration，不能新增/刪除部門列、不能改 obdeptId/Nm。
 *   - `isActive = false` 的部門顯示「已下線」徽章（舊 ob_dept_pct 紀錄但無在職員工）。
 *   - 加總即時校驗（必為 100，容忍 ±0.01）。
 *   - 提交 PUT /assignment/ratios/dept/:listNo（覆寫式：先 DELETE 再 INSERT）。
 *
 * RBAC: Director only（嵌入頁面已由 route guard 攔截）。
 */

export interface DeptRatioFormProps {
  listNo: string;
  /** 完成寫入後通知父層（用於 refresh + 推進邏輯）。 */
  onSaved?: () => void;
  /** 唯讀（stage !== 'dept_ratio' 時鎖定）。 */
  readOnly?: boolean;
}

export function DeptRatioForm({ listNo, onSaved, readOnly }: DeptRatioFormProps) {
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

  const updateRation = (obdeptId: string, ration: number) =>
    setRows((prev) =>
      prev.map((r) => (r.obdeptId === obdeptId ? { ...r, ration } : r)),
    );

  const handleSave = async () => {
    setError(null);
    if (rows.length === 0) {
      setError('無可設定部門（ob_emphire 在職員工為空）');
      return;
    }
    if (!sumValid) {
      setError(`加總須為 100%，目前為 ${sum.toFixed(2)}%`);
      return;
    }
    setSaving(true);
    try {
      const payload = rows.map((r) => ({
        obdeptId: r.obdeptId,
        obdeptNm: r.obdeptNm,
        ration: Number(r.ration ?? 0),
      }));
      await setDeptRatios(listNo, { deptRatios: payload });
      showToast(`部門比例已儲存（${payload.length} 部門 / 加總 ${sum}%）`, 'success');
      onSaved?.();
    } catch (err: unknown) {
      const e = err as { response?: { status?: number; data?: { message?: string } } };
      const msg = e?.response?.data?.message ?? '儲存失敗，請稍後再試';
      setError(msg);
      showToast(msg, 'error');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="p-6 text-center text-gray-400" data-testid="dept-ratio-loading">
        載入部門比例中...
      </div>
    );
  }

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-5 space-y-4" data-testid="dept-ratio-form">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div className="flex flex-col">
          <div className="flex items-center gap-2">
            <Building2 className="w-5 h-5 text-blue-800" />
            <h3 className="text-base font-semibold text-gray-800">M03a 部門比例設定</h3>
          </div>
          <p className="text-[11px] text-gray-400 mt-0.5 ml-7">
            部門清單來源：<code className="font-mono">ob_emphire WHERE resign_date IS NULL</code>
          </p>
        </div>
        <RatioSumIndicator values={values} />
      </div>

      {error && (
        <div
          data-testid="dept-ratio-error"
          className="rounded-md p-3 bg-red-50 border border-red-200 text-xs text-red-800"
        >
          {error}
        </div>
      )}

      {rows.length === 0 ? (
        <div
          className="rounded-lg border border-dashed border-gray-200 p-6 flex flex-col items-center text-center"
          data-testid="dept-ratio-empty"
        >
          <Building2 className="w-6 h-6 text-gray-400 mb-2" />
          <p className="text-xs text-gray-500">目前無在職部門可設定</p>
          <p className="text-[11px] text-gray-400 mt-0.5">請先確認 ob_emphire 資料同步狀態</p>
        </div>
      ) : (
        <table className="w-full text-sm">
          <thead>
            <tr className="text-xs text-gray-500 uppercase border-b border-gray-200">
              <th className="text-left py-2 font-medium w-[20%]">部門代碼</th>
              <th className="text-left py-2 font-medium w-[55%]">部門名稱</th>
              <th className="text-right py-2 font-medium w-[25%]">比例</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr
                key={r.obdeptId}
                data-testid={`dept-row-${r.obdeptId}`}
                className={`border-b border-gray-100 ${!r.isActive ? 'bg-gray-50/60' : ''}`}
              >
                <td className="py-2 pr-2 font-mono text-sm text-gray-700">{r.obdeptId}</td>
                <td className="py-2 pr-2">
                  <div className="flex items-center gap-2">
                    <span className="text-sm text-gray-800">{r.obdeptNm}</span>
                    {!r.isActive && (
                      <span
                        data-testid={`dept-inactive-badge-${r.obdeptId}`}
                        className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium bg-gray-200 text-gray-600"
                      >
                        <Archive className="w-2.5 h-2.5" />已下線
                      </span>
                    )}
                  </div>
                </td>
                <td className="py-2 pr-2 text-right">
                  <RatioInput
                    value={r.ration}
                    disabled={readOnly}
                    onChange={(v) => updateRation(r.obdeptId, v)}
                    aria-label={`ratio-${r.obdeptId}`}
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {!readOnly && rows.length > 0 && (
        <div className="flex items-center justify-end pt-2 border-t border-gray-100">
          <Button
            type="button"
            variant="primary"
            loading={saving}
            loadingText="儲存中..."
            disabled={!sumValid}
            onClick={handleSave}
          >
            <span className="inline-flex items-center gap-1.5">
              <Save className="w-4 h-4" />
              儲存部門比例
            </span>
          </Button>
        </div>
      )}
    </div>
  );
}
