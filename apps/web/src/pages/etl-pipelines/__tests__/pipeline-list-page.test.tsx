import { render, screen, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { BrowserRouter } from 'react-router-dom';
import { PipelineListPage } from '../pipeline-list-page';
import * as etlPipelinesApi from '@/api/etl-pipelines';
import * as authStore from '@/stores/auth-store';
import type { PipelineListResponse, PipelineStatsResponse } from '@cdmp/shared';

vi.mock('@/api/etl-pipelines');
vi.mock('@/api/auth', () => ({
  logout: vi.fn().mockResolvedValue({}),
}));
vi.mock('@/stores/auth-store');

const mockedGetPipelines = vi.mocked(etlPipelinesApi.getPipelines);
const mockedGetPipelineStats = vi.mocked(etlPipelinesApi.getPipelineStats);
const mockedGetUser = vi.mocked(authStore.getUser);

const mockStats: PipelineStatsResponse = {
  total: 8,
  active: 3,
  running: 1,
  draft: 2,
  todayProcessed: 1500,
};

const mockListResponse: PipelineListResponse = {
  data: [
    {
      id: 'pl-1',
      name: '每日客戶同步 Pipeline',
      version: 2,
      stepCount: 5,
      status: 'active',
      schedule: '0 2 * * *',
      lastExecutionAt: '2026-03-18T02:00:00.000Z',
      nextExecutionAt: '2026-03-19T02:00:00.000Z',
      processedCount: 12000,
      createdBy: 'Admin User',
      createdAt: '2026-01-01T00:00:00.000Z',
    },
    {
      id: 'pl-2',
      name: 'ETL Daily Pipeline',
      version: 1,
      stepCount: 3,
      status: 'draft',
      schedule: null,
      lastExecutionAt: null,
      nextExecutionAt: null,
      processedCount: 0,
      createdBy: 'Admin User',
      createdAt: '2026-02-01T00:00:00.000Z',
    },
    {
      id: 'pl-3',
      name: '庫存同步 Pipeline',
      version: 1,
      stepCount: 2,
      status: 'running',
      schedule: '0 3 * * *',
      lastExecutionAt: '2026-03-18T03:00:00.000Z',
      nextExecutionAt: '2026-03-19T03:00:00.000Z',
      processedCount: 500,
      createdBy: 'Admin User',
      createdAt: '2026-03-01T00:00:00.000Z',
    },
  ],
  pagination: {
    page: 1,
    pageSize: 10,
    total: 3,
    totalPages: 1,
  },
};

const emptyResponse: PipelineListResponse = {
  data: [],
  pagination: { page: 1, pageSize: 10, total: 0, totalPages: 0 },
};

const emptyStats: PipelineStatsResponse = {
  total: 0,
  active: 0,
  running: 0,
  draft: 0,
  todayProcessed: 0,
};

function renderPage() {
  return render(
    <BrowserRouter>
      <PipelineListPage />
    </BrowserRouter>,
  );
}

describe('PipelineListPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockedGetUser.mockReturnValue({
      id: 'admin-1',
      name: 'Admin User',
      email: 'admin@test.com',
      role: 'admin',
    });
  });

  it('should render stats cards with correct values', async () => {
    mockedGetPipelines.mockResolvedValue(mockListResponse);
    mockedGetPipelineStats.mockResolvedValue(mockStats);

    await act(async () => {
      renderPage();
    });

    expect(screen.getByTestId('stat-total').textContent).toBe('8');
    expect(screen.getByTestId('stat-active').textContent).toBe('3');
    expect(screen.getByTestId('stat-running').textContent).toBe('1');
    expect(screen.getByTestId('stat-draft').textContent).toBe('2');
    expect(screen.getByTestId('stat-today-processed').textContent).toBe('1,500');
  });

  it('should render pipeline table with all rows', async () => {
    mockedGetPipelines.mockResolvedValue(mockListResponse);
    mockedGetPipelineStats.mockResolvedValue(mockStats);

    await act(async () => {
      renderPage();
    });

    expect(screen.getByTestId('pipeline-table')).toBeDefined();
    expect(screen.getByText('每日客戶同步 Pipeline')).toBeDefined();
    expect(screen.getByText('ETL Daily Pipeline')).toBeDefined();
    expect(screen.getByText('庫存同步 Pipeline')).toBeDefined();
  });

  it('should show empty state when no pipelines', async () => {
    mockedGetPipelines.mockResolvedValue(emptyResponse);
    mockedGetPipelineStats.mockResolvedValue(emptyStats);

    await act(async () => {
      renderPage();
    });

    expect(screen.getByTestId('empty-state')).toBeDefined();
    expect(screen.getByText('尚無 Pipeline 資料')).toBeDefined();
  });

  it('should display pagination info', async () => {
    mockedGetPipelines.mockResolvedValue(mockListResponse);
    mockedGetPipelineStats.mockResolvedValue(mockStats);

    await act(async () => {
      renderPage();
    });

    expect(screen.getByTestId('pagination-info').textContent).toContain('3');
  });

  it('should have search input and status filter', async () => {
    mockedGetPipelines.mockResolvedValue(mockListResponse);
    mockedGetPipelineStats.mockResolvedValue(mockStats);

    await act(async () => {
      renderPage();
    });

    expect(screen.getByTestId('search-input')).toBeDefined();
    expect(screen.getByTestId('status-filter')).toBeDefined();
  });

  it('should show status badges for different statuses', async () => {
    mockedGetPipelines.mockResolvedValue(mockListResponse);
    mockedGetPipelineStats.mockResolvedValue(mockStats);

    await act(async () => {
      renderPage();
    });

    // Check badge labels use English status text (matching prototype)
    expect(screen.getAllByText('active').length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText('draft').length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText('running').length).toBeGreaterThanOrEqual(1);
  });

  it('should display pipeline version with "v" prefix', async () => {
    mockedGetPipelines.mockResolvedValue(mockListResponse);
    mockedGetPipelineStats.mockResolvedValue(mockStats);

    await act(async () => {
      renderPage();
    });

    expect(screen.getByText('v2')).toBeDefined();
  });

  it('should have sidebar with ETL Pipeline link active', async () => {
    mockedGetPipelines.mockResolvedValue(mockListResponse);
    mockedGetPipelineStats.mockResolvedValue(mockStats);

    await act(async () => {
      renderPage();
    });

    expect(screen.getByText('ETL Pipeline')).toBeDefined();
    expect(screen.getByText('ETL Pipeline 管理')).toBeDefined();
  });
});
