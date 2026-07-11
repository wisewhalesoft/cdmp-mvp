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
  SetPersonnelRatiosResponse,
  StageTransitionResponse,
} from '@/api/assignment-stage';

/**
 * F084 v2.0 Auto-Advance 前端測試（TC-F084-FE-001~011）
 *
 * 對應交接文件 §5 / spec F084 §7；UI ground truth = prototypes/29b-personnel-ratio-config.html（v2.0 更新版）
 *
 * 前端 response-driven（無 frontend flag；prototype L26-30）：
 *   - autoAdvanced=true → 自動推進 toast + redirect 名單列表
 *   - autoAdvanceFailReason=ASSIGNMENT_RUN_ALREADY_RUNNING → 月名單分派 warning toast + 退回 fallback 按鈕 + 不 redirect
 *   - autoAdvanced=false 無 failReason（部分完成 / flag off）→ 僅既有「已儲存」toast
 *
 * mock 對齊真實 contract（feedback_mock_real_system_contract）：
 *   setPersonnelRatios mock 回傳必含 autoAdvanced / newStage / autoAdvanceFailReason 三欄位（即使 null 也明示）。
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
const mockedSetPersonnelRatios = vi.mocked(assignmentStageApi.setPersonnelRatios);
const mockedAdvanceApproval = vi.mocked(assignmentStageApi.advanceToApproval);
const mockedGetUser = vi.mocked(authStore.getUser);
const mockedGetBusinessRole = vi.mocked(authStore.getBusinessRole);
const mockedGetEffectiveIdentity = vi.mocked(authStore.getEffectiveIdentity);

const LIST_NM = '2026-05 主力催收名單 C';
const LIST_NO = 'OB202605007';

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

/** 完成的單部門（1 員工 ration=100，sumValidated=true）→ allDone=true、form isSavable=true。 */
function buildDoneDept(deptCode = 'D01', deptName = '北一處'): PersonnelRatioDepartment {
  return buildDepartment({
    deptCode,
    deptName,
    sumValidated: true,
    deptSum: 100,
    activeCount: 1,
    employees: [{ empId: 'E001', empName: '甲', ration: 100, isResigned: false, createdBy: 'd1' }],
  });
}

function buildPersonnelResponse(
  departments: PersonnelRatioDepartment[],
  overrides: Partial<GetPersonnelRatiosResponse> = {},
): GetPersonnelRatiosResponse {
  return {
    listNo: LIST_NO,
    listNm: LIST_NM,
    projectWorkym: '202605',
    stage: 'personnel_ratio',
    isReadOnly: false,
    viewerRole: 'director',
    departments,
    latestRejection: null,
    ...overrides,
  };
}

/** 後端真實 PUT response shape（三新欄位必填，不省略）。 */
function buildPutResponse(
  overrides: Partial<SetPersonnelRatiosResponse> = {},
): SetPersonnelRatiosResponse {
  return {
    listNo: LIST_NO,
    deptCode: 'D01',
    savedCount: 1,
    deptSum: 100,
    savedAt: '2026-05-25T08:00:00Z',
    savedBy: 'chief-001',
    autoAdvanced: false,
    newStage: null,
    autoAdvanceFailReason: null,
    ...overrides,
  };
}

const list: AssignmentListItem = {
  listNo: LIST_NO,
  listNm: LIST_NM,
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
  stageCounts: { draft: 0, dept_ratio: 0, personnel_ratio: 1, approval: 0, ready: 0, disabled: 0 },
};

function renderPage(listNo = LIST_NO) {
  return render(
    <MemoryRouter initialEntries={[`/assignment/lists/${listNo}/personnel-ratio`]}>
      <ToastProvider>
        <Routes>
          <Route
            path="/assignment/lists/:listNo/personnel-ratio"
            element={<PersonnelRatioConfigPage />}
          />
          {/* redirect 目標：渲染 marker 供斷言「已跳轉名單列表」 */}
          <Route
            path="/assignment/list-definitions"
            element={<div data-testid="list-definitions-page">名單列表</div>}
          />
        </Routes>
      </ToastProvider>
    </MemoryRouter>,
  );
}

