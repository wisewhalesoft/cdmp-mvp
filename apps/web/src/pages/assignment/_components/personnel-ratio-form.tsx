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
  type SetPersonnelRatiosResponse,
} from '@/api/assignment-stage';

/**
 * M03b — 個別業務比例設定表單（F082 / F083）
 *
 * 對應 prototype: /prototypes/29b-personnel-ratio-config.html
 * 對應 spec:      F082 §5.1 / §5.2、F083 §5.2
 *
 * 比例計算模型（baseline + per-emp template，2026-05-21 / 用戶決議重構）：
 *   ration = clamp(baseline[empId] + delta(template[empId]), 0, 100)  // 有 template 之員工
 *          = baseline[empId] × untemplatedScale                       // 無 template 之員工
 *   其中 untemplatedScale = (100 - templatedSum) / untemplatedBaselineSum
 *
 * 設計目的：保證「相同 baseline 員工套同樣 template 必得相同結果」（對稱性）。
 *   - 員工1 baseline=3.7%, 員工2 baseline=3.7%
 *   - 點員工1 +10% → 員工1=13.7%, 員工2=baseline×scale
 *   - 點員工2 +10% → 員工1=13.7%, 員工2=13.7% （同 baseline 同操作，同結果）
 *
 * Baseline 變更時機：
 *   - 首次進入: 用後端回傳 ration；全為 0/null 則用 100/n 均分
 *   - 「均等分配」按鈕: 重設為 100/n 均分，並清除所有 template
 *   - 手動編輯 RatioInput: 該員工 baseline 改為輸入值，並清除其 template
 *   - 父層 refresh: 重置整個 state
 *
 * Template 行為：
 *   - 點 ±N% 按鈕設定該員工 template；點同一按鈕第二次 toggle off
 *   - 不同 ±N% 互相覆蓋（點 +10% 後再點 +20% → 替換為 +20%）
 *   - 部門級模板（applyDeptTemplate）批次設定選定/全體員工 template
 *
 * Imperative API（給「儲存全部」用）：ref.save() → Promise；不可儲存時短路。
 */

export interface PersonnelRatioFormProps {
  listNo: string;
  department: PersonnelRatioDepartment;
  /**
   * 儲存成功後回呼，攜帶後端 PUT response（含 F084 auto-advance 欄位）。
   * 由 page 層依 response 決定 auto-advance toast / redirect / fallback（FLAG-1 批准）。
   */
  onSaved?: (res: SetPersonnelRatiosResponse) => void;
  readOnly?: boolean;
}

export interface PersonnelRatioFormHandle {
  /** 成功時回傳後端 PUT response；不可儲存 / 失敗時回 null。 */
  save: () => Promise<SetPersonnelRatiosResponse | null>;
  isSavable: () => boolean;
}

type TemplateKey = '+10%' | '+20%' | '-10%' | '-20%';

function deltaOf(template: TemplateKey): number {
  return template === '+10%' ? 10 : template === '+20%' ? 20 : template === '-10%' ? -10 : -20;
}

/** 建立初始 baseline map：用後端回傳 ration；全為 0/null 則用 100/n。 */
function buildInitialBaselines(employees: PersonnelRatioEmployee[]): Map<string, number> {
  const map = new Map<string, number>();
  const actives = employees.filter((e) => !e.isResigned);
  const hasAnyRation = actives.some((e) => e.ration != null && (e.ration ?? 0) > 0);
  if (hasAnyRation) {
    for (const e of actives) map.set(e.empId, e.ration ?? 0);
    return map;
  }
  const n = actives.length;
  if (n === 0) return map;
  const base = Math.round((100 / n) * 100) / 100;
  const tail = Math.round((100 - base * (n - 1)) * 100) / 100;
  actives.forEach((e, idx) => {
    map.set(e.empId, idx === n - 1 ? tail : base);
  });
  return map;
}

/**
 * 由 baseline + templates 計算每位在職員工的最終 ration。保證加總 = 100（FP 容忍 ±0.01）。
 */
