import { render, screen, cleanup, act, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { BrowserRouter } from 'react-router-dom';
import { ExtractionTaskListPage } from '../extraction-task-list-page';
import { ToastProvider } from '@/components/ui/toast';
import * as extractionTasksApi from '@/api/extraction-tasks';
import * as authStore from '@/stores/auth-store';
import type { ExtractionTaskListResponse } from '@cdmp/shared';

vi.mock('@/api/extraction-tasks');
vi.mock('@/api/auth', () => ({
  logout: vi.fn().mockResolvedValue({}),
}));
vi.mock('@/stores/auth-store');

const mockedGetExtractionTasks = vi.mocked(extractionTasksApi.getExtractionTasks);
const mockedGetDatasourceOptions = vi.mocked(extractionTasksApi.getDatasourceOptions);
const mockedRunExtractionTask = vi.mocked(extractionTasksApi.runExtractionTask);
const mockedGetDashboard = vi.mocked(extractionTasksApi.getExtractionDashboard);
const mockedGetTrend = vi.mocked(extractionTasksApi.getExtractionDashboardTrend);
const mockedGetUser = vi.mocked(authStore.getUser);
const mockedClearAuth = vi.mocked(authStore.clearAuth);

const mockRunResponse: ExtractionTaskListResponse = {
  data: [
    {
      id: 'et-scheduled',
      name: '排程任務',
      datasourceId: 'ds-1',
      datasourceName: 'MySQL 主資料庫',
      mode: 'full',
      status: 'scheduled',
      schedule: '0 2 * * *',
      lastExecutionAt: null,
      extractedCount: 0,
      totalCount: 0,
      progressPercent: 0,
      enabled: true,
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-03-18T02:00:00.000Z',
    },
    {
      id: 'et-running',
      name: '執行中任務',
      datasourceId: 'ds-1',
      datasourceName: 'MySQL 主資料庫',
      mode: 'full',
      status: 'running',
      schedule: '0 3 * * *',
      lastExecutionAt: null,
      extractedCount: 2340,
      totalCount: 3600,
      progressPercent: 65,
      enabled: true,
      createdAt: '2026-01-02T00:00:00.000Z',
      updatedAt: '2026-03-18T03:00:00.000Z',
    },
    {
      id: 'et-failed',
      name: '失敗任務',
      datasourceId: 'ds-1',
      datasourceName: 'MySQL 主資料庫',
      mode: 'incremental',
      status: 'failed',
      schedule: '0 4 * * *',
      lastExecutionAt: '2026-03-18T04:00:00.000Z',
      extractedCount: 0,
      totalCount: 0,
      progressPercent: 0,
      enabled: true,
      createdAt: '2026-01-03T00:00:00.000Z',
      updatedAt: '2026-03-18T04:00:00.000Z',
    },
    {
      id: 'et-completed',
      name: '完成任務',
      datasourceId: 'ds-1',
      datasourceName: 'MySQL 主資料庫',
      mode: 'full',
      status: 'completed',
      schedule: '0 5 * * *',
      lastExecutionAt: '2026-03-18T05:00:00.000Z',
      extractedCount: 1000,
      totalCount: 1000,
      progressPercent: 100,
      enabled: true,
      createdAt: '2026-01-04T00:00:00.000Z',
      updatedAt: '2026-03-18T05:00:00.000Z',
    },
  ],
  meta: { total: 4, page: 1, limit: 10, totalPages: 1 },
  summary: {
    totalTasks: 4,
    running: 1,
    todaySuccess: 1,
    todayFailed: 1,
    successRate: 50,
  },
};

function setupMocks(response: ExtractionTaskListResponse = mockRunResponse) {
  mockedGetExtractionTasks.mockResolvedValue(response);
  mockedGetDatasourceOptions.mockResolvedValue([
    { id: 'ds-1', name: 'MySQL 主資料庫', type: 'mysql' },
  ]);
  mockedGetUser.mockReturnValue({
    id: '1',
    name: 'Admin User',
    email: 'admin@cdmp.test',
    role: 'admin',
  });
  mockedClearAuth.mockImplementation(() => {});
  mockedRunExtractionTask.mockResolvedValue({ logId: 'log-1' });
  mockedGetDashboard.mockResolvedValue({
    summary: { totalTasks: 0, running: 0, todaySuccess: 0, todayFailed: 0, successRate: 0 },
    runningTasks: [],
    todayFailures: [],
    slowestTasks: [],
  });
  mockedGetTrend.mockResolvedValue({ datapoints: [] });
}

async function renderAndLoad() {
  await act(async () => {
    render(
      <BrowserRouter>
        <ToastProvider>
          <ExtractionTaskListPage />
        </ToastProvider>
      </BrowserRouter>,
    );
  });
  // Default tab is now 'dashboard' (BR-5), switch to 'list' for list tests
  await act(async () => {
    fireEvent.click(screen.getByTestId('tab-list'));
  });
  await act(async () => {
    vi.advanceTimersByTime(350);
  });
  await act(async () => {
    vi.advanceTimersByTime(1000);
  });
}

describe('F021: 立即執行／重新執行擷取任務', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    setupMocks();
  });

  afterEach(() => {
    vi.useRealTimers();
    cleanup();
    vi.restoreAllMocks();
  });

  describe('立即執行按鈕', () => {
    it('should call runExtractionTask with triggeredBy=manual when clicking play on scheduled task', async () => {
      await renderAndLoad();

      // The scheduled task's play button has title "立即執行"
      const runButtons = screen.getAllByTitle('立即執行');
      // There are multiple "立即執行" buttons (scheduled, completed)
      await act(async () => {
        fireEvent.click(runButtons[0]); // First is the scheduled task
      });

      expect(mockedRunExtractionTask).toHaveBeenCalledWith('et-scheduled', 'manual');
    });

    it('should call runExtractionTask with triggeredBy=retry when clicking play on failed task', async () => {
      await renderAndLoad();

      const retryButton = screen.getByTitle('重新執行');
      await act(async () => {
        fireEvent.click(retryButton);
      });

      expect(mockedRunExtractionTask).toHaveBeenCalledWith('et-failed', 'retry');
    });

    it('should disable run button for running tasks', async () => {
      await renderAndLoad();

      // The running task row - find its play button
      const row = screen.getByText('執行中任務').closest('tr')!;
      const playButton = row.querySelector('button[title="立即執行"]') as HTMLButtonElement;
      expect(playButton).toBeDisabled();
    });

    it('should show title "重新執行" for failed task run button', async () => {
      await renderAndLoad();

      const retryButton = screen.getByTitle('重新執行');
      expect(retryButton).toBeInTheDocument();
    });
  });

  describe('執行成功回應', () => {
    it('should show success toast and refresh after run', async () => {
      await renderAndLoad();
      mockedGetExtractionTasks.mockClear();

      const runButtons = screen.getAllByTitle('立即執行');
      await act(async () => {
        fireEvent.click(runButtons[0]);
      });

      // Wait for async
      await act(async () => {
        vi.advanceTimersByTime(100);
      });

      expect(screen.getByText('擷取任務已開始執行')).toBeInTheDocument();
      // fetchTasks should be called to refresh
      expect(mockedGetExtractionTasks).toHaveBeenCalled();
    });
  });

  describe('執行失敗回應（409）', () => {
    it('should show error toast when task is already running (409)', async () => {
      mockedRunExtractionTask.mockRejectedValueOnce({
        response: { status: 409, data: { error: 'EXTRACTION_RUNNING' } },
      });

      await renderAndLoad();

      const runButtons = screen.getAllByTitle('立即執行');
      await act(async () => {
        fireEvent.click(runButtons[0]);
      });

      await act(async () => {
        vi.advanceTimersByTime(100);
      });

      expect(screen.getByText('任務正在執行中，請等待完成')).toBeInTheDocument();
    });
  });

  describe('進度條', () => {
    it('should show progress bar for running task', async () => {
      await renderAndLoad();

      const progressBar = screen.getByTestId('progress-bar-et-running');
      expect(progressBar).toBeInTheDocument();
      expect(progressBar).toHaveTextContent('2340/3600 (65%)');
    });

    it('should not show progress bar for non-running tasks', async () => {
      await renderAndLoad();

      expect(screen.queryByTestId('progress-bar-et-scheduled')).not.toBeInTheDocument();
      expect(screen.queryByTestId('progress-bar-et-failed')).not.toBeInTheDocument();
      expect(screen.queryByTestId('progress-bar-et-completed')).not.toBeInTheDocument();
    });

    it('should render progress bar with blue color #3B82F6', async () => {
      await renderAndLoad();

      const progressBar = screen.getByTestId('progress-bar-et-running');
      // The inner fill div has inline style with backgroundColor
      const outerBar = progressBar.firstElementChild as HTMLElement;
      const fill = outerBar.firstElementChild as HTMLElement;
      expect(fill.getAttribute('style')).toContain('background-color: rgb(59, 130, 246)');
    });
  });

  describe('Polling 機制', () => {
    it('should poll every 3 seconds when a task is running', async () => {
      await renderAndLoad();
      mockedGetExtractionTasks.mockClear();

      // Advance 3 seconds for polling
      await act(async () => {
        vi.advanceTimersByTime(3000);
      });

      expect(mockedGetExtractionTasks).toHaveBeenCalledTimes(1);

      // Another 3 seconds
      await act(async () => {
        vi.advanceTimersByTime(3000);
      });

      expect(mockedGetExtractionTasks).toHaveBeenCalledTimes(2);
    });

    it('should stop polling when no tasks are running', async () => {
      const noRunningResponse: ExtractionTaskListResponse = {
        data: [
          {
            id: 'et-completed',
            name: '完成任務',
            datasourceId: 'ds-1',
            datasourceName: 'MySQL 主資料庫',
            mode: 'full',
            status: 'completed',
            schedule: '0 5 * * *',
            lastExecutionAt: '2026-03-18T05:00:00.000Z',
            extractedCount: 1000,
            totalCount: 1000,
            progressPercent: 100,
            enabled: true,
            createdAt: '2026-01-04T00:00:00.000Z',
            updatedAt: '2026-03-18T05:00:00.000Z',
          },
        ],
        meta: { total: 1, page: 1, limit: 10, totalPages: 1 },
        summary: {
          totalTasks: 1,
          running: 0,
          todaySuccess: 1,
          todayFailed: 0,
          successRate: 100,
        },
      };

      setupMocks(noRunningResponse);
      await renderAndLoad();
      mockedGetExtractionTasks.mockClear();

      // Advance 6 seconds - no polling should happen
      await act(async () => {
        vi.advanceTimersByTime(6000);
      });

      expect(mockedGetExtractionTasks).not.toHaveBeenCalled();
    });

    it('should clean up polling interval on unmount', async () => {
      const { unmount } = await act(async () => {
        return render(
          <BrowserRouter>
            <ToastProvider>
              <ExtractionTaskListPage />
            </ToastProvider>
          </BrowserRouter>,
        );
      });
      // Default tab is now 'dashboard' (BR-5), switch to 'list' for list tests
      await act(async () => {
        fireEvent.click(screen.getByTestId('tab-list'));
      });
      await act(async () => {
        vi.advanceTimersByTime(350);
      });
      await act(async () => {
        vi.advanceTimersByTime(1000);
      });

      // Unmount should not throw
      unmount();

      // Advancing timers after unmount should not cause errors
      await act(async () => {
        vi.advanceTimersByTime(6000);
      });
    });
  });
});

describe('F021: API 層測試', () => {
  it('runExtractionTask should be exported from extraction-tasks API', () => {
    expect(typeof extractionTasksApi.runExtractionTask).toBe('function');
  });
});
