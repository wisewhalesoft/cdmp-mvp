import { useState, useEffect, useMemo, useCallback } from 'react';
import { Save, Plus, X, Users } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { RatioInput, RatioSumIndicator } from '@/components/e07/RatioInput';
import { useToast } from '@/components/ui/toast';
import {
  getDeptRatios,
  getPersonnelRatios,
  setPersonnelRatios,
  type AppliedTemplate,
  type PersonnelRatioEmployee,
} from '@/api/assignment-stage';

/**
 * M03b — 個別業務比例設定表單（F082 / F083）
 *
 * 對應 prototype: /prototypes/29b-personnel-ratio-config.html
 *
 * UX：
 *   1. 載入該 list_no 的部門清單（從 dept-ratios endpoint）
 *   2. 使用者選一個部門 → 載入該部門員工列表 + 既有比例
 *   3. 編輯員工 ration%；可使用 ±10% / ±20% 模板按鈕（F083）
 *   4. 加總 = 100（容忍 ±0.01）
 *   5. 儲存 → PUT /assignment/ratios/personnel/:listNo（覆寫該部門紀錄）
 *
 * RBAC: DirectorOrSectionChief（處長限轄區 — backend 過濾）。
 */

interface EmployeeRow extends PersonnelRatioEmployee {
  rowId: string;
}

function genRowId(): string {
  return Math.random().toString(36).slice(2, 10);
}

export interface PersonnelRatioFormProps {
  listNo: string;
  /** 完成寫入後通知父層。 */
  onSaved?: () => void;
  /** 唯讀（stage !== 'personnel_ratio' 時鎖定）。 */
  readOnly?: boolean;
}

