import { CheckCircle2, XCircle, AlertCircle, Loader2 } from 'lucide-react';
import type { ReadinessResponse } from '@/api/assignment-run';

/**
 * F061 6 項月跑前置條件 check
 *
 * 對應 prototype 31-trigger-run.html L237-329
 *
 * 6 項：
 *   1. list-defined：名單定義已建立（totalActiveLists ≥ 1）
 *   2. dept-ratio-100：部門比例加總 = 100%（隱含於 stage=ready）
 *   3. personnel-ratio-100：人員比例加總 = 100%（隱含於 stage=ready）
 *   4. scoring-active：計分版本 active
 *   5. no-running-run：無 pending/running 月跑
 *   6. etl-synced：4 個關鍵 ETL 均 completed
 *
 * 設計：純函式 `buildPreChecksFromReadiness` 將 readiness response 轉換成
 * `PreCheckItem[]`，便於頁面組合與單元測試。
 */

export type PreCheckStatus = 'pass' | 'fail' | 'warn';

export interface PreCheckItem {
  id:
    | 'list-defined'
    | 'dept-ratio-100'
    | 'personnel-ratio-100'
    | 'scoring-active'
    | 'no-running-run'
    | 'etl-synced';
  label: string;
  description: string;
  status: PreCheckStatus;
  detail?: string;
}

export function buildPreChecksFromReadiness(
  readiness: ReadinessResponse,
): PreCheckItem[] {
  const items: PreCheckItem[] = [];

  // 1. 名單建立
  items.push({
    id: 'list-defined',
    label: '名單定義已建立',
    description: '本月（active 名單）至少 1 筆 ob_list_definition',
    status: readiness.totalActiveLists >= 1 ? 'pass' : 'fail',
    detail:
      readiness.totalActiveLists >= 1
        ? `共 ${readiness.totalActiveLists} 筆 active 名單`
        : '尚無 active 名單；請先建立名單並推進至 ready 階段',
  });

  // 2. 部門比例 100%（隱含於 ready）
  const deptFails = readiness.notReadyLists.filter(
    (l) => l.stage === 'draft' || l.stage === 'dept_ratio',
  );
  items.push({
    id: 'dept-ratio-100',
    label: '部門比例加總 = 100%',
    description: '每個 active LIST_NO 之 ob_dept_pct 加總 = 100% (F079)',
    status: deptFails.length === 0 ? 'pass' : 'fail',
    detail:
      deptFails.length === 0
        ? '所有名單已通過部門比例設定（推進至 dept_ratio 之後階段）'
        : `${deptFails.length} 筆名單尚未完成部門比例：${deptFails.map((l) => l.listNo).join(', ')}`,
  });

  // 3. 人員比例 100%（隱含於 ready）
  const personnelFails = readiness.notReadyLists.filter(
    (l) => l.stage === 'personnel_ratio' || l.stage === 'approval',
  );
  items.push({
    id: 'personnel-ratio-100',
    label: '人員比例加總 = 100%',
    description: '每個 (LIST_NO × 部門) 之 ob_empl_set 加總 = 100% (F082)',
    status: personnelFails.length === 0 ? 'pass' : 'fail',
    detail:
      personnelFails.length === 0
        ? '所有名單已通過個別業務比例設定'
        : `${personnelFails.length} 筆名單尚在 personnel_ratio / approval 階段`,
  });

  // 4. 計分版本 active
  items.push({
    id: 'scoring-active',
    label: '計分版本 active',
    description: 'ob_levelcard_version 至少 1 筆 status="active"',
    status: readiness.scoringActive ? 'pass' : 'fail',
    detail: readiness.scoringActive
      ? '已啟用計分版本'
      : '尚無啟用計分版本，請至計分卡設定頁啟用',
  });

  // 5. 無 running/pending 月跑
  const rs = readiness.monthlyRunStatus;
  const blockingRun = rs === 'pending' || rs === 'running';
  items.push({
    id: 'no-running-run',
    label: '無 pending / running 月跑',
    description: '同月僅允許一個 pending/running 月跑（BR-2）',
    status: blockingRun ? 'fail' : 'pass',
    detail: blockingRun
      ? `當月 assignment_run.status = ${rs}，請等待完成或先取消後再觸發`
      : rs === 'completed'
        ? '當月已有 completed 月跑紀錄（如需重跑請聯絡 Admin）'
        : '當月無進行中月跑',
  });

  // 6. ETL 同步狀態
  const etlSources = readiness.etlStatus;
  const etlKeys = ['pooldata', 'emphire', 'calendar', 'arreturndf'] as const;
  const etlAllCompleted = etlKeys.every(
    (k) => etlSources[k].status === 'completed',
  );
  const etlFails = etlKeys.filter((k) => etlSources[k].status !== 'completed');
  items.push({
    id: 'etl-synced',
    label: 'ETL 同步狀態',
    description: 'E04+E05 雙層 ETL 已完成本月資料載入',
    status: etlAllCompleted ? 'pass' : 'fail',
    detail: etlAllCompleted
      ? '4 個關鍵 ETL pipeline 已 completed'
      : `${etlFails.length} 個 ETL 未完成：${etlFails.join(', ')}`,
  });

  return items;
}

