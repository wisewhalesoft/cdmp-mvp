import {
  render,
  screen,
  cleanup,
  fireEvent,
  waitFor,
  within,
} from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { MemoryRouter, useLocation } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type {
  AssignmentOverviewResponse,
  DialingVolumeBlock,
  RecentRunBlock,
  RunReadinessBlock,
  StageTodoBlock,
} from '@cdmp/shared';
import { AssignmentOverviewPage } from '../assignment-overview-page';
import { AssignmentWorkYmProvider } from '@/contexts/assignment-work-ym-context';
import * as overviewApi from '@/api/assignment-overview';
import * as listApi from '@/api/assignment-list';
import * as authStore from '@/stores/auth-store';
import { apiClient } from '@/api/client';

/**
 * F111 / US-177 分派總覽儀表板 — 前端 Component 測試
 * 涵蓋 test-design 前端群組：ROLE / MONTH / STATE / PANEL / READONLY（SIDEBAR 於 app-sidebar.test.tsx）。
 */

vi.mock('@/api/assignment-overview');
vi.mock('@/api/auth', () => ({ logout: vi.fn().mockResolvedValue({}) }));
vi.mock('@/api/assignment-list', async () => {
  const actual = await vi.importActual<typeof listApi>('@/api/assignment-list');
  return { ...actual, getCurrentWorkYm: vi.fn() };
});
vi.mock('@/stores/auth-store', async () => {
  const actual = await vi.importActual<typeof authStore>('@/stores/auth-store');
  return {
    ...actual,
    getUser: vi.fn(),
    getBusinessRole: vi.fn(),
    getEffectiveIdentity: vi.fn(),
    clearAuth: vi.fn(),
  };
});

const mockedGetOverview = vi.mocked(overviewApi.getAssignmentOverview);
const mockedGetCurrentWorkYm = vi.mocked(listApi.getCurrentWorkYm);
const mockedGetUser = vi.mocked(authStore.getUser);
const mockedGetBusinessRole = vi.mocked(authStore.getBusinessRole);
const mockedGetEffectiveIdentity = vi.mocked(authStore.getEffectiveIdentity);

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------
function stageTodo(overrides: Partial<StageTodoBlock> = {}): StageTodoBlock {
  return {
    stageCounts: {
      draft: 1,
      dept_ratio: 0,
      personnel_ratio: 1,
      approval: 3,
      ready: 8,
      disabled: 2,
    },
    notReadyLists: [
      { listNo: 'OB202608005', listNm: '個貸主力名單', stage: 'personnel_ratio' },
      { listNo: 'OB202608009', listNm: '車貸滿期名單', stage: 'draft' },
    ],
    notReadyCount: 2,
    hasAnyList: true,
    ...overrides,
  };
}

function runReadiness(
  overrides: Partial<RunReadinessBlock> = {},
): RunReadinessBlock {
  return {
    totalActiveLists: 10,
    readyCount: 8,
    allReady: false,
    notReadyLists: [
      { listNo: 'OB202608005', listNm: '個貸主力名單', stage: 'personnel_ratio' },
    ],
    monthlyRunStatus: 'pending',
    scoringActive: true,
    etlStatus: {
      pooldata: { status: 'completed', lastRunAt: '2026-08-01T02:10:00Z', rowCount: 3631548 },
      emphire: { status: 'completed', lastRunAt: '2026-08-01T02:12:00Z', rowCount: 1180 },
      calendar: { status: 'completed', lastRunAt: '2026-08-01T02:13:00Z', rowCount: 366 },
      arreturndf: { status: 'completed', lastRunAt: '2026-08-01T02:15:00Z', rowCount: 55863 },
    },
    sourcesAllHaveData: true,
    emptySourceTables: [],
    canNavigateToTrigger: true,
    ...overrides,
  };
}

function dialingVolume(
  overrides: Partial<DialingVolumeBlock> = {},
): DialingVolumeBlock {
  return {
    headline: {
      currentMonth: { ym: '202607', total: 42350, hasActiveLists: true, scopedToDept: false },
      nextMonth: { ym: '202608', total: 39800, hasActiveLists: true, scopedToDept: false },
    },
    selected: {
      ym: '202608',
      mode: 'aggregated',
      calendarSource: 'weekday',
      startDate: '2026-08-01',
      endDate: '2026-08-31',
      departments: [{ deptCode: 'XVE1', deptName: '北區電銷1', activeHeadcount: 27 }],
      days: [
        {
          date: '2026-08-03',
          weekday: '一',
          isWorkday: true,
          orgTotal: 1234,
          deptAssignedTotal: 1234,
          gap: 0,
          deptCells: [{ deptCode: 'XVE1', cases: 480, perPerson: 12, overThreshold: false }],
        },
        {
          date: '2026-08-09',
          weekday: '日',
          isWorkday: false,
          orgTotal: 0,
          deptAssignedTotal: 0,
          gap: 0,
          deptCells: [],
        },
      ],
      threshold: 15,
      deptDistribution: [
        { deptCode: 'XVE1', deptName: '北區電銷1', totalCases: 480, ratio: 100 },
      ],
      warnings: [],
      poolCount: 50000,
      poolWarning: null,
    },
    ...overrides,
  };
}

