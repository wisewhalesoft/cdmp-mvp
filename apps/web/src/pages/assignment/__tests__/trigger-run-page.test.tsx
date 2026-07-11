import { render, screen, cleanup, fireEvent, waitFor, within } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { TriggerRunPage } from '../trigger-run-page';
import { AssignmentWorkYmProvider } from '@/contexts/assignment-work-ym-context';
import { ToastProvider } from '@/components/ui/toast';
import * as runApi from '@/api/assignment-run';
import * as listApi from '@/api/assignment-list';
import * as authStore from '@/stores/auth-store';
import type { ReadinessResponse } from '@/api/assignment-run';
import type { ListListsResponse } from '@/api/assignment-list';

/**
 * F061 觸發月跑頁全面改造（Phase 2）
 *
 * 對應 prototype 31-trigger-run.html
 */

vi.mock('@/api/assignment-run');
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

const mockedGetReadiness = vi.mocked(runApi.getReadiness);
const mockedTriggerRun = vi.mocked(runApi.triggerRun);
const mockedListLists = vi.mocked(listApi.listLists);
const mockedGetCurrentWorkYm = vi.mocked(listApi.getCurrentWorkYm);
const mockedGetUser = vi.mocked(authStore.getUser);
const mockedGetBusinessRole = vi.mocked(authStore.getBusinessRole);

function makeReadiness(overrides: Partial<ReadinessResponse> = {}): ReadinessResponse {
  return {
    workYm: '202605',
    totalActiveLists: 2,
    readyCount: 2,
    notReadyLists: [],
    allReady: true,
    monthlyRunStatus: 'none',
    scoringActive: true,
    etlStatus: {
      pooldata: { status: 'completed', lastRunAt: '2026-05-15T03:00:00Z', rowCount: 9500 },
      emphire: { status: 'completed', lastRunAt: '2026-05-15T03:00:00Z', rowCount: 238 },
      calendar: { status: 'completed', lastRunAt: '2026-05-15T03:00:00Z', rowCount: 365 },
      arreturndf: { status: 'completed', lastRunAt: '2026-05-15T03:00:00Z', rowCount: 9420 },
    },
    sourcesAllHaveData: true,
    emptySourceTables: [],
    ...overrides,
  };
}

function makeListsResp(stages: ListListsResponse['lists'] = []): ListListsResponse {
  return {
    selectedYm: '202605',
    currentWorkYm: '202605',
    isHistorical: false,
    isFuture: false,
    lockState: { locked: false, reason: null },
    lists: stages,
    stageCounts: {
      draft: 0,
      dept_ratio: 0,
      personnel_ratio: 0,
      approval: 0,
      ready: stages.length,
      disabled: 0,
    },
  };
}

const READY_LIST = {
  listNo: 'OB202605001',
  listNm: '汽車期中',
  prodKind: 'A1',
  caseYear: null,
  specTp: null,
  listPeriodStart: 0,
  listPeriodEnd: 999,
  listInterval: 30,
  settleSrc: null,
  cardType: null,
  prodBest: null,
  status: 'active' as const,
  stage: 'ready' as const,
  createdBy: '張部長',
  createdAt: '2026-05-15T00:00:00Z',
  updatedAt: '2026-05-15T00:00:00Z',
};

function renderPage() {
  return render(
    <MemoryRouter initialEntries={['/assignment/run']}>
      <ToastProvider>
        <AssignmentWorkYmProvider>
          <Routes>
            <Route path="/assignment/run" element={<TriggerRunPage />} />
            <Route path="/assignment/run-progress" element={<div data-testid="progress-stub" />} />
          </Routes>
        </AssignmentWorkYmProvider>
      </ToastProvider>
    </MemoryRouter>,
  );
}

