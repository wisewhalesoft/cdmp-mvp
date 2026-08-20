/**
 * ListEstimateOverviewSection — F120 / US-184「名單基礎預估數量總覽」前端 Component 測試
 *
 * 對應：
 *   - F120 spec §4 AC-LIST-03/04/05/06/07/08/09/10/11/12/14
 *   - F120 spec §9（術語黑名單）/ §9.2（允許用語，逐字文案）
 *   - AD-E07-51 §6.2（response shape）/ §7（前端架構：後端算好，顯示層僅呈現＋decode＋格式化）
 *   - ui-ux-design-overview 附錄 D（D-3 分組列＝小計列 / D-4 chip 不串接 / D-5 截斷與展開 /
 *     D-6 處長三觸點 / D-8 單一名單佔比降級 / D-9 無估算值三層標記 / D-13 條件不去重）
 *   - prototype `prototypes/30-stage0-estimate.html`（data-testid 掛點來源，UI ground truth）
 *
 * 元件本身依 AD-E07-51 §4.2/§7 之分工：後端已算好 groups[]/subtotalCount/percent 等數值，
 * 本元件只負責渲染、條件字串格式化（既有 formatConditionSummary()）與分組標籤 decode
 * （既有 useConditionDecoder()）——因此本測試以「後端回應 shape」為 props 餵入，不 mock fetch。
 *
 * ⚠️ Blindness：本檔未讀取 stage0-estimate-page.tsx 或任何 F120 production 程式碼。
 * `../_components/list-estimate-overview-section` 尚不存在（依 AD-E07-51 §10 檔案清單之
 * 建議命名撰寫，非既有檔案；若 tdd-implementation 採用不同路徑，請透過訊息通知 test-generator
 * 調整 import，詳見 docs/test-specs/risks-and-gaps.md）。本檔預期為 RED（Cannot find module）。
 */
import { render, screen, cleanup, fireEvent, waitFor, within } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
// eslint-disable-next-line import/no-unresolved
import { ListEstimateOverviewSection } from '../_components/list-estimate-overview-section';
import * as pooldataFieldsApi from '@/api/pooldata-fields';
import * as cardTypeApi from '@/api/card-type';
import { __resetConditionDecoderCache } from '../_hooks/use-condition-decoder';
import {
  DECODER_FIELDS,
  DECODER_CARD_TYPES,
  optionsResponseFor,
} from '../_hooks/__tests__/condition-decoder-fixtures';
import type { ConditionItem } from '@/api/assignment-list';

vi.mock('@/api/pooldata-fields', async () => {
  const actual = await vi.importActual<typeof pooldataFieldsApi>('@/api/pooldata-fields');
  return { ...actual, listFields: vi.fn(), listOptions: vi.fn() };
});
vi.mock('@/api/card-type', async () => {
  const actual = await vi.importActual<typeof cardTypeApi>('@/api/card-type');
  return { ...actual, listCardTypes: vi.fn() };
});

const mockedListFields = vi.mocked(pooldataFieldsApi.listFields);
const mockedListOptions = vi.mocked(pooldataFieldsApi.listOptions);
const mockedListCardTypes = vi.mocked(cardTypeApi.listCardTypes);

// ---------------------------------------------------------------------------
// F120 §9.1 術語黑名單（本區塊追加，疊加 F049 §19.1；僅取本區塊直接相關子集）
// ---------------------------------------------------------------------------
const TERM_BLACKLIST = [
  'ob_list_definition',
  'pooldata_field_option',
  'condition_payload',
  'prod_kind',
  'list_no',
  'list_nm',
  'stage0_estimate_count',
  'stage0_estimated_at',
  'MULTI',
  'UNCLASSIFIED',
  'groupKey',
  'groupType',
  'estimateUnavailable',
  'listTotals',
  'STAGE0_LIST_ESTIMATE_PARTIAL',
  'STAGE0_DEPT_ESTIMATE_TIMEOUT_MS',
  'contains',
  'not_contains',
  'equals',
  'operator',
  'keyword',
  'fieldType',
  'categorical',
  '$$',
  'JSONB',
];