function recentRunPresent(): RecentRunBlock {
  return {
    hasCompletedRun: true,
    runId: 'e3c839b7-1111-2222-3333-444455556666',
    projectWorkym: '202608',
    finishedAt: '2026-08-02T09:00:00Z',
    totalCases: 55863,
    coverageRate: 0.98,
    emplCount: 91,
    deptSummary: [
      {
        deptId: 'XVE1',
        deptName: '北區電銷1',
        configRatio: 30.0,
        actualCount: 18940,
        actualRatio: 33.9,
        deviation: 3.9,
        alert: true,
      },
    ],
    levelDistribution: [
      { cardLevel: 'A', count: 6271, ratio: 11.2 },
      { cardLevel: 'B', count: 22400, ratio: 40.1 },
    ],
    tierDistribution: [
      { tierLevel: 'T1', count: 1748, ratio: 3.1 },
      { tierLevel: 'T2', count: 8200, ratio: 14.7 },
    ],
  };
}

function makeResponse(
  overrides: Partial<AssignmentOverviewResponse> = {},
): AssignmentOverviewResponse {
  return {
    selectedYm: '202608',
    currentWorkYm: '202607',
    targetWorkYm: '202608',
    scope: { role: 'director', deptCode: null, scoped: false },
    stageTodo: { error: false, ...stageTodo() },
    runReadiness: { error: false, ...runReadiness() },
    dialingVolume: { error: false, ...dialingVolume() },
    recentRun: { error: false, ...recentRunPresent() },
    ...overrides,
  };
}

function LocationProbe() {
  const loc = useLocation();
  return <div data-testid="location">{loc.pathname + loc.search}</div>;
}

function renderPage() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={['/assignment/overview']}>
        <AssignmentWorkYmProvider>
          <AssignmentOverviewPage />
          <LocationProbe />
        </AssignmentWorkYmProvider>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

async function waitForContent() {
  await waitFor(() =>
    expect(screen.getByTestId('block-stage-todo').getAttribute('data-state')).toBe(
      'content',
    ),
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  mockedGetEffectiveIdentity.mockReturnValue('director');
  mockedGetBusinessRole.mockReturnValue('director');
  mockedGetUser.mockReturnValue({
    id: 'd1',
    name: '張部長',
    email: 'd@test',
    role: 'user',
    businessRole: 'director',
    status: 'active',
  } as never);
  mockedGetCurrentWorkYm.mockResolvedValue({ currentWorkYm: '202607' });
  mockedGetOverview.mockResolvedValue(makeResponse());
});
afterEach(() => cleanup());

