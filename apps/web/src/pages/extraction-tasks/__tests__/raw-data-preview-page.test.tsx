import { render, screen, cleanup, act, fireEvent, within } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { RawDataPreviewPage } from '../raw-data-preview-page';
import { ToastProvider } from '@/components/ui/toast';
import * as extractionTasksApi from '@/api/extraction-tasks';
import * as authStore from '@/stores/auth-store';
import type { RawDataResponse } from '@cdmp/shared';

vi.mock('@/api/extraction-tasks');
vi.mock('@/api/auth', () => ({
  logout: vi.fn().mockResolvedValue({}),
}));
vi.mock('@/stores/auth-store');

const mockedGetRawData = vi.mocked(extractionTasksApi.getRawData);
const mockedGetUser = vi.mocked(authStore.getUser);
const mockedClearAuth = vi.mocked(authStore.clearAuth);

const mockRawDataResponse: RawDataResponse = {
  meta: {
    taskName: '每日客戶同步',
    sourceTable: 'customers',
    sourceSchema: null,
    rawTableName: 'raw_a3f2c1d4',
    lastUpdatedAt: '2026-03-18T02:02:45.000Z',
    totalCount: 3600,
    page: 1,
    limit: 50,
    totalPages: 72,
  },
  columns: [
    { name: '_cdmp_id', dataType: 'integer', isSystem: true },
    { name: 'id', dataType: 'integer', isSystem: false },
    { name: 'name', dataType: 'varchar', isSystem: false },
    { name: 'email', dataType: 'varchar', isSystem: false },
    { name: '_cdmp_extracted_at', dataType: 'timestamp', isSystem: true },
  ],
  data: [
    { _cdmp_id: 1, id: 1001, name: '王大明', email: 'wang@example.com', _cdmp_extracted_at: '2026-03-18T02:02:45.000Z' },
    { _cdmp_id: 2, id: 1002, name: '李小華', email: 'li@example.com', _cdmp_extracted_at: '2026-03-18T02:02:45.000Z' },
    { _cdmp_id: 3, id: 1003, name: '張美玲', email: 'zhang@example.com', _cdmp_extracted_at: '2026-03-18T02:02:45.000Z' },
  ],
};

const emptyRawDataResponse: RawDataResponse = {
  meta: {
    taskName: '每日客戶同步',
    sourceTable: 'customers',
    sourceSchema: null,
    rawTableName: 'raw_a3f2c1d4',
    lastUpdatedAt: null,
    totalCount: 0,
    page: 1,
    limit: 50,
    totalPages: 0,
  },
  columns: [],
  data: [],
};

const largeDataResponse: RawDataResponse = {
  meta: {
    taskName: '大量資料任務',
    sourceTable: 'big_table',
    sourceSchema: null,
    rawTableName: 'raw_big123',
    lastUpdatedAt: '2026-03-18T02:02:45.000Z',
    totalCount: 150000,
    page: 1,
    limit: 50,
    totalPages: 3000,
    warning: '資料量較大（超過 100,000 筆），查詢可能需要較長時間。非索引欄位排序可能影響效能。',
  },
  columns: [
    { name: '_cdmp_id', dataType: 'integer', isSystem: true },
    { name: 'id', dataType: 'integer', isSystem: false },
  ],
  data: [
    { _cdmp_id: 1, id: 1001 },
  ],
};

function setupMocks() {
  mockedGetRawData.mockResolvedValue(mockRawDataResponse);
  mockedGetUser.mockReturnValue({
    id: '1',
    name: 'Admin User',
    email: 'admin@cdmp.test',
    role: 'admin',
  });
  mockedClearAuth.mockImplementation(() => {});
}

function renderPage(taskId = 'task-1') {
  return render(
    <MemoryRouter initialEntries={[`/extraction-tasks/${taskId}/raw-data`]}>
      <ToastProvider>
        <Routes>
          <Route path="/extraction-tasks/:taskId/raw-data" element={<RawDataPreviewPage />} />
          <Route path="/extraction-tasks" element={<div>任務清單頁</div>} />
        </Routes>
      </ToastProvider>
    </MemoryRouter>,
  );
}

async function renderAndLoad(taskId = 'task-1') {
  await act(async () => {
    renderPage(taskId);
  });
  // Wait for data fetch
  await act(async () => {
    await vi.advanceTimersByTimeAsync(100);
  });
}

