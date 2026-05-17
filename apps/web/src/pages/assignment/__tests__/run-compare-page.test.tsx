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

const sampleCompare: CompareRunsResponse = {
  runA: 'R001',
  runB: 'R002',
  summary: {
    totalA: 1000,
    totalB: 1100,
    deltaTotal: 100,
    customersAddedCount: 150,
    customersRemovedCount: 50,
    customersChangedAssigneeCount: 200,
  },
  personnelMismatch: [
    { empId: 'E001', empName: '張三', countA: 100, countB: 110, delta: 10 },
  ],
  customerDiff: [
    {
      customerId: 'C001',
      assigneeA: 'E001',
      assigneeB: 'E002',
      diffType: 'reassigned',
    },
  ],
};

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
    // listRuns 預設 mock — selector 需要
    mockedListRuns.mockResolvedValue({
      runs: [
        {
          runId: 'R001',
          ym: '202604',
          status: 'completed',
          triggeredBy: 'D',
          triggeredAt: '2026-04-24T10:00:00Z',
          finishedAt: '2026-04-24T11:00:00Z',
          totalCount: 9120,
        },
        {
          runId: 'R002',
          ym: '202605',
          status: 'completed',
          triggeredBy: 'D',
          triggeredAt: '2026-05-09T12:00:00Z',
          finishedAt: '2026-05-09T12:30:00Z',
          totalCount: 9500,
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

  it('渲染 summary 5 卡 + delta', async () => {
    mockedCompare.mockResolvedValue(sampleCompare);
    renderPage();
    await waitFor(() =>
      expect(screen.getByTestId('compare-summary')).toBeInTheDocument(),
    );
    expect(screen.getByTestId('delta-total')).toHaveTextContent('+100');
    expect(screen.getByTestId('reassigned-count')).toHaveTextContent('200');
  });

  it('渲染 personnelMismatch + customerDiff 表', async () => {
    mockedCompare.mockResolvedValue(sampleCompare);
    renderPage();
    await waitFor(() =>
      expect(screen.getByTestId('personnel-mismatch')).toBeInTheDocument(),
    );
    expect(screen.getByTestId('customer-diff')).toBeInTheDocument();
    expect(screen.getByText('C001')).toBeInTheDocument();
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

  describe('Phase 2 改造', () => {
    it('顯示 Run Selector（兩個 select）', async () => {
      mockedCompare.mockResolvedValue(sampleCompare);
      renderPage();
      await waitFor(() => {
        expect(screen.getByTestId('select-run-a')).toBeInTheDocument();
      });
      expect(screen.getByTestId('select-run-b')).toBeInTheDocument();
    });

    it('100% 相同（personnelMismatch=[]）顯示 identical banner', async () => {
      mockedCompare.mockResolvedValue({
        ...sampleCompare,
        summary: {
          ...sampleCompare.summary,
          customersChangedAssigneeCount: 0,
        },
        personnelMismatch: [],
        customerDiff: [],
      });
      renderPage();
      await waitFor(() => {
        expect(screen.getByTestId('identical-banner')).toBeInTheDocument();
      });
    });

    it('不一致率 > 3% 顯示 algorithm-changed warning banner', async () => {
      mockedCompare.mockResolvedValue({
        ...sampleCompare,
        summary: {
          totalA: 1000,
          totalB: 1100,
          deltaTotal: 100,
          customersAddedCount: 50,
          customersRemovedCount: 50,
          // 不一致 = 200 / 1100 = 18% > 3%
          customersChangedAssigneeCount: 200,
        },
      });
      renderPage();
      await waitFor(() => {
        expect(screen.getByTestId('algorithm-changed-banner')).toBeInTheDocument();
      });
    });

    it('不一致率 < 3% 不顯示 algorithm-changed banner', async () => {
      mockedCompare.mockResolvedValue({
        ...sampleCompare,
        summary: {
          totalA: 10000,
          totalB: 10100,
          deltaTotal: 100,
          customersAddedCount: 50,
          customersRemovedCount: 50,
          // 不一致 = 100 / 10100 = ~1% < 3%
          customersChangedAssigneeCount: 100,
        },
      });
      renderPage();
      await waitFor(() => {
        expect(screen.getByTestId('compare-summary')).toBeInTheDocument();
      });
      expect(screen.queryByTestId('algorithm-changed-banner')).not.toBeInTheDocument();
    });

    it('selector「交換 A/B」按鈕觸發重新 compareRuns(B, A)', async () => {
      mockedCompare.mockResolvedValue(sampleCompare);
      renderPage();
      await waitFor(() => {
        expect(screen.getByTestId('btn-swap')).toBeInTheDocument();
      });
      mockedCompare.mockClear();
      fireEvent.click(screen.getByTestId('btn-swap'));
      await waitFor(() => {
        // 第 2 次 compare 呼叫應為 R002, R001
        const calls = mockedCompare.mock.calls;
        expect(calls.some((c) => c[0] === 'R002' && c[1] === 'R001')).toBe(true);
      });
    });
  });
});
