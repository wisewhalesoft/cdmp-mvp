import { render, screen, act, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { BrowserRouter } from 'react-router-dom';
import { PipelineDashboardPage } from '../pipeline-dashboard-page';
import * as etlPipelinesApi from '@/api/etl-pipelines';
import * as authStore from '@/stores/auth-store';
import type {
  EtlDashboardStatsResponse,
  EtlDashboardTrendResponse,
  EtlDashboardRunningResponse,
  EtlDashboardFailuresResponse,
  EtlDashboardSlowestResponse,
} from '@cdmp/shared';

vi.mock('@/api/etl-pipelines');
vi.mock('@/api/auth', () => ({
  logout: vi.fn().mockResolvedValue({}),
}));
vi.mock('@/stores/auth-store');

const mockedGetDashboardStats = vi.mocked(etlPipelinesApi.getDashboardStats);
const mockedGetDashboardTrend = vi.mocked(etlPipelinesApi.getDashboardTrend);
const mockedGetDashboardRunning = vi.mocked(etlPipelinesApi.getDashboardRunning);
const mockedGetDashboardFailures = vi.mocked(etlPipelinesApi.getDashboardFailures);
const mockedGetDashboardSlowest = vi.mocked(etlPipelinesApi.getDashboardSlowest);
const mockedGetUser = vi.mocked(authStore.getUser);

const mockStats: EtlDashboardStatsResponse = {
  totalPipelines: 12,
  running: 2,
  todaySuccess: 8,
  todayFailed: 1,
  successRate: 88.9,
};

const mockTrend: EtlDashboardTrendResponse = {
  datapoints: [
    { date: '2026-03-18', success: 5, failed: 1 },
    { date: '2026-03-19', success: 6, failed: 0 },
    { date: '2026-03-20', success: 4, failed: 2 },
    { date: '2026-03-21', success: 7, failed: 0 },
    { date: '2026-03-22', success: 5, failed: 1 },
    { date: '2026-03-23', success: 8, failed: 0 },
    { date: '2026-03-24', success: 3, failed: 1 },
  ],
};

const mockRunning: EtlDashboardRunningResponse = {
  data: [
    {
      id: 'log-1',
      name: '客戶資料同步',
      processedCount: 500,
      totalCount: 1000,
      progressPercent: 50.0,
      startedAt: '2026-03-24T02:00:00.000Z',
      currentNodeName: 'NULL 處理',
    },
  ],
};

const mockFailures: EtlDashboardFailuresResponse = {
  data: [
    {
      pipelineId: 'pl-1',
      pipelineName: '交易資料匯入',
      failedAt: '2026-03-24T08:30:00.000Z',
      errorSummary: 'Load 節點寫入目標表失敗',
      logId: 'log-fail-1',
    },
  ],
};

const mockSlowest: EtlDashboardSlowestResponse = {
  data: [
    { pipelineId: 'pl-1', pipelineName: '慢 Pipeline A', avgDurationMs: 50000, executionCount: 15 },
    { pipelineId: 'pl-2', pipelineName: '慢 Pipeline B', avgDurationMs: 40000, executionCount: 10 },
    { pipelineId: 'pl-3', pipelineName: '慢 Pipeline C', avgDurationMs: 30000, executionCount: 8 },
  ],
};

const emptyStats: EtlDashboardStatsResponse = {
  totalPipelines: 0,
  running: 0,
  todaySuccess: 0,
  todayFailed: 0,
  successRate: 0.0,
};

const emptyTrend: EtlDashboardTrendResponse = { datapoints: [] };
const emptyRunning: EtlDashboardRunningResponse = { data: [] };
const emptyFailures: EtlDashboardFailuresResponse = { data: [] };
const emptySlowest: EtlDashboardSlowestResponse = { data: [] };

function renderDashboard() {
  return render(
    <BrowserRouter>
      <PipelineDashboardPage />
    </BrowserRouter>,
  );
}

describe('F035: Pipeline Dashboard Page', () => {
  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    mockedGetUser.mockReturnValue({ id: '1', name: 'Admin', email: 'admin@test.com', role: 'admin' });
    mockedGetDashboardStats.mockResolvedValue(mockStats);
    mockedGetDashboardTrend.mockResolvedValue(mockTrend);
    mockedGetDashboardRunning.mockResolvedValue(mockRunning);
    mockedGetDashboardFailures.mockResolvedValue(mockFailures);
    mockedGetDashboardSlowest.mockResolvedValue(mockSlowest);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('should render stats cards with correct values', async () => {
    await act(async () => {
      renderDashboard();
    });

    await waitFor(() => {
      expect(screen.getByTestId('stats-cards')).toBeInTheDocument();
    });

    const statsCards = screen.getByTestId('stats-cards');
    // Check that stats cards contain expected values
    expect(statsCards.textContent).toContain('12');
    expect(statsCards.textContent).toContain('88.9%');
    expect(statsCards.textContent).toContain('總 Pipeline 數');
    expect(statsCards.textContent).toContain('執行中');
    expect(statsCards.textContent).toContain('今日成功');
    expect(statsCards.textContent).toContain('今日失敗');
    expect(statsCards.textContent).toContain('成功率');
  });

  it('should render trend chart with bars', async () => {
    await act(async () => {
      renderDashboard();
    });

    await waitFor(() => {
      expect(screen.getByTestId('trend-bars')).toBeInTheDocument();
    });
  });

  it('should render running pipelines with progress', async () => {
    await act(async () => {
      renderDashboard();
    });

    await waitFor(() => {
      const runningSection = screen.getByTestId('running-section');
      expect(runningSection.textContent).toContain('客戶資料同步');
    });
    const runningSection = screen.getByTestId('running-section');
    expect(runningSection.textContent).toContain('50%');
    expect(runningSection.textContent).toContain('NULL 處理');
  });

  it('should render today failure list', async () => {
    await act(async () => {
      renderDashboard();
    });

    await waitFor(() => {
      expect(screen.getByText('交易資料匯入')).toBeInTheDocument();
    });
    expect(screen.getByText('Load 節點寫入目標表失敗')).toBeInTheDocument();
    expect(screen.getByTestId('view-log-log-fail-1')).toBeInTheDocument();
    expect(screen.getByTestId('re-execute-pl-1')).toBeInTheDocument();
  });

  it('should render slowest top 5 table', async () => {
    await act(async () => {
      renderDashboard();
    });

    await waitFor(() => {
      expect(screen.getByText('慢 Pipeline A')).toBeInTheDocument();
    });
    expect(screen.getByText('慢 Pipeline B')).toBeInTheDocument();
    expect(screen.getByText('慢 Pipeline C')).toBeInTheDocument();
  });

  // TS-F035-021: Polling 5 seconds update
  it('should poll running items every 5 seconds', async () => {
    const firstResponse: EtlDashboardRunningResponse = {
      data: [{
        id: 'log-1',
        name: '客戶資料同步',
        processedCount: 200,
        totalCount: 1000,
        progressPercent: 20.0,
        startedAt: '2026-03-24T02:00:00.000Z',
        currentNodeName: 'Extract',
      }],
    };
    const secondResponse: EtlDashboardRunningResponse = {
      data: [{
        id: 'log-1',
        name: '客戶資料同步',
        processedCount: 600,
        totalCount: 1000,
        progressPercent: 60.0,
        startedAt: '2026-03-24T02:00:00.000Z',
        currentNodeName: 'Transform',
      }],
    };

    mockedGetDashboardRunning
      .mockResolvedValueOnce(firstResponse)  // initial load (from loadDashboardData Promise.all)
      .mockResolvedValueOnce(secondResponse); // after 5s poll

    await act(async () => {
      renderDashboard();
    });

    // Wait for initial render with 20%
    await waitFor(() => {
      const runningSection = screen.getByTestId('running-section');
      expect(runningSection.textContent).toContain('20%');
    });

    // Advance 5 seconds
    await act(async () => {
      vi.advanceTimersByTime(5000);
    });

    // Should now show 60%
    await waitFor(() => {
      const runningSection = screen.getByTestId('running-section');
      expect(runningSection.textContent).toContain('60%');
    });
  });

  // Empty state tests
  it('should show empty states when no data', async () => {
    mockedGetDashboardStats.mockResolvedValue(emptyStats);
    mockedGetDashboardTrend.mockResolvedValue(emptyTrend);
    mockedGetDashboardRunning.mockResolvedValue(emptyRunning);
    mockedGetDashboardFailures.mockResolvedValue(emptyFailures);
    mockedGetDashboardSlowest.mockResolvedValue(emptySlowest);

    await act(async () => {
      renderDashboard();
    });

    await waitFor(() => {
      expect(screen.getByTestId('trend-empty')).toBeInTheDocument();
    });
    // "尚無執行紀錄" appears in both trend and slowest empty states
    expect(screen.getAllByText('尚無執行紀錄').length).toBeGreaterThanOrEqual(2);
    expect(screen.getByTestId('running-empty')).toBeInTheDocument();
    expect(screen.getByText('目前無執行中的 Pipeline')).toBeInTheDocument();
    expect(screen.getByTestId('failures-empty')).toBeInTheDocument();
    expect(screen.getByText('今日無失敗紀錄')).toBeInTheDocument();
    expect(screen.getByTestId('slowest-empty')).toBeInTheDocument();
  });

  it('should render tab navigation with dashboard active', async () => {
    await act(async () => {
      renderDashboard();
    });

    await waitFor(() => {
      expect(screen.getByTestId('tab-dashboard')).toBeInTheDocument();
    });
    expect(screen.getByTestId('tab-list')).toBeInTheDocument();
    // Dashboard tab should have active styling
    expect(screen.getByTestId('tab-dashboard').className).toContain('border-primary');
  });
});
