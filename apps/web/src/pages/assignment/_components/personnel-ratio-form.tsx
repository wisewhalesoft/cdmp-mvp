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
  Copy,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { RatioInput } from '@/components/e07/RatioInput';
import { useToast } from '@/components/ui/toast';
import {
  setPersonnelRatios,
  getPersonnelRatioCopySources,
  type PersonnelRatioDepartment,
  type PersonnelRatioEmployee,
  type PersonnelRatioCopySource,
  type SetPersonnelRatiosResponse,
} from '@/api/assignment-stage';
import { CopyDeptRatioModal } from './copy-dept-ratio-modal';

/**
 * M03b — 個別業務比例設定表單（F082 / F083）
 *
 * 對應 prototype: /prototypes/29b-personnel-ratio-config.html
 * 對應 spec:      F082 §5.1 / §5.2、F083 §5.2
 *
 * 比例模型（2026-07 / 用戶決議：直接編輯、不連動）：
 *   - 每位在職員工各自持有一個可直接編輯的比例值（rations map）。
 *   - 調整某一員工（手動輸入 / 獎懲 ±N% / 複製）「只改該員工」，不自動連動其他人。
 *   - 加總是否 = 100% 僅於「儲存」時檢查（sum banner 即時提示、儲存鈕於未達 100% 時 disabled）。
 *   - 「均等分配」為明確的批次操作（一次把全體設為 100/n），非由單一編輯連動而來。
 *   - 「±N%」快速調整：對指定 / 選定員工「加減 N%」（clamp 0~100），不改動其他人。
 *
 * 離職員工不列入分母、不可設定；全員離職部門由後端短路放行（v1.3 決議 #1）。
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

/** 獎懲快速調整之增減量（%）。 */
const TEMPLATE_DELTAS = [
  { label: '+20%', delta: 20 },
  { label: '+10%', delta: 10 },
  { label: '-10%', delta: -10 },
  { label: '-20%', delta: -20 },
] as const;

/** 將比例值夾在 [0,100] 並保留雙小數精度。 */
function clampRatio(v: number): number {
  return Math.max(0, Math.min(100, Math.round(v * 100) / 100));
}

/** 均等分配：全體在職各 100/n（最後一位吸收尾差以求加總精確 = 100）。 */
function equalSplit(employees: PersonnelRatioEmployee[]): Map<string, number> {
  const map = new Map<string, number>();
  const actives = employees.filter((e) => !e.isResigned);
  const n = actives.length;
  if (n === 0) return map;
  const base = Math.round((100 / n) * 100) / 100;
  const tail = Math.round((100 - base * (n - 1)) * 100) / 100;
  actives.forEach((e, idx) => {
    map.set(e.empId, idx === n - 1 ? tail : base);
  });
  return map;
}

/** 建立初始比例：有後端既有值（任一 > 0）則直接沿用；否則均等分配。 */
function buildInitialRations(employees: PersonnelRatioEmployee[]): Map<string, number> {
  const actives = employees.filter((e) => !e.isResigned);
  const hasAnyRation = actives.some((e) => e.ration != null && (e.ration ?? 0) > 0);
  if (hasAnyRation) {
    const map = new Map<string, number>();
    for (const e of actives) map.set(e.empId, e.ration ?? 0);
    return map;
  }
  return equalSplit(employees);
}

