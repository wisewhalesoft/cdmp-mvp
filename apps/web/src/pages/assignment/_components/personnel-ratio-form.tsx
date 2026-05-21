import { useState, useMemo, useEffect } from 'react';
import { Save, Users, UserX } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { RatioInput, RatioSumIndicator } from '@/components/e07/RatioInput';
import { useToast } from '@/components/ui/toast';
import {
  setPersonnelRatios,
  type AppliedTemplate,
  type PersonnelRatioDepartment,
  type PersonnelRatioEmployee,
} from '@/api/assignment-stage';

/**
 * M03b — 個別業務比例設定表單（F082 / F083）
 *
 * 對應 prototype: /prototypes/29b-personnel-ratio-config.html
 * 對應 spec:      F082 §5.1 / §5.2、F083 §5.2
 *
 * 範圍：
 *   - 員工列由 props.department 提供（後端 ob_emphire 全取 + service 計算 isResigned）；
 *     使用者僅能改在職員工的 ration，不能新增/刪除員工列、不能改 empId/empName。
 *   - 離職員工列出但 disabled 並顯示「已離職」徽章；不參與加總分母。
 *   - 加總（僅含在職員工）= 100，容忍 ±0.01。
 *   - 全員離職分支：sum 自然為 0，UI 顯示「全員離職」banner，無法儲存。
 *   - F083 模板（±10% / ±20%）：對目標員工套 delta，其他人按比例吸收。
 *   - 提交 PUT /assignment/ratios/personnel/:listNo（覆寫該部門紀錄）。
 *
 * RBAC: DirectorOrSectionChief；處長轄區由後端 isInScope 過濾。
 */

export interface PersonnelRatioFormProps {
  listNo: string;
  /** 該部門完整資料（含員工列、配額、狀態旗標）；由父層從 getPersonnelRatios 取得後傳入。 */
  department: PersonnelRatioDepartment;
  /** 完成寫入後通知父層（用於 refresh）。 */
  onSaved?: () => void;
  /** 唯讀（stage !== 'personnel_ratio' 時鎖定，或處長視角且 isInScope=false）。 */
  readOnly?: boolean;
}

interface EditableRow {
  empId: string;
  empName: string;
  isResigned: boolean;
  /** 在職員工的當前編輯值（離職員工恆為 null）。 */
  ration: number | null;
}

function toEditableRows(employees: PersonnelRatioEmployee[]): EditableRow[] {
  return employees.map((e) => ({
    empId: e.empId,
    empName: e.empName,
    isResigned: e.isResigned,
    ration: e.isResigned ? null : (e.ration ?? 0),
  }));
}

