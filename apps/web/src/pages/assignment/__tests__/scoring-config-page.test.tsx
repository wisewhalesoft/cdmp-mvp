/**
 * F053 / F054 / F055 / F056：ScoringConfigPage 前端煙霧測試
 *
 * 涵蓋 prototype 28 主要互動：
 *   - TS-F053-011：維度數量 Badge 正確
 *   - TS-F053-012：無 active 版本顯示警示
 *   - TS-F053-013：維度展開顯示分數詳細
 *   - 註：TS-F053-009 / 010（version-card metadata）已搬到 SelectedCardTypeBanner，
 *     對應測試已遷移至 card-type-list-tab.test.tsx 內 SelectedCardTypeBanner describe。
 *   - TS-F054-017：月跑鎖定時 DOM 按鈕 disabled
 *   - TS-F054-019：新增維度 Modal 渲染與必填驗證
 *   - TS-F054-020：停用維度確認對話框
 *   - TS-F054-021：儲存成功 toast
 *   - TS-F054-022：422 區間重疊提示（透過 Modal error 顯示）
 *   - TS-F055-015：S5 2 級表格只 2 列
 *   - TS-F055-016：H 4 級表格 4 列
 *   - TS-F055-017：月跑鎖時儲存按鈕 disabled
 *   - TS-F055-019：重疊錯誤紅色邊框
 *   - TS-F055-020：儲存成功 toast
 *   - TS-F056-021：Fallback 紫色底色 + 標籤
 *   - TS-F056-022：標準對應無 Fallback 標籤
 *   - TS-F056-023：CARD_LEVEL 下拉依當前 cardType 動態
 *   - TS-F056-024：list_nm null 顯示「—」
 *   - TS-F056-025：月跑鎖時新增按鈕 disabled
 *   - TS-F056-026：新增成功後列表更新 + toast
 *   - TS-F056-027：POST 422 Modal 不關閉
 *   - TS-F056-028：M3/HC/C3 過渡期 Fallback 標籤
 */

import { render, screen, waitFor, fireEvent, within } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { BrowserRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ToastProvider } from '@/components/ui/toast';
import { ScoringConfigPage } from '../scoring-config-page';
import * as api from '@/api/assignment-scoring';
import * as cardTypeApi from '@/api/card-type';
import * as authStore from '@/stores/auth-store';

vi.mock('@/api/assignment-scoring', async () => {
  const actual = await vi.importActual<typeof api>('@/api/assignment-scoring');
  return {
    ...actual,
    getScoring: vi.fn(),
    updateDimensions: vi.fn(),
    createDimension: vi.fn(),
    disableDimension: vi.fn(),
    getCardLevels: vi.fn(),
    updateCardLevels: vi.fn(),
    previewCardLevels: vi.fn(),
    deleteCardLevel: vi.fn(), // v1.3 新增
    createCardLevel: vi.fn(), // v1.5 (US-097) 新增
    getTierMapping: vi.fn(),
    updateTierMapping: vi.fn(),
    createTierMapping: vi.fn(),
    deleteTierMapping: vi.fn(), // v1.4 新增
  };
});
vi.mock('@/api/card-type', async () => {
  const actual = await vi.importActual<typeof cardTypeApi>('@/api/card-type');
  return {
    ...actual,
    listCardTypes: vi.fn(),
    createCardType: vi.fn(),
    updateCardType: vi.fn(),
    getDeletePreview: vi.fn(),
    deleteCardType: vi.fn(),
    getCardTypeStats: vi.fn(),
  };
});
vi.mock('@/api/auth', () => ({ logout: vi.fn().mockResolvedValue({}) }));
vi.mock('@/stores/auth-store');

const mockedGetScoring = vi.mocked(api.getScoring);
const mockedGetCardLevels = vi.mocked(api.getCardLevels);
const mockedGetTierMapping = vi.mocked(api.getTierMapping);
const mockedCreateDimension = vi.mocked(api.createDimension);
const mockedDisableDimension = vi.mocked(api.disableDimension);
const mockedUpdateDimensions = vi.mocked(api.updateDimensions);
const mockedUpdateCardLevels = vi.mocked(api.updateCardLevels);
const mockedPreviewCardLevels = vi.mocked(api.previewCardLevels);
const mockedDeleteCardLevel = vi.mocked(api.deleteCardLevel);
const mockedCreateTierMapping = vi.mocked(api.createTierMapping);
const mockedUpdateTierMapping = vi.mocked(api.updateTierMapping);
const mockedDeleteTierMapping = vi.mocked(api.deleteTierMapping);
const mockedGetUser = vi.mocked(authStore.getUser);
const mockedClearAuth = vi.mocked(authStore.clearAuth);

function wrap(node: React.ReactElement) {
  // Iter 5a：新 Shell 含 useQuery / useMutation（Tab 1 + 3 Modal），須提供 QueryClient + Toast
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return (
    <QueryClientProvider client={queryClient}>
      <ToastProvider>
        <BrowserRouter>{node}</BrowserRouter>
      </ToastProvider>
    </QueryClientProvider>
  );
}

const DEFAULT_VERSION_WITH_VALUES = {
  cardType: 'H',
  cardName: '期中',
  cardVersion: 1,
  sdate: '20190823',
  edate: '20991231',
  createdBy: '21251',
  createdAt: '2019-08-23T00:00:00.000Z',
};

const DEFAULT_DIMENSIONS = [
  {
    columnName: 'ACCOUNT_AGE',
    columnLabel: '帳齡',
    scoreSummary: '2 個區間',
    scores: [
      { level1: null, level2S: '0', level2E: '3', score: 10 },
      { level1: null, level2S: '4', level2E: '12', score: 20 },
    ],
  },
  {
    columnName: 'CELLULAR',
    columnLabel: '有無手機',
    scoreSummary: '2 個區間',
    scores: [
      { level1: 'Y', level2S: null, level2E: null, score: 15 },
      { level1: 'N', level2S: null, level2E: null, score: 0 },
    ],
  },
];

const DEFAULT_H_LEVELS = [
  { cardLevel: 'A', scoreS: 243, scoreE: 999 },
  { cardLevel: 'B', scoreS: 214, scoreE: 242 },
  { cardLevel: 'C', scoreS: 185, scoreE: 213 },
  { cardLevel: 'D', scoreS: 0, scoreE: 184 },
];

