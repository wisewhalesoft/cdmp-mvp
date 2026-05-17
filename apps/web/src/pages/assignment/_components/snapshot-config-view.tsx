import { Layers, Building2, Users, FileText, Tag } from 'lucide-react';

/**
 * F066 Snapshot config 正規化 view
 *
 * 對應 prototype 35-snapshot-detail.html L251+
 *
 * 解析後端 config snapshot payload，渲染 5 個正規化表格：
 *   - listDefinitions
 *   - levelcardLevels（計分卡分數區間）
 *   - tiers（CARD_LEVEL → TIER_LEVEL 映射）
 *   - deptPct（部門比例 per LIST_NO）
 *   - emplSet（人員比例 per LIST_NO × 部門）
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
        <span className="text-xs font-mono text-gray-500">{count} 筆</span>
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
        config 快照不存在或尚未寫入
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
        title="名單定義（listDefinitions）"
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
                <th className="text-left px-3 py-2 font-semibold">LIST_NO</th>
                <th className="text-left px-3 py-2 font-semibold">名稱</th>
                <th className="text-left px-3 py-2 font-semibold">CARD_TYPE</th>
                <th className="text-left px-3 py-2 font-semibold">CR</th>
                <th className="text-left px-3 py-2 font-semibold">CASE_STATUS</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {lists.map((l, i) => (
                <tr key={`${l.listNo ?? i}`}>
                  <td className="px-3 py-1.5 font-mono text-primary">{l.listNo}</td>
                  <td className="px-3 py-1.5">{l.listNm ?? '—'}</td>
                  <td className="px-3 py-1.5 font-mono">{l.cardType ?? '—'}</td>
                  <td className="px-3 py-1.5">
                    {l.crEnabled ? '✓' : '—'}
                  </td>
                  <td className="px-3 py-1.5 font-mono text-gray-600">
                    {l.caseStatus ?? '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Section>

      <Section
        title="計分卡分數區間（levelcardLevels）"
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
                <th className="text-left px-3 py-2 font-semibold">cardType</th>
                <th className="text-right px-3 py-2 font-semibold">cardVersion</th>
                <th className="text-right px-3 py-2 font-semibold">scoreS</th>
                <th className="text-right px-3 py-2 font-semibold">scoreE</th>
                <th className="text-left px-3 py-2 font-semibold">cardLevel</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {levels.map((l, i) => (
                <tr key={`${l.cardType}-${l.cardLevel}-${i}`}>
                  <td className="px-3 py-1.5 font-mono">{l.cardType ?? '—'}</td>
                  <td className="px-3 py-1.5 text-right font-mono">{l.cardVersion ?? '—'}</td>
                  <td className="px-3 py-1.5 text-right font-mono">{l.scoreS ?? '—'}</td>
                  <td className="px-3 py-1.5 text-right font-mono">{l.scoreE ?? '—'}</td>
                  <td className="px-3 py-1.5 font-mono text-primary">{l.cardLevel ?? '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Section>

      <Section
        title="TIER_LEVEL 映射（tiers）"
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
                <th className="text-left px-3 py-2 font-semibold">cardType</th>
                <th className="text-left px-3 py-2 font-semibold">cardLevel</th>
                <th className="text-left px-3 py-2 font-semibold">tierLevel</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {tiers.map((t, i) => (
                <tr key={`${t.cardType}-${t.cardLevel}-${i}`}>
                  <td className="px-3 py-1.5 font-mono">{t.cardType ?? '—'}</td>
                  <td className="px-3 py-1.5 font-mono">{t.cardLevel ?? '—'}</td>
                  <td className="px-3 py-1.5 font-mono text-primary">{t.tierLevel ?? '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Section>

      <Section
        title="部門比例（deptPct）"
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
                <th className="text-left px-3 py-2 font-semibold">LIST_NO</th>
                <th className="text-left px-3 py-2 font-semibold">deptId</th>
                <th className="text-right px-3 py-2 font-semibold">ration (%)</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {depts.map((d, i) => (
                <tr key={`${d.listNo}-${d.deptId}-${i}`}>
                  <td className="px-3 py-1.5 font-mono text-primary">{d.listNo}</td>
                  <td className="px-3 py-1.5 font-mono">{d.deptId}</td>
                  <td className="px-3 py-1.5 text-right font-mono">{d.ration ?? '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Section>

      <Section
        title="人員比例（emplSet）"
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
                <th className="text-left px-3 py-2 font-semibold">LIST_NO</th>
                <th className="text-left px-3 py-2 font-semibold">deptId</th>
                <th className="text-left px-3 py-2 font-semibold">emplid</th>
                <th className="text-right px-3 py-2 font-semibold">ration (%)</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {emps.map((e, i) => (
                <tr key={`${e.listNo}-${e.emplid}-${i}`}>
                  <td className="px-3 py-1.5 font-mono text-primary">{e.listNo}</td>
                  <td className="px-3 py-1.5 font-mono">{e.deptId}</td>
                  <td className="px-3 py-1.5 font-mono">{e.emplid}</td>
                  <td className="px-3 py-1.5 text-right font-mono">{e.ration ?? '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Section>
    </div>
  );
}
