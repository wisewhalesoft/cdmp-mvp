import { useMemo, useState } from 'react';
import {
  AlertCircle,
  Bike,
  Car,
  ChevronDown,
  ChevronRight,
  ChevronUp,
  ChevronsDownUp,
  ClipboardList,
  ClipboardX,
  Globe,
  HelpCircle,
  Hourglass,
  Info,
  Layers,
  Package,
} from 'lucide-react';
import type {
  ListEstimateOverviewGroup,
  ListEstimateOverviewListRow,
  ListEstimateOverviewResponse,
} from '@/api/assignment-run';
import { useConditionDecoder } from '../_hooks/use-condition-decoder';
import {
  formatConditionSummary,
  toSummaryDecoder,
} from '../_utils/condition-summary';

/**
 * F120 / US-184：Stage 0 試算頁「名單基礎預估數量總覽」區塊
 *
 * 對應 prototype `prototypes/30-stage0-estimate.html`（UI ground truth）＋ AD-E07-51 §7。
 *
 * 分工（AD-E07-51 §4.2 / §7）：**後端已算好** groups[] / 小計 / 佔比 / 總計，本元件只負責
 *   ①版面 ②條件描述字串（既有唯一格式化函式 `formatConditionSummary()`）
 *   ③分組標籤 decode（既有 `useConditionDecoder()`）。
 * 本元件**不得**重新計算任何數字、**不得**重排 `groups[]`（陣列順序即顯示順序，AC-LIST-07）。
 *
 * 三個高風險點（下游維護請勿「修正」）：
 *   1. **條件顯示端不做去重**（AC-LIST-04 v1.3）：`values = ['01','01']` 於畫面上即為
 *      「產品類別：汽車、汽車」。去重**僅**發生於後端之分組判定；顯示端一旦去重，本區塊
 *      與名單詳情之文字即不再逐字元相同，直接違反單一格式化來源。
 *   2. **佔比兩情境**（AC-LIST-08）：分子 0、分母 > 0 → `0%`（正確且必須顯示）；
 *      分母（總計）為 0 → 全部「—」（禁 `0%` / `NaN` / `Infinity`）。
 *   3. **處長三觸點缺一不可**（AC-LIST-11）：標題徽章／表格上方說明條／總計列後綴，
 *      觸發條件為 `scope.role === 'section_chief'`，**與有無轄區無關**。
 */

/** 預設顯示之條件筆數（沿用名單定義列表卡片之既有「前 N 筆 ＋N 項」慣例，全站單一截斷語彙）。 */
const CONDITION_PREVIEW_COUNT = 2;

/** 產品類別代碼之視覺樣式（僅圖示 / 配色；**標籤文字**一律由白名單 decode 取得，BR-5）。 */
const CODE_STYLE: Record<string, { icon: typeof Car; badge: string }> = {
  '01': { icon: Car, badge: 'bg-blue-100 text-blue-700' },
  '02': { icon: Bike, badge: 'bg-emerald-100 text-emerald-700' },
  '03': { icon: Package, badge: 'bg-violet-100 text-violet-700' },
};

interface GroupPresentation {
  label: string;
  icon: typeof Car;
  badge: string;
  note: string;
  kind: 'code' | 'combined' | 'unset';
  /** 供 DOM 選擇器使用之穩定 id（合成分組刻意不用內部保留字，避免混入畫面文字）。 */
  domId: string;
}

/** 未能估算徽章（沿用同頁既有逾時語彙：琥珀 ＋ 沙漏；不得新增第二套顏色 / 圖示）。 */
function UnestimatedBadge({
  text,
  title,
  testId,
}: {
  text: string;
  title?: string;
  testId?: string;
}) {
  return (
    <span
      data-testid={testId ?? 'list-overview-unestimated-badge'}
      title={title}
      className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[10px] font-semibold bg-amber-100 text-amber-800 border border-amber-300 align-middle"
    >
      <Hourglass className="w-2.5 h-2.5" />
      {text}
    </span>
  );
}

export interface ListEstimateOverviewSectionProps {
  data: ListEstimateOverviewResponse;
}