// ===========================================================================
// M. ROLE
// ===========================================================================
describe('ROLE — 角色存取渲染差異', () => {
  it('TS-F111-FE-ROLE-001：部長 → 四區塊全渲染 + 觸發連結可見', async () => {
    renderPage();
    await waitForContent();
    expect(screen.getByTestId('block-stage-todo')).toBeInTheDocument();
    expect(screen.getByTestId('block-run-readiness')).toBeInTheDocument();
    expect(screen.getByTestId('block-dialing-volume')).toBeInTheDocument();
    expect(screen.getByTestId('block-recent-run')).toBeInTheDocument();
    expect(screen.getByTestId('trigger-link')).toBeInTheDocument();
    expect(screen.queryByTestId('scope-banner')).toBeNull();
  });

  it('TS-F111-FE-ROLE-002：處長 → 轄區檢視徽章 + 部門名稱；「（僅本部門）」；無觸發連結', async () => {
    mockedGetEffectiveIdentity.mockReturnValue('section_chief');
    mockedGetBusinessRole.mockReturnValue('section_chief');
    mockedGetOverview.mockResolvedValue(
      makeResponse({
        scope: { role: 'section_chief', deptCode: 'D003', scoped: true },
        runReadiness: { error: false, ...runReadiness({ canNavigateToTrigger: false }) },
        dialingVolume: {
          error: false,
          ...dialingVolume({
            headline: {
              currentMonth: { ym: '202607', total: 12800, hasActiveLists: true, scopedToDept: true },
              nextMonth: { ym: '202608', total: 11900, hasActiveLists: true, scopedToDept: true },
            },
            selected: {
              ...dialingVolume().selected,
              departments: [{ deptCode: 'D003', deptName: '北一處', activeHeadcount: 22 }],
              deptDistribution: [
                { deptCode: 'D003', deptName: '北一處', totalCases: 9600, ratio: null },
              ],
            },
          }),
        },
      }),
    );
    renderPage();
    await waitForContent();
    const banner = screen.getByTestId('scope-banner');
    expect(banner.textContent).toContain('轄區檢視');
    expect(banner.textContent).toContain('北一處');
    // headline「（僅本部門）」
    expect(screen.getByTestId('headline-current').textContent).toContain('（僅本部門）');
    // 無觸發連結（DOM 不存在，非 disabled）
    expect(screen.queryByTestId('trigger-link')).toBeNull();
    expect(screen.getByTestId('trigger-readonly')).toBeInTheDocument();
  });

  it('TS-F111-FE-ROLE-003：一般使用者 → 整頁封鎖卡，不渲染任何區塊、不呼叫 API', async () => {
    mockedGetEffectiveIdentity.mockReturnValue('user');
    mockedGetBusinessRole.mockReturnValue(null);
    renderPage();
    expect(await screen.findByTestId('overview-blocked')).toBeInTheDocument();
    expect(screen.getByTestId('overview-blocked').textContent).toContain(
      '分派總覽為部長 / 處長 / Admin 專屬功能',
    );
    expect(screen.queryByTestId('block-stage-todo')).toBeNull();
    expect(screen.queryByTestId('block-run-readiness')).toBeNull();
    expect(screen.queryByTestId('block-dialing-volume')).toBeNull();
    expect(screen.queryByTestId('block-recent-run')).toBeNull();
    expect(mockedGetOverview).not.toHaveBeenCalled();
  });

  it('TS-F111-FE-ROLE-004：Admin → 與部長等價（全公司 + 觸發連結）', async () => {
    mockedGetEffectiveIdentity.mockReturnValue('admin');
    mockedGetBusinessRole.mockReturnValue(null);
    mockedGetOverview.mockResolvedValue(
      makeResponse({ scope: { role: 'admin', deptCode: null, scoped: false } }),
    );
    renderPage();
    await waitForContent();
    expect(screen.getByTestId('trigger-link')).toBeInTheDocument();
    expect(screen.queryByTestId('scope-banner')).toBeNull();
  });
});

// ===========================================================================
// N. MONTH
// ===========================================================================
describe('MONTH — 分派作業月份選擇器', () => {
  it('TS-F111-FE-MONTH-001：預設值為下月（target_work_ym=202608）', async () => {
    renderPage();
    await waitForContent();
    const select = screen.getByTestId('month-picker-select') as HTMLSelectElement;
    expect(select.value).toBe('2026-08');
    expect(mockedGetOverview).toHaveBeenCalledWith('202608');
  });

  it('TS-F111-FE-MONTH-002：切換月份 → 以新 ym 重新請求；四區塊重繪；選擇器顯示新值', async () => {
    mockedGetOverview.mockImplementation(async (ym: string) => {
      if (ym === '202607') {
        return makeResponse({
          selectedYm: '202607',
          stageTodo: { error: false, ...stageTodo({ notReadyCount: 5, notReadyLists: [
            { listNo: 'OB202607001', listNm: '七月名單', stage: 'draft' },
          ] }) },
        });
      }
      return makeResponse();
    });
    renderPage();
    await waitForContent();
    expect(mockedGetOverview).toHaveBeenCalledWith('202608');

    fireEvent.change(screen.getByTestId('month-picker-select'), {
      target: { value: '2026-07' },
    });
    await waitFor(() => expect(mockedGetOverview).toHaveBeenCalledWith('202607'));
    await waitFor(() =>
      expect(screen.getByTestId('todo-row-OB202607001')).toBeInTheDocument(),
    );
    const select = screen.getByTestId('month-picker-select') as HTMLSelectElement;
    expect(select.value).toBe('2026-07');
  });

  it('TS-F111-FE-MONTH-003：query 隨 ym 變化重新抓取（新 ym 對應新資料，不與舊快取混淆）', async () => {
    mockedGetOverview.mockImplementation(async (ym: string) =>
      makeResponse({ selectedYm: ym }),
    );
    renderPage();
    await waitForContent();
    // 選定月份 chip 反映 202608
    expect(screen.getByTestId('dialing-selected-month').textContent).toContain('202608');
    fireEvent.click(screen.getByTestId('month-picker-next'));
    await waitFor(() => expect(mockedGetOverview).toHaveBeenCalledWith('202609'));
  });
});

