/**
 * @deprecated F048 v2.0 Kanban 重構（2026-05-21）
 *
 * 本 test 對應 v1.0 表格列格式渲染、stage filter chip、ConfirmModal「停」字斷言，
 * 均因 v2.0 Kanban 重構而廢止。新 test 在：
 *   apps/web/src/pages/assignment/__tests__/list-kanban-page.test.tsx
 *
 * 廢止場景對應：
 *   - AC-1 表格列格式（v1.0）→ TS-F048-K-001/002（Kanban 卡片格式）
 *   - AC-5 stage filter chip 切換（v1.0）→ Kanban 已以 column 直接呈現各 stage（v2.0）
 *   - 「停」縮寫按鈕（v1.0）→ F052 v2.1 改為「停用」全寫（TS-F052-TXT-001~003）
 *
 * 本檔以 describe.skip 暫保留 git 歷史可追溯；後續 cleanup PR 可整檔刪除。
 */
import { render, screen, cleanup, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import { ListDefinitionPage } from '../list-definition-page';
import { ToastProvider } from '@/components/ui/toast';
import * as assignmentListApi from '@/api/assignment-list';
import * as authStore from '@/stores/auth-store';
import type { ListListsResponse } from '@/api/assignment-list';

vi.mock('@/api/assignment-list');
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
const mockedDisableList = vi.mocked(assignmentListApi.disableList);
const mockedGetUser = vi.mocked(authStore.getUser);
const mockedGetBusinessRole = vi.mocked(authStore.getBusinessRole);
const mockedGetEffectiveIdentity = vi.mocked(authStore.getEffectiveIdentity);

const baseResponse: ListListsResponse = {
  selectedYm: '202605',
  currentWorkYm: '202605',
  isHistorical: false,
  isFuture: false,
  lockState: { locked: false, reason: null },
  lists: [
    {
      listNo: 'OB202605001',
      listNm: '2026-05 業務一部 主力催收',
      prodKind: '汽車貸款',
      caseYear: '2026',
      specTp: null,
      listPeriodStart: null,
      listPeriodEnd: null,
      listInterval: null,
      settleSrc: null,
      cardType: 'M3',
      prodBest: null,
      status: 'active',
      stage: 'draft',
      createdBy: '王部長',
      createdAt: '2026-05-02T00:00:00.000Z',
      updatedAt: '2026-05-02T00:00:00.000Z',
    },
    {
      listNo: 'OB202605002',
      listNm: '2026-05 業務二部 信貸',
      prodKind: '信用貸款',
      caseYear: '2026',
      specTp: null,
      listPeriodStart: null,
      listPeriodEnd: null,
      listInterval: null,
      settleSrc: null,
      cardType: 'M5',
      prodBest: null,
      status: 'active',
      stage: 'dept_ratio',
      createdBy: '王部長',
      createdAt: '2026-05-03T00:00:00.000Z',
      updatedAt: '2026-05-03T00:00:00.000Z',
    },
    {
      listNo: 'OB202605003',
      listNm: '2026-05 業務三部 房貸',
      prodKind: '房貸',
      caseYear: '2026',
      specTp: null,
      listPeriodStart: null,
      listPeriodEnd: null,
      listInterval: null,
      settleSrc: null,
      cardType: 'HC',
      prodBest: null,
      status: 'active',
      stage: 'approval',
      createdBy: '王部長',
      createdAt: '2026-05-04T00:00:00.000Z',
      updatedAt: '2026-05-04T00:00:00.000Z',
    },
  ],
  stageCounts: {
    draft: 1,
    dept_ratio: 1,
    personnel_ratio: 0,
    approval: 1,
    ready: 0,
    disabled: 0,
  },
};

function renderPage() {
  return render(
    <MemoryRouter>
      <ToastProvider>
        <ListDefinitionPage />
      </ToastProvider>
    </MemoryRouter>,
  );
}

// @deprecated v2.0 Kanban 重構（見檔案頂部說明）
describe.skip('ListDefinitionPage (FE-2 M01 名單定義) — v1.0 表格列 DEPRECATED', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockedGetUser.mockReturnValue({
      id: 'a1',
      name: 'Admin',
      email: 'admin@cdmp.test',
      role: 'admin',
      isSalesManager: false,
      businessRole: null,
    });
    mockedGetBusinessRole.mockReturnValue(null);
    mockedGetEffectiveIdentity.mockReturnValue('admin');
    mockedListLists.mockResolvedValue(baseResponse);
  });

  afterEach(() => cleanup());

  // Demo 觀察點 #1: KPI 5 卡顯示
  it('顯示 KPI 5 卡（名單總數 / 草稿 / 進行中 / 待簽核 / 準備完成）', async () => {
    renderPage();
    await waitFor(() => expect(screen.getByTestId('kpi-section')).toBeInTheDocument());
    expect(screen.getByText('名單總數')).toBeInTheDocument();
    expect(screen.getByText('草稿階段')).toBeInTheDocument();
    expect(screen.getByText('進行中')).toBeInTheDocument();
    // '待簽核' and '準備完成' 在 KPI 卡與 stage filter chip 中皆有，故用 getAllByText
    expect(screen.getAllByText('待簽核').length).toBeGreaterThan(0);
    expect(screen.getAllByText('準備完成').length).toBeGreaterThan(0);
  });

  // Demo 觀察點 #2: 階段 filter chips 5 個
  it('5 個 stage filter chip 預設全部啟用', async () => {
    renderPage();
    await waitFor(() => expect(screen.getByTestId('stage-filter-draft')).toBeInTheDocument());
    expect(screen.getByTestId('stage-filter-dept_ratio')).toBeInTheDocument();
    expect(screen.getByTestId('stage-filter-personnel_ratio')).toBeInTheDocument();
    expect(screen.getByTestId('stage-filter-approval')).toBeInTheDocument();
    expect(screen.getByTestId('stage-filter-ready')).toBeInTheDocument();
  });

  // Demo 觀察點 #3: 表格渲染 3 筆名單
  it('渲染 lists 中 3 筆名單', async () => {
    renderPage();
    await waitFor(() => expect(screen.getByText('OB202605001')).toBeInTheDocument());
    expect(screen.getByText('OB202605002')).toBeInTheDocument();
    expect(screen.getByText('OB202605003')).toBeInTheDocument();
  });

  // Demo 觀察點 #4: 階段 chip 切換可過濾表格
  it('關閉 draft chip 後 OB202605001 (draft) 不再顯示', async () => {
    renderPage();
    await waitFor(() => expect(screen.getByText('OB202605001')).toBeInTheDocument());
    fireEvent.click(screen.getByTestId('stage-filter-draft'));
    await waitFor(() =>
      expect(screen.queryByText('OB202605001')).not.toBeInTheDocument(),
    );
    expect(screen.getByText('OB202605002')).toBeInTheDocument();
  });

  // Demo 觀察點 #5: 搜尋過濾
  it('搜尋 LIST_NO 子字串可過濾', async () => {
    renderPage();
    await waitFor(() => expect(screen.getByText('OB202605001')).toBeInTheDocument());
    const search = screen.getByPlaceholderText(/搜尋名單名稱/);
    fireEvent.change(search, { target: { value: '002' } });
    expect(screen.queryByText('OB202605001')).not.toBeInTheDocument();
    expect(screen.getByText('OB202605002')).toBeInTheDocument();
  });

  // Demo 觀察點 #6: historical banner
  it('isHistorical=true 顯示歷史月份唯讀通知條 + 新增按鈕停用', async () => {
    mockedListLists.mockResolvedValue({
      ...baseResponse,
      selectedYm: '202604',
      isHistorical: true,
    });
    renderPage();
    await waitFor(() =>
      expect(screen.getByTestId('historical-banner')).toBeInTheDocument(),
    );
    expect(screen.getByTestId('btn-create-list')).toBeDisabled();
  });

  // Demo 觀察點 #7: locked banner
  it('lockState.locked=true 顯示月跑鎖通知條 + 新增按鈕停用', async () => {
    mockedListLists.mockResolvedValue({
      ...baseResponse,
      lockState: { locked: true, reason: '分派執行中' },
    });
    renderPage();
    await waitFor(() => expect(screen.getByTestId('locked-banner')).toBeInTheDocument());
    expect(screen.getByTestId('btn-create-list')).toBeDisabled();
  });

  // Demo 觀察點 #8: 業務處長（section_chief） 寫入按鈕停用
  it('section_chief 身份 → 新增名單按鈕停用（只讀）', async () => {
    mockedGetEffectiveIdentity.mockReturnValue('section_chief');
    mockedGetBusinessRole.mockReturnValue('section_chief');
    renderPage();
    await waitFor(() => expect(screen.getByTestId('btn-create-list')).toBeInTheDocument());
    expect(screen.getByTestId('btn-create-list')).toBeDisabled();
  });

  // Demo 觀察點 #9: 業務部長（director） 寫入按鈕可用
  it('director 身份 → 新增名單按鈕可用', async () => {
    mockedGetEffectiveIdentity.mockReturnValue('director');
    mockedGetBusinessRole.mockReturnValue('director');
    renderPage();
    await waitFor(() => expect(screen.getByTestId('btn-create-list')).toBeInTheDocument());
    expect(screen.getByTestId('btn-create-list')).not.toBeDisabled();
  });

  // Demo 觀察點 #10: 空狀態
  it('lists 為空時顯示「本月尚無名單」', async () => {
    mockedListLists.mockResolvedValue({
      ...baseResponse,
      lists: [],
      stageCounts: { draft: 0, dept_ratio: 0, personnel_ratio: 0, approval: 0, ready: 0, disabled: 0 },
    });
    renderPage();
    await waitFor(() => expect(screen.getByTestId('empty-state')).toBeInTheDocument());
    expect(screen.getByText('本月尚無名單')).toBeInTheDocument();
  });

  // Demo 觀察點 #11: 停用 modal 開啟 + 呼叫 API
  it('點停用圖示 → 開啟 danger ConfirmModal → 確認 → 呼叫 disableList API', async () => {
    mockedDisableList.mockResolvedValue({});
    renderPage();
    await waitFor(() => expect(screen.getByText('OB202605001')).toBeInTheDocument());

    // 點 draft 列上的 archive 按鈕
    const archiveBtn = screen.getByTitle('停用名單');
    fireEvent.click(archiveBtn);

    expect(screen.getByTestId('confirm-modal-danger')).toBeInTheDocument();
    expect(screen.getByText('確認停用名單 OB202605001？')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /確認停用/ }));

    await waitFor(() =>
      expect(mockedDisableList).toHaveBeenCalledWith('OB202605001'),
    );
  });

  // Demo 觀察點 #12: footer 顯示 visible / total 與 API hint
  it('footer 顯示 visible / total count + API URL hint', async () => {
    renderPage();
    await waitFor(() => expect(screen.getByTestId('total-count')).toHaveTextContent('3'));
    expect(screen.getByTestId('visible-count')).toHaveTextContent('3');
    expect(screen.getByText(/GET \/api\/v1\/assignment\/lists\?ym=202605/)).toBeInTheDocument();
  });

  describe('Phase 3 P2-5', () => {
    it('表頭含「篩選條件」與「CR 開關」欄', async () => {
      renderPage();
      await waitFor(() =>
        expect(screen.getByTestId('list-definition-table-head')).toBeInTheDocument(),
      );
      const head = screen.getByTestId('list-definition-table-head');
      expect(head.textContent).toContain('篩選條件');
      expect(head.textContent).toContain('CR 開關');
    });

    it('每筆名單渲染條件預覽 cell + CR 狀態 badge', async () => {
      renderPage();
      await waitFor(() =>
        expect(screen.getByTestId('list-conditions-OB202605001')).toBeInTheDocument(),
      );
      expect(screen.getByTestId('list-cr-OB202605001')).toBeInTheDocument();
    });
  });

  // Phase 5d 波 10：v2.1 condition_payload-driven filter chip
  describe('Phase 5d 波 10 — v2.1 filter chip 預覽', () => {
    // ld.test#new1：mock list 含 conditionPayload → 條件預覽顯示 `prod_kind in (01,02)`
    it('ld.test#new1: mock list 含 conditionPayload → 條件預覽優先顯示 conditionPayload', async () => {
      mockedListLists.mockResolvedValue({
        ...baseResponse,
        lists: [
          {
            ...baseResponse.lists[0],
            listNo: 'OB202605010',
            // 5 個 v2.0 一級欄位 fallback 應被 conditionPayload 覆蓋
            prodKind: '舊資料應被忽略',
            specTp: '11$$12',
            conditionPayload: {
              conditions: [
                { columnName: 'prod_kind', fieldType: 'categorical', values: ['01', '02'] },
              ],
              logic: 'AND',
            },
          },
        ],
      });
      renderPage();
      await waitFor(() =>
        expect(screen.getByTestId('list-conditions-OB202605010')).toBeInTheDocument(),
      );
      const cell = screen.getByTestId('list-conditions-OB202605010');
      // 應以 conditionPayload 為來源（不顯示 prodKind 的 "舊資料應被忽略"）
      expect(cell.textContent).toContain('prod_kind in (01,02)');
      expect(cell.textContent).not.toContain('舊資料應被忽略');
    });

    // ld.test#new2：mock list 無 conditionPayload（legacy）→ 沿用 5 欄位 + LEGACY 小徽章
    it('ld.test#new2: legacy 名單（conditionPayload IS NULL）→ 沿用舊欄位 + LEGACY 徽章', async () => {
      mockedListLists.mockResolvedValue({
        ...baseResponse,
        lists: [
          {
            ...baseResponse.lists[0],
            listNo: 'OB202604099',
            prodKind: 'AUTO',
            caseYear: '1$$2$$3',
            conditionPayload: null,
          },
        ],
      });
      renderPage();
      await waitFor(() =>
        expect(screen.getByTestId('list-conditions-OB202604099')).toBeInTheDocument(),
      );
      const cell = screen.getByTestId('list-conditions-OB202604099');
      // 沿用既有 fallback
      expect(cell.textContent).toContain('PROD_KIND=AUTO');
      // LEGACY 徽章
      expect(screen.getByTestId('legacy-badge-OB202604099')).toBeInTheDocument();
    });
  });
});