export function ListEstimateOverviewSection({
  data,
}: ListEstimateOverviewSectionProps) {
  const isSectionChief = data.scope.role === 'section_chief';
  // 單一名單檢視下佔比恆為 100%，屬同義反覆且會被誤讀為「佔全月總量 100%」→ 整欄降級為「—」
  // （AC-LIST-08 / OQ-F120-U2：保留欄位、不得顯示 100%、不得抽掉欄位）。
  const percentApplicable = data.mode !== 'single-list';

  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});
  const [expandedConds, setExpandedConds] = useState<Record<string, boolean>>(
    {},
  );

  // 本區塊實際引用之欄位（含產品類別，供分組標籤 decode）
  const columns = useMemo(() => {
    const set = new Set<string>(['prod_kind']);
    for (const g of data.groups) {
      for (const l of g.lists) {
        for (const c of l.conditions) {
          if (c.columnName) set.add(c.columnName);
        }
      }
    }
    return Array.from(set);
  }, [data]);
  const decoder = useConditionDecoder(columns);
  const summaryDecoder = useMemo(() => toSummaryDecoder(decoder), [decoder]);

  const presentation = (g: ListEstimateOverviewGroup): GroupPresentation => {
    if (g.groupType === 'multi') {
      return {
        label: '多重產品類別',
        icon: Layers,
        badge: 'bg-gray-100 text-gray-600',
        note: '同時指定 2 種以上產品類別的名單',
        kind: 'combined',
        domId: 'g-combined',
      };
    }
    if (g.groupType === 'unclassified') {
      return {
        label: '未分類',
        icon: HelpCircle,
        badge: 'bg-gray-100 text-gray-600',
        note: '未指定產品類別，或以文字比對方式指定的名單',
        kind: 'unset',
        domId: 'g-unset',
      };
    }
    const code = g.optionValue ?? g.groupKey;
    const style = CODE_STYLE[code];
    // AC-LIST-05：標籤一律經白名單 decode（查無代碼時 fallback 顯示原始代碼，不臆測翻譯）
    return {
      label: decoder.decodeValue('prod_kind', code),
      icon: style?.icon ?? AlertCircle,
      badge: style?.badge ?? 'bg-gray-100 text-gray-500',
      // displayOrder 為 null ⇔ 該代碼未登錄於白名單（孤兒代碼組）
      note: g.displayOrder === null ? '此代碼尚未登錄於產品類別可選值清單' : '',
      kind: 'code',
      domId: `g-${code}`,
    };
  };

  const anyOpen = data.groups.some((g) => !collapsed[g.groupKey]);
  const toggleAll = () => {
    const next: Record<string, boolean> = {};
    for (const g of data.groups) next[g.groupKey] = anyOpen;
    setCollapsed(next);
  };

  return (
    <div
      data-testid="stage0-list-overview"
      className="bg-white rounded-xl border border-gray-200 overflow-hidden"
    >
      {/* ---- 區塊標題列 ---- */}
      <div className="px-5 py-3.5 border-b border-gray-200 flex items-center gap-3 flex-wrap">
        <ClipboardList className="w-4 h-4 text-primary" />
        <h3 className="text-sm font-semibold text-gray-800">
          名單基礎預估數量總覽
        </h3>
        <span className="inline-flex items-center gap-1.5">
          {/* 觸點①：處長標題徽章（AC-LIST-11） */}
          {isSectionChief && (
            <span
              data-testid="list-overview-org-scope-badge"
              className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-blue-100 text-blue-800 border border-blue-200"
            >
              <Globe className="w-2.5 h-2.5" />
              全公司口徑
            </span>
          )}
          {/* 區塊層級標記（AC-LIST-10 第③層：總計最容易被誤讀為完整值） */}
          {data.unestimatedListCount > 0 && (
            <UnestimatedBadge
              text="不完整"
              title={`本區塊之預估數量總計未涵蓋 ${data.unestimatedListCount} 張未能估算的名單`}
              testId="list-overview-block-incomplete-badge"
            />
          )}
        </span>
        <span className="text-xs text-gray-400">
          以名單為單位列出本月啟用名單，依產品類別分組小計
        </span>
        {data.totalListCount > 0 && (
          <button
            type="button"
            data-testid="list-overview-toggle-all"
            onClick={(e) => {
              e.currentTarget.focus();
              toggleAll();
            }}
            className="ml-auto inline-flex items-center gap-1 px-2 py-1 rounded border border-gray-200 text-xs text-gray-600 hover:border-primary hover:text-primary focus:outline-none focus:ring-2 focus:ring-primary/30"
          >
            <ChevronsDownUp className="w-3.5 h-3.5" />
            {anyOpen ? '全部收合' : '全部展開'}
          </button>
        )}
      </div>

      {/* ---- 觸點②：處長說明條（表格正上方；第一行為逐字要求文案）---- */}
      {isSectionChief && (
        <div className="mx-5 mt-4 mb-1 flex items-start gap-2 p-3 bg-blue-50 border border-blue-200 rounded-lg">
          <Globe className="w-4 h-4 text-primary mt-0.5 shrink-0" />
          <div className="min-w-0">
            <p
              data-testid="list-overview-chief-notice"
              className="text-sm font-semibold text-blue-900"
            >
              本區塊為全公司名單層總量，非您所屬轄區之分派量
            </p>
            <p className="text-xs text-blue-800 mt-0.5">
              上方兩個部門區塊只顯示您的轄區部門；本區塊列出的是本月全公司所有啟用名單，兩者口徑不同，請勿相加或直接比較。
            </p>
          </div>
        </div>
      )}

      {/* ---- 空狀態（AC-LIST-12：不渲染任何分組、名單列、小計或總計）---- */}
      {data.totalListCount === 0 ? (
        <div
          data-testid="list-overview-empty"
          className="px-5 py-12 flex flex-col items-center text-center"
        >
          <div className="w-12 h-12 rounded-full bg-gray-100 flex items-center justify-center mb-3">
            <ClipboardX className="w-6 h-6 text-gray-400" />
          </div>
          <p className="text-sm text-gray-600">
            本月尚無啟用名單，請先於名單定義頁建立並啟用名單
          </p>
          {/* 刻意使用原生 <a>（非 react-router Link）：本元件為純呈現元件，不得要求
              呼叫端提供 Router context（ring 測試以 render(<Section data={...} />) 裸渲染）。 */}
          <a
            href="/assignment/list-definitions"
            className="mt-3 inline-flex items-center gap-1.5 px-3 py-1.5 border border-gray-200 rounded-md text-xs text-gray-600 hover:border-primary hover:text-primary"
          >
            <ClipboardList className="w-3.5 h-3.5" />
            前往名單定義
          </a>
        </div>
      ) : (
        <>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-200 bg-gray-50/40 text-xs text-gray-500 tracking-wider">
                  <th className="text-left px-5 py-2.5 font-medium">名單編號</th>
                  <th className="text-left px-5 py-2.5 font-medium">名單名稱</th>
                  <th className="text-left px-5 py-2.5 font-medium">篩選條件</th>
                  <th className="text-right px-5 py-2.5 font-medium whitespace-nowrap">
                    名單數
                  </th>
                  <th className="text-right px-5 py-2.5 font-medium whitespace-nowrap">
                    預估數量
                  </th>
                  <th className="text-right px-5 py-2.5 font-medium whitespace-nowrap align-top">
                    佔比
                    {!percentApplicable && (
                      <span className="block text-[10px] font-normal text-gray-400 tracking-normal">
                        單一名單檢視不計算佔比
                      </span>
                    )}
                  </th>
                </tr>
              </thead>

              {/* 分組列即小計列 → 收合分組時名單數／小計／佔比恆可見（AC-LIST-08 / D-3）。 */}
              {data.groups.map((g) => {
                const p = presentation(g);
                const isCollapsed = !!collapsed[g.groupKey];
                const GroupIcon = p.icon;
                const groupUnestimated = g.listCount - g.estimatedListCount;
                return (
                  <tbody
                    key={g.groupKey}
                    data-testid="list-overview-group"
                    data-group-id={p.domId}
                  >
                    <tr
                      data-testid="list-overview-group-row"
                      data-group-id={p.domId}
                      data-group-kind={p.kind}
                      {...(p.kind === 'code'
                        ? { 'data-group-code': g.optionValue ?? g.groupKey }
                        : {})}
                      className="bg-gray-50/70 border-t border-gray-200"
                    >
                      <th
                        colSpan={3}
                        scope="colgroup"
                        className="text-left px-5 py-2.5 font-medium"
                      >
                        <span className="inline-flex items-center gap-2 flex-wrap">
                          <button
                            type="button"
                            data-testid="list-overview-group-toggle"
                            data-group-id={p.domId}
                            aria-expanded={!isCollapsed}
                            aria-controls={`lo-body-${p.domId}`}
                            onClick={(e) => {
                              e.currentTarget.focus();
                              setCollapsed((prev) => ({
                                ...prev,
                                [g.groupKey]: !prev[g.groupKey],
                              }));
                            }}
                            className="inline-flex items-center gap-1.5 rounded px-1 -mx-1 hover:bg-gray-100 focus:outline-none focus:ring-2 focus:ring-primary/30"
                          >
                            {isCollapsed ? (
                              <ChevronRight className="w-3.5 h-3.5 text-gray-400" />
                            ) : (
                              <ChevronDown className="w-3.5 h-3.5 text-gray-400" />
                            )}
                            <span
                              data-testid="list-overview-group-label"
                              className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold ${p.badge}`}
                            >
                              <GroupIcon className="w-3 h-3" />
                              {p.label}
                            </span>
                          </button>
                          {p.note && (
                            <span className="text-[11px] text-gray-400">
                              {p.note}
                            </span>
                          )}
                          {groupUnestimated > 0 && (
                            <UnestimatedBadge
                              text={`本組合計未涵蓋 ${groupUnestimated} 張未能估算的名單`}
                              title="這些名單仍計入本組名單數，但不計入預估數量小計"
                            />
                          )}
                        </span>
                      </th>
                      <td
                        data-testid="list-overview-group-listcount"
                        className="px-5 py-2.5 text-right tabular-nums text-sm text-gray-700"
                      >
                        {g.listCount}
                      </td>
                      <td
                        data-testid="list-overview-group-subtotal"
                        className="px-5 py-2.5 text-right tabular-nums text-sm font-semibold text-gray-900"
                      >
                        {g.subtotalCount.toLocaleString()}
                      </td>
                      <td
                        data-testid="list-overview-group-percent"
                        className={`px-5 py-2.5 text-right tabular-nums text-sm ${
                          !percentApplicable || g.percent === null
                            ? 'text-gray-300'
                            : 'text-gray-600'
                        }`}
                      >
                        {!percentApplicable || g.percent === null
                          ? '—'
                          : `${g.percent}%`}
                      </td>
                    </tr>
                    {!isCollapsed &&
                      g.lists.map((row) => (
                        <ListRow
                          key={row.listNo}
                          row={row}
                          expanded={!!expandedConds[row.listNo]}
                          onToggleConditions={() =>
                            setExpandedConds((prev) => ({
                              ...prev,
                              [row.listNo]: !prev[row.listNo],
                            }))
                          }
                          summaryDecoder={summaryDecoder}
                        />
                      ))}
                  </tbody>
                );
              })}

              {/* ---- 總計列（含觸點③：處長「（全公司口徑）」後綴）---- */}
              <tfoot>
                <tr
                  data-testid="list-overview-total-row"
                  data-total-list-count={data.totalListCount}
                  data-total-estimated={data.totalEstimatedCount}
                  className="border-t-2 border-gray-200 bg-gray-50/70"
                >
                  <td
                    colSpan={3}
                    className="px-5 py-3 text-sm font-bold text-gray-700"
                  >
                    總計
                    {isSectionChief && (
                      <span className="ml-1 text-xs font-medium text-blue-800">
                        （全公司口徑）
                      </span>
                    )}
                  </td>
                  <td className="px-5 py-3 text-right">
                    <div className="text-[10px] font-normal text-gray-500">
                      名單總數
                    </div>
                    <div
                      data-testid="list-overview-total-listcount"
                      className="tabular-nums text-sm font-bold text-gray-900"
                    >
                      {data.totalListCount}
                    </div>
                  </td>
                  <td className="px-5 py-3 text-right">
                    <div className="text-[10px] font-normal text-gray-500">
                      預估數量總計
                    </div>
                    <div
                      data-testid="list-overview-total-estimated"
                      className="tabular-nums text-sm font-bold text-gray-900"
                    >
                      {data.totalEstimatedCount.toLocaleString()}
                      {data.unestimatedListCount > 0 && (
                        <>
                          {' '}
                          <UnestimatedBadge
                            text="不完整"
                            title={`未涵蓋 ${data.unestimatedListCount} 張未能估算的名單`}
                            testId="list-overview-total-incomplete-badge"
                          />
                        </>
                      )}
                    </div>
                  </td>
                  <td className="px-5 py-3 text-right tabular-nums text-sm text-gray-300">
                    —
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>

          {/* ---- 區塊底部說明 ---- */}
          <div className="px-5 py-3 border-t border-gray-200 bg-gray-50/30 flex items-start gap-2 text-[11px] text-gray-500">
            <Info className="w-3.5 h-3.5 text-gray-400 mt-0.5 shrink-0" />
            <div>
              <p>
                分組列顯示該組的名單數、預估數量小計與佔比；最末列為名單總數與預估數量總計。同一名單的多個篩選條件為「且」的關係（需同時成立）。
              </p>
              {percentApplicable ? (
                <p>
                  佔比以預估數量總計為分母、四捨五入至整數；四捨五入後各組加總可能不等於
                  100%，屬正常現象。
                </p>
              ) : (
                <p>
                  目前為單一名單檢視，佔比不具比較意義，故不計算；改回「全部名單（彙總）」即會顯示各組佔比。
                </p>
              )}
              {data.unestimatedListCount > 0 && (
                <p>
                  標記「未能估算」的名單仍計入名單總數，但不計入任何預估數量小計與總計；完整清單與原因請見本頁上方提示。
                </p>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// 名單列
// ---------------------------------------------------------------------------

interface ListRowProps {
  row: ListEstimateOverviewListRow;
  expanded: boolean;
  onToggleConditions: () => void;
  summaryDecoder: ReturnType<typeof toSummaryDecoder>;
}

function ListRow({
  row,
  expanded,
  onToggleConditions,
  summaryDecoder,
}: ListRowProps) {
  const unestimated = row.estimateUnavailable || row.estimatedCount === null;
  return (
    <tr
      data-testid="list-overview-list-row"
      data-list-no={row.listNo}
      {...(unestimated ? { 'data-unestimated': 'true' } : {})}
      className={`border-t border-gray-200 ${unestimated ? 'bg-amber-50/40' : 'hover:bg-blue-50/20'}`}
    >
      <td className="pl-11 pr-5 py-2.5 align-top font-mono text-[11px] text-gray-500 whitespace-nowrap">
        {row.listNo}
      </td>
      <td className="px-5 py-2.5 align-top text-sm text-gray-800">
        {row.listNm}
      </td>
      <td className="px-5 py-2.5 align-top">
        <ConditionCell
          row={row}
          expanded={expanded}
          onToggle={onToggleConditions}
          summaryDecoder={summaryDecoder}
        />
      </td>
      <td className="px-5 py-2.5" />
      <td
        data-testid="list-overview-list-count"
        className="px-5 py-2.5 align-top text-right whitespace-nowrap"
      >
        {unestimated ? (
          <>
            <span className="tabular-nums text-gray-400 mr-1">—</span>
            <UnestimatedBadge text="未能估算" title="本次未納入合計" />
          </>
        ) : (
          <span className="tabular-nums text-sm text-gray-800">
            {(row.estimatedCount ?? 0).toLocaleString()}
          </span>
        )}
      </td>
      <td className="px-5 py-2.5" />
    </tr>
  );
}

// ---------------------------------------------------------------------------
// 篩選條件欄（每筆條件各自一個標籤；截斷＝前 2 筆 ＋「＋N 項」就地展開）
// ---------------------------------------------------------------------------

function ConditionCell({
  row,
  expanded,
  onToggle,
  summaryDecoder,
}: {
  row: ListEstimateOverviewListRow;
  expanded: boolean;
  onToggle: () => void;
  summaryDecoder: ReturnType<typeof toSummaryDecoder>;
}) {
  if (row.conditions.length === 0) {
    return (
      <span
        data-testid="list-overview-no-condition"
        className="text-xs text-gray-400 italic"
      >
        （未設定篩選條件）
      </span>
    );
  }

  const shown = expanded
    ? row.conditions
    : row.conditions.slice(0, CONDITION_PREVIEW_COUNT);
  const rest = row.conditions.length - CONDITION_PREVIEW_COUNT;

  return (
    <div className="flex flex-wrap items-center gap-1">
      {shown.map((cond, idx) => {
        // ★逐字輸出，顯示端**不做**去重 / 排序 / 合併（AC-LIST-04 v1.3，刻意行為）
        const text = formatConditionSummary(cond, summaryDecoder);
        return (
          <span
            key={`${cond.columnName}-${idx}`}
            title={text}
            data-condition-summary=""
            className="inline-block max-w-[18rem] truncate align-bottom px-1.5 py-0.5 bg-gray-50 text-gray-600 border border-gray-200 rounded text-[11px]"
          >
            {text}
          </span>
        );
      })}
      {rest > 0 && (
        <button
          type="button"
          data-testid="list-overview-cond-toggle"
          data-list-no={row.listNo}
          aria-expanded={expanded}
          onClick={(e) => {
            e.currentTarget.focus();
            onToggle();
          }}
          className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[11px] font-medium border border-blue-200 bg-blue-50 text-primary hover:bg-blue-100 focus:outline-none focus:ring-2 focus:ring-primary/30"
        >
          {expanded ? (
            <ChevronUp className="w-3 h-3" />
          ) : (
            <ChevronDown className="w-3 h-3" />
          )}
          {expanded ? '收合條件' : `＋${rest} 項`}
        </button>
      )}
    </div>
  );
}
