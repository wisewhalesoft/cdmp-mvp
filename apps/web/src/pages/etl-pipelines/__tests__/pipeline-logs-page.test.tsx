import { render, screen, act, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { PipelineLogsPage } from '../pipeline-logs-page';
import * as etlPipelinesApi from '@/api/etl-pipelines';
import * as authStore from '@/stores/auth-store';
import type { PipelineLogListResponse, PipelineLogDetailResponse } from '@cdmp/shared';

vi.mock('@/api/etl-pipelines');
vi.mock('@/api/auth', () => ({
  logout: vi.fn().mockResolvedValue({}),
}));
vi.mock('@/stores/auth-store');

const mockedGetPipelineLogs = vi.mocked(etlPipelinesApi.getPipelineLogs);
const mockedGetLogDetail = vi.mocked(etlPipelinesApi.getLogDetail);
const mockedExecutePipeline = vi.mocked(etlPipelinesApi.executePipeline);
const mockedGetUser = vi.mocked(authStore.getUser);

const PIPELINE_ID = 'pl-test-001';

const mockLogsResponse: PipelineLogListResponse = {
  data: [
    {
      id: 'log-1',
      version: 3,
      status: 'completed',
      startedAt: '2026-03-20T02:00:15.000Z',
      finishedAt: '2026-03-20T02:05:45.000Z',
      durationMs: 330000,
      processedCount: 1000,
      triggeredBy: 'schedule',
      isTestRun: false,
    },
    {
      id: 'log-2',
      version: 3,
      status: 'failed',
      startedAt: '2026-03-19T14:30:00.000Z',
      finishedAt: '2026-03-19T14:31:20.000Z',
      durationMs: 80000,
      processedCount: 0,
      triggeredBy: 'manual',
      isTestRun: false,
    },
    {
      id: 'log-3',
      version: 2,
      status: 'completed',
      startedAt: '2026-03-19T10:00:00.000Z',
      finishedAt: '2026-03-19T10:02:45.000Z',
      durationMs: 165000,
      processedCount: 500,
      triggeredBy: 'test',
      isTestRun: true,
    },
    {
      id: 'log-4',
      version: 3,
      status: 'running',
      startedAt: '2026-03-20T09:15:00.000Z',
      finishedAt: null,
      durationMs: null,
      processedCount: 0,
      triggeredBy: 'manual',
      isTestRun: false,
    },
  ],
  pagination: { page: 1, pageSize: 10, total: 4, totalPages: 1 },
};

const mockLogDetail: PipelineLogDetailResponse = {
  id: 'log-1',
  pipelineId: PIPELINE_ID,
  pipelineName: '客戶資料同步',
  version: 3,
  status: 'completed',
  startedAt: '2026-03-20T02:00:15.000Z',
  finishedAt: '2026-03-20T02:05:45.000Z',
  durationMs: 330000,
  processedCount: 1000,
  errorMessage: null,
  triggeredBy: 'schedule',
  isTestRun: false,
  nodeLogs: [
    {
      nodeId: 'node-1',
      nodeName: 'Extract: raw_a3f2c1d4',
      nodeType: 'extract',
      status: 'completed',
      processedCount: 1000,
      durationMs: 120000,
      errorMessage: null,
    },
    {
      nodeId: 'node-2',
      nodeName: 'NULL 處理',
      nodeType: 'transform-null-handler',
      status: 'completed',
      processedCount: 950,
      durationMs: 45000,
      errorMessage: null,
    },
    {
      nodeId: 'node-3',
      nodeName: 'Load: customer_core',
      nodeType: 'load',
      status: 'completed',
      processedCount: 950,
      durationMs: 120000,
      errorMessage: null,
    },
  ],
};

const mockFailedLogDetail: PipelineLogDetailResponse = {
  id: 'log-2',
  pipelineId: PIPELINE_ID,
  pipelineName: '客戶資料同步',
  version: 3,
  status: 'failed',
  startedAt: '2026-03-19T14:30:00.000Z',
  finishedAt: '2026-03-19T14:31:20.000Z',
  durationMs: 80000,
  processedCount: 0,
  errorMessage: 'Load 節點寫入失敗：目標表欄位不符',
  triggeredBy: 'manual',
  isTestRun: false,
  nodeLogs: [
    {
      nodeId: 'node-1',
      nodeName: 'Extract: raw_a3f2c1d4',
      nodeType: 'extract',
      status: 'completed',
      processedCount: 1000,
      durationMs: 50000,
      errorMessage: null,
    },
    {
      nodeId: 'node-2',
      nodeName: 'NULL 處理',
      nodeType: 'transform-null-handler',
      status: 'completed',
      processedCount: 950,
      durationMs: 20000,
      errorMessage: null,
    },
    {
      nodeId: 'node-3',
      nodeName: 'Load: customer_core',
      nodeType: 'load',
      status: 'failed',
      processedCount: 0,
      durationMs: 10000,
      errorMessage: '違反唯一約束：customer_id 重複',
    },
  ],
};

const mockRunningLogDetail: PipelineLogDetailResponse = {
  id: 'log-4',
  pipelineId: PIPELINE_ID,
  pipelineName: '客戶資料同步',
  version: 3,
  status: 'running',
  startedAt: '2026-03-20T09:15:00.000Z',
  finishedAt: null,
  durationMs: null,
  processedCount: 0,
  errorMessage: null,
  triggeredBy: 'manual',
  isTestRun: false,
  nodeLogs: [],
};

const emptyLogsResponse: PipelineLogListResponse = {
  data: [],
  pagination: { page: 1, pageSize: 10, total: 0, totalPages: 0 },
};

function renderPage(
  pipelineState?: { pipelineId: string; pipelineName: string; pipelineStatus: string },
) {
  return render(
    <MemoryRouter
      initialEntries={[
        {
          pathname: `/etl-pipelines/${PIPELINE_ID}/logs`,
          state: pipelineState ?? {
            pipelineId: PIPELINE_ID,
            pipelineName: '客戶資料同步',
            pipelineStatus: 'active',
          },
        },
      ]}
    >
      <Routes>
        <Route path="/etl-pipelines/:id/logs" element={<PipelineLogsPage />} />
      </Routes>
    </MemoryRouter>,
  );
}

describe('F032: Pipeline Logs Page', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockedGetUser.mockReturnValue({ id: 'admin-1', name: 'Admin', email: 'a@b.com', role: 'admin' });
    mockedGetPipelineLogs.mockResolvedValue(mockLogsResponse);
    mockedGetLogDetail.mockResolvedValue(mockLogDetail);
    mockedExecutePipeline.mockResolvedValue({ logId: 'new-log', message: 'ok' });
  });

  it('should render log list with all required columns', async () => {
    await act(async () => { renderPage(); });

    expect(screen.getByText('執行時間')).toBeInTheDocument();
    expect(screen.getByText('版本')).toBeInTheDocument();
    expect(screen.getByText('狀態')).toBeInTheDocument();
    expect(screen.getByText('處理筆數')).toBeInTheDocument();
    expect(screen.getByText('耗時')).toBeInTheDocument();
    expect(screen.getByText('觸發方式')).toBeInTheDocument();
  });

  it('should display status badges correctly', async () => {
    await act(async () => { renderPage(); });

    expect(screen.getAllByText('completed').length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText('failed')).toBeInTheDocument();
    expect(screen.getByText('running')).toBeInTheDocument();
  });

  it('should display trigger type badges', async () => {
    await act(async () => { renderPage(); });

    expect(screen.getByText('schedule')).toBeInTheDocument();
    expect(screen.getAllByText('manual').length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText('test')).toBeInTheDocument();
  });

  it('should display test run marker', async () => {
    await act(async () => { renderPage(); });

    // Test log (isTestRun=true) should show a test marker
    expect(screen.getByText('測試')).toBeInTheDocument();
  });

  it('should show running log with blue background', async () => {
    await act(async () => { renderPage(); });

    const runningRow = screen.getByTestId('log-row-log-4');
    expect(runningRow.className).toContain('bg-blue-50/30');
  });

  it('should display dash for running log duration and processedCount', async () => {
    await act(async () => { renderPage(); });

    const runningRow = screen.getByTestId('log-row-log-4');
    const cells = runningRow.querySelectorAll('td');
    // processedCount cell and duration cell should show '-'
    const textContents = Array.from(cells).map((c) => c.textContent);
    expect(textContents.some((t) => t?.includes('-'))).toBe(true);
  });

  it('should show empty state when no logs', async () => {
    mockedGetPipelineLogs.mockResolvedValue(emptyLogsResponse);
    await act(async () => { renderPage(); });

    expect(screen.getByText('尚無執行紀錄')).toBeInTheDocument();
  });

  it('should open drawer when clicking a log row', async () => {
    await act(async () => { renderPage(); });

    const logRow = screen.getByTestId('log-row-log-1');
    await act(async () => { fireEvent.click(logRow); });

    await waitFor(() => {
      expect(screen.getByText('執行日誌詳情')).toBeInTheDocument();
    });
  });

  it('should show node logs in drawer with type color coding', async () => {
    await act(async () => { renderPage(); });

    const logRow = screen.getByTestId('log-row-log-1');
    await act(async () => { fireEvent.click(logRow); });

    await waitFor(() => {
      expect(screen.getByText('Extract: raw_a3f2c1d4')).toBeInTheDocument();
      expect(screen.getByText('NULL 處理')).toBeInTheDocument();
      expect(screen.getByText('Load: customer_core')).toBeInTheDocument();
    });

    // Node type color coding
    const extractLabel = screen.getByText('Extract');
    expect(extractLabel.className).toContain('text-blue-600');

    const transformLabel = screen.getByText('Transform');
    expect(transformLabel.className).toContain('text-amber-600');

    const loadLabel = screen.getByText('Load');
    expect(loadLabel.className).toContain('text-green-600');
  });

  it('should show error message in failed log drawer', async () => {
    mockedGetLogDetail.mockResolvedValue(mockFailedLogDetail);
    await act(async () => { renderPage(); });

    const logRow = screen.getByTestId('log-row-log-2');
    await act(async () => { fireEvent.click(logRow); });

    await waitFor(() => {
      expect(screen.getByText('執行錯誤')).toBeInTheDocument();
      expect(screen.getByText('Load 節點寫入失敗：目標表欄位不符')).toBeInTheDocument();
    });
  });

  it('should show retry button in failed log drawer', async () => {
    mockedGetLogDetail.mockResolvedValue(mockFailedLogDetail);
    await act(async () => { renderPage(); });

    const logRow = screen.getByTestId('log-row-log-2');
    await act(async () => { fireEvent.click(logRow); });

    await waitFor(() => {
      expect(screen.getByTestId('retry-button')).toBeInTheDocument();
    });
  });

  it('should call executePipeline when retry button is clicked', async () => {
    mockedGetLogDetail.mockResolvedValue(mockFailedLogDetail);
    await act(async () => { renderPage(); });

    const logRow = screen.getByTestId('log-row-log-2');
    await act(async () => { fireEvent.click(logRow); });

    await waitFor(() => {
      expect(screen.getByTestId('retry-button')).toBeInTheDocument();
    });

    await act(async () => {
      fireEvent.click(screen.getByTestId('retry-button'));
    });

    expect(mockedExecutePipeline).toHaveBeenCalledWith(PIPELINE_ID);
  });

  it('should show running drawer with progress info', async () => {
    mockedGetLogDetail.mockResolvedValue(mockRunningLogDetail);
    await act(async () => { renderPage(); });

    const logRow = screen.getByTestId('log-row-log-4');
    await act(async () => { fireEvent.click(logRow); });

    await waitFor(() => {
      expect(screen.getByText('執行進度')).toBeInTheDocument();
      expect(screen.getByText('執行中')).toBeInTheDocument();
    });
  });

  it('should show pagination info', async () => {
    await act(async () => { renderPage(); });

    expect(screen.getByTestId('pagination-info')).toHaveTextContent('共 4 筆');
  });

  it('should close drawer when X button is clicked', async () => {
    await act(async () => { renderPage(); });

    const logRow = screen.getByTestId('log-row-log-1');
    await act(async () => { fireEvent.click(logRow); });

    await waitFor(() => {
      expect(screen.getByText('執行日誌詳情')).toBeInTheDocument();
    });

    const closeButton = screen.getByTestId('drawer-close');
    await act(async () => { fireEvent.click(closeButton); });

    await waitFor(() => {
      expect(screen.queryByText('執行日誌詳情')).not.toBeInTheDocument();
    });
  });

  it('should display pipeline name in breadcrumb', async () => {
    await act(async () => { renderPage(); });

    expect(screen.getAllByText('客戶資料同步').length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText('執行日誌')).toBeInTheDocument();
  });
});
