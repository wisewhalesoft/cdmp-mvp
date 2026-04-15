import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { BrowserRouter } from 'react-router-dom';
import { AddDatasourcePage } from '../add-datasource-page';
import * as datasourcesApi from '@/api/datasources';
import * as authStore from '@/stores/auth-store';
import { ToastProvider } from '@/components/ui/toast';

vi.mock('@/api/datasources');
vi.mock('@/api/auth', () => ({
  logout: vi.fn().mockResolvedValue({}),
}));

const mockedCreateDatasource = vi.mocked(datasourcesApi.createDatasource);

const mockNavigate = vi.fn();
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom');
  return {
    ...actual,
    useNavigate: () => mockNavigate,
  };
});

function renderPage() {
  vi.spyOn(authStore, 'getUser').mockReturnValue({
    id: 'admin-1',
    name: 'Admin',
    email: 'admin@test.com',
    role: 'admin',
  });

  return render(
    <BrowserRouter>
      <ToastProvider>
        <AddDatasourcePage />
      </ToastProvider>
    </BrowserRouter>,
  );
}

describe('AddDatasourcePage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('渲染測試', () => {
    it('顯示所有表單欄位', () => {
      renderPage();
      expect(screen.getByLabelText('名稱')).toBeInTheDocument();
      expect(screen.getByLabelText('類型')).toBeInTheDocument();
      expect(screen.getByLabelText('主機位址')).toBeInTheDocument();
      expect(screen.getByLabelText('連接埠')).toBeInTheDocument();
      expect(screen.getByLabelText('資料庫名稱')).toBeInTheDocument();
      expect(screen.getByLabelText('使用者名稱')).toBeInTheDocument();
      expect(screen.getByLabelText('密碼')).toBeInTheDocument();
      expect(screen.getByLabelText('描述')).toBeInTheDocument();
    });

    it('顯示 Breadcrumb 導航', () => {
      renderPage();
      const breadcrumb = screen.getByLabelText('breadcrumb');
      expect(breadcrumb).toBeInTheDocument();
      expect(breadcrumb).toHaveTextContent('新增資料來源');
    });

    it('顯示取消與新增按鈕', () => {
      renderPage();
      expect(screen.getByRole('button', { name: '取消' })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: '新增資料來源' })).toBeInTheDocument();
    });

    it('密碼欄位顯示加密儲存提示', () => {
      renderPage();
      expect(screen.getByText('此密碼將以加密方式儲存')).toBeInTheDocument();
    });

    it('描述欄位顯示 placeholder', () => {
      renderPage();
      expect(screen.getByPlaceholderText('選填，最多 500 字')).toBeInTheDocument();
    });

    it('Sidebar 資料來源為 active 狀態', () => {
      renderPage();
      const sidebarNav = document.querySelector('aside nav');
      const datasourceLink = sidebarNav?.querySelector('a[href="/datasources/new"]');
      expect(datasourceLink).toHaveClass('text-[#2563EB]');
    });
  });

  describe('類型選擇自動帶入 port', () => {
    it('選擇 MySQL 自動帶入 3306', async () => {
      const user = userEvent.setup();
      renderPage();
      await user.selectOptions(screen.getByLabelText('類型'), 'mysql');
      expect(screen.getByLabelText('連接埠')).toHaveValue(3306);
    });

    it('選擇 PostgreSQL 自動帶入 5432', async () => {
      const user = userEvent.setup();
      renderPage();
      await user.selectOptions(screen.getByLabelText('類型'), 'postgresql');
      expect(screen.getByLabelText('連接埠')).toHaveValue(5432);
    });

    it('選擇 SQL Server 自動帶入 1433', async () => {
      const user = userEvent.setup();
      renderPage();
      await user.selectOptions(screen.getByLabelText('類型'), 'sqlserver');
      expect(screen.getByLabelText('連接埠')).toHaveValue(1433);
    });
  });

  describe('必填欄位驗證', () => {
    it('空白提交顯示必填錯誤', async () => {
      const user = userEvent.setup();
      renderPage();
      await user.click(screen.getByRole('button', { name: '新增資料來源' }));

      expect(await screen.findByText('請輸入資料來源名稱')).toBeInTheDocument();
      expect(screen.getByText('請選擇資料來源類型')).toBeInTheDocument();
      expect(screen.getByText('請輸入主機位址')).toBeInTheDocument();
      expect(screen.getByText('請輸入資料庫名稱')).toBeInTheDocument();
      expect(screen.getByText('請輸入使用者名稱')).toBeInTheDocument();
      expect(screen.getByText('請輸入密碼')).toBeInTheDocument();
    });
  });

  describe('成功提交', () => {
    async function fillForm(user: ReturnType<typeof userEvent.setup>) {
      await user.type(screen.getByLabelText('名稱'), 'Test DB');
      await user.selectOptions(screen.getByLabelText('類型'), 'mysql');
      await user.type(screen.getByLabelText('主機位址'), 'localhost');
      // port auto-filled to 3306
      await user.type(screen.getByLabelText('資料庫名稱'), 'testdb');
      await user.type(screen.getByLabelText('使用者名稱'), 'root');
      await user.type(screen.getByLabelText('密碼'), 'secret123');
    }

    it('成功後顯示 Toast 並導向 /datasources', async () => {
      const user = userEvent.setup();
      mockedCreateDatasource.mockResolvedValue({
        id: 'ds-1',
        name: 'Test DB',
        type: 'mysql',
        host: 'localhost',
        port: 3306,
        databaseName: 'testdb',
        username: 'root',
        description: null,
        status: 'active',
        lastTestedAt: null,
        createdAt: '2026-01-01T00:00:00Z',
        updatedAt: '2026-01-01T00:00:00Z',
      });
      renderPage();
      await fillForm(user);
      await user.click(screen.getByRole('button', { name: '新增資料來源' }));

      await waitFor(() => {
        expect(screen.getByText('資料來源已新增')).toBeInTheDocument();
      });
      expect(mockNavigate).toHaveBeenCalledWith('/datasources', { replace: true });
    });

    it('提交時呼叫 createDatasource API 帶正確參數', async () => {
      const user = userEvent.setup();
      mockedCreateDatasource.mockResolvedValue({
        id: 'ds-1',
        name: 'Test DB',
        type: 'mysql',
        host: 'localhost',
        port: 3306,
        databaseName: 'testdb',
        username: 'root',
        description: null,
        status: 'active',
        lastTestedAt: null,
        createdAt: '2026-01-01T00:00:00Z',
        updatedAt: '2026-01-01T00:00:00Z',
      });
      renderPage();
      await fillForm(user);
      await user.click(screen.getByRole('button', { name: '新增資料來源' }));

      await waitFor(() => {
        expect(mockedCreateDatasource).toHaveBeenCalledWith({
          name: 'Test DB',
          type: 'mysql',
          host: 'localhost',
          port: 3306,
          databaseName: 'testdb',
          username: 'root',
          password: 'secret123',
          description: undefined,
        });
      });
    });

    it('提交時按鈕顯示 loading 狀態', async () => {
      const user = userEvent.setup();
      mockedCreateDatasource.mockImplementation(() => new Promise(() => {}));
      renderPage();
      await fillForm(user);
      await user.click(screen.getByRole('button', { name: '新增資料來源' }));

      await waitFor(() => {
        expect(screen.getByRole('button', { name: '新增中...' })).toBeDisabled();
      });
    });
  });

  describe('錯誤處理', () => {
    async function fillForm(user: ReturnType<typeof userEvent.setup>) {
      await user.type(screen.getByLabelText('名稱'), 'Existing DB');
      await user.selectOptions(screen.getByLabelText('類型'), 'postgresql');
      await user.type(screen.getByLabelText('主機位址'), 'localhost');
      await user.type(screen.getByLabelText('資料庫名稱'), 'mydb');
      await user.type(screen.getByLabelText('使用者名稱'), 'admin');
      await user.type(screen.getByLabelText('密碼'), 'password');
    }

    it('409 名稱重複顯示 error Toast', async () => {
      const user = userEvent.setup();
      mockedCreateDatasource.mockRejectedValue({
        response: { status: 409, data: { error: 'DS_NAME_EXISTS', message: '相同資料庫下已存在此名稱的資料來源' } },
      });
      renderPage();
      await fillForm(user);
      await user.click(screen.getByRole('button', { name: '新增資料來源' }));

      await waitFor(() => {
        expect(screen.getByText('相同資料庫下已存在此名稱的資料來源')).toBeInTheDocument();
      });
    });

    it('未知錯誤顯示通用 error Toast', async () => {
      const user = userEvent.setup();
      mockedCreateDatasource.mockRejectedValue({
        response: { status: 500 },
      });
      renderPage();
      await fillForm(user);
      await user.click(screen.getByRole('button', { name: '新增資料來源' }));

      await waitFor(() => {
        expect(screen.getByText('發生未知錯誤，請稍後再試')).toBeInTheDocument();
      });
    });
  });

  describe('互動行為', () => {
    it('點擊取消導向 /datasources', async () => {
      const user = userEvent.setup();
      renderPage();
      await user.click(screen.getByRole('button', { name: '取消' }));
      expect(mockNavigate).toHaveBeenCalledWith('/datasources', { replace: true });
    });

    it('密碼可見切換', async () => {
      const user = userEvent.setup();
      renderPage();
      const passwordInput = screen.getByLabelText('密碼');
      expect(passwordInput).toHaveAttribute('type', 'password');

      await user.click(screen.getByRole('button', { name: '顯示密碼' }));
      expect(passwordInput).toHaveAttribute('type', 'text');

      await user.click(screen.getByRole('button', { name: '隱藏密碼' }));
      expect(passwordInput).toHaveAttribute('type', 'password');
    });
  });
});
