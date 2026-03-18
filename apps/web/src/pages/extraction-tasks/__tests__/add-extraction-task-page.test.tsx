import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { BrowserRouter } from 'react-router-dom';
import { AddExtractionTaskPage } from '../add-extraction-task-page';
import * as extractionTasksApi from '@/api/extraction-tasks';
import * as authStore from '@/stores/auth-store';
import { ToastProvider } from '@/components/ui/toast';

vi.mock('@/api/extraction-tasks');
vi.mock('@/api/auth', () => ({
  logout: vi.fn().mockResolvedValue({}),
}));

const mockedCreateExtractionTask = vi.mocked(extractionTasksApi.createExtractionTask);
const mockedGetDatasourceOptions = vi.mocked(extractionTasksApi.getDatasourceOptions);

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

function renderPage() {
  vi.spyOn(authStore, 'getUser').mockReturnValue({
    id: 'admin-1',
    name: 'Admin',
    email: 'admin@test.com',
    role: 'admin',
  });

  mockedGetDatasourceOptions.mockResolvedValue(MOCK_DATASOURCES);

  return render(
    <BrowserRouter>
      <ToastProvider>
        <AddExtractionTaskPage />
      </ToastProvider>
    </BrowserRouter>,
  );
}

describe('AddExtractionTaskPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('渲染測試', () => {
    it('顯示所有表單欄位', async () => {
      renderPage();

      expect(screen.getByLabelText('任務名稱')).toBeInTheDocument();
      expect(screen.getByLabelText('資料來源')).toBeInTheDocument();
      expect(screen.getByLabelText('目標資料表')).toBeInTheDocument();

      // 擷取模式 radio cards
      expect(screen.getByText('全量')).toBeInTheDocument();
      expect(screen.getByText('增量')).toBeInTheDocument();

      // 排程設定
      expect(screen.getByText('排程設定')).toBeInTheDocument();
    });

    it('顯示 Breadcrumb 導航', () => {
      renderPage();
      const breadcrumb = screen.getByLabelText('breadcrumb');
      expect(breadcrumb).toBeInTheDocument();
      expect(breadcrumb).toHaveTextContent('資料擷取');
      expect(breadcrumb).toHaveTextContent('新增擷取任務');
    });

    it('顯示取消與建立按鈕', () => {
      renderPage();
      expect(screen.getByRole('button', { name: '取消' })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: '建立任務' })).toBeInTheDocument();
    });

    it('載入資料來源選項', async () => {
      renderPage();
      await waitFor(() => {
        expect(mockedGetDatasourceOptions).toHaveBeenCalled();
      });
      const select = screen.getByLabelText('資料來源');
      const options = within(select).getAllByRole('option');
      // placeholder + 2 datasources
      expect(options).toHaveLength(3);
      expect(options[1]).toHaveTextContent('MySQL 主資料庫 (mysql)');
      expect(options[2]).toHaveTextContent('PostgreSQL 分析庫 (postgresql)');
    });

    it('預設擷取模式為全量', () => {
      renderPage();
      const fullRadio = screen.getByDisplayValue('full') as HTMLInputElement;
      expect(fullRadio.checked).toBe(true);
    });

    it('預設排程為簡易模式', () => {
      renderPage();
      expect(screen.getByText('切換至進階模式 (Cron 表達式) →')).toBeInTheDocument();
      expect(screen.getByLabelText('頻率')).toBeInTheDocument();
    });
  });

  describe('排程設定 — 簡易模式', () => {
    it('選擇每小時頻率顯示間隔選項', async () => {
      const user = userEvent.setup();
      renderPage();
      await user.selectOptions(screen.getByLabelText('頻率'), 'hourly');
      expect(screen.getByLabelText('每隔')).toBeInTheDocument();
    });

    it('選擇每日頻率顯示時間選擇', async () => {
      const user = userEvent.setup();
      renderPage();
      await user.selectOptions(screen.getByLabelText('頻率'), 'daily');
      expect(screen.getByLabelText('時')).toBeInTheDocument();
      expect(screen.getByLabelText('分')).toBeInTheDocument();
    });

    it('選擇每週頻率顯示星期選擇', async () => {
      const user = userEvent.setup();
      renderPage();
      await user.selectOptions(screen.getByLabelText('頻率'), 'weekly');
      expect(screen.getByText('一')).toBeInTheDocument();
      expect(screen.getByText('日')).toBeInTheDocument();
    });

    it('選擇每月頻率顯示日期選擇', async () => {
      const user = userEvent.setup();
      renderPage();
      await user.selectOptions(screen.getByLabelText('頻率'), 'monthly');
      expect(screen.getByLabelText('每月第幾日')).toBeInTheDocument();
    });

    it('選擇每日後顯示 cron 預覽', async () => {
      const user = userEvent.setup();
      renderPage();
      await user.selectOptions(screen.getByLabelText('頻率'), 'daily');
      // default hour=02, min=00
      await waitFor(() => {
        expect(screen.getByTestId('cron-preview')).toHaveTextContent('每日 02:00 執行 (UTC+8)');
      });
    });

    it('選擇每小時間隔產生正確 cron', async () => {
      const user = userEvent.setup();
      renderPage();
      await user.selectOptions(screen.getByLabelText('頻率'), 'hourly');
      await user.selectOptions(screen.getByLabelText('每隔'), '3');
      await waitFor(() => {
        expect(screen.getByTestId('cron-preview')).toHaveTextContent('每 3 小時執行 (UTC+8)');
      });
    });
  });

  describe('排程設定 — 進階模式', () => {
    it('切換至進階模式顯示 cron 輸入框', async () => {
      const user = userEvent.setup();
      renderPage();
      await user.click(screen.getByText('切換至進階模式 (Cron 表達式) →'));
      expect(screen.getByPlaceholderText('例如：0 2 * * *')).toBeInTheDocument();
      expect(screen.getByText('格式：分 時 日 月 星期（5 個欄位，以空格分隔）')).toBeInTheDocument();
    });

    it('切換回簡易模式', async () => {
      const user = userEvent.setup();
      renderPage();
      await user.click(screen.getByText('切換至進階模式 (Cron 表達式) →'));
      expect(screen.getByText('← 切換至簡易模式')).toBeInTheDocument();
      await user.click(screen.getByText('← 切換至簡易模式'));
      expect(screen.getByLabelText('頻率')).toBeInTheDocument();
    });

    it('進階模式輸入 cron 顯示預覽', async () => {
      const user = userEvent.setup();
      renderPage();
      await user.click(screen.getByText('切換至進階模式 (Cron 表達式) →'));
      const cronInput = screen.getByPlaceholderText('例如：0 2 * * *');
      await user.type(cronInput, '0 2 * * *');
      await waitFor(() => {
        expect(screen.getByTestId('cron-preview')).toHaveTextContent('每日 02:00 執行 (UTC+8)');
      });
    });
  });

  describe('擷取模式切換', () => {
    it('選擇增量模式顯示增量欄位', async () => {
      const user = userEvent.setup();
      renderPage();
      await user.click(screen.getByText('增量'));
      await waitFor(() => {
        expect(screen.getByLabelText('增量欄位')).toBeInTheDocument();
      });
      expect(screen.getByLabelText('增量起始值')).toBeInTheDocument();
    });

    it('切回全量模式隱藏增量欄位', async () => {
      const user = userEvent.setup();
      renderPage();
      // switch to incremental
      await user.click(screen.getByText('增量'));
      await waitFor(() => {
        expect(screen.getByLabelText('增量欄位')).toBeInTheDocument();
      });
      // switch back to full
      await user.click(screen.getByText('全量'));
      await waitFor(() => {
        expect(screen.queryByLabelText('增量欄位')).not.toBeInTheDocument();
      });
    });
  });

  describe('必填欄位驗證', () => {
    it('空白提交顯示必填錯誤', async () => {
      const user = userEvent.setup();
      renderPage();
      await user.click(screen.getByRole('button', { name: '建立任務' }));

      expect(await screen.findByText('請輸入任務名稱')).toBeInTheDocument();
      expect(screen.getByText('請選擇資料來源')).toBeInTheDocument();
      expect(screen.getByText('請輸入目標資料表')).toBeInTheDocument();
      expect(screen.getByText('請設定排程')).toBeInTheDocument();
    });

    it('增量模式未填增量欄位顯示錯誤', async () => {
      const user = userEvent.setup();
      renderPage();
      await user.click(screen.getByText('增量'));
      await user.click(screen.getByRole('button', { name: '建立任務' }));

      expect(await screen.findByText('增量模式必須指定增量欄位')).toBeInTheDocument();
    });
  });

  describe('成功提交', () => {
    async function fillForm(user: ReturnType<typeof userEvent.setup>) {
      // Wait for datasources to load
      await waitFor(() => {
        expect(mockedGetDatasourceOptions).toHaveBeenCalled();
      });

      await user.type(screen.getByLabelText('任務名稱'), '每日全量同步');
      await user.selectOptions(screen.getByLabelText('資料來源'), 'ds-1');
      // mode defaults to full
      await user.type(screen.getByLabelText('目標資料表'), 'customers');

      // Set schedule via simple mode - daily
      await user.selectOptions(screen.getByLabelText('頻率'), 'daily');
    }

    it('成功後顯示 Toast 並導向 /extraction-tasks', async () => {
      const user = userEvent.setup();
      mockedCreateExtractionTask.mockResolvedValue({
        id: 'et-1',
        name: '每日全量同步',
        datasourceId: 'ds-1',
        datasourceName: 'MySQL 主資料庫',
        mode: 'full',
        status: 'scheduled',
        targetTable: 'customers',
        incrementalColumn: null,
        lastIncrementalValue: null,
        schedule: '0 2 * * *',
        enabled: true,
        lastExecutionAt: null,
        extractedCount: 0,
        totalCount: 0,
        progressPercent: 0,
        avgDurationMs: 0,
        executionCount: 0,
        errorMessage: null,
        createdBy: 'admin-1',
        createdAt: '2026-01-01T00:00:00Z',
        updatedAt: '2026-01-01T00:00:00Z',
      });
      renderPage();
      await fillForm(user);
      await user.click(screen.getByRole('button', { name: '建立任務' }));

      await waitFor(() => {
        expect(screen.getByText('擷取任務已建立')).toBeInTheDocument();
      });
      expect(mockNavigate).toHaveBeenCalledWith('/extraction-tasks', { replace: true });
    });

    it('提交時呼叫 createExtractionTask API 帶正確參數', async () => {
      const user = userEvent.setup();
      mockedCreateExtractionTask.mockResolvedValue({
        id: 'et-1',
        name: '每日全量同步',
        datasourceId: 'ds-1',
        datasourceName: 'MySQL 主資料庫',
        mode: 'full',
        status: 'scheduled',
        targetTable: 'customers',
        incrementalColumn: null,
        lastIncrementalValue: null,
        schedule: '0 2 * * *',
        enabled: true,
        lastExecutionAt: null,
        extractedCount: 0,
        totalCount: 0,
        progressPercent: 0,
        avgDurationMs: 0,
        executionCount: 0,
        errorMessage: null,
        createdBy: 'admin-1',
        createdAt: '2026-01-01T00:00:00Z',
        updatedAt: '2026-01-01T00:00:00Z',
      });
      renderPage();
      await fillForm(user);
      await user.click(screen.getByRole('button', { name: '建立任務' }));

      await waitFor(() => {
        expect(mockedCreateExtractionTask).toHaveBeenCalledWith({
          name: '每日全量同步',
          datasourceId: 'ds-1',
          mode: 'full',
          targetTable: 'customers',
          schedule: '0 2 * * *',
          incrementalColumn: undefined,
          lastIncrementalValue: undefined,
        });
      });
    });

    it('提交時按鈕顯示 loading 狀態', async () => {
      const user = userEvent.setup();
      mockedCreateExtractionTask.mockImplementation(() => new Promise(() => {}));
      renderPage();
      await fillForm(user);
      await user.click(screen.getByRole('button', { name: '建立任務' }));

      await waitFor(() => {
        expect(screen.getByRole('button', { name: '處理中...' })).toBeDisabled();
      });
    });
  });

  describe('錯誤處理', () => {
    async function fillForm(user: ReturnType<typeof userEvent.setup>) {
      await waitFor(() => {
        expect(mockedGetDatasourceOptions).toHaveBeenCalled();
      });
      await user.type(screen.getByLabelText('任務名稱'), '每日全量同步');
      await user.selectOptions(screen.getByLabelText('資料來源'), 'ds-1');
      await user.type(screen.getByLabelText('目標資料表'), 'customers');
      await user.selectOptions(screen.getByLabelText('頻率'), 'daily');
    }

    it('409 名稱重複顯示 error Toast', async () => {
      const user = userEvent.setup();
      mockedCreateExtractionTask.mockRejectedValue({
        response: { status: 409, data: { error: 'EXTRACTION_NAME_EXISTS', message: '此名稱的擷取任務已存在' } },
      });
      renderPage();
      await fillForm(user);
      await user.click(screen.getByRole('button', { name: '建立任務' }));

      await waitFor(() => {
        expect(screen.getByText('此名稱的擷取任務已存在')).toBeInTheDocument();
      });
    });

    it('未知錯誤顯示通用 error Toast', async () => {
      const user = userEvent.setup();
      mockedCreateExtractionTask.mockRejectedValue({
        response: { status: 500 },
      });
      renderPage();
      await fillForm(user);
      await user.click(screen.getByRole('button', { name: '建立任務' }));

      await waitFor(() => {
        expect(screen.getByText('發生未知錯誤，請稍後再試')).toBeInTheDocument();
      });
    });
  });

  describe('互動行為', () => {
    it('點擊取消導向 /extraction-tasks', async () => {
      const user = userEvent.setup();
      renderPage();
      await user.click(screen.getByRole('button', { name: '取消' }));
      expect(mockNavigate).toHaveBeenCalledWith('/extraction-tasks', { replace: true });
    });
  });
});
