import { render, screen, cleanup, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { RunProgressPage } from '../run-progress-page';
import { ToastProvider } from '@/components/ui/toast';
import * as runApi from '@/api/assignment-run';
import * as authStore from '@/stores/auth-store';

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

const mockedGetRun = vi.mocked(runApi.getRun);
const mockedGetUser = vi.mocked(authStore.getUser);
const mockedGetBusinessRole = vi.mocked(authStore.getBusinessRole);
const mockedGetEffectiveIdentity = vi.mocked(authStore.getEffectiveIdentity);

function renderPage(runId = 'R001') {
  return render(
    <MemoryRouter initialEntries={[`/assignment/run-progress?runId=${runId}`]}>
      <ToastProvider>
        <Routes>
          <Route path="/assignment/run-progress" element={<RunProgressPage />} />
        </Routes>
      </ToastProvider>
    </MemoryRouter>,
  );
}

describe('RunProgressPage (F062 polling)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Use real timers — polling tests verify only initial render; 3s interval too slow to be timer-tested reliably
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

  it('runId 缺失 → 顯示錯誤', async () => {
    render(
      <MemoryRouter initialEntries={['/assignment/run-progress']}>
        <ToastProvider>
          <Routes>
            <Route path="/assignment/run-progress" element={<RunProgressPage />} />
          </Routes>
        </ToastProvider>
      </MemoryRouter>,
    );
    await waitFor(() =>
      expect(screen.getByTestId('run-error')).toHaveTextContent(/缺少 runId/),
    );
  });

  it('running 狀態渲染進度條 + 階段 badge', async () => {
    mockedGetRun.mockResolvedValue({
      runId: 'R001',
      ym: '202605',
      status: 'running',
      triggeredBy: 'Director',
      triggeredAt: '2026-05-10T10:00:00.000Z',
      stages: [
        { name: 'Stage 1', status: 'completed', progressPercent: 100, processedCount: 100, totalCount: 100 },
        { name: 'Stage 2', status: 'running', progressPercent: 40, processedCount: 40, totalCount: 100 },
      ],
      totals: { processedCount: 140, totalCount: 200, progressPercent: 70 },
    });
    renderPage();
    await waitFor(() =>
      expect(screen.getByTestId('total-progress')).toHaveTextContent(/140 \/ 200/),
    );
    // 多個 run-status-running 元素（header + stage row）— 用 getAllBy
    expect(screen.getAllByTestId('run-status-running').length).toBeGreaterThan(0);
    expect(screen.getByTestId('stage-row-Stage 1')).toBeInTheDocument();
    expect(screen.getByTestId('stage-row-Stage 2')).toBeInTheDocument();
  });

  it('completed 狀態渲染完成狀態 + 「查看結果摘要」按鈕', async () => {
    mockedGetRun.mockResolvedValue({
      runId: 'R001',
      ym: '202605',
      status: 'completed',
      triggeredBy: 'Director',
      triggeredAt: '2026-05-10T10:00:00.000Z',
      finishedAt: '2026-05-10T10:15:00.000Z',
      totals: { processedCount: 200, totalCount: 200, progressPercent: 100 },
    });
    renderPage();
    await waitFor(() =>
      expect(screen.getAllByTestId('run-status-completed').length).toBeGreaterThan(0),
    );
    expect(screen.getByRole('button', { name: /查看結果摘要/ })).toBeInTheDocument();
  });

  it('Run Summary Card 以後端真實契約顯示作業年月 / 觸發者名稱 / 總筆數', async () => {
    // 對齊後端 getRunById 實際回傳（projectWorkym / triggeredByName / totalCases），
    // 而非舊契約 ym / triggeredBy(UUID) / totals.totalCount（feedback_mock_real_system_contract）。
    mockedGetRun.mockResolvedValue({
      runId: '261e66df-8e7b-45f8-ab2c-a3f559acf3d3',
      projectWorkym: '202606',
      status: 'completed',
      triggeredBy: '261e66df-8e7b-45f8-ab2c-a3f559acf3d3',
      triggeredByName: '李處長',
      triggeredAt: '2026-06-10T10:00:00.000Z',
      finishedAt: '2026-06-10T10:15:00.000Z',
      totalCases: 55863,
    });
    renderPage();
    await waitFor(() =>
      expect(screen.getAllByTestId('run-status-completed').length).toBeGreaterThan(0),
    );
    // 作業年月：projectWorkym（不空白）
    expect(screen.getByText('202606')).toBeInTheDocument();
    // 觸發者：顯示名稱、非 UUID
    expect(screen.getByText('李處長')).toBeInTheDocument();
    // 總筆數：totalCases 格式化（不空白）
    expect(screen.getByText('55,863')).toBeInTheDocument();
  });

  it('failed 狀態顯示 error message', async () => {
    mockedGetRun.mockResolvedValue({
      runId: 'R001',
      ym: '202605',
      status: 'failed',
      triggeredBy: 'Director',
      triggeredAt: '2026-05-10T10:00:00.000Z',
      errorMessage: 'Stage 2 評分失敗：cardType 缺失',
    });
    renderPage();
    await waitFor(() =>
      expect(screen.getAllByTestId('run-status-failed').length).toBeGreaterThan(0),
    );
    expect(screen.getByText(/Stage 2 評分失敗/)).toBeInTheDocument();
  });

  describe('Phase 2 改造', () => {
    it('running 狀態顯示 5-step stage stepper', async () => {
      mockedGetRun.mockResolvedValue({
        runId: 'R001',
        ym: '202605',
        status: 'running',
        triggeredBy: 'Director',
        triggeredAt: '2026-05-10T10:00:00.000Z',
        stages: [
          { name: 'Stage 0', status: 'completed', progressPercent: 100 },
          { name: 'Stage 1', status: 'completed', progressPercent: 100 },
          { name: 'Stage 2', status: 'running', progressPercent: 40 },
          { name: 'Stage 3', status: 'pending' },
          { name: 'Stage 4', status: 'pending' },
        ],
      });
      renderPage();
      await waitFor(() => {
        expect(screen.getByTestId('stage-stepper-progress')).toBeInTheDocument();
      });
      expect(screen.getByTestId('stage-dot-0')).toBeInTheDocument();
      expect(screen.getByTestId('stage-dot-4')).toBeInTheDocument();
    });

    it('running 狀態顯示 elapsed timer', async () => {
      mockedGetRun.mockResolvedValue({
        runId: 'R001',
        ym: '202605',
        status: 'running',
        triggeredBy: 'Director',
        triggeredAt: '2026-05-10T10:00:00.000Z',
      });
      renderPage();
      await waitFor(() => {
        expect(screen.getByTestId('elapsed-timer')).toBeInTheDocument();
      });
    });

    it('running 狀態 director 顯示「取消月跑」按鈕', async () => {
      mockedGetRun.mockResolvedValue({
        runId: 'R001',
        ym: '202605',
        status: 'running',
        triggeredBy: 'Director',
        triggeredAt: '2026-05-10T10:00:00.000Z',
      });
      renderPage();
      await waitFor(() => {
        expect(screen.getByTestId('btn-cancel-run')).toBeInTheDocument();
      });
    });

    it('section_chief 顯示「處長唯讀」banner（P3-2）', async () => {
      mockedGetBusinessRole.mockReturnValue('section_chief');
      mockedGetRun.mockResolvedValue({
        runId: 'R001',
        ym: '202605',
        status: 'running',
        triggeredBy: 'Director',
        triggeredAt: '2026-05-10T10:00:00.000Z',
      });
      renderPage();
      await waitFor(() => {
        expect(screen.getByTestId('director-readonly-banner')).toBeInTheDocument();
      });
    });

    it('director 不顯示「處長唯讀」banner', async () => {
      mockedGetBusinessRole.mockReturnValue('director');
      mockedGetRun.mockResolvedValue({
        runId: 'R001',
        ym: '202605',
        status: 'running',
        triggeredBy: 'Director',
        triggeredAt: '2026-05-10T10:00:00.000Z',
      });
      renderPage();
      await waitFor(() => {
        expect(screen.getByTestId('elapsed-timer')).toBeInTheDocument();
      });
      expect(screen.queryByTestId('director-readonly-banner')).not.toBeInTheDocument();
    });

    it('section_chief 不顯示「取消月跑」按鈕', async () => {
      mockedGetBusinessRole.mockReturnValue('section_chief');
      mockedGetRun.mockResolvedValue({
        runId: 'R001',
        ym: '202605',
        status: 'running',
        triggeredBy: 'Director',
        triggeredAt: '2026-05-10T10:00:00.000Z',
      });
      renderPage();
      await waitFor(() => {
        expect(screen.getByTestId('elapsed-timer')).toBeInTheDocument();
      });
      expect(screen.queryByTestId('btn-cancel-run')).not.toBeInTheDocument();
    });

    it('completed 狀態不顯示「取消月跑」按鈕', async () => {
      mockedGetRun.mockResolvedValue({
        runId: 'R001',
        ym: '202605',
        status: 'completed',
        triggeredBy: 'Director',
        triggeredAt: '2026-05-10T10:00:00.000Z',
        finishedAt: '2026-05-10T10:30:00.000Z',
      });
      renderPage();
      await waitFor(() =>
        expect(screen.getAllByTestId('run-status-completed').length).toBeGreaterThan(0),
      );
      expect(screen.queryByTestId('btn-cancel-run')).not.toBeInTheDocument();
    });

    it('completed 狀態顯示 3 個跳轉連結（結果摘要/匯出/快照）', async () => {
      mockedGetRun.mockResolvedValue({
        runId: 'R001',
        ym: '202605',
        status: 'completed',
        triggeredBy: 'Director',
        triggeredAt: '2026-05-10T10:00:00.000Z',
        finishedAt: '2026-05-10T10:30:00.000Z',
      });
      renderPage();
      await waitFor(() =>
        expect(screen.getByTestId('completed-banner')).toBeInTheDocument(),
      );
      const banner = screen.getByTestId('completed-banner');
      expect(banner.textContent).toContain('結果摘要');
      expect(banner.textContent).toContain('快照詳情');
    });

    it('failed 狀態顯示失敗 banner + 2 跳轉連結', async () => {
      mockedGetRun.mockResolvedValue({
        runId: 'R001',
        ym: '202605',
        status: 'failed',
        triggeredBy: 'Director',
        triggeredAt: '2026-05-10T10:00:00.000Z',
        errorMessage: 'Stage 3 部門分配失敗：D03 容量飽和',
      });
      renderPage();
      await waitFor(() =>
        expect(screen.getByTestId('failed-banner')).toBeInTheDocument(),
      );
      const banner = screen.getByTestId('failed-banner');
      expect(banner.textContent).toContain('Stage 3');
      expect(banner.textContent).toContain('重新觸發');
    });

    it('pending 狀態顯示「排入佇列」banner', async () => {
      mockedGetRun.mockResolvedValue({
        runId: 'R001',
        ym: '202605',
        status: 'pending',
        triggeredBy: 'Director',
        triggeredAt: '2026-05-10T10:00:00.000Z',
      });
      renderPage();
      await waitFor(() =>
        expect(screen.getByTestId('pending-banner')).toBeInTheDocument(),
      );
    });

    it('「取消月跑」按鈕 click → 開 confirm modal', async () => {
      mockedGetRun.mockResolvedValue({
        runId: 'R001',
        ym: '202605',
        status: 'running',
        triggeredBy: 'Director',
        triggeredAt: '2026-05-10T10:00:00.000Z',
      });
      renderPage();
      await waitFor(() => {
        expect(screen.getByTestId('btn-cancel-run')).toBeInTheDocument();
      });
      const { fireEvent } = await import('@testing-library/react');
      fireEvent.click(screen.getByTestId('btn-cancel-run'));
      await waitFor(() => {
        expect(screen.getByTestId('confirm-cancel-modal')).toBeInTheDocument();
      });
    });
  });
});