// ---------------------------------------------------------------------------
// Fixture builders（比照 AD-E07-51 §6.2 之回應 shape，逐欄位對照已核可命名）
// ---------------------------------------------------------------------------
type Scope = { role: 'director' | 'section_chief' | 'admin'; deptCode: string | null; listOverviewScoped: boolean };
interface ListRow {
  listNo: string;
  listNm: string;
  conditions: ConditionItem[];
  estimatedCount: number | null;
  estimateUnavailable: boolean;
}
interface Group {
  groupKey: string;
  groupType: 'code' | 'multi' | 'unclassified';
  optionValue: string | null;
  displayOrder: number | null;
  listCount: number;
  estimatedListCount: number;
  subtotalCount: number;
  percent: number | null;
  lists: ListRow[];
}
interface OverviewData {
  ym: string;
  mode: 'aggregated' | 'single-list';
  listNo: string | null;
  scope: Scope;
  totalListCount: number;
  totalEstimatedCount: number;
  unestimatedListCount: number;
  groups: Group[];
  warnings: Array<{ code: string; listNo?: string; message?: string }>;
}

function listRow(over: Partial<ListRow>): ListRow {
  return {
    listNo: 'OB202605001',
    listNm: '測試名單',
    conditions: [{ columnName: 'prod_kind', fieldType: 'categorical', values: ['01'] } as ConditionItem],
    estimatedCount: 1000,
    estimateUnavailable: false,
    ...over,
  };
}

function group(over: Partial<Group>): Group {
  return {
    groupKey: '01',
    groupType: 'code',
    optionValue: '01',
    displayOrder: 0,
    listCount: 1,
    estimatedListCount: 1,
    subtotalCount: 1000,
    percent: 100,
    lists: [listRow({})],
    ...over,
  };
}

function overviewData(over: Partial<OverviewData> = {}): OverviewData {
  return {
    ym: '202606',
    mode: 'aggregated',
    listNo: null,
    scope: { role: 'director', deptCode: null, listOverviewScoped: false },
    totalListCount: 1,
    totalEstimatedCount: 1000,
    unestimatedListCount: 0,
    groups: [group({})],
    warnings: [],
    ...over,
  };
}

function renderSection(data: OverviewData) {
  return render(<ListEstimateOverviewSection data={data} />);
}

beforeEach(() => {
  vi.clearAllMocks();
  __resetConditionDecoderCache();
  mockedListFields.mockResolvedValue(DECODER_FIELDS);
  mockedListOptions.mockImplementation(async (col: string) => optionsResponseFor(col));
  mockedListCardTypes.mockResolvedValue(DECODER_CARD_TYPES);
});
afterEach(() => {
  cleanup();
  // 衛生性收尾：本檔為 useConditionDecoder() 真實 hook 之消費者之一（非 mock 掉整個 hook），
  // 其模組層快取／inFlight Promise／version 計數器只在 beforeEach「進入本檔下一測試前」重置；
  // 若同批次尚有其他測試檔在本檔「之後」才執行且共用同一模組實例，離開本檔的最後一個測試時
  // 快取仍停留在本檔填入的內容。此處於檔案層級再收一次尾，避免把「本檔專屬」的 mock 解析結果
  // 帶出本檔生命週期之外——與既有慣例一致（list-kanban-page.test.tsx 等既有檔亦於進入測試前
  // 呼叫 __resetConditionDecoderCache()，本檔額外於離開時比照處理）。
  __resetConditionDecoderCache();
  vi.restoreAllMocks();
});

