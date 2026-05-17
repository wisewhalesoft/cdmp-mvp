import { User, Calendar, Filter, Recycle, Target } from 'lucide-react';

/**
 * 29a/b/c/d 共用：名單摘要區塊（唯讀）。
 *
 * 對應 prototypes：
 *   - 29a-dept-ratio-config.html L200-241
 *   - 29b-personnel-ratio-config.html L225-258
 *   - 29c-approval-review.html L175-228
 *   - 29d-ready-summary.html L243-280
 *
 * 用途：
 *   - 顯示名單頂部唯讀摘要：list_no + list_nm + 頁面標題 + 說明
 *   - 顯示建立者 / 建立時間
 *   - 顯示繼承自 draft 階段的「篩選條件 chips」+「CR 開關」（鎖定）
 *   - 可選顯示 Stage 0 預估命中筆數
 */

export interface ListSummaryCardProps {
  /** 名單流水號（例 OB202605003） */
  listNo: string;
  /** 名單名稱 */
  listNm: string;
  /** 頁面標題（例「部門比例設定」/「個別業務比例設定」/「簽核審閱」） */
  title: string;
  /** 頁面說明文字 */
  description: string;
  /** 建立者顯示名稱 */
  createdBy: string;
  /** 建立日期顯示字串（已格式化） */
  createdAt: string;
  /** 篩選條件 chips（純文字陣列） */
  conditions: string[];
  /** CR 回分開關（true 顯示啟用 badge；false 隱藏） */
  crEnabled: boolean;
  /** Stage 0 預估命中筆數（可選） */
  estimatedCount?: number;
}

export function ListSummaryCard({
  listNo,
  listNm,
  title,
  description,
  createdBy,
  createdAt,
  conditions,
  crEnabled,
  estimatedCount,
}: ListSummaryCardProps) {
  return (
    <section
      data-testid="list-summary-card"
      className="bg-white rounded-xl border border-gray-200 p-5"
    >
      <div className="flex items-start justify-between gap-4 mb-3">
        <div>
          <h1 className="text-xl font-semibold text-gray-800">
            {title}
            <span className="ml-2 text-base text-gray-500 font-normal">
              — <span className="font-mono">{listNo}</span>「{listNm}」
            </span>
          </h1>
          <p className="text-xs text-gray-500 mt-1">{description}</p>
        </div>
        <div className="text-right shrink-0">
          <p className="text-[10px] text-gray-400 uppercase tracking-wider">
            建立資訊
          </p>
          <p className="text-sm font-medium text-gray-700 mt-0.5 inline-flex items-center gap-1">
            <User className="w-3 h-3" />
            {createdBy}
          </p>
          <p className="text-xs text-gray-500 inline-flex items-center gap-1">
            <Calendar className="w-3 h-3" />
            {createdAt}
          </p>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-3 mt-4">
        {/* 篩選條件 chips */}
        <div className="col-span-2 p-3 bg-gray-50/60 rounded-lg border border-gray-200/60">
          <p className="text-[10px] text-gray-400 uppercase tracking-wider mb-2 inline-flex items-center gap-1">
            <Filter className="w-3 h-3" />
            篩選條件（從草稿階段帶入 · 唯讀）
          </p>
          {conditions.length === 0 ? (
            <p className="text-xs text-gray-400">無篩選條件</p>
          ) : (
            <div className="flex flex-wrap gap-1.5">
              {conditions.map((cond, idx) => (
                <span
                  key={`${cond}-${idx}`}
                  className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs bg-white border border-gray-200 text-gray-700"
                >
                  {cond}
                </span>
              ))}
            </div>
          )}
        </div>

        {/* CR 開關 + 預估命中 */}
        <div className="p-3 bg-gray-50/60 rounded-lg border border-gray-200/60 flex flex-col justify-between gap-2">
          {crEnabled && (
            <div>
              <p className="text-[10px] text-gray-400 uppercase tracking-wider mb-1 inline-flex items-center gap-1">
                <Recycle className="w-3 h-3" />
                CR 回分開關
              </p>
              <span
                data-testid="cr-enabled-badge"
                className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-700"
              >
                CR 啟用
              </span>
            </div>
          )}
          {estimatedCount !== undefined && (
            <div data-testid="estimated-count">
              <p className="text-[10px] text-gray-400 uppercase tracking-wider inline-flex items-center gap-1">
                <Target className="w-3 h-3" />
                預估命中（Stage 0）
              </p>
              <p className="text-sm font-semibold text-gray-800 tabular-nums">
                {estimatedCount.toLocaleString()} 筆
              </p>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