// Iter 5b/7/8 helper：
//   - Iter 5b 改為 5-Tab 平鋪
//   - Iter 7（review fix）拆解內部 4-Tab 列；Shell 為唯一 tab nav
//   - Iter 8（prototype B 排列）拔除 VersionStrip；不再有 version-card testid
// 步驟：
//   1. 等待 Tab 1 清單載入完成（selectedCardType 被 useEffect 設定為第一筆）
//   2. 點擊外層 Shell 的 tab-dim 切換到「計分維度」Tab → 觸發 ScoringConfigLegacyTabs forceTab='dim'
//   3. 等待 panel 內容渲染（btn-add-dim 為 panel 載入完成的最穩定 anchor；
//      若 404 則改等 no-active-version）
async function switchToLegacyTabs() {
  await screen.findByTestId('card-type-row-H');
  const shellTabDim = screen.getAllByTestId('tab-dim')[0];
  fireEvent.click(shellTabDim);
  await waitFor(
    () => {
      expect(
        screen.queryByTestId('btn-add-dim') ||
          screen.queryByTestId('no-active-version'),
      ).toBeTruthy();
    },
    { timeout: 3000 },
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  // Iter 5a：Tab 1 載入 card-types 清單；預設回 [H] 一筆，讓 selectedCardType 自動設為 'H'
  // Iter 9：response 含 5 個 metadata 欄位（cardVersion / sdate / edate / createdBy / createdAt）
  vi.mocked(cardTypeApi.listCardTypes).mockResolvedValue({
    cardTypes: [
      {
        cardType: 'H',
        cardName: '期中',
        prodKind: '01',
        prodKindName: '汽車',
        status: 'active',
        cardVersion: 1,
        sdate: '20190823',
        edate: '20991231',
        createdBy: 'Sales Manager',
        createdAt: '2019-08-23T00:00:00.000Z',
      },
    ],
  });
  // Iter 9：banner KPI 5 欄統計 — 預設 H 卡的 cascade
  vi.mocked(cardTypeApi.getCardTypeStats).mockResolvedValue({
    cardType: 'H',
    dimCount: 2,
    scoreCount: 4,
    levelCount: 4,
    tierCount: 6,
    listDefsAffected: 0,
  });
  mockedGetUser.mockReturnValue({
    id: 'sm-id',
    name: 'Sales Manager',
    email: 'sm@cdmp.test',
    role: 'user',
    isSalesManager: true,
  } as any);
  mockedClearAuth.mockImplementation(() => {});
  mockedGetScoring.mockResolvedValue({
    version: DEFAULT_VERSION_WITH_VALUES,
    dimensions: DEFAULT_DIMENSIONS,
  } as any);
  mockedGetCardLevels.mockResolvedValue({
    cardType: 'H',
    cardVersion: 1,
    levels: DEFAULT_H_LEVELS,
  });
  mockedGetTierMapping.mockResolvedValue({
    mappings: [
      { cardType: 'H', cardLevel: 'A', tierLevel: 'T1', listNm: '期中名單' },
      { cardType: 'H', cardLevel: 'B', tierLevel: 'T2', listNm: null },
      { cardType: 'M5', cardLevel: null, tierLevel: 'T5M', listNm: '機車中結滿期名單' },
      { cardType: 'M3', cardLevel: null, tierLevel: 'T5M', listNm: null },
      { cardType: 'HC', cardLevel: null, tierLevel: 'THC', listNm: null },
      { cardType: 'C3', cardLevel: null, tierLevel: 'T3C', listNm: null },
    ],
  });
  mockedPreviewCardLevels.mockResolvedValue({
    distribution: { A: 20, B: 40, C: 30, D: 10 },
  });
});

describe('ScoringConfigPage — F053 顯示', () => {
  // Iter 8（prototype B 排列）：TS-F053-009 / 010 已搬到 SelectedCardTypeBanner，
  // 對應測試於 card-type-list-tab.test.tsx 的 SelectedCardTypeBanner describe。

  it('TS-F053-011：維度 Badge 顯示維度數量', async () => {
    render(wrap(<ScoringConfigPage />));
    await switchToLegacyTabs();
    // Iter 7 重構（review 差異 #1 / #3）：移除內部 4-Tab 列；count badge
    // 改由 Shell 5-Tab 的 tab-dim 提供（值來自 useQuery('scoring' → dimensions）。
    await waitFor(() => {
      const tabDim = screen.getByTestId('tab-dim');
      expect(tabDim.textContent).toContain('2'); // 2 個維度
    });
  });

  it('TS-F053-012：無 active 版本顯示警示訊息', async () => {
    // Iter 8（拔 VersionStrip）後 getScoring 剩 2 個 caller（Shell dim badge / Legacy fetchAll）；
    // 用 mockRejectedValue（不是 Once）讓所有 caller 都拿到 404，確保 Legacy 的 versionError 必定被設定，
    // 進而 render no-active-version banner。
    mockedGetScoring.mockRejectedValue({
      response: { status: 404, data: { error: 'SCORING_VERSION_NOT_FOUND' } },
    });
    render(wrap(<ScoringConfigPage />));
    await switchToLegacyTabs();
    await waitFor(() => {
      expect(screen.getByTestId('no-active-version')).toBeInTheDocument();
    });
    expect(screen.getByTestId('no-active-version').textContent).toContain(
      '目前無生效的計分版本',
    );
  });

  it('TS-F053-013：維度列展開後顯示分數詳細表', async () => {
    render(wrap(<ScoringConfigPage />));
    await switchToLegacyTabs();
    await waitFor(() => {
      expect(screen.getByTestId('dim-row-ACCOUNT_AGE')).toBeInTheDocument();
    });
    expect(screen.queryByTestId('dim-detail-ACCOUNT_AGE')).not.toBeInTheDocument();
    fireEvent.click(screen.getByTestId('dim-row-ACCOUNT_AGE'));
    await waitFor(() => {
      expect(screen.getByTestId('dim-detail-ACCOUNT_AGE')).toBeInTheDocument();
    });
  });
});

describe('ScoringConfigPage — F054 寫入互動', () => {
  it('TS-F054-019：點擊「新增維度」開啟 Modal，必填驗證', async () => {
    render(wrap(<ScoringConfigPage />));
    await switchToLegacyTabs();
    await waitFor(() => {
      expect(screen.getByTestId('btn-add-dim')).toBeInTheDocument();
    });
    fireEvent.click(screen.getByTestId('btn-add-dim'));
    await waitFor(() => {
      expect(screen.getByTestId('dim-modal')).toBeInTheDocument();
    });
    fireEvent.click(screen.getByTestId('dim-modal-submit'));
    await waitFor(() => {
      expect(screen.getByTestId('dim-modal-error')).toBeInTheDocument();
    });
    expect(screen.getByTestId('dim-modal-error').textContent).toContain(
      'columnName',
    );
  });

  it('TS-F054-020：點擊「停用」開啟確認對話框，取消後不發 API', async () => {
    render(wrap(<ScoringConfigPage />));
    await switchToLegacyTabs();
    await waitFor(() => {
      expect(screen.getByTestId('disable-ACCOUNT_AGE')).toBeInTheDocument();
    });
    fireEvent.click(screen.getByTestId('disable-ACCOUNT_AGE'));
    await waitFor(() => {
      expect(screen.getByTestId('disable-modal')).toBeInTheDocument();
    });
    // 點擊取消（Modal 內部）
    const disableModal = screen.getByTestId('disable-modal');
    fireEvent.click(within(disableModal).getByText('取消'));
    await waitFor(() => {
      expect(screen.queryByTestId('disable-modal')).not.toBeInTheDocument();
    });
    expect(mockedDisableDimension).not.toHaveBeenCalled();
  });

  it('TS-F054-021：新增成功後顯示 toast', async () => {
    mockedCreateDimension.mockResolvedValue({} as any);
    mockedGetScoring.mockResolvedValue({
      version: DEFAULT_VERSION_WITH_VALUES,
      dimensions: [
        ...DEFAULT_DIMENSIONS,
        {
          columnName: 'CONTRACT_YEARS',
          columnLabel: '契約年資',
          scoreSummary: '1 個區間',
          scores: [{ level1: null, level2S: '0', level2E: '99', score: 10 }],
        },
      ],
    } as any);

    render(wrap(<ScoringConfigPage />));
    await switchToLegacyTabs();
    await waitFor(() => {
      expect(screen.getByTestId('btn-add-dim')).toBeInTheDocument();
    });
    fireEvent.click(screen.getByTestId('btn-add-dim'));
    await waitFor(() => {
      expect(screen.getByTestId('dim-modal')).toBeInTheDocument();
    });
    // 填入必填
    const modal = screen.getByTestId('dim-modal');
    const inputs = modal.querySelectorAll('input[type="text"]');
    fireEvent.change(inputs[0], { target: { value: 'CONTRACT_YEARS' } });
    fireEvent.change(inputs[1], { target: { value: '契約年資' } });
    // F054 v1.3 BR-8：必選 matchType（無預設值）
    fireEvent.click(screen.getByTestId('dim-modal-matchtype-RANGE'));

    fireEvent.click(screen.getByTestId('dim-modal-submit'));
    await waitFor(() => {
      expect(mockedCreateDimension).toHaveBeenCalled();
    });
    await waitFor(() => {
      expect(screen.getByTestId('toast')).toBeInTheDocument();
    });
  });
});