describe('F026: Raw Data 預覽頁面', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    setupMocks();
  });

  afterEach(() => {
    vi.useRealTimers();
    cleanup();
    vi.restoreAllMocks();
  });

  describe('API 呼叫', () => {
    it('should call getRawData with taskId on mount', async () => {
      await renderAndLoad('task-abc');
      expect(mockedGetRawData).toHaveBeenCalledWith('task-abc', {
        page: 1,
        limit: 50,
        sortBy: undefined,
        sortOrder: undefined,
      });
    });
  });

  describe('頁面結構', () => {
    it('should render breadcrumb with correct labels', async () => {
      await renderAndLoad();
      // "資料擷取" appears in both sidebar and breadcrumb
      expect(screen.getAllByText('資料擷取').length).toBeGreaterThanOrEqual(1);
      // "擷取資料預覽" appears in both header and breadcrumb
      expect(screen.getAllByText('擷取資料預覽').length).toBeGreaterThanOrEqual(1);
    });

    it('should render back link', async () => {
      await renderAndLoad();
      expect(screen.getByText('返回任務清單')).toBeInTheDocument();
    });

    it('should render page title in header', async () => {
      await renderAndLoad();
      const header = document.querySelector('header')!;
      expect(within(header).getByText('擷取資料預覽')).toBeInTheDocument();
    });
  });

  describe('Summary Card', () => {
    it('should display task name', async () => {
      await renderAndLoad();
      expect(screen.getByText('每日客戶同步')).toBeInTheDocument();
    });

    it('should display source table', async () => {
      await renderAndLoad();
      expect(screen.getByText('customers')).toBeInTheDocument();
    });

    it('should display raw table name', async () => {
      await renderAndLoad();
      expect(screen.getByText('raw_a3f2c1d4')).toBeInTheDocument();
    });

    it('should display total count with thousand separator', async () => {
      await renderAndLoad();
      expect(screen.getByText('3,600')).toBeInTheDocument();
    });

    it('should display last updated time', async () => {
      await renderAndLoad();
      // The date-utils formats as YYYY-MM-DD HH:mm in UTC+8
      // Use getAllByText since date may appear in data cells too
      const dateElements = screen.getAllByText(/2026-03-18/);
      expect(dateElements.length).toBeGreaterThanOrEqual(1);
    });
  });

  describe('資料表格', () => {
    it('should render correct number of data rows', async () => {
      await renderAndLoad();
      const rows = screen.getAllByRole('row');
      // 1 header + 3 data rows
      expect(rows.length).toBe(4);
    });

    it('should render column headers from API response', async () => {
      await renderAndLoad();
      expect(screen.getByText('_cdmp_id')).toBeInTheDocument();
      expect(screen.getByText('id')).toBeInTheDocument();
      expect(screen.getByText('name')).toBeInTheDocument();
      expect(screen.getByText('email')).toBeInTheDocument();
      expect(screen.getByText('_cdmp_extracted_at')).toBeInTheDocument();
    });

    it('should render cell values', async () => {
      await renderAndLoad();
      expect(screen.getByText('王大明')).toBeInTheDocument();
      expect(screen.getByText('李小華')).toBeInTheDocument();
      expect(screen.getByText('張美玲')).toBeInTheDocument();
    });

    it('should apply system column styling to _cdmp columns', async () => {
      await renderAndLoad();
      const headerRow = screen.getAllByRole('row')[0];
      const headers = within(headerRow).getAllByRole('columnheader');
      // First column (_cdmp_id) should have system styling
      expect(headers[0].className).toContain('cdmp-sys-col');
      // Last column (_cdmp_extracted_at) should have system styling
      expect(headers[4].className).toContain('cdmp-sys-col');
      // Normal columns should not
      expect(headers[1].className).not.toContain('cdmp-sys-col');
    });
  });

  describe('排序互動', () => {
    it('should call API with sort params when clicking column header', async () => {
      await renderAndLoad();
      mockedGetRawData.mockClear();

      // Click on "name" header
      const nameHeader = screen.getByText('name').closest('th')!;
      await act(async () => {
        fireEvent.click(nameHeader);
      });
      await act(async () => {
        await vi.advanceTimersByTimeAsync(100);
      });

      expect(mockedGetRawData).toHaveBeenCalledWith('task-1', expect.objectContaining({
        sortBy: 'name',
        sortOrder: 'asc',
        page: 1,
      }));
    });

    it('should toggle sort from asc to desc on second click', async () => {
      vi.useRealTimers();
      setupMocks();
      await act(async () => {
        renderPage('task-1');
      });
      await act(async () => {
        await new Promise((r) => setTimeout(r, 50));
      });

      // First click -> asc
      await act(async () => {
        fireEvent.click(screen.getByText('name').closest('th')!);
      });
      await act(async () => {
        await new Promise((r) => setTimeout(r, 50));
      });

      // Re-query element after re-render, second click -> desc
      await act(async () => {
        fireEvent.click(screen.getByText('name').closest('th')!);
      });
      await act(async () => {
        await new Promise((r) => setTimeout(r, 50));
      });

      // Check the last call has desc sort
      const calls = mockedGetRawData.mock.calls;
      const lastCall = calls[calls.length - 1];
      expect(lastCall[1]).toEqual(expect.objectContaining({
        sortBy: 'name',
        sortOrder: 'desc',
      }));
    });

    it('should clear sort on third click', async () => {
      vi.useRealTimers();
      setupMocks();
      await act(async () => {
        renderPage('task-1');
      });
      await act(async () => {
        await new Promise((r) => setTimeout(r, 50));
      });

      // Click 1: asc
      await act(async () => {
        fireEvent.click(screen.getByText('name').closest('th')!);
      });
      await act(async () => {
        await new Promise((r) => setTimeout(r, 50));
      });
      // Click 2: desc
      await act(async () => {
        fireEvent.click(screen.getByText('name').closest('th')!);
      });
      await act(async () => {
        await new Promise((r) => setTimeout(r, 50));
      });
      // Click 3: null
      await act(async () => {
        fireEvent.click(screen.getByText('name').closest('th')!);
      });
      await act(async () => {
        await new Promise((r) => setTimeout(r, 50));
      });

      // Check the last call has no sort
      const calls = mockedGetRawData.mock.calls;
      const lastCall = calls[calls.length - 1];
      expect(lastCall[1]).toEqual(expect.objectContaining({
        sortBy: undefined,
        sortOrder: undefined,
      }));
    });

    it('should reset to page 1 when sort changes', async () => {
      await renderAndLoad();
      mockedGetRawData.mockClear();

      const nameHeader = screen.getByText('name').closest('th')!;
      await act(async () => {
        fireEvent.click(nameHeader);
      });
      await act(async () => {
        await vi.advanceTimersByTimeAsync(100);
      });

      expect(mockedGetRawData).toHaveBeenCalledWith('task-1', expect.objectContaining({
        page: 1,
      }));
    });
  });

  describe('分頁控制', () => {
    it('should display pagination info', async () => {
      await renderAndLoad();
      expect(screen.getByText(/第 1 頁，共 72 頁/)).toBeInTheDocument();
      expect(screen.getByText(/共 3,600 筆/)).toBeInTheDocument();
    });

    it('should call API with next page when clicking next', async () => {
      await renderAndLoad();
      mockedGetRawData.mockClear();

      const nextButton = screen.getByLabelText('下一頁');
      await act(async () => {
        fireEvent.click(nextButton);
      });
      await act(async () => {
        await vi.advanceTimersByTimeAsync(100);
      });

      expect(mockedGetRawData).toHaveBeenCalledWith('task-1', expect.objectContaining({
        page: 2,
      }));
    });

    it('should call API with last page when clicking last', async () => {
      await renderAndLoad();
      mockedGetRawData.mockClear();

      const lastButton = screen.getByLabelText('最後一頁');
      await act(async () => {
        fireEvent.click(lastButton);
      });
      await act(async () => {
        await vi.advanceTimersByTimeAsync(100);
      });

      expect(mockedGetRawData).toHaveBeenCalledWith('task-1', expect.objectContaining({
        page: 72,
      }));
    });

    it('should disable first and prev buttons on first page', async () => {
      await renderAndLoad();

      expect(screen.getByLabelText('第一頁')).toBeDisabled();
      expect(screen.getByLabelText('上一頁')).toBeDisabled();
    });

    it('should have page size selector with 50/100/200 options', async () => {
      await renderAndLoad();

      const select = screen.getByLabelText('每頁筆數');
      const options = within(select as HTMLElement).getAllByRole('option');
      expect(options).toHaveLength(3);
      expect(options[0]).toHaveTextContent('50');
      expect(options[1]).toHaveTextContent('100');
      expect(options[2]).toHaveTextContent('200');
    });

    it('should reset to page 1 when changing page size', async () => {
      await renderAndLoad();

      // Navigate to page 2 first
      const nextButton = screen.getByLabelText('下一頁');
      await act(async () => {
        fireEvent.click(nextButton);
      });
      await act(async () => {
        await vi.advanceTimersByTimeAsync(100);
      });

      mockedGetRawData.mockClear();

      // Change page size
      const select = screen.getByLabelText('每頁筆數');
      await act(async () => {
        fireEvent.change(select, { target: { value: '100' } });
      });
      await act(async () => {
        await vi.advanceTimersByTimeAsync(100);
      });

      expect(mockedGetRawData).toHaveBeenCalledWith('task-1', expect.objectContaining({
        page: 1,
        limit: 100,
      }));
    });

    it('should display page indicator', async () => {
      await renderAndLoad();
      expect(screen.getByText('1 / 72')).toBeInTheDocument();
    });
  });

  describe('空狀態', () => {
    it('should show empty state when totalCount is 0', async () => {
      mockedGetRawData.mockResolvedValue(emptyRawDataResponse);
      await renderAndLoad();

      expect(screen.getByText('尚未執行擷取任務')).toBeInTheDocument();
      expect(screen.getByText('此任務尚無已擷取的資料，請先執行擷取任務以取得資料。')).toBeInTheDocument();
    });

    it('should show run button in empty state', async () => {
      mockedGetRawData.mockResolvedValue(emptyRawDataResponse);
      await renderAndLoad();

      expect(screen.getByText('立即執行')).toBeInTheDocument();
    });
  });

  describe('Loading 狀態', () => {
    it('should show loading skeleton before data loads', async () => {
      // Don't resolve the promise yet
      let resolvePromise: (value: RawDataResponse) => void;
      mockedGetRawData.mockReturnValue(new Promise((resolve) => {
        resolvePromise = resolve;
      }));

      await act(async () => {
        renderPage('task-1');
      });

      expect(screen.getByTestId('raw-data-loading')).toBeInTheDocument();

      // Resolve and clean up
      await act(async () => {
        resolvePromise!(mockRawDataResponse);
        await vi.advanceTimersByTimeAsync(100);
      });
    });
  });

  describe('sourceSchema 顯示', () => {
    it('來源表顯示為 public.customers（sourceSchema 有值）', async () => {
      mockedGetRawData.mockResolvedValue({
        ...mockRawDataResponse,
        meta: {
          ...mockRawDataResponse.meta,
          sourceSchema: 'public',
          sourceTable: 'customers',
        },
      });
      await renderAndLoad();

      expect(screen.getByText('public.customers')).toBeInTheDocument();
    });

    it('sourceSchema=null 時顯示為 customers（無前綴）', async () => {
      mockedGetRawData.mockResolvedValue({
        ...mockRawDataResponse,
        meta: {
          ...mockRawDataResponse.meta,
          sourceSchema: null,
          sourceTable: 'customers',
        },
      });
      await renderAndLoad();

      // The source table label should show just "customers", not "something.customers"
      const labelEl = screen.getByText('來源資料表');
      // The next sibling div contains the value
      const valueEl = labelEl.nextElementSibling!;
      expect(valueEl.textContent).toBe('customers');
    });
  });

  describe('Warning Banner', () => {
    it('should show warning banner when totalCount > 100,000', async () => {
      mockedGetRawData.mockResolvedValue(largeDataResponse);
      await renderAndLoad();

      expect(screen.getByText(/資料量較大/)).toBeInTheDocument();
      expect(screen.getByText(/超過 100,000 筆/)).toBeInTheDocument();
    });

    it('should not show warning banner when totalCount <= 100,000', async () => {
      await renderAndLoad();

      expect(screen.queryByText(/資料量較大/)).not.toBeInTheDocument();
    });
  });
});
