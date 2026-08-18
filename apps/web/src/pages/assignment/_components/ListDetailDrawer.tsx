/**
 * F048 v2.0 / F050 v2.2 §6.2 / US-131 — Detail Drawer 4-tab
 *
 * 對應 prototype: /prototypes/27-list-definition.html v2.3.1 第 367-430 行
 *
 * 4 個頁籤：
 *   - conditions：篩選條件（含 LEGACY 名單之 legacyEntityFallback）
 *   - dept：部門比例（draft 階段顯示「尚未設定」）
 *   - personnel：個別比例（draft / dept_ratio 階段顯示「尚未設定」；
 *                section_chief 僅見本轄區）
 *   - history：簽核歷史 timeline（依 created_at ASC）
 *
 * 互動：
 *   - 任何 stage / 歷史月份 / 月名單分派鎖中均可開啟（後端 GET /full-snapshot 不攔截）
 *   - 點擊 backdrop / 右上 X / 「關閉」按鈕關閉 Drawer
 */

import { useEffect, useMemo, useState } from 'react';
import {
  X,
  Filter,
  Building2,
  Users,
  History as HistoryIcon,
  Archive,
  Pencil,
  ArrowRight,
  Send,
  Check,
  XCircle,
  RotateCcw,
  Lock,
  Shield,
  ShieldAlert,
  FilterX,
  Tag,
  Info,
} from 'lucide-react';
import {
  getFullSnapshot,
  type FullSnapshotResponse,
  type SnapshotAuditTrailItem,
  type ConditionItem,
  type AppliedSpecialRule,
} from '@/api/assignment-list';
import { useConditionDecoder } from '../_hooks/use-condition-decoder';
import { formatConditionSummary, toSummaryDecoder } from '../_utils/condition-summary';
import {
  isTextOperator,
  operatorLabel,
  resolveCategoricalOperator,
  trimKeyword,
} from '../_utils/labels';

/** 拆解 legacy 多值字串（'$$' 分隔）並逐值解碼，回傳中文「、」串接（查無回傳原碼）。 */
function decodeLegacyMulti(
  decode: (v: string) => string,
  raw: string,
): string {
  return raw
    .split('$$')
    .filter(Boolean)
    .map((v) => decode(v))
    .join('、');
}

export interface ListDetailDrawerProps {
  listNo: string | null;
  onClose: () => void;
}

type DrawerTab = 'conditions' | 'dept' | 'personnel' | 'history';