const ICON_MAP: Record<
  PreCheckStatus,
  { icon: typeof CheckCircle2; color: string; bg: string }
> = {
  pass: {
    icon: CheckCircle2,
    color: 'text-green-700',
    bg: 'bg-green-100',
  },
  fail: {
    icon: XCircle,
    color: 'text-red-700',
    bg: 'bg-red-100',
  },
  warn: {
    icon: AlertCircle,
    color: 'text-amber-700',
    bg: 'bg-amber-100',
  },
};

export interface PreCheckListProps {
  readiness: ReadinessResponse | null;
  loading?: boolean;
}

export function PreCheckList({ readiness, loading = false }: PreCheckListProps) {
  if (loading) {
    return (
      <div
        data-testid="pre-check-loading"
        className="p-6 text-center text-sm text-gray-400 flex items-center justify-center gap-2"
      >
        <Loader2 className="w-4 h-4 animate-spin" />
        載入前置檢查中...
      </div>
    );
  }

  if (!readiness) {
    return (
      <div
        data-testid="pre-check-empty"
        className="p-6 text-center text-sm text-gray-500"
      >
        前置檢查無法載入。請稍後重試。
      </div>
    );
  }

  const items = buildPreChecksFromReadiness(readiness);
  const passCount = items.filter((it) => it.status === 'pass').length;
  const allPass = passCount === items.length;

  return (
    <div className="bg-white rounded-lg border border-gray-200 shadow-sm">
      <div className="px-5 py-4 border-b border-gray-200 flex items-center justify-between">
        <h3 className="text-sm font-semibold text-gray-800 inline-flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4 text-primary" />
          前置條件檢查（F061 AC-1）
        </h3>
        <span
          data-testid="pre-check-summary"
          className={`text-xs font-medium inline-flex items-center gap-1 ${
            allPass ? 'text-green-700' : 'text-amber-700'
          }`}
        >
          {allPass ? (
            <CheckCircle2 className="w-3.5 h-3.5" />
          ) : (
            <AlertCircle className="w-3.5 h-3.5" />
          )}
          {passCount}/{items.length} 通過
        </span>
      </div>
      <div className="divide-y divide-gray-200">
        {items.map((it) => {
          const cfg = ICON_MAP[it.status];
          const Icon = cfg.icon;
          return (
            <div
              key={it.id}
              data-testid={`pre-check-item-${it.id}`}
              data-status={it.status}
              className="p-4 flex items-start gap-3"
            >
              <span
                className={`shrink-0 w-6 h-6 rounded-full flex items-center justify-center ${cfg.bg}`}
              >
                <Icon className={`w-4 h-4 ${cfg.color}`} />
              </span>
              <div className="flex-1">
                <div className="flex items-center justify-between">
                  <h4 className="text-sm font-semibold text-gray-800">
                    {it.label}
                  </h4>
                  <span
                    className={`text-[10px] font-medium px-1.5 py-0.5 rounded-full ${cfg.bg} ${cfg.color}`}
                  >
                    {it.status === 'pass' ? 'PASS' : it.status === 'fail' ? 'FAIL' : 'WARN'}
                  </span>
                </div>
                <p className="text-xs text-gray-500 mt-0.5">{it.description}</p>
                {it.detail && (
                  <p
                    className={`text-xs mt-1.5 ${
                      it.status === 'pass' ? 'text-gray-600' : 'text-amber-800'
                    }`}
                  >
                    {it.detail}
                  </p>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
