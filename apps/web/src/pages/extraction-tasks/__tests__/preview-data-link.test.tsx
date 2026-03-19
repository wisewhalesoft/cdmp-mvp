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
const mockedGetDashboard = vi.mocked(extractionTasksApi.getExtractionDashboard);
const mockedGetTrend = vi.mocked(extractionTasksApi.getExtractionDashboardTrend);
const mockedGetUser = vi.mocked(authStore.getUser);
const mockedClearAuth = vi.mocked(authStore.clearAuth);

const mockResponse: ExtractionTaskListResponse = {
  data: [
    {
      id: 'et-completed-with-data',
      name: '已完成有資料',
      datasourceId: 'ds-1',
      datasourceName: 'MySQL 主資料庫',
      mode: 'full',
      status: 'completed',
      schedule: '0 2 * * *',
      lastExecutionAt: '2026-03-18T02:00:00.000Z',
      extractedCount: 3600,
      totalCount: 3600,
      progressPercent: 100,
      enabled: true,
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-03-18T02:00:00.000Z',
    },
    {
      id: 'et-failed',
      name: '失敗任務',
      datasourceId: 'ds-1',
      datasourceName: 'MySQL 主資料庫',
      mode: 'incremental',
      status: 'failed',
      schedule: '0 3 * * *',
      lastExecutionAt: '2026-03-18T03:00:00.000Z',
      extractedCount: 0,
      totalCount: 0,
      progressPercent: 0,
      enabled: true,
      createdAt: '2026-01-02T00:00:00.000Z',
      updatedAt: '2026-03-18T03:00:00.000Z',
    },
    {
      id: 'et-completed-no-data',
      name: '已完成無資料',
      datasourceId: 'ds-1',
      datasourceName: 'MySQL 主資料庫',
      mode: 'full',
      status: 'completed',
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
      id: 'et-running',
      name: '執行中任務',
      datasourceId: 'ds-1',
      datasourceName: 'MySQL 主資料庫',
      mode: 'full',
      status: 'running',
      schedule: '0 5 * * *',
      lastExecutionAt: null,
      extractedCount: 500,
      totalCount: 3600,
      progressPercent: 14,
      enabled: true,
      createdAt: '2026-01-04T00:00:00.000Z',
      updatedAt: '2026-03-18T05:00:00.000Z',
    },
  ],
  meta: { total: 4, page: 1, limit: 10, totalPages: 1 },
  summary: {
    totalTasks: 4,
    running: 1,
    todaySuccess: 2,
    todayFailed: 1,
    successRate: 66.7,
  },
};

function setupMocks() {
  mockedGetExtractionTasks.mockResolvedValue(mockResponse);
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

describe('F022: 日誌預覽資料連結', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    setupMocks();
  });

  afterEach(() => {
    vi.useRealTimers();
    cleanup();
    vi.restoreAllMocks();
  });

  it('should show preview link for completed task with extractedCount > 0', async () => {
    await renderAndLoad();

    const row = screen.getByText('已完成有資料').closest('tr')!;
    const link = row.querySelector('a[href="/extraction-tasks/et-completed-with-data/raw-data"]');
    expect(link).toBeInTheDocument();
    expect(link).toHaveTextContent('預覽資料');
  });

  it('should not show preview link for failed task', async () => {
    await renderAndLoad();

    const row = screen.getByText('失敗任務').closest('tr')!;
    const link = row.querySelector('a[href*="/raw-data"]');
    expect(link).not.toBeInTheDocument();
  });

  it('should not show preview link for completed task with extractedCount = 0', async () => {
    await renderAndLoad();

    const row = screen.getByText('已完成無資料').closest('tr')!;
    const link = row.querySelector('a[href*="/raw-data"]');
    expect(link).not.toBeInTheDocument();
  });

  it('should not show preview link for running task', async () => {
    await renderAndLoad();

    const row = screen.getByText('執行中任務').closest('tr')!;
    const link = row.querySelector('a[href*="/raw-data"]');
    expect(link).not.toBeInTheDocument();
  });

  it('should have correct href format for preview link', async () => {
    await renderAndLoad();

    const row = screen.getByText('已完成有資料').closest('tr')!;
    const link = row.querySelector('a[href="/extraction-tasks/et-completed-with-data/raw-data"]');
    expect(link).toBeInTheDocument();
  });
});
