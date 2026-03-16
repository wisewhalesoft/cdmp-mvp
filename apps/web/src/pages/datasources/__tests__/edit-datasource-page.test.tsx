import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { EditDatasourcePage } from '../edit-datasource-page';
import * as datasourcesApi from '@/api/datasources';
import * as authStore from '@/stores/auth-store';
import { ToastProvider } from '@/components/ui/toast';

vi.mock('@/api/datasources');
vi.mock('@/api/auth', () => ({
  logout: vi.fn().mockResolvedValue({}),
}));

const mockedGetDatasource = vi.mocked(datasourcesApi.getDatasource);
const mockedUpdateDatasource = vi.mocked(datasourcesApi.updateDatasource);

const mockNavigate = vi.fn();
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom');
  return {
    ...actual,
    useNavigate: () => mockNavigate,
  };
});

const mockDatasource = {
  id: 'ds-123',
  name: 'MySQL Production',
  type: 'mysql' as const,
  host: '192.168.1.100',
  port: 3306,
  databaseName: 'prod_db',
  username: 'db_admin',
  description: 'Production MySQL server',
  status: 'connected',
  lastTestedAt: '2026-01-15T00:00:00Z',
  createdAt: '2026-01-01T00:00:00Z',
  updatedAt: '2026-01-10T00:00:00Z',
};

function renderPage() {
  vi.spyOn(authStore, 'getUser').mockReturnValue({
    id: 'admin-1',
    name: 'Admin',
    email: 'admin@test.com',
    role: 'admin',
  });

  return render(
    <MemoryRouter initialEntries={['/datasources/ds-123/edit']}>
      <ToastProvider>
        <Routes>
          <Route path="/datasources/:id/edit" element={<EditDatasourcePage />} />
        </Routes>
      </ToastProvider>
    </MemoryRouter>,
  );
}

