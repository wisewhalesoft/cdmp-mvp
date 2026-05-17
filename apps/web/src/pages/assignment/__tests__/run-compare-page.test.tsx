import { render, screen, cleanup, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { RunComparePage } from '../run-compare-page';
import { ToastProvider } from '@/components/ui/toast';
import * as runApi from '@/api/assignment-run';
import * as authStore from '@/stores/auth-store';
import type { CompareRunsResponse } from '@/api/assignment-run';

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

const mockedCompare = vi.mocked(runApi.compareRuns);
const mockedExport = vi.mocked(runApi.downloadCompareExport);
const mockedGetUser = vi.mocked(authStore.getUser);
const mockedGetBusinessRole = vi.mocked(authStore.getBusinessRole);
const mockedGetEffectiveIdentity = vi.mocked(authStore.getEffectiveIdentity);

const sampleCompare: CompareRunsResponse = {
  runA: 'R001',
  runB: 'R002',
  summary: {
    totalA: 1000,
    totalB: 1100,
    deltaTotal: 100,
    customersAddedCount: 150,
    customersRemovedCount: 50,
    customersChangedAssigneeCount: 200,
  },
  personnelMismatch: [
    { empId: 'E001', empName: '張三', countA: 100, countB: 110, delta: 10 },
  ],
  customerDiff: [
    {
      customerId: 'C001',
      assigneeA: 'E001',
      assigneeB: 'E002',
      diffType: 'reassigned',
    },
  ],
};

function renderPage(runA = 'R001', runB = 'R002') {
  return render(
    <MemoryRouter initialEntries={[`/assignment/compare?runA=${runA}&runB=${runB}`]}>
      <ToastProvider>
        <Routes>
          <Route path="/assignment/compare" element={<RunComparePage />} />
        </Routes>
      </ToastProvider>
    </MemoryRouter>,
  );
}

describe('RunComparePage (F067)', () => {
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

  it('缺 runA/runB 顯示錯誤', async () => {
    renderPage('', '');
    await waitFor(() =>
      expect(screen.getByTestId('compare-error')).toHaveTextContent(/runA/),
    );
  });

  it('渲染 summary 5 卡 + delta', async () => {
    mockedCompare.mockResolvedValue(sampleCompare);
    renderPage();
    await waitFor(() =>
      expect(screen.getByTestId('compare-summary')).toBeInTheDocument(),
    );
    expect(screen.getByTestId('delta-total')).toHaveTextContent('+100');
    expect(screen.getByTestId('reassigned-count')).toHaveTextContent('200');
  });

  it('渲染 personnelMismatch + customerDiff 表', async () => {
    mockedCompare.mockResolvedValue(sampleCompare);
    renderPage();
    await waitFor(() =>
      expect(screen.getByTestId('personnel-mismatch')).toBeInTheDocument(),
    );
    expect(screen.getByTestId('customer-diff')).toBeInTheDocument();
    expect(screen.getByText('C001')).toBeInTheDocument();
  });

  it('匯出 XLSX 呼叫 downloadCompareExport(runA, runB)', async () => {
    mockedCompare.mockResolvedValue(sampleCompare);
    mockedExport.mockResolvedValue();
    renderPage();
    await waitFor(() =>
      expect(screen.getByTestId('btn-export-compare')).toBeInTheDocument(),
    );
    fireEvent.click(screen.getByTestId('btn-export-compare'));
    await waitFor(() =>
      expect(mockedExport).toHaveBeenCalledWith('R001', 'R002'),
    );
  });
});