export function PersonnelRatioForm({
  listNo,
  department,
  onSaved,
  readOnly,
}: PersonnelRatioFormProps) {
  const { showToast } = useToast();

  const [rows, setRows] = useState<EditableRow[]>(() => toEditableRows(department.employees));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [appliedTemplate, setAppliedTemplate] = useState<AppliedTemplate | null>(null);

  // 當父層更新 department（例如 refresh 後）時，重置編輯狀態
  useEffect(() => {
    setRows(toEditableRows(department.employees));
    setAppliedTemplate(null);
    setError(null);
  }, [department.deptCode, department.employees]);

  const activeRows = useMemo(() => rows.filter((r) => !r.isResigned), [rows]);
  const values = useMemo(
    () => activeRows.map((r) => r.ration ?? 0),
    [activeRows],
  );
  const sum = useMemo(
    () => Math.round(values.reduce((a, b) => a + b, 0) * 100) / 100,
    [values],
  );
  const sumValid = Math.abs(sum - 100) <= 0.01;

  const updateRation = (empId: string, ration: number) => {
    setRows((prev) =>
      prev.map((r) => (r.empId === empId && !r.isResigned ? { ...r, ration } : r)),
    );
    setAppliedTemplate(null);
  };

  // F083 模板套用：對目標員工套 +10/+20/-10/-20%，其他在職成員按比例平均吸收差額
  const applyTemplate = (
    targetEmpId: string,
    template: '+10%' | '+20%' | '-10%' | '-20%',
  ) => {
    if (activeRows.length < 2) return;
    const target = activeRows.find((r) => r.empId === targetEmpId);
    if (!target) return;
    const targetCurrent = target.ration ?? 0;
    const delta = template === '+10%' ? 10 : template === '+20%' ? 20 : template === '-10%' ? -10 : -20;
    const targetNew = Math.max(
      0,
      Math.min(100, Math.round((targetCurrent + delta) * 100) / 100),
    );
    const realDelta = targetNew - targetCurrent;
    const others = activeRows.filter((r) => r.empId !== targetEmpId);
    const otherSum = others.reduce((a, b) => a + (b.ration ?? 0), 0);
    if (otherSum === 0) return;
    setRows((prev) =>
      prev.map((r) => {
        if (r.isResigned) return r;
        if (r.empId === targetEmpId) return { ...r, ration: targetNew };
        const v = r.ration ?? 0;
        const adjust = (realDelta * v) / otherSum;
        const newR = Math.max(0, Math.round((v - adjust) * 100) / 100);
        return { ...r, ration: newR };
      }),
    );
    setAppliedTemplate({ template, targetEmpId });
  };

  const handleSave = async () => {
    setError(null);
    if (department.allResigned) {
      setError('本部門全員離職，無法儲存個別比例（後端會短路放行階段推進）');
      return;
    }
    if (activeRows.length > 0 && !sumValid) {
      setError(`加總須為 100%，目前為 ${sum.toFixed(2)}%`);
      return;
    }
    setSaving(true);
    try {
      const payload = {
        deptCode: department.deptCode,
        deptName: department.deptName,
        employees: activeRows.map((r) => ({
          empId: r.empId,
          empName: r.empName,
          ration: Number(r.ration ?? 0),
        })),
        ...(appliedTemplate ? { appliedTemplate } : {}),
      };
      await setPersonnelRatios(listNo, payload);
      showToast(
        `部門 ${department.deptCode} 個別比例已儲存（${activeRows.length} 人 / 加總 ${sum}%）`,
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

  const canEdit = !readOnly && department.isInScope && !department.allResigned;

  return (
    <div
      className="space-y-3"
      data-testid={`personnel-ratio-form-${department.deptCode}`}
    >
      <div className="flex items-start justify-between flex-wrap gap-2">
        <div className="flex flex-col gap-0.5">
          <div className="flex items-center gap-2">
            <Users className="w-4 h-4 text-cyan-800" />
            <span className="text-sm text-gray-700">
              本部門配額：
              <strong className="font-mono text-gray-900">
                {department.deptRatio == null ? '—' : `${department.deptRatio}%`}
              </strong>
            </span>
            <span className="text-xs text-gray-500">
              · 在職 <strong>{department.activeCount}</strong> 人
            </span>
            {!department.isInScope && (
              <span className="text-[10px] text-purple-700 px-1.5 py-0.5 bg-purple-50 border border-purple-200 rounded">
                轄區外
              </span>
            )}
          </div>
          <p className="text-[11px] text-gray-400 ml-6">
            員工清單來源：<code className="font-mono">ob_emphire</code>（離職員工不計入分母）
          </p>
        </div>
        {!department.allResigned && activeRows.length > 0 && (
          <RatioSumIndicator values={values} />
        )}
      </div>

      {department.allResigned && (
        <div
          data-testid={`dept-all-resigned-${department.deptCode}`}
          className="rounded-md p-3 bg-amber-50 border border-amber-200 text-xs text-amber-900 flex items-start gap-2"
        >
          <UserX className="w-4 h-4 shrink-0 mt-0.5" />
          <div>
            <p className="font-semibold">本部門全員離職</p>
            <p className="mt-0.5 text-amber-800">
              無在職員工可分配比例；推進階段時後端會短路放行此部門（spec F082 v1.3 決議 #1）
            </p>
          </div>
        </div>
      )}

      {error && (
        <div
          data-testid={`personnel-ratio-error-${department.deptCode}`}
          className="rounded-md p-3 bg-red-50 border border-red-200 text-xs text-red-800"
        >
          {error}
        </div>
      )}

      {rows.length === 0 ? (
        <div className="rounded-lg border border-dashed border-gray-200 p-6 flex flex-col items-center text-center">
          <Users className="w-6 h-6 text-gray-400 mb-2" />
          <p className="text-xs text-gray-500">此部門 ob_emphire 無員工紀錄</p>
        </div>
      ) : (
        <table className="w-full text-sm">
          <thead>
            <tr className="text-xs text-gray-500 uppercase border-b border-gray-200">
              <th className="text-left py-2 font-medium w-[15%]">員工編號</th>
              <th className="text-left py-2 font-medium w-[20%]">姓名</th>
              <th className="text-left py-2 font-medium w-[10%]">狀態</th>
              <th className="text-right py-2 font-medium w-[20%]">比例</th>
              <th className="text-center py-2 font-medium w-[35%]">模板（F083）</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr
                key={r.empId}
                data-testid={`empl-row-${r.empId}`}
                className={`border-b border-gray-100 ${r.isResigned ? 'bg-gray-50/60 text-gray-500' : ''}`}
              >
                <td className="py-2 pr-2 font-mono text-xs">{r.empId}</td>
                <td className="py-2 pr-2 text-sm">{r.empName}</td>
                <td className="py-2 pr-2">
                  {r.isResigned ? (
                    <span
                      data-testid={`empl-resigned-badge-${r.empId}`}
                      className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium bg-gray-200 text-gray-600"
                    >
                      <UserX className="w-2.5 h-2.5" />已離職
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium bg-green-50 text-green-700 border border-green-200">
                      在職
                    </span>
                  )}
                </td>
                <td className="py-2 pr-2 text-right">
                  {r.isResigned ? (
                    <span className="text-xs text-gray-400 font-mono">—</span>
                  ) : (
                    <RatioInput
                      value={r.ration ?? 0}
                      disabled={!canEdit}
                      onChange={(v) => updateRation(r.empId, v)}
                      aria-label={`empl-ratio-${r.empId}`}
                    />
                  )}
                </td>
                <td className="py-2 text-center">
                  {canEdit && !r.isResigned && activeRows.length >= 2 && (
                    <div className="inline-flex items-center gap-1">
                      {(['-20%', '-10%', '+10%', '+20%'] as const).map((tpl) => (
                        <button
                          key={tpl}
                          type="button"
                          data-testid={`tpl-${tpl}-${r.empId}`}
                          onClick={() => applyTemplate(r.empId, tpl)}
                          className="px-1.5 py-0.5 text-[10px] font-mono border border-gray-200 rounded text-gray-600 hover:bg-gray-50"
                        >
                          {tpl}
                        </button>
                      ))}
                    </div>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {canEdit && activeRows.length > 0 && (
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
              儲存本部門
            </span>
          </Button>
        </div>
      )}
    </div>
  );
}