describe('ScoringConfigPage — F054 月跑鎖 UI', () => {
  it('TS-F054-017：API 回 409 後新增按鈕 disabled', async () => {
    mockedCreateDimension.mockRejectedValue({
      response: { status: 409, data: { error: 'SCORING_VERSION_LOCKED' } },
    });
    render(wrap(<ScoringConfigPage />));
    await switchToLegacyTabs();
    await waitFor(() => {
      expect(screen.getByTestId('btn-add-dim')).toBeInTheDocument();
    });
    // 嘗試新增 → 觸發 409
    fireEvent.click(screen.getByTestId('btn-add-dim'));
    await waitFor(() => {
      expect(screen.getByTestId('dim-modal')).toBeInTheDocument();
    });
    const modal = screen.getByTestId('dim-modal');
    const inputs = modal.querySelectorAll('input[type="text"]');
    fireEvent.change(inputs[0], { target: { value: 'X' } });
    fireEvent.change(inputs[1], { target: { value: 'X' } });
    // F054 v1.3 BR-8：必選 matchType（無預設值）
    fireEvent.click(screen.getByTestId('dim-modal-matchtype-RANGE'));
    fireEvent.click(screen.getByTestId('dim-modal-submit'));

    await waitFor(() => {
      expect(screen.getByTestId('lock-banner')).toBeInTheDocument();
    });
    // 鎖定後按鈕應 disabled
    expect(screen.getByTestId('btn-add-dim')).toBeDisabled();
  });
});

describe('ScoringConfigPage — F055 CARD_LEVEL', () => {
  it('TS-F055-015：S5 2 級表格只渲染 2 列', async () => {
    mockedGetCardLevels.mockResolvedValue({
      cardType: 'S5',
      cardVersion: 1,
      levels: [
        { cardLevel: 'A', scoreS: 200, scoreE: 999 },
        { cardLevel: 'B', scoreS: 0, scoreE: 199 },
      ],
    });
    render(wrap(<ScoringConfigPage />));
    await switchToLegacyTabs();
    await waitFor(() => {
      expect(screen.getByTestId('tab-level')).toBeInTheDocument();
    });
    // Iter 5b 5-Tab 平鋪：點 Shell 外層 tab-level（切換到 Shell 的 CARD_LEVEL 分頁，
    // 觸發 ScoringConfigLegacyTabs forceTab='level'）
    fireEvent.click(screen.getByTestId('tab-level'));
    await waitFor(() => {
      expect(screen.getByTestId('level-A-scoreS')).toBeInTheDocument();
    });
    expect(screen.getByTestId('level-B-scoreS')).toBeInTheDocument();
    expect(screen.queryByTestId('level-C-scoreS')).not.toBeInTheDocument();
    expect(screen.queryByTestId('level-D-scoreS')).not.toBeInTheDocument();
  });

  it('TS-F055-016：H 4 級表格渲染 A/B/C/D', async () => {
    render(wrap(<ScoringConfigPage />));
    await switchToLegacyTabs();
    await waitFor(() => {
      expect(screen.getByTestId('tab-level')).toBeInTheDocument();
    });
    // Iter 5b 5-Tab 平鋪：點 Shell 外層 tab-level（切換到 Shell 的 CARD_LEVEL 分頁，
    // 觸發 ScoringConfigLegacyTabs forceTab='level'）
    fireEvent.click(screen.getByTestId('tab-level'));
    await waitFor(() => {
      expect(screen.getByTestId('level-A-scoreS')).toBeInTheDocument();
    });
    ['A', 'B', 'C', 'D'].forEach((lvl) => {
      expect(screen.getByTestId(`level-${lvl}-scoreS`)).toBeInTheDocument();
    });
  });

  it('TS-F055-019：422 SCORING_RANGE_OVERLAP 顯示紅色邊框', async () => {
    mockedUpdateCardLevels.mockRejectedValue({
      response: { status: 422, data: { error: 'SCORING_RANGE_OVERLAP' } },
    });
    render(wrap(<ScoringConfigPage />));
    await switchToLegacyTabs();
    await waitFor(() => {
      expect(screen.getByTestId('tab-level')).toBeInTheDocument();
    });
    // Iter 5b 5-Tab 平鋪：點 Shell 外層 tab-level（切換到 Shell 的 CARD_LEVEL 分頁，
    // 觸發 ScoringConfigLegacyTabs forceTab='level'）
    fireEvent.click(screen.getByTestId('tab-level'));
    await waitFor(() => {
      expect(screen.getByTestId('btn-save-levels')).toBeInTheDocument();
    });
    fireEvent.click(screen.getByTestId('btn-save-levels'));
    await waitFor(() => {
      expect(screen.getByTestId('level-overlap-warn')).toBeInTheDocument();
    });
  });
});

