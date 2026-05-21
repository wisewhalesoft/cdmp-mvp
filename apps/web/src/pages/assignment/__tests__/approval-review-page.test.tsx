import { render, screen, cleanup, fireEvent, waitFor, within } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { ApprovalReviewPage } from '../approval-review-page';
import { ToastProvider } from '@/components/ui/toast';
import * as assignmentListApi from '@/api/assignment-list';
import * as assignmentStageApi from '@/api/assignment-stage';
import * as authStore from '@/stores/auth-store';
import type { AssignmentListItem, ListListsResponse } from '@/api/assignment-list';

/**
 * 29c 簽核審閱獨立頁面測試
 *
 * 對應 prototype 29c-approval-review.html
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
const mockedApproveList = vi.mocked(assignmentStageApi.approveList);
const mockedRejectList = vi.mocked(assignmentStageApi.rejectList);
const mockedGetUser = vi.mocked(authStore.getUser);
const mockedGetBusinessRole = vi.mocked(authStore.getBusinessRole);

const list: AssignmentListItem = {
  listNo: 'OB202605008',
  listNm: '2026-05 主力催收名單 D',
  prodKind: 'A1',
  caseYear: '3$$4$$5',
  specTp: '01',
  listPeriodStart: 0,
  listPeriodEnd: 999,
  listInterval: 30,
  settleSrc: 'N',
  cardType: 'M3',
  prodBest: null,
  status: 'active',
  stage: 'approval',
  createdBy: '李處長',
  createdAt: '2026-05-14T17:32:00.000Z',
  updatedAt: '2026-05-14T17:32:00.000Z',
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
    approval: 1,
    ready: 0,
    disabled: 0,
  },
};

function renderPage(listNo = 'OB202605008') {
  return render(
    <MemoryRouter initialEntries={[`/assignment/lists/${listNo}/approval`]}>
      <ToastProvider>
        <Routes>
          <Route
            path="/assignment/lists/:listNo/approval"
            element={<ApprovalReviewPage />}
          />
        </Routes>
      </ToastProvider>
    </MemoryRouter>,
  );
}

describe('ApprovalReviewPage (29c)', () => {
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
      listNo: 'OB202605008',
      listNm: '測試名單',
      projectWorkym: '202605',
      stage: 'approval',
      deptRatios: [
        { obdeptId: 'D01', obdeptNm: '北一處', ration: 50, isActive: true },
        { obdeptId: 'D02', obdeptNm: '南一處', ration: 50, isActive: true },
      ],
      total: 100,
      isReadOnly: true,
    });
    mockedGetPersonnelRatios.mockResolvedValue({
      listNo: 'OB202605008',
      listNm: '測試名單',
      projectWorkym: '202605',
      stage: 'approval',
      isReadOnly: true,
      viewerRole: 'director',
      departments: [],
      latestRejection: null,
    });
    mockedGetApprovalHistory.mockResolvedValue({
      listNo: 'OB202605008',
      history: [],
    });
  });

  afterEach(() => {
    cleanup();
  });

  it('載入時顯示名單摘要', async () => {
    renderPage();
    await waitFor(() => {
      expect(screen.getByText(/OB202605008/)).toBeInTheDocument();
    });
    expect(screen.getByText(/2026-05 主力催收名單 D/)).toBeInTheDocument();
  });

  it('顯示部門比例唯讀表', async () => {
    renderPage();
    await waitFor(() => {
      expect(screen.getByTestId('approval-dept-ratio-table')).toBeInTheDocument();
    });
    const table = screen.getByTestId('approval-dept-ratio-table');
    expect(within(table).getByText(/北一處/)).toBeInTheDocument();
  });

  it('顯示個別比例 accordion（依部門展開）', async () => {
    renderPage();
    await waitFor(() => {
      expect(screen.getByTestId('dept-accordion-header-D01')).toBeInTheDocument();
    });
    expect(screen.getByTestId('dept-accordion-header-D02')).toBeInTheDocument();
  });

  it('顯示簽核歷史時間軸（無資料）', async () => {
    renderPage();
    await waitFor(() => {
      expect(screen.getByText('尚無簽核紀錄')).toBeInTheDocument();
    });
  });

  it('簽核歷史有 1 筆 reject 時顯示時間軸 item', async () => {
    mockedGetApprovalHistory.mockResolvedValue({
      listNo: 'OB202605008',
      history: [
        {
          approvalId: 'a1',
          action: 'reject',
          rejectReason: '比例不合理',
          approverId: 'dir-001',
          approverName: '王部長',
          approverRole: 'director',
          approvedAt: '2026-05-13T10:00:00Z',
        },
      ],
    });
    renderPage();
    await waitFor(() => {
      expect(screen.getByTestId('approval-history-item-a1')).toBeInTheDocument();
    });
    expect(screen.getByText('比例不合理')).toBeInTheDocument();
  });

  it('顯示「核准」按鈕（director only）', async () => {
    renderPage();
    await waitFor(() => {
      expect(screen.getByTestId('btn-approve')).toBeInTheDocument();
    });
  });

  it('顯示「拒絕」按鈕（director only）', async () => {
    renderPage();
    await waitFor(() => {
      expect(screen.getByTestId('btn-reject')).toBeInTheDocument();
    });
  });

  it('section_chief 視角不顯示「核准」/「拒絕」按鈕', async () => {
    mockedGetBusinessRole.mockReturnValue('section_chief');
    renderPage();
    await waitFor(() => {
      expect(screen.getByText(/2026-05 主力催收名單 D/)).toBeInTheDocument();
    });
    expect(screen.queryByTestId('btn-approve')).not.toBeInTheDocument();
    expect(screen.queryByTestId('btn-reject')).not.toBeInTheDocument();
  });

  it('「核准」按鈕觸發 approveList API + 跳轉', async () => {
    mockedApproveList.mockResolvedValue({
      listNo: 'OB202605008',
      stage: 'ready',
    });
    renderPage();
    await waitFor(() => {
      expect(screen.getByTestId('btn-approve')).toBeInTheDocument();
    });
    fireEvent.click(screen.getByTestId('btn-approve'));
    await waitFor(() => {
      expect(screen.getByTestId('confirm-approve-modal')).toBeInTheDocument();
    });
    fireEvent.click(screen.getByTestId('btn-confirm-approve'));
    await waitFor(() => {
      expect(mockedApproveList).toHaveBeenCalledWith('OB202605008');
    });
  });

  it('「拒絕」按鈕打開 reject modal 含 5 個快速 chip', async () => {
    renderPage();
    await waitFor(() => {
      expect(screen.getByTestId('btn-reject')).toBeInTheDocument();
    });
    fireEvent.click(screen.getByTestId('btn-reject'));
    await waitFor(() => {
      expect(screen.getByTestId('reject-modal')).toBeInTheDocument();
    });
    expect(screen.getByTestId('reject-reason-chips')).toBeInTheDocument();
    expect(screen.getByText('比例分配不均')).toBeInTheDocument();
  });

  it('點 chip 套用 reason 至 textarea', async () => {
    renderPage();
    await waitFor(() => {
      expect(screen.getByTestId('btn-reject')).toBeInTheDocument();
    });
    fireEvent.click(screen.getByTestId('btn-reject'));
    await waitFor(() => {
      expect(screen.getByTestId('reject-modal')).toBeInTheDocument();
    });
    fireEvent.click(screen.getByText('比例分配不均'));
    const textarea = screen.getByTestId(
      'reject-reason-textarea',
    ) as HTMLTextAreaElement;
    expect(textarea.value).toBe(
      '比例分配不均，請參考 4 月慣例調整為均衡分配',
    );
  });

  it('reject reason 空白時「確認拒絕」按鈕 disabled', async () => {
    renderPage();
    await waitFor(() => {
      expect(screen.getByTestId('btn-reject')).toBeInTheDocument();
    });
    fireEvent.click(screen.getByTestId('btn-reject'));
    await waitFor(() => {
      expect(screen.getByTestId('reject-modal')).toBeInTheDocument();
    });
    const btn = screen.getByTestId('btn-confirm-reject');
    expect(btn).toBeDisabled();
  });

  it('填 reason + 點「確認拒絕」觸發 rejectList API', async () => {
    mockedRejectList.mockResolvedValue({
      listNo: 'OB202605008',
      stage: 'personnel_ratio',
    });
    renderPage();
    await waitFor(() => {
      expect(screen.getByTestId('btn-reject')).toBeInTheDocument();
    });
    fireEvent.click(screen.getByTestId('btn-reject'));
    await waitFor(() => {
      expect(screen.getByTestId('reject-modal')).toBeInTheDocument();
    });
    const textarea = screen.getByTestId('reject-reason-textarea');
    fireEvent.change(textarea, {
      target: { value: '自訂拒絕原因，至少 5 字' },
    });
    fireEvent.click(screen.getByTestId('btn-confirm-reject'));
    await waitFor(() => {
      expect(mockedRejectList).toHaveBeenCalledWith(
        'OB202605008',
        { rejectReason: '自訂拒絕原因，至少 5 字' },
      );
    });
  });

  it('名單階段不是 approval 時顯示警告', async () => {
    mockedListLists.mockResolvedValue({
      ...mockListsResp,
      lists: [{ ...list, stage: 'ready' }],
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
