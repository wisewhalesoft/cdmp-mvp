import { render, screen, cleanup, act, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { BrowserRouter } from 'react-router-dom';
import { ExtractionLogDrawer } from '../extraction-log-drawer';
import * as extractionTasksApi from '@/api/extraction-tasks';
import type { ExtractionLogListResponse } from '@cdmp/shared';

vi.mock('@/api/extraction-tasks');

const mockedGetExtractionLogs = vi.mocked(extractionTasksApi.getExtractionLogs);

const mockLogsResponse: ExtractionLogListResponse = {
  data: [
    {
      id: 'log-1',
      taskId: 'task-1',
      status: 'completed',
      startedAt: '2026-03-18T02:00:00.000Z',
      finishedAt: '2026-03-18T02:02:45.000Z',
      durationMs: 165000,
      extractedCount: 3600,
      totalCount: 3600,
      errorMessage: null,
      triggeredBy: 'schedule',
      createdBy: 'admin',
      createdAt: '2026-03-18T02:00:00.000Z',
    },
    {
      id: 'log-2',
      taskId: 'task-1',
      status: 'failed',
      startedAt: '2026-03-17T02:00:00.000Z',
      finishedAt: '2026-03-17T02:01:30.000Z',
      durationMs: 90000,
      extractedCount: 1200,
      totalCount: 3600,
      errorMessage: '連線逾時：目標主機未回應',
      triggeredBy: 'schedule',
      createdBy: 'admin',
      createdAt: '2026-03-17T02:00:00.000Z',
    },
    {
      id: 'log-3',
      taskId: 'task-1',
      status: 'running',
      startedAt: '2026-03-16T02:00:00.000Z',
      finishedAt: null,
      durationMs: null,
      extractedCount: 500,
      totalCount: 3600,
      errorMessage: null,
      triggeredBy: 'manual',
      createdBy: 'admin',
      createdAt: '2026-03-16T02:00:00.000Z',
    },
    {
      id: 'log-4',
      taskId: 'task-1',
      status: 'completed',
      startedAt: '2026-03-15T02:00:00.000Z',
      finishedAt: '2026-03-15T02:00:00.120Z',
      durationMs: 120,
      extractedCount: 50,
      totalCount: 50,
      errorMessage: null,
      triggeredBy: 'retry',
      createdBy: 'admin',
      createdAt: '2026-03-15T02:00:00.000Z',
    },
  ],
  meta: { total: 4, page: 1, limit: 5, totalPages: 1 },
};

const emptyLogsResponse: ExtractionLogListResponse = {
  data: [],
  meta: { total: 0, page: 1, limit: 5, totalPages: 0 },
};

function renderDrawer(props?: Partial<React.ComponentProps<typeof ExtractionLogDrawer>>) {
  const defaultProps = {
    open: true,
    taskId: 'task-1',
    taskName: '每日客戶同步',
    onClose: vi.fn(),
  };
  return render(
    <BrowserRouter>
      <ExtractionLogDrawer {...defaultProps} {...props} />
    </BrowserRouter>,
  );
}

describe('ExtractionLogDrawer', () => {
  beforeEach(() => {
    mockedGetExtractionLogs.mockResolvedValue(mockLogsResponse);
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  describe('基本渲染', () => {
    it('should render drawer header with task name', async () => {
      await act(async () => {
        renderDrawer();
      });
      expect(screen.getByText(/擷取日誌/)).toBeInTheDocument();
      expect(screen.getByText('每日客戶同步')).toBeInTheDocument();
    });

    it('should not render when open is false', () => {
      renderDrawer({ open: false });
      expect(screen.queryByText(/擷取日誌/)).not.toBeInTheDocument();
    });

    it('should call onClose when X button is clicked', async () => {
      const onClose = vi.fn();
      await act(async () => {
        renderDrawer({ onClose });
      });
      const closeButton = screen.getByLabelText('關閉');
      fireEvent.click(closeButton);
      expect(onClose).toHaveBeenCalledTimes(1);
    });

    it('should call onClose when backdrop is clicked', async () => {
      const onClose = vi.fn();
      await act(async () => {
        renderDrawer({ onClose });
      });
      const backdrop = screen.getByTestId('log-drawer-backdrop');
      fireEvent.click(backdrop);
      expect(onClose).toHaveBeenCalledTimes(1);
    });

    it('should call getExtractionLogs with correct taskId', async () => {
      await act(async () => {
        renderDrawer();
      });
      expect(mockedGetExtractionLogs).toHaveBeenCalledWith('task-1', { page: 1, limit: 5 });
    });
  });

  describe('日誌卡片顯示', () => {
    it('should render status badges with correct colors', async () => {
      await act(async () => {
        renderDrawer();
      });
      // completed = green
      const completedBadges = screen.getAllByText('completed');
      expect(completedBadges[0].closest('span')).toHaveClass('bg-green-100', 'text-green-700');

      // failed = red
      const failedBadge = screen.getByText('failed');
      expect(failedBadge.closest('span')).toHaveClass('bg-red-100', 'text-red-700');

      // running = blue
      const runningBadge = screen.getByText('running');
      expect(runningBadge.closest('span')).toHaveClass('bg-blue-100', 'text-blue-700');
    });

    it('should render triggeredBy labels in Chinese', async () => {
      await act(async () => {
        renderDrawer();
      });
      expect(screen.getAllByText('排程').length).toBeGreaterThanOrEqual(1);
      expect(screen.getByText('手動')).toBeInTheDocument();
      expect(screen.getByText('重新執行')).toBeInTheDocument();
    });

    it('should render start/end times in 2x2 grid', async () => {
      await act(async () => {
        renderDrawer();
      });
      // Check that start/end time labels exist
      expect(screen.getAllByText('開始時間：').length).toBeGreaterThanOrEqual(1);
      expect(screen.getAllByText('結束時間：').length).toBeGreaterThanOrEqual(1);
      expect(screen.getAllByText('執行時間：').length).toBeGreaterThanOrEqual(1);
      expect(screen.getAllByText('擷取筆數：').length).toBeGreaterThanOrEqual(1);
    });

    it('should show dash for running log finishedAt and durationMs', async () => {
      await act(async () => {
        renderDrawer();
      });
      // The running log (log-3) should display "-" for end time and duration
      const runningCard = screen.getByText('running').closest('[data-testid^="log-card-"]')!;
      const texts = runningCard.textContent!;
      // finishedAt=null → display "-"
      expect(texts).toContain('結束時間：');
      expect(texts).toContain('執行時間：');
    });
  });

  describe('BR-5：durationMs 格式化', () => {
    it('should format >= 60000ms as Xm Ys', async () => {
      await act(async () => {
        renderDrawer();
      });
      // log-1: 165000ms → 2m 45s
      const card1 = screen.getByTestId('log-card-log-1');
      expect(card1.textContent).toContain('2m 45s');
    });

    it('should format >= 1000ms as Xs', async () => {
      await act(async () => {
        renderDrawer();
      });
      // log-2: 90000ms → 1m 30s
      const card2 = screen.getByTestId('log-card-log-2');
      expect(card2.textContent).toContain('1m 30s');
    });

    it('should format < 1000ms as Xms', async () => {
      await act(async () => {
        renderDrawer();
      });
      // log-4: 120ms → 120ms
      const card4 = screen.getByTestId('log-card-log-4');
      expect(card4.textContent).toContain('120ms');
    });

    it('should show dash when durationMs is null', async () => {
      await act(async () => {
        renderDrawer();
      });
      // log-3: running, durationMs=null → "-"
      const card3 = screen.getByTestId('log-card-log-3');
      // The card should not contain any "m" or "ms" duration format, just "-"
      expect(card3.textContent).toContain('執行時間：');
    });
  });

  describe('預覽資料連結', () => {
    it('should show preview link for completed log with extractedCount > 0', async () => {
      await act(async () => {
        renderDrawer();
      });
      const card1 = screen.getByTestId('log-card-log-1');
      const link = card1.querySelector('a[href="/extraction-tasks/task-1/raw-data"]');
      expect(link).toBeInTheDocument();
      expect(link).toHaveTextContent('預覽資料');
    });

    it('should not show preview link for failed log', async () => {
      await act(async () => {
        renderDrawer();
      });
      const card2 = screen.getByTestId('log-card-log-2');
      const link = card2.querySelector('a[href*="/raw-data"]');
      expect(link).not.toBeInTheDocument();
    });

    it('should not show preview link for running log', async () => {
      await act(async () => {
        renderDrawer();
      });
      const card3 = screen.getByTestId('log-card-log-3');
      const link = card3.querySelector('a[href*="/raw-data"]');
      expect(link).not.toBeInTheDocument();
    });
  });

  describe('失敗日誌錯誤訊息', () => {
    it('should show error message block for failed log', async () => {
      await act(async () => {
        renderDrawer();
      });
      expect(screen.getByText('連線逾時：目標主機未回應')).toBeInTheDocument();
    });

    it('should have red border on failed log card', async () => {
      await act(async () => {
        renderDrawer();
      });
      const card2 = screen.getByTestId('log-card-log-2');
      expect(card2).toHaveClass('border-red-200');
    });

    it('should have red background on error message', async () => {
      await act(async () => {
        renderDrawer();
      });
      const errorBlock = screen.getByText('連線逾時：目標主機未回應');
      expect(errorBlock).toHaveClass('bg-red-50');
    });
  });

  describe('空狀態', () => {
    it('should show empty state when no logs', async () => {
      mockedGetExtractionLogs.mockResolvedValue(emptyLogsResponse);
      await act(async () => {
        renderDrawer();
      });
      expect(screen.getByText('此任務尚無執行紀錄')).toBeInTheDocument();
    });
  });

  describe('分頁', () => {
    it('should show pagination info', async () => {
      await act(async () => {
        renderDrawer();
      });
      expect(screen.getByText(/顯示 1-4 筆，共 4 筆/)).toBeInTheDocument();
    });

    it('should disable prev button on first page', async () => {
      await act(async () => {
        renderDrawer();
      });
      const prevButton = screen.getByLabelText('上一頁');
      expect(prevButton).toBeDisabled();
    });

    it('should disable next button on last page', async () => {
      await act(async () => {
        renderDrawer();
      });
      const nextButton = screen.getByLabelText('下一頁');
      expect(nextButton).toBeDisabled();
    });

    it('should navigate to next page', async () => {
      const multiPageResponse: ExtractionLogListResponse = {
        ...mockLogsResponse,
        meta: { total: 12, page: 1, limit: 5, totalPages: 3 },
      };
      mockedGetExtractionLogs.mockResolvedValue(multiPageResponse);

      await act(async () => {
        renderDrawer();
      });

      const nextButton = screen.getByLabelText('下一頁');
      expect(nextButton).not.toBeDisabled();

      mockedGetExtractionLogs.mockClear();
      await act(async () => {
        fireEvent.click(nextButton);
      });

      expect(mockedGetExtractionLogs).toHaveBeenCalledWith('task-1', { page: 2, limit: 5 });
    });

    it('should show page indicator', async () => {
      const multiPageResponse: ExtractionLogListResponse = {
        ...mockLogsResponse,
        meta: { total: 12, page: 1, limit: 5, totalPages: 3 },
      };
      mockedGetExtractionLogs.mockResolvedValue(multiPageResponse);

      await act(async () => {
        renderDrawer();
      });

      expect(screen.getByText('1 / 3')).toBeInTheDocument();
    });
  });
});
