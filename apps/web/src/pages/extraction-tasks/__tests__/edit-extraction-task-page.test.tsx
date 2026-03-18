import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { EditExtractionTaskPage } from '../edit-extraction-task-page';
import * as extractionTasksApi from '@/api/extraction-tasks';
import * as datasourcesApi from '@/api/datasources';
import * as authStore from '@/stores/auth-store';
import { ToastProvider } from '@/components/ui/toast';

vi.mock('@/api/extraction-tasks');
vi.mock('@/api/datasources');
vi.mock('@/api/auth', () => ({
  logout: vi.fn().mockResolvedValue({}),
}));

const mockedGetExtractionTask = vi.mocked(extractionTasksApi.getExtractionTask);
const mockedUpdateExtractionTask = vi.mocked(extractionTasksApi.updateExtractionTask);
const mockedGetDatasourceOptions = vi.mocked(extractionTasksApi.getDatasourceOptions);
const mockedGetDatasourceSchemas = vi.mocked(datasourcesApi.getDatasourceSchemas);
const mockedGetDatasourceTables = vi.mocked(datasourcesApi.getDatasourceTables);

const mockNavigate = vi.fn();
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom');
  return {
    ...actual,
    useNavigate: () => mockNavigate,
  };
});

const MOCK_DATASOURCES = [
  { id: 'ds-1', name: 'MySQL 主資料庫', type: 'mysql' },
  { id: 'ds-2', name: 'PostgreSQL 分析庫', type: 'postgresql' },
];

const MOCK_TASK = {
  id: 'task-1',
  name: '每日客戶同步',
  datasourceId: 'ds-1',
  datasourceName: 'MySQL 主資料庫',
  mode: 'full' as const,
  status: 'scheduled',
  sourceTable: 'customers',
  sourceSchema: 'dbo',
  rawTableName: 'raw_abc123',
  incrementalColumn: null,
  lastIncrementalValue: null,
  schedule: '0 2 * * *',
  enabled: true,
  lastExecutionAt: null,
  extractedCount: 0,
  totalCount: 0,
  progressPercent: 0,
  avgDurationMs: 0,
  executionCount: 5,
  errorMessage: null,
  createdBy: 'admin-1',
  createdAt: '2026-03-17T00:00:00.000Z',
  updatedAt: '2026-03-17T00:00:00.000Z',
};

function renderPage(taskOverrides?: Partial<typeof MOCK_TASK>) {
  vi.spyOn(authStore, 'getUser').mockReturnValue({
    id: 'admin-1',
    name: 'Admin',
    email: 'admin@test.com',
    role: 'admin',
  });

  mockedGetDatasourceOptions.mockResolvedValue(MOCK_DATASOURCES);
  mockedGetExtractionTask.mockResolvedValue({ ...MOCK_TASK, ...taskOverrides });
  mockedGetDatasourceSchemas.mockResolvedValue({ schemas: ['dbo', 'public', 'sys'] });
  mockedGetDatasourceTables.mockResolvedValue({ tables: ['customers', 'orders', 'products'] });

  return render(
    <MemoryRouter initialEntries={['/extraction-tasks/task-1/edit']}>
      <ToastProvider>
        <Routes>
          <Route path="/extraction-tasks/:id/edit" element={<EditExtractionTaskPage />} />
        </Routes>
      </ToastProvider>
    </MemoryRouter>,
  );
}

