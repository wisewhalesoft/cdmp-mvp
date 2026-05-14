/**
 * F053 / F054 / F055 / F056：ScoringConfigPage 前端煙霧測試
 *
 * 涵蓋 prototype 28 主要互動：
 *   - TS-F053-009：版本卡片顯示版本資訊
 *   - TS-F053-010：createdBy/createdAt 為 null 時 UI 顯示「—」
 *   - TS-F053-011：維度數量 Badge 正確
 *   - TS-F053-012：無 active 版本顯示警示
 *   - TS-F053-013：維度展開顯示分數詳細
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
import { ScoringConfigPage } from '../scoring-config-page';
import * as api from '@/api/assignment-scoring';
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
    getTierMapping: vi.fn(),
    updateTierMapping: vi.fn(),
    createTierMapping: vi.fn(),
    deleteTierMapping: vi.fn(), // v1.4 新增
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
  return <BrowserRouter>{node}</BrowserRouter>;
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

beforeEach(() => {
  vi.clearAllMocks();
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
  it('TS-F053-009：版本卡片顯示 cardType / sdate~edate / 建立者', async () => {
    render(wrap(<ScoringConfigPage />));
    await waitFor(() => {
      expect(screen.getByTestId('version-card')).toBeInTheDocument();
    });
    expect(screen.getByTestId('version-sdate').textContent).toBe('20190823');
    expect(screen.getByTestId('version-edate').textContent).toBe('20991231');
    expect(screen.getByTestId('version-created-by').textContent).toBe('21251');
  });

  it('TS-F053-010：createdBy/createdAt 為 null 時 UI 顯示「—」', async () => {
    mockedGetScoring.mockResolvedValueOnce({
      version: {
        ...DEFAULT_VERSION_WITH_VALUES,
        createdBy: null,
        createdAt: null,
      },
      dimensions: DEFAULT_DIMENSIONS,
    } as any);
    render(wrap(<ScoringConfigPage />));
    await waitFor(() => {
      expect(screen.getByTestId('version-created-by').textContent).toBe('—');
    });
    expect(screen.getByTestId('version-created-at').textContent).toBe('—');
  });

  it('TS-F053-011：維度 Badge 顯示維度數量', async () => {
    render(wrap(<ScoringConfigPage />));
    await waitFor(() => {
      expect(screen.getByTestId('tab-dim')).toBeInTheDocument();
    });
    const tabDim = screen.getByTestId('tab-dim');
    expect(tabDim.textContent).toContain('2'); // 2 個維度
  });

  it('TS-F053-012：無 active 版本顯示警示訊息', async () => {
    mockedGetScoring.mockRejectedValueOnce({
      response: { status: 404, data: { error: 'SCORING_VERSION_NOT_FOUND' } },
    });
    render(wrap(<ScoringConfigPage />));
    await waitFor(() => {
      expect(screen.getByTestId('no-active-version')).toBeInTheDocument();
    });
    expect(screen.getByTestId('no-active-version').textContent).toContain(
      '目前無生效的計分版本',
    );
  });

  it('TS-F053-013：維度列展開後顯示分數詳細表', async () => {
    render(wrap(<ScoringConfigPage />));
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
    await waitFor(() => {
      expect(screen.getByTestId('tab-level')).toBeInTheDocument();
    });
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
    await waitFor(() => {
      expect(screen.getByTestId('tab-level')).toBeInTheDocument();
    });
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
    await waitFor(() => {
      expect(screen.getByTestId('tab-level')).toBeInTheDocument();
    });
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

describe('ScoringConfigPage — F056 TIER 對應', () => {
  it('TS-F056-021 + TS-F056-028：Fallback (M5/M3/HC/C3) 列顯示紫色 + 標籤', async () => {
    render(wrap(<ScoringConfigPage />));
    await waitFor(() => {
      expect(screen.getByTestId('tab-tier')).toBeInTheDocument();
    });
    fireEvent.click(screen.getByTestId('tab-tier'));
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
    await waitFor(() => {
      expect(screen.getByTestId('tab-tier')).toBeInTheDocument();
    });
    fireEvent.click(screen.getByTestId('tab-tier'));
    await waitFor(() => {
      expect(screen.getByTestId('tier-row-H-A')).toBeInTheDocument();
    });
    const row = screen.getByTestId('tier-row-H-A');
    expect(row.className).not.toContain('bg-purple-50');
    expect(within(row).queryByText('Fallback')).not.toBeInTheDocument();
  });

  it('TS-F056-023：CARD_LEVEL 下拉依當前 cardType 動態顯示 levels', async () => {
    render(wrap(<ScoringConfigPage />));
    await waitFor(() => {
      expect(screen.getByTestId('tab-tier')).toBeInTheDocument();
    });
    fireEvent.click(screen.getByTestId('tab-tier'));
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
    await waitFor(() => {
      expect(screen.getByTestId('tab-tier')).toBeInTheDocument();
    });
    fireEvent.click(screen.getByTestId('tab-tier'));
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
    await waitFor(() => {
      expect(screen.getByTestId('tab-tier')).toBeInTheDocument();
    });
    fireEvent.click(screen.getByTestId('tab-tier'));
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
    await waitFor(() => {
      expect(screen.getByTestId('tab-tier')).toBeInTheDocument();
    });
    fireEvent.click(screen.getByTestId('tab-tier'));
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
    await waitFor(() => {
      expect(screen.getByTestId('tab-tier')).toBeInTheDocument();
    });
    fireEvent.click(screen.getByTestId('tab-tier'));
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

describe('ScoringConfigPage — ScoresTab 編輯 / 刪除', () => {
  it('TS-F054-E05：每列 pencil 編輯按鈕（icon-only） + click 開啟單筆編輯 Modal', async () => {
    render(wrap(<ScoringConfigPage />));
    await waitFor(() => {
      expect(screen.getByTestId('tab-score')).toBeInTheDocument();
    });
    fireEvent.click(screen.getByTestId('tab-score'));
    // 第一筆 score row 預期有 testid score-row-0
    await waitFor(() => {
      expect(screen.getByTestId('edit-score-0')).toBeInTheDocument();
    });
    const btn = screen.getByTestId('edit-score-0');
    expect(btn.className).toContain('action-btn');
    expect(btn.textContent?.trim()).toBe('');

    fireEvent.click(btn);
    await waitFor(() => {
      expect(screen.getByTestId('score-edit-modal')).toBeInTheDocument();
    });
  });

  it('TS-F054-E06：score 編輯 Modal 儲存 → 呼叫 updateDimensions（覆寫式整批 scores）', async () => {
    mockedUpdateDimensions.mockResolvedValue({} as any);
    render(wrap(<ScoringConfigPage />));
    await waitFor(() => {
      expect(screen.getByTestId('tab-score')).toBeInTheDocument();
    });
    fireEvent.click(screen.getByTestId('tab-score'));
    await waitFor(() => {
      expect(screen.getByTestId('edit-score-0')).toBeInTheDocument();
    });
    fireEvent.click(screen.getByTestId('edit-score-0'));
    await waitFor(() => {
      expect(screen.getByTestId('score-edit-modal')).toBeInTheDocument();
    });
    const modal = screen.getByTestId('score-edit-modal');
    // 修改分數值
    const scoreInput = within(modal).getByTestId('score-edit-score') as HTMLInputElement;
    fireEvent.change(scoreInput, { target: { value: '99' } });
    fireEvent.click(within(modal).getByTestId('score-edit-submit'));

    await waitFor(() => {
      expect(mockedUpdateDimensions).toHaveBeenCalled();
    });
    // 確認傳出的 payload 至少包含修改後的 score=99
    const callArg = mockedUpdateDimensions.mock.calls[0][0];
    const allScores = callArg.dimensions[0].scores;
    expect(allScores.some((s: any) => s.score === 99)).toBe(true);
  });

  it('TS-F054-E07：score 列 trash 按鈕 + 確認對話框 → 刪除該筆走 updateDimensions（覆寫式去除）', async () => {
    mockedUpdateDimensions.mockResolvedValue({} as any);
    render(wrap(<ScoringConfigPage />));
    await waitFor(() => {
      expect(screen.getByTestId('tab-score')).toBeInTheDocument();
    });
    fireEvent.click(screen.getByTestId('tab-score'));
    await waitFor(() => {
      expect(screen.getByTestId('delete-score-0')).toBeInTheDocument();
    });
    const trashBtn = screen.getByTestId('delete-score-0');
    // hover 紅色（prototype 28 L1171）
    expect(trashBtn.className).toContain('hover:text-[#EF4444]');
    expect(trashBtn.className).toContain('hover:bg-red-50');

    fireEvent.click(trashBtn);
    await waitFor(() => {
      expect(screen.getByTestId('score-delete-confirm-modal')).toBeInTheDocument();
    });
    fireEvent.click(screen.getByTestId('score-delete-confirm'));

    await waitFor(() => {
      expect(mockedUpdateDimensions).toHaveBeenCalled();
    });
    // 確認該筆被剔除（剩 1 筆 scores）
    const callArg = mockedUpdateDimensions.mock.calls[0][0];
    expect(callArg.dimensions[0].scores).toHaveLength(1);
  });
});

describe('ScoringConfigPage — CardLevelsTab 單列儲存 / 刪除（v1.3 DELETE）', () => {
  it('TS-F055-E01：每列 check 單列儲存按鈕 click → 呼叫 updateCardLevels', async () => {
    mockedUpdateCardLevels.mockResolvedValue({} as any);
    render(wrap(<ScoringConfigPage />));
    await waitFor(() => {
      expect(screen.getByTestId('tab-level')).toBeInTheDocument();
    });
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
    await waitFor(() => {
      expect(screen.getByTestId('tab-level')).toBeInTheDocument();
    });
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
    await waitFor(() => {
      expect(screen.getByTestId('tab-level')).toBeInTheDocument();
    });
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

describe('ScoringConfigPage — TierMappingTab 編輯 / 刪除（v1.4 DELETE）', () => {
  it('TS-F056-E01：每列 pencil 編輯 → 開啟 TIER 編輯 Modal，預填 tierLevel/listNm', async () => {
    render(wrap(<ScoringConfigPage />));
    await waitFor(() => {
      expect(screen.getByTestId('tab-tier')).toBeInTheDocument();
    });
    fireEvent.click(screen.getByTestId('tab-tier'));
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
    await waitFor(() => {
      expect(screen.getByTestId('tab-tier')).toBeInTheDocument();
    });
    fireEvent.click(screen.getByTestId('tab-tier'));
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
    await waitFor(() => {
      expect(screen.getByTestId('tab-tier')).toBeInTheDocument();
    });
    fireEvent.click(screen.getByTestId('tab-tier'));
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
    await waitFor(() => {
      expect(screen.getByTestId('tab-tier')).toBeInTheDocument();
    });
    fireEvent.click(screen.getByTestId('tab-tier'));
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
    await waitFor(() => {
      expect(screen.getByTestId('tab-tier')).toBeInTheDocument();
    });
    fireEvent.click(screen.getByTestId('tab-tier'));
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
