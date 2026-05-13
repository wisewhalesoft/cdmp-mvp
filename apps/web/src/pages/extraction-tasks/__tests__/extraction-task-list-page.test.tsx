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
      id: 'et-1',
      name: '每日客戶同步',
      datasourceId: 'ds-1',
      datasourceName: 'MySQL 主資料庫',
      mode: 'full',
      status: 'running',
      schedule: '0 2 * * *',
      lastExecutionAt: '2026-03-18T02:00:00.000Z',
      extractedCount: 2340,
      totalCount: 3600,
      progressPercent: 65,
      enabled: true,
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-03-18T02:00:00.000Z',
    },
    {
      id: 'et-2',
      name: '商品資料更新',
      datasourceId: 'ds-2',
      datasourceName: 'PostgreSQL 分析庫',
      mode: 'incremental',
      status: 'completed',
      schedule: '0 3 * * *',
      lastExecutionAt: '2026-03-18T03:00:00.000Z',
      extractedCount: 1500,
      totalCount: 1500,
      progressPercent: 100,
      enabled: true,
      createdAt: '2026-01-02T00:00:00.000Z',
      updatedAt: '2026-03-18T03:00:00.000Z',
    },
    {
      id: 'et-3',
      name: '發票資料擷取',
      datasourceId: 'ds-3',
      datasourceName: 'SQL Server 財務庫',
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
  ],
  meta: { total: 3, page: 1, limit: 10, totalPages: 1 },
  summary: {
    totalTasks: 12,
    running: 2,
    todaySuccess: 8,
    todayFailed: 1,
    successRate: 88.9,
  },
};

const emptyResponse: ExtractionTaskListResponse = {
  data: [],
  meta: { total: 0, page: 1, limit: 10, totalPages: 0 },
  summary: {
    totalTasks: 0,
    running: 0,
    todaySuccess: 0,
    todayFailed: 0,
    successRate: 0,
  },
};

function setupMocks(response: ExtractionTaskListResponse = mockResponse) {
  mockedGetExtractionTasks.mockResolvedValue(response);
  mockedGetDatasourceOptions.mockResolvedValue([
    { id: 'ds-1', name: 'MySQL 主資料庫', type: 'mysql' },
    { id: 'ds-2', name: 'PostgreSQL 分析庫', type: 'postgresql' },
  ]);
  mockedGetDashboard.mockResolvedValue({
    summary: { totalTasks: 0, running: 0, todaySuccess: 0, todayFailed: 0, successRate: 0 },
    runningTasks: [],
    todayFailures: [],
    slowestTasks: [],
  });
  mockedGetTrend.mockResolvedValue({ datapoints: [] });
  mockedGetUser.mockReturnValue({
    id: '1',
    name: 'Admin User',
    email: 'admin@cdmp.test',
    role: 'admin',
  });
  mockedClearAuth.mockImplementation(() => {});
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

  // Advance timers for debounce
  await act(async () => {
    vi.advanceTimersByTime(350);
  });
  await act(async () => {
    vi.advanceTimersByTime(1000);
  });
}

describe('ExtractionTaskListPage', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    setupMocks();
  });

  afterEach(() => {
    vi.useRealTimers();
    cleanup();
    vi.restoreAllMocks();
  });

  describe('渲染測試', () => {
    it('should render page title', async () => {
      await renderAndLoad();
      expect(screen.getByText('資料擷取管理')).toBeInTheDocument();
    });

    it('should render task list', async () => {
      await renderAndLoad();
      expect(screen.getByText('每日客戶同步')).toBeInTheDocument();
      expect(screen.getByText('商品資料更新')).toBeInTheDocument();
      expect(screen.getByText('發票資料擷取')).toBeInTheDocument();
    });

    it('should render summary cards with correct values', async () => {
      await renderAndLoad();
      expect(screen.getByTestId('summary-total')).toHaveTextContent('12');
      expect(screen.getByTestId('summary-running')).toHaveTextContent('2');
      expect(screen.getByTestId('summary-success')).toHaveTextContent('8');
      expect(screen.getByTestId('summary-failed')).toHaveTextContent('1');
      expect(screen.getByTestId('summary-rate')).toHaveTextContent('88.9%');
    });

    it('should render table headers', async () => {
      await renderAndLoad();
      expect(screen.getByText('名稱')).toBeInTheDocument();
      // '資料來源' appears in both sidebar and table header
      expect(screen.getAllByText('資料來源').length).toBeGreaterThanOrEqual(1);
      expect(screen.getByText('模式')).toBeInTheDocument();
      expect(screen.getByText('狀態')).toBeInTheDocument();
      expect(screen.getByText('排程')).toBeInTheDocument();
      expect(screen.getByText('上次執行')).toBeInTheDocument();
      expect(screen.getByText('擷取筆數')).toBeInTheDocument();
      expect(screen.getByText('操作')).toBeInTheDocument();
    });

    it('should render mode badges', async () => {
      await renderAndLoad();
      expect(screen.getAllByText('全量').length).toBeGreaterThanOrEqual(1);
      expect(screen.getAllByText('增量').length).toBeGreaterThanOrEqual(1);
    });

    it('should render status badges', async () => {
      await renderAndLoad();
      expect(screen.getAllByText('running').length).toBeGreaterThanOrEqual(1);
      expect(screen.getAllByText('completed').length).toBeGreaterThanOrEqual(1);
      expect(screen.getAllByText('failed').length).toBeGreaterThanOrEqual(1);
    });

    it('should render pagination info', async () => {
      await renderAndLoad();
      expect(screen.getByText(/共 3 筆/)).toBeInTheDocument();
    });
  });

  describe('篩選功能', () => {
    it('should have search input', async () => {
      await renderAndLoad();
      expect(screen.getByPlaceholderText('搜尋任務名稱...')).toBeInTheDocument();
    });

    it('should call API with search parameter after debounce', async () => {
      await renderAndLoad();
      mockedGetExtractionTasks.mockClear();

      const input = screen.getByPlaceholderText('搜尋任務名稱...');
      await act(async () => {
        fireEvent.change(input, { target: { value: '客戶' } });
      });
      await act(async () => {
        vi.advanceTimersByTime(350);
      });
      await act(async () => {
        vi.advanceTimersByTime(1000);
      });

      expect(mockedGetExtractionTasks).toHaveBeenCalledWith(
        expect.objectContaining({ search: '客戶', page: 1 }),
      );
    });

    it('should have status filter', async () => {
      await renderAndLoad();
      expect(screen.getByText('全部狀態')).toBeInTheDocument();
    });

    it('should have mode filter', async () => {
      await renderAndLoad();
      expect(screen.getByText('全部模式')).toBeInTheDocument();
    });
  });

  describe('空狀態', () => {
    it('should show empty state when no tasks', async () => {
      setupMocks(emptyResponse);
      await renderAndLoad();
      expect(screen.getByText('尚未建立任何擷取任務')).toBeInTheDocument();
    });

    it('should show create button in empty state', async () => {
      setupMocks(emptyResponse);
      await renderAndLoad();
      expect(screen.getByText('建立第一個擷取任務')).toBeInTheDocument();
    });
  });

  // Sidebar active state 已由共用 AppSidebar 元件負責，於其自身 unit test 覆蓋。
});
