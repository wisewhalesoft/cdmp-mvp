/**
 * F050 v2.2 §7 BR-13 / US-133 — Producer 端測試
 *
 * 對應 test spec：F050-test.md SIG 群組 TS-F050-SIG-001~003
 *   - SIG-001：F079（29a dept-ratio）advance 成功後寫入 cdmp.pendingToast
 *   - SIG-002：F082（29b personnel-ratio）advance 成功後寫入 cdmp.pendingToast
 *   - SIG-003：F086（29c approval）approve 成功後寫入 cdmp.pendingToast
 *
 * 驗證原則：
 *   - 寫入時機：API 成功 → setItem('cdmp.pendingToast', JSON) → navigate('/assignment/list-definitions')
 *   - payload 結構：{ type, msg, sub }
 *   - 寫入動作發生於 navigate 之前（用 sessionStorage 攔截 + navigate mock 順序檢查）
 *
 * 補充：sessionStorage 寫入 / 讀取 helper 邏輯本身已在
 *   _utils/pending-toast.ts 內以 pure function 形式測試（commit 3 引入）。
 *   本檔聚焦於 producer 子頁與 helper 的整合。
 */

import { render, screen, cleanup, waitFor, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { ToastProvider } from '@/components/ui/toast';
import * as assignmentListApi from '@/api/assignment-list';
import * as assignmentStageApi from '@/api/assignment-stage';
import * as authStore from '@/stores/auth-store';
import { DeptRatioConfigPage } from '../dept-ratio-config-page';
import { PersonnelRatioConfigPage } from '../personnel-ratio-config-page';
import { ApprovalReviewPage } from '../approval-review-page';

vi.mock('@/api/assignment-list');
vi.mock('@/api/assignment-stage');
vi.mock('@/api/auth', () => ({ logout: vi.fn().mockResolvedValue({}) }));
vi.mock('@/stores/auth-store', async () => {
  const actual = await vi.importActual('@/stores/auth-store');
  return {
    ...actual,
    getUser: vi.fn(),
    clearAuth: vi.fn(),
    getBusinessRole: vi.fn(),
    getEffectiveIdentity: vi.fn(),
  };
});

const mockedListLists = vi.mocked(assignmentListApi.listLists);
const mockedGetDeptRatios = vi.mocked(assignmentStageApi.getDeptRatios);
const mockedGetPersonnelRatios = vi.mocked(assignmentStageApi.getPersonnelRatios);
const mockedAdvancePersonnel = vi.mocked(assignmentStageApi.advanceToPersonnelRatio);
const mockedAdvanceApproval = vi.mocked(assignmentStageApi.advanceToApproval);
const mockedApprove = vi.mocked(assignmentStageApi.approveList);
const mockedRollbackDraft = vi.mocked(assignmentStageApi.rollbackToDraft);
const mockedGetApprovalHistory = vi.mocked(assignmentStageApi.getApprovalHistory);

/** 對齊 spec F079 §5.1 之完整 GET response shape */
function getDeptResp(
  deptRatios: Array<{ obdeptId: string; obdeptNm: string; ration: number }>,
): assignmentStageApi.GetDeptRatiosResponse {
  return {
    listNo: 'OB202605003',
    listNm: '測試名單',
    projectWorkym: '202605',
    stage: 'dept_ratio',
    deptRatios: deptRatios.map((d) => ({ ...d, isActive: true, directorName: null })),
    total: deptRatios.reduce((s, d) => s + d.ration, 0),
    isReadOnly: false,
  };
}

/** 對齊 spec F082 §5.1 之完整 GET response shape */
function getPersonnelResp(
  departments: assignmentStageApi.PersonnelRatioDepartment[] = [],
): assignmentStageApi.GetPersonnelRatiosResponse {
  return {
    listNo: 'OB202605003',
    listNm: '測試名單',
    projectWorkym: '202605',
    stage: 'personnel_ratio',
    isReadOnly: false,
    viewerRole: 'director',
    departments,
    latestRejection: null,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  window.sessionStorage.clear();
  vi.mocked(authStore.getBusinessRole).mockReturnValue('director');
  vi.mocked(authStore.getEffectiveIdentity).mockReturnValue('director');
  vi.mocked(authStore.getUser).mockReturnValue({
    id: 'u-1',
    name: '王部長',
    email: 'dir@cdmp.test',
    role: 'user',
    businessRole: 'director',
  });
});

afterEach(cleanup);

function renderPage(path: string, listNo = 'OB202605003') {
  return render(
    <ToastProvider>
      <MemoryRouter initialEntries={[`/assignment/lists/${listNo}${path}`]}>
        <Routes>
          <Route
            path="/assignment/lists/:listNo/dept-ratio"
            element={<DeptRatioConfigPage />}
          />
          <Route
            path="/assignment/lists/:listNo/personnel-ratio"
            element={<PersonnelRatioConfigPage />}
          />
          <Route
            path="/assignment/lists/:listNo/approval"
            element={<ApprovalReviewPage />}
          />
          <Route
            path="/assignment/list-definitions"
            element={<div data-testid="m01-main">M01 main page</div>}
          />
        </Routes>
      </MemoryRouter>
    </ToastProvider>,
  );
}

function buildBaseList(stage: string, listNo = 'OB202605003') {
  return {
    selectedYm: '202605',
    currentWorkYm: '202605',
    isHistorical: false,
    isFuture: false,
    lockState: { locked: false, reason: null },
    lists: [
      {
        listNo,
        listNm: 'Test 名單',
        prodKind: null,
        caseYear: null,
        specTp: null,
        caseStatus: null,
        crEnabled: false,
        listPeriodStart: null,
        listPeriodEnd: null,
        listInterval: null,
        settleSrc: null,
        cardType: null,
        prodBest: null,
        status: 'active' as const,
        stage: stage as any,
        createdBy: 'u-1',
        createdAt: '2026-05-09T00:00:00Z',
        updatedAt: '2026-05-09T00:00:00Z',
        conditionPayload: null,
      },
    ],
    stageCounts: {
      draft: 0,
      dept_ratio: 0,
      personnel_ratio: 0,
      approval: 0,
      ready: 0,
      disabled: 0,
    },
  };
}

describe('F050 v2.2 §7 BR-13 — Producer 端（TS-F050-SIG-001~003）', () => {
  it('SIG-001 F079（29a dept-ratio）推進成功 → 寫 pendingToast → 跳回 M01', async () => {
    mockedListLists.mockResolvedValue(buildBaseList('dept_ratio'));
    mockedGetDeptRatios.mockResolvedValue(
      getDeptResp([
        { obdeptId: 'XTA0', obdeptNm: '業務一部', ration: 60 },
        { obdeptId: 'XTB0', obdeptNm: '業務二部', ration: 40 },
      ]),
    );
    mockedAdvancePersonnel.mockResolvedValue({
      listNo: 'OB202605003',
      stage: 'personnel_ratio',
    });

    renderPage('/dept-ratio');

    await waitFor(() => {
      expect(screen.getByTestId('btn-advance-personnel-ratio')).toBeTruthy();
    });
    fireEvent.click(screen.getByTestId('btn-advance-personnel-ratio'));
    await waitFor(() => {
      expect(screen.getByTestId('confirm-advance-modal')).toBeTruthy();
    });
    fireEvent.click(screen.getByTestId('btn-confirm-advance'));

    // 等待 navigate 完成
    await waitFor(() => {
      expect(screen.getByTestId('m01-main')).toBeTruthy();
    });

    // sessionStorage 已寫入 pendingToast
    const raw = window.sessionStorage.getItem('cdmp.pendingToast');
    expect(raw).not.toBeNull();
    const payload = JSON.parse(raw!);
    expect(payload.type).toBe('success');
    expect(payload.msg).toContain('OB202605003');
    expect(payload.sub).toContain('個別比例');
  });

  it('SIG-001b F079 退回草稿成功 → 寫 info pendingToast → 跳回 M01', async () => {
    mockedListLists.mockResolvedValue(buildBaseList('dept_ratio'));
    mockedGetDeptRatios.mockResolvedValue(getDeptResp([]));
    mockedRollbackDraft.mockResolvedValue({ listNo: 'OB202605003', stage: 'draft' });

    renderPage('/dept-ratio');

    await waitFor(() => {
      expect(screen.getByTestId('btn-rollback-draft')).toBeTruthy();
    });
    fireEvent.click(screen.getByTestId('btn-rollback-draft'));
    await waitFor(() => {
      expect(screen.getByTestId('confirm-rollback-modal')).toBeTruthy();
    });
    fireEvent.click(screen.getByTestId('btn-confirm-rollback'));

    await waitFor(() => {
      expect(screen.getByTestId('m01-main')).toBeTruthy();
    });

    const raw = window.sessionStorage.getItem('cdmp.pendingToast');
    expect(raw).not.toBeNull();
    const payload = JSON.parse(raw!);
    expect(payload.type).toBe('info');
    expect(payload.msg).toContain('已退回草稿');
  });

  it('SIG-002 F082（29b personnel-ratio）推進成功 → 寫 success pendingToast → 跳回 M01', async () => {
    mockedListLists.mockResolvedValue(buildBaseList('personnel_ratio'));
    mockedGetDeptRatios.mockResolvedValue(
      getDeptResp([{ obdeptId: 'XTA0', obdeptNm: '業務一部', ration: 100 }]),
    );
    mockedGetPersonnelRatios.mockResolvedValue(getPersonnelResp());
    mockedAdvanceApproval.mockResolvedValue({
      listNo: 'OB202605003',
      stage: 'approval',
    });

    renderPage('/personnel-ratio');

    await waitFor(() => {
      expect(screen.getByTestId('btn-advance-approval')).toBeTruthy();
    });
    fireEvent.click(screen.getByTestId('btn-advance-approval'));
    await waitFor(() => {
      expect(screen.getByTestId('confirm-advance-modal')).toBeTruthy();
    });
    fireEvent.click(screen.getByTestId('btn-confirm-advance'));

    await waitFor(() => {
      expect(screen.getByTestId('m01-main')).toBeTruthy();
    });

    const raw = window.sessionStorage.getItem('cdmp.pendingToast');
    expect(raw).not.toBeNull();
    const payload = JSON.parse(raw!);
    expect(payload.type).toBe('success');
    expect(payload.msg).toContain('OB202605003');
  });

  it('SIG-003 F086（29c approval）核准成功 → 寫 success pendingToast → 跳回 M01', async () => {
    mockedListLists.mockResolvedValue(buildBaseList('approval'));
    mockedGetDeptRatios.mockResolvedValue(
      getDeptResp([{ obdeptId: 'XTA0', obdeptNm: '業務一部', ration: 100 }]),
    );
    mockedGetPersonnelRatios.mockResolvedValue(getPersonnelResp());
    mockedGetApprovalHistory.mockResolvedValue({
      listNo: 'OB202605003',
      history: [],
    });
    mockedApprove.mockResolvedValue({ listNo: 'OB202605003', stage: 'ready' });

    renderPage('/approval');

    await waitFor(() => {
      expect(screen.getByTestId('btn-approve')).toBeTruthy();
    });
    fireEvent.click(screen.getByTestId('btn-approve'));
    await waitFor(() => {
      expect(screen.getByTestId('confirm-approve-modal')).toBeTruthy();
    });
    fireEvent.click(screen.getByTestId('btn-confirm-approve'));

    await waitFor(() => {
      expect(screen.getByTestId('m01-main')).toBeTruthy();
    });

    const raw = window.sessionStorage.getItem('cdmp.pendingToast');
    expect(raw).not.toBeNull();
    const payload = JSON.parse(raw!);
    expect(payload.type).toBe('success');
    expect(payload.msg).toContain('OB202605003');
    expect(payload.msg).toContain('核准');
  });
});
