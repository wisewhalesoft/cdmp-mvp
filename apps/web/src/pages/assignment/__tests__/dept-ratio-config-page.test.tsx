import { render, screen, cleanup, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { DeptRatioConfigPage } from '../dept-ratio-config-page';
import { ToastProvider } from '@/components/ui/toast';
import * as assignmentListApi from '@/api/assignment-list';
import * as assignmentStageApi from '@/api/assignment-stage';
import * as authStore from '@/stores/auth-store';
import type { AssignmentListItem, ListListsResponse } from '@/api/assignment-list';

/**
 * 29a 部門比例設定獨立頁面測試
 *
 * 對應 prototype 29a-dept-ratio-config.html
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
const mockedAdvance = vi.mocked(assignmentStageApi.advanceToPersonnelRatio);
const mockedRollback = vi.mocked(assignmentStageApi.rollbackToDraft);
const mockedGetUser = vi.mocked(authStore.getUser);
const mockedGetBusinessRole = vi.mocked(authStore.getBusinessRole);
const mockedGetEffectiveIdentity = vi.mocked(authStore.getEffectiveIdentity);

const deptRatioList: AssignmentListItem = {
  listNo: 'OB202605003',
  listNm: '2026-05 主力催收名單 A',
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
  stage: 'dept_ratio',
  createdBy: '張部長',
  createdAt: '2026-05-15T00:00:00.000Z',
  updatedAt: '2026-05-15T00:00:00.000Z',
};

const mockListsResp: ListListsResponse = {
  selectedYm: '202605',
  currentWorkYm: '202605',
  isHistorical: false,
  isFuture: false,
  lockState: { locked: false, reason: null },
  lists: [deptRatioList],
  stageCounts: {
    draft: 0,
    dept_ratio: 1,
    personnel_ratio: 0,
    approval: 0,
    ready: 0,
    disabled: 0,
  },
};

function renderPage(listNo = 'OB202605003') {
  return render(
    <MemoryRouter initialEntries={[`/assignment/lists/${listNo}/dept-ratio`]}>
      <ToastProvider>
        <Routes>
          <Route
            path="/assignment/lists/:listNo/dept-ratio"
            element={<DeptRatioConfigPage />}
          />
        </Routes>
      </ToastProvider>
    </MemoryRouter>,
  );
}

describe('DeptRatioConfigPage (29a)', () => {
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
    mockedGetEffectiveIdentity.mockReturnValue({
      role: 'user',
      businessRole: 'director',
    } as any);
    mockedListLists.mockResolvedValue(mockListsResp);
    mockedGetDeptRatios.mockResolvedValue({
      listNo: 'OB202605003',
      listNm: '測試名單',
      projectWorkym: '202605',
      stage: 'dept_ratio',
      deptRatios: [
        { obdeptId: 'D01', obdeptNm: '北一處', ration: 60, isActive: true, directorName: '李處長' },
        { obdeptId: 'D02', obdeptNm: '南一處', ration: 40, isActive: true, directorName: null },
      ],
      total: 100,
      isReadOnly: false,
    });
  });

  afterEach(() => {
    cleanup();
  });

  it('載入時顯示名單摘要（listNo / listNm / title）', async () => {
    renderPage();
    await waitFor(() => {
      expect(screen.getByText(/OB202605003/)).toBeInTheDocument();
    });
    expect(screen.getByText(/2026-05 主力催收名單 A/)).toBeInTheDocument();
    const summary = screen.getByTestId('list-summary-card');
    expect(summary.textContent).toContain('部門比例設定');
  });

  it('載入時顯示 DeptRatioForm', async () => {
    renderPage();
    await waitFor(() => {
      expect(screen.getByTestId('dept-ratio-form')).toBeInTheDocument();
    });
  });

  it('顯示「儲存並推進」按鈕（部長角色）', async () => {
    renderPage();
    await waitFor(() => {
      expect(screen.getByTestId('btn-advance-personnel-ratio')).toBeInTheDocument();
    });
  });

  it('顯示「退回草稿」按鈕（部長角色）', async () => {
    renderPage();
    await waitFor(() => {
      expect(screen.getByTestId('btn-rollback-draft')).toBeInTheDocument();
    });
  });

  it('「推進」按鈕觸發 advanceToPersonnelRatio API + 跳轉', async () => {
    mockedAdvance.mockResolvedValue({
      listNo: 'OB202605003',
      stage: 'personnel_ratio',
    });
    renderPage();
    await waitFor(() => {
      expect(screen.getByTestId('btn-advance-personnel-ratio')).toBeInTheDocument();
    });
    fireEvent.click(screen.getByTestId('btn-advance-personnel-ratio'));
    await waitFor(() => {
      expect(screen.getByTestId('confirm-advance-modal')).toBeInTheDocument();
    });
    fireEvent.click(screen.getByTestId('btn-confirm-advance'));
    await waitFor(() => {
      expect(mockedAdvance).toHaveBeenCalledWith('OB202605003');
    });
  });

  it('「退回草稿」按鈕觸發 rollbackToDraft API', async () => {
    mockedRollback.mockResolvedValue({
      listNo: 'OB202605003',
      stage: 'draft',
    });
    renderPage();
    await waitFor(() => {
      expect(screen.getByTestId('btn-rollback-draft')).toBeInTheDocument();
    });
    fireEvent.click(screen.getByTestId('btn-rollback-draft'));
    await waitFor(() => {
      expect(screen.getByTestId('confirm-rollback-modal')).toBeInTheDocument();
    });
    fireEvent.click(screen.getByTestId('btn-confirm-rollback'));
    await waitFor(() => {
      expect(mockedRollback).toHaveBeenCalledWith('OB202605003');
    });
  });

  it('section_chief 視角不顯示寫入按鈕（推進/退回/儲存）', async () => {
    mockedGetBusinessRole.mockReturnValue('section_chief');
    mockedGetEffectiveIdentity.mockReturnValue({
      role: 'user',
      businessRole: 'section_chief',
    } as any);
    renderPage();
    await waitFor(() => {
      expect(screen.getByTestId('dept-ratio-form')).toBeInTheDocument();
    });
    expect(screen.queryByTestId('btn-advance-personnel-ratio')).not.toBeInTheDocument();
    expect(screen.queryByTestId('btn-rollback-draft')).not.toBeInTheDocument();
  });

  it('section_chief 視角顯示「處長唯讀」banner', async () => {
    mockedGetBusinessRole.mockReturnValue('section_chief');
    mockedGetEffectiveIdentity.mockReturnValue({
      role: 'user',
      businessRole: 'section_chief',
    } as any);
    renderPage();
    await waitFor(() => {
      expect(screen.getByTestId('director-readonly-banner')).toBeInTheDocument();
    });
  });

  it('名單階段不是 dept_ratio 時顯示警告（例如 stage=draft）', async () => {
    mockedListLists.mockResolvedValue({
      ...mockListsResp,
      lists: [{ ...deptRatioList, stage: 'draft' }],
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
