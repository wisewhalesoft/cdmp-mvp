import { render, screen, cleanup, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { RunComparePage } from '../run-compare-page';
import { ToastProvider } from '@/components/ui/toast';
import * as runApi from '@/api/assignment-run';
import * as authStore from '@/stores/auth-store';
import type { CompareRunsResponse } from '@/api/assignment-run';

vi.mock('@/api/assignment-run');
vi.mock('@/api/auth', () => ({ logout: vi.fn().mockResolvedValue({}) }));
vi.mock('@/stores/auth-store', async () => {
  const actual = await vi.importActual('@/stores/auth-store');
  return {
    ...actual,
    getUser: vi.fn(),
    getBusinessRole: vi.fn(),
    getEffectiveIdentity: vi.fn(),
    clearAuth: vi.fn(),
  };
});

const mockedCompare = vi.mocked(runApi.compareRuns);
const mockedExport = vi.mocked(runApi.downloadCompareExport);
const mockedListRuns = vi.mocked(runApi.listRuns);
const mockedGetUser = vi.mocked(authStore.getUser);
const mockedGetBusinessRole = vi.mocked(authStore.getBusinessRole);
const mockedGetEffectiveIdentity = vi.mocked(authStore.getEffectiveIdentity);

// ⚠️ 真實後端 CompareResponse shape（base/compare、summary.deptDiff/levelDiff、
//    personnelMismatch.{list,rate,alert}、configDiff、customerDiff.{added,removed}）。
//    舊測試以虛構 shape（summary.totalA…）造 mock → 測試綠但 prod 白屏（feedback_mock_real_system_contract）。
const sampleCompare: CompareRunsResponse = {
  base: { runId: 'R001', projectWorkym: '202604', totalCases: 1000 },
  compare: { runId: 'R002', projectWorkym: '202605', totalCases: 1100 },
  summary: {
    totalDiff: 100,
    deptDiff: [
      { deptId: 'D01', baseCount: 500, compareCount: 540, diff: 40 },
      { deptId: 'D02', baseCount: 500, compareCount: 560, diff: 60 },
    ],
    levelDiff: [
      { cardLevel: 'A', baseCount: 600, compareCount: 620, diff: 20 },
      { cardLevel: 'B', baseCount: 400, compareCount: 480, diff: 80 },
    ],
  },
  configDiff: {
    cardVersionChanged: { from: 2, to: 3 },
    deptRatioChanges: [{ listNo: 'L1', deptId: 'D01', from: 30, to: 32 }],
    crRuleChanged: null,
  },
  personnelMismatch: {
    list: [{ applNo: 'APPL0001', baseEmplId: 'E001', compareEmplId: 'E002' }],
    mismatchCount: 200,
    totalCount: 1000,
    rate: 0.2,
    alert: true,
  },
  customerDiff: {
    added: [{ applNo: 'APPL_ADD_1' }],
    removed: [{ applNo: 'APPL_RM_1' }],
  },
};

function identical(): CompareRunsResponse {
  return {
    ...sampleCompare,
    summary: { totalDiff: 0, deptDiff: [], levelDiff: [] },
    configDiff: {
      cardVersionChanged: null,
      deptRatioChanges: [],
      crRuleChanged: null,
    },
    personnelMismatch: {
      list: [],
      mismatchCount: 0,
      totalCount: 1000,
      rate: 0,
      alert: false,
    },
    customerDiff: { added: [], removed: [] },
  };
}

function renderPage(runA = 'R001', runB = 'R002') {
  return render(
    <MemoryRouter initialEntries={[`/assignment/compare?runA=${runA}&runB=${runB}`]}>
      <ToastProvider>
        <Routes>
          <Route path="/assignment/compare" element={<RunComparePage />} />
        </Routes>
      </ToastProvider>
    </MemoryRouter>,
  );
}

describe('RunComparePage (F067)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockedGetUser.mockReturnValue({
      id: 'd1',
      name: 'Director',
      email: 'manager@cdmp.test',
      role: 'user',
      isSalesManager: true,
      businessRole: 'director',
    });
    mockedGetBusinessRole.mockReturnValue('director');
    mockedGetEffectiveIdentity.mockReturnValue('director');
    mockedListRuns.mockResolvedValue({
      runs: [
        {
          runId: 'R001',
          projectWorkym: '202604',
          status: 'completed',
          triggeredBy: 'uuid-d',
          triggeredByName: '王部長',
          triggeredAt: '2026-04-24T10:00:00Z',
          finishedAt: '2026-04-24T11:00:00Z',
          totalCases: 1000,
        },
        {
          runId: 'R002',
          projectWorkym: '202605',
          status: 'completed',
          triggeredBy: 'uuid-d',
          triggeredByName: '王部長',
          triggeredAt: '2026-05-09T12:00:00Z',
          finishedAt: '2026-05-09T12:30:00Z',
          totalCases: 1100,
        },
      ],
    });
  });

  afterEach(() => cleanup());

  it('缺 runA/runB 顯示錯誤', async () => {
    renderPage('', '');
    await waitFor(() =>
      expect(screen.getByTestId('compare-error')).toHaveTextContent(/runA/),
    );
  });

  it('渲染 summary 區（真實 base/compare/totalDiff，不白屏）', async () => {
    mockedCompare.mockResolvedValue(sampleCompare);
    renderPage();
    await waitFor(() =>
      expect(screen.getByTestId('compare-summary')).toBeInTheDocument(),
    );
    const totalCard = screen.getByTestId('summary-stat-total');
    expect(totalCard).toHaveTextContent('1,000');
    expect(totalCard).toHaveTextContent('1,100');
    expect(totalCard).toHaveTextContent('+100');
  });

  it('渲染 NFR-005 人員配對不一致率 + 不一致數', async () => {
    mockedCompare.mockResolvedValue(sampleCompare);
    renderPage();
    await waitFor(() =>
      expect(screen.getByTestId('personnel-mismatch')).toBeInTheDocument(),
    );
    // rate 0.2(比例) → 20.00%
    expect(screen.getByTestId('mismatch-rate')).toHaveTextContent('20.00%');
    expect(screen.getByTestId('mismatch-count')).toHaveTextContent('200');
    // 不一致清單以 baseEmplId / compareEmplId 呈現
    expect(screen.getByText('APPL0001')).toBeInTheDocument();
    expect(screen.getByText('E001')).toBeInTheDocument();
    expect(screen.getByText('E002')).toBeInTheDocument();
  });

  it('渲染 dept / level / config / customer 區', async () => {
    mockedCompare.mockResolvedValue(sampleCompare);
    renderPage();
    await waitFor(() =>
      expect(screen.getByTestId('dept-compare')).toBeInTheDocument(),
    );
    expect(screen.getByTestId('level-compare')).toBeInTheDocument();
    expect(screen.getByTestId('config-diff')).toBeInTheDocument();
    expect(screen.getByTestId('config-diff')).toHaveTextContent('card_version');
    expect(screen.getByTestId('customer-diff')).toBeInTheDocument();
    expect(screen.getByTestId('customer-added-count')).toHaveTextContent('1 筆');
    expect(screen.getByTestId('customer-removed-count')).toHaveTextContent('1 筆');
  });

  it('匯出 XLSX 呼叫 downloadCompareExport(runA, runB)', async () => {
    mockedCompare.mockResolvedValue(sampleCompare);
    mockedExport.mockResolvedValue();
    renderPage();
    await waitFor(() =>
      expect(screen.getByTestId('btn-export-compare')).toBeInTheDocument(),
    );
    fireEvent.click(screen.getByTestId('btn-export-compare'));
    await waitFor(() =>
      expect(mockedExport).toHaveBeenCalledWith('R001', 'R002'),
    );
  });

  describe('banners', () => {
    it('100% 相同顯示 identical banner', async () => {
      mockedCompare.mockResolvedValue(identical());
      renderPage();
      await waitFor(() =>
        expect(screen.getByTestId('identical-banner')).toBeInTheDocument(),
      );
      expect(
        screen.queryByTestId('algorithm-changed-banner'),
      ).not.toBeInTheDocument();
    });

    it('alert=true（不一致率 > 3%）顯示 algorithm-changed banner', async () => {
      mockedCompare.mockResolvedValue(sampleCompare);
      renderPage();
      await waitFor(() =>
        expect(
          screen.getByTestId('algorithm-changed-banner'),
        ).toBeInTheDocument(),
      );
    });

    it('alert=false（不一致率 < 3% 但有差異）不顯示 algorithm-changed banner', async () => {
      mockedCompare.mockResolvedValue({
        ...sampleCompare,
        personnelMismatch: {
          list: [{ applNo: 'A1', baseEmplId: 'E1', compareEmplId: 'E2' }],
          mismatchCount: 10,
          totalCount: 1000,
          rate: 0.01,
          alert: false,
        },
      });
      renderPage();
      await waitFor(() =>
        expect(screen.getByTestId('compare-summary')).toBeInTheDocument(),
      );
      expect(
        screen.queryByTestId('algorithm-changed-banner'),
      ).not.toBeInTheDocument();
      expect(screen.queryByTestId('identical-banner')).not.toBeInTheDocument();
    });
  });

  describe('selector', () => {
    it('顯示 Run Selector（兩個 select）', async () => {
      mockedCompare.mockResolvedValue(sampleCompare);
      renderPage();
      await waitFor(() => {
        expect(screen.getByTestId('select-run-a')).toBeInTheDocument();
      });
      expect(screen.getByTestId('select-run-b')).toBeInTheDocument();
    });

    it('「交換 A/B」按鈕觸發重新 compareRuns(B, A)', async () => {
      mockedCompare.mockResolvedValue(sampleCompare);
      renderPage();
      await waitFor(() => {
        expect(screen.getByTestId('btn-swap')).toBeInTheDocument();
      });
      mockedCompare.mockClear();
      fireEvent.click(screen.getByTestId('btn-swap'));
      await waitFor(() => {
        const calls = mockedCompare.mock.calls;
        expect(calls.some((c) => c[0] === 'R002' && c[1] === 'R001')).toBe(true);
      });
    });
  });
});