// ===========================================================================
// O. STATE
// ===========================================================================
describe('STATE — 跨區塊三態與獨立失敗（AC-15）', () => {
  const blockErr = (code: string) => ({
    error: true as const,
    errorCode: code as never,
    message: '本區塊資料暫時無法取得，請稍後重試。',
  });

  it('TS-F111-FE-STATE-001：stageTodo.error → 僅該 panel 顯示錯誤，其餘 3 正常', async () => {
    mockedGetOverview.mockResolvedValue(
      makeResponse({ stageTodo: blockErr('STAGE_TODO_UNAVAILABLE') }),
    );
    renderPage();
    await waitFor(() =>
      expect(screen.getByTestId('block-stage-todo').getAttribute('data-state')).toBe('error'),
    );
    expect(screen.getByTestId('block-stage-todo-error').textContent).toContain(
      '本區塊資料暫時無法取得，請稍後重試。',
    );
    expect(screen.getByTestId('block-run-readiness').getAttribute('data-state')).toBe('content');
    expect(screen.getByTestId('block-dialing-volume').getAttribute('data-state')).toBe('content');
    expect(screen.getByTestId('block-recent-run').getAttribute('data-state')).toBe('content');
  });

  it('TS-F111-FE-STATE-002：runReadiness.error → 僅該 panel 錯誤', async () => {
    mockedGetOverview.mockResolvedValue(
      makeResponse({ runReadiness: blockErr('RUN_READINESS_UNAVAILABLE') }),
    );
    renderPage();
    await waitFor(() =>
      expect(screen.getByTestId('block-run-readiness').getAttribute('data-state')).toBe('error'),
    );
    expect(screen.getByTestId('block-stage-todo').getAttribute('data-state')).toBe('content');
    expect(screen.getByTestId('block-dialing-volume').getAttribute('data-state')).toBe('content');
    expect(screen.getByTestId('block-recent-run').getAttribute('data-state')).toBe('content');
  });

  it('TS-F111-FE-STATE-003：dialingVolume.error（TC-177-12）→ 僅該 panel 錯誤', async () => {
    mockedGetOverview.mockResolvedValue(
      makeResponse({ dialingVolume: blockErr('DIALING_VOLUME_UNAVAILABLE') }),
    );
    renderPage();
    await waitFor(() =>
      expect(screen.getByTestId('block-dialing-volume').getAttribute('data-state')).toBe('error'),
    );
    expect(screen.getByTestId('block-stage-todo').getAttribute('data-state')).toBe('content');
    expect(screen.getByTestId('block-run-readiness').getAttribute('data-state')).toBe('content');
    expect(screen.getByTestId('block-recent-run').getAttribute('data-state')).toBe('content');
  });

  it('TS-F111-FE-STATE-004：recentRun.error → 僅該 panel 錯誤', async () => {
    mockedGetOverview.mockResolvedValue(
      makeResponse({ recentRun: blockErr('RECENT_RUN_UNAVAILABLE') }),
    );
    renderPage();
    await waitFor(() =>
      expect(screen.getByTestId('block-recent-run').getAttribute('data-state')).toBe('error'),
    );
    expect(screen.getByTestId('block-stage-todo').getAttribute('data-state')).toBe('content');
    expect(screen.getByTestId('block-run-readiness').getAttribute('data-state')).toBe('content');
    expect(screen.getByTestId('block-dialing-volume').getAttribute('data-state')).toBe('content');
  });

  it('TS-F111-FE-STATE-005：錯誤區塊「重試」按鈕觸發重新請求（GET）', async () => {
    mockedGetOverview.mockResolvedValue(
      makeResponse({ stageTodo: blockErr('STAGE_TODO_UNAVAILABLE') }),
    );
    renderPage();
    await waitFor(() =>
      expect(screen.getByTestId('block-stage-todo-retry')).toBeInTheDocument(),
    );
    const before = mockedGetOverview.mock.calls.length;
    fireEvent.click(screen.getByTestId('block-stage-todo-retry'));
    await waitFor(() =>
      expect(mockedGetOverview.mock.calls.length).toBeGreaterThan(before),
    );
  });

  it('TS-F111-FE-STATE-006：初始載入 → 四區塊同時顯示 loading，非空白', async () => {
    let resolve!: (v: AssignmentOverviewResponse) => void;
    mockedGetOverview.mockReturnValue(
      new Promise<AssignmentOverviewResponse>((r) => {
        resolve = r;
      }),
    );
    renderPage();
    await waitFor(() =>
      expect(screen.getByTestId('overview-refresh')).toBeInTheDocument(),
    );
    for (const id of [
      'block-stage-todo',
      'block-run-readiness',
      'block-dialing-volume',
      'block-recent-run',
    ]) {
      expect(screen.getByTestId(id).getAttribute('data-state')).toBe('loading');
    }
    resolve(makeResponse());
    await waitForContent();
  });
});

