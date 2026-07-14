import { Layers, Building2, Users, FileText, Tag } from 'lucide-react';

/**
 * F066 Snapshot 設定快照正規化 view（v1.3 使用者友善重構）
 *
 * 對應 prototype: prototypes/35-snapshot-detail.html（設定快照分頁）
 *
 * 呈現本次分派當時採用的設定，全中文欄名、原始代碼降為灰色小字、等級/分級以 badge decode：
 *   - 名單定義 / 計分卡分數區間 / 分級（TIER）對應 / 部門比例 / 人員比例
 */

interface ListDefinitionRow {
  listNo?: string;
  listNm?: string;
  cardType?: string | null;
  crEnabled?: boolean;
  caseStatus?: string | null;
}
interface LevelcardLevelRow {
  cardType?: string;
  cardVersion?: number;
  scoreS?: number;
  scoreE?: number;
  cardLevel?: string;
}
interface TierRow {
  cardType?: string;
  cardLevel?: string;
  tierLevel?: string;
}
interface DeptPctRow {
  listNo?: string;
  deptId?: string;
  ration?: number;
}
interface EmplSetRow {
  listNo?: string;
  deptId?: string;
  emplid?: string;
  ration?: number;
}

export interface SnapshotConfigPayload {
  projectWorkym?: string;
  listDefinitions?: ListDefinitionRow[];
  levelcardLevels?: LevelcardLevelRow[];
  tiers?: TierRow[];
  deptPct?: DeptPctRow[];
  emplSet?: EmplSetRow[];
}

export interface SnapshotConfigViewProps {
  payload: SnapshotConfigPayload | null;
}

/** 原始代碼小字（灰色 mono），供欄位次要顯示。 */
function Code({ value }: { value?: string | null }) {
  if (value === null || value === undefined || value === '') {
    return <span className="text-gray-300">—</span>;
  }
  return <span className="font-mono text-xs text-gray-500">{value}</span>;
}

/** 等級 / 分級 decode badge。 */
function LevelBadge({ value, tone = 'blue' }: { value?: string | null; tone?: 'blue' | 'green' }) {
  if (!value) return <span className="text-gray-300">—</span>;
  const cls =
    tone === 'green' ? 'bg-green-100 text-success' : 'bg-blue-100 text-blue-700';
  return (
    <span className={`inline-flex px-1.5 py-0.5 text-[11px] font-semibold rounded ${cls}`}>
      {value}
    </span>
  );
}

function Section({
  title,
  icon: Icon,
  testId,
  count,
  children,
}: {
  title: string;
  icon: typeof Layers;
  testId: string;
  count: number;
  children: React.ReactNode;
}) {
  return (
    <details
      open
      className="border border-gray-200 rounded-lg bg-gray-50/40 overflow-hidden"
    >
      <summary className="px-4 py-3 flex items-center justify-between hover:bg-gray-50 transition cursor-pointer">
        <div className="flex items-center gap-2">
          <Icon className="w-4 h-4 text-primary" />
          <span className="text-sm font-semibold text-gray-800">{title}</span>
        </div>
        <span className="text-xs text-gray-500">{count} 筆</span>
      </summary>
      <div
        data-testid={testId}
        className="border-t border-gray-200 bg-white overflow-x-auto"
      >
        {children}
      </div>
    </details>
  );
}

function EmptyHint() {
  return (
    <p className="px-4 py-3 text-xs text-gray-400 text-center">無紀錄</p>
  );
}