describe('TriggerRunPage (Phase 2 改造)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockedGetUser.mockReturnValue({
      id: 'd1',
      name: '張部長',
      email: 'd@test',
      role: 'user',
      businessRole: 'director',
      status: 'active',
    } as any);
    mockedGetBusinessRole.mockReturnValue('director');
    mockedGetReadiness.mockResolvedValue(makeReadiness());
    mockedListLists.mockResolvedValue(makeListsResp([READY_LIST]));
    // F097：Context 初始化 → currentWorkYm=202605 → targetWorkYm=202606（下月）
    mockedGetCurrentWorkYm.mockResolvedValue({ currentWorkYm: '202605' });
  });

  afterEach(() => cleanup());

  it('載入時顯示 7 項 pre-check', async () => {
    renderPage();
    await waitFor(() => {
      expect(screen.getByTestId('pre-check-summary')).toBeInTheDocument();
    });
    const items = screen.getAllByTestId(/^pre-check-item-/);
    expect(items.length).toBe(7);
  });

  it('全部 pre-check pass 時「啟動月跑」按鈕 enabled', async () => {
    renderPage();
    await waitFor(() => {
      expect(screen.getByTestId('btn-start-run')).not.toBeDisabled();
    });
  });

  it('有 pre-check fail 時「啟動月跑」按鈕 disabled', async () => {
    mockedGetReadiness.mockResolvedValue(
      makeReadiness({ scoringActive: false }),
    );
    renderPage();
    await waitFor(() => {
      expect(screen.getByTestId('btn-start-run')).toBeInTheDocument();
    });
    expect(screen.getByTestId('btn-start-run')).toBeDisabled();
  });

  it('顯示本次執行摘要 panel（active 名單列表 + 預估筆數）', async () => {
    renderPage();
    await waitFor(() => {
      expect(screen.getByTestId('active-list-count')).toBeInTheDocument();
    });
    expect(screen.getByText('OB202605001')).toBeInTheDocument();
  });

  it('monthlyRunStatus=running 時顯示 409 執行中 banner + 跳轉連結', async () => {
    mockedGetReadiness.mockResolvedValue(
      makeReadiness({ monthlyRunStatus: 'running' }),
    );
    renderPage();
    await waitFor(() => {
      expect(screen.getByTestId('running-banner')).toBeInTheDocument();
    });
  });

  it('section_chief 視角顯示「處長唯讀」banner', async () => {
    mockedGetBusinessRole.mockReturnValue('section_chief');
    renderPage();
    await waitFor(() => {
      expect(screen.getByTestId('director-readonly-banner')).toBeInTheDocument();
    });
  });

  it('section_chief 視角隱藏「啟動月跑」按鈕', async () => {
    mockedGetBusinessRole.mockReturnValue('section_chief');
    renderPage();
    await waitFor(() => {
      expect(screen.getByTestId('director-readonly-banner')).toBeInTheDocument();
    });
    expect(screen.queryByTestId('btn-start-run')).not.toBeInTheDocument();
  });

  it('點「啟動月跑」開啟 confirm modal', async () => {
    renderPage();
    await waitFor(() => {
      expect(screen.getByTestId('btn-start-run')).not.toBeDisabled();
    });
    fireEvent.click(screen.getByTestId('btn-start-run'));
    await waitFor(() => {
      expect(screen.getByTestId('confirm-trigger-modal')).toBeInTheDocument();
    });
  });

  it('confirm 後觸發 triggerRun API + 導向進度頁', async () => {
    mockedTriggerRun.mockResolvedValue({
      runId: 'r-1',
      ym: '202606',
      status: 'pending',
      triggeredAt: '2026-05-15T12:00:00Z',
    });
    renderPage();
    await waitFor(() => {
      expect(screen.getByTestId('btn-start-run')).not.toBeDisabled();
    });
    fireEvent.click(screen.getByTestId('btn-start-run'));
    await waitFor(() => {
      expect(screen.getByTestId('btn-confirm-trigger')).toBeInTheDocument();
    });
    fireEvent.click(screen.getByTestId('btn-confirm-trigger'));
    await waitFor(() => {
      expect(mockedTriggerRun).toHaveBeenCalled();
    });
  });

  // =====================================================================
  // F097 — readiness 帶選定月 / triggerRun(workYm) / modal / MonthPicker / labels
  // =====================================================================

  it('TS-F097-TRIGGER-001：readiness check 使用選定月 ?ym=202606（非 202605）', async () => {
    renderPage();
    await waitFor(() => {
      expect(mockedGetReadiness).toHaveBeenCalledWith('202606');
    });
    // listLists 同步帶選定月
    expect(mockedListLists).toHaveBeenCalledWith({ ym: '202606' });
    // 不以 new Date() 執行月（202605）查詢
    expect(mockedGetReadiness).not.toHaveBeenCalledWith('202605');
  });

  it('TS-F097-TRIGGER-002：triggerRun 帶 workYm=202606', async () => {
    mockedTriggerRun.mockResolvedValue({
      runId: 'r-1',
      ym: '202606',
      status: 'pending',
      triggeredAt: '2026-05-15T12:00:00Z',
    });
    renderPage();
    await waitFor(() => expect(screen.getByTestId('btn-start-run')).not.toBeDisabled());
    fireEvent.click(screen.getByTestId('btn-start-run'));
    await waitFor(() => expect(screen.getByTestId('btn-confirm-trigger')).toBeInTheDocument());
    fireEvent.click(screen.getByTestId('btn-confirm-trigger'));
    await waitFor(() => expect(mockedTriggerRun).toHaveBeenCalledWith('202606'));
  });

  it('TS-F097-TRIGGER-003：confirm modal 標題顯示選定月份 2026-06（非 2026-05）', async () => {
    renderPage();
    await waitFor(() => expect(screen.getByTestId('btn-start-run')).not.toBeDisabled());
    fireEvent.click(screen.getByTestId('btn-start-run'));
    await waitFor(() => {
      const modal = screen.getByTestId('confirm-trigger-modal');
      expect(modal.textContent).toContain('2026-06');
      expect(modal.textContent).not.toContain('2026-05');
    });
  });

  it('TS-F097-TRIGGER-004 / 005：trigger-run-month-picker + btn-start-run + confirm-trigger-modal testid 保留', async () => {
    renderPage();
    await waitFor(() => expect(screen.getByTestId('btn-start-run')).not.toBeDisabled());
    expect(screen.getByTestId('trigger-run-month-picker')).toBeInTheDocument();
    fireEvent.click(screen.getByTestId('btn-start-run'));
    await waitFor(() => expect(screen.getByTestId('confirm-trigger-modal')).toBeInTheDocument());
  });

  it('TS-F097-RBAC-001：section_chief → MonthPicker disabled，仍顯示 202606', async () => {
    mockedGetBusinessRole.mockReturnValue('section_chief');
    renderPage();
    await waitFor(() => {
      expect(screen.getByTestId('trigger-run-month-picker')).toBeInTheDocument();
    });
    const picker = screen.getByTestId('trigger-run-month-picker');
    const select = within(picker).getByTestId('month-picker-select') as HTMLSelectElement;
    expect(select.disabled).toBe(true);
    expect(select.value).toBe('2026-06');
  });

  it('TS-F097-LABEL-001 / 002：MonthPicker label 「分派作業月份」，無「作業年月」舊字串', async () => {
    renderPage();
    await waitFor(() => expect(screen.getByTestId('trigger-run-month-picker')).toBeInTheDocument());
    // MonthPicker 標籤存在於 trigger-run-month-picker 內
    const picker = screen.getByTestId('trigger-run-month-picker');
    expect(within(picker).getByText('分派作業月份')).toBeInTheDocument();
    // 整頁無「作業年月」舊字串
    expect(screen.queryByText(/作業年月/)).not.toBeInTheDocument();
  });
});
