import { render, screen, cleanup, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { RunSummaryPage } from '../run-summary-page';
import { ToastProvider } from '@/components/ui/toast';
import * as runApi from '@/api/assignment-run';
import * as authStore from '@/stores/auth-store';
import type { RunSummaryResponse } from '@/api/assignment-run';

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

const mockedGetSummary = vi.mocked(runApi.getRunSummary);
const mockedExport = vi.mocked(runApi.downloadRunExport);
const mockedGetUser = vi.mocked(authStore.getUser);
const mockedGetBusinessRole = vi.mocked(authStore.getBusinessRole);
const mockedGetEffectiveIdentity = vi.mocked(authStore.getEffectiveIdentity);

const sampleSummary: RunSummaryResponse = {
  runId: 'R001',
  ym: '202605',
  totalAssigned: 1234,
  deptBreakdown: [
    { deptCode: 'D001', deptName: '業務一部', assignedCount: 700, ratio: 0.57 },
    { deptCode: 'D002', deptName: '業務二部', assignedCount: 534, ratio: 0.43 },
  ],
  personnelBreakdown: [
    { empId: 'E001', empName: '張三', assignedCount: 100, ratio: 0.08 },
  ],
};

function renderPage(runId = 'R001') {
  return render(
    <MemoryRouter initialEntries={[`/assignment/run-summary?runId=${runId}`]}>
      <ToastProvider>
        <Routes>
          <Route path="/assignment/run-summary" element={<RunSummaryPage />} />
        </Routes>
      </ToastProvider>
    </MemoryRouter>,
  );
}

describe('RunSummaryPage (F063)', () => {
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
  });

  afterEach(() => cleanup());

  it('runId 缺失顯示錯誤', async () => {
    renderPage('');
    await waitFor(() =>
      expect(screen.getByTestId('summary-error')).toHaveTextContent(/缺少 runId/),
    );
  });

  it('顯示總分派數 + dept + personnel breakdown', async () => {
    mockedGetSummary.mockResolvedValue(sampleSummary);
    renderPage();
    await waitFor(() =>
      expect(screen.getByTestId('total-assigned')).toHaveTextContent('1,234'),
    );
    expect(screen.getByTestId('dept-breakdown')).toBeInTheDocument();
    expect(screen.getByTestId('personnel-breakdown')).toBeInTheDocument();
    expect(screen.getByText('D001')).toBeInTheDocument();
    expect(screen.getByText('E001')).toBeInTheDocument();
  });

  it('CSV 匯出按鈕呼叫 downloadRunExport(csv)', async () => {
    mockedGetSummary.mockResolvedValue(sampleSummary);
    mockedExport.mockResolvedValue();
    renderPage();
    await waitFor(() => expect(screen.getByTestId('btn-export-csv')).toBeInTheDocument());
    fireEvent.click(screen.getByTestId('btn-export-csv'));
    await waitFor(() =>
      expect(mockedExport).toHaveBeenCalledWith('R001', 'csv'),
    );
  });

  it('XLSX 匯出按鈕呼叫 downloadRunExport(xlsx)', async () => {
    mockedGetSummary.mockResolvedValue(sampleSummary);
    mockedExport.mockResolvedValue();
    renderPage();
    await waitFor(() => expect(screen.getByTestId('btn-export-xlsx')).toBeInTheDocument());
    fireEvent.click(screen.getByTestId('btn-export-xlsx'));
    await waitFor(() =>
      expect(mockedExport).toHaveBeenCalledWith('R001', 'xlsx'),
    );
  });

  describe('Phase 3 P2-3', () => {
    it('顯示 READ-ONLY badge + Run Info Bar 5 欄', async () => {
      mockedGetSummary.mockResolvedValue({
        runId: 'R001',
        projectWorkym: '202605',
        finishedAt: '2026-05-09T12:30:17Z',
        durationMs: 30 * 60 * 1000,
        stage1Count: 50000,
        stage4Count: 9500,
        coverageRate: 0.95,
        deptSummary: [],
        levelDistribution: [],
      });
      renderPage();
      await waitFor(() =>
        expect(screen.getByTestId('readonly-badge')).toBeInTheDocument(),
      );
    });

    it('deptSummary 渲染部門偏差 chart（D01 with alert）', async () => {
      mockedGetSummary.mockResolvedValue({
        runId: 'R001',
        projectWorkym: '202605',
        finishedAt: '2026-05-09T12:30:17Z',
        durationMs: 30 * 60 * 1000,
        stage1Count: 1000,
        stage4Count: 950,
        coverageRate: 0.95,
        deptSummary: [
          {
            deptId: 'D01',
            deptName: '業務一部',
            configRatio: 30,
            actualCount: 285,
            actualRatio: 28.5,
            deviation: -1.5,
            alert: false,
          },
          {
            deptId: 'D02',
            deptName: '業務二部',
            configRatio: 25,
            actualCount: 290,
            actualRatio: 29,
            deviation: 4,
            alert: true,
          },
        ],
        levelDistribution: [],
      });
      renderPage();
      await waitFor(() =>
        expect(screen.getByTestId('dept-deviation-D01')).toBeInTheDocument(),
      );
      expect(
        screen.getByTestId('dept-deviation-D02').getAttribute('data-alert'),
      ).toBe('true');
      // 部門以名稱顯示（代號對 user 無意義）— 出現於偏差 chart 與「分派部門數」副標
      expect(screen.getAllByText(/業務一部/).length).toBeGreaterThan(0);
    });

    it('levelDistribution 渲染 CARD_LEVEL donut legend', async () => {
      mockedGetSummary.mockResolvedValue({
        runId: 'R001',
        projectWorkym: '202605',
        deptSummary: [],
        levelDistribution: [
          { cardLevel: 'A', count: 800, ratio: 40 },
          { cardLevel: 'B', count: 1200, ratio: 60 },
        ],
      });
      renderPage();
      await waitFor(() =>
        expect(screen.getByTestId('card-legend-A')).toBeInTheDocument(),
      );
      expect(screen.getByTestId('card-legend-B')).toBeInTheDocument();
    });

    it('分派業務員數 stat card 顯示 emplCount + 平均每人 X 案', async () => {
      mockedGetSummary.mockResolvedValue({
        runId: 'R001',
        projectWorkym: '202605',
        stage4Count: 9500,
        emplCount: 142,
        deptSummary: [],
        levelDistribution: [],
      });
      renderPage();
      await waitFor(() =>
        expect(screen.getByTestId('empl-count')).toHaveTextContent('142'),
      );
      // 9500 / 142 = 66.9 → round 67
      expect(screen.getByText(/平均每人 67 案/)).toBeInTheDocument();
    });

    it('emplCount=0（F101 未跑 / emplid 全 NULL）→ 顯示「尚無人員分派資料」不除零', async () => {
      mockedGetSummary.mockResolvedValue({
        runId: 'R001',
        projectWorkym: '202605',
        stage4Count: 9500,
        emplCount: 0,
        deptSummary: [],
        levelDistribution: [],
      });
      renderPage();
      await waitFor(() =>
        expect(screen.getByTestId('empl-count')).toHaveTextContent('0'),
      );
      expect(screen.getByText(/尚無人員分派資料/)).toBeInTheDocument();
    });

    it('任一部門偏差 > 3% (alert) → 顯示 NFR-005 警示 note', async () => {
      mockedGetSummary.mockResolvedValue({
        runId: 'R001',
        projectWorkym: '202605',
        stage4Count: 950,
        deptSummary: [
          {
            deptId: 'D01',
            configRatio: 25,
            actualCount: 290,
            actualRatio: 29,
            deviation: 4,
            alert: true,
          },
        ],
        levelDistribution: [],
      });
      renderPage();
      await waitFor(() =>
        expect(screen.getByTestId('nfr005-alert-note')).toBeInTheDocument(),
      );
      expect(screen.getByTestId('nfr005-alert-note')).toHaveTextContent(/NFR-005/);
    });

    it('無偏差警示 → 不顯示 NFR-005 note', async () => {
      mockedGetSummary.mockResolvedValue({
        runId: 'R001',
        projectWorkym: '202605',
        stage4Count: 950,
        deptSummary: [
          {
            deptId: 'D01',
            configRatio: 30,
            actualCount: 285,
            actualRatio: 28.5,
            deviation: -1.5,
            alert: false,
          },
        ],
        levelDistribution: [],
      });
      renderPage();
      await waitFor(() =>
        expect(screen.getByTestId('total-assigned')).toBeInTheDocument(),
      );
      expect(screen.queryByTestId('nfr005-alert-note')).toBeNull();
    });

    it('匯出區不再顯示 AD-E07-11 注意事項說明（對使用者無意義已移除）', async () => {
      mockedGetSummary.mockResolvedValue({
        runId: 'R001',
        projectWorkym: '202605',
        deptSummary: [],
        levelDistribution: [],
        stage4Count: 100,
      });
      renderPage();
      // 匯出區仍渲染（以 export 按鈕為錨點），但 AD-E07-11 說明區塊已移除
      await waitFor(() =>
        expect(screen.getByTestId('btn-export-xlsx')).toBeInTheDocument(),
      );
      expect(screen.queryByText(/匯出注意事項（AD-E07-11）/)).toBeNull();
    });

    it('匯出 button 文案改為「匯出 Excel (streaming)」', async () => {
      mockedGetSummary.mockResolvedValue({
        runId: 'R001',
        projectWorkym: '202605',
        deptSummary: [],
        levelDistribution: [],
        stage4Count: 100,
      });
      renderPage();
      await waitFor(() =>
        expect(screen.getByTestId('btn-export-xlsx')).toBeInTheDocument(),
      );
      const btn = screen.getByTestId('btn-export-xlsx');
      expect(btn.textContent).toContain('streaming');
    });
  });

  // Phase 5d 波 10：v2.1 skipped_cases.lists 顯示（對齊 5b ITP-006 / IT-M01-017）
  describe('Phase 5d 波 10 — skipped_cases.lists 顯示', () => {
    // rs.test#new1：mock result skipped_cases.lists → 渲染跳過名單區塊
    it('rs.test#new1: warnings.skippedCases.lists 含名單 → 渲染 skipped lists 區塊', async () => {
      mockedGetSummary.mockResolvedValue({
        runId: 'R001',
        projectWorkym: '202605',
        deptSummary: [],
        levelDistribution: [],
        stage4Count: 100,
        warnings: {
          summaryCode: 'EMPTY_CONDITIONS_SKIPPED',
          skippedCases: {
            lists: [
              { listNo: 'OB202605002', listNm: '空條件名單', reason: 'EMPTY_CONDITIONS' },
              { listNo: 'OB202605003', listNm: '另一個 skip', reason: 'EMPTY_CONDITIONS' },
            ],
          },
        },
      });
      renderPage();
      await waitFor(() =>
        expect(screen.getByTestId('skipped-lists-section')).toBeInTheDocument(),
      );
      const section = screen.getByTestId('skipped-lists-section');
      expect(section.textContent).toContain('OB202605002');
      expect(section.textContent).toContain('OB202605003');
      expect(section.textContent).toContain('空條件名單');
    });

    // rs.test#new2：無 skipped → 不顯示區塊
    it('rs.test#new2: warnings.skippedCases.lists 為空 → 不顯示 skipped lists 區塊', async () => {
      mockedGetSummary.mockResolvedValue({
        runId: 'R001',
        projectWorkym: '202605',
        deptSummary: [],
        levelDistribution: [],
        stage4Count: 100,
        warnings: { summaryCode: null, skippedCases: null },
      });
      renderPage();
      await waitFor(() =>
        expect(screen.getByTestId('total-assigned')).toBeInTheDocument(),
      );
      expect(screen.queryByTestId('skipped-lists-section')).toBeNull();
    });
  });
});