export function SnapshotConfigView({ payload }: SnapshotConfigViewProps) {
  if (!payload) {
    return (
      <div
        data-testid="snapshot-config-empty"
        className="p-8 text-center text-sm text-gray-500"
      >
        設定快照尚未建立
      </div>
    );
  }
  const lists = payload.listDefinitions ?? [];
  const levels = payload.levelcardLevels ?? [];
  const tiers = payload.tiers ?? [];
  const depts = payload.deptPct ?? [];
  const emps = payload.emplSet ?? [];

  return (
    <div className="space-y-4">
      <Section
        title="名單定義"
        icon={FileText}
        testId="snapshot-config-list-defs"
        count={lists.length}
      >
        {lists.length === 0 ? (
          <EmptyHint />
        ) : (
          <table className="w-full text-xs">
            <thead className="bg-gray-50/60 text-gray-500">
              <tr>
                <th className="text-left px-3 py-2 font-semibold">名單編號</th>
                <th className="text-left px-3 py-2 font-semibold">名單名稱</th>
                <th className="text-left px-3 py-2 font-semibold">計分卡</th>
                <th className="text-left px-3 py-2 font-semibold">CR 回分</th>
                <th className="text-left px-3 py-2 font-semibold">案件結清期別</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {lists.map((l, i) => (
                <tr key={`${l.listNo ?? i}`}>
                  <td className="px-3 py-1.5"><Code value={l.listNo} /></td>
                  <td className="px-3 py-1.5">{l.listNm ?? '—'}</td>
                  <td className="px-3 py-1.5"><Code value={l.cardType} /></td>
                  <td className="px-3 py-1.5">
                    {l.crEnabled ? (
                      <span className="text-success">啟用</span>
                    ) : (
                      <span className="text-gray-400">停用</span>
                    )}
                  </td>
                  <td className="px-3 py-1.5"><Code value={l.caseStatus} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Section>

      <Section
        title="計分卡分數區間"
        icon={Layers}
        testId="snapshot-config-card-levels"
        count={levels.length}
      >
        {levels.length === 0 ? (
          <EmptyHint />
        ) : (
          <table className="w-full text-xs">
            <thead className="bg-gray-50/60 text-gray-500">
              <tr>
                <th className="text-left px-3 py-2 font-semibold">計分卡</th>
                <th className="text-right px-3 py-2 font-semibold">版本</th>
                <th className="text-right px-3 py-2 font-semibold">分數下限</th>
                <th className="text-right px-3 py-2 font-semibold">分數上限</th>
                <th className="text-left px-3 py-2 font-semibold">等級</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {levels.map((l, i) => (
                <tr key={`${l.cardType}-${l.cardLevel}-${i}`}>
                  <td className="px-3 py-1.5"><Code value={l.cardType} /></td>
                  <td className="px-3 py-1.5 text-right font-mono text-gray-600">{l.cardVersion ?? '—'}</td>
                  <td className="px-3 py-1.5 text-right font-mono text-gray-600">{l.scoreS ?? '—'}</td>
                  <td className="px-3 py-1.5 text-right font-mono text-gray-600">{l.scoreE ?? '—'}</td>
                  <td className="px-3 py-1.5"><LevelBadge value={l.cardLevel} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Section>

      <Section
        title="分級（TIER）對應"
        icon={Tag}
        testId="snapshot-config-tiers"
        count={tiers.length}
      >
        {tiers.length === 0 ? (
          <EmptyHint />
        ) : (
          <table className="w-full text-xs">
            <thead className="bg-gray-50/60 text-gray-500">
              <tr>
                <th className="text-left px-3 py-2 font-semibold">計分卡</th>
                <th className="text-left px-3 py-2 font-semibold">等級</th>
                <th className="text-left px-3 py-2 font-semibold">分級（TIER）</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {tiers.map((t, i) => (
                <tr key={`${t.cardType}-${t.cardLevel}-${i}`}>
                  <td className="px-3 py-1.5"><Code value={t.cardType} /></td>
                  <td className="px-3 py-1.5"><LevelBadge value={t.cardLevel} /></td>
                  <td className="px-3 py-1.5"><LevelBadge value={t.tierLevel} tone="green" /></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Section>

      <Section
        title="部門比例"
        icon={Building2}
        testId="snapshot-config-dept-pct"
        count={depts.length}
      >
        {depts.length === 0 ? (
          <EmptyHint />
        ) : (
          <table className="w-full text-xs">
            <thead className="bg-gray-50/60 text-gray-500">
              <tr>
                <th className="text-left px-3 py-2 font-semibold">名單編號</th>
                <th className="text-left px-3 py-2 font-semibold">部門</th>
                <th className="text-right px-3 py-2 font-semibold">比例 (%)</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {depts.map((d, i) => (
                <tr key={`${d.listNo}-${d.deptId}-${i}`}>
                  <td className="px-3 py-1.5"><Code value={d.listNo} /></td>
                  <td className="px-3 py-1.5"><Code value={d.deptId} /></td>
                  <td className="px-3 py-1.5 text-right font-mono text-gray-600">{d.ration ?? '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Section>

      <Section
        title="人員比例"
        icon={Users}
        testId="snapshot-config-empl-set"
        count={emps.length}
      >
        {emps.length === 0 ? (
          <EmptyHint />
        ) : (
          <table className="w-full text-xs">
            <thead className="bg-gray-50/60 text-gray-500">
              <tr>
                <th className="text-left px-3 py-2 font-semibold">名單編號</th>
                <th className="text-left px-3 py-2 font-semibold">部門</th>
                <th className="text-left px-3 py-2 font-semibold">人員工號</th>
                <th className="text-right px-3 py-2 font-semibold">比例 (%)</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {emps.map((e, i) => (
                <tr key={`${e.listNo}-${e.emplid}-${i}`}>
                  <td className="px-3 py-1.5"><Code value={e.listNo} /></td>
                  <td className="px-3 py-1.5"><Code value={e.deptId} /></td>
                  <td className="px-3 py-1.5"><Code value={e.emplid} /></td>
                  <td className="px-3 py-1.5 text-right font-mono text-gray-600">{e.ration ?? '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Section>
    </div>
  );
}
