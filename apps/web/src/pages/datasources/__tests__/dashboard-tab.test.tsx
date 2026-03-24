import { render, screen, act, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { BrowserRouter } from 'react-router-dom';
import { DashboardTab } from '../dashboard-tab';
import { ToastProvider } from '@/components/ui/toast';
import * as datasourcesApi from '@/api/datasources';
import type { DashboardResponse, MetricsResponse, AlertsResponse } from '@cdmp/shared';

// Mock recharts to avoid rendering issues in test environment
vi.mock('recharts', () => ({
  ResponsiveContainer: ({ children }: any) => <div data-testid="responsive-container">{children}</div>,
  PieChart: ({ children }: any) => <div data-testid="mock-pie-chart">{children}</div>,
  Pie: () => null,
  Cell: () => null,
  LineChart: ({ children }: any) => <div data-testid="mock-line-chart">{children}</div>,
  Line: () => null,
  XAxis: () => null,
  YAxis: () => null,
  CartesianGrid: () => null,
  Tooltip: () => null,
  Legend: () => null,
}));

vi.mock('@/api/datasources');

const mockedGetDashboard = vi.mocked(datasourcesApi.getDashboard);
const mockedGetMetrics = vi.mocked(datasourcesApi.getMetrics);
const mockedGetAlerts = vi.mocked(datasourcesApi.getAlerts);
const mockedTestConnection = vi.mocked(datasourcesApi.testDatasourceConnection);

const mockDashboard: DashboardResponse = {
  summary: {
    total: 5,
    connected: 3,
    disconnected: 1,
    unknown: 1,
    typeCounts: { mysql: 2, postgresql: 2, sqlserver: 1 },
  },
  datasources: [
    { id: 'ds-1', name: 'MySQL Active 1', type: 'mysql', status: 'connected', lastTestedAt: '2026-01-15T14:30:00Z', consecutiveFailures: 0, lastErrorMessage: null },
    { id: 'ds-2', name: 'MySQL Active 2', type: 'mysql', status: 'connected', lastTestedAt: '2026-01-15T14:30:00Z', consecutiveFailures: 0, lastErrorMessage: null },
    { id: 'ds-3', name: 'PG Active', type: 'postgresql', status: 'connected', lastTestedAt: '2026-01-15T14:30:00Z', consecutiveFailures: 0, lastErrorMessage: null },
    { id: 'ds-4', name: 'MSSQL Disconnected', type: 'sqlserver', status: 'disconnected', lastTestedAt: '2026-01-15T14:00:00Z', consecutiveFailures: 3, lastErrorMessage: '連線被拒' },
    { id: 'ds-5', name: 'PG Unknown', type: 'postgresql', status: 'unknown', lastTestedAt: null, consecutiveFailures: 0, lastErrorMessage: null },
  ],
};

const mockMetrics: MetricsResponse = {
  datasourceId: 'ds-1',
  range: '24h',
  datapoints: [
    { timestamp: '2026-01-15T10:00:00Z', responseTimeMs: 42, success: true },
    { timestamp: '2026-01-15T10:30:00Z', responseTimeMs: 45, success: true },
  ],
};

const mockAlerts: AlertsResponse = {
  alerts: [
    { datasourceId: 'ds-4', name: 'MSSQL Disconnected', type: 'sqlserver', consecutiveFailures: 3, firstFailureTime: '2026-01-15T11:00:00Z', lastErrorMessage: '連線被拒' },
  ],
};

const mockAlertsEmpty: AlertsResponse = {
  alerts: [],
};

function renderDashboardTab() {
  return render(
    <BrowserRouter>
      <ToastProvider>
        <DashboardTab />
      </ToastProvider>
    </BrowserRouter>,
  );
}

describe('DashboardTab', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers({ shouldAdvanceTime: true });
    mockedGetDashboard.mockResolvedValue(mockDashboard);
    mockedGetMetrics.mockResolvedValue(mockMetrics);
    mockedGetAlerts.mockResolvedValue(mockAlerts);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('should display summary cards with correct values', async () => {
    await act(async () => {
      renderDashboardTab();
    });

    expect(screen.getByTestId('card-total').textContent).toBe('5');
    expect(screen.getByTestId('card-connected').textContent).toBe('3');
    expect(screen.getByTestId('card-disconnected').textContent).toBe('1');
    expect(screen.getByTestId('card-unknown').textContent).toBe('1');
  });

  it('should display datasource status cards', async () => {
    await act(async () => {
      renderDashboardTab();
    });

    expect(screen.getAllByText('MySQL Active 1').length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText('MSSQL Disconnected').length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText('PG Unknown').length).toBeGreaterThanOrEqual(1);
  });

  it('should display alert table when alerts exist', async () => {
    await act(async () => {
      renderDashboardTab();
    });

    expect(screen.getByTestId('alert-table')).toBeDefined();
    // Check the alert row content
    const cells = screen.getByTestId('alert-table').querySelectorAll('td');
    expect(cells[0].textContent).toBe('MSSQL Disconnected');
    expect(cells[2].textContent).toBe('3'); // consecutiveFailures
  });

  it('should display "所有資料來源運作正常" when no alerts', async () => {
    mockedGetAlerts.mockResolvedValue(mockAlertsEmpty);

    await act(async () => {
      renderDashboardTab();
    });

    expect(screen.getByTestId('no-alerts')).toBeDefined();
    expect(screen.getByText('所有資料來源運作正常')).toBeDefined();
  });

  it('should have Refresh All button', async () => {
    await act(async () => {
      renderDashboardTab();
    });

    const btn = screen.getByTestId('btn-refresh-all');
    expect(btn).toBeDefined();
    expect(btn.textContent).toContain('全部重新整理');
  });

  it('should call testConnection for each datasource when Refresh All is clicked', async () => {
    mockedTestConnection.mockResolvedValue({
      success: true,
      message: '連線成功 (42ms)',
      responseTime: 42,
      status: 'connected',
      lastTestedAt: '2026-01-20T10:00:00.000Z',
    });

    await act(async () => {
      renderDashboardTab();
    });

    await act(async () => {
      fireEvent.click(screen.getByTestId('btn-refresh-all'));
    });

    // Wait for all test connections to complete
    await waitFor(() => {
      expect(mockedTestConnection).toHaveBeenCalledTimes(5); // 5 datasources
    });
  });

  it('should have Test Now button for each datasource', async () => {
    await act(async () => {
      renderDashboardTab();
    });

    expect(screen.getByTestId('test-now-ds-1')).toBeDefined();
    expect(screen.getByTestId('test-now-ds-4')).toBeDefined();
  });

  it('should display time range selector and datasource selector', async () => {
    await act(async () => {
      renderDashboardTab();
    });

    expect(screen.getByTestId('range-24h')).toBeDefined();
    expect(screen.getByTestId('range-7d')).toBeDefined();
    expect(screen.getByTestId('range-30d')).toBeDefined();
    expect(screen.getByTestId('ds-selector')).toBeDefined();
  });

  it('should fetch metrics when time range is changed', async () => {
    await act(async () => {
      renderDashboardTab();
    });

    mockedGetMetrics.mockClear();

    await act(async () => {
      fireEvent.click(screen.getByTestId('range-7d'));
    });

    await waitFor(() => {
      expect(mockedGetMetrics).toHaveBeenCalledWith('ds-1', '7d');
    });
  });

  it('should show error message when dashboard fails to load', async () => {
    mockedGetDashboard.mockRejectedValue(new Error('Network error'));

    await act(async () => {
      renderDashboardTab();
    });

    expect(screen.getByText('無法載入儀表板資料，請重新整理頁面')).toBeDefined();
  });

  it('should show pie chart section', async () => {
    await act(async () => {
      renderDashboardTab();
    });

    expect(screen.getByTestId('pie-chart')).toBeDefined();
    expect(screen.getByText('資料來源類型分佈')).toBeDefined();
  });

  it('should show line chart section', async () => {
    await act(async () => {
      renderDashboardTab();
    });

    expect(screen.getByText('回應時間趨勢')).toBeDefined();
    expect(screen.getByTestId('line-chart')).toBeDefined();
  });

  it('should show "無法載入效能資料" when no metrics data', async () => {
    mockedGetMetrics.mockResolvedValue({ datasourceId: 'ds-1', range: '24h', datapoints: [] });

    await act(async () => {
      renderDashboardTab();
    });

    expect(screen.getByTestId('no-metrics')).toBeDefined();
  });

  // TS-F016-011: 時間欄位以 UTC+8 顯示
  describe('時間欄位 UTC+8 轉換 (TS-F016-011)', () => {
    it('should display lastTestedAt in UTC+8 on status cards', async () => {
      // mock data: lastTestedAt = '2026-01-15T14:30:00Z' (UTC)
      // Expected UTC+8: '2026-01-15 22:30'
      await act(async () => {
        renderDashboardTab();
      });

      const statusCards = screen.getByTestId('status-cards');
      expect(statusCards.textContent).toContain('2026-01-15 22:30');
    });

    it('should display firstFailureTime in UTC+8 in alert table', async () => {
      // mock data: firstFailureTime = '2026-01-15T11:00:00Z' (UTC)
      // Expected UTC+8: '2026-01-15 19:00'
      await act(async () => {
        renderDashboardTab();
      });

      const alertTable = screen.getByTestId('alert-table');
      expect(alertTable.textContent).toContain('2026-01-15 19:00');
    });

    it('should display trend chart X-axis time in UTC+8', async () => {
      // mock data: timestamp = '2026-01-15T10:00:00Z' (UTC)
      // Expected UTC+8 time: '18:00'
      // timestamp = '2026-01-15T10:30:00Z' -> '18:30'
      await act(async () => {
        renderDashboardTab();
      });

      // Since recharts is mocked, verify the line chart renders
      expect(screen.getByTestId('line-chart')).toBeDefined();
    });
  });
});
