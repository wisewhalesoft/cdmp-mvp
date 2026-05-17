import { render, screen, cleanup, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { RunSummaryPage } from '../run-summary-page';
import { ToastProvider } from '@/components/ui/toast';
import * as runApi from '@/api/assignment-run';
import * as authStore from '@/stores/auth-store';
import type { RunSummaryResponse } from '@/api/assignment-run';

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

const mockedGetSummary = vi.mocked(runApi.getRunSummary);
const mockedExport = vi.mocked(runApi.downloadRunExport);
const mockedGetUser = vi.mocked(authStore.getUser);
const mockedGetBusinessRole = vi.mocked(authStore.getBusinessRole);
const mockedGetEffectiveIdentity = vi.mocked(authStore.getEffectiveIdentity);

const sampleSummary: RunSummaryResponse = {
  runId: 'R001',
  ym: '202605',
  totalAssigned: 1234,
  deptBreakdown: [
    { deptCode: 'D001', deptName: '業務一部', assignedCount: 700, ratio: 0.57 },
    { deptCode: 'D002', deptName: '業務二部', assignedCount: 534, ratio: 0.43 },
  ],
  personnelBreakdown: [
    { empId: 'E001', empName: '張三', assignedCount: 100, ratio: 0.08 },
  ],
};

function renderPage(runId = 'R001') {
  return render(
    <MemoryRouter initialEntries={[`/assignment/run-summary?runId=${runId}`]}>
      <ToastProvider>
        <Routes>
          <Route path="/assignment/run-summary" element={<RunSummaryPage />} />
        </Routes>
      </ToastProvider>
    </MemoryRouter>,
  );
}

describe('RunSummaryPage (F063)', () => {
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

  it('runId 缺失顯示錯誤', async () => {
    renderPage('');
    await waitFor(() =>
      expect(screen.getByTestId('summary-error')).toHaveTextContent(/缺少 runId/),
    );
  });

  it('顯示總分派數 + dept + personnel breakdown', async () => {
    mockedGetSummary.mockResolvedValue(sampleSummary);
    renderPage();
    await waitFor(() =>
      expect(screen.getByTestId('total-assigned')).toHaveTextContent('1,234'),
    );
    expect(screen.getByTestId('dept-breakdown')).toBeInTheDocument();
    expect(screen.getByTestId('personnel-breakdown')).toBeInTheDocument();
    expect(screen.getByText('D001')).toBeInTheDocument();
    expect(screen.getByText('E001')).toBeInTheDocument();
  });

  it('CSV 匯出按鈕呼叫 downloadRunExport(csv)', async () => {
    mockedGetSummary.mockResolvedValue(sampleSummary);
    mockedExport.mockResolvedValue();
    renderPage();
    await waitFor(() => expect(screen.getByTestId('btn-export-csv')).toBeInTheDocument());
    fireEvent.click(screen.getByTestId('btn-export-csv'));
    await waitFor(() =>
      expect(mockedExport).toHaveBeenCalledWith('R001', 'csv'),
    );
  });

  it('XLSX 匯出按鈕呼叫 downloadRunExport(xlsx)', async () => {
    mockedGetSummary.mockResolvedValue(sampleSummary);
    mockedExport.mockResolvedValue();
    renderPage();
    await waitFor(() => expect(screen.getByTestId('btn-export-xlsx')).toBeInTheDocument());
    fireEvent.click(screen.getByTestId('btn-export-xlsx'));
    await waitFor(() =>
      expect(mockedExport).toHaveBeenCalledWith('R001', 'xlsx'),
    );
  });
});