describe('PersonnelRatioConfigPage — F084 v2.0 Auto-Advance（FE）', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockedGetUser.mockReturnValue({
      id: 'd1', name: 'Director', email: 'd@test', role: 'user', businessRole: 'director', status: 'active',
    } as any);
    mockedGetBusinessRole.mockReturnValue('director');
    mockedGetEffectiveIdentity.mockReturnValue({ role: 'user', businessRole: 'director' } as any);
    mockedListLists.mockResolvedValue(mockListsResp);
    mockedGetPersonnelRatios.mockResolvedValue(buildPersonnelResponse([buildDoneDept()]));
    mockedSetPersonnelRatios.mockResolvedValue(buildPutResponse());
  });

  afterEach(() => cleanup());

  // ── TC-F084-FE-001：autoAdvanced=true → 自動推進 toast + redirect ──
  it('TC-F084-FE-001：autoAdvanced=true → 顯示自動推進 toast + redirect 名單列表', async () => {
    mockedSetPersonnelRatios.mockResolvedValue(
      buildPutResponse({ autoAdvanced: true, newStage: 'approval' }),
    );
    renderPage();
    await waitFor(() => expect(screen.getByTestId('btn-save-all')).toBeEnabled());
    fireEvent.click(screen.getByTestId('btn-save-all'));

    // toast 文字含 listNm + 已自動推進 + 等待部長核准（單一字串，避免與頁面摘要的 listNm 重複匹配）
    await waitFor(() =>
      expect(
        screen.getByText(
          new RegExp(`名單『${LIST_NM}』已自動推進至簽核階段，等待部長核准`),
        ),
      ).toBeInTheDocument(),
    );
    await waitFor(() =>
      expect(screen.getByTestId('list-definitions-page')).toBeInTheDocument(),
    );
  });

  // ── TC-F084-FE-002：redirect 後名單列表（marker 出現即代表跳轉成功）──
  it('TC-F084-FE-002：autoAdvanced=true → redirect 至名單列表頁', async () => {
    mockedSetPersonnelRatios.mockResolvedValue(
      buildPutResponse({ autoAdvanced: true, newStage: 'approval' }),
    );
    renderPage();
    await waitFor(() => expect(screen.getByTestId('btn-save-all')).toBeEnabled());
    fireEvent.click(screen.getByTestId('btn-save-all'));
    await waitFor(() =>
      expect(screen.getByTestId('list-definitions-page')).toBeInTheDocument(),
    );
  });

  // ── TC-F084-FE-003：月名單分派 guard → 月名單分派 toast + 退回 fallback 按鈕 + 不 redirect ──
  it('TC-F084-FE-003：autoAdvanceFailReason=ASSIGNMENT_RUN_ALREADY_RUNNING → 月名單分派 toast + 顯示 fallback 按鈕', async () => {
    mockedSetPersonnelRatios.mockResolvedValue(
      buildPutResponse({
        autoAdvanced: false,
        newStage: null,
        autoAdvanceFailReason: 'ASSIGNMENT_RUN_ALREADY_RUNNING',
      }),
    );
    renderPage();
    await waitFor(() => expect(screen.getByTestId('btn-save-all')).toBeEnabled());
    fireEvent.click(screen.getByTestId('btn-save-all'));

    // 月名單分派 warning toast：完整單一字串（避免 /比例已儲存/ 與 /分派執行中/ 個別比對到多元素）
    await waitFor(() =>
      expect(
        screen.getByText(/比例已儲存；因分派執行中，請待月名單分派完成後手動推進至簽核/),
      ).toBeInTheDocument(),
    );
    // 退回顯示 fallback 手動按鈕
    expect(screen.getByTestId('btn-advance-approval')).toBeInTheDocument();
    // 不 redirect（仍在設定頁）
    expect(screen.queryByTestId('list-definitions-page')).not.toBeInTheDocument();
  });

  // ── TC-F084-FE-004：月名單分派 guard 跳過後 fallback 按鈕 disabled（月名單分派進行中）──
  it('TC-F084-FE-004：月名單分派 guard 跳過 → fallback 推進按鈕 disabled', async () => {
    mockedSetPersonnelRatios.mockResolvedValue(
      buildPutResponse({
        autoAdvanced: false,
        newStage: null,
        autoAdvanceFailReason: 'ASSIGNMENT_RUN_ALREADY_RUNNING',
      }),
    );
    renderPage();
    await waitFor(() => expect(screen.getByTestId('btn-save-all')).toBeEnabled());
    fireEvent.click(screen.getByTestId('btn-save-all'));

    await waitFor(() => expect(screen.getByTestId('btn-advance-approval')).toBeInTheDocument());
    expect(screen.getByTestId('btn-advance-approval')).toBeDisabled();
    // tooltip「分派執行中，無法推進」（title attribute on wrapper）
    const wrapper = screen.getByTestId('btn-advance-approval').closest('[title]');
    expect(wrapper).toHaveAttribute('title', '分派執行中，無法推進');
  });

  // ── TC-F084-FE-005：autoAdvanced=false 無 failReason（部分完成）→ 僅既有「已儲存」toast，不 redirect ──
  it('TC-F084-FE-005：部分完成（autoAdvanced:false 無 failReason）→ 只顯示既有儲存 toast', async () => {
    // 兩部門：一完成、一未完成（allDone=false）；存可存的那一個
    mockedGetPersonnelRatios.mockResolvedValue(
      buildPersonnelResponse([
        buildDoneDept('D01', '北一處'),
        buildDepartment({
          deptCode: 'D02',
          deptName: '南一處',
          activeCount: 2,
          sumValidated: false,
          deptSum: 80,
          employees: [
            { empId: 'E010', empName: '乙', ration: 80, isResigned: false, createdBy: 'd1' },
            { empId: 'E011', empName: '丙', ration: 0, isResigned: false, createdBy: 'd1' },
          ],
        }),
      ]),
    );
    mockedSetPersonnelRatios.mockResolvedValue(buildPutResponse({ autoAdvanced: false }));
    renderPage();
    // allDone=false → btn-save-all disabled；改點單部門儲存（D01 已完成）
    await waitFor(() => expect(screen.getByTestId('btn-save-dept-D01')).toBeInTheDocument());
    fireEvent.click(screen.getByTestId('btn-save-dept-D01'));

    // 既有「已儲存」toast
    await waitFor(() => expect(screen.getByText(/已儲存/)).toBeInTheDocument());
    // 無自動推進訊息、無月名單分派訊息、無 redirect
    expect(screen.queryByText(/已自動推進至簽核階段/)).not.toBeInTheDocument();
    expect(screen.queryByText(/因分派執行中/)).not.toBeInTheDocument();
    expect(screen.queryByTestId('list-definitions-page')).not.toBeInTheDocument();
  });

  // ── TC-F084-FE-006：flag off（response-driven）→ 所有部門完成顯示手動推進按鈕，可點擊 ──
  it('TC-F084-FE-006：所有部門完成 → 顯示可點擊的手動推進按鈕（flag off / fallback）', async () => {
    renderPage();
    await waitFor(() => expect(screen.getByTestId('btn-advance-approval')).toBeInTheDocument());
    expect(screen.getByTestId('btn-advance-approval')).toBeEnabled();
    // 初始未觸發任何 auto-advance toast
    expect(screen.queryByText(/已自動推進至簽核階段/)).not.toBeInTheDocument();
  });

  // ── TC-F084-FE-007：非 personnel_ratio 階段 → fallback 按鈕完全不渲染 ──
  it('TC-F084-FE-007：stage=approval（GET isReadOnly:true）→ 推進按鈕完全不渲染', async () => {
    mockedGetPersonnelRatios.mockResolvedValue(
      buildPersonnelResponse([buildDoneDept()], { stage: 'approval', isReadOnly: true }),
    );
    renderPage();
    await waitFor(() => expect(screen.getByText(new RegExp(LIST_NM))).toBeInTheDocument());
    expect(screen.queryByTestId('btn-advance-approval')).not.toBeInTheDocument();
  });

  // ── TC-F084-FE-008：歷史月份（isReadOnly:true）→ fallback 按鈕完全不渲染 ──
  it('TC-F084-FE-008：歷史月份（isReadOnly:true）→ 推進按鈕完全不渲染', async () => {
    mockedGetPersonnelRatios.mockResolvedValue(
      buildPersonnelResponse([buildDoneDept()], { isReadOnly: true }),
    );
    renderPage();
    await waitFor(() => expect(screen.getByText(new RegExp(LIST_NM))).toBeInTheDocument());
    expect(screen.queryByTestId('btn-advance-approval')).not.toBeInTheDocument();
  });

  // ── TC-F084-FE-009：手動 fallback — 確認對話框 + 成功 redirect ──
  it('TC-F084-FE-009：手動推進 fallback → 確認對話框 + 成功推進 + redirect', async () => {
    mockedAdvanceApproval.mockResolvedValue({ listNo: LIST_NO, stage: 'approval' } as StageTransitionResponse);
    renderPage();
    await waitFor(() => expect(screen.getByTestId('btn-advance-approval')).toBeEnabled());
    fireEvent.click(screen.getByTestId('btn-advance-approval'));

    await waitFor(() => expect(screen.getByTestId('confirm-advance-modal')).toBeInTheDocument());
    fireEvent.click(screen.getByTestId('btn-confirm-advance'));

    await waitFor(() => expect(mockedAdvanceApproval).toHaveBeenCalledWith(LIST_NO));
    await waitFor(() => expect(screen.getByTestId('list-definitions-page')).toBeInTheDocument());
  });

  // ── TC-F084-FE-010：手動 fallback — 確認對話框「取消」不觸發 API ──
  it('TC-F084-FE-010：手動推進確認對話框「取消」→ 不呼叫 API、不 redirect', async () => {
    renderPage();
    await waitFor(() => expect(screen.getByTestId('btn-advance-approval')).toBeEnabled());
    fireEvent.click(screen.getByTestId('btn-advance-approval'));
    await waitFor(() => expect(screen.getByTestId('confirm-advance-modal')).toBeInTheDocument());

    // 點「取消」（ConfirmModal cancel）
    fireEvent.click(screen.getByText('取消'));
    expect(mockedAdvanceApproval).not.toHaveBeenCalled();
    expect(screen.queryByTestId('list-definitions-page')).not.toBeInTheDocument();
  });

  // ── TC-F084-FE-011：手動 fallback — API 422 → 顯示錯誤訊息，不 redirect ──
  it('TC-F084-FE-011：手動推進 422 STAGE_ADVANCE_PRECONDITION_FAILED → 顯示錯誤、不 redirect', async () => {
    mockedAdvanceApproval.mockRejectedValue({
      response: {
        status: 422,
        data: {
          error: 'STAGE_ADVANCE_PRECONDITION_FAILED',
          message: '以下部門的個別業務比例尚未完成設定：南一處（XTD0）',
        },
      },
    });
    renderPage();
    await waitFor(() => expect(screen.getByTestId('btn-advance-approval')).toBeEnabled());
    fireEvent.click(screen.getByTestId('btn-advance-approval'));
    await waitFor(() => expect(screen.getByTestId('confirm-advance-modal')).toBeInTheDocument());
    fireEvent.click(screen.getByTestId('btn-confirm-advance'));

    await waitFor(() => expect(mockedAdvanceApproval).toHaveBeenCalledWith(LIST_NO));
    await waitFor(() => expect(screen.getByText(/尚未完成設定/)).toBeInTheDocument());
    // 不 redirect
    expect(screen.queryByTestId('list-definitions-page')).not.toBeInTheDocument();
  });
});
