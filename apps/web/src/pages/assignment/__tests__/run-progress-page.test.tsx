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
      expect(screen.getByTestId('run-status-completed')).toBeInTheDocument(),
    );
    expect(screen.getByRole('button', { name: /查看結果摘要/ })).toBeInTheDocument();
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
      expect(screen.getByTestId('run-status-failed')).toBeInTheDocument(),
    );
    expect(screen.getByText(/Stage 2 評分失敗/)).toBeInTheDocument();
  });
});