describe('EditExtractionTaskPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('AC-3: 表單預填既有值', () => {
    it('should prefill all form fields with existing task data', async () => {
      renderPage();

      await waitFor(() => {
        expect(screen.getByLabelText('任務名稱')).toHaveValue('每日客戶同步');
      });

      expect(screen.getByLabelText('資料來源')).toHaveValue('ds-1');

      await waitFor(() => {
        expect(screen.getByLabelText('來源 Schema')).toHaveValue('dbo');
      });
      expect(screen.getByLabelText('來源資料表')).toHaveValue('customers');
    });

    it('should show correct breadcrumb', async () => {
      renderPage();

      await waitFor(() => {
        const breadcrumb = screen.getByLabelText('breadcrumb');
        expect(breadcrumb).toHaveTextContent('編輯擷取任務');
      });
    });

    it('should reverse-parse cron to simple mode (daily)', async () => {
      renderPage();

      // "0 2 * * *" should be parsed as daily at 02:00
      await waitFor(() => {
        expect(screen.getByLabelText('頻率')).toHaveValue('daily');
      });
    });

    it('should show cron preview', async () => {
      renderPage();

      await waitFor(() => {
        expect(screen.getByTestId('cron-preview')).toHaveTextContent('每日 02:00 執行');
      });
    });
  });

  describe('AC-1: 成功編輯', () => {
    it('should call updateExtractionTask and navigate on success', async () => {
      mockedUpdateExtractionTask.mockResolvedValue({
        ...MOCK_TASK,
        name: '新名稱',
      });

      renderPage();
      const user = userEvent.setup();

      // Wait for form to be populated
      await waitFor(() => {
        expect(screen.getByLabelText('任務名稱')).toHaveValue('每日客戶同步');
      });

      // Update name
      const nameInput = screen.getByLabelText('任務名稱');
      await user.clear(nameInput);
      await user.type(nameInput, '新名稱');

      // Submit
      await user.click(screen.getByText('儲存變更'));

      await waitFor(() => {
        expect(mockedUpdateExtractionTask).toHaveBeenCalledWith('task-1', expect.objectContaining({
          name: '新名稱',
        }));
      });

      await waitFor(() => {
        expect(mockNavigate).toHaveBeenCalledWith('/extraction-tasks', { replace: true });
      });
    });
  });

  describe('錯誤處理', () => {
    it('should show error toast when update fails with 409 EXTRACTION_NAME_EXISTS', async () => {
      mockedUpdateExtractionTask.mockRejectedValue({
        response: { status: 409, data: { error: 'EXTRACTION_NAME_EXISTS', message: '此名稱的擷取任務已存在' } },
      });

      renderPage();
      const user = userEvent.setup();

      await waitFor(() => {
        expect(screen.getByLabelText('任務名稱')).toHaveValue('每日客戶同步');
      });

      await user.click(screen.getByText('儲存變更'));

      await waitFor(() => {
        expect(screen.getByText('此名稱的擷取任務已存在')).toBeInTheDocument();
      });
    });

    it('should show error toast when update fails with 409 EXTRACTION_RUNNING', async () => {
      mockedUpdateExtractionTask.mockRejectedValue({
        response: { status: 409, data: { error: 'EXTRACTION_RUNNING', message: '任務執行中，無法編輯' } },
      });

      renderPage();
      const user = userEvent.setup();

      await waitFor(() => {
        expect(screen.getByLabelText('任務名稱')).toHaveValue('每日客戶同步');
      });

      await user.click(screen.getByText('儲存變更'));

      await waitFor(() => {
        expect(screen.getByText('任務執行中，無法編輯')).toBeInTheDocument();
      });
    });
  });

  describe('取消操作', () => {
    it('should navigate back to list on cancel', async () => {
      renderPage();

      await waitFor(() => {
        expect(screen.getByLabelText('任務名稱')).toHaveValue('每日客戶同步');
      });

      const user = userEvent.setup();
      await user.click(screen.getByText('取消'));

      expect(mockNavigate).toHaveBeenCalledWith('/extraction-tasks', { replace: true });
    });
  });

  describe('連鎖下拉選單', () => {
    it('TS-F019-FE-001: 表單開啟時自動載入並預選既有 schema/table', async () => {
      renderPage();

      await waitFor(() => {
        expect(screen.getByLabelText('來源 Schema')).not.toBeDisabled();
      });

      expect(screen.getByLabelText('來源 Schema')).toHaveValue('dbo');
      expect(screen.getByLabelText('來源資料表')).toHaveValue('customers');
    });

    it('TS-F019-FE-002: 表單開啟時並行呼叫 schemas + tables API', async () => {
      renderPage();

      await waitFor(() => {
        expect(mockedGetDatasourceSchemas).toHaveBeenCalledWith('ds-1');
        expect(mockedGetDatasourceTables).toHaveBeenCalledWith('ds-1', 'dbo');
      });
    });

    it('TS-F019-FE-003: 變更 Datasource 時重置並重新載入', async () => {
      const user = userEvent.setup();
      renderPage();

      await waitFor(() => {
        expect(screen.getByLabelText('來源 Schema')).not.toBeDisabled();
      });

      mockedGetDatasourceSchemas.mockClear();
      await user.selectOptions(screen.getByLabelText('資料來源'), 'ds-2');

      await waitFor(() => {
        expect(mockedGetDatasourceSchemas).toHaveBeenCalledWith('ds-2');
      });

      // Table should be reset
      expect(screen.getByLabelText('來源資料表')).toBeDisabled();
    });

    it('TS-F019-FE-004: 變更 Schema 時重置 Table 並重新載入', async () => {
      const user = userEvent.setup();
      renderPage();

      await waitFor(() => {
        expect(screen.getByLabelText('來源 Schema')).not.toBeDisabled();
      });

      mockedGetDatasourceTables.mockClear();
      await user.selectOptions(screen.getByLabelText('來源 Schema'), 'public');

      // executionCount > 0 triggers warning modal
      await waitFor(() => {
        expect(screen.getByText('確認變更來源資料表')).toBeInTheDocument();
      });
      await user.click(screen.getByRole('button', { name: '確認變更' }));

      await waitFor(() => {
        expect(mockedGetDatasourceTables).toHaveBeenCalledWith('ds-1', 'public');
      });
    });

    it('TS-F019-FE-005: 連線失敗時下拉停用', async () => {
      // Must override before renderPage creates the component
      mockedGetDatasourceSchemas.mockRejectedValueOnce(new Error('Connection failed'));
      mockedGetDatasourceTables.mockRejectedValueOnce(new Error('Connection failed'));
      renderPage();

      await waitFor(() => {
        expect(screen.getByText(/無法連線至資料來源/)).toBeInTheDocument();
      });

      expect(screen.getByLabelText('來源 Schema')).toBeDisabled();
    });
  });

  describe('變更警告 Modal', () => {
    it('TS-F019-FE-006: 變更 sourceTable 時顯示警告 Modal（executionCount > 0）', async () => {
      const user = userEvent.setup();
      renderPage();

      await waitFor(() => {
        expect(screen.getByLabelText('來源資料表')).not.toBeDisabled();
      });

      await user.selectOptions(screen.getByLabelText('來源資料表'), 'orders');

      await waitFor(() => {
        expect(screen.getByText('確認變更來源資料表')).toBeInTheDocument();
      });
    });

    it('TS-F019-FE-007: 變更 sourceSchema 時也觸發警告 Modal', async () => {
      const user = userEvent.setup();
      renderPage();

      await waitFor(() => {
        expect(screen.getByLabelText('來源 Schema')).not.toBeDisabled();
      });

      await user.selectOptions(screen.getByLabelText('來源 Schema'), 'public');

      // Wait for tables to load after schema change, then verify modal appeared
      await waitFor(() => {
        expect(screen.getByText('確認變更來源資料表')).toBeInTheDocument();
      });
    });

    it('TS-F019-FE-008: 點擊「確認變更」→ 值保留', async () => {
      const user = userEvent.setup();
      renderPage();

      await waitFor(() => {
        expect(screen.getByLabelText('來源資料表')).not.toBeDisabled();
      });

      await user.selectOptions(screen.getByLabelText('來源資料表'), 'orders');

      await waitFor(() => {
        expect(screen.getByText('確認變更來源資料表')).toBeInTheDocument();
      });

      await user.click(screen.getByRole('button', { name: '確認變更' }));

      await waitFor(() => {
        expect(screen.queryByText('確認變更來源資料表')).not.toBeInTheDocument();
      });

      expect(screen.getByLabelText('來源資料表')).toHaveValue('orders');
    });

    it('TS-F019-FE-009: 點擊「取消」→ 回復原值', async () => {
      const user = userEvent.setup();
      renderPage();

      await waitFor(() => {
        expect(screen.getByLabelText('來源資料表')).not.toBeDisabled();
      });

      await user.selectOptions(screen.getByLabelText('來源資料表'), 'orders');

      await waitFor(() => {
        expect(screen.getByText('確認變更來源資料表')).toBeInTheDocument();
      });

      // Click the cancel button in the modal (not the form cancel)
      const modal = screen.getByText('確認變更來源資料表').closest('div[class*="fixed"]')!;
      const cancelBtn = within(modal).getByRole('button', { name: '取消' });
      await user.click(cancelBtn);

      await waitFor(() => {
        expect(screen.queryByText('確認變更來源資料表')).not.toBeInTheDocument();
      });

      expect(screen.getByLabelText('來源資料表')).toHaveValue('customers');
    });

    it('TS-F019-FE-010: executionCount = 0 時不顯示警告', async () => {
      const user = userEvent.setup();
      renderPage({ executionCount: 0 });

      await waitFor(() => {
        expect(screen.getByLabelText('來源資料表')).not.toBeDisabled();
      });

      await user.selectOptions(screen.getByLabelText('來源資料表'), 'orders');

      // Modal should NOT appear
      expect(screen.queryByText('確認變更來源資料表')).not.toBeInTheDocument();
      expect(screen.getByLabelText('來源資料表')).toHaveValue('orders');
    });
  });
});