export function ListDetailDrawer({ listNo, onClose }: ListDetailDrawerProps) {
  const [tab, setTab] = useState<DrawerTab>('conditions');
  const [data, setData] = useState<FullSnapshotResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  useEffect(() => {
    if (!listNo) return;
    setTab('conditions');
    setData(null);
    setErrorMsg(null);
    setLoading(true);
    let cancelled = false;
    // excludeZeroRatio：部門比例頁籤比照 /assignment/ready-summary，由 API 隱藏比例 = 0% 之部門。
    void getFullSnapshot(listNo, { excludeZeroRatio: true })
      .then((snap) => {
        if (!cancelled) setData(snap);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        const e = err as { response?: { data?: { message?: string } } };
        setErrorMsg(e?.response?.data?.message ?? '載入快照失敗，請稍後再試');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [listNo]);

  if (!listNo) return null;

  return (
    <div
      data-testid="detail-drawer-backdrop"
      className="fixed inset-0 z-40 bg-black/40"
      onClick={onClose}
    >
      <aside
        data-testid="detail-drawer"
        role="dialog"
        aria-label={`名單 ${listNo} 詳細資料`}
        onClick={(e) => e.stopPropagation()}
        className="fixed top-0 right-0 h-full w-[480px] bg-white shadow-2xl flex flex-col z-50"
      >
        <div className="px-5 py-4 border-b border-gray-200 flex items-center gap-3">
          <div className="flex-1 min-w-0">
            <code className="font-mono text-sm text-blue-700">{listNo}</code>
            <h3 className="text-base font-semibold text-gray-800 mt-1 truncate">
              {data?.list.listNm ?? '—'}
            </h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            data-testid="drawer-close"
            aria-label="關閉"
            className="shrink-0 w-8 h-8 inline-flex items-center justify-center rounded-md text-gray-500 hover:bg-gray-100"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="px-5 border-b border-gray-200 flex items-center gap-1">
          <DrawerTabBtn
            id="conditions"
            label="篩選條件"
            icon={Filter}
            active={tab === 'conditions'}
            onClick={() => setTab('conditions')}
          />
          <DrawerTabBtn
            id="dept"
            label="部門比例"
            icon={Building2}
            active={tab === 'dept'}
            onClick={() => setTab('dept')}
          />
          <DrawerTabBtn
            id="personnel"
            label="個別比例"
            icon={Users}
            active={tab === 'personnel'}
            onClick={() => setTab('personnel')}
          />
          <DrawerTabBtn
            id="history"
            label="簽核歷史"
            icon={HistoryIcon}
            active={tab === 'history'}
            onClick={() => setTab('history')}
          />
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-4">
          {loading && <p className="text-sm text-gray-500">載入中...</p>}
          {errorMsg && <p className="text-sm text-red-700">{errorMsg}</p>}
          {data && (
            <>
              <div
                data-testid="drawer-panel-conditions"
                className={tab === 'conditions' ? '' : 'hidden'}
              >
                <ConditionsPanel data={data} />
              </div>
              <div data-testid="drawer-panel-dept" className={tab === 'dept' ? '' : 'hidden'}>
                <DeptPanel data={data} />
              </div>
              <div
                data-testid="drawer-panel-personnel"
                className={tab === 'personnel' ? '' : 'hidden'}
              >
                <PersonnelPanel data={data} />
              </div>
              <div
                data-testid="drawer-panel-history"
                className={tab === 'history' ? '' : 'hidden'}
              >
                <HistoryPanel data={data} />
              </div>
            </>
          )}
        </div>
      </aside>
    </div>
  );
}

interface DrawerTabBtnProps {
  id: DrawerTab;
  label: string;
  icon: typeof Filter;
  active: boolean;
  onClick: () => void;
}
function DrawerTabBtn({ id, label, icon: Icon, active, onClick }: DrawerTabBtnProps) {
  return (
    <button
      type="button"
      data-testid={`drawer-tab-${id}`}
      onClick={onClick}
      className={`px-3 py-2 text-xs font-medium border-b-2 inline-flex items-center gap-1 ${
        active ? 'border-blue-700 text-blue-700' : 'border-transparent text-gray-500 hover:text-gray-800'
      }`}
    >
      <Icon className="w-3 h-3" />
      {label}
    </button>
  );
}

function ConditionsPanel({ data }: { data: FullSnapshotResponse }) {
  return (
    <div>
      <UserConditions data={data} />
      {/* F095：系統特例排除規則（唯讀，依 list_nm 讀時推導）— 對齊 prototype 27-list-definition.html */}
      <AppliedSpecialRulesPanel rules={data.appliedSpecialRules} />
    </div>
  );
}

/** LEGACY fallback 之固定 5 欄（whitelist snake_case），供 decoder 預載 options。 */
const LEGACY_FALLBACK_COLUMNS = [
  'prod_kind',
  'caseyear',
  'spec_tp',
  'case_status',
  'settle_src',
];

/** 使用者自設篩選條件（含 LEGACY fallback / 無條件） */
function UserConditions({ data }: { data: FullSnapshotResponse }) {
  const isLegacy = data.list.conditionPayload === null;
  // 彙整本名單引用之欄位（LEGACY 為固定 5 欄），驅動 decoder 延遲載入 options。
  const columns = useMemo(
    () =>
      isLegacy
        ? LEGACY_FALLBACK_COLUMNS
        : (data.list.conditionPayload?.conditions ?? []).map((c) => c.columnName),
    [isLegacy, data.list.conditionPayload],
  );
  const decoder = useConditionDecoder(columns);

  if (isLegacy) {
    const fb = data.list.legacyEntityFallback;
    return (
      <div>
        <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-semibold uppercase bg-slate-100 text-slate-600 border border-slate-200">
          <Archive className="w-2.5 h-2.5" />
          LEGACY
        </span>
        {fb && (
          <ul className="mt-3 space-y-1 text-xs text-gray-700">
            {fb.prodKind !== null && (
              <li>
                {decoder.decodeField('prod_kind')}：
                {decodeLegacyMulti((v) => decoder.decodeValue('prod_kind', v), fb.prodKind)}
              </li>
            )}
            {fb.caseyear !== null && (
              <li>
                {decoder.decodeField('caseyear')}：
                {decodeLegacyMulti((v) => decoder.decodeValue('caseyear', v), fb.caseyear)}
              </li>
            )}
            {fb.specTp !== null && (
              <li>
                {decoder.decodeField('spec_tp')}：
                {decodeLegacyMulti((v) => decoder.decodeValue('spec_tp', v), fb.specTp)}
              </li>
            )}
            {fb.caseStatus !== null && (
              <li>
                {decoder.decodeField('case_status')}：
                {decodeLegacyMulti((v) => decoder.decodeValue('case_status', v), fb.caseStatus)}
              </li>
            )}
            {fb.settleSrc !== null && (
              <li>
                {decoder.decodeField('settle_src')}：
                {decodeLegacyMulti((v) => decoder.decodeValue('settle_src', v), fb.settleSrc)}
              </li>
            )}
          </ul>
        )}
      </div>
    );
  }
  const conditions = data.list.conditionPayload?.conditions ?? [];
  if (conditions.length === 0) {
    return <p className="text-sm text-gray-500 italic">無篩選條件</p>;
  }
  // F119 / BR-10 / I-CATOP-DISPLAY-SINGLE-01：標題行即條件描述字串，唯一格式化來源
  const summaryDecoder = toSummaryDecoder(decoder);
  return (
    <ul className="space-y-2 text-xs text-gray-700">
      {conditions.map((c: ConditionItem, idx: number) => (
        <li key={idx} className="border border-gray-200 rounded p-2">
          <div className="font-semibold text-gray-800" data-condition-summary>
            {formatConditionSummary(c, summaryDecoder)}
          </div>
          {c.fieldType === 'categorical' && isTextOperator(c.operator) && (
            // F119 / 附錄 C C-15：運算子徽章（靛紫＝比對方式）＋ 關鍵字徽章（藍＝內容）
            <div className="mt-1 flex flex-wrap items-center gap-1">
              <span
                data-condition-operator={resolveCategoricalOperator(c.operator)}
                className="inline-block px-1.5 py-0.5 bg-indigo-50 text-indigo-700 border border-indigo-100 rounded text-[10px] font-medium"
              >
                {operatorLabel(c.operator)}
              </span>
              <span
                data-condition-keyword
                className="inline-block px-1.5 py-0.5 bg-blue-50 text-blue-700 border border-blue-100 rounded text-[10px]"
              >
                {trimKeyword(c.keyword)}
              </span>
            </div>
          )}
          {c.fieldType === 'categorical' && !isTextOperator(c.operator) && (
            <div className="text-gray-600 mt-0.5">
              {decoder.decodeValues(c.columnName, c.values ?? []).join('、')}
            </div>
          )}
          {c.fieldType === 'numeric' && (
            <div className="text-gray-600 mt-0.5">{c.min} ~ {c.max}</div>
          )}
          {c.fieldType === 'date' && (
            <div className="text-gray-600 mt-0.5">{c.dateStart} ~ {c.dateEnd}</div>
          )}
        </li>
      ))}
    </ul>
  );
}

/**
 * F095 — 系統特例排除規則唯讀區塊（AD-E07-26 §26.5）。
 *
 * 對齊 prototype/27-list-definition.html（L421~443 / renderSpecialRules）：
 *   - 灰底卡 + 鎖頭 + 「系統規則 · 唯讀」pill，與使用者自設篩選條件視覺區隔
 *   - 純展示：無任何 input / button / select / checkbox / switch（F095 AC-4 純唯讀）
 *   - isSystemMandatory=true（詐騙白牌）→ 灰「系統強制 · 全名單套用」標籤
 *   - isSystemMandatory=false → amber「依名單名稱觸發」標籤
 *   - 空態（無具名規則）顯示提示文字；至少含詐騙白牌一筆（F095 AC-5）
 *
 * 容錯（漸進增強）：appliedSpecialRules 未回傳（舊版 API）時隱藏整個區塊。
 */
export function AppliedSpecialRulesPanel({
  rules,
}: {
  rules?: AppliedSpecialRule[];
}) {
  if (!rules) return null; // 舊版 API 容錯：欄位缺失隱藏區塊
  const hasNamedRule = rules.some((r) => !r.isSystemMandatory);

  return (
    <div
      data-testid="applied-special-rules-panel"
      className="mt-5 rounded-lg border border-gray-300 bg-gray-50 overflow-hidden"
    >
      <div className="px-4 py-3 bg-gray-100/80 border-b border-gray-200 flex items-start gap-2.5">
        <div className="w-7 h-7 rounded-md bg-gray-200 flex items-center justify-center shrink-0">
          <Lock className="w-4 h-4 text-gray-500" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h4 className="text-sm font-semibold text-gray-700">系統特例排除規則</h4>
            <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[9px] font-semibold bg-gray-200 text-gray-600 border border-gray-300">
              <Shield className="w-2.5 h-2.5" />
              系統規則 · 唯讀
            </span>
          </div>
          <p className="text-[11px] text-gray-500 mt-1 leading-relaxed">
            以下為系統依名單名稱自動套用之特例排除規則，
            <span className="text-gray-600 font-medium">不可編輯</span>
            ，影響本名單月名單分派實際分派的案件數。
          </p>
        </div>
      </div>
      <div className="p-3 space-y-2">
        {!hasNamedRule && (
          <div className="rounded-md border border-dashed border-gray-300 bg-white/60 px-3 py-2 flex items-center gap-2 text-[11px] text-gray-500">
            <Info className="w-3.5 h-3.5 text-gray-400 shrink-0" />
            此名單名稱未觸發其他具名特例規則，僅套用下方通用系統規則。
          </div>
        )}
        {rules.map((r) => {
          const mandatory = r.isSystemMandatory;
          const RuleIcon = mandatory ? ShieldAlert : FilterX;
          return (
            <div
              key={r.ruleId}
              data-testid={`special-rule-${r.ruleId}`}
              className={`rounded-md border p-2.5 ${mandatory ? 'border-gray-300 bg-white' : 'border-amber-100 bg-white'}`}
            >
              <div className="flex items-start gap-2">
                <RuleIcon
                  className={`w-4 h-4 mt-0.5 shrink-0 ${mandatory ? 'text-gray-500' : 'text-amber-500'}`}
                />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-xs font-semibold text-gray-800">{r.ruleName}</span>
                    {mandatory ? (
                      <span
                        data-testid="rule-tag-mandatory"
                        className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[9px] font-semibold bg-gray-200 text-gray-600 border border-gray-300"
                      >
                        <Lock className="w-2.5 h-2.5" />
                        系統強制 · 全名單套用
                      </span>
                    ) : (
                      <span
                        data-testid="rule-tag-named"
                        className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[9px] font-medium bg-amber-50 text-amber-700 border border-amber-200"
                      >
                        <Tag className="w-2.5 h-2.5" />
                        依名單名稱觸發
                      </span>
                    )}
                  </div>
                  <p className="text-[11px] text-gray-500 mt-1 leading-relaxed">
                    {r.exclusionDescription}
                  </p>
                  <code className="text-[10px] font-mono text-gray-400 mt-1 inline-block">
                    {r.ruleId}
                  </code>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function DeptPanel({ data }: { data: FullSnapshotResponse }) {
  if (data.deptRatios.length === 0) {
    return (
      <p className="text-sm text-gray-500 italic">
        尚未設定部門比例（{data.list.stage === 'draft' ? '草稿' : data.list.stage} 階段）
      </p>
    );
  }
  return (
    <table className="w-full text-xs">
      <thead className="text-gray-500">
        <tr>
          <th className="text-left py-1">部門</th>
          <th className="text-left py-1">名稱</th>
          <th className="text-right py-1">配比 (%)</th>
        </tr>
      </thead>
      <tbody>
        {data.deptRatios.map((d) => (
          <tr key={d.deptCode} className="border-t border-gray-100">
            <td className="font-mono py-1">{d.deptCode}</td>
            <td className="py-1">{d.deptName ?? '—'}</td>
            <td className="text-right py-1">{d.ration}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function PersonnelPanel({ data }: { data: FullSnapshotResponse }) {
  if (data.personnelRatios.length === 0) {
    return <p className="text-sm text-gray-500 italic">尚未設定個別比例</p>;
  }
  return (
    <div className="space-y-3">
      {data.personnelRatios.map((g) => (
        <div key={g.deptCode} className="border border-gray-200 rounded p-2">
          <div className="font-semibold text-xs text-gray-700 mb-1.5">
            <span className="font-mono">{g.deptCode}</span> {g.deptName ?? ''}
          </div>
          <ul className="text-xs text-gray-600 space-y-0.5">
            {g.members.map((m) => (
              <li key={m.emplid} className="flex items-center justify-between">
                <span>
                  <span className="font-mono">{m.emplid}</span> {m.empNm ?? ''}
                </span>
                <span className="text-gray-500">{m.ration}%</span>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  );
}

/**
 * 簽核 / 設定歷程 timeline — 對齊 prototype 27 renderDrawerHistory（L1109-1140）。
 *
 * 每個 audit 事件依 action（+ after.toStage）映射為：彩色 icon / 簡短標題 / 事件說明，
 * 事件說明內嵌行為人姓名（由後端 getFullSnapshot 以 users.name 解析）。
 */
const STAGE_LABEL_ZH: Record<string, string> = {
  draft: '草稿',
  dept_ratio: '部門比例',
  personnel_ratio: '個別業務比例',
  approval: '簽核',
  ready: '準備完成',
};

interface HistoryView {
  Icon: typeof Pencil;
  color: string;
  title: string;
  desc: string;
}

function describeHistory(a: SnapshotAuditTrailItem): HistoryView {
  const after = a.after;
  const actor = a.operatorEmpNm ?? a.operatorId;
  const toStage = (after?.toStage ?? after?.stage) as string | undefined;
  const fromStage = after?.fromStage as string | undefined;
  const rejectReason =
    after && typeof after.rejectReason === 'string' ? (after.rejectReason as string) : null;

  switch (a.action) {
    case 'CREATE':
      return { Icon: Pencil, color: '#6B7280', title: '建立名單', desc: `由 ${actor} 建立` };
    case 'UPDATE':
      return { Icon: Pencil, color: '#6B7280', title: '編輯名單', desc: `由 ${actor} 編輯名單內容` };
    case 'STAGE_ADVANCE':
      if (toStage === 'dept_ratio')
        return { Icon: ArrowRight, color: '#3B82F6', title: '推進至部門比例', desc: `由 ${actor} 推進｜條件鎖定 / CR 鎖定` };
      if (toStage === 'personnel_ratio')
        return { Icon: ArrowRight, color: '#06B6D4', title: '推進至個別比例', desc: `由 ${actor} 推進｜通知各業務處長設定` };
      if (toStage === 'approval')
        return { Icon: Send, color: '#F59E0B', title: '送出簽核', desc: `由 ${actor} 送出，等待業務部長核准` };
      if (toStage === 'ready')
        return { Icon: Check, color: '#22C55E', title: '簽核核准', desc: `由 ${actor} 核准，名單推進至準備完成` };
      return { Icon: ArrowRight, color: '#3B82F6', title: '推進階段', desc: `由 ${actor} 推進` };
    case 'STAGE_ROLLBACK':
      return {
        Icon: RotateCcw,
        color: '#F59E0B',
        title: '退回階段',
        desc:
          fromStage && toStage
            ? `由 ${actor} 退回（${STAGE_LABEL_ZH[fromStage] ?? fromStage} → ${STAGE_LABEL_ZH[toStage] ?? toStage}）`
            : `由 ${actor} 退回上一階段`,
      };
    case 'STAGE_REJECT':
      return {
        Icon: XCircle,
        color: '#EF4444',
        title: '簽核拒絕',
        desc: `由 ${actor} 拒絕。理由：${rejectReason ?? '（未填）'}。已退回個別業務比例階段。`,
      };
    default:
      return { Icon: Pencil, color: '#6B7280', title: a.action, desc: `由 ${actor}` };
  }
}

function formatHistoryTime(at: string): string {
  const d = new Date(at);
  if (Number.isNaN(d.getTime())) return String(at);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function HistoryPanel({ data }: { data: FullSnapshotResponse }) {
  if (data.auditTrail.length === 0) {
    return <p className="text-sm text-gray-500 italic">尚無操作歷史</p>;
  }
  return (
    <ol className="relative border-l border-gray-200 ml-2 space-y-4 pl-5 pt-1">
      {data.auditTrail.map((a, idx) => {
        const v = describeHistory(a);
        const Icon = v.Icon;
        return (
          <li key={idx} data-testid={`history-item-${idx}`} className="relative">
            <span
              className="absolute -left-[26px] top-1.5 w-2.5 h-2.5 rounded-full"
              style={{ background: v.color, boxShadow: `0 0 0 2px ${v.color}30` }}
            />
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-xs font-mono text-gray-400">{formatHistoryTime(String(a.at))}</span>
              <Icon className="w-3 h-3 shrink-0" style={{ color: v.color }} />
              <span className="text-sm font-medium text-gray-800">{v.title}</span>
            </div>
            <p className="text-xs text-gray-500 mt-0.5">{v.desc}</p>
          </li>
        );
      })}
    </ol>
  );
}