// ===========================================================================
// P. PANEL
// ===========================================================================
describe('PANEL — 各區塊特定行為', () => {
  it('TS-F111-FE-PANEL-001：點 KPI 卡 → 導向名單定義並帶 stage 篩選', async () => {
    renderPage();
    await waitForContent();
    fireEvent.click(screen.getByTestId('stage-kpi-approval'));
    expect(screen.getByTestId('location').textContent).toBe(
      '/assignment/list-definitions?stage=approval',
    );
  });

  it('TS-F111-FE-PANEL-002：hasAnyList=false → 五卡皆 0 + 引導文案 + 前往建立', async () => {
    mockedGetOverview.mockResolvedValue(
      makeResponse({
        stageTodo: {
          error: false,
          ...stageTodo({
            stageCounts: { draft: 0, dept_ratio: 0, personnel_ratio: 0, approval: 0, ready: 0, disabled: 0 },
            notReadyLists: [],
            notReadyCount: 0,
            hasAnyList: false,
          }),
        },
      }),
    );
    renderPage();
    await waitForContent();
    expect(screen.getByTestId('stage-kpi-draft').textContent).toContain('0');
    expect(screen.getByTestId('stage-kpi-ready').textContent).toContain('0');
    expect(screen.getByTestId('stage-todo-empty')).toBeInTheDocument();
    expect(screen.getByTestId('stage-todo-empty').textContent).toContain('本月尚無名單定義');
    expect(screen.getByTestId('stage-todo-create')).toBeInTheDocument();
  });

  it('TS-F111-FE-PANEL-003：notReadyLists=[] 但 hasAnyList=true → 正向提示（非空白）', async () => {
    mockedGetOverview.mockResolvedValue(
      makeResponse({
        stageTodo: {
          error: false,
          ...stageTodo({ notReadyLists: [], notReadyCount: 0, hasAnyList: true }),
        },
      }),
    );
    renderPage();
    await waitForContent();
    expect(screen.getByTestId('stage-todo-all-ready').textContent).toContain('目前名單皆已準備完成');
    expect(screen.queryByTestId('stage-todo-empty')).toBeNull();
  });

  it('TS-F111-FE-PANEL-004：待辦清單項點擊 → 導向該名單', async () => {
    renderPage();
    await waitForContent();
    fireEvent.click(screen.getByTestId('todo-row-OB202608005'));
    expect(screen.getByTestId('location').textContent).toContain(
      '/assignment/list-definitions?listNo=OB202608005',
    );
  });

  it('TS-F111-FE-PANEL-005：notReadyCount>50 → 僅顯示前 50 筆 + 查看全部', async () => {
    const lists = Array.from({ length: 73 }, (_, i) => ({
      listNo: `OB20260800${String(i + 1).padStart(3, '0')}`,
      listNm: `名單 ${i + 1}`,
      stage: 'draft',
    }));
    mockedGetOverview.mockResolvedValue(
      makeResponse({
        stageTodo: {
          error: false,
          ...stageTodo({ notReadyLists: lists, notReadyCount: 73, hasAnyList: true }),
        },
      }),
    );
    renderPage();
    await waitForContent();
    const rows = screen.getAllByTestId(/^todo-row-/);
    expect(rows.length).toBe(50);
    const viewAll = screen.getByTestId('todo-view-all');
    fireEvent.click(viewAll);
    expect(screen.getByTestId('location').textContent).toBe('/assignment/list-definitions');
  });

  it('TS-F111-FE-PANEL-006：就緒燈號與月跑狀態徽章為兩個獨立 DOM 節點', async () => {
    mockedGetOverview.mockResolvedValue(
      makeResponse({
        runReadiness: {
          error: false,
          ...runReadiness({ allReady: false, readyCount: 8, totalActiveLists: 10, monthlyRunStatus: 'pending' }),
        },
      }),
    );
    renderPage();
    await waitForContent();
    expect(screen.getByTestId('readiness-count').textContent).toContain('8 / 10');
    const chip = screen.getByTestId('run-status-chip');
    expect(chip.textContent).toContain('等待中');
    // 兩者為不同節點
    expect(chip).not.toBe(screen.getByTestId('readiness-count'));
  });

  it('TS-F111-FE-PANEL-007：monthlyRunStatus=running → 額外「執行中」提示', async () => {
    mockedGetOverview.mockResolvedValue(
      makeResponse({
        runReadiness: { error: false, ...runReadiness({ monthlyRunStatus: 'running' }) },
      }),
    );
    renderPage();
    await waitForContent();
    expect(screen.getByTestId('running-hint').textContent).toContain('月名單分派執行中');
  });

  it('TS-F111-FE-PANEL-008：ETL 某項未通過 → 警示樣式 + 原因；其餘正常', async () => {
    mockedGetOverview.mockResolvedValue(
      makeResponse({
        runReadiness: {
          error: false,
          ...runReadiness({
            etlStatus: {
              pooldata: { status: 'failed', lastRunAt: null, rowCount: 0 },
              emphire: { status: 'completed', lastRunAt: '2026-08-01T02:12:00Z', rowCount: 1180 },
              calendar: { status: 'completed', lastRunAt: '2026-08-01T02:13:00Z', rowCount: 366 },
              arreturndf: { status: 'completed', lastRunAt: '2026-08-01T02:15:00Z', rowCount: 55863 },
            },
            emptySourceTables: ['ob_pool_data'],
            sourcesAllHaveData: false,
          }),
        },
      }),
    );
    renderPage();
    await waitForContent();
    const bad = screen.getByTestId('etl-chip-pooldata');
    expect(bad.getAttribute('aria-invalid')).toBe('true');
    expect(bad.textContent).toContain('同步失敗');
    expect(screen.getByTestId('etl-chip-emphire').getAttribute('aria-invalid')).toBe('false');
    expect(screen.getByTestId('readiness-warn')).toBeInTheDocument();
  });

  it('TS-F111-FE-PANEL-009：canNavigateToTrigger 差異化 — true 連結存在 / false 連結完全不存在', async () => {
    // true
    renderPage();
    await waitForContent();
    expect(screen.getByTestId('trigger-link').getAttribute('href')).toBe('/assignment/run');
    cleanup();
    // false
    mockedGetOverview.mockResolvedValue(
      makeResponse({
        runReadiness: { error: false, ...runReadiness({ canNavigateToTrigger: false }) },
      }),
    );
    renderPage();
    await waitForContent();
    expect(screen.queryByTestId('trigger-link')).toBeNull();
  });

  it('TS-F111-FE-PANEL-010：headline.total=null → 「—」+「本月尚無啟用名單」，不顯示 0', async () => {
    mockedGetOverview.mockResolvedValue(
      makeResponse({
        dialingVolume: {
          error: false,
          ...dialingVolume({
            headline: {
              currentMonth: { ym: '202607', total: 42350, hasActiveLists: true, scopedToDept: false },
              nextMonth: { ym: '202608', total: null, hasActiveLists: false, scopedToDept: false },
            },
          }),
        },
      }),
    );
    renderPage();
    await waitForContent();
    const next = screen.getByTestId('headline-next');
    expect(next.textContent).toContain('—');
    expect(next.textContent).toContain('本月尚無啟用名單');
    expect(next.textContent).not.toContain('0 件');
  });

  it('TS-F111-FE-PANEL-011：headline.total 非 null → 千分位格式化', async () => {
    renderPage();
    await waitForContent();
    expect(screen.getByTestId('headline-current').textContent).toContain('42,350');
  });

  it('TS-F111-FE-PANEL-012：每日圖表工作日資料點帶當日明細（hover 明細）', async () => {
    renderPage();
    await waitForContent();
    const col = screen.getByTestId('daily-col-2026-08-03');
    expect(col.getAttribute('title')).toContain('1,234');
  });

  it('TS-F111-FE-PANEL-013：非工作日資料點明確與工作日區分', async () => {
    renderPage();
    await waitForContent();
    expect(screen.getByTestId('daily-col-2026-08-03').getAttribute('data-workday')).toBe('true');
    expect(screen.getByTestId('daily-col-2026-08-09').getAttribute('data-workday')).toBe('false');
  });

  it('TS-F111-FE-PANEL-014：deptCells.overThreshold=true → 紅色警示 + 門檻文字', async () => {
    mockedGetOverview.mockResolvedValue(
      makeResponse({
        dialingVolume: {
          error: false,
          ...dialingVolume({
            selected: {
              ...dialingVolume().selected,
              threshold: 15,
              departments: [{ deptCode: 'D002', deptName: '北二處', activeHeadcount: 10 }],
              days: [
                {
                  date: '2026-08-03',
                  weekday: '一',
                  isWorkday: true,
                  orgTotal: 200,
                  deptAssignedTotal: 200,
                  gap: 0,
                  deptCells: [{ deptCode: 'D002', cases: 200, perPerson: 20, overThreshold: true }],
                },
              ],
              deptDistribution: [
                { deptCode: 'D002', deptName: '北二處', totalCases: 200, ratio: 100 },
              ],
            },
          }),
        },
      }),
    );
    renderPage();
    await waitForContent();
    const row = screen.getByTestId('feas-row-D002');
    expect(row.className).toMatch(/red/);
    expect(within(row).getByTitle('超過每人每日上限 15 件')).toBeInTheDocument();
    expect(row.textContent).toContain('超上限');
  });

  it('TS-F111-FE-PANEL-015：perPerson=null（在職 0）→ 「—」，不出現 0/Infinity/NaN', async () => {
    mockedGetOverview.mockResolvedValue(
      makeResponse({
        dialingVolume: {
          error: false,
          ...dialingVolume({
            selected: {
              ...dialingVolume().selected,
              departments: [{ deptCode: 'D004', deptName: '數位組', activeHeadcount: 0 }],
              days: [
                {
                  date: '2026-08-03',
                  weekday: '一',
                  isWorkday: true,
                  orgTotal: 100,
                  deptAssignedTotal: 100,
                  gap: 0,
                  deptCells: [{ deptCode: 'D004', cases: 100, perPerson: null, overThreshold: false }],
                },
              ],
              deptDistribution: [
                { deptCode: 'D004', deptName: '數位組', totalCases: 100, ratio: 100 },
              ],
            },
          }),
        },
      }),
    );
    renderPage();
    await waitForContent();
    const row = screen.getByTestId('feas-row-D004');
    expect(row.textContent).toContain('—');
    expect(row.textContent).not.toContain('Infinity');
    expect(row.textContent).not.toContain('NaN');
  });

  it('TS-F111-FE-PANEL-016：threshold=null → 全表無超門檻警示', async () => {
    mockedGetOverview.mockResolvedValue(
      makeResponse({
        dialingVolume: {
          error: false,
          ...dialingVolume({
            selected: {
              ...dialingVolume().selected,
              threshold: null,
              departments: [{ deptCode: 'XVE1', deptName: '北區電銷1', activeHeadcount: 5 }],
              days: [
                {
                  date: '2026-08-03',
                  weekday: '一',
                  isWorkday: true,
                  orgTotal: 999,
                  deptAssignedTotal: 999,
                  gap: 0,
                  deptCells: [{ deptCode: 'XVE1', cases: 999, perPerson: 200, overThreshold: false }],
                },
              ],
              deptDistribution: [
                { deptCode: 'XVE1', deptName: '北區電銷1', totalCases: 999, ratio: 100 },
              ],
            },
          }),
        },
      }),
    );
    renderPage();
    await waitForContent();
    expect(screen.getByTestId('feasibility').textContent).not.toContain('超上限');
  });

  it('TS-F111-FE-PANEL-017：deptDistribution.ratio=null（處長）→ 只顯示件數、不顯示佔比', async () => {
    mockedGetOverview.mockResolvedValue(
      makeResponse({
        scope: { role: 'section_chief', deptCode: 'D003', scoped: true },
        dialingVolume: {
          error: false,
          ...dialingVolume({
            selected: {
              ...dialingVolume().selected,
              departments: [{ deptCode: 'D003', deptName: '北一處', activeHeadcount: 22 }],
              deptDistribution: [
                { deptCode: 'D003', deptName: '北一處', totalCases: 9600, ratio: null },
              ],
            },
          }),
        },
      }),
    );
    mockedGetEffectiveIdentity.mockReturnValue('section_chief');
    renderPage();
    await waitForContent();
    const row = screen.getByTestId('dist-row-D003');
    expect(row.textContent).toContain('9,600');
    expect(row.textContent).not.toContain('%');
  });

  it('TS-F111-FE-PANEL-018：hasCompletedRun=true → 部門落差 + CARD_LEVEL + TIER 全渲染；alert 列高亮', async () => {
    renderPage();
    await waitForContent();
    expect(screen.getByTestId('dept-deviation')).toBeInTheDocument();
    expect(screen.getByTestId('level-row-A')).toBeInTheDocument();
    expect(screen.getByTestId('tier-row-T1')).toBeInTheDocument();
    const devRow = screen.getByTestId('dev-row-XVE1');
    expect(devRow.getAttribute('data-alert')).toBe('true');
    expect(screen.getByTestId('deviation-alert')).toBeInTheDocument();
  });

  it('TS-F111-FE-PANEL-019：emptyReason=noRun → 對應文案', async () => {
    mockedGetOverview.mockResolvedValue(
      makeResponse({
        recentRun: {
          error: false,
          hasCompletedRun: false,
          emptyReason: 'noRun',
          latestRunStatus: null,
          latestRunId: null,
        },
      }),
    );
    renderPage();
    await waitForContent();
    const empty = screen.getByTestId('recent-run-empty');
    expect(empty.getAttribute('data-empty-reason')).toBe('noRun');
    expect(empty.textContent).toContain('本月尚無已完成的月名單分派結果');
  });

  it('TS-F111-FE-PANEL-020：noCompletedRun + running → 執行中文案', async () => {
    mockedGetOverview.mockResolvedValue(
      makeResponse({
        recentRun: {
          error: false,
          hasCompletedRun: false,
          emptyReason: 'noCompletedRun',
          latestRunStatus: 'running',
          latestRunId: 'r-1',
        },
      }),
    );
    renderPage();
    await waitForContent();
    expect(screen.getByTestId('recent-run-empty').textContent).toContain(
      '本月月名單分派執行中，尚無可回顧結果',
    );
  });

  it('TS-F111-FE-PANEL-021：noCompletedRun + failed → 執行失敗文案（與 running 不同）', async () => {
    mockedGetOverview.mockResolvedValue(
      makeResponse({
        recentRun: {
          error: false,
          hasCompletedRun: false,
          emptyReason: 'noCompletedRun',
          latestRunStatus: 'failed',
          latestRunId: 'r-1',
        },
      }),
    );
    renderPage();
    await waitForContent();
    const txt = screen.getByTestId('recent-run-empty').textContent ?? '';
    expect(txt).toContain('本月最近一次月名單分派執行失敗，尚無可回顧結果');
    expect(txt).not.toContain('執行中，尚無可回顧結果');
  });

  it('TS-F111-FE-PANEL-022：空狀態不 fallback 顯示其他月份月跑資料', async () => {
    mockedGetOverview.mockResolvedValue(
      makeResponse({
        recentRun: {
          error: false,
          hasCompletedRun: false,
          emptyReason: 'noRun',
          latestRunStatus: null,
          latestRunId: null,
        },
      }),
    );
    renderPage();
    await waitForContent();
    expect(screen.queryByTestId('run-meta')).toBeNull();
    expect(screen.queryByTestId('dept-deviation')).toBeNull();
    expect(screen.queryByTestId('level-distribution')).toBeNull();
  });

  it('TS-F111-FE-PANEL-023：查看結果摘要帶 runId；查看執行歷史導向 /assignment/history', async () => {
    renderPage();
    await waitForContent();
    expect(screen.getByTestId('view-summary').getAttribute('href')).toContain(
      'runId=e3c839b7-1111-2222-3333-444455556666',
    );
    expect(screen.getByTestId('view-history').getAttribute('href')).toBe('/assignment/history');
  });
});

