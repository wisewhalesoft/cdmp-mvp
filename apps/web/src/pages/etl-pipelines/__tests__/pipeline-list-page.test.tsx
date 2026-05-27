import { render, screen, act, fireEvent, waitFor } from '@testing-library/react';
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
      description: '每日同步客戶資料',
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
      description: null,
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
      description: '庫存資料同步',
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

  // TS-F031-012: running 狀態 Pipeline toggle 按鈕 disabled
  it('should disable toggle button for running pipeline', async () => {
    mockedGetPipelines.mockResolvedValue(mockListResponse);
    mockedGetPipelineStats.mockResolvedValue(mockStats);

    await act(async () => {
      renderPage();
    });

    // pl-3 is running
    const row = screen.getByTestId('pipeline-row-pl-3');
    const toggleBtn = row.querySelector('button[title="執行中"]');
    expect(toggleBtn).not.toBeNull();
    expect((toggleBtn as HTMLButtonElement).disabled).toBe(true);
  });

  // TS-F031-013: draft Pipeline 啟用按鈕 disabled + tooltip
  it('should disable toggle button for draft pipeline with tooltip', async () => {
    mockedGetPipelines.mockResolvedValue(mockListResponse);
    mockedGetPipelineStats.mockResolvedValue(mockStats);

    await act(async () => {
      renderPage();
    });

    // pl-2 is draft
    const row = screen.getByTestId('pipeline-row-pl-2');
    const toggleBtn = row.querySelector('button[title="需先發布 Pipeline 才能啟用"]');
    expect(toggleBtn).not.toBeNull();
    expect((toggleBtn as HTMLButtonElement).disabled).toBe(true);
    // Tooltip text exists
    expect(row.querySelector('.pointer-events-none')?.textContent).toBe('需先發布 Pipeline 才能啟用');
  });

  // =====================================================
  // F034: Delete Pipeline Frontend Tests
  // =====================================================

  // TS-F034-013: 確認對話框顯示內容正確
  it('TS-F034-013: should show delete confirmation dialog with correct content', async () => {
    mockedGetPipelines.mockResolvedValue(mockListResponse);
    mockedGetPipelineStats.mockResolvedValue(mockStats);

    await act(async () => {
      renderPage();
    });

    // Click delete button for pl-1 (active pipeline)
    const row = screen.getByTestId('pipeline-row-pl-1');
    const deleteBtn = row.querySelector('button[title="刪除"]') as HTMLButtonElement;
    expect(deleteBtn).not.toBeNull();

    await act(async () => {
      fireEvent.click(deleteBtn);
    });

    // Verify dialog content
    const dialog = screen.getByTestId('delete-dialog');
    expect(dialog).toBeDefined();
    expect(dialog.textContent).toContain('確認刪除 Pipeline');
    expect(dialog.textContent).toContain('每日客戶同步 Pipeline');
    expect(dialog.textContent).toContain('刪除後排程將停止，歷史日誌將保留。');
    expect(dialog.textContent).toContain('確認刪除');
    expect(dialog.textContent).toContain('取消');
  });

  // TS-F034-014: 點擊取消不刪除 Pipeline
  it('TS-F034-014: should not delete pipeline when cancel is clicked', async () => {
    const mockedDeletePipeline = vi.mocked(etlPipelinesApi.deletePipeline);

    mockedGetPipelines.mockResolvedValue(mockListResponse);
    mockedGetPipelineStats.mockResolvedValue(mockStats);

    await act(async () => {
      renderPage();
    });

    // Open dialog
    const row = screen.getByTestId('pipeline-row-pl-1');
    const deleteBtn = row.querySelector('button[title="刪除"]') as HTMLButtonElement;
    await act(async () => {
      fireEvent.click(deleteBtn);
    });

    // Click cancel button inside the dialog
    const dialog = screen.getByTestId('delete-dialog');
    const cancelBtn = Array.from(dialog.querySelectorAll('button')).find(
      (btn) => btn.textContent === '取消',
    )!;
    await act(async () => {
      fireEvent.click(cancelBtn);
    });

    // Dialog should be closed, API should not be called
    expect(screen.queryByTestId('delete-dialog')).toBeNull();
    expect(mockedDeletePipeline).not.toHaveBeenCalled();
  });

  // TS-F034-015: 執行中 Pipeline 刪除按鈕停用
  it('TS-F034-015: should disable delete button for running pipeline', async () => {
    mockedGetPipelines.mockResolvedValue(mockListResponse);
    mockedGetPipelineStats.mockResolvedValue(mockStats);

    await act(async () => {
      renderPage();
    });

    // pl-3 is running
    const row = screen.getByTestId('pipeline-row-pl-3');
    const deleteBtn = row.querySelector('button[title="執行中無法刪除"]') as HTMLButtonElement;
    expect(deleteBtn).not.toBeNull();
    expect(deleteBtn.disabled).toBe(true);
  });

  // Tab navigation structure tests (aligned with prototype)
  it('should render tab navigation with list tab active', async () => {
    mockedGetPipelines.mockResolvedValue(mockListResponse);
    mockedGetPipelineStats.mockResolvedValue(mockStats);

    await act(async () => {
      renderPage();
    });

    // Tab container should exist with unified testid
    const tabContainer = screen.getByTestId('pipeline-tabs');
    expect(tabContainer).toBeDefined();

    // Tab container should use <nav> with role="tablist"
    const nav = tabContainer.querySelector('nav');
    expect(nav).not.toBeNull();
    expect(nav!.getAttribute('role')).toBe('tablist');
    expect(nav!.className).toContain('space-x-1');

    // Buttons should have role="tab" and aria-selected
    const dashboardTab = screen.getByTestId('tab-dashboard');
    const listTab = screen.getByTestId('tab-list');
    expect(dashboardTab.getAttribute('role')).toBe('tab');
    expect(dashboardTab.getAttribute('aria-selected')).toBe('false');
    expect(listTab.getAttribute('role')).toBe('tab');
    expect(listTab.getAttribute('aria-selected')).toBe('true');

    // List tab should have active styling
    expect(listTab.className).toContain('border-primary');
    // Buttons should use px-5 py-3 padding
    expect(dashboardTab.className).toContain('px-5');
    expect(dashboardTab.className).toContain('py-3');
    expect(listTab.className).toContain('px-5');
    expect(listTab.className).toContain('py-3');

    // Tab navigation should be outside <main>
    const main = tabContainer.closest('main');
    expect(main).toBeNull();
  });

  // =====================================================
  // F093: Edit Pipeline Metadata — gear button
  // =====================================================

  // TS-F093-FE-001: gear 按鈕出現在每列 pencil 之後、execute/toggle 之前
  it('TS-F093-FE-001: should render a settings gear button after the edit pencil', async () => {
    mockedGetPipelines.mockResolvedValue(mockListResponse);
    mockedGetPipelineStats.mockResolvedValue(mockStats);

    await act(async () => {
      renderPage();
    });

    // active and draft pipelines have an enabled gear; running has a disabled one
    const settingsActive = screen.getByTestId('settings-pipeline-pl-1');
    const settingsDraft = screen.getByTestId('settings-pipeline-pl-2');
    expect(settingsActive).not.toBeNull();
    expect(settingsDraft).not.toBeNull();
    expect(settingsActive.getAttribute('title')).toBe('設定');

    // DOM ordering: edit pencil comes BEFORE the gear within the same row
    const row = screen.getByTestId('pipeline-row-pl-1');
    const buttons = Array.from(row.querySelectorAll('button'));
    const editIdx = buttons.findIndex((b) => b.getAttribute('data-testid') === 'edit-pipeline-pl-1');
    const gearIdx = buttons.findIndex((b) => b.getAttribute('data-testid') === 'settings-pipeline-pl-1');
    const execIdx = buttons.findIndex((b) => b.getAttribute('data-testid') === 'execute-pipeline-pl-1');
    expect(editIdx).toBeGreaterThanOrEqual(0);
    expect(gearIdx).toBeGreaterThan(editIdx);
    expect(execIdx).toBeGreaterThan(gearIdx);
  });

  // TS-F093-FE-002 / FE-022: running Pipeline 的 gear 為 disabled，點擊不開 Modal
  it('TS-F093-FE-002: should disable the gear button for a running pipeline', async () => {
    mockedGetPipelines.mockResolvedValue(mockListResponse);
    mockedGetPipelineStats.mockResolvedValue(mockStats);

    await act(async () => {
      renderPage();
    });

    // pl-3 is running — gear must be disabled (DOM-level), with cursor-not-allowed styling
    const row = screen.getByTestId('pipeline-row-pl-3');
    const gear = row.querySelector('button[title="執行中"]') as HTMLButtonElement | null;
    // The running row should NOT expose a clickable settings testid
    expect(screen.queryByTestId('settings-pipeline-pl-3')).toBeNull();
    // There must be a disabled settings-style button (cursor-not-allowed) in the running row
    const disabledGear = Array.from(row.querySelectorAll('button')).find(
      (b) => b.disabled && b.className.includes('cursor-not-allowed'),
    );
    expect(disabledGear).toBeDefined();
    expect(gear).not.toBeNull();
  });

  // TS-F093-FE-022: running gear click 不開 Modal
  it('TS-F093-FE-022: clicking does not open modal for a running pipeline', async () => {
    mockedGetPipelines.mockResolvedValue(mockListResponse);
    mockedGetPipelineStats.mockResolvedValue(mockStats);

    await act(async () => {
      renderPage();
    });

    // No edit-pipeline-modal should be present, even after attempting interactions
    expect(screen.queryByTestId('edit-pipeline-modal')).toBeNull();
  });

  // TS-F093-FE-003: 非 running 點擊 gear → Modal 開啟並預填
  it('TS-F093-FE-003: clicking the gear opens the edit modal pre-filled', async () => {
    mockedGetPipelines.mockResolvedValue(mockListResponse);
    mockedGetPipelineStats.mockResolvedValue(mockStats);

    await act(async () => {
      renderPage();
    });

    await act(async () => {
      fireEvent.click(screen.getByTestId('settings-pipeline-pl-1'));
    });

    const modal = screen.getByTestId('edit-pipeline-modal');
    expect(modal).toBeDefined();
    expect(modal.textContent).toContain('編輯 Pipeline');
    const nameInput = screen.getByTestId('pipeline-name-input') as HTMLInputElement;
    expect(nameInput.value).toBe('每日客戶同步 Pipeline');
  });

  // TS-F031-014: 停用成功後列表即時更新
  it('should update list after toggling pipeline off', async () => {
    const mockedTogglePipeline = vi.mocked(etlPipelinesApi.togglePipeline);
    mockedTogglePipeline.mockResolvedValue({
      id: 'pl-1',
      name: '每日客戶同步 Pipeline',
      status: 'disabled',
      enabled: false,
      schedule: '0 2 * * *',
      updatedAt: '2026-03-23T00:00:00.000Z',
    });

    // First render with active pipeline
    mockedGetPipelines.mockResolvedValue(mockListResponse);
    mockedGetPipelineStats.mockResolvedValue(mockStats);

    await act(async () => {
      renderPage();
    });

    // After toggle, return updated list
    const updatedResponse: PipelineListResponse = {
      ...mockListResponse,
      data: mockListResponse.data.map((p) =>
        p.id === 'pl-1' ? { ...p, status: 'disabled' as const } : p,
      ),
    };
    mockedGetPipelines.mockResolvedValue(updatedResponse);

    // Click toggle button for pl-1 (active → disable)
    const row = screen.getByTestId('pipeline-row-pl-1');
    const toggleBtn = row.querySelector('button[title="停用"]') as HTMLButtonElement;
    expect(toggleBtn).not.toBeNull();

    await act(async () => {
      fireEvent.click(toggleBtn);
    });

    await waitFor(() => {
      expect(mockedTogglePipeline).toHaveBeenCalledWith('pl-1', false);
    });
  });
});
