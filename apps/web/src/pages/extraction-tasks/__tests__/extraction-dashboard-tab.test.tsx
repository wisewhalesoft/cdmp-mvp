import { render, screen, cleanup, act, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { BrowserRouter } from 'react-router-dom';
import { ExtractionDashboardTab } from '../extraction-dashboard-tab';
import { ToastProvider } from '@/components/ui/toast';
import * as extractionTasksApi from '@/api/extraction-tasks';
import type { ExtractionDashboardResponse, ExtractionDashboardTrendResponse } from '@cdmp/shared';

vi.mock('@/api/extraction-tasks');

const mockedGetDashboard = vi.mocked(extractionTasksApi.getExtractionDashboard);
const mockedGetTrend = vi.mocked(extractionTasksApi.getExtractionDashboardTrend);
const mockedRunTask = vi.mocked(extractionTasksApi.runExtractionTask);

const mockDashboard: ExtractionDashboardResponse = {
  summary: {
    totalTasks: 12,
    running: 2,
    todaySuccess: 8,
    todayFailed: 1,
    successRate: 88.9,
  },
  runningTasks: [
    {
      id: 'rt-1',
      name: '每日客戶同步',
      datasourceName: 'MySQL 主資料庫',
      extractedCount: 2340,
      totalCount: 3600,
      progressPercent: 65,
    },
  ],
  todayFailures: [
    {
      taskId: 'ft-1',
      taskName: '發票資料擷取',
      failedAt: '2026-03-18T14:23:15.000Z',
      errorSummary: '連線逾時：無法連至資料來源',
      logId: 'log-1',
    },
  ],
  slowestTasks: [
    { taskId: 'st-1', taskName: '訂單歷史匯入', avgDurationMs: 165000, executionCount: 156 },
    { taskId: 'st-2', taskName: '每日客戶同步', avgDurationMs: 150000, executionCount: 203 },
    { taskId: 'st-3', taskName: '庫存盤點匯入', avgDurationMs: 110000, executionCount: 98 },
  ],
};

const mockTrend: ExtractionDashboardTrendResponse = {
  datapoints: [
    { date: '2026-03-12', success: 8, failed: 0 },
    { date: '2026-03-13', success: 7, failed: 1 },
    { date: '2026-03-14', success: 9, failed: 0 },
    { date: '2026-03-15', success: 6, failed: 2 },
    { date: '2026-03-16', success: 8, failed: 1 },
    { date: '2026-03-17', success: 10, failed: 0 },
    { date: '2026-03-18', success: 8, failed: 1 },
  ],
};

const emptyDashboard: ExtractionDashboardResponse = {
  summary: {
    totalTasks: 0,
    running: 0,
    todaySuccess: 0,
    todayFailed: 0,
    successRate: 0,
  },
  runningTasks: [],
  todayFailures: [],
  slowestTasks: [],
};

function renderComponent() {
  return render(
    <BrowserRouter>
      <ToastProvider>
        <ExtractionDashboardTab />
      </ToastProvider>
    </BrowserRouter>,
  );
}

describe('ExtractionDashboardTab', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    mockedGetDashboard.mockResolvedValue(mockDashboard);
    mockedGetTrend.mockResolvedValue(mockTrend);
    mockedRunTask.mockResolvedValue({ logId: 'new-log-1' });
  });

  afterEach(() => {
    vi.useRealTimers();
    cleanup();
    vi.restoreAllMocks();
  });

  it('should display summary cards with correct values', async () => {
    await act(async () => {
      renderComponent();
    });

    expect(screen.getByTestId('dash-total')).toHaveTextContent('12');
    expect(screen.getByTestId('dash-running')).toHaveTextContent('2');
    expect(screen.getByTestId('dash-success')).toHaveTextContent('8');
    expect(screen.getByTestId('dash-failed')).toHaveTextContent('1');
    expect(screen.getByTestId('dash-rate')).toHaveTextContent('88.9%');
  });

  it('should display running tasks with progress', async () => {
    await act(async () => {
      renderComponent();
    });

    const runningSection = screen.getByTestId('running-tasks');
    expect(runningSection).toBeInTheDocument();
    expect(runningSection).toHaveTextContent('每日客戶同步');
    expect(runningSection).toHaveTextContent('65%');
    expect(runningSection).toHaveTextContent('2,340');
  });

  it('should display today failure list', async () => {
    await act(async () => {
      renderComponent();
    });

    expect(screen.getByTestId('failures-list')).toBeInTheDocument();
    expect(screen.getByText('發票資料擷取')).toBeInTheDocument();
    expect(screen.getByText('連線逾時：無法連至資料來源')).toBeInTheDocument();
    expect(screen.getByText('查看日誌')).toBeInTheDocument();
    expect(screen.getByText('重新執行')).toBeInTheDocument();
  });

  it('should display slowest tasks top 5', async () => {
    await act(async () => {
      renderComponent();
    });

    expect(screen.getByTestId('slowest-table')).toBeInTheDocument();
    expect(screen.getByText('訂單歷史匯入')).toBeInTheDocument();
    expect(screen.getByText('156')).toBeInTheDocument();
  });

  it('should display trend chart with range buttons', async () => {
    await act(async () => {
      renderComponent();
    });

    expect(screen.getByTestId('trend-chart')).toBeInTheDocument();
    expect(screen.getByTestId('trend-range-7d')).toBeInTheDocument();
    expect(screen.getByTestId('trend-range-14d')).toBeInTheDocument();
    expect(screen.getByTestId('trend-range-30d')).toBeInTheDocument();
  });

  it('should switch trend range on button click', async () => {
    await act(async () => {
      renderComponent();
    });

    await act(async () => {
      fireEvent.click(screen.getByTestId('trend-range-14d'));
    });

    expect(mockedGetTrend).toHaveBeenCalledWith('14d');
  });

  it('should display empty state when no data', async () => {
    mockedGetDashboard.mockResolvedValue(emptyDashboard);
    mockedGetTrend.mockResolvedValue({ datapoints: [] });

    await act(async () => {
      renderComponent();
    });

    expect(screen.getByTestId('dash-total')).toHaveTextContent('0');
    expect(screen.getByTestId('running-empty')).toBeInTheDocument();
    expect(screen.getByTestId('failures-empty')).toBeInTheDocument();
    expect(screen.getByTestId('slowest-empty')).toBeInTheDocument();
  });

  it('should poll every 5 seconds when running tasks exist', async () => {
    await act(async () => {
      renderComponent();
    });

    // First call on mount
    expect(mockedGetDashboard).toHaveBeenCalledTimes(1);

    // Advance 5 seconds → should trigger poll
    await act(async () => {
      vi.advanceTimersByTime(5000);
    });

    expect(mockedGetDashboard).toHaveBeenCalledTimes(2);
  });
});
