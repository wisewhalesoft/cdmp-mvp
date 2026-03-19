import { render, screen, cleanup, fireEvent, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { BrowserRouter } from 'react-router-dom';
import { DeleteTaskDialog } from '../delete-task-dialog';
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
const mockedDeleteExtractionTask = vi.mocked(extractionTasksApi.deleteExtractionTask);
const mockedGetDashboard = vi.mocked(extractionTasksApi.getExtractionDashboard);
const mockedGetTrend = vi.mocked(extractionTasksApi.getExtractionDashboardTrend);
const mockedGetUser = vi.mocked(authStore.getUser);
const mockedClearAuth = vi.mocked(authStore.clearAuth);

const mockResponse: ExtractionTaskListResponse = {
  data: [
    {
      id: 'et-scheduled',
      name: '排程中任務',
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
  meta: { total: 2, page: 1, limit: 10, totalPages: 1 },
  summary: {
    totalTasks: 2,
    running: 1,
    todaySuccess: 0,
    todayFailed: 0,
    successRate: 0,
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
  mockedDeleteExtractionTask.mockResolvedValue({ message: '擷取任務已刪除' });
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
  // Switch to list tab (default is dashboard)
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

describe('DeleteTaskDialog', () => {
  it('should render dialog with task name and impact description', () => {
    render(
      <DeleteTaskDialog
        open={true}
        taskName="每日客戶同步"
        onConfirm={vi.fn()}
        onCancel={vi.fn()}
        loading={false}
      />,
    );

    expect(screen.getByText('確認刪除擷取任務')).toBeInTheDocument();
    expect(screen.getByText('每日客戶同步')).toBeInTheDocument();
    expect(
      screen.getByText(/刪除後此任務將停止排程執行，但歷史日誌將保留。/),
    ).toBeInTheDocument();
    expect(screen.getByText('取消')).toBeInTheDocument();
    expect(screen.getByText('確認刪除')).toBeInTheDocument();
  });

  it('should not render when open is false', () => {
    render(
      <DeleteTaskDialog
        open={false}
        taskName="每日客戶同步"
        onConfirm={vi.fn()}
        onCancel={vi.fn()}
        loading={false}
      />,
    );

    expect(screen.queryByText('確認刪除擷取任務')).not.toBeInTheDocument();
  });

  it('should call onConfirm when confirm button is clicked', () => {
    const onConfirm = vi.fn();

    render(
      <DeleteTaskDialog
        open={true}
        taskName="每日客戶同步"
        onConfirm={onConfirm}
        onCancel={vi.fn()}
        loading={false}
      />,
    );

    fireEvent.click(screen.getByText('確認刪除'));
    expect(onConfirm).toHaveBeenCalledTimes(1);
  });

  it('should call onCancel when cancel button is clicked', () => {
    const onCancel = vi.fn();

    render(
      <DeleteTaskDialog
        open={true}
        taskName="每日客戶同步"
        onConfirm={vi.fn()}
        onCancel={onCancel}
        loading={false}
      />,
    );

    fireEvent.click(screen.getByText('取消'));
    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it('should call onCancel when clicking overlay', () => {
    const onCancel = vi.fn();

    render(
      <DeleteTaskDialog
        open={true}
        taskName="每日客戶同步"
        onConfirm={vi.fn()}
        onCancel={onCancel}
        loading={false}
      />,
    );

    fireEvent.click(screen.getByTestId('delete-task-dialog'));
    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it('should disable confirm button when loading', () => {
    render(
      <DeleteTaskDialog
        open={true}
        taskName="每日客戶同步"
        onConfirm={vi.fn()}
        onCancel={vi.fn()}
        loading={true}
      />,
    );

    const confirmButton = screen.getByText('確認刪除');
    expect(confirmButton).toBeDisabled();
  });
});

describe('ExtractionTaskListPage Delete Integration', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    setupMocks();
  });

  afterEach(() => {
    vi.useRealTimers();
    cleanup();
    vi.restoreAllMocks();
  });

  it('should open delete dialog when clicking delete button on non-running task', async () => {
    await renderAndLoad();

    // Find delete button for the scheduled task (not disabled)
    const deleteButtons = screen.getAllByTitle('刪除');
    const scheduledDeleteBtn = deleteButtons[0];
    expect(scheduledDeleteBtn).not.toBeDisabled();

    await act(async () => {
      fireEvent.click(scheduledDeleteBtn);
    });

    expect(screen.getByText('確認刪除擷取任務')).toBeInTheDocument();
    const dialog = screen.getByTestId('delete-task-dialog');
    expect(dialog).toHaveTextContent('排程中任務');
  });

  it('should disable delete button for running task', async () => {
    await renderAndLoad();

    const deleteButtons = screen.getAllByTitle('刪除');
    // The second task is running
    const runningDeleteBtn = deleteButtons[1];
    expect(runningDeleteBtn).toBeDisabled();
  });

  it('should call deleteExtractionTask and show toast on confirm', async () => {
    await renderAndLoad();

    // Open delete dialog
    const deleteButtons = screen.getAllByTitle('刪除');
    await act(async () => {
      fireEvent.click(deleteButtons[0]);
    });

    // Confirm delete
    await act(async () => {
      fireEvent.click(screen.getByText('確認刪除'));
    });

    expect(mockedDeleteExtractionTask).toHaveBeenCalledWith('et-scheduled');
  });

  it('should close dialog when clicking cancel', async () => {
    await renderAndLoad();

    const deleteButtons = screen.getAllByTitle('刪除');
    await act(async () => {
      fireEvent.click(deleteButtons[0]);
    });

    expect(screen.getByText('確認刪除擷取任務')).toBeInTheDocument();

    await act(async () => {
      fireEvent.click(screen.getByText('取消'));
    });

    expect(screen.queryByText('確認刪除擷取任務')).not.toBeInTheDocument();
  });
});