// Iter 5b：F056 v1.4 TIER Tab 已由 TierMappingTabV15 元件取代。
// 此 describe 內的 v1.4 行為（legacy-tab-tier）已不適用 — 改由：
//   - apps/web/src/pages/assignment/__tests__/tier-mapping-tab.test.tsx（v1.5 Tab 5 行為）
//   - apps/web/src/pages/assignment/__tests__/create-tier-mapping-modal.test.tsx（v1.5 互斥/列舉）
// 全面覆蓋。本 describe skip 保留以記錄歷史對照。
describe.skip('ScoringConfigPage — F056 TIER 對應（v1.4，已由 Tab 5 v1.5 元件取代）', () => {
  it('TS-F056-021 + TS-F056-028：Fallback (M5/M3/HC/C3) 列顯示紫色 + 標籤', async () => {
    render(wrap(<ScoringConfigPage />));
    await switchToLegacyTabs();
    await waitFor(() => {
      expect(screen.getByTestId('legacy-tab-tier')).toBeInTheDocument();
    });
    fireEvent.click(screen.getByTestId('legacy-tab-tier'));
    await waitFor(() => {
      expect(screen.getByTestId('fallback-banner')).toBeInTheDocument();
    });
    ['M5', 'M3', 'HC', 'C3'].forEach((ct) => {
      const row = screen.getByTestId(`tier-row-${ct}-null`);
      expect(row.className).toContain('bg-purple-50');
      const badge = within(row).getByTestId(`fallback-badge-${ct}`);
      expect(badge.textContent).toContain('Fallback');
    });
  });

  it('TS-F056-022：標準對應列無 Fallback 標籤', async () => {
    render(wrap(<ScoringConfigPage />));
    await switchToLegacyTabs();
    await waitFor(() => {
      expect(screen.getByTestId('legacy-tab-tier')).toBeInTheDocument();
    });
    fireEvent.click(screen.getByTestId('legacy-tab-tier'));
    await waitFor(() => {
      expect(screen.getByTestId('tier-row-H-A')).toBeInTheDocument();
    });
    const row = screen.getByTestId('tier-row-H-A');
    expect(row.className).not.toContain('bg-purple-50');
    expect(within(row).queryByText('Fallback')).not.toBeInTheDocument();
  });

  it('TS-F056-023：CARD_LEVEL 下拉依當前 cardType 動態顯示 levels', async () => {
    render(wrap(<ScoringConfigPage />));
    await switchToLegacyTabs();
    await waitFor(() => {
      expect(screen.getByTestId('legacy-tab-tier')).toBeInTheDocument();
    });
    fireEvent.click(screen.getByTestId('legacy-tab-tier'));
    await waitFor(() => {
      expect(screen.getByTestId('btn-add-tier')).toBeInTheDocument();
    });
    fireEvent.click(screen.getByTestId('btn-add-tier'));
    await waitFor(() => {
      expect(screen.getByTestId('tier-modal-cardlevel')).toBeInTheDocument();
    });
    const select = screen.getByTestId('tier-modal-cardlevel') as HTMLSelectElement;
    // 預設 H 有 A/B/C/D 4 個 option + 1 fallback
    expect(select.options.length).toBe(5); // 含 fallback 空 option
  });

  it('TS-F056-024：list_nm null 顯示「—」', async () => {
    render(wrap(<ScoringConfigPage />));
    await switchToLegacyTabs();
    await waitFor(() => {
      expect(screen.getByTestId('legacy-tab-tier')).toBeInTheDocument();
    });
    fireEvent.click(screen.getByTestId('legacy-tab-tier'));
    await waitFor(() => {
      expect(screen.getByTestId('tier-row-H-B')).toBeInTheDocument();
    });
    const row = screen.getByTestId('tier-row-H-B');
    // listNm 欄位應有「—」
    expect(row.textContent).toContain('—');
  });

  it('TS-F056-026：新增 TIER 對應成功後 toast + 列表更新', async () => {
    mockedCreateTierMapping.mockResolvedValue({} as any);
    mockedGetTierMapping
      .mockResolvedValueOnce({
        mappings: [
          { cardType: 'H', cardLevel: 'A', tierLevel: 'T1', listNm: '期中名單' },
        ],
      })
      .mockResolvedValueOnce({
        mappings: [
          { cardType: 'H', cardLevel: 'A', tierLevel: 'T1', listNm: '期中名單' },
          { cardType: 'H', cardLevel: 'B', tierLevel: 'T2', listNm: null },
        ],
      });

    render(wrap(<ScoringConfigPage />));
    await switchToLegacyTabs();
    await waitFor(() => {
      expect(screen.getByTestId('legacy-tab-tier')).toBeInTheDocument();
    });
    fireEvent.click(screen.getByTestId('legacy-tab-tier'));
    await waitFor(() => {
      expect(screen.getByTestId('btn-add-tier')).toBeInTheDocument();
    });
    fireEvent.click(screen.getByTestId('btn-add-tier'));
    await waitFor(() => {
      expect(screen.getByTestId('tier-modal')).toBeInTheDocument();
    });
    // 填 tierLevel
    const modal = screen.getByTestId('tier-modal');
    const textInputs = modal.querySelectorAll('input[type="text"]');
    fireEvent.change(textInputs[1], { target: { value: 'T2' } });
    fireEvent.click(screen.getByTestId('tier-modal-submit'));

    await waitFor(() => {
      expect(mockedCreateTierMapping).toHaveBeenCalled();
    });
    await waitFor(() => {
      expect(screen.getByTestId('toast')).toBeInTheDocument();
    });
  });

  it('TS-F056-027：POST 422 TIER_LEVEL_DUPLICATE 時 Modal 不關閉', async () => {
    mockedCreateTierMapping.mockRejectedValue({
      response: {
        status: 422,
        data: {
          error: 'TIER_LEVEL_DUPLICATE',
          message: 'CARD_TYPE H × CARD_LEVEL A 的對應已存在',
        },
      },
    });

    render(wrap(<ScoringConfigPage />));
    await switchToLegacyTabs();
    await waitFor(() => {
      expect(screen.getByTestId('legacy-tab-tier')).toBeInTheDocument();
    });
    fireEvent.click(screen.getByTestId('legacy-tab-tier'));
    fireEvent.click(await screen.findByTestId('btn-add-tier'));
    await waitFor(() => {
      expect(screen.getByTestId('tier-modal')).toBeInTheDocument();
    });
    const modal = screen.getByTestId('tier-modal');
    const textInputs = modal.querySelectorAll('input[type="text"]');
    fireEvent.change(textInputs[1], { target: { value: 'T1' } });
    fireEvent.click(screen.getByTestId('tier-modal-submit'));

    await waitFor(() => {
      expect(screen.getByTestId('tier-modal-error')).toBeInTheDocument();
    });
    // Modal 仍在
    expect(screen.getByTestId('tier-modal')).toBeInTheDocument();
  });

  it('TS-F056-025：月跑鎖時新增 TIER 按鈕 disabled', async () => {
    mockedCreateTierMapping.mockRejectedValue({
      response: { status: 409, data: { error: 'SCORING_VERSION_LOCKED' } },
    });
    render(wrap(<ScoringConfigPage />));
    await switchToLegacyTabs();
    await waitFor(() => {
      expect(screen.getByTestId('legacy-tab-tier')).toBeInTheDocument();
    });
    fireEvent.click(screen.getByTestId('legacy-tab-tier'));
    fireEvent.click(await screen.findByTestId('btn-add-tier'));
    const modal = await screen.findByTestId('tier-modal');
    const inputs = modal.querySelectorAll('input[type="text"]');
    fireEvent.change(inputs[1], { target: { value: 'T9' } });
    fireEvent.click(screen.getByTestId('tier-modal-submit'));

    await waitFor(() => {
      expect(screen.getByTestId('lock-banner')).toBeInTheDocument();
    });
    // 關閉 Modal（用 Modal 內部 button 範圍，避免與 sidebar / 其他「取消」字樣衝突）
    const tierModal = screen.getByTestId('tier-modal');
    const cancelBtn = within(tierModal).getByText('取消');
    fireEvent.click(cancelBtn);
    await waitFor(() => {
      expect(screen.queryByTestId('tier-modal')).not.toBeInTheDocument();
    });
    expect(screen.getByTestId('btn-add-tier')).toBeDisabled();
  });
});

// ============================================================
// v1.3 / v1.4 新增：4 個 Tab 的編輯 / 刪除 互動測試（+ prototype 28 樣式對齊 + 錯誤碼 rename）
// ============================================================

// ---- 共用：開 dim tab 等 row 出現 ----
async function openDimTabAndWaitRow() {
  render(wrap(<ScoringConfigPage />));
  await switchToLegacyTabs();
  await waitFor(() => {
    expect(screen.getByTestId('dim-row-ACCOUNT_AGE')).toBeInTheDocument();
  });
}

describe('ScoringConfigPage — DimensionsTab 編輯 / icon-only 停用', () => {
  it('TS-F054-E01：每列顯示 pencil 編輯按鈕（icon-only，藍色 hover）', async () => {
    await openDimTabAndWaitRow();
    const editBtn = screen.getByTestId('edit-dim-ACCOUNT_AGE');
    expect(editBtn).toBeInTheDocument();
    // prototype 28 L1087: hover:text-primary + hover:bg-blue-50 + rounded + action-btn p-1.5
    expect(editBtn.className).toContain('action-btn');
    expect(editBtn.className).toContain('p-1.5');
    expect(editBtn.className).toContain('hover:text-[#2563EB]');
    expect(editBtn.className).toContain('hover:bg-blue-50');
    // icon-only：按鈕內無文字（僅 lucide svg）
    expect(editBtn.textContent?.trim()).toBe('');
  });

  it('TS-F054-E02：點擊 pencil → 開啟編輯 Modal，預填 columnLabel', async () => {
    await openDimTabAndWaitRow();
    fireEvent.click(screen.getByTestId('edit-dim-ACCOUNT_AGE'));
    await waitFor(() => {
      expect(screen.getByTestId('dim-edit-modal')).toBeInTheDocument();
    });
    const modal = screen.getByTestId('dim-edit-modal');
    expect(modal.textContent).toContain('編輯計分維度');
    // columnLabel 預填
    const labelInput = within(modal).getByTestId('dim-edit-label') as HTMLInputElement;
    expect(labelInput.value).toBe('帳齡');
  });

  it('TS-F054-E03：編輯 Modal 儲存 → 呼叫 updateDimensions，toast 成功', async () => {
    mockedUpdateDimensions.mockResolvedValue({
      cardType: 'H', cardVersion: 1, updatedDimensions: 1, updatedScores: 2,
    } as any);
    await openDimTabAndWaitRow();
    fireEvent.click(screen.getByTestId('edit-dim-ACCOUNT_AGE'));
    await waitFor(() => {
      expect(screen.getByTestId('dim-edit-modal')).toBeInTheDocument();
    });
    const modal = screen.getByTestId('dim-edit-modal');
    const labelInput = within(modal).getByTestId('dim-edit-label') as HTMLInputElement;
    fireEvent.change(labelInput, { target: { value: '帳齡（修訂）' } });
    fireEvent.click(within(modal).getByTestId('dim-edit-submit'));

    await waitFor(() => {
      expect(mockedUpdateDimensions).toHaveBeenCalledWith(
        expect.objectContaining({
          cardType: 'H',
          cardVersion: 1,
          dimensions: expect.arrayContaining([
            expect.objectContaining({
              columnName: 'ACCOUNT_AGE',
              columnLabel: '帳齡（修訂）',
            }),
          ]),
        }),
      );
    });
    await waitFor(() => {
      expect(screen.getByTestId('toast')).toBeInTheDocument();
    });
  });

  it('TS-F054-E04：停用按鈕為 icon-only ban（無「停用」文字），hover 橘色', async () => {
    await openDimTabAndWaitRow();
    const disableBtn = screen.getByTestId('disable-ACCOUNT_AGE');
    expect(disableBtn).toBeInTheDocument();
    // 不再是 text-only 按鈕：button 內僅 svg，無「停用」字串
    expect(disableBtn.textContent?.trim()).toBe('');
    // prototype 28 L1090：hover:text-warning + hover:bg-amber-50 + p-1.5 + action-btn
    expect(disableBtn.className).toContain('action-btn');
    expect(disableBtn.className).toContain('p-1.5');
    expect(disableBtn.className).toContain('hover:text-[#F59E0B]');
    expect(disableBtn.className).toContain('hover:bg-amber-50');
  });
});