function computeRations(
  employees: PersonnelRatioEmployee[],
  baselines: Map<string, number>,
  templates: Map<string, TemplateKey>,
): Map<string, number> {
  const result = new Map<string, number>();
  const actives = employees.filter((e) => !e.isResigned);

  // Step 1: templated 員工取 baseline + delta（clamped）
  let templatedSum = 0;
  for (const e of actives) {
    const tpl = templates.get(e.empId);
    if (!tpl) continue;
    const baseline = baselines.get(e.empId) ?? 0;
    const target = Math.max(0, Math.min(100, Math.round((baseline + deltaOf(tpl)) * 100) / 100));
    result.set(e.empId, target);
    templatedSum += target;
  }

  // Step 2: untemplated 員工按 baseline 比例吸收剩餘
  const untemplated = actives.filter((e) => !templates.has(e.empId));
  if (untemplated.length === 0) {
    return result; // 全 templated，sum 可能 ≠ 100（會 fail sumValid check）
  }
  const remaining = Math.max(0, 100 - templatedSum);
  const untemplatedBaselineSum = untemplated.reduce(
    (s, e) => s + (baselines.get(e.empId) ?? 0),
    0,
  );

  let assigned = 0;
  for (let i = 0; i < untemplated.length; i++) {
    const e = untemplated[i];
    const isLast = i === untemplated.length - 1;
    let ration: number;
    if (isLast) {
      // 尾差吸收：保證最後一位讓總和精確 = 100 - templatedSum
      ration = Math.max(0, Math.round((remaining - assigned) * 100) / 100);
    } else if (untemplatedBaselineSum > 0) {
      const baseline = baselines.get(e.empId) ?? 0;
      const scale = remaining / untemplatedBaselineSum;
      ration = Math.max(0, Math.round(baseline * scale * 100) / 100);
    } else {
      // untemplated baseline 全為 0 → 等分剩餘
      ration = Math.max(
        0,
        Math.round((remaining / untemplated.length) * 100) / 100,
      );
    }
    result.set(e.empId, ration);
    if (!isLast) assigned += ration;
  }
  return result;
}

/** 重設為均等分配 baseline。 */
function buildEqualBaselines(employees: PersonnelRatioEmployee[]): Map<string, number> {
  const actives = employees.filter((e) => !e.isResigned);
  const map = new Map<string, number>();
  const n = actives.length;
  if (n === 0) return map;
  const base = Math.round((100 / n) * 100) / 100;
  const tail = Math.round((100 - base * (n - 1)) * 100) / 100;
  actives.forEach((e, idx) => {
    map.set(e.empId, idx === n - 1 ? tail : base);
  });
  return map;
}

