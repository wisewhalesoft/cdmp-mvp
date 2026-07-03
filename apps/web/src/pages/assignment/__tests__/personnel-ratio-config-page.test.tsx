import { render, screen, cleanup, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { PersonnelRatioConfigPage } from '../personnel-ratio-config-page';
import { ToastProvider } from '@/components/ui/toast';
import * as assignmentListApi from '@/api/assignment-list';
import * as assignmentStageApi from '@/api/assignment-stage';
import * as authStore from '@/stores/auth-store';
import type { AssignmentListItem, ListListsResponse } from '@/api/assignment-list';
import type {
  GetPersonnelRatiosResponse,
  PersonnelRatioDepartment,
  LatestRejection,
} from '@/api/assignment-stage';

/**
 * 29b 個別業務比例設定獨立頁面測試
 *
 * 對應 prototype 29b-personnel-ratio-config.html / spec F082 §5.1
 *
 * 重點：mock 必須使用後端真實 response shape（departments[] 而非 employees[]），
 * 對齊 feedback_mock_real_system_contract 教訓。
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
const mockedGetPersonnelRatios = vi.mocked(assignmentStageApi.getPersonnelRatios);
const mockedAdvanceApproval = vi.mocked(assignmentStageApi.advanceToApproval);
const mockedGetUser = vi.mocked(authStore.getUser);
const mockedGetBusinessRole = vi.mocked(authStore.getBusinessRole);
const mockedGetEffectiveIdentity = vi.mocked(authStore.getEffectiveIdentity);

function buildDepartment(
  overrides: Partial<PersonnelRatioDepartment> & { deptCode: string; deptName: string },
): PersonnelRatioDepartment {
  return {
    deptRatio: 50,
    directorName: null,
    isInScope: true,
    activeCount: 0,
    sumValidated: false,
    allResigned: false,
    employees: [],
    deptSum: 0,
    ...overrides,
  };
}

function buildPersonnelResponse(
  departments: PersonnelRatioDepartment[],
  latestRejection: LatestRejection | null = null,
): GetPersonnelRatiosResponse {
  return {
    listNo: 'OB202605007',
    listNm: '2026-05 主力催收名單 C',
    projectWorkym: '202605',
    stage: 'personnel_ratio',
    isReadOnly: false,
    viewerRole: 'director',
    departments,
    latestRejection,
  };
}

const list: AssignmentListItem = {
  listNo: 'OB202605007',
  listNm: '2026-05 主力催收名單 C',
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
  stage: 'personnel_ratio',
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
  lists: [list],
  stageCounts: {
    draft: 0,
    dept_ratio: 0,
    personnel_ratio: 1,
    approval: 0,
    ready: 0,
    disabled: 0,
  },
};

function renderPage(listNo = 'OB202605007') {
  return render(
    <MemoryRouter initialEntries={[`/assignment/lists/${listNo}/personnel-ratio`]}>
      <ToastProvider>
        <Routes>
          <Route
            path="/assignment/lists/:listNo/personnel-ratio"
            element={<PersonnelRatioConfigPage />}
          />
        </Routes>
      </ToastProvider>
    </MemoryRouter>,
  );
}

describe('PersonnelRatioConfigPage (29b)', () => {
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
    mockedGetPersonnelRatios.mockResolvedValue(
      buildPersonnelResponse([
        buildDepartment({ deptCode: 'D01', deptName: '北一處', deptRatio: 50 }),
        buildDepartment({ deptCode: 'D02', deptName: '南一處', deptRatio: 50 }),
      ]),
    );
  });

  afterEach(() => {
    cleanup();
  });

  it('載入時顯示名單摘要（listNo / listNm）', async () => {
    renderPage();
    await waitFor(() => {
      expect(screen.getByText(/OB202605007/)).toBeInTheDocument();
    });
    expect(screen.getByText(/2026-05 主力催收名單 C/)).toBeInTheDocument();
  });

  it('載入時依 departments[] 渲染多部門 accordion', async () => {
    renderPage();
    await waitFor(() => {
      expect(screen.getByTestId('dept-accordion-header-D01')).toBeInTheDocument();
    });
    expect(screen.getByTestId('dept-accordion-header-D02')).toBeInTheDocument();
  });

  it('有 latestRejection 時顯示 rejection banner', async () => {
    mockedGetPersonnelRatios.mockResolvedValue(
      buildPersonnelResponse(
        [buildDepartment({ deptCode: 'D01', deptName: '北一處' })],
        {
          rejectReason: '某員工新進，建議下調至 15% 以下',
          rejectorId: 'dir-001',
          rejectorName: '張部長',
          rejectorRole: 'director',
          rejectedAt: '2026-05-15T13:42:00Z',
        },
      ),
    );
    renderPage();
    await waitFor(() => {
      expect(screen.getByTestId('rejection-banner-full')).toBeInTheDocument();
    });
    expect(screen.getByText(/某員工新進/)).toBeInTheDocument();
  });

  it('latestRejection = null 時不顯示 rejection banner', async () => {
    renderPage();
    await waitFor(() => {
      expect(screen.getByTestId('dept-accordion-header-D01')).toBeInTheDocument();
    });
    expect(screen.queryByTestId('rejection-banner-full')).not.toBeInTheDocument();
  });

  // F084 v2.0：fallback 手動推進按鈕改為 response-driven（allDone 且非唯讀時顯示）。
  // 原意「部長 + 處長皆可看到推進按鈕」保留，但前置改為「所有部門完成」才渲染（對齊 prototype renderActionBar）。
  it('所有部門完成時顯示 fallback「推進至簽核」按鈕（部長 + 處長皆可）', async () => {
    mockedGetPersonnelRatios.mockResolvedValue(
      buildPersonnelResponse([
        buildDepartment({
          deptCode: 'D01',
          deptName: '北一處',
          sumValidated: true,
          deptSum: 100,
          activeCount: 1,
          employees: [
            { empId: 'E001', empName: '甲', ration: 100, isResigned: false, createdBy: 'd1' },
          ],
        }),
      ]),
    );
    renderPage();
    await waitFor(() => {
      expect(screen.getByTestId('btn-advance-approval')).toBeInTheDocument();
    });
  });

  it('顯示「退回部門比例」按鈕（部長角色）', async () => {
    renderPage();
    await waitFor(() => {
      expect(screen.getByTestId('btn-rollback-dept-ratio')).toBeInTheDocument();
    });
  });

  it('section_chief 視角不顯示「退回部門比例」按鈕（director only）', async () => {
    mockedGetBusinessRole.mockReturnValue('section_chief');
    mockedGetEffectiveIdentity.mockReturnValue({
      role: 'user',
      businessRole: 'section_chief',
    } as any);
    // 所有部門完成 → fallback 推進按鈕渲染（response-driven）；本測試核心驗證「處長不顯示退回按鈕」
    mockedGetPersonnelRatios.mockResolvedValue(
      buildPersonnelResponse([
        buildDepartment({
          deptCode: 'D01',
          deptName: '北一處',
          sumValidated: true,
          deptSum: 100,
          activeCount: 1,
          isInScope: true,
          employees: [
            { empId: 'E001', empName: '甲', ration: 100, isResigned: false, createdBy: 'd1' },
          ],
        }),
      ]),
    );
    renderPage();
    await waitFor(() => {
      expect(screen.getByTestId('btn-advance-approval')).toBeInTheDocument();
    });
    // 核心驗收：處長不顯示「退回部門比例」（director only）
    expect(screen.queryByTestId('btn-rollback-dept-ratio')).not.toBeInTheDocument();
  });

  it('「推進至簽核」按鈕觸發 advanceToApproval API + 跳轉（所有部門完成時）', async () => {
    // 所有部門必須 sumValidated=true 或 allResigned=true 才能 enable advance（對齊 prototype）
    mockedGetPersonnelRatios.mockResolvedValue(
      buildPersonnelResponse([
        buildDepartment({
          deptCode: 'D01',
          deptName: '北一處',
          sumValidated: true,
          deptSum: 100,
          activeCount: 1,
          employees: [
            { empId: 'E001', empName: '甲', ration: 100, isResigned: false, createdBy: 'd1' },
          ],
        }),
      ]),
    );
    mockedAdvanceApproval.mockResolvedValue({
      listNo: 'OB202605007',
      stage: 'approval',
    });
    renderPage();
    await waitFor(() => {
      expect(screen.getByTestId('btn-advance-approval')).toBeInTheDocument();
    });
    fireEvent.click(screen.getByTestId('btn-advance-approval'));
    await waitFor(() => {
      expect(screen.getByTestId('confirm-advance-modal')).toBeInTheDocument();
    });
    fireEvent.click(screen.getByTestId('btn-confirm-advance'));
    await waitFor(() => {
      expect(mockedAdvanceApproval).toHaveBeenCalledWith('OB202605007');
    });
  });

  // F084 v2.0 行為變更：fallback 推進按鈕改為 response-driven。未全部完成（!allDone）時
  // 按鈕「完全不渲染」（原行為為「渲染但 disabled」）；對齊 prototype renderActionBar 之
  // showFallbackBtn 條件。原意「未完成不可推進」保留，斷言改為「按鈕不存在 + 儲存全部 disabled」。
  it('未全部完成時，fallback 推進按鈕不渲染，且「儲存全部」disabled', async () => {
    renderPage();
    await waitFor(() => {
      // 預設 2 部門 sumValidated:false（未完成）→ 按鈕不渲染
      expect(screen.getByTestId('btn-save-all')).toBeInTheDocument();
    });
    expect(screen.queryByTestId('btn-advance-approval')).not.toBeInTheDocument();
    expect(screen.getByTestId('btn-save-all')).toBeDisabled();
  });

  it('departments 為空時 accordion 顯示「無部門」', async () => {
    mockedGetPersonnelRatios.mockResolvedValue(buildPersonnelResponse([]));
    renderPage();
    await waitFor(() => {
      expect(screen.getByText(/無部門|尚無/)).toBeInTheDocument();
    });
  });

  it('全員離職部門顯示對應 banner', async () => {
    mockedGetPersonnelRatios.mockResolvedValue(
      buildPersonnelResponse([
        buildDepartment({
          deptCode: 'D99',
          deptName: '舊東區處',
          allResigned: true,
          activeCount: 0,
          employees: [
            { empId: 'E001', empName: '舊員工', ration: null, isResigned: true, createdBy: null },
          ],
        }),
      ]),
    );
    renderPage();
    await waitFor(() => {
      expect(screen.getByTestId('dept-all-resigned-D99')).toBeInTheDocument();
    });
  });

  it('設定頁向 API 要求排除離職員工（excludeResigned），畫面不顯示離職列', async () => {
    // 後端在 excludeResigned=true 下只回在職員工；設定頁不再顯示離職列（離職無法設比例）。
    mockedGetPersonnelRatios.mockResolvedValue(
      buildPersonnelResponse([
        buildDepartment({
          deptCode: 'D01',
          deptName: '北一處',
          activeCount: 1,
          employees: [
            { empId: 'E001', empName: '在職員', ration: 100, isResigned: false, createdBy: 'd1' },
          ],
        }),
      ]),
    );
    renderPage();
    await waitFor(() => {
      expect(screen.getByText('在職員')).toBeInTheDocument();
    });
    // 設定頁明確要求後端排除離職員工
    expect(mockedGetPersonnelRatios).toHaveBeenCalledWith('OB202605007', undefined, {
      excludeResigned: true,
    });
    // 後端已排除 → 無任何離職徽章
    expect(screen.queryByTestId('empl-resigned-badge-E099')).not.toBeInTheDocument();
  });

  it('名單階段不是 personnel_ratio 時顯示警告', async () => {
    mockedListLists.mockResolvedValue({
      ...mockListsResp,
      lists: [{ ...list, stage: 'draft' }],
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