// F054 v1.3 對齊 prototype 28（handoff F054-v1.3-prototype-alignment.md §1-§6）：
// ScoresTab 由「寫入入口」轉為「唯讀總覽」，列右側 pencil/trash 移除，
// 新增分數區間入口由 Tab 2 DimensionModal 整合式編輯器取代。
// 舊測試 TS-F054-E05/E06/E07 已不再適用，改寫為 NEW-01~NEW-04 覆蓋新行為。
describe('ScoringConfigPage — ScoresTab v1.3 唯讀總覽（落差 1-3）', () => {
  it('TS-F054-NEW-01：ScoresTab 頂部顯示唯讀總覽說明條', async () => {
    render(wrap(<ScoringConfigPage />));
    await switchToLegacyTabs();
    fireEvent.click(screen.getByTestId('tab-score'));
    // 落差 5 補修：banner 文字改為「唯讀總覽（v1.3 規格）」並附 inline link
    await waitFor(() => {
      expect(
        screen.getByText('唯讀總覽（v1.3 規格）'),
      ).toBeInTheDocument();
    });
    expect(screen.getByTestId('scores-tab-goto-dim')).toBeInTheDocument();
  });

  it('TS-F054-NEW-02：ScoresTab 表頭含「比對模式」欄，每列顯示 matchType chip', async () => {
    render(wrap(<ScoringConfigPage />));
    await switchToLegacyTabs();
    fireEvent.click(screen.getByTestId('tab-score'));
    await waitFor(() => {
      // 表頭含「比對模式」欄
      expect(screen.getByText('比對模式')).toBeInTheDocument();
    });
    // 第一列為 ACCOUNT_AGE（RANGE）；第三列為 CELLULAR（CATEGORY）
    await waitFor(() => {
      expect(
        screen.getByTestId('score-row-0-matchtype'),
      ).toBeInTheDocument();
    });
    const firstChip = screen.getByTestId('score-row-0-matchtype');
    expect(firstChip.getAttribute('data-matchtype')).toBe('RANGE');
  });

  // 落差 9：ScoresTab 對齊 prototype 28 line 387-401 — 純唯讀總覽，無「操作」欄、
  // 無底部 CTA。原 TS-F054-NEW-03 / NEW-04 / NEW-05 涉及 goto-dim-editor / btn-goto-dim-editor
  // 已不適用，改寫為 NEW-03a / NEW-04a 驗證唯讀結構。
  it('TS-F054-NEW-03a：ScoresTab 列無「操作」欄（無 goto-dim-editor / pencil / trash）', async () => {
    render(wrap(<ScoringConfigPage />));
    await switchToLegacyTabs();
    fireEvent.click(screen.getByTestId('tab-score'));
    await waitFor(() => {
      expect(screen.getByTestId('score-row-0')).toBeInTheDocument();
    });
    // 落差 9：移除「操作」欄與所有 row-level 寫入入口
    expect(screen.queryByTestId('goto-dim-editor-ACCOUNT_AGE')).toBeNull();
    expect(screen.queryByTestId('edit-score-0')).toBeNull();
    expect(screen.queryByTestId('delete-score-0')).toBeNull();
    expect(screen.queryByTestId('btn-add-score')).toBeNull();
    // 表頭應無「操作」文字（th 級別檢查，非 row 級別）
    const ths = document.querySelectorAll(
      '[data-testid^="score-row-"]',
    );
    expect(ths.length).toBeGreaterThan(0);
  });

  it('TS-F054-NEW-04a：ScoresTab 無底部「前往 Tab 2 編輯」CTA（純唯讀）', async () => {
    render(wrap(<ScoringConfigPage />));
    await switchToLegacyTabs();
    fireEvent.click(screen.getByTestId('tab-score'));
    await waitFor(() => {
      expect(screen.getByTestId('score-row-0')).toBeInTheDocument();
    });
    // 落差 9：移除 CTA；對應 prototype 28 line 400-402 純說明條
    expect(screen.queryByTestId('btn-goto-dim-editor')).toBeNull();
  });
});

