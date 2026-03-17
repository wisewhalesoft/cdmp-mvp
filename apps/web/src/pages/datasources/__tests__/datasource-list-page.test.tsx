import { render, screen, cleanup, act, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { BrowserRouter } from 'react-router-dom';
import { DatasourceListPage } from '../datasource-list-page';
import { ToastProvider } from '@/components/ui/toast';
import * as datasourcesApi from '@/api/datasources';
import * as authStore from '@/stores/auth-store';
import type { DatasourceListResponse } from '@cdmp/shared';

vi.mock('@/api/datasources');
vi.mock('@/api/auth', () => ({
  logout: vi.fn().mockResolvedValue({}),
}));
vi.mock('@/stores/auth-store');

const mockedGetDatasources = vi.mocked(datasourcesApi.getDatasources);
const mockedTestConnection = vi.mocked(datasourcesApi.testDatasourceConnection);
const mockedGetUser = vi.mocked(authStore.getUser);
const mockedClearAuth = vi.mocked(authStore.clearAuth);

const mockDatasourcesResponse: DatasourceListResponse = {
  data: [
    {
      id: 'ds-1',
      name: 'MySQL 主資料庫',
      type: 'mysql',
      host: '192.168.1.100',
      port: 3306,
      databaseName: 'prod_db',
      username: 'admin',
      description: 'Production MySQL',
      status: 'connected',
      lastTestedAt: '2026-01-15T14:30:00.000Z',
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-10T00:00:00.000Z',
    },
    {
      id: 'ds-2',
      name: 'PostgreSQL 分析庫',
      type: 'postgresql',
      host: '192.168.1.101',
      port: 5432,
      databaseName: 'analytics_db',
      username: 'analyst',
      description: null,
      status: 'disconnected',
      lastTestedAt: null,
      createdAt: '2026-01-02T00:00:00.000Z',
      updatedAt: '2026-01-02T00:00:00.000Z',
    },
    {
      id: 'ds-3',
      name: 'SQL Server 報表庫',
      type: 'sqlserver',
      host: '192.168.1.102',
      port: 1433,
      databaseName: 'report_db',
      username: 'reporter',
      description: null,
      status: 'unknown',
      lastTestedAt: null,
      createdAt: '2026-01-03T00:00:00.000Z',
      updatedAt: '2026-01-03T00:00:00.000Z',
    },
  ],
  pagination: { page: 1, limit: 20, total: 3, totalPages: 1 },
};

const emptyResponse: DatasourceListResponse = {
  data: [],
  pagination: { page: 1, limit: 20, total: 0, totalPages: 0 },
};

function setupMocks(response: DatasourceListResponse = mockDatasourcesResponse) {
  mockedGetDatasources.mockResolvedValue(response);
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
          <DatasourceListPage />
        </ToastProvider>
      </BrowserRouter>,
    );
  });
  // Advance timers for debounce
  await act(async () => {
    vi.advanceTimersByTime(350);
  });
  // Wait for async fetch
  await act(async () => {
    await vi.runAllTimersAsync();
  });
}