// ===========================================================================
// Q. READONLY
// ===========================================================================
describe('READONLY — 唯讀特性（AC-16 / TC-177-13）', () => {
  it('TS-F111-FE-READONLY-001：全頁互動不觸發任何寫入 API（POST/PUT/PATCH/DELETE）', async () => {
    const postSpy = vi.spyOn(apiClient, 'post');
    const putSpy = vi.spyOn(apiClient, 'put');
    const patchSpy = vi.spyOn(apiClient, 'patch');
    const deleteSpy = vi.spyOn(apiClient, 'delete');
    renderPage();
    await waitForContent();

    fireEvent.click(screen.getByTestId('stage-kpi-approval'));
    fireEvent.click(screen.getByTestId('todo-row-OB202608005'));
    fireEvent.click(screen.getByTestId('overview-refresh'));
    // 連結（導覽）
    screen.getByTestId('trigger-link');
    screen.getByTestId('view-summary');
    screen.getByTestId('view-history');

    await waitFor(() =>
      expect(mockedGetOverview.mock.calls.length).toBeGreaterThanOrEqual(2),
    );
    expect(postSpy).not.toHaveBeenCalled();
    expect(putSpy).not.toHaveBeenCalled();
    expect(patchSpy).not.toHaveBeenCalled();
    expect(deleteSpy).not.toHaveBeenCalled();

    postSpy.mockRestore();
    putSpy.mockRestore();
    patchSpy.mockRestore();
    deleteSpy.mockRestore();
  });
});