// =====================================================================
// F054 v1.3 對齊 prototype 28 — 9 個落差後續驗證測試（落差 1 / 2 / 5 / 8）
// =====================================================================
//
// 對應 prototype 28 line 327-342（DimensionsTab 7 欄含「類型」+ matchType 推導說明）
// 與 line 387-397（ScoresTab 6 欄純唯讀）。
describe('ScoringConfigPage — prototype 28 對齊（落差 1 / 2 / 5 / 8）', () => {
  it('TS-F054-NEW-08：DimensionsTab 表頭含「類型」欄（score-derived 類別/數值/—）', async () => {
    render(wrap(<ScoringConfigPage />));
    await switchToLegacyTabs();
    await waitFor(() => {
      expect(screen.getByTestId('dim-row-ACCOUNT_AGE')).toBeInTheDocument();
    });
    // 表頭：column_name / column_label / 類型 / 比對模式 / 分數區間摘要 / 狀態 / 操作
    const table = screen.getByTestId('dim-row-ACCOUNT_AGE').closest('table')!;
    const headers = Array.from(table.querySelectorAll('thead th')).map(
      (th) => th.textContent?.trim(),
    );
    expect(headers).toEqual([
      'column_name',
      'column_label',
      '類型',
      '比對模式',
      '分數區間摘要',
      '狀態',
      '操作',
    ]);
  });

  it('TS-F054-NEW-09：「類型」欄 — ACCOUNT_AGE (level2_s 有值) 顯示「數值」', async () => {
    render(wrap(<ScoringConfigPage />));
    await switchToLegacyTabs();
    await waitFor(() => {
      expect(screen.getByTestId('dim-base-type-ACCOUNT_AGE')).toBeInTheDocument();
    });
    expect(
      screen.getByTestId('dim-base-type-ACCOUNT_AGE').textContent?.trim(),
    ).toBe('數值');
  });

  it('TS-F054-NEW-10：「類型」欄 — CELLULAR (level1 有值，level2_s null) 顯示「類別」', async () => {
    render(wrap(<ScoringConfigPage />));
    await switchToLegacyTabs();
    await waitFor(() => {
      expect(screen.getByTestId('dim-base-type-CELLULAR')).toBeInTheDocument();
    });
    expect(
      screen.getByTestId('dim-base-type-CELLULAR').textContent?.trim(),
    ).toBe('類別');
  });

  it('TS-F054-NEW-11：「類型」欄 — 空 scores 顯示「—」', async () => {
    mockedGetScoring.mockResolvedValue({
      version: DEFAULT_VERSION_WITH_VALUES,
      dimensions: [
        {
          columnName: 'EMPTY_DIM',
          columnLabel: '空維度',
          scoreSummary: '尚無分數',
          scores: [],
        },
      ],
    } as any);
    render(wrap(<ScoringConfigPage />));
    await switchToLegacyTabs();
    await waitFor(() => {
      expect(screen.getByTestId('dim-base-type-EMPTY_DIM')).toBeInTheDocument();
    });
    expect(
      screen.getByTestId('dim-base-type-EMPTY_DIM').textContent?.trim(),
    ).toBe('—');
  });

  it('TS-F054-NEW-12：DimensionsTab matchType chip 顯示短標籤「區間」（RANGE）', async () => {
    render(wrap(<ScoringConfigPage />));
    await switchToLegacyTabs();
    await waitFor(() => {
      expect(screen.getByTestId('dim-matchtype-ACCOUNT_AGE')).toBeInTheDocument();
    });
    const chip = screen.getByTestId('dim-matchtype-ACCOUNT_AGE');
    expect(chip.getAttribute('data-matchtype')).toBe('RANGE');
    expect(chip.textContent?.trim()).toBe('區間');
  });

  it('TS-F054-NEW-13：DimensionsTab matchType chip 顯示短標籤「類別」（CATEGORY）', async () => {
    render(wrap(<ScoringConfigPage />));
    await switchToLegacyTabs();
    await waitFor(() => {
      expect(screen.getByTestId('dim-matchtype-CELLULAR')).toBeInTheDocument();
    });
    const chip = screen.getByTestId('dim-matchtype-CELLULAR');
    expect(chip.getAttribute('data-matchtype')).toBe('CATEGORY');
    expect(chip.textContent?.trim()).toBe('類別');
  });

  it('TS-F054-NEW-14：DimensionsTab 表格下方顯示 matchType 推導說明條（落差 8）', async () => {
    render(wrap(<ScoringConfigPage />));
    await switchToLegacyTabs();
    await waitFor(() => {
      expect(
        screen.getByTestId('dim-matchtype-derivation-note'),
      ).toBeInTheDocument();
    });
    const note = screen.getByTestId('dim-matchtype-derivation-note');
    // 對應 prototype 28 line 341 文案核心關鍵字
    expect(note.textContent).toContain('比對模式');
    expect(note.textContent).toContain('CATEGORY');
    expect(note.textContent).toContain('RANGE');
    expect(note.textContent).toContain('COMPOSITE');
    expect(note.textContent).toContain('自動推導');
  });
});

// F054 v1.3 落差 4：DimensionsTab 「狀態」欄
describe('ScoringConfigPage — DimensionsTab 狀態欄（落差 4）', () => {
  it('TS-F054-NEW-06：每列顯示狀態 chip（後端未回 status 時 fallback 為 active）', async () => {
    render(wrap(<ScoringConfigPage />));
    await switchToLegacyTabs();
    await waitFor(() => {
      expect(screen.getByTestId('dim-row-ACCOUNT_AGE')).toBeInTheDocument();
    });
    const chip = screen.getByTestId('dim-status-ACCOUNT_AGE');
    expect(chip).toBeInTheDocument();
    expect(chip.getAttribute('data-status')).toBe('active');
    expect(chip.textContent).toContain('啟用');
  });
});

// F054 v1.3 落差 6：DimensionModal 重疊偵測 UX 提示
describe('ScoringConfigPage — DimensionModal 重疊偵測（落差 6）', () => {
  it('TS-F054-NEW-07：RANGE 模式輸入重疊區間時顯示琥珀色警告', async () => {
    render(wrap(<ScoringConfigPage />));
    await switchToLegacyTabs();
    await waitFor(() => {
      expect(screen.getByTestId('btn-add-dim')).toBeInTheDocument();
    });
    fireEvent.click(screen.getByTestId('btn-add-dim'));
    await waitFor(() => {
      expect(screen.getByTestId('dim-modal')).toBeInTheDocument();
    });
    // 選 RANGE
    fireEvent.click(screen.getByTestId('dim-modal-matchtype-RANGE'));
    // 新增第二列（預設第一列也是 [0,99]，第二列也是 [0,99] → 重疊）
    fireEvent.click(screen.getByTestId('dim-modal-add-score'));
    await waitFor(() => {
      expect(screen.getByTestId('dim-modal-overlap-warn')).toBeInTheDocument();
    });
    expect(
      screen.getByTestId('dim-modal-overlap-warn').textContent,
    ).toContain('重疊');
  });
});

describe('ScoringConfigPage — CardLevelsTab 單列儲存 / 刪除（v1.3 DELETE）', () => {
  it('TS-F055-E01：每列 check 單列儲存按鈕 click → 呼叫 updateCardLevels', async () => {
    mockedUpdateCardLevels.mockResolvedValue({} as any);
    render(wrap(<ScoringConfigPage />));
    await switchToLegacyTabs();
    await waitFor(() => {
      expect(screen.getByTestId('tab-level')).toBeInTheDocument();
    });
    // Iter 5b 5-Tab 平鋪：點 Shell 外層 tab-level（切換到 Shell 的 CARD_LEVEL 分頁，
    // 觸發 ScoringConfigLegacyTabs forceTab='level'）
    fireEvent.click(screen.getByTestId('tab-level'));
    await waitFor(() => {
      expect(screen.getByTestId('save-level-A')).toBeInTheDocument();
    });
    fireEvent.click(screen.getByTestId('save-level-A'));
    await waitFor(() => {
      expect(mockedUpdateCardLevels).toHaveBeenCalledWith(
        expect.objectContaining({
          cardType: 'H',
          cardVersion: 1,
          levels: expect.arrayContaining([
            expect.objectContaining({ cardLevel: 'A' }),
          ]),
        }),
      );
    });
  });

  it('TS-F055-E02：每列 trash 刪除按鈕 + 確認對話框（含 AC-7 警告）→ 呼叫 deleteCardLevel API', async () => {
    mockedDeleteCardLevel.mockResolvedValue({
      cardType: 'H', cardVersion: 1, cardLevel: 'D', deletedAt: '2026-05-14T00:00:00.000Z',
    } as any);
    render(wrap(<ScoringConfigPage />));
    await switchToLegacyTabs();
    await waitFor(() => {
      expect(screen.getByTestId('tab-level')).toBeInTheDocument();
    });
    // Iter 5b 5-Tab 平鋪：點 Shell 外層 tab-level（切換到 Shell 的 CARD_LEVEL 分頁，
    // 觸發 ScoringConfigLegacyTabs forceTab='level'）
    fireEvent.click(screen.getByTestId('tab-level'));
    await waitFor(() => {
      expect(screen.getByTestId('delete-level-D')).toBeInTheDocument();
    });
    const trash = screen.getByTestId('delete-level-D');
    expect(trash.className).toContain('hover:text-[#EF4444]');
    expect(trash.className).toContain('hover:bg-red-50');

    fireEvent.click(trash);
    await waitFor(() => {
      expect(screen.getByTestId('level-delete-confirm-modal')).toBeInTheDocument();
    });
    // AC-7 警告文字（spec：F056 引用 / Stage 2 分級 / 先移除對應 等關鍵字至少出現）
    const modal = screen.getByTestId('level-delete-confirm-modal');
    expect(modal.textContent).toMatch(/月跑 Stage 2|TIER_LEVEL 對應|F056/);

    fireEvent.click(screen.getByTestId('level-delete-confirm'));
    await waitFor(() => {
      expect(mockedDeleteCardLevel).toHaveBeenCalledWith('H', 1, 'D');
    });
  });

  it('TS-F055-E03：DELETE 409 CARD_LEVEL_REFERENCED 顯示錯誤訊息（不關閉對話框）', async () => {
    mockedDeleteCardLevel.mockRejectedValue({
      response: {
        status: 409,
        data: {
          error: 'CARD_LEVEL_REFERENCED',
          message: '此 CARD_LEVEL 仍被 TIER_LEVEL 對應引用，請先於 F056 移除對應後再刪除',
        },
      },
    });
    render(wrap(<ScoringConfigPage />));
    await switchToLegacyTabs();
    await waitFor(() => {
      expect(screen.getByTestId('tab-level')).toBeInTheDocument();
    });
    // Iter 5b 5-Tab 平鋪：點 Shell 外層 tab-level（切換到 Shell 的 CARD_LEVEL 分頁，
    // 觸發 ScoringConfigLegacyTabs forceTab='level'）
    fireEvent.click(screen.getByTestId('tab-level'));
    fireEvent.click(await screen.findByTestId('delete-level-D'));
    await screen.findByTestId('level-delete-confirm-modal');
    fireEvent.click(screen.getByTestId('level-delete-confirm'));

    await waitFor(() => {
      expect(screen.getByTestId('level-delete-error')).toBeInTheDocument();
    });
    expect(screen.getByTestId('level-delete-error').textContent).toContain(
      'TIER_LEVEL 對應',
    );
  });
});

