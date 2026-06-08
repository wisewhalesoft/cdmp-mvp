import { AlertTriangle, AlertOctagon, X } from 'lucide-react';

/**
 * F063 — 月跑結果摘要警告 Banner
 *
 * 對應 spec：F061 / F054 v1.3 + prototype 33-run-summary.html 之 scoringWarnBanner
 *
 * 範圍：
 *   - 顯示計分完整性警告 issues 清單
 *   - issueCount = 0 / warningSummary = null → 不渲染
 *   - 每個 issue 對應一個 type → 中文說明 mapping
 *   - runStatus='failed' → 顯示「稽核失敗」紅色樣式
 *   - onDismiss 由父層控制顯示 / 隱藏
 *
 * 設計：採 mapping 結構支援未來插拔，新增 type 只需擴充 ISSUE_TYPE_DESCRIPTIONS。
 */

/**
 * F063 警告類型 → 中文說明 mapping。
 * 未來新增類型只需在此 map 加入新 key，無需改 render 邏輯。
 */
export const ISSUE_TYPE_DESCRIPTIONS: Record<string, string> = {
  MISSING_MATCH_TYPE: '缺少比對類型（match_type 欄位未設定）',
  EMPTY_SCORE_RANGE: '無分數區間（ob_levelcard_score 為空）',
  COMPOSITE_MISSING_BASELINE: '複合比對缺少基線區間',
  // 對齊 prototype map（BR-12 / 計分完整性兩類）
  BR12_EDGE_CARD_TYPE_SKIPPED: 'EDGE 客戶因 CARD_TYPE 未設定而跳過',
  SCORING_INTEGRITY_WARN: '計分完整性警示（系統使用 0 分代入）',
  // F101 / AD-E07-29 OQ-F101-05：Stage 3/4/ASSIGNDAY 比例分派警告（月跑不中斷，對應欄位保持 NULL）
  STAGE3_NO_DEPT_RATION: '電銷課比例未設定（該名單／Tier 案件未分派至電銷課，dept_id 保持空）',
  STAGE4_NO_EMPL_WARN: '電銷課無人員比例設定（該課案件未分派至業務員，emplid 保持空）',
  ASSIGNDAY_NO_CALENDAR_WARN: '當月無工作日日曆資料（案件未設定指派日，assignday 保持空）',
};

export interface ScoringWarningIssue {
  type: string;
  columnName?: string;
  detail?: string;
  // 任意延伸欄位（map 結構不限定）
  [key: string]: unknown;
}

export interface ScoringWarningSummary {
  issueCount: number;
  issues: ScoringWarningIssue[];
}

export interface ScoringWarningBannerProps {
  warningSummary: ScoringWarningSummary | null;
  runStatus?: 'completed' | 'failed' | 'running' | 'pending';
  onDismiss?: () => void;
}

export function ScoringWarningBanner({
  warningSummary,
  runStatus = 'completed',
  onDismiss,
}: ScoringWarningBannerProps) {
  // TS-F063-WB-001 / 002：null / issueCount=0 → 不渲染
  if (!warningSummary || warningSummary.issueCount === 0) {
    return null;
  }

  const issues = warningSummary.issues ?? [];
  // TS-F063-WB-009：failed 時切換樣式
  const isFailed = runStatus === 'failed';

  const Icon = isFailed ? AlertOctagon : AlertTriangle;
  const wrapperCls = isFailed
    ? 'rounded-lg overflow-hidden border-l-4 border-danger bg-red-50'
    : 'rounded-lg overflow-hidden border-l-4 border-warning bg-amber-50';
  const iconBg = isFailed ? 'bg-red-100' : 'bg-amber-100';
  const iconText = isFailed ? 'text-danger' : 'text-warning';
  const titleColor = isFailed ? 'text-red-900' : 'text-amber-900';
  const badgeBg = isFailed
    ? 'bg-red-200 text-red-900'
    : 'bg-amber-200 text-amber-900';
  const title = isFailed
    ? `稽核失敗 — 共 ${warningSummary.issueCount} 筆問題`
    : `本次月跑有 ${warningSummary.issueCount} 筆警告（不影響月跑成功）`;

  return (
    <div
      data-testid="scoring-warning-banner"
      data-status={runStatus}
      className={wrapperCls}
    >
      <div className="px-5 py-3 flex items-center gap-3">
        <div
          className={
            'w-9 h-9 rounded-full flex items-center justify-center shrink-0 ' +
            iconBg
          }
        >
          <Icon className={'w-5 h-5 ' + iconText} />
        </div>
        <div className="flex-1 min-w-0">
          <h3
            className={
              'text-sm font-semibold flex items-center gap-2 flex-wrap ' +
              titleColor
            }
          >
            {title}
            <span
              className={
                'inline-flex items-center px-2 py-0.5 text-xs font-semibold rounded-full tabular-nums ' +
                badgeBg
              }
            >
              {warningSummary.issueCount} 筆
            </span>
          </h3>
        </div>
        {onDismiss && (
          <button
            type="button"
            data-testid="scoring-warning-dismiss"
            onClick={onDismiss}
            className="p-1.5 text-gray-500 hover:bg-white/60 rounded-md transition"
            aria-label="關閉警告 banner"
          >
            <X className="w-4 h-4" />
          </button>
        )}
      </div>
      <div className="border-t border-amber-200 bg-white/50 px-5 py-3">
        <ul
          data-testid="scoring-warning-issue-list"
          className="space-y-2"
        >
          {issues.map((issue, idx) => {
            const description =
              ISSUE_TYPE_DESCRIPTIONS[issue.type] ?? issue.detail ?? issue.type;
            return (
              <li
                key={`${issue.type}-${idx}`}
                data-testid="scoring-warning-issue-item"
                data-issue-type={issue.type}
                className="flex items-start gap-2 text-sm text-gray-800"
              >
                <span className="inline-block w-1.5 h-1.5 rounded-full bg-amber-500 mt-2 shrink-0" />
                <div className="flex-1 min-w-0">
                  <div className="font-medium text-gray-900">{description}</div>
                  {issue.columnName && (
                    <div className="text-xs text-gray-600 mt-0.5">
                      維度：
                      <code className="font-mono text-amber-800">
                        {issue.columnName}
                      </code>
                    </div>
                  )}
                  {issue.detail &&
                    issue.detail !== description && (
                      <div className="text-xs text-gray-500 mt-0.5">
                        {issue.detail}
                      </div>
                    )}
                </div>
              </li>
            );
          })}
        </ul>
      </div>
    </div>
  );
}
