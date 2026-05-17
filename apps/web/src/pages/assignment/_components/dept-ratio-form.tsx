import { useState, useEffect, useMemo } from 'react';
import { Save, Plus, X, Building2 } from 'lucide-react';
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
 *
 * 範圍：
 *   - 列出部門名單（行 = 部門 obdeptId + obdeptNm + ration%）
 *   - 加總即時校驗（必為 100，容忍 ±0.01）
 *   - 提交 PUT /assignment/ratios/dept/:listNo（覆寫式：先 DELETE 再 INSERT）
 *
 * RBAC: Director only（嵌入頁面已由 route guard 攔截）。
 */

interface DeptRow extends DeptRatioItem {
  rowId: string;
}

function genRowId(): string {
  return Math.random().toString(36).slice(2, 10);
}

export interface DeptRatioFormProps {
  listNo: string;
  /** 完成寫入後通知父層（用於 refresh + 推進邏輯）。 */
  onSaved?: () => void;
  /** 唯讀（stage !== 'dept_ratio' 時鎖定）。 */
  readOnly?: boolean;
}

export function DeptRatioForm({ listNo, onSaved, readOnly }: DeptRatioFormProps) {
  const { showToast } = useToast();
  const [rows, setRows] = useState<DeptRow[]>([]);
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
        setRows(
          (data.deptRatios ?? []).map((r) => ({
            rowId: genRowId(),
            obdeptId: r.obdeptId,
            obdeptNm: r.obdeptNm,
            ration: r.ration,
          })),
        );
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

  const addRow = () =>
    setRows((prev) => [
      ...prev,
      { rowId: genRowId(), obdeptId: '', obdeptNm: '', ration: 0 },
    ]);

  const removeRow = (rowId: string) =>
    setRows((prev) => prev.filter((r) => r.rowId !== rowId));

  const updateRow = (rowId: string, patch: Partial<DeptRow>) =>
    setRows((prev) =>
      prev.map((r) => (r.rowId === rowId ? { ...r, ...patch } : r)),
    );

  const handleSave = async () => {
    setError(null);
    if (rows.length === 0) {
      setError('至少需 1 筆部門設定');
      return;
    }
    if (!sumValid) {
      setError(`加總須為 100%，目前為 ${sum.toFixed(2)}%`);
      return;
    }
    if (rows.some((r) => !r.obdeptId.trim() || !r.obdeptNm.trim())) {
      setError('每筆部門需填寫部門代碼與名稱');
      return;
    }
    setSaving(true);
    try {
      const payload = rows.map((r) => ({
        obdeptId: r.obdeptId.trim(),
        obdeptNm: r.obdeptNm.trim(),
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
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Building2 className="w-5 h-5 text-blue-800" />
          <h3 className="text-base font-semibold text-gray-800">M03a 部門比例設定</h3>
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
        <div className="rounded-lg border border-dashed border-gray-200 p-6 flex flex-col items-center text-center">
          <Building2 className="w-6 h-6 text-gray-400 mb-2" />
          <p className="text-xs text-gray-500">尚未設定部門比例</p>
        </div>
      ) : (
        <table className="w-full text-sm">
          <thead>
            <tr className="text-xs text-gray-500 uppercase border-b border-gray-200">
              <th className="text-left py-2 font-medium w-[20%]">部門代碼</th>
              <th className="text-left py-2 font-medium w-[40%]">部門名稱</th>
              <th className="text-right py-2 font-medium w-[25%]">比例</th>
              <th className="text-right py-2 font-medium w-[15%]"></th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.rowId} data-testid={`dept-row-${r.rowId}`} className="border-b border-gray-100">
                <td className="py-2 pr-2">
                  <input
                    type="text"
                    maxLength={6}
                    disabled={readOnly}
                    value={r.obdeptId}
                    onChange={(e) => updateRow(r.rowId, { obdeptId: e.target.value })}
                    placeholder="例：D001"
                    className="w-full px-2 py-1.5 border border-gray-200 rounded-md text-sm font-mono focus:outline-none focus:ring-2 focus:ring-primary disabled:bg-gray-50"
                  />
                </td>
                <td className="py-2 pr-2">
                  <input
                    type="text"
                    maxLength={10}
                    disabled={readOnly}
                    value={r.obdeptNm}
                    onChange={(e) => updateRow(r.rowId, { obdeptNm: e.target.value })}
                    placeholder="部門名稱"
                    className="w-full px-2 py-1.5 border border-gray-200 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-primary disabled:bg-gray-50"
                  />
                </td>
                <td className="py-2 pr-2 text-right">
                  <RatioInput
                    value={r.ration}
                    disabled={readOnly}
                    onChange={(v) => updateRow(r.rowId, { ration: v })}
                    aria-label={`ratio-${r.obdeptId}`}
                  />
                </td>
                <td className="py-2 text-right">
                  {!readOnly && (
                    <button
                      type="button"
                      onClick={() => removeRow(r.rowId)}
                      aria-label={`移除 ${r.obdeptNm}`}
                      className="p-1.5 text-gray-400 hover:text-danger hover:bg-red-50 rounded-md"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      <div className="flex items-center justify-between pt-2 border-t border-gray-100">
        {!readOnly && (
          <button
            type="button"
            data-testid="btn-add-dept"
            onClick={addRow}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm border border-primary text-primary rounded-md hover:bg-blue-50"
          >
            <Plus className="w-4 h-4" />
            新增部門
          </button>
        )}
        {!readOnly && (
          <Button
            type="button"
            variant="primary"
            loading={saving}
            loadingText="儲存中..."
            disabled={rows.length === 0}
            onClick={handleSave}
          >
            <span className="inline-flex items-center gap-1.5">
              <Save className="w-4 h-4" />
              儲存部門比例
            </span>
          </Button>
        )}
      </div>
    </div>
  );
}
