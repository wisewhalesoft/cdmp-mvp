import { render, screen, cleanup, fireEvent, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { BrowserRouter } from 'react-router-dom';
import { ToggleTaskDialog } from '../toggle-task-dialog';
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
const mockedToggleExtractionTask = vi.mocked(extractionTasksApi.toggleExtractionTask);
const mockedGetDashboard = vi.mocked(extractionTasksApi.getExtractionDashboard);
const mockedGetTrend = vi.mocked(extractionTasksApi.getExtractionDashboardTrend);
const mockedGetUser = vi.mocked(authStore.getUser);
const mockedClearAuth = vi.mocked(authStore.clearAuth);

const mockResponseWithToggle: ExtractionTaskListResponse = {
  data: [
    {
      id: 'et-enabled',
      name: '啟用中任務',
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
      id: 'et-disabled',
      name: '停用中任務',
      datasourceId: 'ds-1',
      datasourceName: 'MySQL 主資料庫',
      mode: 'full',
      status: 'disabled',
      schedule: '0 3 * * *',
      lastExecutionAt: null,
      extractedCount: 0,
      totalCount: 0,
      progressPercent: 0,
      enabled: false,
      createdAt: '2026-01-02T00:00:00.000Z',
      updatedAt: '2026-03-18T03:00:00.000Z',
    },
    {
      id: 'et-running',
      name: '執行中任務',
      datasourceId: 'ds-1',
      datasourceName: 'MySQL 主資料庫',
      mode: 'full',
      status: 'running',
      schedule: '0 4 * * *',
      lastExecutionAt: null,
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
    totalTasks: 3,
    running: 1,
    todaySuccess: 0,
    todayFailed: 0,
    successRate: 0,
  },
};

function setupMocks() {
  mockedGetExtractionTasks.mockResolvedValue(mockResponseWithToggle);
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
  mockedToggleExtractionTask.mockResolvedValue({
    id: 'et-enabled',
    name: '啟用中任務',
    datasourceId: 'ds-1',
    datasourceName: 'MySQL 主資料庫',
    mode: 'full',
    status: 'disabled',
    sourceTable: 'customers',
    sourceSchema: 'dbo',
    rawTableName: 'raw_customers',
    incrementalColumn: null,
    lastIncrementalValue: null,
    schedule: '0 2 * * *',
    enabled: false,
    lastExecutionAt: null,
    extractedCount: 0,
    totalCount: 0,
    progressPercent: 0,
    avgDurationMs: 0,
    executionCount: 0,
    errorMessage: null,
    createdBy: '1',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-03-18T02:00:00.000Z',
  });
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

describe('ToggleTaskDialog', () => {
  it('should render dialog with task name', () => {
    const onConfirm = vi.fn();
    const onCancel = vi.fn();

    render(
      <ToggleTaskDialog
        open={true}
        taskName="測試任務"
        onConfirm={onConfirm}
        onCancel={onCancel}
      />,
    );

    expect(screen.getByText('確認停用擷取任務')).toBeInTheDocument();
    expect(screen.getByText('測試任務')).toBeInTheDocument();
    expect(screen.getByText('取消')).toBeInTheDocument();
    expect(screen.getByText('確認停用')).toBeInTheDocument();
  });

  it('should not render when open is false', () => {
    render(
      <ToggleTaskDialog
        open={false}
        taskName="測試任務"
        onConfirm={vi.fn()}
        onCancel={vi.fn()}
      />,
    );

    expect(screen.queryByText('確認停用擷取任務')).not.toBeInTheDocument();
  });

  it('should call onConfirm when confirm button is clicked', () => {
    const onConfirm = vi.fn();

    render(
      <ToggleTaskDialog
        open={true}
        taskName="測試任務"
        onConfirm={onConfirm}
        onCancel={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByText('確認停用'));
    expect(onConfirm).toHaveBeenCalledTimes(1);
  });

  it('should call onCancel when cancel button is clicked', () => {
    const onCancel = vi.fn();

    render(
      <ToggleTaskDialog
        open={true}
        taskName="測試任務"
        onConfirm={vi.fn()}
        onCancel={onCancel}
      />,
    );

    fireEvent.click(screen.getByText('取消'));
    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it('should call onCancel when clicking overlay', () => {
    const onCancel = vi.fn();

    render(
      <ToggleTaskDialog
        open={true}
        taskName="測試任務"
        onConfirm={vi.fn()}
        onCancel={onCancel}
      />,
    );

    fireEvent.click(screen.getByTestId('toggle-task-dialog'));
    expect(onCancel).toHaveBeenCalledTimes(1);
  });
});

describe('ExtractionTaskListPage Toggle Integration', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    setupMocks();
  });

  afterEach(() => {
    vi.useRealTimers();
    cleanup();
    vi.restoreAllMocks();
  });

  it('should open disable dialog when clicking toggle on enabled task', async () => {
    await renderAndLoad();

    // Find the toggle button for the enabled task (title="停用")
    const toggleButtons = screen.getAllByTitle('停用');
    await act(async () => {
      fireEvent.click(toggleButtons[0]);
    });

    expect(screen.getByText('確認停用擷取任務')).toBeInTheDocument();
    // The task name appears both in the table row and in the dialog
    const dialog = screen.getByTestId('toggle-task-dialog');
    expect(dialog).toHaveTextContent('啟用中任務');
  });

  it('should call toggleExtractionTask directly when enabling a disabled task', async () => {
    await renderAndLoad();

    const enableButton = screen.getByTitle('啟用');
    await act(async () => {
      fireEvent.click(enableButton);
    });

    expect(mockedToggleExtractionTask).toHaveBeenCalledWith('et-disabled', true);
  });

  it('should call toggleExtractionTask when confirming disable', async () => {
    await renderAndLoad();

    // Click toggle on enabled task
    const toggleButtons = screen.getAllByTitle('停用');
    await act(async () => {
      fireEvent.click(toggleButtons[0]);
    });

    // Confirm disable
    await act(async () => {
      fireEvent.click(screen.getByText('確認停用'));
    });

    expect(mockedToggleExtractionTask).toHaveBeenCalledWith('et-enabled', false);
  });

  it('should close dialog when clicking cancel', async () => {
    await renderAndLoad();

    const toggleButtons = screen.getAllByTitle('停用');
    await act(async () => {
      fireEvent.click(toggleButtons[0]);
    });

    expect(screen.getByText('確認停用擷取任務')).toBeInTheDocument();

    await act(async () => {
      fireEvent.click(screen.getByText('取消'));
    });

    expect(screen.queryByText('確認停用擷取任務')).not.toBeInTheDocument();
  });
});
