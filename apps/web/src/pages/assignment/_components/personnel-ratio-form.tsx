import {
  forwardRef,
  useImperativeHandle,
  useState,
  useMemo,
  useEffect,
  useCallback,
} from 'react';
import {
  Save,
  Users,
  UserX,
  CheckCircle,
  AlertCircle,
  LayoutGrid,
  Zap,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { RatioInput } from '@/components/e07/RatioInput';
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
 *   - 員工列由 props.department 提供（後端 ob_emphire 全取 + service 計算 isResigned）。
 *   - 表格 7 欄：checkbox / 員工 ID / 姓名 / 狀態 / 比例 / 獎懲快速調整 / 分配占比。
 *   - Per-dept Sum Banner：加總狀態 + appliedTemplate chip + 5 個部門模板按鈕
 *     （均等分配 + ±20% + ±10%）+ 「儲存本部門」按鈕。
 *   - 部門模板可「套用至選定員工」（有勾選）或「全體在職」（無勾選）。
 *   - F083 模板二次校驗在後端；前端送 appliedTemplate hint。
 *   - 全員離職分支：無在職員工 → 顯示 banner、無法套用 / 儲存。
 *
 * Imperative API（給「儲存全部」用）：ref.save() → Promise；不可儲存時短路。
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

export interface PersonnelRatioFormHandle {
  save: () => Promise<boolean>;
  isSavable: () => boolean;
}

interface EditableRow {
  empId: string;
  empName: string;
  isResigned: boolean;
  ration: number | null;
  selected: boolean;
}

function toEditableRows(employees: PersonnelRatioEmployee[]): EditableRow[] {
  return employees.map((e) => ({
    empId: e.empId,
    empName: e.empName,
    isResigned: e.isResigned,
    ration: e.isResigned ? null : (e.ration ?? 0),
    selected: false,
  }));
}

export const PersonnelRatioForm = forwardRef<PersonnelRatioFormHandle, PersonnelRatioFormProps>(
  function PersonnelRatioForm({ listNo, department, onSaved, readOnly }, ref) {
    const { showToast } = useToast();

    const [rows, setRows] = useState<EditableRow[]>(() => toEditableRows(department.employees));
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [appliedTemplate, setAppliedTemplate] = useState<AppliedTemplate | null>(null);
    const [appliedTemplateLabel, setAppliedTemplateLabel] = useState<string | null>(null);

    // 當父層更新 department（例如 refresh 後）時，重置編輯狀態
    useEffect(() => {
      setRows(toEditableRows(department.employees));
      setAppliedTemplate(null);
      setAppliedTemplateLabel(null);
      setError(null);
    }, [department.deptCode, department.employees]);

    const activeRows = useMemo(() => rows.filter((r) => !r.isResigned), [rows]);
    const selectedActive = useMemo(
      () => activeRows.filter((r) => r.selected),
      [activeRows],
    );
    const allSelected = activeRows.length > 0 && selectedActive.length === activeRows.length;
    const values = useMemo(
      () => activeRows.map((r) => r.ration ?? 0),
      [activeRows],
    );
    const sum = useMemo(
      () => Math.round(values.reduce((a, b) => a + b, 0) * 100) / 100,
      [values],
    );
    const sumValid = Math.abs(sum - 100) <= 0.01;
    const diff = sum - 100;

    const canEdit = !readOnly && department.isInScope && !department.allResigned;

    const updateRation = (empId: string, ration: number) => {
      setRows((prev) =>
        prev.map((r) => (r.empId === empId && !r.isResigned ? { ...r, ration } : r)),
      );
      setAppliedTemplate(null);
      setAppliedTemplateLabel(null);
    };

    const toggleSelect = (empId: string, checked: boolean) =>
      setRows((prev) =>
        prev.map((r) => (r.empId === empId && !r.isResigned ? { ...r, selected: checked } : r)),
      );

    const toggleSelectAll = (checked: boolean) =>
      setRows((prev) =>
        prev.map((r) => (!r.isResigned ? { ...r, selected: checked } : r)),
      );

    /** F083 模板：對單一員工套 ±N%，其他在職成員按比例吸收差額。 */
    const applyTemplateOne = (
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
      setAppliedTemplateLabel(`${template} / ${target.empName}`);
    };

    /** 部門級「均等分配」：所有在職員工 100/n，尾差由最後一位吸收。 */
    const applyEqual = () => {
      const n = activeRows.length;
      if (n === 0) return;
      const each = Math.round((100 / n) * 100) / 100;
      let assigned = 0;
      const newRows = rows.map((r) => {
        if (r.isResigned) return r;
        assigned += each;
        return { ...r, ration: each };
      });
      // 尾差吸收到最後一位在職員工
      const diffTail = Math.round((100 - assigned) * 100) / 100;
      if (Math.abs(diffTail) > 0.001) {
        let lastFound = false;
        for (let i = newRows.length - 1; i >= 0; i--) {
          if (!newRows[i].isResigned) {
            newRows[i] = {
              ...newRows[i],
              ration: Math.round(((newRows[i].ration ?? 0) + diffTail) * 100) / 100,
            };
            lastFound = true;
            break;
          }
        }
        void lastFound;
      }
      setRows(newRows);
      setAppliedTemplate(null);
      setAppliedTemplateLabel('均等分配');
    };

    /** 部門級 ±N%：套用至「選定員工」或「全體在職」(無勾選時)。 */
    const applyDeptTemplate = (template: '+10%' | '+20%' | '-10%' | '-20%') => {
      const n = activeRows.length;
      if (n === 0) return;
      const selected = selectedActive.length > 0 ? selectedActive : activeRows;
      const delta = template === '+10%' ? 10 : template === '+20%' ? 20 : template === '-10%' ? -10 : -20;
      const base = 100 / n;
      const newR = Math.round(base * (1 + delta / 100) * 100) / 100;
      if (newR < 0 || newR > 100) {
        showToast(`套用 ${template} 後比例 ${newR}% 越界，無法套用`, 'warning');
        return;
      }
      if (selected.length === n) {
        // 全體都調 → 加總不可能 = 100，警示
        showToast(
          `套用 ${template} 至全體會使加總 ≠ 100%；請先勾選部分員工，或用「均等分配」`,
          'warning',
        );
        return;
      }
      const restCount = n - selected.length;
      const restEach = Math.round(((100 - newR * selected.length) / restCount) * 100) / 100;
      if (restEach < 0 || restEach > 100) {
        showToast(`套用後其餘員工比例 ${restEach}% 越界，無法套用`, 'warning');
        return;
      }
      const selectedIds = new Set(selected.map((s) => s.empId));
      const newRows = rows.map((r) => {
        if (r.isResigned) return r;
        return { ...r, ration: selectedIds.has(r.empId) ? newR : restEach };
      });
      // 尾差吸收（非選定員工的最後一位）
      let actualSum = 0;
      for (const r of newRows) if (!r.isResigned) actualSum += r.ration ?? 0;
      const diffTail = Math.round((100 - actualSum) * 100) / 100;
      if (Math.abs(diffTail) > 0.001) {
        for (let i = newRows.length - 1; i >= 0; i--) {
          if (!newRows[i].isResigned && !selectedIds.has(newRows[i].empId)) {
            newRows[i] = {
              ...newRows[i],
              ration: Math.round(((newRows[i].ration ?? 0) + diffTail) * 100) / 100,
            };
            break;
          }
        }
      }
      setRows(newRows);
      // 標 appliedTemplate hint：取選定員工的第一位作為 targetEmpId
      // （後端二次校驗 F083 只支援單員工模板，部門級套用後不傳 appliedTemplate）
      setAppliedTemplate(null);
      const scopeLabel =
        selected.length === activeRows.length ? '全體在職' : `${selected.length} 位選定`;
      setAppliedTemplateLabel(`${template} / ${scopeLabel}`);
    };

    const handleSave = useCallback(async (): Promise<boolean> => {
      setError(null);
      if (department.allResigned) {
        setError('本部門全員離職，無法儲存個別比例（後端會短路放行階段推進）');
        return false;
      }
      if (activeRows.length > 0 && !sumValid) {
        setError(`加總須為 100%，目前為 ${sum.toFixed(2)}%`);
        return false;
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
          `${department.deptCode} ${department.deptName} 已儲存（${activeRows.length} 人 / 加總 ${sum}%）`,
          'success',
        );
        onSaved?.();
        return true;
      } catch (err: unknown) {
        const e = err as { response?: { status?: number; data?: { message?: string } } };
        const msg = e?.response?.data?.message ?? '儲存失敗，請稍後再試';
        setError(msg);
        showToast(msg, 'error');
        return false;
      } finally {
        setSaving(false);
      }
    }, [
      activeRows,
      appliedTemplate,
      department.allResigned,
      department.deptCode,
      department.deptName,
      listNo,
      onSaved,
      showToast,
      sum,
      sumValid,
    ]);

    // 暴露 imperative API 給「儲存全部」用
    useImperativeHandle(
      ref,
      () => ({
        save: handleSave,
        isSavable: () => canEdit && activeRows.length > 0 && sumValid,
      }),
      [handleSave, canEdit, activeRows.length, sumValid],
    );

    const allocPctFor = (ration: number | null): string => {
      if (ration == null || department.deptRatio == null) return '—';
      const pct = (department.deptRatio * ration) / 100;
      return `${pct.toFixed(2)}%`;
    };

    const tplScopeLabel = selectedActive.length > 0 ? '選定員工' : '全體在職';

    return (
      <div
        className="space-y-3"
        data-testid={`personnel-ratio-form-${department.deptCode}`}
      >
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

        {!department.isInScope && (
          <div
            data-testid={`dept-out-of-scope-${department.deptCode}`}
            className="rounded-md p-3 bg-purple-50 border border-purple-200 text-xs text-purple-900"
          >
            此部門不在您的轄區內，僅可檢視。
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
          <div className="rounded-lg border border-gray-200 overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50/40 text-xs text-gray-500 uppercase tracking-wider border-b border-gray-200">
                  <th className="text-center px-3 py-2 font-medium" style={{ width: '5%' }}>
                    {canEdit && activeRows.length > 0 && (
                      <input
                        type="checkbox"
                        data-testid={`empl-select-all-${department.deptCode}`}
                        checked={allSelected}
                        onChange={(e) => toggleSelectAll(e.target.checked)}
                        className="w-3.5 h-3.5 rounded border-gray-300"
                      />
                    )}
                  </th>
                  <th className="text-left px-3 py-2 font-medium" style={{ width: '14%' }}>員工 ID</th>
                  <th className="text-left px-3 py-2 font-medium" style={{ width: '18%' }}>姓名</th>
                  <th className="text-left px-3 py-2 font-medium" style={{ width: '12%' }}>狀態</th>
                  <th className="text-right px-3 py-2 font-medium" style={{ width: '18%' }}>比例 (%)</th>
                  <th className="text-center px-3 py-2 font-medium" style={{ width: '23%' }}>獎懲快速調整</th>
                  <th className="text-right px-3 py-2 font-medium" style={{ width: '10%' }}>分配占比</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {rows.map((r) => (
                  <tr
                    key={r.empId}
                    data-testid={`empl-row-${r.empId}`}
                    className={
                      r.isResigned
                        ? 'bg-gray-50/60 text-gray-500'
                        : r.selected
                        ? 'bg-blue-50/40'
                        : ''
                    }
                  >
                    <td className="px-3 py-2 text-center">
                      {canEdit && !r.isResigned ? (
                        <input
                          type="checkbox"
                          data-testid={`empl-select-${r.empId}`}
                          checked={r.selected}
                          onChange={(e) => toggleSelect(r.empId, e.target.checked)}
                          className="w-3.5 h-3.5 rounded border-gray-300"
                        />
                      ) : null}
                    </td>
                    <td className="px-3 py-2 font-mono text-xs">{r.empId}</td>
                    <td className="px-3 py-2 text-sm">{r.empName}</td>
                    <td className="px-3 py-2">
                      {r.isResigned ? (
                        <span
                          data-testid={`empl-resigned-badge-${r.empId}`}
                          className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium bg-red-50 text-red-700 border border-red-200"
                        >
                          <UserX className="w-2.5 h-2.5" />已離職
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium bg-green-50 text-green-700 border border-green-200">
                          在職
                        </span>
                      )}
                    </td>
                    <td className="px-3 py-2 text-right">
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
                    <td className="px-3 py-2 text-center">
                      {canEdit && !r.isResigned && activeRows.length >= 2 ? (
                        <div className="inline-flex items-center gap-1">
                          {(['+20%', '+10%', '-10%', '-20%'] as const).map((tpl) => (
                            <button
                              key={tpl}
                              type="button"
                              data-testid={`tpl-${tpl}-${r.empId}`}
                              onClick={() => applyTemplateOne(r.empId, tpl)}
                              className={`px-1.5 py-0.5 text-[10px] font-mono border rounded hover:bg-gray-50 ${
                                tpl.startsWith('+')
                                  ? 'border-green-300 text-green-700 hover:bg-green-50'
                                  : 'border-red-300 text-red-600 hover:bg-red-50'
                              }`}
                            >
                              {tpl}
                            </button>
                          ))}
                        </div>
                      ) : (
                        <span className="text-xs text-gray-300">—</span>
                      )}
                    </td>
                    <td
                      className="px-3 py-2 text-right text-xs text-gray-500 tabular-nums"
                      data-testid={`empl-alloc-pct-${r.empId}`}
                    >
                      {allocPctFor(r.ration)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* ===== Per-dept Sum Banner + 部門模板 + 儲存按鈕 ===== */}
        {!department.allResigned && activeRows.length > 0 && (
          <div
            data-testid={`personnel-sum-banner-${department.deptCode}`}
            data-valid={sumValid ? 'true' : 'false'}
            className={`mt-3 rounded-lg border-2 p-3 flex items-center justify-between gap-3 flex-wrap ${
              sumValid
                ? 'bg-green-50 border-green-300 text-green-800'
                : 'bg-red-50 border-red-300 text-red-700'
            }`}
          >
            <div className="flex items-center gap-2 flex-1 min-w-0">
              {sumValid ? <CheckCircle className="w-4 h-4 shrink-0" /> : <AlertCircle className="w-4 h-4 shrink-0" />}
              <div className="text-sm">
                <span className="font-semibold">部門加總：{sum.toFixed(2)}%</span>
                <span className="ml-1">
                  {sumValid
                    ? '✓'
                    : diff > 0
                    ? `超 ${diff.toFixed(2)}%`
                    : `差 ${(-diff).toFixed(2)}%`}
                </span>
                <span className="text-xs opacity-70 ml-2">
                  在職 {activeRows.length} 人
                  {rows.filter((r) => r.isResigned).length > 0 &&
                    ` / 離職 ${rows.filter((r) => r.isResigned).length} 人不計`}
                </span>
              </div>
              {appliedTemplateLabel && (
                <span
                  data-testid={`tpl-chip-${department.deptCode}`}
                  className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-purple-100 text-purple-700"
                >
                  <Zap className="w-2.5 h-2.5" />
                  目前套用：{appliedTemplateLabel}
                </span>
              )}
            </div>
            {canEdit && (
              <div className="flex items-center gap-1.5 flex-wrap justify-end">
                <span className="text-[10px] text-gray-600">
                  套用至 <strong>{tplScopeLabel}</strong>：
                </span>
                <button
                  type="button"
                  data-testid={`dept-tpl-equal-${department.deptCode}`}
                  onClick={applyEqual}
                  className="px-2.5 py-1 text-xs border border-purple-300 text-purple-700 rounded hover:bg-purple-50 inline-flex items-center gap-1"
                >
                  <LayoutGrid className="w-3 h-3" />均等分配
                </button>
                {(['+20%', '+10%', '-10%', '-20%'] as const).map((tpl) => (
                  <button
                    key={tpl}
                    type="button"
                    data-testid={`dept-tpl-${tpl}-${department.deptCode}`}
                    onClick={() => applyDeptTemplate(tpl)}
                    className={`px-2 py-1 text-xs border rounded hover:bg-gray-50 ${
                      tpl.startsWith('+')
                        ? 'border-green-300 text-green-700 hover:bg-green-50'
                        : 'border-red-300 text-red-600 hover:bg-red-50'
                    }`}
                  >
                    {tpl}
                  </button>
                ))}
                <Button
                  type="button"
                  variant="primary"
                  data-testid={`btn-save-dept-${department.deptCode}`}
                  loading={saving}
                  loadingText="儲存中..."
                  disabled={!sumValid}
                  onClick={handleSave}
                  className="ml-1"
                >
                  <span className="inline-flex items-center gap-1.5">
                    <Save className="w-3 h-3" />儲存本部門
                  </span>
                </Button>
              </div>
            )}
          </div>
        )}
      </div>
    );
  },
);