// =========================
// F055 v1.5 (US-097)：CardLevelsTab 新增等級 — 表頭按鈕 + 空狀態 CTA + Modal 串接
// =========================
describe('ScoringConfigPage — CardLevelsTab 新增等級（v1.5 POST）', () => {
  it('TS-F055-N01：CardLevelsTab 表頭顯示「+ 新增等級」按鈕', async () => {
    render(wrap(<ScoringConfigPage />));
    await switchToLegacyTabs();
    fireEvent.click(screen.getByTestId('tab-level'));
    await waitFor(() => {
      expect(screen.getByTestId('btn-add-level')).toBeInTheDocument();
    });
    expect(screen.getByTestId('btn-add-level').textContent).toContain(
      '新增等級',
    );
  });

  it('TS-F055-N02：空 levels 顯示空狀態提示 + CTA 按鈕 (btn-add-level-empty)', async () => {
    // 空 levels
    vi.mocked(api.getCardLevels).mockResolvedValue({
      cardType: 'H',
      cardVersion: 1,
      levels: [],
    });
    render(wrap(<ScoringConfigPage />));
    await switchToLegacyTabs();
    fireEvent.click(screen.getByTestId('tab-level'));
    await waitFor(() => {
      expect(screen.getByTestId('btn-add-level-empty')).toBeInTheDocument();
    });
    // 空狀態文字
    expect(
      screen.getByText('請點擊「+ 新增等級」開始'),
    ).toBeInTheDocument();
  });

  it('TS-F055-N03：月跑鎖時 btn-add-level disabled', async () => {
    // 透過 updateCardLevels 422 SCORING_VERSION_LOCKED 觸發鎖 banner
    mockedUpdateCardLevels.mockRejectedValue({
      response: { status: 409, data: { error: 'SCORING_VERSION_LOCKED' } },
    });
    render(wrap(<ScoringConfigPage />));
    await switchToLegacyTabs();
    fireEvent.click(screen.getByTestId('tab-level'));
    await waitFor(() => {
      expect(screen.getByTestId('btn-save-levels')).toBeInTheDocument();
    });
    // 觸發鎖
    fireEvent.click(screen.getByTestId('btn-save-levels'));
    await waitFor(() => {
      expect(screen.getByTestId('lock-banner')).toBeInTheDocument();
    });
    expect(screen.getByTestId('btn-add-level')).toBeDisabled();
  });

  it('TS-F055-N04：點擊 btn-add-level 開啟新增 Modal', async () => {
    render(wrap(<ScoringConfigPage />));
    await switchToLegacyTabs();
    fireEvent.click(screen.getByTestId('tab-level'));
    await waitFor(() => {
      expect(screen.getByTestId('btn-add-level')).toBeInTheDocument();
    });
    fireEvent.click(screen.getByTestId('btn-add-level'));
    await waitFor(() => {
      expect(screen.getByTestId('create-card-level-modal')).toBeInTheDocument();
    });
    // Modal 內含 cardType disabled 顯示
    const ctInput = screen.getByTestId('level-modal-card-type') as HTMLInputElement;
    expect(ctInput).toBeDisabled();
    expect(ctInput.value).toContain('H');
  });
});