export const PersonnelRatioForm = forwardRef<PersonnelRatioFormHandle, PersonnelRatioFormProps>(
  function PersonnelRatioForm({ listNo, department, onSaved, readOnly }, ref) {
    const { showToast } = useToast();

    const [rations, setRations] = useState<Map<string, number>>(() =>
      buildInitialRations(department.employees),
    );
    const [selectedSet, setSelectedSet] = useState<Set<string>>(new Set());
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [appliedTemplateLabel, setAppliedTemplateLabel] = useState<string | null>(null);

    // 「從本月其他名單複製」modal 狀態
    const [copyOpen, setCopyOpen] = useState(false);
    const [copyLoading, setCopyLoading] = useState(false);
    const [copySources, setCopySources] = useState<PersonnelRatioCopySource[]>([]);

    // 當父層更新 department（例如 refresh 後）時重置 state
    useEffect(() => {
      setRations(buildInitialRations(department.employees));
      setSelectedSet(new Set());
      setError(null);
      setAppliedTemplateLabel(null);
    }, [department.deptCode, department.employees]);

    const rows = useMemo(
      () =>
        department.employees.map((e) => ({
          empId: e.empId,
          empName: e.empName,
          isResigned: e.isResigned,
          ration: e.isResigned ? null : (rations.get(e.empId) ?? 0),
          selected: selectedSet.has(e.empId),
        })),
      [department.employees, rations, selectedSet],
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

    /** 手動編輯 RatioInput：只更新該員工比例，不連動其他人（用戶決議）。 */
    const updateRation = (empId: string, ration: number) => {
      setRations((prev) => new Map(prev).set(empId, clampRatio(ration)));
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

    /** 獎懲 ±N%（per-row）：對該員工加減 N%（clamp 0~100），不連動其他人。 */
    const applyTemplateOne = (empId: string, delta: number) => {
      if (activeRows.length < 2) {
        showToast('部門僅 1 位在職員工，無法套用調整', 'warning');
        return;
      }
      setRations((prev) => {
        const cur = prev.get(empId) ?? 0;
        return new Map(prev).set(empId, clampRatio(cur + delta));
      });
      const target = activeRows.find((r) => r.empId === empId);
      setAppliedTemplateLabel(
        `${delta > 0 ? '+' : ''}${delta}% / ${target?.empName ?? ''}`,
      );
    };

    /**
     * 部門級「均等分配」：全體在職各 100/n（明確批次操作，非連動）。加總精確 = 100.00。
     */
    const applyEqual = () => {
      const n = activeRows.length;
      if (n === 0) return;
      setRations(equalSplit(department.employees));
      setAppliedTemplateLabel(
        `均等分配（${n} 人各 ${(Math.round((100 / n) * 100) / 100).toFixed(2)}%）`,
      );
    };

    /** 開啟「從本月其他名單複製」modal 並載入來源。 */
    const openCopyModal = useCallback(async () => {
      setCopyOpen(true);
      setCopyLoading(true);
      setCopySources([]);
      try {
        const res = await getPersonnelRatioCopySources(listNo, department.deptCode);
        setCopySources(res.sources);
      } catch (err: unknown) {
        const e = err as { response?: { data?: { message?: string } } };
        showToast(e?.response?.data?.message ?? '載入可複製名單失敗', 'error');
      } finally {
        setCopyLoading(false);
      }
    }, [listNo, department.deptCode, showToast]);

    /**
     * 套用來源名單之比例：以來源 emp→ration 直接設定本部門在職員工比例（不連動）。
     * 來源未涵蓋之在職員工設 0；來源多出的（現已離職 / 非本部門）員工由後端已濾除。
     * 同月同部門通常員工集合一致、來源加總 = 100，故複製後即為合法起點；若不足由用戶調整。
     */
    const applyCopiedSource = (source: PersonnelRatioCopySource) => {
      const srcMap = new Map<string, number>();
      for (const e of source.employees) srcMap.set(e.empId, e.ration);
      setRations(() => {
        const next = new Map<string, number>();
        for (const r of activeRows) next.set(r.empId, srcMap.get(r.empId) ?? 0);
        return next;
      });
      setSelectedSet(new Set());
      setError(null);
      setAppliedTemplateLabel(`已複製自名單 ${source.listNo}`);
      setCopyOpen(false);
      showToast(
        `已從名單 ${source.listNo} 複製 ${source.employees.length} 位業務員比例（可再調整）`,
        'success',
      );
    };

    /** 部門級 ±N%：對選定（或全體）在職員工各加減 N%（clamp），不連動其他人。 */
    const applyDeptTemplate = (delta: number) => {
      const targets = selectedActive.length > 0 ? selectedActive : activeRows;
      if (targets.length === 0) return;
      setRations((prev) => {
        const next = new Map(prev);
        for (const t of targets) {
          next.set(t.empId, clampRatio((next.get(t.empId) ?? 0) + delta));
        }
        return next;
      });
      const scopeLabel =
        targets.length === activeRows.length ? '全體在職' : `${targets.length} 位選定`;
      setAppliedTemplateLabel(`${delta > 0 ? '+' : ''}${delta}% / ${scopeLabel}`);
    };

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

        {canEdit && activeRows.length > 0 && (
          <div className="flex items-center justify-end">
            <button
              type="button"
              data-testid={`btn-copy-from-list-${department.deptCode}`}
              onClick={openCopyModal}
              className="inline-flex items-center gap-1.5 px-2.5 py-1 text-xs border border-gray-300 text-gray-600 rounded-md hover:bg-gray-50 hover:border-primary hover:text-primary transition"
            >
              <Copy className="w-3.5 h-3.5" />
              從本月其他名單複製
            </button>
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
                          {TEMPLATE_DELTAS.map(({ label, delta }) => {
                            const cls =
                              delta > 0
                                ? 'border-green-300 text-green-700 hover:bg-green-50'
                                : 'border-red-300 text-red-600 hover:bg-red-50';
                            return (
                              <button
                                key={label}
                                type="button"
                                data-testid={`tpl-${label}-${r.empId}`}
                                onClick={() => applyTemplateOne(r.empId, delta)}
                                className={`px-1.5 py-0.5 text-[10px] font-mono border rounded ${cls}`}
                                title={`此員工比例 ${label}（不影響其他人）`}
                              >
                                {label}
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
                {TEMPLATE_DELTAS.map(({ label, delta }) => (
                  <button
                    key={label}
                    type="button"
                    data-testid={`dept-tpl-${label}-${department.deptCode}`}
                    onClick={() => applyDeptTemplate(delta)}
                    className={`px-2 py-1 text-xs border rounded hover:bg-gray-50 ${
                      delta > 0
                        ? 'border-green-300 text-green-700 hover:bg-green-50'
                        : 'border-red-300 text-red-600 hover:bg-red-50'
                    }`}
                  >
                    {label}
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

        <CopyDeptRatioModal
          open={copyOpen}
          deptCode={department.deptCode}
          deptName={department.deptName}
          loading={copyLoading}
          sources={copySources}
          onCopy={applyCopiedSource}
          onClose={() => setCopyOpen(false)}
        />
      </div>
    );
  },
);