describe('ListEstimateOverviewSection（F120 / US-184）', () => {
  // =====================================================================
  // AC-LIST-03：每筆名單顯示四項資訊
  // =====================================================================
  describe('AC-LIST-03：名單列顯示名單編號／名稱／條件／預估數量', () => {
    it('顯示名單編號、名稱，預估數量以千分位格式顯示', async () => {
      const data = overviewData({
        groups: [
          group({
            lists: [listRow({ listNo: 'OB202606001', listNm: '汽車期中名單', estimatedCount: 12000 })],
          }),
        ],
      });
      renderSection(data);
      expect(screen.getByText('OB202606001')).toBeInTheDocument();
      expect(screen.getByText('汽車期中名單')).toBeInTheDocument();
      expect(screen.getByText('12,000')).toBeInTheDocument();
    });
  });

  // =====================================================================
  // AC-LIST-04：篩選條件（chip / 不去重 / 截斷+展開 / 且說明 / 空狀態）
  // =====================================================================
  describe('AC-LIST-04：篩選條件欄位', () => {
    it('每筆條件各自一個標籤（chip），不以分隔字元串接成一句', async () => {
      const data = overviewData({
        groups: [
          group({
            lists: [
              listRow({
                conditions: [
                  { columnName: 'prod_kind', fieldType: 'categorical', values: ['01'] } as ConditionItem,
                  { columnName: 'case_status', fieldType: 'categorical', values: ['01'] } as ConditionItem,
                ],
              }),
            ],
          }),
        ],
      });
      renderSection(data);
      await waitFor(() => {
        expect(screen.getByText('產品類別：汽車')).toBeInTheDocument();
      });
      // 第二筆條件（案件結清期別）亦獨立呈現，而非併入同一段文字
      await waitFor(() => {
        expect(screen.getByText(/案件結清期別|結清期別/)).toBeInTheDocument();
      });
      // 不得把兩筆條件用頓號 / 逗號串接成單一句子
      expect(screen.queryByText('產品類別：汽車、案件結清期別：期中(不含當月滿期)')).not.toBeInTheDocument();
    });

    it('★D-13 / AC-LIST-04：重複可選值不去重顯示（values=[01,01] → 「產品類別：汽車、汽車」，刻意行為，不得「修正」', async () => {
      const data = overviewData({
        groups: [
          group({
            lists: [
              listRow({
                conditions: [
                  { columnName: 'prod_kind', fieldType: 'categorical', values: ['01', '01'] } as ConditionItem,
                ],
              }),
            ],
          }),
        ],
      });
      renderSection(data);
      await waitFor(() => {
        expect(screen.getByText('產品類別：汽車、汽車')).toBeInTheDocument();
      });
    });

    it('底部說明句明確指出多個條件為「且」的關係', async () => {
      renderSection(overviewData({}));
      await waitFor(() => {
        expect(screen.getByText(/且/)).toBeInTheDocument();
      });
    });

    it('條件為空陣列 → 顯示「（未設定篩選條件）」，不得顯示空白', () => {
      const data = overviewData({
        groups: [group({ lists: [listRow({ conditions: [] })] })],
      });
      renderSection(data);
      expect(screen.getByTestId('list-overview-no-condition')).toHaveTextContent('（未設定篩選條件）');
    });

    it('超過 2 筆條件 → 預設只顯示前 2 筆 ＋「＋N 項」按鈕；點擊後就地展開第 3 筆；焦點回到同一顆按鈕', async () => {
      const conditions = [
        { columnName: 'prod_kind', fieldType: 'categorical', values: ['01'] } as ConditionItem,
        { columnName: 'case_status', fieldType: 'categorical', values: ['01'] } as ConditionItem,
        { columnName: 'settle_src', fieldType: 'categorical', values: ['Y'] } as ConditionItem,
      ];
      const data = overviewData({
        groups: [group({ lists: [listRow({ listNo: 'OB999', conditions })] })],
      });
      renderSection(data);

      await waitFor(() => expect(screen.getByText('產品類別：汽車')).toBeInTheDocument());
      // 預設只展示前 2 筆：第 3 筆（他行代償）尚未出現
      expect(screen.queryByText(/他行代償/)).not.toBeInTheDocument();

      const toggle = screen.getByTestId('list-overview-cond-toggle');
      expect(toggle.textContent).toMatch(/＋1 項|\+1/);

      fireEvent.click(toggle);
      await waitFor(() => expect(screen.getByText(/他行代償/)).toBeInTheDocument());
      expect(toggle).toHaveFocus();
    });

    it('明確不使用 hover-only 呈現：展開控制項為真正的 <button>（可被 role 查得，非僅 title/hover）', () => {
      const conditions = [
        { columnName: 'prod_kind', fieldType: 'categorical', values: ['01'] } as ConditionItem,
        { columnName: 'case_status', fieldType: 'categorical', values: ['01'] } as ConditionItem,
        { columnName: 'settle_src', fieldType: 'categorical', values: ['Y'] } as ConditionItem,
      ];
      const data = overviewData({ groups: [group({ lists: [listRow({ conditions })] })] });
      renderSection(data);
      const toggle = screen.getByTestId('list-overview-cond-toggle');
      expect(toggle.tagName).toBe('BUTTON');
    });
  });

  // =====================================================================
  // AC-LIST-05：分組標題來自白名單 decode（TC-184-06 regression）
  // =====================================================================
  describe('AC-LIST-05：分組標題經 decode 取得，非硬編碼', () => {
    it('TC-184-06：白名單 label 變更後，分組標題同步反映（regression：非固定字串）', async () => {
      mockedListOptions.mockImplementation(async (col: string) => {
        if (col === 'prod_kind') {
          return {
            options: [{ columnName: 'prod_kind', optionValue: '01', optionLabel: '測試代碼汽車', isActive: true, createdAt: '', updatedAt: '' }],
          };
        }
        return optionsResponseFor(col);
      });
      const data = overviewData({ groups: [group({ groupKey: '01', optionValue: '01' })] });
      renderSection(data);
      await waitFor(() => {
        expect(screen.getByTestId('list-overview-group-label')).toHaveTextContent('測試代碼汽車');
      });
    });

    it('查無代碼時 fallback 顯示原始代碼（未登錄代碼組 09）', async () => {
      const data = overviewData({
        groups: [
          group({
            groupKey: '09',
            groupType: 'code',
            optionValue: '09',
            displayOrder: null,
            lists: [listRow({ listNo: 'OB009' })],
          }),
        ],
      });
      renderSection(data);
      await waitFor(() => {
        expect(screen.getByTestId('list-overview-group-label')).toHaveTextContent('09');
      });
    });

    it('多重產品類別 / 未分類為固定業務文案，不查白名單', () => {
      const data = overviewData({
        groups: [
          group({ groupKey: 'MULTI', groupType: 'multi', optionValue: null, displayOrder: null, lists: [listRow({ listNo: 'OB010' })] }),
          group({ groupKey: 'UNCLASSIFIED', groupType: 'unclassified', optionValue: null, displayOrder: null, lists: [listRow({ listNo: 'OB011' })] }),
        ],
      });
      renderSection(data);
      expect(screen.getByText('多重產品類別')).toBeInTheDocument();
      expect(screen.getByText('未分類')).toBeInTheDocument();
    });
  });

  // =====================================================================
  // AC-LIST-07：顯示層不得重排（陣列順序即顯示順序）
  // =====================================================================
  describe('AC-LIST-07：顯示層不得重排 groups[]（陣列順序即顯示順序）', () => {
    it('groups[] 依給定順序渲染（即使字母序看似相反）', () => {
      const data = overviewData({
        groups: [
          group({ groupKey: '03', optionValue: '03', lists: [listRow({ listNo: 'C1' })] }),
          group({ groupKey: '01', optionValue: '01', lists: [listRow({ listNo: 'A1' })] }),
        ],
      });
      renderSection(data);
      const rows = screen.getAllByTestId('list-overview-group-row');
      expect(rows[0]).toHaveAttribute('data-group-code', '03');
      expect(rows[1]).toHaveAttribute('data-group-code', '01');
    });
  });

  // =====================================================================
  // AC-LIST-08：分組小計＝分組標題列（D-3）；佔比兩情境；空分組隱藏
  // =====================================================================
  describe('AC-LIST-08：分組列即小計列，收合不藏數字', () => {
    it('分組標題列顯示名單數／小計／佔比；收合分組後（隱藏名單列）三個數字仍可見', async () => {
      const data = overviewData({
        groups: [group({ listCount: 2, subtotalCount: 4200, percent: 42 })],
      });
      renderSection(data);
      const row = screen.getAllByTestId('list-overview-group-row')[0];
      expect(within(row).getByTestId('list-overview-group-listcount')).toHaveTextContent('2');
      expect(within(row).getByTestId('list-overview-group-subtotal')).toHaveTextContent('4,200');
      expect(within(row).getByTestId('list-overview-group-percent')).toHaveTextContent('42%');

      const toggle = within(row).getByTestId('list-overview-group-toggle');
      fireEvent.click(toggle);

      // 收合後：名單列容器隱藏或不可見，但分組列數字仍在
      const rowAfter = screen.getAllByTestId('list-overview-group-row')[0];
      expect(within(rowAfter).getByTestId('list-overview-group-listcount')).toHaveTextContent('2');
      expect(within(rowAfter).getByTestId('list-overview-group-subtotal')).toHaveTextContent('4,200');
      expect(within(rowAfter).getByTestId('list-overview-group-percent')).toHaveTextContent('42%');
    });

    it('收合互動之焦點回到觸發的同一顆摺疊按鈕', async () => {
      renderSection(overviewData({}));
      const toggle = screen.getAllByTestId('list-overview-group-toggle')[0];
      fireEvent.click(toggle);
      await waitFor(() => {
        const toggleAfter = screen.getAllByTestId('list-overview-group-toggle')[0];
        expect(toggleAfter).toHaveFocus();
      });
    });
  });

  describe('AC-LIST-08 / BR-8：佔比計算之兩種情境對照（★高風險：勿混淆）', () => {
    it('分母（總計）> 0、分子（分組小計）也 > 0 → 顯示整數百分比', () => {
      const data = overviewData({
        totalEstimatedCount: 10000,
        groups: [group({ subtotalCount: 4200, percent: 42 })],
      });
      renderSection(data);
      expect(screen.getByTestId('list-overview-group-percent')).toHaveTextContent('42%');
    });

    it('★分子為 0、分母 > 0 → 必須顯示「0%」（非「—」）；不得誤判為缺陷', () => {
      const data = overviewData({
        totalEstimatedCount: 500,
        groups: [
          group({ groupKey: '01', subtotalCount: 500, percent: 100 }),
          group({
            groupKey: '02',
            optionValue: '02',
            listCount: 1,
            estimatedListCount: 0,
            subtotalCount: 0,
            percent: 0,
            lists: [listRow({ listNo: 'OB-UNEST', estimatedCount: null, estimateUnavailable: true })],
          }),
        ],
      });
      renderSection(data);
      const rows = screen.getAllByTestId('list-overview-group-row');
      const g02 = rows.find((r) => r.getAttribute('data-group-code') === '02')!;
      expect(within(g02).getByTestId('list-overview-group-percent')).toHaveTextContent('0%');
      expect(within(g02).queryByText('—')).not.toBeInTheDocument();
    });

    it('★分母（總計）= 0（全部名單皆無估算值）→ 所有分組皆顯示「—」，不得出現 0% / NaN / Infinity', () => {
      const data = overviewData({
        totalEstimatedCount: 0,
        unestimatedListCount: 2,
        groups: [
          group({
            groupKey: '01',
            listCount: 1,
            estimatedListCount: 0,
            subtotalCount: 0,
            percent: null,
            lists: [listRow({ listNo: 'A', estimatedCount: null, estimateUnavailable: true })],
          }),
          group({
            groupKey: '02',
            optionValue: '02',
            listCount: 1,
            estimatedListCount: 0,
            subtotalCount: 0,
            percent: null,
            lists: [listRow({ listNo: 'B', estimatedCount: null, estimateUnavailable: true })],
          }),
        ],
      });
      renderSection(data);
      const rows = screen.getAllByTestId('list-overview-group-row');
      rows.forEach((row) => {
        expect(within(row).getByTestId('list-overview-group-percent')).toHaveTextContent('—');
      });
      expect(screen.queryByText('0%')).not.toBeInTheDocument();
      expect(screen.queryByText(/NaN/)).not.toBeInTheDocument();
      expect(screen.queryByText(/Infinity/)).not.toBeInTheDocument();
    });
  });

  describe('BR-9：空分組（listCount=0）不顯示；組內全數未能估算（listCount>0、subtotal=0）仍顯示', () => {
    it('groups[] 中只含實際存在的分組（後端已過濾 listCount=0，元件不得自行補上空分組）', () => {
      const data = overviewData({ groups: [group({ groupKey: '01' })] });
      renderSection(data);
      const rows = screen.getAllByTestId('list-overview-group-row');
      expect(rows).toHaveLength(1);
      expect(screen.queryByText('機車')).not.toBeInTheDocument();
    });

    it('listCount>0 但 subtotalCount=0（組內全數未能估算）之分組仍顯示，並帶分組層級提示', () => {
      const data = overviewData({
        totalEstimatedCount: 500,
        groups: [
          group({ groupKey: '01', subtotalCount: 500, percent: 100 }),
          group({
            groupKey: '02',
            optionValue: '02',
            listCount: 1,
            estimatedListCount: 0,
            subtotalCount: 0,
            percent: 0,
            lists: [listRow({ listNo: 'OB-U', estimatedCount: null, estimateUnavailable: true })],
          }),
        ],
      });
      renderSection(data);
      const rows = screen.getAllByTestId('list-overview-group-row');
      expect(rows).toHaveLength(2);
      const g02 = rows.find((r) => r.getAttribute('data-group-code') === '02')!;
      expect(within(g02).getByTestId('list-overview-group-listcount')).toHaveTextContent('1');
      expect(g02.textContent).toMatch(/未能估算/);
    });
  });

  describe('OQ-F120-U2 / AC-LIST-08：單一名單鑽探模式之佔比降級', () => {
    it('保留佔比欄位、所有格顯示「—」、標題下加灰字副標；不得顯示 100%', () => {
      const data = overviewData({
        mode: 'single-list',
        listNo: 'OB202606001',
        totalListCount: 1,
        totalEstimatedCount: 1000,
        groups: [group({ percent: null })],
      });
      renderSection(data);
      expect(screen.getByTestId('list-overview-group-percent')).toHaveTextContent('—');
      expect(screen.queryByText('100%')).not.toBeInTheDocument();
      expect(screen.getByText(/單一名單檢視不計算佔比/)).toBeInTheDocument();
      // 欄位未被抽掉：表頭仍有「佔比」欄（副標亦以「佔比」結尾，故用 getAllByText 容忍多筆命中）
      expect(screen.getAllByText(/佔比/).length).toBeGreaterThan(0);
    });
  });

  // =====================================================================
  // AC-LIST-09：總計列
  // =====================================================================
  describe('AC-LIST-09：總計列顯示名單總數與預估數量總計', () => {
    it('總計列顯示 totalListCount / totalEstimatedCount（直接採用後端給值，不重新計算）', () => {
      const data = overviewData({
        totalListCount: 12,
        totalEstimatedCount: 28500,
        groups: [group({})],
      });
      renderSection(data);
      const totalRow = screen.getByTestId('list-overview-total-row');
      expect(within(totalRow).getByTestId('list-overview-total-listcount')).toHaveTextContent('12');
      expect(within(totalRow).getByTestId('list-overview-total-estimated')).toHaveTextContent('28,500');
    });
  });

  // =====================================================================
  // AC-LIST-10：無估算值名單三層標記
  // =====================================================================
  describe('AC-LIST-10：無估算值名單之三層標記（列／組／區塊）', () => {
    it('名單列：顯示「—」＋「未能估算」徽章，不得顯示 0 或空白', () => {
      const data = overviewData({
        groups: [group({ lists: [listRow({ estimatedCount: null, estimateUnavailable: true })] })],
      });
      renderSection(data);
      const row = screen.getByTestId('list-overview-list-row');
      expect(row).toHaveTextContent('—');
      expect(within(row).getByTestId('list-overview-unestimated-badge')).toBeInTheDocument();
      expect(row.textContent).not.toMatch(/^0$/);
    });

    it('分組層級：顯示「本組合計未涵蓋 N 張未能估算的名單」或等義（含具體數字）', () => {
      const data = overviewData({
        totalEstimatedCount: 0,
        groups: [
          group({
            listCount: 2,
            estimatedListCount: 0,
            subtotalCount: 0,
            percent: null,
            lists: [
              listRow({ listNo: 'A', estimatedCount: null, estimateUnavailable: true }),
              listRow({ listNo: 'B', estimatedCount: null, estimateUnavailable: true }),
            ],
          }),
        ],
      });
      renderSection(data);
      const row = screen.getAllByTestId('list-overview-group-row')[0];
      expect(row.textContent).toMatch(/未能估算/);
      expect(row.textContent).toMatch(/2/);
    });

    it('區塊層級：unestimatedListCount>0 時，區塊標題／總計旁出現「不完整」徽章', () => {
      const data = overviewData({
        unestimatedListCount: 1,
        totalEstimatedCount: 1000,
      });
      renderSection(data);
      expect(screen.getAllByText('不完整').length).toBeGreaterThan(0);
    });

    it('unestimatedListCount=0 時，不出現「不完整」徽章', () => {
      const data = overviewData({ unestimatedListCount: 0 });
      renderSection(data);
      expect(screen.queryByText('不完整')).not.toBeInTheDocument();
    });
  });

  // =====================================================================
  // AC-LIST-11：處長三觸點（★高風險：僅做一或兩處視為未通過）
  // =====================================================================
  describe('AC-LIST-11：業務處長之三個必要語意標示觸點', () => {
    it('★role=section_chief → 三個觸點皆須出現：標題徽章／說明條第一行逐字／總計後綴', () => {
      const data = overviewData({ scope: { role: 'section_chief', deptCode: 'XVE1', listOverviewScoped: false } });
      renderSection(data);

      // 觸點①：標題徽章「全公司口徑」
      expect(screen.getByTestId('list-overview-org-scope-badge')).toHaveTextContent('全公司口徑');

      // 觸點②：說明條第一行逐字
      expect(screen.getByTestId('list-overview-chief-notice')).toHaveTextContent(
        '本區塊為全公司名單層總量，非您所屬轄區之分派量',
      );

      // 觸點③：總計列後綴「（全公司口徑）」
      const totalRow = screen.getByTestId('list-overview-total-row');
      expect(totalRow.textContent).toMatch(/總計.*（全公司口徑）/);
    });

    it('role=section_chief 且 scope.deptCode=null（無轄區）→ 三個觸點仍須完整出現（§6.3）', () => {
      const data = overviewData({ scope: { role: 'section_chief', deptCode: null, listOverviewScoped: false } });
      renderSection(data);
      expect(screen.getByTestId('list-overview-org-scope-badge')).toBeInTheDocument();
      expect(screen.getByTestId('list-overview-chief-notice')).toBeInTheDocument();
      expect(screen.getByTestId('list-overview-total-row').textContent).toMatch(/（全公司口徑）/);
    });

    it('role=director → 三個觸點皆不出現（比照 prototype：僅處長需要語意標示）', () => {
      const data = overviewData({ scope: { role: 'director', deptCode: null, listOverviewScoped: false } });
      renderSection(data);
      expect(screen.queryByTestId('list-overview-org-scope-badge')).not.toBeInTheDocument();
      expect(screen.queryByTestId('list-overview-chief-notice')).not.toBeInTheDocument();
      expect(screen.getByTestId('list-overview-total-row').textContent).not.toMatch(/（全公司口徑）/);
    });

    it('role=admin → 三個觸點皆不出現', () => {
      const data = overviewData({ scope: { role: 'admin', deptCode: null, listOverviewScoped: false } });
      renderSection(data);
      expect(screen.queryByTestId('list-overview-org-scope-badge')).not.toBeInTheDocument();
      expect(screen.queryByTestId('list-overview-chief-notice')).not.toBeInTheDocument();
    });
  });

  // =====================================================================
  // AC-LIST-12：空狀態
  // =====================================================================
  describe('AC-LIST-12：當月無啟用名單之空狀態', () => {
    it('totalListCount=0 → 顯示空狀態文案，不渲染分組列／名單列／總計列', () => {
      const data = overviewData({
        totalListCount: 0,
        totalEstimatedCount: 0,
        unestimatedListCount: 0,
        groups: [],
      });
      renderSection(data);
      expect(screen.getByTestId('list-overview-empty')).toHaveTextContent(
        '本月尚無啟用名單，請先於名單定義頁建立並啟用名單',
      );
      expect(screen.queryByTestId('list-overview-group-row')).not.toBeInTheDocument();
      expect(screen.queryByTestId('list-overview-list-row')).not.toBeInTheDocument();
      expect(screen.queryByTestId('list-overview-total-row')).not.toBeInTheDocument();
    });
  });

  // =====================================================================
  // AC-LIST-14：術語黑名單全文掃描（比照 US-170 TC-170-01 之先例）
  // =====================================================================
  describe('AC-LIST-14：術語黑名單全文掃描（§9.1）', () => {
    it('富含各種狀態（多分組／未能估算／處長）之渲染結果，不含任何黑名單字串', async () => {
      const data = overviewData({
        scope: { role: 'section_chief', deptCode: 'XVE1', listOverviewScoped: false },
        totalListCount: 4,
        totalEstimatedCount: 1000,
        unestimatedListCount: 1,
        groups: [
          group({
            groupKey: '01',
            lists: [
              listRow({ listNo: 'OB1', estimatedCount: 1000 }),
              listRow({ listNo: 'OB2', estimatedCount: null, estimateUnavailable: true }),
            ],
            listCount: 2,
            subtotalCount: 1000,
          }),
          group({
            groupKey: 'MULTI',
            groupType: 'multi',
            optionValue: null,
            displayOrder: null,
            lists: [listRow({ listNo: 'OB3', conditions: [
              { columnName: 'prod_kind', fieldType: 'categorical', values: ['01', '02'] } as ConditionItem,
            ] })],
          }),
          group({
            groupKey: 'UNCLASSIFIED',
            groupType: 'unclassified',
            optionValue: null,
            displayOrder: null,
            lists: [listRow({ listNo: 'OB4', conditions: [] })],
          }),
        ],
      });
      const { container } = renderSection(data);
      // OB1/OB2 皆帶預設「產品類別：汽車」條件，等待解碼完成即可（可能有多筆相同文字，用 getAllByText 容忍）
      await waitFor(() => expect(screen.getAllByText('產品類別：汽車').length).toBeGreaterThan(0));

      const text = container.textContent ?? '';
      for (const term of TERM_BLACKLIST) {
        expect(text).not.toContain(term);
      }
      // 獨立字界的 'IN' 亦不得出現（避免與其他英文字混淆之誤判，僅檢查獨立單字）
      expect(text).not.toMatch(/\bIN\b/);
    });
  });
});
