import { render, screen, cleanup, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { SnapshotDetailPage } from '../snapshot-detail-page';
import { ToastProvider } from '@/components/ui/toast';
import * as runApi from '@/api/assignment-run';
import * as authStore from '@/stores/auth-store';

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

const mockedGetSnapshot = vi.mocked(runApi.getSnapshotByType);
const mockedGetRun = vi.mocked(runApi.getRun);
const mockedGetRunSummary = vi.mocked(runApi.getRunSummary);
const mockedGetResultPage = vi.mocked(runApi.getResultPage);
const mockedGetUser = vi.mocked(authStore.getUser);
const mockedGetBusinessRole = vi.mocked(authStore.getBusinessRole);
const mockedGetEffectiveIdentity = vi.mocked(authStore.getEffectiveIdentity);

// 對齊後端 getSnapshotByType 真實契約（{ runMeta, type, payload }）
const RUN_META: runApi.SnapshotRunMeta = {
  runId: 'R001',
  projectWorkym: '202607',
  triggeredBy: 'u1',
  triggeredAt: '2026-07-11T08:43:28.959Z',
  finishedAt: '2026-07-11T08:46:26.635Z',
  status: 'completed',
  totalCases: 115197,
};
function snap(
  type: runApi.SnapshotType,
  payload: Record<string, unknown> | null,
): runApi.SingleSnapshotResponse {
  return { runMeta: RUN_META, type, payload };
}

function mkRun(): runApi.RunProgressResponse {
  return {
    runId: 'R001',
    projectWorkym: '202607',
    status: 'completed',
    triggeredBy: 'u1',
    triggeredByName: '王部長',
    triggeredAt: '2026-07-11T08:43:28.959Z',
    finishedAt: '2026-07-11T08:46:26.635Z',
    totalCases: 115197,
  };
}

function renderPage(runId = 'R001', type = 'config') {
  return render(
    <MemoryRouter initialEntries={[`/assignment/snapshots?runId=${runId}&type=${type}`]}>
      <ToastProvider>
        <Routes>
          <Route path="/assignment/snapshots" element={<SnapshotDetailPage />} />
        </Routes>
      </ToastProvider>
    </MemoryRouter>,
  );
}

describe('SnapshotDetailPage (F066 v1.3)', () => {
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
    mockedGetRun.mockResolvedValue(mkRun());
    mockedGetRunSummary.mockResolvedValue({
      runId: 'R001',
      projectWorkym: '202607',
      finishedAt: null,
      durationMs: null,
      totalCases: 115197,
      stage1Count: 115197,
      stage4Count: 115000,
      coverageRate: 0.935,
      emplCount: 138,
      deptSummary: [{ deptId: 'D01' }, { deptId: 'D02' }] as never,
      levelDistribution: [],
      tierDistribution: [],
      warnings: { summaryCode: null, skippedCases: null },
    } as never);
    mockedGetResultPage.mockResolvedValue({
      runId: 'R001',
      columns: [
        { key: 'branchName', label: '分處' },
        { key: 'applNo', label: '案號' },
        { key: 'tierLevel', label: 'TIER' },
      ],
      rows: [{ branchName: '台北分處', applNo: 'A1', tierLevel: 'T1' }],
      page: 1,
      pageSize: 50,
      total: 1,
    });
  });

  afterEach(() => cleanup());

  it('3 個分頁（設定快照 / 輸入名單 / 分派結果）渲染', async () => {
    mockedGetSnapshot.mockResolvedValue(snap('config', { listDefinitions: [] }));
    renderPage();
    await waitFor(() =>
      expect(screen.getByTestId('snapshot-config-list-defs')).toBeInTheDocument(),
    );
    expect(screen.getByTestId('snapshot-tab-config')).toBeInTheDocument();
    expect(screen.getByTestId('snapshot-tab-input_list')).toBeInTheDocument();
    expect(screen.getByTestId('snapshot-tab-result')).toBeInTheDocument();
  });

  it('預設載入 config snapshot 並以正規化 view 呈現', async () => {
    mockedGetSnapshot.mockResolvedValue(
      snap('config', {
        listDefinitions: [
          { listNo: 'OB001', listNm: '汽車', cardType: 'H', crEnabled: true, caseStatus: '01' },
        ],
      }),
    );
    renderPage();
    await waitFor(() => expect(mockedGetSnapshot).toHaveBeenCalledWith('R001', 'config'));
    expect(screen.getByTestId('snapshot-config-list-defs')).toBeInTheDocument();
  });

  it('run 資訊卡顯示作業月份 / 觸發者 / 總筆數（來自 getRun）', async () => {
    mockedGetSnapshot.mockResolvedValue(snap('config', { listDefinitions: [] }));
    renderPage();
    await waitFor(() => expect(mockedGetRun).toHaveBeenCalledWith('R001'));
    expect(screen.getAllByText(/2026 年 7 月/).length).toBeGreaterThan(0);
    expect(screen.getByText('王部長')).toBeInTheDocument();
    expect(screen.getByText(/115,197 筆/)).toBeInTheDocument();
  });

  it('顯示唯讀 badge（無「READ-ONLY 不可變」開發術語）', async () => {
    mockedGetSnapshot.mockResolvedValue(snap('config', { listDefinitions: [] }));
    renderPage();
    await waitFor(() => expect(screen.getByTestId('readonly-badge')).toBeInTheDocument());
    expect(screen.getByTestId('readonly-badge')).toHaveTextContent('唯讀');
    expect(screen.queryByText(/READ-ONLY/)).not.toBeInTheDocument();
    expect(screen.queryByText(/AD-E07-3/)).not.toBeInTheDocument();
  });

  it('不顯示除錯用原始 JSON 區塊', async () => {
    mockedGetSnapshot.mockResolvedValue(snap('config', { listDefinitions: [] }));
    renderPage();
    await waitFor(() => expect(screen.getByTestId('snapshot-config-list-defs')).toBeInTheDocument());
    expect(screen.queryByTestId('snapshot-json')).not.toBeInTheDocument();
    expect(screen.queryByText(/除錯/)).not.toBeInTheDocument();
    // 分頁標題不得洩漏 type = config 開發字樣
    expect(screen.queryByText(/type\s*=/)).not.toBeInTheDocument();
  });

  it('點輸入名單分頁 → 以摘要卡 + 各名單明細呈現', async () => {
    mockedGetSnapshot.mockResolvedValue(snap('config', {}));
    renderPage();
    await waitFor(() => expect(screen.getByTestId('snapshot-tab-input_list')).toBeInTheDocument());
    mockedGetSnapshot.mockResolvedValue(
      snap('input_list', {
        cases: [
          { listNo: 'OB001', applNo: 'A1', orgno: '02', cardType: 'H' },
          { listNo: 'OB001', applNo: 'A2', orgno: '02', cardType: 'H' },
        ],
      }),
    );
    fireEvent.click(screen.getByTestId('snapshot-tab-input_list'));
    await waitFor(() => expect(mockedGetSnapshot).toHaveBeenCalledWith('R001', 'input_list'));
    await waitFor(() => expect(screen.getByTestId('snapshot-input-summary')).toBeInTheDocument());
    // 摘要卡 + 各名單明細（中文欄名）
    expect(screen.getByText('候選客戶總筆數')).toBeInTheDocument();
    expect(screen.getByText('各名單筆數明細')).toBeInTheDocument();
    expect(screen.getByText('名單編號')).toBeInTheDocument();
  });

  it('點分派結果分頁 → 以分頁端點（getResultPage）呈現 23 欄表格', async () => {
    mockedGetSnapshot.mockResolvedValue(snap('config', {}));
    renderPage();
    await waitFor(() => expect(screen.getByTestId('snapshot-tab-result')).toBeInTheDocument());
    fireEvent.click(screen.getByTestId('snapshot-tab-result'));
    await waitFor(() => expect(mockedGetResultPage).toHaveBeenCalledWith(
      'R001',
      expect.objectContaining({ page: 1, pageSize: 50 }),
    ));
    await waitFor(() => expect(screen.getByTestId('snapshot-result-table')).toBeInTheDocument());
    expect(screen.getByText('台北分處')).toBeInTheDocument();
    // 摘要卡（來自 getRunSummary）
    expect(screen.getByText('分派部門數')).toBeInTheDocument();
    expect(screen.getByText('分派人員數')).toBeInTheDocument();
    // 分派結果分頁不呼叫快照 payload 端點（避免載入巨量 payload）
    expect(mockedGetSnapshot).not.toHaveBeenCalledWith('R001', 'result');
    // F115 回寫按鈕（部長角色）可用
    expect(screen.getByTestId('btn-writeback')).toBeEnabled();
  });

  it('分派結果分頁搜尋 → 帶 q 重新查詢並回第 1 頁', async () => {
    mockedGetSnapshot.mockResolvedValue(snap('config', {}));
    renderPage('R001', 'result');
    await waitFor(() => expect(screen.getByTestId('snapshot-result-table')).toBeInTheDocument());
    fireEvent.change(screen.getByTestId('result-search-input'), {
      target: { value: '20742' },
    });
    fireEvent.click(screen.getByTestId('result-search-btn'));
    await waitFor(() =>
      expect(mockedGetResultPage).toHaveBeenCalledWith(
        'R001',
        expect.objectContaining({ q: '20742', page: 1 }),
      ),
    );
  });

  it('404 顯示「找不到此份快照」', async () => {
    mockedGetSnapshot.mockRejectedValue({
      response: { status: 404, data: { message: 'not found' } },
    });
    renderPage();
    await waitFor(() =>
      expect(screen.getByTestId('snapshot-error')).toHaveTextContent(/找不到此份快照/),
    );
  });

  it('缺 runId 顯示錯誤', async () => {
    renderPage('', 'config');
    await waitFor(() =>
      expect(screen.getByTestId('snapshot-error')).toHaveTextContent(/缺少分派批次編號/),
    );
  });

  it('顯示「下載快照檔」與「以此比對」按鈕', async () => {
    mockedGetSnapshot.mockResolvedValue(snap('config', { listDefinitions: [] }));
    renderPage();
    await waitFor(() => expect(screen.getByTestId('btn-download-snapshot')).toBeInTheDocument());
    expect(screen.getByTestId('btn-compare-from-snapshot')).toBeInTheDocument();
  });
});
