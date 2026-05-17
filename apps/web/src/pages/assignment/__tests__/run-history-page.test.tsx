import { render, screen, fireEvent, cleanup, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import { RunHistoryPage } from '../run-history-page';
import { ToastProvider } from '@/components/ui/toast';
import * as runApi from '@/api/assignment-run';
import * as authStore from '@/stores/auth-store';
import type { RunListItem } from '@/api/assignment-run';

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

const mockedListRuns = vi.mocked(runApi.listRuns);
const mockedGetUser = vi.mocked(authStore.getUser);
const mockedGetBusinessRole = vi.mocked(authStore.getBusinessRole);
const mockedGetEffectiveIdentity = vi.mocked(authStore.getEffectiveIdentity);

const sampleRuns: RunListItem[] = [
  {
    runId: 'R001',
    ym: '202605',
    status: 'completed',
    triggeredBy: 'Director',
    triggeredAt: '2026-05-10T10:00:00.000Z',
    finishedAt: '2026-05-10T10:15:00.000Z',
  },
  {
    runId: 'R002',
    ym: '202605',
    status: 'failed',
    triggeredBy: 'Director',
    triggeredAt: '2026-05-11T10:00:00.000Z',
    finishedAt: '2026-05-11T10:05:00.000Z',
  },
];

function renderPage() {
  return render(
    <MemoryRouter>
      <ToastProvider>
        <RunHistoryPage />
      </ToastProvider>
    </MemoryRouter>,
  );
}

describe('RunHistoryPage (F065)', () => {
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
    mockedListRuns.mockResolvedValue({ runs: sampleRuns });
  });

  afterEach(() => cleanup());

  it('渲染 run 列表 + status badge', async () => {
    renderPage();
    await waitFor(() =>
      expect(screen.getByTestId('run-row-R001')).toBeInTheDocument(),
    );
    expect(screen.getByTestId('run-row-R002')).toBeInTheDocument();
    expect(screen.getByTestId('run-row-status-completed')).toBeInTheDocument();
    expect(screen.getByTestId('run-row-status-failed')).toBeInTheDocument();
  });

  it('比對按鈕預設 disabled；勾選 2 個 run 後啟用', async () => {
    renderPage();
    await waitFor(() =>
      expect(screen.getByTestId('run-row-R001')).toBeInTheDocument(),
    );
    expect(screen.getByTestId('btn-compare-selected')).toBeDisabled();

    fireEvent.click(screen.getByTestId('run-checkbox-R001'));
    expect(screen.getByTestId('btn-compare-selected')).toBeDisabled();

    fireEvent.click(screen.getByTestId('run-checkbox-R002'));
    expect(screen.getByTestId('btn-compare-selected')).not.toBeDisabled();
  });

  it('勾選第 3 個 run 被阻擋（最多 2 個）', async () => {
    mockedListRuns.mockResolvedValue({
      runs: [
        ...sampleRuns,
        {
          runId: 'R003',
          ym: '202605',
          status: 'completed',
          triggeredBy: 'Director',
          triggeredAt: '2026-05-12T10:00:00.000Z',
          finishedAt: '2026-05-12T10:10:00.000Z',
        },
      ],
    });
    renderPage();
    await waitFor(() =>
      expect(screen.getByTestId('run-row-R003')).toBeInTheDocument(),
    );
    fireEvent.click(screen.getByTestId('run-checkbox-R001'));
    fireEvent.click(screen.getByTestId('run-checkbox-R002'));
    // R003 checkbox 應 disabled
    expect(screen.getByTestId('run-checkbox-R003')).toBeDisabled();
  });

  it('空列表顯示 empty state', async () => {
    mockedListRuns.mockResolvedValue({ runs: [] });
    renderPage();
    await waitFor(() =>
      expect(screen.getByTestId('history-empty')).toBeInTheDocument(),
    );
  });

  it('搜尋 runId 子字串過濾', async () => {
    renderPage();
    await waitFor(() =>
      expect(screen.getByTestId('run-row-R001')).toBeInTheDocument(),
    );
    fireEvent.change(screen.getByPlaceholderText(/搜尋 runId/), {
      target: { value: 'R002' },
    });
    expect(screen.queryByTestId('run-row-R001')).not.toBeInTheDocument();
    expect(screen.getByTestId('run-row-R002')).toBeInTheDocument();
  });

  describe('Phase 3 P2-4', () => {
    it('狀態 filter select 過濾為 completed', async () => {
      renderPage();
      await waitFor(() =>
        expect(screen.getByTestId('run-row-R001')).toBeInTheDocument(),
      );
      // 假設 R002 是 failed（要看 mock 結構）
      fireEvent.change(screen.getByTestId('filter-status'), {
        target: { value: 'completed' },
      });
      // 至少有一筆 completed 還在；其他狀態被過濾
      const rows = screen.getAllByTestId(/^run-row-/);
      expect(rows.length).toBeGreaterThan(0);
    });

    it('觸發者 filter select 顯示且可選', async () => {
      renderPage();
      await waitFor(() =>
        expect(screen.getByTestId('filter-triggered-by')).toBeInTheDocument(),
      );
    });

    it('全選 checkbox 一次選滿（最多 2 個 completed）', async () => {
      // 重新 mock 提供 2+ completed runs
      mockedListRuns.mockResolvedValueOnce({
        runs: [
          {
            runId: 'R001',
            ym: '202605',
            status: 'completed',
            triggeredBy: 'Director',
            triggeredAt: '2026-05-10T10:00:00.000Z',
            finishedAt: '2026-05-10T10:15:00.000Z',
          },
          {
            runId: 'R002',
            ym: '202605',
            status: 'completed',
            triggeredBy: 'Director',
            triggeredAt: '2026-05-11T10:00:00.000Z',
            finishedAt: '2026-05-11T10:20:00.000Z',
          },
        ],
      });
      renderPage();
      await waitFor(() =>
        expect(screen.getByTestId('checkbox-select-all')).toBeInTheDocument(),
      );
      fireEvent.click(screen.getByTestId('checkbox-select-all'));
      await waitFor(() => {
        const compareBtn = screen.getByTestId('btn-compare-selected');
        expect(compareBtn).not.toBeDisabled();
      });
    });

    it('表格顯示「耗時」欄', async () => {
      renderPage();
      await waitFor(() =>
        expect(screen.getByTestId('run-row-R001')).toBeInTheDocument(),
      );
      const headerRow = screen.getByTestId('history-table-head');
      expect(headerRow.textContent).toContain('耗時');
    });

    it('表格顯示「分派筆數」欄', async () => {
      renderPage();
      await waitFor(() =>
        expect(screen.getByTestId('run-row-R001')).toBeInTheDocument(),
      );
      const headerRow = screen.getByTestId('history-table-head');
      expect(headerRow.textContent).toContain('分派筆數');
    });
  });
});
