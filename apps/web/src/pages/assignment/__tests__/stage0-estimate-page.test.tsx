import { render, screen, cleanup, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import { Stage0EstimatePage } from '../stage0-estimate-page';
import { ToastProvider } from '@/components/ui/toast';
import * as runApi from '@/api/assignment-run';
import * as listApi from '@/api/assignment-list';
import * as authStore from '@/stores/auth-store';
import type { DailyEstimateResponse } from '@/api/assignment-run';

/**
 * F049 v1.3 Stage 0 試算頁（Design A + 對齊 prototype 30-stage0-estimate.html）
 *
 * 涵蓋 TS-F049-V13F-001~005 / 008 / 009（page 層 Component 測試）。
 * V13F-006（純函式）/ V13F-007（bar chart 渲染）在 stage0-bar-chart.test.tsx。
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

// ---- 工具：建構 active list ----
function activeList(listNo: string, listNm: string) {
  return {
    listNo,
    listNm,
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
  };
}

function listsResp(lists: ReturnType<typeof activeList>[]) {
  return {
    selectedYm: '202605',
    currentWorkYm: '202605',
    isHistorical: false,
    isFuture: false,
    lockState: { locked: false, reason: null },
    lists,
    stageCounts: {
      draft: 0,
      dept_ratio: 0,
      personnel_ratio: 0,
      approval: 0,
      ready: lists.length,
      disabled: 0,
    },
  };
}

// ---- 工具：建構 Design A daily-estimate response ----
function dailyResp(
  overrides: Partial<DailyEstimateResponse> = {},
): DailyEstimateResponse {
  const workingDays = overrides.workingDays ?? 20;
  const ratio = workingDays > 0 ? Math.floor(1000 / workingDays) : 0;
  return {
    ym: '202605',
    calendarSource: 'weekday',
    startDate: '2026-05-01',
    endDate: '2026-05-31',
    workingDays,
    baseRatio: ratio,
    remainder: workingDays > 0 ? 1000 % workingDays : 0,
    poolCount: 50000,
    warning: null,
    dailyEstimates: [
      { date: '2026-05-01', weekday: '五', isWorkday: false, skipReason: '國定假日', ratioPerMille: 0 },
      { date: '2026-05-02', weekday: '六', isWorkday: false, skipReason: '週末', ratioPerMille: 0 },
      { date: '2026-05-04', weekday: '一', isWorkday: true, skipReason: null, ratioPerMille: ratio },
      { date: '2026-05-05', weekday: '二', isWorkday: true, skipReason: null, ratioPerMille: ratio },
    ],
    ...overrides,
  };
}

function renderPage() {
  return render(
    <MemoryRouter>
      <ToastProvider>
        <Stage0EstimatePage />
      </ToastProvider>
    </MemoryRouter>,
  );
}

describe('Stage0EstimatePage (v1.3 Design A)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockedGetUser.mockReturnValue({
      id: 'd1',
      name: '張部長',
      email: 'd@test',
      role: 'user',
      businessRole: 'director',
      status: 'active',
    } as never);
    mockedGetBusinessRole.mockReturnValue('director');
    mockedListLists.mockResolvedValue(
      listsResp([
        activeList('OB202605001', '汽車期中'),
        activeList('OB202605002', '機車期中'),
      ]),
    );
    mockedGetDaily.mockResolvedValue(dailyResp());
    mockedGetListEstimate.mockResolvedValue({ listNo: 'OB202605001', count: 8500 });
  });
  afterEach(() => cleanup());

  it('左側顯示試算輸入面板 + 右側 4 KPI', async () => {
    renderPage();
    await waitFor(() => {
      expect(screen.getByTestId('input-list-no')).toBeInTheDocument();
    });
    expect(screen.getByTestId('kpi-working-days')).toBeInTheDocument();
    expect(screen.getByTestId('kpi-total-estimate')).toBeInTheDocument();
    expect(screen.getByTestId('kpi-base')).toBeInTheDocument();
    expect(screen.getByTestId('kpi-remainder')).toBeInTheDocument();
  });

  it('working_days KPI 顯示後端 workingDays', async () => {
    renderPage();
    await waitFor(() => {
      expect(screen.getByTestId('kpi-working-days').textContent).toContain('20');
    });
  });

  it('base ratio KPI 顯示後端 baseRatio（千分位）', async () => {
    renderPage();
    await waitFor(() => {
      expect(screen.getByTestId('kpi-base').textContent).toContain('50');
    });
  });

  // ---- TS-F049-V13F-001：自動選第一筆 active 名單；無空選項 ----
  it('TS-F049-V13F-001：初載自動選第一筆 active 名單；selector 無空選項；KPI total=per-list COUNT', async () => {
    renderPage();
    await waitFor(() => {
      const sel = screen.getByTestId('input-list-no') as HTMLSelectElement;
      expect(sel.value).toBe('OB202605001');
    });
    const sel = screen.getByTestId('input-list-no') as HTMLSelectElement;
    expect(
      Array.from(sel.options).some((o) => o.value === ''),
    ).toBe(false);
    await waitFor(() => {
      expect(screen.getByTestId('kpi-total-estimate').textContent).toContain('8,500');
    });
  });

  // ---- TS-F049-V13F-002：無寫死 9500 ----
  it('TS-F049-V13F-002：KPI total 來自 per-list COUNT，頁面不出現 9500', async () => {
    mockedListLists.mockResolvedValue(listsResp([activeList('OB202605004', '機車滿期')]));
    mockedGetListEstimate.mockResolvedValue({ listNo: 'OB202605004', count: 12345 });
    renderPage();
    await waitFor(() => {
      expect(screen.getByTestId('kpi-total-estimate').textContent).toContain('12,345');
    });
    expect(document.body.textContent).not.toContain('9,500');
    expect(document.body.textContent).not.toContain('9500');
  });

  // ---- TS-F049-V13F-003：切換 calendarSource → 重新呼叫 daily-estimate（帶新參數）----
  it('TS-F049-V13F-003：切換 calendarSource=all → 重新呼叫 daily-estimate 帶 calendarSource=all；KPI 更新', async () => {
    mockedGetDaily.mockImplementation(async (_ym, opts) => {
      if (opts?.calendarSource === 'all') {
        return dailyResp({ calendarSource: 'all', workingDays: 31 });
      }
      return dailyResp({ workingDays: 20 });
    });
    renderPage();
    await waitFor(() => {
      expect(screen.getByTestId('kpi-working-days').textContent).toContain('20');
    });
    fireEvent.change(screen.getByTestId('input-calendar-source'), {
      target: { value: 'all' },
    });
    await waitFor(() => {
      expect(screen.getByTestId('kpi-working-days').textContent).toContain('31');
    });
    // 驗證最後一次呼叫帶 calendarSource=all
    const calls = mockedGetDaily.mock.calls;
    expect(calls[calls.length - 1][1]).toMatchObject({ calendarSource: 'all' });
  });

  // ---- TS-F049-V13F-004：切換起訖日 → 重新呼叫 daily-estimate ----
  it('TS-F049-V13F-004：切換起訖日 → daily-estimate 帶新 startDate/endDate', async () => {
    renderPage();
    await waitFor(() => {
      expect(screen.getByTestId('kpi-working-days')).toBeInTheDocument();
    });
    fireEvent.change(screen.getByTestId('input-start-date'), {
      target: { value: '2026-05-11' },
    });
    fireEvent.change(screen.getByTestId('input-end-date'), {
      target: { value: '2026-05-22' },
    });
    await waitFor(() => {
      const calls = mockedGetDaily.mock.calls;
      const last = calls[calls.length - 1][1];
      expect(last).toMatchObject({
        startDate: '2026-05-11',
        endDate: '2026-05-22',
      });
    });
  });

  // ---- TS-F049-V13F-005：切換 selector → total 換成新名單 COUNT；每日件數重算 ----
  it('TS-F049-V13F-005：切換名單 → total 換成新 COUNT；每日件數前端重算', async () => {
    mockedGetListEstimate.mockImplementation(async (listNo: string) => {
      if (listNo === 'OB202605002') return { listNo, count: 12345 };
      return { listNo, count: 8500 };
    });
    renderPage();
    await waitFor(() => {
      expect(screen.getByTestId('kpi-total-estimate').textContent).toContain('8,500');
    });
    fireEvent.change(screen.getByTestId('input-list-no'), {
      target: { value: 'OB202605002' },
    });
    await waitFor(() => {
      expect(screen.getByTestId('kpi-total-estimate').textContent).toContain('12,345');
    });
  });

  // ---- TS-F049-V13F-008：表格 pill badge ----
  it('TS-F049-V13F-008：表格 pill badge — 工作日 Y(rest_flg=0) / 跳過 N(skipReason) / 餘數補', async () => {
    // remainder>0 → 部分工作日 bonus；用 21 工作日場景之 ratio 模型
    mockedGetDaily.mockResolvedValue(
      dailyResp({
        workingDays: 20,
        baseRatio: 50,
        remainder: 1,
        dailyEstimates: [
          { date: '2026-05-01', weekday: '五', isWorkday: false, skipReason: '國定假日', ratioPerMille: 0 },
          { date: '2026-05-02', weekday: '六', isWorkday: false, skipReason: '週末', ratioPerMille: 0 },
          { date: '2026-05-04', weekday: '一', isWorkday: true, skipReason: null, ratioPerMille: 50 },
          { date: '2026-05-29', weekday: '五', isWorkday: true, skipReason: null, ratioPerMille: 51 }, // bonus
        ],
      }),
    );
    renderPage();
    await waitFor(() => {
      expect(screen.getByTestId('stage0-daily-table')).toBeInTheDocument();
    });
    const table = screen.getByTestId('stage0-daily-table');
    expect(table.textContent).toContain('Y (rest_flg=0)');
    expect(table.textContent).toContain('N (國定假日)');
    expect(table.textContent).toContain('N (週末)');
    expect(table.textContent).toContain('base+1（餘數補）');
  });

  // ---- TS-F049-V13F-009：空狀態 ----
  it('TS-F049-V13F-009：無 active 名單 → selector disabled；KPI total 顯示「—」；無 9500', async () => {
    mockedListLists.mockResolvedValue(listsResp([]));
    renderPage();
    await waitFor(() => {
      const sel = screen.getByTestId('input-list-no') as HTMLSelectElement;
      expect(sel.disabled).toBe(true);
    });
    expect(screen.getByTestId('kpi-total-estimate').textContent).toContain('—');
    expect(document.body.textContent).not.toContain('9,500');
  });

  // ---- regression：pool 警示 / 處長唯讀 ----
  it('Pool 偏低警示 banner（warning=POOL_COUNT_LOW）', async () => {
    mockedGetDaily.mockResolvedValue(
      dailyResp({ poolCount: 800, warning: 'POOL_COUNT_LOW' }),
    );
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

  it('每日明細表格含 calendar_date / 累積 / 餘數補', async () => {
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
