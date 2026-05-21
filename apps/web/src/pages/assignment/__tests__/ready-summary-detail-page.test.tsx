import { render, screen, cleanup, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { ReadySummaryDetailPage } from '../ready-summary-detail-page';
import { ToastProvider } from '@/components/ui/toast';
import * as assignmentListApi from '@/api/assignment-list';
import * as assignmentStageApi from '@/api/assignment-stage';
import * as authStore from '@/stores/auth-store';
import type { AssignmentListItem, ListListsResponse } from '@/api/assignment-list';

/**
 * 29d 模式 B：單一 ready 名單詳情頁面測試
 *
 * 對應 prototype 29d-ready-summary.html L243-362
 */

vi.mock('@/api/assignment-list');
vi.mock('@/api/assignment-stage');
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

const mockedListLists = vi.mocked(assignmentListApi.listLists);
const mockedGetDeptRatios = vi.mocked(assignmentStageApi.getDeptRatios);
const mockedGetPersonnelRatios = vi.mocked(assignmentStageApi.getPersonnelRatios);
const mockedGetApprovalHistory = vi.mocked(assignmentStageApi.getApprovalHistory);
const mockedRollbackApproval = vi.mocked(assignmentStageApi.rollbackToApproval);
const mockedGetUser = vi.mocked(authStore.getUser);
const mockedGetBusinessRole = vi.mocked(authStore.getBusinessRole);

const list: AssignmentListItem = {
  listNo: 'OB202605002',
  listNm: '2026-05 業務二部 主力催收',
  prodKind: 'A1',
  caseYear: '2',
  specTp: '01',
  listPeriodStart: 0,
  listPeriodEnd: 999,
  listInterval: 30,
  settleSrc: 'N',
  cardType: 'M3',
  prodBest: null,
  status: 'active',
  stage: 'ready',
  createdBy: '張部長',
  createdAt: '2026-05-14T18:05:00.000Z',
  updatedAt: '2026-05-14T18:05:00.000Z',
};

const mockListsResp: ListListsResponse = {
  selectedYm: '202605',
  currentWorkYm: '202605',
  isHistorical: false,
  isFuture: false,
  lockState: { locked: false, reason: null },
  lists: [list],
  stageCounts: {
    draft: 0,
    dept_ratio: 0,
    personnel_ratio: 0,
    approval: 0,
    ready: 1,
    disabled: 0,
  },
};

function renderPage(listNo = 'OB202605002') {
  return render(
    <MemoryRouter initialEntries={[`/assignment/ready-summary/${listNo}`]}>
      <ToastProvider>
        <Routes>
          <Route
            path="/assignment/ready-summary/:listNo"
            element={<ReadySummaryDetailPage />}
          />
        </Routes>
      </ToastProvider>
    </MemoryRouter>,
  );
}

describe('ReadySummaryDetailPage (29d 模式 B)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockedGetUser.mockReturnValue({
      id: 'd1',
      name: 'Director',
      email: 'd@test',
      role: 'user',
      businessRole: 'director',
      status: 'active',
    } as any);
    mockedGetBusinessRole.mockReturnValue('director');
    mockedListLists.mockResolvedValue(mockListsResp);
    mockedGetDeptRatios.mockResolvedValue({
      listNo: 'OB202605002',
      listNm: '測試名單',
      projectWorkym: '202605',
      stage: 'ready',
      deptRatios: [
        { obdeptId: 'D01', obdeptNm: '北一處', ration: 60, isActive: true },
        { obdeptId: 'D02', obdeptNm: '南一處', ration: 40, isActive: true },
      ],
      total: 100,
      isReadOnly: true,
    });
    mockedGetPersonnelRatios.mockResolvedValue({
      listNo: 'OB202605002',
      listNm: '測試名單',
      projectWorkym: '202605',
      stage: 'ready',
      isReadOnly: true,
      viewerRole: 'director',
      departments: [],
      latestRejection: null,
    });
    mockedGetApprovalHistory.mockResolvedValue({
      listNo: 'OB202605002',
      history: [
        {
          approvalId: 'a1',
          action: 'approve',
          rejectReason: null,
          approverId: 'dir-001',
          approverName: '張部長',
          approverRole: 'director',
          approvedAt: '2026-05-14T18:05:00Z',
        },
      ],
    });
  });

  afterEach(() => {
    cleanup();
  });

  it('載入時顯示名單標題卡（listNo / listNm / 最終核准資訊）', async () => {
    renderPage();
    await waitFor(() => {
      const matches = screen.getAllByText(/OB202605002/);
      expect(matches.length).toBeGreaterThan(0);
    });
    expect(screen.getAllByText(/2026-05 業務二部 主力催收/).length).toBeGreaterThan(0);
  });

  it('顯示部門比例唯讀表', async () => {
    renderPage();
    await waitFor(() => {
      expect(screen.getByTestId('detail-dept-ratio-table')).toBeInTheDocument();
    });
  });

  it('顯示個別比例 accordion', async () => {
    renderPage();
    await waitFor(() => {
      expect(screen.getByTestId('dept-accordion-header-D01')).toBeInTheDocument();
    });
  });

  it('顯示簽核歷史（含 approve 紀錄）', async () => {
    renderPage();
    await waitFor(() => {
      expect(screen.getByTestId('approval-history-item-a1')).toBeInTheDocument();
    });
  });

  it('director 顯示「退回簽核」按鈕', async () => {
    renderPage();
    await waitFor(() => {
      expect(screen.getByTestId('btn-rollback-approval')).toBeInTheDocument();
    });
  });

  it('director 顯示「執行月跑」按鈕', async () => {
    renderPage();
    await waitFor(() => {
      expect(screen.getByTestId('btn-run-month')).toBeInTheDocument();
    });
  });

  it('section_chief 不顯示「退回簽核」按鈕（director only F089）', async () => {
    mockedGetBusinessRole.mockReturnValue('section_chief');
    renderPage();
    await waitFor(() => {
      expect(screen.getAllByText(/2026-05 業務二部 主力催收/).length).toBeGreaterThan(0);
    });
    expect(screen.queryByTestId('btn-rollback-approval')).not.toBeInTheDocument();
  });

  it('「退回簽核」按鈕觸發 rollbackToApproval API', async () => {
    mockedRollbackApproval.mockResolvedValue({
      listNo: 'OB202605002',
      stage: 'approval',
    });
    renderPage();
    await waitFor(() => {
      expect(screen.getByTestId('btn-rollback-approval')).toBeInTheDocument();
    });
    fireEvent.click(screen.getByTestId('btn-rollback-approval'));
    await waitFor(() => {
      expect(screen.getByTestId('confirm-rollback-modal')).toBeInTheDocument();
    });
    fireEvent.click(screen.getByTestId('btn-confirm-rollback'));
    await waitFor(() => {
      expect(mockedRollbackApproval).toHaveBeenCalledWith('OB202605002');
    });
  });

  it('顯示 stat cards（部門數 / 業務員數 / 簽核紀錄數）', async () => {
    renderPage();
    await waitFor(() => {
      expect(screen.getByTestId('detail-stat-dept-count')).toBeInTheDocument();
    });
    const deptCount = screen.getByTestId('detail-stat-dept-count');
    expect(deptCount.textContent).toContain('2');
  });

  it('名單階段不是 ready 時顯示警告', async () => {
    mockedListLists.mockResolvedValue({
      ...mockListsResp,
      lists: [{ ...list, stage: 'approval' }],
    });
    renderPage();
    await waitFor(() => {
      expect(screen.getByTestId('stage-mismatch-warning')).toBeInTheDocument();
    });
  });

  it('listNo 不存在 → 顯示找不到名單錯誤', async () => {
    mockedListLists.mockResolvedValue({
      ...mockListsResp,
      lists: [],
    });
    renderPage();
    await waitFor(() => {
      expect(screen.getByTestId('list-not-found')).toBeInTheDocument();
    });
  });
});