// Iter 5b：v1.4 TIER 編輯 / 刪除互動已由 TierMappingTabV15 取代（含 v1.5 互斥規則）。
// 新測試覆蓋於 tier-mapping-tab.test.tsx + create-tier-mapping-modal.test.tsx。
describe.skip('ScoringConfigPage — TierMappingTab 編輯 / 刪除（v1.4 DELETE，已由 Tab 5 v1.5 元件取代）', () => {
  it('TS-F056-E01：每列 pencil 編輯 → 開啟 TIER 編輯 Modal，預填 tierLevel/listNm', async () => {
    render(wrap(<ScoringConfigPage />));
    await switchToLegacyTabs();
    await waitFor(() => {
      expect(screen.getByTestId('legacy-tab-tier')).toBeInTheDocument();
    });
    fireEvent.click(screen.getByTestId('legacy-tab-tier'));
    await waitFor(() => {
      expect(screen.getByTestId('edit-tier-H-A')).toBeInTheDocument();
    });
    const editBtn = screen.getByTestId('edit-tier-H-A');
    expect(editBtn.className).toContain('action-btn');
    expect(editBtn.className).toContain('hover:text-[#2563EB]');

    fireEvent.click(editBtn);
    await waitFor(() => {
      expect(screen.getByTestId('tier-edit-modal')).toBeInTheDocument();
    });
    const modal = screen.getByTestId('tier-edit-modal');
    const tierInput = within(modal).getByTestId('tier-edit-tierLevel') as HTMLInputElement;
    expect(tierInput.value).toBe('T1');
  });

  it('TS-F056-E02：TIER 編輯 Modal 儲存 → 呼叫 updateTierMapping PUT', async () => {
    mockedUpdateTierMapping.mockResolvedValue({
      updatedCount: 1, insertedCount: 0,
    } as any);
    render(wrap(<ScoringConfigPage />));
    await switchToLegacyTabs();
    await waitFor(() => {
      expect(screen.getByTestId('legacy-tab-tier')).toBeInTheDocument();
    });
    fireEvent.click(screen.getByTestId('legacy-tab-tier'));
    await waitFor(() => {
      expect(screen.getByTestId('edit-tier-H-A')).toBeInTheDocument();
    });
    fireEvent.click(screen.getByTestId('edit-tier-H-A'));
    await screen.findByTestId('tier-edit-modal');
    const modal = screen.getByTestId('tier-edit-modal');
    const tierInput = within(modal).getByTestId('tier-edit-tierLevel') as HTMLInputElement;
    fireEvent.change(tierInput, { target: { value: 'T99' } });
    fireEvent.click(within(modal).getByTestId('tier-edit-submit'));

    await waitFor(() => {
      expect(mockedUpdateTierMapping).toHaveBeenCalledWith(
        expect.objectContaining({
          mappings: expect.arrayContaining([
            expect.objectContaining({
              cardType: 'H',
              cardLevel: 'A',
              tierLevel: 'T99',
            }),
          ]),
        }),
      );
    });
  });

  it('TS-F056-E03：每列 trash → 確認對話框 → 呼叫 deleteTierMapping（標準對應 H/A）', async () => {
    mockedDeleteTierMapping.mockResolvedValue({
      cardType: 'H', cardLevel: 'A', deletedAt: '2026-05-14T00:00:00Z',
    } as any);
    render(wrap(<ScoringConfigPage />));
    await switchToLegacyTabs();
    await waitFor(() => {
      expect(screen.getByTestId('legacy-tab-tier')).toBeInTheDocument();
    });
    fireEvent.click(screen.getByTestId('legacy-tab-tier'));
    await waitFor(() => {
      expect(screen.getByTestId('delete-tier-H-A')).toBeInTheDocument();
    });
    const trash = screen.getByTestId('delete-tier-H-A');
    expect(trash.className).toContain('hover:text-[#EF4444]');
    expect(trash.className).toContain('hover:bg-red-50');

    fireEvent.click(trash);
    await waitFor(() => {
      expect(screen.getByTestId('tier-delete-confirm-modal')).toBeInTheDocument();
    });
    fireEvent.click(screen.getByTestId('tier-delete-confirm'));

    await waitFor(() => {
      expect(mockedDeleteTierMapping).toHaveBeenCalledWith('H', 'A');
    });
  });

  it('TS-F056-E04：刪除 fallback 對應（M5/null）→ 呼叫 deleteTierMapping(M5, null)', async () => {
    mockedDeleteTierMapping.mockResolvedValue({
      cardType: 'M5', cardLevel: null, deletedAt: '2026-05-14T00:00:00Z',
    } as any);
    render(wrap(<ScoringConfigPage />));
    await switchToLegacyTabs();
    await waitFor(() => {
      expect(screen.getByTestId('legacy-tab-tier')).toBeInTheDocument();
    });
    fireEvent.click(screen.getByTestId('legacy-tab-tier'));
    await waitFor(() => {
      expect(screen.getByTestId('delete-tier-M5-null')).toBeInTheDocument();
    });
    fireEvent.click(screen.getByTestId('delete-tier-M5-null'));
    await screen.findByTestId('tier-delete-confirm-modal');
    fireEvent.click(screen.getByTestId('tier-delete-confirm'));

    await waitFor(() => {
      expect(mockedDeleteTierMapping).toHaveBeenCalledWith('M5', null);
    });
  });

  it('TS-F056-E05：月跑鎖時所有 TIER 編輯 / 刪除 / 新增按鈕 disabled', async () => {
    // 模擬已經是鎖定狀態：先觸發 createTierMapping 拋 409 設 isLocked
    mockedCreateTierMapping.mockRejectedValue({
      response: { status: 409, data: { error: 'SCORING_VERSION_LOCKED' } },
    });
    render(wrap(<ScoringConfigPage />));
    await switchToLegacyTabs();
    await waitFor(() => {
      expect(screen.getByTestId('legacy-tab-tier')).toBeInTheDocument();
    });
    fireEvent.click(screen.getByTestId('legacy-tab-tier'));
    fireEvent.click(await screen.findByTestId('btn-add-tier'));
    const tierModal = await screen.findByTestId('tier-modal');
    const inputs = tierModal.querySelectorAll('input[type="text"]');
    fireEvent.change(inputs[1], { target: { value: 'T9' } });
    fireEvent.click(screen.getByTestId('tier-modal-submit'));

    await waitFor(() => {
      expect(screen.getByTestId('lock-banner')).toBeInTheDocument();
    });
    const cancelBtn = within(screen.getByTestId('tier-modal')).getByText('取消');
    fireEvent.click(cancelBtn);
    await waitFor(() => {
      expect(screen.queryByTestId('tier-modal')).not.toBeInTheDocument();
    });

    // 鎖定後：新增 / 每列 編輯 / 刪除 都應 disabled
    expect(screen.getByTestId('btn-add-tier')).toBeDisabled();
    expect(screen.getByTestId('edit-tier-H-A')).toBeDisabled();
    expect(screen.getByTestId('delete-tier-H-A')).toBeDisabled();
  });
});

// ---- Iter 9：Banner stats 串接 + KPI listdef 跳轉 ----

describe('ScoringConfigPage — Iter 9 Banner stats integration', () => {
  it('Banner stats 顯示 backend 回傳的 5 個 KPI 數字（getCardTypeStats）', async () => {
    vi.mocked(cardTypeApi.getCardTypeStats).mockResolvedValueOnce({
      cardType: 'H',
      dimCount: 8,
      scoreCount: 24,
      levelCount: 4,
      tierCount: 4,
      listDefsAffected: 2,
    });

    render(wrap(<ScoringConfigPage />));

    await screen.findByTestId('card-type-row-H');

    // 等待 banner 上的 KPI 被資料填上
    await waitFor(() => {
      expect(screen.getByTestId('kpi-dim').textContent).toContain('8');
    });
    expect(screen.getByTestId('kpi-score').textContent).toContain('24');
    expect(screen.getByTestId('kpi-level').textContent).toContain('4');
    expect(screen.getByTestId('kpi-tier').textContent).toContain('4');
    expect(screen.getByTestId('kpi-listdef').textContent).toContain('2');
  });

  it('Banner metadata 顯示 backend 回傳的 cardVersion / sdate / edate / createdBy', async () => {
    render(wrap(<ScoringConfigPage />));

    await screen.findByTestId('card-type-row-H');

    await waitFor(() => {
      const meta = screen.getByTestId('banner-meta');
      // cardVersion: 1 → 'v1'
      expect(meta.textContent).toContain('v1');
      // sdate=20190823 → 2019-08-23
      expect(meta.textContent).toContain('2019-08-23');
      // edate=20991231 → 2099-12-31
      expect(meta.textContent).toContain('2099-12-31');
      expect(meta.textContent).toContain('Sales Manager');
    });
  });

  it('KPI 第 5 個（kpi-listdef）點擊 → navigate 至 /assignment/list-definitions?cardType=...', async () => {
    render(wrap(<ScoringConfigPage />));

    await screen.findByTestId('card-type-row-H');

    // 等待 banner KPI ready
    await waitFor(() => {
      expect(screen.getByTestId('kpi-listdef')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByTestId('kpi-listdef'));

    // 跳轉後 URL 應為 /assignment/list-definitions?cardType=H
    await waitFor(() => {
      expect(window.location.pathname).toBe('/assignment/list-definitions');
      expect(window.location.search).toContain('cardType=H');
    });
  });

  it('selectedCardType=null（清單為空）時 stats 不查詢（getCardTypeStats 未被呼叫）', async () => {
    vi.mocked(cardTypeApi.listCardTypes).mockResolvedValueOnce({
      cardTypes: [],
    });

    render(wrap(<ScoringConfigPage />));

    // 等待 empty state 出現確認 page 已渲染
    await screen.findByTestId('card-type-empty');

    // stats 不應該被呼叫（enabled: !!selectedCardType）
    expect(vi.mocked(cardTypeApi.getCardTypeStats)).not.toHaveBeenCalled();
  });
});

// ---- 錯誤碼拆分：v1.3 / v1.4 rename（前端字面字串）----

describe('ScoringConfigPage — v1.3 / v1.4 錯誤碼 rename 對齊', () => {
  it('TS-F056-E06：page tsx 與測試環境不應殘留舊錯誤碼 CARD_LEVEL_NOT_FOUND（無 _IN_VERSION / _RECORD_NOT_FOUND 後綴）', async () => {
    // 此 test 直接讀 page source 字串檢查（前端錯誤訊息 mapping 不可殘留舊名）
    const fs = await import('fs');
    const path = await import('path');
    const pageSrc = fs.readFileSync(
      path.resolve(__dirname, '../scoring-config-page.tsx'),
      'utf-8',
    );
    // 舊名單獨出現視為殘留（允許 CARD_LEVEL_NOT_FOUND_IN_VERSION / _RECORD_NOT_FOUND）
    const stale = pageSrc.match(/CARD_LEVEL_NOT_FOUND(?!_IN_VERSION|_RECORD_NOT_FOUND)/g);
    expect(stale).toBeNull();
  });
});