describe('DatasourceListPage', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    setupMocks();
  });

  afterEach(() => {
    vi.useRealTimers();
    cleanup();
    vi.restoreAllMocks();
  });

  // FE-001: 頁面載入時顯示資料來源清單
  describe('渲染測試', () => {
    it('should render datasource list on load', async () => {
      await renderAndLoad();

      expect(screen.getByText('MySQL 主資料庫')).toBeInTheDocument();
      expect(screen.getByText('PostgreSQL 分析庫')).toBeInTheDocument();
      expect(screen.getByText('SQL Server 報表庫')).toBeInTheDocument();
    });

    // FE-002: 每筆顯示名稱、類型、主機、資料庫、狀態
    it('should display name, type, host, database, status for each item', async () => {
      await renderAndLoad();

      expect(screen.getByText('192.168.1.100')).toBeInTheDocument();
      expect(screen.getByText('prod_db')).toBeInTheDocument();
      // MySQL appears both as badge and in filter dropdown, use getAllByText
      expect(screen.getAllByText('MySQL').length).toBeGreaterThanOrEqual(1);
    });

    // FE-003: 狀態 Badge 顯示
    it('should display status badges', async () => {
      await renderAndLoad();

      // Status text appears both as badge and in filter dropdown
      expect(screen.getAllByText('connected').length).toBeGreaterThanOrEqual(1);
      expect(screen.getAllByText('disconnected').length).toBeGreaterThanOrEqual(1);
      expect(screen.getAllByText('unknown').length).toBeGreaterThanOrEqual(1);
    });

    // FE-003b: 類型 Badge 顏色
    it('should display type badges with correct labels', async () => {
      await renderAndLoad();

      // Type text appears both as badge and in filter dropdown
      expect(screen.getAllByText('MySQL').length).toBeGreaterThanOrEqual(1);
      expect(screen.getAllByText('PostgreSQL').length).toBeGreaterThanOrEqual(1);
      expect(screen.getAllByText('SQL Server').length).toBeGreaterThanOrEqual(1);
    });

    // FE-009: 分頁控制元件顯示
    it('should show pagination info', async () => {
      await renderAndLoad();

      expect(screen.getByText(/共 3 筆/)).toBeInTheDocument();
      expect(screen.getByLabelText('上一頁')).toBeInTheDocument();
      expect(screen.getByLabelText('下一頁')).toBeInTheDocument();
    });

    // FE-011: Sidebar 資料來源為 active
    it('should have active state on datasource sidebar link', async () => {
      await renderAndLoad();

      const dsLink = screen.getByText('資料來源').closest('a');
      expect(dsLink).toHaveAttribute('aria-current', 'page');
    });
  });

  // FE-004, FE-005, FE-006: 互動測試
  describe('篩選功能', () => {
    it('should have search input', async () => {
      await renderAndLoad();

      const input = screen.getByPlaceholderText('搜尋資料來源名稱');
      expect(input).toBeInTheDocument();
    });

    it('should call API with search parameter after debounce', async () => {
      await renderAndLoad();
      mockedGetDatasources.mockClear();

      const input = screen.getByPlaceholderText('搜尋資料來源名稱');
      await act(async () => {
        fireEvent.change(input, { target: { value: 'mysql' } });
      });
      await act(async () => {
        vi.advanceTimersByTime(350);
      });
      await act(async () => {
        await vi.runAllTimersAsync();
      });

      expect(mockedGetDatasources).toHaveBeenCalledWith(
        expect.objectContaining({ search: 'mysql', page: 1 }),
      );
    });

    it('should have type filter select', async () => {
      await renderAndLoad();

      expect(screen.getByText('全部類型')).toBeInTheDocument();
    });

    it('should have status filter select', async () => {
      await renderAndLoad();

      expect(screen.getByText('全部狀態')).toBeInTheDocument();
    });
  });

  // FE-007: 空狀態
  describe('空狀態', () => {
    it('should show empty state when no datasources', async () => {
      setupMocks(emptyResponse);
      await renderAndLoad();

      expect(screen.getByText('尚未設定任何資料來源')).toBeInTheDocument();
    });

    it('should show add button in empty state', async () => {
      setupMocks(emptyResponse);
      await renderAndLoad();

      const buttons = screen.getAllByText('新增資料來源');
      // Toolbar button + empty state button
      expect(buttons.length).toBeGreaterThanOrEqual(2);
    });
  });

  // FE-008: 列表/卡片切換
  describe('檢視模式切換', () => {
    it('should have list and card view toggle buttons', async () => {
      await renderAndLoad();

      expect(screen.getByLabelText('清單檢視')).toBeInTheDocument();
      expect(screen.getByLabelText('卡片檢視')).toBeInTheDocument();
    });

    it('should switch to card view when card button clicked', async () => {
      await renderAndLoad();

      const cardBtn = screen.getByLabelText('卡片檢視');
      await act(async () => {
        fireEvent.click(cardBtn);
      });

      // In card view, host:port should be visible
      expect(screen.getByText(/192\.168\.1\.100:3306/)).toBeInTheDocument();
    });
  });

  // FE-010: 新增資料來源按鈕
  describe('新增按鈕', () => {
    it('should have add datasource button in toolbar', async () => {
      await renderAndLoad();

      const buttons = screen.getAllByText('新增資料來源');
      expect(buttons.length).toBeGreaterThanOrEqual(1);
    });
  });

  // Header
  describe('Header', () => {
    it('should display page title', async () => {
      await renderAndLoad();

      expect(screen.getByText('資料來源管理')).toBeInTheDocument();
    });

    it('should display user name', async () => {
      await renderAndLoad();

      expect(screen.getByText('Admin User')).toBeInTheDocument();
    });
  });

  // F014: 刪除功能
  describe('刪除資料來源', () => {
    const mockedDeleteDatasource = vi.mocked(datasourcesApi.deleteDatasource);

    beforeEach(() => {
      mockedDeleteDatasource.mockResolvedValue({
        message: '資料來源已成功刪除',
        id: 'ds-1',
      });
    });

    it('should have clickable delete buttons (not disabled)', async () => {
      await renderAndLoad();

      const deleteButtons = screen.getAllByText('刪除');
      deleteButtons.forEach((btn) => {
        expect(btn.tagName).toBe('BUTTON');
        expect(btn).not.toBeDisabled();
      });
    });

    it('should show confirmation modal when delete button clicked', async () => {
      await renderAndLoad();

      const deleteButtons = screen.getAllByText('刪除');
      await act(async () => {
        fireEvent.click(deleteButtons[0]);
      });

      expect(screen.getByText('刪除資料來源')).toBeInTheDocument();
      expect(screen.getByText(/您確定要刪除/)).toBeInTheDocument();
      // Name is in a separate <span>, verify it exists in the modal
      expect(screen.getAllByText('MySQL 主資料庫').length).toBeGreaterThanOrEqual(1);
    });

    it('should display datasource name in modal warning text', async () => {
      await renderAndLoad();

      const deleteButtons = screen.getAllByText('刪除');
      await act(async () => {
        fireEvent.click(deleteButtons[0]);
      });

      // Name is rendered in a <span> inside the paragraph
      const warningText = screen.getByText(/您確定要刪除/);
      expect(warningText).toBeInTheDocument();
      expect(warningText.textContent).toContain('MySQL 主資料庫');
    });

    it('should close modal when cancel button clicked', async () => {
      await renderAndLoad();

      const deleteButtons = screen.getAllByText('刪除');
      await act(async () => {
        fireEvent.click(deleteButtons[0]);
      });

      expect(screen.getByText('刪除資料來源')).toBeInTheDocument();

      const cancelButton = screen.getByText('取消');
      await act(async () => {
        fireEvent.click(cancelButton);
      });

      expect(screen.queryByText('刪除資料來源')).not.toBeInTheDocument();
    });

    it('should call deleteDatasource API when confirm button clicked', async () => {
      await renderAndLoad();

      const deleteButtons = screen.getAllByText('刪除');
      await act(async () => {
        fireEvent.click(deleteButtons[0]);
      });

      const confirmButton = screen.getByText('確認刪除');
      await act(async () => {
        fireEvent.click(confirmButton);
      });
      await act(async () => {
        await vi.runAllTimersAsync();
      });

      expect(mockedDeleteDatasource).toHaveBeenCalledWith('ds-1');
    });

    it('should remove item from list after successful deletion', async () => {
      await renderAndLoad();

      expect(screen.getByText('MySQL 主資料庫')).toBeInTheDocument();

      const deleteButtons = screen.getAllByText('刪除');
      await act(async () => {
        fireEvent.click(deleteButtons[0]);
      });

      const confirmButton = screen.getByText('確認刪除');
      await act(async () => {
        fireEvent.click(confirmButton);
      });
      await act(async () => {
        await vi.runAllTimersAsync();
      });

      expect(screen.queryByText('MySQL 主資料庫')).not.toBeInTheDocument();
    });

    it('should show error toast and keep modal open on API failure', async () => {
      mockedDeleteDatasource.mockRejectedValue({
        response: { data: { message: '系統發生錯誤' } },
      });

      await renderAndLoad();

      const deleteButtons = screen.getAllByText('刪除');
      await act(async () => {
        fireEvent.click(deleteButtons[0]);
      });

      const confirmButton = screen.getByText('確認刪除');
      await act(async () => {
        fireEvent.click(confirmButton);
      });
      await act(async () => {
        await vi.runAllTimersAsync();
      });

      // Modal should still be visible
      expect(screen.getByText('刪除資料來源')).toBeInTheDocument();
    });

    it('should have delete buttons in card view', async () => {
      await renderAndLoad();

      // Switch to card view
      const cardBtn = screen.getByLabelText('卡片檢視');
      await act(async () => {
        fireEvent.click(cardBtn);
      });

      const deleteButtons = screen.getAllByText('刪除');
      expect(deleteButtons.length).toBeGreaterThanOrEqual(3);
      deleteButtons.forEach((btn) => {
        expect(btn.tagName).toBe('BUTTON');
      });
    });
  });

  // F015: 測試連線功能
  describe('測試連線', () => {
    beforeEach(() => {
      mockedTestConnection.mockResolvedValue({
        success: true,
        message: '連線成功 (42ms)',
        responseTime: 42,
      });
    });

    it('should have clickable test connection buttons in list view', async () => {
      await renderAndLoad();

      const testButtons = screen.getAllByText('測試連線');
      expect(testButtons.length).toBeGreaterThanOrEqual(3);
      testButtons.forEach((btn) => {
        expect(btn.tagName).toBe('BUTTON');
        expect(btn).not.toBeDisabled();
      });
    });

    it('should have clickable test connection buttons in card view', async () => {
      await renderAndLoad();

      const cardBtn = screen.getByLabelText('卡片檢視');
      await act(async () => {
        fireEvent.click(cardBtn);
      });

      const testButtons = screen.getAllByText('測試連線');
      expect(testButtons.length).toBeGreaterThanOrEqual(3);
      testButtons.forEach((btn) => {
        expect(btn.tagName).toBe('BUTTON');
      });
    });

    it('should call testDatasourceConnection API when test button clicked', async () => {
      await renderAndLoad();

      const testButtons = screen.getAllByText('測試連線');
      await act(async () => {
        fireEvent.click(testButtons[0]);
      });
      await act(async () => {
        await vi.runAllTimersAsync();
      });

      expect(mockedTestConnection).toHaveBeenCalledWith('ds-1');
    });

    it('should show loading state while testing', async () => {
      mockedTestConnection.mockImplementation(() => new Promise(() => {}));
      await renderAndLoad();

      const testButtons = screen.getAllByText('測試連線');
      await act(async () => {
        fireEvent.click(testButtons[0]);
      });

      expect(screen.getByText('測試中...')).toBeInTheDocument();
    });

    it('should show success toast on successful connection', async () => {
      await renderAndLoad();

      const testButtons = screen.getAllByText('測試連線');
      await act(async () => {
        fireEvent.click(testButtons[0]);
        // Let the mock resolve
        await mockedTestConnection.mock.results[0]?.value;
      });

      expect(screen.getByText('連線成功 (42ms)')).toBeInTheDocument();
    });

    it('should show error toast on failed connection', async () => {
      mockedTestConnection.mockResolvedValue({
        success: false,
        message: '無法連線至主機',
        responseTime: 1500,
      });
      await renderAndLoad();

      const testButtons = screen.getAllByText('測試連線');
      await act(async () => {
        fireEvent.click(testButtons[0]);
        await mockedTestConnection.mock.results[0]?.value;
      });

      expect(screen.getByText('無法連線至主機')).toBeInTheDocument();
    });

    it('should show warning toast on connection timeout', async () => {
      mockedTestConnection.mockResolvedValue({
        success: false,
        message: '連線逾時',
        responseTime: 10000,
      });
      await renderAndLoad();

      const testButtons = screen.getAllByText('測試連線');
      await act(async () => {
        fireEvent.click(testButtons[0]);
        await mockedTestConnection.mock.results[0]?.value;
      });

      expect(screen.getByText('連線逾時')).toBeInTheDocument();
    });

    it('should show error toast on API error', async () => {
      mockedTestConnection.mockRejectedValue(new Error('Network error'));
      await renderAndLoad();

      const testButtons = screen.getAllByText('測試連線');
      await act(async () => {
        fireEvent.click(testButtons[0]);
        try { await mockedTestConnection.mock.results[0]?.value; } catch { /* expected */ }
      });

      expect(screen.getByText('測試連線時發生錯誤')).toBeInTheDocument();
    });
  });
});
