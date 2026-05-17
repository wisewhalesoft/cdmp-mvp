import { render, screen, cleanup, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { ReadySummaryListPage } from '../ready-summary-list-page';
import { ToastProvider } from '@/components/ui/toast';
import * as assignmentListApi from '@/api/assignment-list';
import * as authStore from '@/stores/auth-store';
import type { AssignmentListItem, ListListsResponse } from '@/api/assignment-list';

/**
 * 29d 模式 A：本月 ready 名單清單頁面測試
 *
 * 對應 prototype 29d-ready-summary.html L177-222
 */

vi.mock('@/api/assignment-list');
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
const mockedGetUser = vi.mocked(authStore.getUser);
const mockedGetBusinessRole = vi.mocked(authStore.getBusinessRole);

const makeList = (
  no: string,
  stage: AssignmentListItem['stage'],
  nm = `名單${no}`,
): AssignmentListItem => ({
  listNo: no,
  listNm: nm,
  prodKind: 'A1',
  caseYear: '3',
  specTp: '01',
  listPeriodStart: 0,
  listPeriodEnd: 999,
  listInterval: 30,
  settleSrc: 'N',
  cardType: 'M3',
  prodBest: null,
  status: 'active',
  stage,
  createdBy: '張部長',
  createdAt: '2026-05-14T17:32:00.000Z',
  updatedAt: '2026-05-14T17:32:00.000Z',
});

function makeResp(lists: AssignmentListItem[]): ListListsResponse {
  return {
    selectedYm: '202605',
    currentWorkYm: '202605',
    isHistorical: false,
    isFuture: false,
    lockState: { locked: false, reason: null },
    lists,
    stageCounts: {
      draft: lists.filter((l) => l.stage === 'draft').length,
      dept_ratio: lists.filter((l) => l.stage === 'dept_ratio').length,
      personnel_ratio: lists.filter((l) => l.stage === 'personnel_ratio').length,
      approval: lists.filter((l) => l.stage === 'approval').length,
      ready: lists.filter((l) => l.stage === 'ready').length,
      disabled: 0,
    },
  };
}

function renderPage() {
  return render(
    <MemoryRouter initialEntries={['/assignment/ready-summary']}>
      <ToastProvider>
        <Routes>
          <Route
            path="/assignment/ready-summary"
            element={<ReadySummaryListPage />}
          />
        </Routes>
      </ToastProvider>
    </MemoryRouter>,
  );
}

describe('ReadySummaryListPage (29d 模式 A)', () => {
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
  });

  afterEach(() => {
    cleanup();
  });

  it('全部 ready：顯示綠色月跑就緒 banner + 執行月跑 CTA', async () => {
    mockedListLists.mockResolvedValue(
      makeResp([
        makeList('OB001', 'ready'),
        makeList('OB002', 'ready'),
      ]),
    );
    renderPage();
    await waitFor(() => {
      expect(screen.getByTestId('all-ready-banner')).toBeInTheDocument();
    });
    expect(screen.getByTestId('btn-run-month')).toBeInTheDocument();
  });

  it('部分 ready：顯示橙色 partial banner + 未 ready 清單', async () => {
    mockedListLists.mockResolvedValue(
      makeResp([
        makeList('OB001', 'ready'),
        makeList('OB002', 'personnel_ratio'),
        makeList('OB003', 'draft'),
      ]),
    );
    renderPage();
    await waitFor(() => {
      expect(screen.getByTestId('partial-ready-banner')).toBeInTheDocument();
    });
    // 未 ready 數量
    const banner = screen.getByTestId('partial-ready-banner');
    expect(banner.textContent).toContain('2'); // 2 筆未 ready
  });

  it('沒有任何 ready 名單：顯示「無 ready 名單」訊息', async () => {
    mockedListLists.mockResolvedValue(
      makeResp([makeList('OB001', 'draft')]),
    );
    renderPage();
    await waitFor(() => {
      expect(screen.getByTestId('no-ready-empty')).toBeInTheDocument();
    });
  });

  it('已 ready 名單以卡片清單呈現', async () => {
    mockedListLists.mockResolvedValue(
      makeResp([
        makeList('OB001', 'ready', '名單 A'),
        makeList('OB002', 'ready', '名單 B'),
      ]),
    );
    renderPage();
    await waitFor(() => {
      expect(screen.getByTestId('ready-card-OB001')).toBeInTheDocument();
    });
    expect(screen.getByTestId('ready-card-OB002')).toBeInTheDocument();
    expect(screen.getByText('名單 A')).toBeInTheDocument();
  });

  it('點 ready 卡片跳轉至 ready-summary 詳情頁', async () => {
    mockedListLists.mockResolvedValue(
      makeResp([makeList('OB001', 'ready')]),
    );
    renderPage();
    await waitFor(() => {
      expect(screen.getByTestId('ready-card-OB001')).toBeInTheDocument();
    });
    // 卡片內部含「查看詳情」link/button
    expect(
      screen.getByTestId('ready-card-link-OB001'),
    ).toHaveAttribute('href', '/assignment/ready-summary/OB001');
  });

  it('「執行月跑」按鈕在沒有任何 ready 時 disabled', async () => {
    mockedListLists.mockResolvedValue(
      makeResp([makeList('OB001', 'draft')]),
    );
    renderPage();
    await waitFor(() => {
      expect(screen.getByTestId('btn-run-month')).toBeInTheDocument();
    });
    expect(screen.getByTestId('btn-run-month')).toBeDisabled();
  });

  it('section_chief 視角顯示「處長轄區」提示 banner', async () => {
    mockedGetBusinessRole.mockReturnValue('section_chief');
    mockedListLists.mockResolvedValue(
      makeResp([makeList('OB001', 'ready')]),
    );
    renderPage();
    await waitFor(() => {
      expect(screen.getByTestId('section-chief-scope-banner')).toBeInTheDocument();
    });
  });
});
