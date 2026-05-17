import { render, screen, cleanup, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import { Stage0EstimatePage } from '../stage0-estimate-page';
import { ToastProvider } from '@/components/ui/toast';
import * as runApi from '@/api/assignment-run';
import * as listApi from '@/api/assignment-list';
import * as authStore from '@/stores/auth-store';

/**
 * F049 Stage 0 試算頁全面改造（Phase 2）
 *
 * 對應 prototype 30-stage0-estimate.html
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

const mockedGetDaily = vi.mocked(runApi.getDailyEstimate);
const mockedGetListEstimate = vi.mocked(runApi.getListEstimate);
const mockedListLists = vi.mocked(listApi.listLists);
const mockedGetUser = vi.mocked(authStore.getUser);
const mockedGetBusinessRole = vi.mocked(authStore.getBusinessRole);

const LISTS_RESP = {
  selectedYm: '202605',
  currentWorkYm: '202605',
  isHistorical: false,
  isFuture: false,
  lockState: { locked: false, reason: null },
  lists: [
    {
      listNo: 'OB202605001',
      listNm: '汽車期中',
      prodKind: 'A',
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
    },
    {
      listNo: 'OB202605002',
      listNm: '機車期中',
      prodKind: 'B',
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
    },
  ],
  stageCounts: {
    draft: 0,
    dept_ratio: 0,
    personnel_ratio: 0,
    approval: 0,
    ready: 2,
    disabled: 0,
  },
};

function renderPage() {
  return render(
    <MemoryRouter>
      <ToastProvider>
        <Stage0EstimatePage />
      </ToastProvider>
    </MemoryRouter>,
  );
}

describe('Stage0EstimatePage (Phase 2 改造)', () => {
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
    mockedListLists.mockResolvedValue(LISTS_RESP);
    mockedGetDaily.mockResolvedValue({
      ym: '202605',
      workingDays: 20,
      totalEstimate: 9500,
      poolCount: 9500,
      warning: null,
      dailyEstimates: [
        { date: '2026-05-01', weekday: '五', estimate: 475 },
        { date: '2026-05-02', weekday: '六', estimate: 0 },
        { date: '2026-05-04', weekday: '一', estimate: 475 },
      ],
    });
    mockedGetListEstimate.mockResolvedValue({
      listNo: 'OB202605001',
      count: 5000,
    });
  });
  afterEach(() => cleanup());

  it('左側顯示試算輸入面板', async () => {
    renderPage();
    await waitFor(() => {
      expect(screen.getByTestId('input-list-no')).toBeInTheDocument();
    });
    expect(screen.getByTestId('input-total-count')).toBeInTheDocument();
  });

  it('輸入面板含可選名單', async () => {
    renderPage();
    await waitFor(() => {
      const sel = screen.getByTestId('input-list-no') as HTMLSelectElement;
      expect(sel.options.length).toBeGreaterThan(1);
    });
  });

  it('右側顯示 4 KPI 卡（working_days / total / base / remainder）', async () => {
    renderPage();
    await waitFor(() => {
      expect(screen.getByTestId('kpi-working-days')).toBeInTheDocument();
    });
    expect(screen.getByTestId('kpi-total-estimate')).toBeInTheDocument();
    expect(screen.getByTestId('kpi-base')).toBeInTheDocument();
    expect(screen.getByTestId('kpi-remainder')).toBeInTheDocument();
  });

  it('working_days KPI 顯示後端回傳 workingDays', async () => {
    renderPage();
    await waitFor(() => {
      const k = screen.getByTestId('kpi-working-days');
      expect(k.textContent).toContain('20');
    });
  });

  it('Pool 偏低警示 banner（warning="POOL_COUNT_LOW"）', async () => {
    mockedGetDaily.mockResolvedValue({
      ym: '202605',
      workingDays: 20,
      totalEstimate: 800,
      poolCount: 800,
      warning: 'POOL_COUNT_LOW',
      dailyEstimates: [],
    });
    renderPage();
    await waitFor(() => {
      expect(screen.getByTestId('pool-low-warning')).toBeInTheDocument();
    });
  });

  it('warning=null 不顯示 pool 警示', async () => {
    renderPage();
    await waitFor(() => {
      expect(screen.getByTestId('kpi-working-days')).toBeInTheDocument();
    });
    expect(screen.queryByTestId('pool-low-warning')).not.toBeInTheDocument();
  });

  it('每日明細表格含 date / weekday / 預估件數 / 累積 / 餘數補 5 欄', async () => {
    renderPage();
    await waitFor(() => {
      expect(screen.getByTestId('stage0-daily-table')).toBeInTheDocument();
    });
    const table = screen.getByTestId('stage0-daily-table');
    expect(table.textContent).toContain('calendar_date');
    expect(table.textContent).toContain('累積');
    expect(table.textContent).toContain('餘數補');
  });

  it('右側顯示每日預估 bar chart', async () => {
    renderPage();
    await waitFor(() => {
      const bars = screen.getAllByTestId(/^bar-/);
      expect(bars.length).toBeGreaterThan(0);
    });
  });

  it('section_chief 顯示處長唯讀提示', async () => {
    mockedGetBusinessRole.mockReturnValue('section_chief');
    renderPage();
    await waitFor(() => {
      expect(screen.getByTestId('director-readonly-banner')).toBeInTheDocument();
    });
  });
});