export const PersonnelRatioForm = forwardRef<PersonnelRatioFormHandle, PersonnelRatioFormProps>(
  function PersonnelRatioForm({ listNo, department, onSaved, readOnly }, ref) {
    const { showToast } = useToast();

    const [baselines, setBaselines] = useState<Map<string, number>>(() =>
      buildInitialBaselines(department.employees),
    );
    const [templates, setTemplates] = useState<Map<string, TemplateKey>>(new Map());
    const [selectedSet, setSelectedSet] = useState<Set<string>>(new Set());
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [appliedTemplateLabel, setAppliedTemplateLabel] = useState<string | null>(null);

    // 當父層更新 department（例如 refresh 後）時重置 state
    useEffect(() => {
      setBaselines(buildInitialBaselines(department.employees));
      setTemplates(new Map());
      setSelectedSet(new Set());
      setError(null);
      setAppliedTemplateLabel(null);
    }, [department.deptCode, department.employees]);

    // 由 baseline + templates 推導每位員工的最終 ration
    const computedRations = useMemo(
      () => computeRations(department.employees, baselines, templates),
      [department.employees, baselines, templates],
    );

    const rows = useMemo(
      () =>
        department.employees.map((e) => ({
          empId: e.empId,
          empName: e.empName,
          isResigned: e.isResigned,
          ration: e.isResigned ? null : (computedRations.get(e.empId) ?? 0),
          selected: selectedSet.has(e.empId),
        })),
      [department.employees, computedRations, selectedSet],
    );

    const activeRows = useMemo(() => rows.filter((r) => !r.isResigned), [rows]);
    const selectedActive = useMemo(
      () => activeRows.filter((r) => r.selected),
      [activeRows],
    );
    const allSelected = activeRows.length > 0 && selectedActive.length === activeRows.length;
    const values = useMemo(() => activeRows.map((r) => r.ration ?? 0), [activeRows]);
    const sum = useMemo(
      () => Math.round(values.reduce((a, b) => a + b, 0) * 100) / 100,
      [values],
    );
    const sumValid = Math.abs(sum - 100) <= 0.01;
    const diff = sum - 100;

    const canEdit = !readOnly && department.isInScope && !department.allResigned;

    /** 手動編輯 RatioInput：更新該員工 baseline，清除其 template；其他員工按比例吸收。 */
    const updateRation = (empId: string, ration: number) => {
      setBaselines((prev) => {
        const next = new Map(prev);
        next.set(empId, ration);
        return next;
      });
      setTemplates((prev) => {
        if (!prev.has(empId)) return prev;
        const next = new Map(prev);
        next.delete(empId);
        return next;
      });
      setAppliedTemplateLabel(null);
    };

    const toggleSelect = (empId: string, checked: boolean) => {
      setSelectedSet((prev) => {
        const next = new Set(prev);
        if (checked) next.add(empId);
        else next.delete(empId);
        return next;
      });
    };

    const toggleSelectAll = (checked: boolean) => {
      setSelectedSet(() => {
        if (!checked) return new Set();
        return new Set(activeRows.map((r) => r.empId));
      });
    };

    /**
     * F083 per-row 模板：以該員工 baseline + delta 為 target。
     *
     * 對稱性保證：相同 baseline 員工套相同 template 得相同 ration。
     * Toggle 行為：點同一按鈕第二次取消該員工 template；點不同 ±N% 互相替換。
     */
    const applyTemplateOne = (targetEmpId: string, template: TemplateKey) => {
      if (activeRows.length < 2) {
        showToast('部門僅 1 位在職員工，無法套用模板', 'warning');
        return;
      }
      const baseline = baselines.get(targetEmpId) ?? 0;
      const targetWouldBe = Math.max(0, Math.min(100, baseline + deltaOf(template)));
      if (targetWouldBe < 0 || targetWouldBe > 100) {
        showToast(`套用 ${template} 後比例越界（baseline ${baseline}%）`, 'warning');
        return;
      }

      setTemplates((prev) => {
        const next = new Map(prev);
        const current = next.get(targetEmpId);
        if (current === template) {
          // 同按鈕第二次 → toggle off
          next.delete(targetEmpId);
        } else {
          // 不同按鈕 → 替換
          next.set(targetEmpId, template);
        }
        return next;
      });

      const target = activeRows.find((r) => r.empId === targetEmpId);
      const isToggleOff = templates.get(targetEmpId) === template;
      if (isToggleOff) {
        setAppliedTemplateLabel(`已取消 ${target?.empName ?? ''} 之 ${template} 模板`);
      } else {
        setAppliedTemplateLabel(
          `${template} / ${target?.empName ?? ''}（baseline ${baseline.toFixed(2)}%）`,
        );
      }
    };

    /**
     * 部門級「均等分配」：重置 baseline = 100/n，清除所有 template。
     * 保證 sum = 100.00 exact。
     */
    const applyEqual = () => {
      const n = activeRows.length;
      if (n === 0) return;
      setBaselines(buildEqualBaselines(department.employees));
      setTemplates(new Map());
      setAppliedTemplateLabel(`均等分配（${n} 人各 ${(Math.round((100 / n) * 100) / 100).toFixed(2)}%）`);
    };

    /** 部門級 ±N%：批次設定選定（或全體）員工 template。 */
    const applyDeptTemplate = (template: TemplateKey) => {
      const n = activeRows.length;
      if (n === 0) return;
      const targets = selectedActive.length > 0 ? selectedActive : activeRows;
      if (targets.length === n) {
        showToast(
          `套用 ${template} 至全體會使加總 ≠ 100%；請先勾選部分員工，或用「均等分配」`,
          'warning',
        );
        return;
      }
      // 確認每個 target baseline + delta 都在 [0,100]
      for (const t of targets) {
        const baseline = baselines.get(t.empId) ?? 0;
        const wouldBe = baseline + deltaOf(template);
        if (wouldBe < 0 || wouldBe > 100) {
          showToast(
            `${t.empName} 套用 ${template} 後越界（baseline ${baseline}%），無法套用`,
            'warning',
          );
          return;
        }
      }
      setTemplates((prev) => {
        const next = new Map(prev);
        for (const t of targets) next.set(t.empId, template);
        return next;
      });
      const scopeLabel =
        targets.length === activeRows.length ? '全體在職' : `${targets.length} 位選定`;
      setAppliedTemplateLabel(`${template} / ${scopeLabel}`);
    };

    /** 從 templates 推導 AppliedTemplate（F083 後端二次校驗用；僅單一員工模板生效）。 */
    const appliedTemplate: AppliedTemplate | null = useMemo(() => {
      if (templates.size !== 1) return null;
      const [empId, tpl] = templates.entries().next().value as [string, TemplateKey];
      return { template: tpl, targetEmpId: empId };
    }, [templates]);

    const handleSave = useCallback(async (): Promise<SetPersonnelRatiosResponse | null> => {
      setError(null);
      if (department.allResigned) {
        setError('本部門全員離職，無法儲存個別比例（後端會短路放行階段推進）');
        return null;
      }
      if (activeRows.length > 0 && !sumValid) {
        setError(`加總須為 100%，目前為 ${sum.toFixed(2)}%`);
        return null;
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
        const res = await setPersonnelRatios(listNo, payload);
        // 既有 per-dept「已儲存」toast 保留（對齊 prototype saveDept；§7.1 部分完成行為）；
        // auto-advance toast / redirect 由 page 依 res 統一處理（FLAG-1）。
        showToast(
          `${department.deptCode} ${department.deptName} 已儲存（${activeRows.length} 人 / 加總 ${sum}%）`,
          'success',
        );
        onSaved?.(res);
        return res;
      } catch (err: unknown) {
        const e = err as { response?: { status?: number; data?: { message?: string } } };
        const msg = e?.response?.data?.message ?? '儲存失敗，請稍後再試';
        setError(msg);
        showToast(msg, 'error');
        return null;
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
                {rows.map((r) => {
                  const rowTemplate = templates.get(r.empId);
                  return (
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
                            {(['+20%', '+10%', '-10%', '-20%'] as const).map((tpl) => {
                              const active = rowTemplate === tpl;
                              const cls = tpl.startsWith('+')
                                ? active
                                  ? 'border-green-500 bg-green-100 text-green-800'
                                  : 'border-green-300 text-green-700 hover:bg-green-50'
                                : active
                                ? 'border-red-500 bg-red-100 text-red-800'
                                : 'border-red-300 text-red-600 hover:bg-red-50';
                              return (
                                <button
                                  key={tpl}
                                  type="button"
                                  data-testid={`tpl-${tpl}-${r.empId}`}
                                  data-active={active}
                                  onClick={() => applyTemplateOne(r.empId, tpl)}
                                  className={`px-1.5 py-0.5 text-[10px] font-mono border rounded ${cls}`}
                                  title={
                                    active
                                      ? `已套用 ${tpl}；點擊取消`
                                      : `以該員工 baseline 為基底套 ${tpl}`
                                  }
                                >
                                  {tpl}
                                </button>
                              );
                            })}
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
                  );
                })}
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
                  {templates.size > 0 && ` / ${templates.size} 位套模板`}
                </span>
              </div>
              {appliedTemplateLabel && (
                <span
                  data-testid={`tpl-chip-${department.deptCode}`}
                  className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-purple-100 text-purple-700"
                >
                  <Zap className="w-2.5 h-2.5" />
                  {appliedTemplateLabel}
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
