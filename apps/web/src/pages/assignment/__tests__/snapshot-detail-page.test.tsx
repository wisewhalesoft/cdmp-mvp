import { render, screen, cleanup, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { SnapshotDetailPage } from '../snapshot-detail-page';
import { ToastProvider } from '@/components/ui/toast';
import * as runApi from '@/api/assignment-run';
import * as authStore from '@/stores/auth-store';

vi.mock('@/api/assignment-run');
vi.mock('@/api/auth', () => ({ logout: vi.fn().mockResolvedValue({}) }));
vi.mock('@/stores/auth-store', async () => {
  const actual = await vi.importActual('@/stores/auth-store');
  return {
    ...actual,
    getUser: vi.fn(),
    getBusinessRole: vi.fn(),
    getEffectiveIdentity: vi.fn(),
    clearAuth: vi.fn(),
  };
});

const mockedGetSnapshot = vi.mocked(runApi.getSnapshotByType);
const mockedGetUser = vi.mocked(authStore.getUser);
const mockedGetBusinessRole = vi.mocked(authStore.getBusinessRole);
const mockedGetEffectiveIdentity = vi.mocked(authStore.getEffectiveIdentity);

function renderPage(runId = 'R001', type = 'config') {
  return render(
    <MemoryRouter initialEntries={[`/assignment/snapshots?runId=${runId}&type=${type}`]}>
      <ToastProvider>
        <Routes>
          <Route path="/assignment/snapshots" element={<SnapshotDetailPage />} />
        </Routes>
      </ToastProvider>
    </MemoryRouter>,
  );
}

describe('SnapshotDetailPage (F066)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockedGetUser.mockReturnValue({
      id: 'd1',
      name: 'Director',
      email: 'manager@cdmp.test',
      role: 'user',
      isSalesManager: true,
      businessRole: 'director',
    });
    mockedGetBusinessRole.mockReturnValue('director');
    mockedGetEffectiveIdentity.mockReturnValue('director');
  });

  afterEach(() => cleanup());

  it('3 個 tab (config / input_list / result) 渲染', async () => {
    mockedGetSnapshot.mockResolvedValue({
      runId: 'R001',
      type: 'config',
      data: { listDefinition: 'snapshot' },
    });
    renderPage();
    await waitFor(() => expect(screen.getByTestId('snapshot-data')).toBeInTheDocument());
    expect(screen.getByTestId('snapshot-tab-config')).toBeInTheDocument();
    expect(screen.getByTestId('snapshot-tab-input_list')).toBeInTheDocument();
    expect(screen.getByTestId('snapshot-tab-result')).toBeInTheDocument();
  });

  it('預設載入 config snapshot', async () => {
    mockedGetSnapshot.mockResolvedValue({
      runId: 'R001',
      type: 'config',
      data: { listDefinition: 'foo' },
    });
    renderPage();
    await waitFor(() =>
      expect(mockedGetSnapshot).toHaveBeenCalledWith('R001', 'config'),
    );
    expect(screen.getByTestId('snapshot-json')).toHaveTextContent(/listDefinition/);
  });

  it('點 input_list tab → 重新載入該類型', async () => {
    mockedGetSnapshot.mockResolvedValue({
      runId: 'R001',
      type: 'config',
      data: {},
    });
    renderPage();
    await waitFor(() =>
      expect(screen.getByTestId('snapshot-tab-input_list')).toBeInTheDocument(),
    );
    mockedGetSnapshot.mockResolvedValue({
      runId: 'R001',
      type: 'input_list',
      data: { rows: [] },
    });
    fireEvent.click(screen.getByTestId('snapshot-tab-input_list'));
    await waitFor(() =>
      expect(mockedGetSnapshot).toHaveBeenCalledWith('R001', 'input_list'),
    );
  });

  it('404 顯示「快照不存在」', async () => {
    mockedGetSnapshot.mockRejectedValue({
      response: { status: 404, data: { message: 'not found' } },
    });
    renderPage();
    await waitFor(() =>
      expect(screen.getByTestId('snapshot-error')).toHaveTextContent(/快照不存在/),
    );
  });

  it('缺 runId 顯示錯誤', async () => {
    renderPage('', 'config');
    await waitFor(() =>
      expect(screen.getByTestId('snapshot-error')).toHaveTextContent(/缺少 runId/),
    );
  });
});