describe('EditDatasourcePage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockedGetDatasource.mockResolvedValue(mockDatasource);
  });

  describe('載入與預填', () => {
    it('載入時顯示載入狀態', () => {
      mockedGetDatasource.mockImplementation(() => new Promise(() => {}));
      renderPage();
      expect(screen.getByText('載入中...')).toBeInTheDocument();
    });

    it('預填現有資料（密碼欄位除外）', async () => {
      renderPage();

      await waitFor(() => {
        expect(screen.getByLabelText('名稱')).toHaveValue('MySQL Production');
      });
      expect(screen.getByLabelText('類型')).toHaveValue('mysql');
      expect(screen.getByLabelText('主機位址')).toHaveValue('192.168.1.100');
      expect(screen.getByLabelText('連接埠')).toHaveValue(3306);
      expect(screen.getByLabelText('資料庫名稱')).toHaveValue('prod_db');
      expect(screen.getByLabelText('使用者名稱')).toHaveValue('db_admin');
      expect(screen.getByLabelText('描述')).toHaveValue('Production MySQL server');
    });

    it('密碼欄位為空且 placeholder 為「留空以保留現有密碼」', async () => {
      renderPage();

      await waitFor(() => {
        expect(screen.getByLabelText('名稱')).toHaveValue('MySQL Production');
      });
      const passwordInput = screen.getByPlaceholderText('留空以保留現有密碼');
      expect(passwordInput).toBeInTheDocument();
      expect(passwordInput).toHaveValue('');
    });

    it('密碼欄位標籤無紅色必填星號', async () => {
      renderPage();

      await waitFor(() => {
        expect(screen.getByLabelText('名稱')).toHaveValue('MySQL Production');
      });
      // The password label should just be "密碼" without a required indicator
      const passwordLabel = screen.getByText('密碼');
      expect(passwordLabel.querySelector('.text-danger-600, .text-red-500')).toBeNull();
    });
  });

  describe('Breadcrumb 與佈局', () => {
    it('顯示 Breadcrumb 「資料來源 > 編輯資料來源」', async () => {
      renderPage();

      await waitFor(() => {
        expect(screen.getByLabelText('名稱')).toHaveValue('MySQL Production');
      });
      const breadcrumb = screen.getByLabelText('breadcrumb');
      expect(breadcrumb).toHaveTextContent('編輯資料來源');
    });
  });

  describe('按鈕列', () => {
    it('顯示取消、測試連線（disabled）、儲存按鈕', async () => {
      renderPage();

      await waitFor(() => {
        expect(screen.getByLabelText('名稱')).toHaveValue('MySQL Production');
      });
      expect(screen.getByRole('button', { name: '取消' })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /測試連線/ })).toBeDisabled();
      expect(screen.getByRole('button', { name: '儲存' })).toBeInTheDocument();
    });
  });

  describe('成功提交', () => {
    it('提交成功後顯示 Toast 並導向 /datasources', async () => {
      const user = userEvent.setup();
      mockedUpdateDatasource.mockResolvedValue({
        ...mockDatasource,
        host: 'new-host.com',
        status: 'unknown',
      });
      renderPage();

      await waitFor(() => {
        expect(screen.getByLabelText('名稱')).toHaveValue('MySQL Production');
      });

      // Modify a field and submit
      const hostInput = screen.getByLabelText('主機位址');
      await user.clear(hostInput);
      await user.type(hostInput, 'new-host.com');
      await user.click(screen.getByRole('button', { name: '儲存' }));

      await waitFor(() => {
        expect(screen.getByText('資料來源已更新')).toBeInTheDocument();
      });
      expect(mockNavigate).toHaveBeenCalledWith('/datasources', { replace: true });
    });

    it('提交時按鈕顯示「處理中...」且 disabled', async () => {
      const user = userEvent.setup();
      mockedUpdateDatasource.mockImplementation(() => new Promise(() => {}));
      renderPage();

      await waitFor(() => {
        expect(screen.getByLabelText('名稱')).toHaveValue('MySQL Production');
      });

      await user.click(screen.getByRole('button', { name: '儲存' }));

      await waitFor(() => {
        expect(screen.getByRole('button', { name: '處理中...' })).toBeDisabled();
      });
    });

    it('密碼為空時不傳送密碼欄位', async () => {
      const user = userEvent.setup();
      mockedUpdateDatasource.mockResolvedValue({ ...mockDatasource, status: 'unknown' });
      renderPage();

      await waitFor(() => {
        expect(screen.getByLabelText('名稱')).toHaveValue('MySQL Production');
      });

      await user.click(screen.getByRole('button', { name: '儲存' }));

      await waitFor(() => {
        expect(mockedUpdateDatasource).toHaveBeenCalledWith('ds-123', expect.objectContaining({
          name: 'MySQL Production',
          type: 'mysql',
          host: '192.168.1.100',
          port: 3306,
        }));
        // password should be undefined or not present
        const calledPayload = mockedUpdateDatasource.mock.calls[0][1];
        expect(calledPayload.password).toBeUndefined();
      });
    });
  });

  describe('錯誤處理', () => {
    it('409 名稱重複顯示 error Toast', async () => {
      const user = userEvent.setup();
      mockedUpdateDatasource.mockRejectedValue({
        response: { status: 409, data: { error: 'DS_NAME_EXISTS', message: '此名稱的資料來源已存在' } },
      });
      renderPage();

      await waitFor(() => {
        expect(screen.getByLabelText('名稱')).toHaveValue('MySQL Production');
      });

      await user.click(screen.getByRole('button', { name: '儲存' }));

      await waitFor(() => {
        expect(screen.getByText('此名稱的資料來源已存在')).toBeInTheDocument();
      });
    });

    it('未知錯誤顯示通用 error Toast', async () => {
      const user = userEvent.setup();
      mockedUpdateDatasource.mockRejectedValue({
        response: { status: 500 },
      });
      renderPage();

      await waitFor(() => {
        expect(screen.getByLabelText('名稱')).toHaveValue('MySQL Production');
      });

      await user.click(screen.getByRole('button', { name: '儲存' }));

      await waitFor(() => {
        expect(screen.getByText('發生未知錯誤，請稍後再試')).toBeInTheDocument();
      });
    });
  });

  describe('互動行為', () => {
    it('點擊取消導向 /datasources', async () => {
      const user = userEvent.setup();
      renderPage();

      await waitFor(() => {
        expect(screen.getByLabelText('名稱')).toHaveValue('MySQL Production');
      });

      await user.click(screen.getByRole('button', { name: '取消' }));
      expect(mockNavigate).toHaveBeenCalledWith('/datasources', { replace: true });
    });

    it('切換類型後 port 自動更新為預設值', async () => {
      const user = userEvent.setup();
      renderPage();

      await waitFor(() => {
        expect(screen.getByLabelText('名稱')).toHaveValue('MySQL Production');
      });

      // Initially mysql: port=3306. Switch to postgresql.
      await user.selectOptions(screen.getByLabelText('類型'), 'postgresql');
      expect(screen.getByLabelText('連接埠')).toHaveValue(5432);
    });

    it('密碼可見切換', async () => {
      const user = userEvent.setup();
      renderPage();

      await waitFor(() => {
        expect(screen.getByLabelText('名稱')).toHaveValue('MySQL Production');
      });

      const passwordInput = screen.getByPlaceholderText('留空以保留現有密碼');
      expect(passwordInput).toHaveAttribute('type', 'password');

      await user.click(screen.getByRole('button', { name: '顯示密碼' }));
      expect(passwordInput).toHaveAttribute('type', 'text');
    });
  });
});