export function PersonnelRatioForm({
  listNo,
  onSaved,
  readOnly,
}: PersonnelRatioFormProps) {
  const { showToast } = useToast();

  const [depts, setDepts] = useState<Array<{ obdeptId: string; obdeptNm: string }>>([]);
  const [selectedDept, setSelectedDept] = useState<string>('');
  const [rows, setRows] = useState<EmployeeRow[]>([]);
  const [loadingDepts, setLoadingDepts] = useState(true);
  const [loadingEmps, setLoadingEmps] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [appliedTemplate, setAppliedTemplate] = useState<AppliedTemplate | null>(null);

  // Step 1: load dept list
  useEffect(() => {
    let aborted = false;
    void (async () => {
      setLoadingDepts(true);
      setError(null);
      try {
        const data = await getDeptRatios(listNo);
        if (aborted) return;
        const list = (data.deptRatios ?? []).map((d) => ({
          obdeptId: d.obdeptId,
          obdeptNm: d.obdeptNm,
        }));
        setDepts(list);
        if (list.length > 0) setSelectedDept(list[0].obdeptId);
      } catch (err: unknown) {
        const e = err as { response?: { data?: { message?: string } } };
        if (!aborted) setError(e?.response?.data?.message ?? '載入部門清單失敗');
      } finally {
        if (!aborted) setLoadingDepts(false);
      }
    })();
    return () => {
      aborted = true;
    };
  }, [listNo]);

  // Step 2: load employees for selected dept
  const loadEmps = useCallback(async (deptCode: string) => {
    if (!deptCode) {
      setRows([]);
      return;
    }
    setLoadingEmps(true);
    setError(null);
    try {
      const data = await getPersonnelRatios(listNo, deptCode);
      setRows(
        (data.employees ?? []).map((e) => ({
          rowId: genRowId(),
          empId: e.empId,
          empName: e.empName,
          ration: e.ration,
        })),
      );
      setAppliedTemplate(null);
    } catch (err: unknown) {
      const e = err as { response?: { data?: { message?: string } } };
      setError(e?.response?.data?.message ?? '載入員工比例失敗');
    } finally {
      setLoadingEmps(false);
    }
  }, [listNo]);

  useEffect(() => {
    void loadEmps(selectedDept);
  }, [selectedDept, loadEmps]);

  const values = useMemo(() => rows.map((r) => r.ration ?? 0), [rows]);
  const sum = useMemo(
    () => Math.round(values.reduce((a, b) => a + b, 0) * 100) / 100,
    [values],
  );
  const sumValid = Math.abs(sum - 100) <= 0.01;

  const addRow = () =>
    setRows((prev) => [
      ...prev,
      { rowId: genRowId(), empId: '', empName: '', ration: 0 },
    ]);

  const removeRow = (rowId: string) =>
    setRows((prev) => prev.filter((r) => r.rowId !== rowId));

  const updateRow = (rowId: string, patch: Partial<EmployeeRow>) =>
    setRows((prev) => prev.map((r) => (r.rowId === rowId ? { ...r, ...patch } : r)));

  // F083 模板套用：對目標 empId 套 +10/+20/-10/-20%，其他成員按比例平均吸收差額
  const applyTemplate = (
    target: EmployeeRow,
    template: '+10%' | '+20%' | '-10%' | '-20%',
  ) => {
    if (rows.length < 2) return;
    const delta = template === '+10%' ? 10 : template === '+20%' ? 20 : template === '-10%' ? -10 : -20;
    const targetNew = Math.max(0, Math.min(100, Math.round((target.ration + delta) * 100) / 100));
    const realDelta = targetNew - target.ration;
    const otherRows = rows.filter((r) => r.rowId !== target.rowId);
    const otherSum = otherRows.reduce((a, b) => a + b.ration, 0);
    if (otherSum === 0) return;
    setRows((prev) =>
      prev.map((r) => {
        if (r.rowId === target.rowId) return { ...r, ration: targetNew };
        // 比例吸收：v_new = v_old - realDelta * (v_old / otherSum)
        const adjust = (realDelta * r.ration) / otherSum;
        const newR = Math.max(0, Math.round((r.ration - adjust) * 100) / 100);
        return { ...r, ration: newR };
      }),
    );
    setAppliedTemplate({ template, targetEmpId: target.empId });
  };

  const handleSave = async () => {
    setError(null);
    if (!selectedDept) {
      setError('請先選擇部門');
      return;
    }
    if (rows.some((r) => !r.empId.trim() || !r.empName.trim())) {
      setError('每筆員工需填寫員工編號與姓名');
      return;
    }
    if (rows.length > 0 && !sumValid) {
      setError(`加總須為 100%，目前為 ${sum.toFixed(2)}%`);
      return;
    }
    setSaving(true);
    try {
      const payload = {
        deptCode: selectedDept,
        deptName: depts.find((d) => d.obdeptId === selectedDept)?.obdeptNm,
        employees: rows.map((r) => ({
          empId: r.empId.trim(),
          empName: r.empName.trim(),
          ration: Number(r.ration ?? 0),
        })),
        ...(appliedTemplate ? { appliedTemplate } : {}),
      };
      await setPersonnelRatios(listNo, payload);
      showToast(
        `部門 ${selectedDept} 個別比例已儲存（${rows.length} 人 / 加總 ${sum}%）`,
        'success',
      );
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

  if (loadingDepts) {
    return (
      <div className="p-6 text-center text-gray-400" data-testid="personnel-ratio-loading">
        載入部門清單中...
      </div>
    );
  }

  if (depts.length === 0) {
    return (
      <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800" data-testid="personnel-ratio-no-depts">
        無部門設定，請先完成 M03a 部門比例設定後再進行個別比例。
      </div>
    );
  }

  return (
    <div
      className="bg-white rounded-xl border border-gray-200 p-5 space-y-4"
      data-testid="personnel-ratio-form"
    >
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-2">
          <Users className="w-5 h-5 text-cyan-800" />
          <h3 className="text-base font-semibold text-gray-800">M03b 個別業務比例</h3>
        </div>
        <div className="flex items-center gap-3">
          <select
            data-testid="select-dept"
            value={selectedDept}
            disabled={readOnly}
            onChange={(e) => setSelectedDept(e.target.value)}
            className="px-3 py-1.5 border border-gray-200 rounded-md text-sm bg-white focus:outline-none focus:ring-2 focus:ring-primary disabled:bg-gray-50"
          >
            {depts.map((d) => (
              <option key={d.obdeptId} value={d.obdeptId}>
                {d.obdeptId} · {d.obdeptNm}
              </option>
            ))}
          </select>
          {rows.length > 0 && <RatioSumIndicator values={values} />}
        </div>
      </div>

      {error && (
        <div
          data-testid="personnel-ratio-error"
          className="rounded-md p-3 bg-red-50 border border-red-200 text-xs text-red-800"
        >
          {error}
        </div>
      )}

      {loadingEmps ? (
        <div className="p-6 text-center text-gray-400">載入員工比例中...</div>
      ) : rows.length === 0 ? (
        <div className="rounded-lg border border-dashed border-gray-200 p-6 flex flex-col items-center text-center">
          <Users className="w-6 h-6 text-gray-400 mb-2" />
          <p className="text-xs text-gray-500">此部門尚未設定員工比例</p>
        </div>
      ) : (
        <table className="w-full text-sm">
          <thead>
            <tr className="text-xs text-gray-500 uppercase border-b border-gray-200">
              <th className="text-left py-2 font-medium w-[15%]">員工編號</th>
              <th className="text-left py-2 font-medium w-[25%]">姓名</th>
              <th className="text-right py-2 font-medium w-[20%]">比例</th>
              <th className="text-center py-2 font-medium w-[30%]">模板（F083）</th>
              <th className="text-right py-2 font-medium w-[10%]"></th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.rowId} data-testid={`empl-row-${r.rowId}`} className="border-b border-gray-100">
                <td className="py-2 pr-2">
                  <input
                    type="text"
                    maxLength={6}
                    disabled={readOnly}
                    value={r.empId}
                    onChange={(e) => updateRow(r.rowId, { empId: e.target.value })}
                    placeholder="例：E001"
                    className="w-full px-2 py-1.5 border border-gray-200 rounded-md text-sm font-mono focus:outline-none focus:ring-2 focus:ring-primary disabled:bg-gray-50"
                  />
                </td>
                <td className="py-2 pr-2">
                  <input
                    type="text"
                    maxLength={50}
                    disabled={readOnly}
                    value={r.empName}
                    onChange={(e) => updateRow(r.rowId, { empName: e.target.value })}
                    placeholder="員工姓名"
                    className="w-full px-2 py-1.5 border border-gray-200 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-primary disabled:bg-gray-50"
                  />
                </td>
                <td className="py-2 pr-2 text-right">
                  <RatioInput
                    value={r.ration}
                    disabled={readOnly}
                    onChange={(v) => updateRow(r.rowId, { ration: v })}
                    aria-label={`empl-ratio-${r.empId}`}
                  />
                </td>
                <td className="py-2 text-center">
                  {!readOnly && rows.length >= 2 && (
                    <div className="inline-flex items-center gap-1">
                      {(['-20%', '-10%', '+10%', '+20%'] as const).map((tpl) => (
                        <button
                          key={tpl}
                          type="button"
                          data-testid={`tpl-${tpl}-${r.empId}`}
                          onClick={() => applyTemplate(r, tpl)}
                          className="px-1.5 py-0.5 text-[10px] font-mono border border-gray-200 rounded text-gray-600 hover:bg-gray-50"
                        >
                          {tpl}
                        </button>
                      ))}
                    </div>
                  )}
                </td>
                <td className="py-2 text-right">
                  {!readOnly && (
                    <button
                      type="button"
                      onClick={() => removeRow(r.rowId)}
                      aria-label={`移除 ${r.empName}`}
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
            data-testid="btn-add-empl"
            onClick={addRow}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm border border-primary text-primary rounded-md hover:bg-blue-50"
          >
            <Plus className="w-4 h-4" />
            新增員工
          </button>
        )}
        {!readOnly && (
          <Button
            type="button"
            variant="primary"
            loading={saving}
            loadingText="儲存中..."
            disabled={rows.length === 0 || !sumValid}
            onClick={handleSave}
          >
            <span className="inline-flex items-center gap-1.5">
              <Save className="w-4 h-4" />
              儲存個別比例
            </span>
          </Button>
        )}
      </div>
    </div>
  );
}
