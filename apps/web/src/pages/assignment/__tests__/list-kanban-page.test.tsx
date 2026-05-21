/**
 * F048 v2.0 Kanban 主頁 — 主測試檔
 *
 * 對應 test spec：
 *   - F048-test.md §二 Kanban 渲染（TS-F048-K-001~010）
 *   - F048-test.md §四 Detail Drawer（TS-F048-D-001~003）
 *   - F048-test.md §五 Banner（TS-F048-B-001~002）
 *
 * 對應 prototype: /prototypes/27-list-definition.html v2.3.1
 *
 * Mock 策略：
 *   - vi.mock('@/api/assignment-list')：listLists / getFullSnapshot / disableList
 *   - vi.mock('@/stores/auth-store')：getUser / getEffectiveIdentity
 *
 * 後續 commit 補上：
 *   - commit 5：Detail Drawer 4-tab + Ready CTA Banner（F049 / F050 SS / F061 CTA）
 *   - commit 6：F052 「停用」label + sessionStorage signal consumer
 *   - commit 8：F081 / F085 / F089 Rollback toast + 卡片遷移
 */
import { render, screen, cleanup, waitFor, within, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import { ListDefinitionPage } from '../list-definition-page';
import { ToastProvider } from '@/components/ui/toast';
import * as assignmentListApi from '@/api/assignment-list';
import * as authStore from '@/stores/auth-store';
import type {
  ListListsResponse,
  AssignmentListItem,
} from '@/api/assignment-list';

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
const mockedGetEffectiveIdentity = vi.mocked(authStore.getEffectiveIdentity);
const mockedGetUser = vi.mocked(authStore.getUser);
const mockedGetBusinessRole = vi.mocked(authStore.getBusinessRole);

function makeItem(over: Partial<AssignmentListItem>): AssignmentListItem {
  return {
    listNo: 'OB202605001',
    listNm: '車貸催收名單',
    prodKind: '01',
    caseYear: null,
    specTp: null,
    caseStatus: null,
    crEnabled: true,
    listPeriodStart: null,
    listPeriodEnd: null,
    listInterval: null,
    settleSrc: null,
    cardType: null,
    prodBest: null,
    status: 'active',
    stage: 'draft',
    createdBy: '王部長',
    createdAt: '2026-05-09T01:14:00Z',
    updatedAt: '2026-05-09T01:14:00Z',
    conditionPayload: {
      conditions: [
        { columnName: 'case_status', fieldType: 'categorical', values: ['01', '02'] },
        { columnName: 'caseyear', fieldType: 'categorical', values: ['3'] },
      ],
      logic: 'AND',
    },
    ...over,
  };
}

function buildResponse(over: Partial<ListListsResponse> = {}): ListListsResponse {
  return {
    selectedYm: '202605',
    currentWorkYm: '202605',
    isHistorical: false,
    isFuture: false,
    lockState: { locked: false, reason: null },
    lists: [makeItem({ listNo: 'OB202605001' })],
    stageCounts: {
      draft: 1,
      dept_ratio: 0,
      personnel_ratio: 0,
      approval: 0,
      ready: 0,
      disabled: 0,
    },
    ...over,
  };
}

function renderPage() {
  return render(
    <ToastProvider>
      <MemoryRouter>
        <ListDefinitionPage />
      </MemoryRouter>
    </ToastProvider>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  mockedGetUser.mockReturnValue({
    id: 'u-1',
    name: '王部長',
    email: 'dir@cdmp.test',
    role: 'user',
    businessRole: 'director',
  });
  mockedGetBusinessRole.mockReturnValue('director');
  mockedGetEffectiveIdentity.mockReturnValue('director');
  if (typeof window !== 'undefined' && window.sessionStorage) {
    window.sessionStorage.clear();
  }
});

afterEach(cleanup);

describe('F048 v2.0 Kanban 主頁 — 渲染（TS-F048-K-001~008）', () => {
  it('K-001 頁面載入渲染 5 欄 Kanban 看板，各欄欄頭存在', async () => {
    mockedListLists.mockResolvedValue(
      buildResponse({
        lists: [
          makeItem({ listNo: 'OB202605001', stage: 'draft' }),
          makeItem({ listNo: 'OB202605002', stage: 'draft' }),
          makeItem({ listNo: 'OB202605003', stage: 'dept_ratio' }),
          makeItem({ listNo: 'OB202605004', stage: 'personnel_ratio' }),
          makeItem({ listNo: 'OB202605005', stage: 'ready' }),
        ],
        stageCounts: {
          draft: 2,
          dept_ratio: 1,
          personnel_ratio: 1,
          approval: 0,
          ready: 1,
          disabled: 0,
        },
      }),
    );

    renderPage();

    await waitFor(() => {
      expect(screen.getByTestId('kanban-board')).toBeTruthy();
    });

    expect(screen.getByTestId('kanban-column-draft')).toBeTruthy();
    expect(screen.getByTestId('kanban-column-dept_ratio')).toBeTruthy();
    expect(screen.getByTestId('kanban-column-personnel_ratio')).toBeTruthy();
    expect(screen.getByTestId('kanban-column-approval')).toBeTruthy();
    expect(screen.getByTestId('kanban-column-ready')).toBeTruthy();

    // 各欄頭 badge 數字
    const draftHeader = screen.getByTestId('kanban-column-draft');
    expect(within(draftHeader).getByTestId('column-count-draft').textContent).toContain('2');
  });

  it('K-002 名單以卡片形式正確渲染（list_no / listNm / CR badge / condition chips）', async () => {
    mockedListLists.mockResolvedValue(
      buildResponse({
        lists: [makeItem({ listNo: 'OB202605001', listNm: '車貸催收名單', crEnabled: true })],
        stageCounts: {
          draft: 1,
          dept_ratio: 0,
          personnel_ratio: 0,
          approval: 0,
          ready: 0,
          disabled: 0,
        },
      }),
    );

    renderPage();

    await waitFor(() => {
      expect(screen.getByTestId('kanban-card-OB202605001')).toBeTruthy();
    });

    const card = screen.getByTestId('kanban-card-OB202605001');
    expect(card.textContent).toContain('OB202605001');
    expect(card.textContent).toContain('車貸催收名單');
    // CR badge（crEnabled=true）
    expect(within(card).getByText(/CR/)).toBeTruthy();
    // condition chips：case_status 與 caseyear 兩個欄位
    expect(card.textContent).toContain('case_status');
    expect(card.textContent).toContain('caseyear');
  });

  it('K-003 conditionPayload IS NULL → 卡片顯示 LEGACY badge', async () => {
    mockedListLists.mockResolvedValue(
      buildResponse({
        lists: [makeItem({ listNo: 'OB202605099', conditionPayload: null })],
        stageCounts: {
          draft: 1,
          dept_ratio: 0,
          personnel_ratio: 0,
          approval: 0,
          ready: 0,
          disabled: 0,
        },
      }),
    );

    renderPage();

    await waitFor(() => {
      expect(screen.getByTestId('kanban-card-OB202605099')).toBeTruthy();
    });

    const card = screen.getByTestId('kanban-card-OB202605099');
    expect(within(card).getByText(/LEGACY/)).toBeTruthy();
  });

  it('K-004 chips 超過 2 個時顯示 +N', async () => {
    mockedListLists.mockResolvedValue(
      buildResponse({
        lists: [
          makeItem({
            listNo: 'OB202605001',
            conditionPayload: {
              conditions: [
                { columnName: 'case_status', fieldType: 'categorical', values: ['01'] },
                { columnName: 'caseyear', fieldType: 'categorical', values: ['3'] },
                { columnName: 'prod_kind', fieldType: 'categorical', values: ['01'] },
                { columnName: 'spec_tp', fieldType: 'categorical', values: ['12'] },
              ],
              logic: 'AND',
            },
          }),
        ],
        stageCounts: {
          draft: 1,
          dept_ratio: 0,
          personnel_ratio: 0,
          approval: 0,
          ready: 0,
          disabled: 0,
        },
      }),
    );

    renderPage();

    await waitFor(() => {
      expect(screen.getByTestId('kanban-card-OB202605001')).toBeTruthy();
    });

    const card = screen.getByTestId('kanban-card-OB202605001');
    // 4 conditions → 2 chips + +2
    expect(card.textContent).toMatch(/\+2/);
  });

  it('K-005 某欄無名單時顯示「無名單」提示', async () => {
    mockedListLists.mockResolvedValue(
      buildResponse({
        lists: [makeItem({ listNo: 'OB202605001', stage: 'draft' })],
        stageCounts: {
          draft: 1,
          dept_ratio: 0,
          personnel_ratio: 0,
          approval: 0,
          ready: 0,
          disabled: 0,
        },
      }),
    );

    renderPage();

    await waitFor(() => {
      expect(screen.getByTestId('kanban-column-approval')).toBeTruthy();
    });

    const approvalCol = screen.getByTestId('kanban-column-approval');
    expect(approvalCol.textContent).toContain('無名單');
  });

  it('K-006 KPI 4 卡數字正確（總/進行中/待簽核/準備完成）', async () => {
    mockedListLists.mockResolvedValue(
      buildResponse({
        lists: [],
        stageCounts: {
          draft: 2,
          dept_ratio: 1,
          personnel_ratio: 1,
          approval: 2,
          ready: 3,
          disabled: 0,
        },
      }),
    );

    renderPage();

    await waitFor(() => {
      expect(screen.getByTestId('kpi-total')).toBeTruthy();
    });

    // 名單總數 = 2+1+1+2+3 = 9
    expect(screen.getByTestId('kpi-total').textContent).toContain('9');
    // 進行中 = 1+1+2 = 4
    expect(screen.getByTestId('kpi-in-progress').textContent).toContain('4');
    // 待簽核 = 2
    expect(screen.getByTestId('kpi-approval').textContent).toContain('2');
    // 準備完成 = 3
    expect(screen.getByTestId('kpi-ready').textContent).toContain('3');
  });

  it('K-007 月份準備度進度條正確渲染（含百分比與未完成數）', async () => {
    mockedListLists.mockResolvedValue(
      buildResponse({
        lists: [],
        stageCounts: {
          draft: 2,
          dept_ratio: 1,
          personnel_ratio: 1,
          approval: 2,
          ready: 3,
          disabled: 0,
        },
      }),
    );

    renderPage();

    await waitFor(() => {
      expect(screen.getByTestId('ready-progress-bar')).toBeTruthy();
    });

    const progress = screen.getByTestId('ready-progress-bar');
    // 3 / 9 = 33%
    expect(progress.textContent).toMatch(/33|3\s*\/\s*9/);
    // 尚有 6 份未完成
    expect(progress.textContent).toContain('6');
  });

  it('K-008 role=user → 整頁封鎖說明卡渲染，Kanban 不渲染', async () => {
    mockedGetEffectiveIdentity.mockReturnValue('user');
    mockedGetBusinessRole.mockReturnValue(null);
    mockedListLists.mockResolvedValue(buildResponse());

    renderPage();

    await waitFor(() => {
      expect(screen.getByTestId('sales-blocked-banner')).toBeTruthy();
    });
    expect(screen.queryByTestId('kanban-board')).toBeNull();
    expect(screen.queryByTestId('toolbar')).toBeNull();
  });
});

describe('F048 v2.0 — 搜尋過濾（TS-F048-K-009~010）', () => {
  it('K-009 搜尋框輸入關鍵字過濾卡片', async () => {
    mockedListLists.mockResolvedValue(
      buildResponse({
        lists: [
          makeItem({ listNo: 'OB202605001', listNm: '車貸催收名單', stage: 'draft' }),
          makeItem({ listNo: 'OB202605002', listNm: '信貸月跑', stage: 'draft' }),
          makeItem({ listNo: 'OB202605003', listNm: '車貸逾期', stage: 'draft' }),
        ],
        stageCounts: {
          draft: 3,
          dept_ratio: 0,
          personnel_ratio: 0,
          approval: 0,
          ready: 0,
          disabled: 0,
        },
      }),
    );

    renderPage();

    await waitFor(() => {
      expect(screen.getByTestId('kanban-card-OB202605001')).toBeTruthy();
    });

    const search = screen.getByTestId('search-input') as HTMLInputElement;
    fireEvent.change(search, { target: { value: '車貸' } });

    await waitFor(() => {
      expect(screen.getByTestId('kanban-card-OB202605001')).toBeTruthy();
      expect(screen.queryByTestId('kanban-card-OB202605002')).toBeNull();
      expect(screen.getByTestId('kanban-card-OB202605003')).toBeTruthy();
    });
  });

  it('K-010 清空搜尋框恢復全部卡片', async () => {
    mockedListLists.mockResolvedValue(
      buildResponse({
        lists: [
          makeItem({ listNo: 'OB202605001', listNm: '車貸催收名單', stage: 'draft' }),
          makeItem({ listNo: 'OB202605002', listNm: '信貸月跑', stage: 'draft' }),
        ],
        stageCounts: {
          draft: 2,
          dept_ratio: 0,
          personnel_ratio: 0,
          approval: 0,
          ready: 0,
          disabled: 0,
        },
      }),
    );

    renderPage();

    await waitFor(() => {
      expect(screen.getByTestId('kanban-card-OB202605002')).toBeTruthy();
    });

    const search = screen.getByTestId('search-input') as HTMLInputElement;
    fireEvent.change(search, { target: { value: '車貸' } });
    await waitFor(() => {
      expect(screen.queryByTestId('kanban-card-OB202605002')).toBeNull();
    });
    fireEvent.change(search, { target: { value: '' } });

    await waitFor(() => {
      expect(screen.getByTestId('kanban-card-OB202605001')).toBeTruthy();
      expect(screen.getByTestId('kanban-card-OB202605002')).toBeTruthy();
    });
  });
});

describe('F048 v2.0 — Detail Drawer（TS-F048-D-001~003）', () => {
  it('D-001 點擊「查看」→ 觸發 full-snapshot → Drawer 滑入含 4 個頁籤', async () => {
    mockedListLists.mockResolvedValue(
      buildResponse({
        lists: [makeItem({ listNo: 'OB202605001', stage: 'draft' })],
        stageCounts: {
          draft: 1,
          dept_ratio: 0,
          personnel_ratio: 0,
          approval: 0,
          ready: 0,
          disabled: 0,
        },
      }),
    );
    const mockedGetFullSnapshot = vi.mocked(assignmentListApi.getFullSnapshot);
    mockedGetFullSnapshot.mockResolvedValue({
      list: {
        listNo: 'OB202605001',
        listNm: '車貸催收名單',
        stage: 'draft',
        status: 'active',
        projectWorkym: '202605',
        cardType: null,
        crEnabled: true,
        listPeriodStart: '1',
        listPeriodEnd: '6',
        listInterval: '1',
        conditionPayload: {
          conditions: [{ columnName: 'prod_kind', fieldType: 'categorical', values: ['01'] }],
          logic: 'AND',
        },
        legacyEntityFallback: null,
        createdBy: 'u-1',
        createdAt: '2026-05-09T01:14:00Z',
        updatedAt: '2026-05-09T01:14:00Z',
      },
      deptRatios: [],
      personnelRatios: [],
      auditTrail: [
        {
          action: 'CREATE',
          operatorId: 'u-1',
          operatorEmpNm: '王部長',
          before: null,
          after: { stage: 'draft' },
          at: '2026-05-09T01:14:00Z',
        },
      ],
    });

    renderPage();
    await waitFor(() => {
      expect(screen.getByTestId('btn-view-OB202605001')).toBeTruthy();
    });

    fireEvent.click(screen.getByTestId('btn-view-OB202605001'));

    await waitFor(() => {
      expect(screen.getByTestId('detail-drawer')).toBeTruthy();
    });
    expect(mockedGetFullSnapshot).toHaveBeenCalledWith('OB202605001');
    // 4 個頁籤
    expect(screen.getByTestId('drawer-tab-conditions')).toBeTruthy();
    expect(screen.getByTestId('drawer-tab-dept')).toBeTruthy();
    expect(screen.getByTestId('drawer-tab-personnel')).toBeTruthy();
    expect(screen.getByTestId('drawer-tab-history')).toBeTruthy();
  });

  it('D-002 draft 階段 Drawer — 部門比例頁籤顯示「尚未設定」', async () => {
    mockedListLists.mockResolvedValue(
      buildResponse({
        lists: [makeItem({ listNo: 'OB202605001', stage: 'draft' })],
        stageCounts: {
          draft: 1,
          dept_ratio: 0,
          personnel_ratio: 0,
          approval: 0,
          ready: 0,
          disabled: 0,
        },
      }),
    );
    const mockedGetFullSnapshot = vi.mocked(assignmentListApi.getFullSnapshot);
    mockedGetFullSnapshot.mockResolvedValue({
      list: {
        listNo: 'OB202605001',
        listNm: '車貸催收名單',
        stage: 'draft',
        status: 'active',
        projectWorkym: '202605',
        cardType: null,
        crEnabled: true,
        listPeriodStart: '1',
        listPeriodEnd: '6',
        listInterval: '1',
        conditionPayload: { conditions: [], logic: 'AND' },
        legacyEntityFallback: null,
        createdBy: 'u-1',
        createdAt: null,
        updatedAt: null,
      },
      deptRatios: [],
      personnelRatios: [],
      auditTrail: [],
    });

    renderPage();
    await waitFor(() => {
      expect(screen.getByTestId('btn-view-OB202605001')).toBeTruthy();
    });
    fireEvent.click(screen.getByTestId('btn-view-OB202605001'));
    await waitFor(() => {
      expect(screen.getByTestId('detail-drawer')).toBeTruthy();
    });

    fireEvent.click(screen.getByTestId('drawer-tab-dept'));
    await waitFor(() => {
      const panel = screen.getByTestId('drawer-panel-dept');
      expect(panel.textContent).toContain('尚未設定');
    });
  });

  it('D-003 月跑執行中「查看」按鈕仍可觸發 Drawer', async () => {
    mockedListLists.mockResolvedValue(
      buildResponse({
        lockState: { locked: true, reason: '分派執行中' },
        lists: [makeItem({ listNo: 'OB202605001', stage: 'draft' })],
        stageCounts: {
          draft: 1,
          dept_ratio: 0,
          personnel_ratio: 0,
          approval: 0,
          ready: 0,
          disabled: 0,
        },
      }),
    );
    const mockedGetFullSnapshot = vi.mocked(assignmentListApi.getFullSnapshot);
    mockedGetFullSnapshot.mockResolvedValue({
      list: {
        listNo: 'OB202605001',
        listNm: '車貸催收名單',
        stage: 'draft',
        status: 'active',
        projectWorkym: '202605',
        cardType: null,
        crEnabled: true,
        listPeriodStart: '1',
        listPeriodEnd: '6',
        listInterval: '1',
        conditionPayload: { conditions: [], logic: 'AND' },
        legacyEntityFallback: null,
        createdBy: 'u-1',
        createdAt: null,
        updatedAt: null,
      },
      deptRatios: [],
      personnelRatios: [],
      auditTrail: [],
    });

    renderPage();
    await waitFor(() => {
      expect(screen.getByTestId('btn-view-OB202605001')).toBeTruthy();
    });
    const viewBtn = screen.getByTestId('btn-view-OB202605001') as HTMLButtonElement;
    expect(viewBtn.disabled).toBe(false);
    fireEvent.click(viewBtn);
    await waitFor(() => {
      expect(screen.getByTestId('detail-drawer')).toBeTruthy();
    });
    expect(mockedGetFullSnapshot).toHaveBeenCalledWith('OB202605001');
  });
});

describe('F049 v1.1 / F061 v1.4 — Ready CTA Banner（TS-F049-CTA-001~005 + F061-CTA-001~003）', () => {
  function withReady(readyCount: number, locked = false, historical = false) {
    return buildResponse({
      isHistorical: historical,
      lockState: locked
        ? { locked: true, reason: '分派執行中' }
        : { locked: false, reason: null },
      lists: Array.from({ length: readyCount }, (_, i) =>
        makeItem({ listNo: `OB202605R${String(i).padStart(2, '0')}`, stage: 'ready' }),
      ),
      stageCounts: {
        draft: 0,
        dept_ratio: 0,
        personnel_ratio: 0,
        approval: 0,
        ready: readyCount,
        disabled: 0,
      },
    });
  }

  it('F049-CTA-001 / F061-CTA-001 ready ≥1 且非歷史月份、非月跑鎖 → Banner 渲染含主按鈕 + secondary 試算', async () => {
    mockedListLists.mockResolvedValue(withReady(2));
    renderPage();
    await waitFor(() => {
      expect(screen.getByTestId('ready-cta-banner')).toBeTruthy();
    });
    const main = screen.getByTestId('btn-trigger-run') as HTMLButtonElement;
    expect(main.disabled).toBe(false);
    // 試算為 react-router Link → <a> 元素；非 locked 時應為 anchor 而非 disabled button
    const sec = screen.getByTestId('btn-estimate');
    expect(sec.tagName.toLowerCase()).toBe('a');
    expect(sec.getAttribute('aria-disabled')).not.toBe('true');
  });

  it('F049-CTA-002 / F061-CTA-002 ready=0 → CTA Banner DOM 完全不存在', async () => {
    mockedListLists.mockResolvedValue(withReady(0));
    renderPage();
    await waitFor(() => {
      expect(screen.getByTestId('kanban-board')).toBeTruthy();
    });
    expect(screen.queryByTestId('ready-cta-banner')).toBeNull();
  });

  it('F049-CTA-003 歷史月份 → CTA Banner DOM 完全不存在', async () => {
    mockedListLists.mockResolvedValue(withReady(3, false, true));
    renderPage();
    await waitFor(() => {
      expect(screen.getByTestId('historical-banner')).toBeTruthy();
    });
    expect(screen.queryByTestId('ready-cta-banner')).toBeNull();
  });

  it('F049-CTA-004 / F061-CTA-003 月跑執行中 → Banner disabled，主按鈕 + 試算均 disabled', async () => {
    mockedListLists.mockResolvedValue(withReady(2, true));
    renderPage();
    await waitFor(() => {
      expect(screen.getByTestId('ready-cta-banner')).toBeTruthy();
    });
    const main = screen.getByTestId('btn-trigger-run') as HTMLButtonElement;
    const sec = screen.getByTestId('btn-estimate') as HTMLButtonElement;
    expect(main.disabled).toBe(true);
    expect(sec.disabled).toBe(true);
  });

  it('F049-CTA-005 secondary「試算」按鈕點擊 → 導向 stage 0 估算頁', async () => {
    mockedListLists.mockResolvedValue(withReady(1));
    renderPage();
    await waitFor(() => {
      expect(screen.getByTestId('btn-estimate')).toBeTruthy();
    });
    const sec = screen.getByTestId('btn-estimate') as HTMLAnchorElement;
    // 預期 anchor href 為 /assignment/estimate（App.tsx 既有 route）
    expect(sec.getAttribute('href')).toContain('/assignment/estimate');
  });
});

describe('F048 v2.0 — Banner（TS-F048-B-001~002）', () => {
  it('B-001 歷史月份 → 紅色橫幅；寫入按鈕 DOM 不存在', async () => {
    mockedListLists.mockResolvedValue(
      buildResponse({
        selectedYm: '202504',
        currentWorkYm: '202605',
        isHistorical: true,
        lists: [makeItem({ listNo: 'OB202504001', stage: 'draft' })],
        stageCounts: {
          draft: 1,
          dept_ratio: 0,
          personnel_ratio: 0,
          approval: 0,
          ready: 0,
          disabled: 0,
        },
      }),
    );

    renderPage();

    await waitFor(() => {
      expect(screen.getByTestId('historical-banner')).toBeTruthy();
    });

    expect(screen.getByTestId('historical-banner').textContent).toContain('歷史月份');
    // 寫入按鈕 DOM 不存在
    expect(screen.queryByTestId('btn-edit-OB202504001')).toBeNull();
    expect(screen.queryByTestId('btn-disable-OB202504001')).toBeNull();
    // 查看保留
    expect(screen.getByTestId('btn-view-OB202504001')).toBeTruthy();
  });

  it('B-002 月跑執行中 → 橘色通知列；Toolbar 新增名單 disabled；寫入按鈕 disabled；查看 enabled', async () => {
    mockedListLists.mockResolvedValue(
      buildResponse({
        lockState: { locked: true, reason: '分派執行中' },
        lists: [makeItem({ listNo: 'OB202605001', stage: 'draft' })],
        stageCounts: {
          draft: 1,
          dept_ratio: 0,
          personnel_ratio: 0,
          approval: 0,
          ready: 0,
          disabled: 0,
        },
      }),
    );

    renderPage();

    await waitFor(() => {
      expect(screen.getByTestId('locked-banner')).toBeTruthy();
    });

    expect(screen.getByTestId('locked-banner').textContent).toContain('分派執行中');
    const createBtn = screen.getByTestId('btn-create') as HTMLButtonElement;
    expect(createBtn.disabled).toBe(true);
    const editBtn = screen.getByTestId('btn-edit-OB202605001') as HTMLButtonElement;
    expect(editBtn.disabled).toBe(true);
    const viewBtn = screen.getByTestId('btn-view-OB202605001') as HTMLButtonElement;
    expect(viewBtn.disabled).toBe(false);
  });
});
