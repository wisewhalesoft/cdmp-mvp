import { render, screen, fireEvent, cleanup, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import { RunHistoryPage } from '../run-history-page';
import { ToastProvider } from '@/components/ui/toast';
import * as runApi from '@/api/assignment-run';
import * as authStore from '@/stores/auth-store';
import type { RunListItem } from '@/api/assignment-run';

vi.mock('@/api/assignment-run');
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

const mockedListRuns = vi.mocked(runApi.listRuns);
const mockedGetUser = vi.mocked(authStore.getUser);
const mockedGetBusinessRole = vi.mocked(authStore.getBusinessRole);
const mockedGetEffectiveIdentity = vi.mocked(authStore.getEffectiveIdentity);

// ⚠️ 對齊「真實後端契約」（assignment-run.service.ts toSummary）：
//   projectWorkym（非 ym）/ totalCases（非 totalCount）/ triggeredBy=UUID + triggeredByName=名稱。
//   舊測試以錯誤前端 shape（ym/totalCount/triggeredBy=名稱）造 mock，導致 bug 漏網
//   （見 memory: feedback_mock_real_system_contract）。
const DIRECTOR_ID = 'a1b2c3d4-e5f6-7890-abcd-ef0123456789';

const sampleRuns: RunListItem[] = [
  {
    runId: 'R001',
    projectWorkym: '202605',
    status: 'completed',
    triggeredBy: DIRECTOR_ID,
    triggeredByName: '王部長',
    triggeredAt: '2026-05-10T10:00:00.000Z',
    finishedAt: '2026-05-10T10:15:00.000Z',
    totalCases: 9500,
  },
  {
    runId: 'R002',
    projectWorkym: '202605',
    status: 'failed',
    triggeredBy: DIRECTOR_ID,
    triggeredByName: '王部長',
    triggeredAt: '2026-05-11T10:00:00.000Z',
    finishedAt: '2026-05-11T10:05:00.000Z',
    totalCases: null,
  },
];

function renderPage() {
  return render(
    <MemoryRouter>
      <ToastProvider>
        <RunHistoryPage />
      </ToastProvider>
    </MemoryRouter>,
  );
}

describe('RunHistoryPage (F065)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockedGetUser.mockReturnValue({
      id: 'd1',
      name: 'Director',
      email: 'manager@cdmp.test',
      role: 'user',
      isSalesManager: true,
      businessRole: 'director',
    });
    mockedGetBusinessRole.mockReturnValue('director');
    mockedGetEffectiveIdentity.mockReturnValue('director');
    mockedListRuns.mockResolvedValue({ runs: sampleRuns });
  });

  afterEach(() => cleanup());

  it('渲染 run 列表 + status badge', async () => {
    renderPage();
    await waitFor(() =>
      expect(screen.getByTestId('run-row-R001')).toBeInTheDocument(),
    );
    expect(screen.getByTestId('run-row-R002')).toBeInTheDocument();
    expect(screen.getByTestId('run-row-status-completed')).toBeInTheDocument();
    expect(screen.getByTestId('run-row-status-failed')).toBeInTheDocument();
  });

  it('比對按鈕預設 disabled；勾選 2 個 run 後啟用', async () => {
    renderPage();
    await waitFor(() =>
      expect(screen.getByTestId('run-row-R001')).toBeInTheDocument(),
    );
    expect(screen.getByTestId('btn-compare-selected')).toBeDisabled();

    fireEvent.click(screen.getByTestId('run-checkbox-R001'));
    expect(screen.getByTestId('btn-compare-selected')).toBeDisabled();

    fireEvent.click(screen.getByTestId('run-checkbox-R002'));
    expect(screen.getByTestId('btn-compare-selected')).not.toBeDisabled();
  });

  it('勾選第 3 個 run 被阻擋（最多 2 個）', async () => {
    mockedListRuns.mockResolvedValue({
      runs: [
        ...sampleRuns,
        {
          runId: 'R003',
          projectWorkym: '202605',
          status: 'completed',
          triggeredBy: DIRECTOR_ID,
          triggeredByName: '王部長',
          triggeredAt: '2026-05-12T10:00:00.000Z',
          finishedAt: '2026-05-12T10:10:00.000Z',
          totalCases: 9100,
        },
      ],
    });
    renderPage();
    await waitFor(() =>
      expect(screen.getByTestId('run-row-R003')).toBeInTheDocument(),
    );
    fireEvent.click(screen.getByTestId('run-checkbox-R001'));
    fireEvent.click(screen.getByTestId('run-checkbox-R002'));
    // R003 checkbox 應 disabled
    expect(screen.getByTestId('run-checkbox-R003')).toBeDisabled();
  });

  it('空列表顯示 empty state', async () => {
    mockedListRuns.mockResolvedValue({ runs: [] });
    renderPage();
    await waitFor(() =>
      expect(screen.getByTestId('history-empty')).toBeInTheDocument(),
    );
  });

  it('搜尋 runId 子字串過濾', async () => {
    renderPage();
    await waitFor(() =>
      expect(screen.getByTestId('run-row-R001')).toBeInTheDocument(),
    );
    fireEvent.change(screen.getByPlaceholderText(/搜尋 runId/), {
      target: { value: 'R002' },
    });
    expect(screen.queryByTestId('run-row-R001')).not.toBeInTheDocument();
    expect(screen.getByTestId('run-row-R002')).toBeInTheDocument();
  });

  // =====================================================================
  // Bug fixes 2026-06-26（契約對齊 — 月份/分派筆數/觸發人名稱/操作欄）
  // =====================================================================
  describe('契約對齊 bug 修復', () => {
    it('Bug#2 月份欄顯示 projectWorkym 值（非空白）', async () => {
      renderPage();
      await waitFor(() =>
        expect(screen.getByTestId('run-row-ym-R001')).toBeInTheDocument(),
      );
      expect(screen.getByTestId('run-row-ym-R001')).toHaveTextContent('202605');
    });

    it('Bug#4 分派筆數欄顯示 totalCases（completed）/ —（無值）', async () => {
      renderPage();
      await waitFor(() =>
        expect(screen.getByTestId('run-row-count-R001')).toBeInTheDocument(),
      );
      expect(screen.getByTestId('run-row-count-R001')).toHaveTextContent('9,500');
      // 失敗 run（totalCases=null）顯示 —
      expect(screen.getByTestId('run-row-count-R002')).toHaveTextContent('—');
    });

    it('Bug#3 觸發人欄顯示名稱（triggeredByName）而非 UUID', async () => {
      renderPage();
      await waitFor(() =>
        expect(screen.getByTestId('run-row-trigger-R001')).toBeInTheDocument(),
      );
      const cell = screen.getByTestId('run-row-trigger-R001');
      expect(cell).toHaveTextContent('王部長');
      expect(cell).not.toHaveTextContent(DIRECTOR_ID);
    });

    it('Bug#3 triggeredByName 缺失時 fallback 顯示 triggeredBy', async () => {
      mockedListRuns.mockResolvedValue({
        runs: [
          {
            runId: 'R009',
            projectWorkym: '202605',
            status: 'completed',
            triggeredBy: 'legacy-id-xyz',
            triggeredByName: null,
            triggeredAt: '2026-05-10T10:00:00.000Z',
            finishedAt: '2026-05-10T10:15:00.000Z',
            totalCases: 100,
          },
        ],
      });
      renderPage();
      await waitFor(() =>
        expect(screen.getByTestId('run-row-trigger-R009')).toBeInTheDocument(),
      );
      expect(screen.getByTestId('run-row-trigger-R009')).toHaveTextContent(
        'legacy-id-xyz',
      );
    });
  });

  // =====================================================================
  // Bug#5 操作欄對齊 prototype 34 + 全狀態顯示（BR-1 修正）
  // =====================================================================
  describe('操作欄 + 全狀態顯示', () => {
    const runsAllStatuses: RunListItem[] = [
      {
        runId: 'RC',
        projectWorkym: '202605',
        status: 'completed',
        triggeredBy: DIRECTOR_ID,
        triggeredByName: '王部長',
        triggeredAt: '2026-05-10T10:00:00.000Z',
        finishedAt: '2026-05-10T10:15:00.000Z',
        totalCases: 9500,
      },
      {
        runId: 'RF',
        projectWorkym: '202605',
        status: 'failed',
        triggeredBy: DIRECTOR_ID,
        triggeredByName: '王部長',
        triggeredAt: '2026-05-11T10:00:00.000Z',
        finishedAt: '2026-05-11T10:05:00.000Z',
        totalCases: null,
      },
      {
        runId: 'RR',
        projectWorkym: '202605',
        status: 'running',
        triggeredBy: DIRECTOR_ID,
        triggeredByName: '王部長',
        triggeredAt: '2026-05-12T10:00:00.000Z',
        finishedAt: null,
        totalCases: null,
      },
    ];

    beforeEach(() => {
      mockedListRuns.mockResolvedValue({ runs: runsAllStatuses });
    });

    it('清單納入全部狀態（含 running）', async () => {
      renderPage();
      await waitFor(() =>
        expect(screen.getByTestId('run-row-RR')).toBeInTheDocument(),
      );
      expect(screen.getByTestId('run-row-RC')).toBeInTheDocument();
      expect(screen.getByTestId('run-row-RF')).toBeInTheDocument();
      expect(screen.getByTestId('run-row-status-running')).toBeInTheDocument();
    });

    it('running 列：只顯示「查看進度」icon，無快照/摘要/比對基準', async () => {
      renderPage();
      await waitFor(() =>
        expect(screen.getByTestId('run-progress-RR')).toBeInTheDocument(),
      );
      expect(screen.queryByTestId('run-snapshot-RR')).not.toBeInTheDocument();
      expect(screen.queryByTestId('run-summary-RR')).not.toBeInTheDocument();
      expect(screen.queryByTestId('run-compare-base-RR')).not.toBeInTheDocument();
    });

    it('running 列：checkbox disabled（執行中不可比對）', async () => {
      renderPage();
      await waitFor(() =>
        expect(screen.getByTestId('run-checkbox-RR')).toBeInTheDocument(),
      );
      expect(screen.getByTestId('run-checkbox-RR')).toBeDisabled();
    });

    it('completed 列：顯示 快照 + 結果摘要 + 比對基準，無「查看進度」', async () => {
      renderPage();
      await waitFor(() =>
        expect(screen.getByTestId('run-snapshot-RC')).toBeInTheDocument(),
      );
      expect(screen.getByTestId('run-summary-RC')).toBeInTheDocument();
      expect(screen.getByTestId('run-compare-base-RC')).toBeInTheDocument();
      expect(screen.queryByTestId('run-progress-RC')).not.toBeInTheDocument();
      expect(screen.getByTestId('run-summary-RC')).not.toBeDisabled();
    });

    it('failed 列：「結果摘要」disabled，仍有快照 + 比對基準', async () => {
      renderPage();
      await waitFor(() =>
        expect(screen.getByTestId('run-snapshot-RF')).toBeInTheDocument(),
      );
      expect(screen.getByTestId('run-compare-base-RF')).toBeInTheDocument();
      expect(screen.getByTestId('run-summary-RF')).toBeDisabled();
    });

    it('Bug#5 點「比對基準」→ 設為基準並勾選此列', async () => {
      renderPage();
      await waitFor(() =>
        expect(screen.getByTestId('run-compare-base-RC')).toBeInTheDocument(),
      );
      const checkbox = screen.getByTestId('run-checkbox-RC') as HTMLInputElement;
      expect(checkbox.checked).toBe(false);
      fireEvent.click(screen.getByTestId('run-compare-base-RC'));
      expect(checkbox.checked).toBe(true);
    });
  });

  describe('Phase 3 P2-4', () => {
    it('狀態 filter select 過濾為 completed', async () => {
      renderPage();
      await waitFor(() =>
        expect(screen.getByTestId('run-row-R001')).toBeInTheDocument(),
      );
      fireEvent.change(screen.getByTestId('filter-status'), {
        target: { value: 'completed' },
      });
      const rows = screen.getAllByTestId(/^run-row-[A-Z0-9]+$/);
      expect(rows.length).toBeGreaterThan(0);
    });

    it('觸發者 filter select 顯示名稱選項', async () => {
      renderPage();
      await waitFor(() =>
        expect(screen.getByTestId('filter-triggered-by')).toBeInTheDocument(),
      );
      // 下拉選項顯示名稱而非 UUID
      expect(
        screen.getByTestId('filter-triggered-by').textContent,
      ).toContain('王部長');
      expect(
        screen.getByTestId('filter-triggered-by').textContent,
      ).not.toContain(DIRECTOR_ID);
    });

    it('全選 checkbox 一次選滿（最多 2 個 completed）', async () => {
      mockedListRuns.mockResolvedValueOnce({
        runs: [
          {
            runId: 'R001',
            projectWorkym: '202605',
            status: 'completed',
            triggeredBy: DIRECTOR_ID,
            triggeredByName: '王部長',
            triggeredAt: '2026-05-10T10:00:00.000Z',
            finishedAt: '2026-05-10T10:15:00.000Z',
            totalCases: 9500,
          },
          {
            runId: 'R002',
            projectWorkym: '202605',
            status: 'completed',
            triggeredBy: DIRECTOR_ID,
            triggeredByName: '王部長',
            triggeredAt: '2026-05-11T10:00:00.000Z',
            finishedAt: '2026-05-11T10:20:00.000Z',
            totalCases: 9300,
          },
        ],
      });
      renderPage();
      await waitFor(() =>
        expect(screen.getByTestId('checkbox-select-all')).toBeInTheDocument(),
      );
      fireEvent.click(screen.getByTestId('checkbox-select-all'));
      await waitFor(() => {
        const compareBtn = screen.getByTestId('btn-compare-selected');
        expect(compareBtn).not.toBeDisabled();
      });
    });

    it('表格顯示「耗時」欄', async () => {
      renderPage();
      await waitFor(() =>
        expect(screen.getByTestId('run-row-R001')).toBeInTheDocument(),
      );
      const headerRow = screen.getByTestId('history-table-head');
      expect(headerRow.textContent).toContain('耗時');
    });

    it('表格顯示「分派筆數」欄', async () => {
      renderPage();
      await waitFor(() =>
        expect(screen.getByTestId('run-row-R001')).toBeInTheDocument(),
      );
      const headerRow = screen.getByTestId('history-table-head');
      expect(headerRow.textContent).toContain('分派筆數');
    });
  });
});
