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
 *   - 任何 stage / 歷史月份 / 月跑鎖中均可開啟（後端 GET /full-snapshot 不攔截）
 *   - 點擊 backdrop / 右上 X / 「關閉」按鈕關閉 Drawer
 */

import { useEffect, useState } from 'react';
import { X, Filter, Building2, Users, History as HistoryIcon, Archive } from 'lucide-react';
import {
  getFullSnapshot,
  type FullSnapshotResponse,
  type ConditionItem,
} from '@/api/assignment-list';

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
    void getFullSnapshot(listNo)
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
  if (data.list.conditionPayload === null) {
    return (
      <div>
        <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-semibold uppercase bg-slate-100 text-slate-600 border border-slate-200">
          <Archive className="w-2.5 h-2.5" />
          LEGACY
        </span>
        {data.list.legacyEntityFallback && (
          <ul className="mt-3 space-y-1 text-xs text-gray-700">
            {data.list.legacyEntityFallback.prodKind !== null && (
              <li>prod_kind: {data.list.legacyEntityFallback.prodKind}</li>
            )}
            {data.list.legacyEntityFallback.caseyear !== null && (
              <li>caseyear: {data.list.legacyEntityFallback.caseyear}</li>
            )}
            {data.list.legacyEntityFallback.specTp !== null && (
              <li>spec_tp: {data.list.legacyEntityFallback.specTp}</li>
            )}
            {data.list.legacyEntityFallback.caseStatus !== null && (
              <li>case_status: {data.list.legacyEntityFallback.caseStatus}</li>
            )}
            {data.list.legacyEntityFallback.settleSrc !== null && (
              <li>settle_src: {data.list.legacyEntityFallback.settleSrc}</li>
            )}
          </ul>
        )}
      </div>
    );
  }
  const conditions = data.list.conditionPayload.conditions ?? [];
  if (conditions.length === 0) {
    return <p className="text-sm text-gray-500 italic">無篩選條件</p>;
  }
  return (
    <ul className="space-y-2 text-xs text-gray-700">
      {conditions.map((c: ConditionItem, idx: number) => (
        <li key={idx} className="border border-gray-200 rounded p-2">
          <div className="font-mono font-semibold text-blue-700">{c.columnName}</div>
          <div className="text-gray-500 mt-0.5">type: {c.fieldType}</div>
          {c.fieldType === 'categorical' && (
            <div className="mt-0.5">values: {(c.values ?? []).join(', ')}</div>
          )}
          {c.fieldType === 'numeric' && (
            <div className="mt-0.5">range: {c.min}~{c.max}</div>
          )}
          {c.fieldType === 'date' && (
            <div className="mt-0.5">range: {c.dateStart}~{c.dateEnd}</div>
          )}
        </li>
      ))}
    </ul>
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

function HistoryPanel({ data }: { data: FullSnapshotResponse }) {
  if (data.auditTrail.length === 0) {
    return <p className="text-sm text-gray-500 italic">尚無操作歷史</p>;
  }
  return (
    <ul className="space-y-2 text-xs">
      {data.auditTrail.map((a, idx) => (
        <li key={idx} className="border-l-2 border-gray-200 pl-3 py-1">
          <div className="font-semibold text-gray-700">{a.action}</div>
          <div className="text-gray-500">
            {a.operatorEmpNm ?? a.operatorId} · {new Date(a.at).toLocaleString()}
          </div>
        </li>
      ))}
    </ul>
  );
}
