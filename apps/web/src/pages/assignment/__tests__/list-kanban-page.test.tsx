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
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { MemoryRouter, useLocation } from 'react-router-dom';
import { ListDefinitionPage } from '../list-definition-page';
import { AssignmentWorkYmProvider } from '@/contexts/assignment-work-ym-context';
import { ToastProvider } from '@/components/ui/toast';
import * as assignmentListApi from '@/api/assignment-list';
import * as assignmentStageApi from '@/api/assignment-stage';
import * as authStore from '@/stores/auth-store';
import type {
  ListListsResponse,
  AssignmentListItem,
} from '@/api/assignment-list';

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
const mockedGetCurrentWorkYm = vi.mocked(assignmentListApi.getCurrentWorkYm);
const mockedGetEffectiveIdentity = vi.mocked(authStore.getEffectiveIdentity);
const mockedGetUser = vi.mocked(authStore.getUser);
const mockedGetBusinessRole = vi.mocked(authStore.getBusinessRole);
const mockedApproveList = vi.mocked(assignmentStageApi.approveList);
const mockedRejectList = vi.mocked(assignmentStageApi.rejectList);

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
        <AssignmentWorkYmProvider>
          <ListDefinitionPage />
        </AssignmentWorkYmProvider>
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
  // F097：Context 初始化錨點月（targetWorkYm = 202606）
  mockedGetCurrentWorkYm.mockResolvedValue({ currentWorkYm: '202605' });
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
      // 等待資料載入完成（Context → getCurrentWorkYm → listLists 之非同步鏈）
      const draftHeader = screen.getByTestId('kanban-column-draft');
      expect(
        within(draftHeader).getByTestId('column-count-draft').textContent,
      ).toContain('2');
    });

    expect(screen.getByTestId('kanban-board')).toBeTruthy();
    expect(screen.getByTestId('kanban-column-draft')).toBeTruthy();
    expect(screen.getByTestId('kanban-column-dept_ratio')).toBeTruthy();
    expect(screen.getByTestId('kanban-column-personnel_ratio')).toBeTruthy();
    expect(screen.getByTestId('kanban-column-approval')).toBeTruthy();
    expect(screen.getByTestId('kanban-column-ready')).toBeTruthy();
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
      // 等待資料載入（非同步鏈）後 KPI 總數出現
      expect(screen.getByTestId('kpi-total').textContent).toContain('9');
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
      // 等待資料載入（非同步鏈）後進度條反映 ready 3 / total 9
      const bar = screen.getByTestId('ready-progress-bar');
      expect(bar.textContent).toMatch(/33|3\s*\/\s*9/);
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

describe('Detail Drawer 簽核歷史 — 階段事件 + 拒絕原因（entity_type fix 2026-05-26）', () => {
  function snapshotWithHistory() {
    return {
      list: {
        listNo: 'OB202605050',
        listNm: '簽核歷史測試名單',
        stage: 'personnel_ratio' as const,
        status: 'active' as const,
        projectWorkym: '202605',
        cardType: null,
        crEnabled: true,
        listPeriodStart: '1',
        listPeriodEnd: '6',
        listInterval: '1',
        conditionPayload: { conditions: [], logic: 'AND' as const },
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
        {
          action: 'STAGE_ADVANCE',
          operatorId: 'u-1',
          operatorEmpNm: '王部長',
          before: { fromStage: 'personnel_ratio' },
          after: { fromStage: 'personnel_ratio', toStage: 'approval' },
          at: '2026-05-10T09:00:00Z',
        },
        {
          action: 'STAGE_REJECT',
          operatorId: 'u-1',
          operatorEmpNm: '王部長',
          before: null,
          after: { fromStage: 'approval', toStage: 'personnel_ratio', rejectReason: '比例分配不均，請重新調整' },
          at: '2026-05-10T14:22:00Z',
        },
      ],
    };
  }

  it('DRW-HIST-001 簽核歷史頁籤顯示階段事件人類可讀標題（送出簽核）+ 拒絕原因', async () => {
    mockedListLists.mockResolvedValue(
      buildResponse({
        lists: [makeItem({ listNo: 'OB202605050', stage: 'personnel_ratio' })],
        stageCounts: {
          draft: 0,
          dept_ratio: 0,
          personnel_ratio: 1,
          approval: 0,
          ready: 0,
          disabled: 0,
        },
      }),
    );
    const mockedGetFullSnapshot = vi.mocked(assignmentListApi.getFullSnapshot);
    mockedGetFullSnapshot.mockResolvedValue(snapshotWithHistory());

    renderPage();
    await waitFor(() => {
      expect(screen.getByTestId('btn-view-OB202605050')).toBeTruthy();
    });
    fireEvent.click(screen.getByTestId('btn-view-OB202605050'));
    await waitFor(() => {
      expect(screen.getByTestId('detail-drawer')).toBeTruthy();
    });

    fireEvent.click(screen.getByTestId('drawer-tab-history'));
    await waitFor(() => {
      const panel = screen.getByTestId('drawer-panel-history');
      // raw enum 不再裸露；改為人類可讀標題
      expect(panel.textContent).toContain('建立名單');
      expect(panel.textContent).toContain('送出簽核'); // STAGE_ADVANCE → approval
      expect(panel.textContent).toContain('簽核拒絕'); // STAGE_REJECT
      expect(panel.textContent).not.toContain('STAGE_REJECT');
    });
    const panel = screen.getByTestId('drawer-panel-history');
    // 事件說明內嵌行為人姓名（由 getFullSnapshot 解析 users.name）
    expect(panel.textContent).toContain('王部長');
    // 拒絕原因顯示於事件說明
    expect(panel.textContent).toMatch(/比例分配不均，請重新調整/);
    // 時間軸結構：每事件一個 history-item，時間格式 YYYY-MM-DD HH:mm
    expect(screen.getByTestId('history-item-0')).toBeTruthy();
    expect(panel.textContent).toMatch(/2026-05-\d{2} \d{2}:\d{2}/);
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

describe('F052 v2.1 — 「停用」全寫 label（TS-F052-TXT-001~003）', () => {
  it('TXT-001 Kanban draft 欄卡片「停用」按鈕文字為全寫', async () => {
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
      expect(screen.getByTestId('btn-disable-OB202605001')).toBeTruthy();
    });
    const btn = screen.getByTestId('btn-disable-OB202605001');
    expect(btn.textContent).toContain('停用');
    expect(screen.queryByRole('button', { name: /^停$/ })).toBeNull();
  });

  it('TXT-002 點擊「停用」→ 確認對話框含「停用」全寫，無「停」縮寫', async () => {
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
      expect(screen.getByTestId('btn-disable-OB202605001')).toBeTruthy();
    });
    fireEvent.click(screen.getByTestId('btn-disable-OB202605001'));
    await waitFor(() => {
      expect(screen.getByTestId('disable-confirm-modal')).toBeTruthy();
    });
    const modal = screen.getByTestId('disable-confirm-modal');
    expect(modal.textContent).toContain('停用');
    // 不應有單字「停」獨立按鈕
    expect(within(modal).queryByRole('button', { name: /^停$/ })).toBeNull();
    // 確認按鈕為「確認停用」全寫
    const confirmBtn = within(modal).getByTestId('btn-disable-confirm');
    expect(confirmBtn.textContent).toContain('停用');
  });

  it('TXT-003 確認停用 → API 200 → 卡片從草稿欄消失', async () => {
    const mockedDisableList = vi.mocked(assignmentListApi.disableList);
    mockedDisableList.mockResolvedValue({});
    let callCount = 0;
    mockedListLists.mockImplementation(async () => {
      callCount += 1;
      if (callCount === 1) {
        return buildResponse({
          lists: [makeItem({ listNo: 'OB202605001', stage: 'draft' })],
          stageCounts: {
            draft: 1,
            dept_ratio: 0,
            personnel_ratio: 0,
            approval: 0,
            ready: 0,
            disabled: 0,
          },
        });
      }
      // 停用後刷新：list 已不含 OB202605001
      return buildResponse({
        lists: [],
        stageCounts: {
          draft: 0,
          dept_ratio: 0,
          personnel_ratio: 0,
          approval: 0,
          ready: 0,
          disabled: 1,
        },
      });
    });

    renderPage();
    await waitFor(() => {
      expect(screen.getByTestId('kanban-card-OB202605001')).toBeTruthy();
    });
    fireEvent.click(screen.getByTestId('btn-disable-OB202605001'));
    await waitFor(() => {
      expect(screen.getByTestId('disable-confirm-modal')).toBeTruthy();
    });
    // 必須先勾選確認 checkbox 才能點「確認停用」
    fireEvent.click(screen.getByTestId('disable-confirm-checkbox'));
    fireEvent.click(screen.getByTestId('btn-disable-confirm'));
    await waitFor(() => {
      expect(screen.queryByTestId('kanban-card-OB202605001')).toBeNull();
    });
    expect(mockedDisableList).toHaveBeenCalledWith('OB202605001');
  });
});

describe('F050 v2.2 §7 BR-13 — Consumer：M01 主頁 sessionStorage Toast（TS-F050-SIG-004~007）', () => {
  it('SIG-004 mount 時讀取 cdmp.pendingToast → 顯示 toast → 立即 removeItem', async () => {
    window.sessionStorage.setItem(
      'cdmp.pendingToast',
      JSON.stringify({
        type: 'success',
        msg: '車貸名單 OB202605001 部門比例已儲存',
        sub: '已推進至個別比例設定階段',
      }),
    );
    mockedListLists.mockResolvedValue(buildResponse({ lists: [] }));
    renderPage();
    await waitFor(() => {
      // toast 內容應出現在頁面（ToastProvider container）
      expect(
        screen.getByText(/車貸名單 OB202605001 部門比例已儲存/),
      ).toBeTruthy();
    });
    expect(window.sessionStorage.getItem('cdmp.pendingToast')).toBeNull();
  });

  it('SIG-005 頁面重整後 toast 不重複顯示（consume-once）', async () => {
    window.sessionStorage.setItem(
      'cdmp.pendingToast',
      JSON.stringify({ type: 'success', msg: '已儲存', sub: '' }),
    );
    mockedListLists.mockResolvedValue(buildResponse({ lists: [] }));
    const { unmount } = renderPage();
    await waitFor(() => {
      expect(screen.getByText(/已儲存/)).toBeTruthy();
    });
    unmount();
    cleanup();
    // 第二次 render → 不應再顯示 toast
    renderPage();
    await waitFor(() => {
      expect(screen.getByTestId('kanban-board')).toBeTruthy();
    });
    expect(screen.queryByText(/已儲存/)).toBeNull();
  });

  it('SIG-006 cdmp.pendingToast 含無效 JSON → 靜默不顯示，不拋 exception', async () => {
    window.sessionStorage.setItem('cdmp.pendingToast', 'not-valid-json');
    mockedListLists.mockResolvedValue(buildResponse({ lists: [] }));
    renderPage();
    await waitFor(() => {
      expect(screen.getByTestId('kanban-board')).toBeTruthy();
    });
    // 無 toast 渲染（toast container 應該為空）
    const container = screen.queryByTestId('toast-container');
    if (container) {
      expect(container.children.length).toBe(0);
    }
    // BR-13 (4)：consume-once 仍清除殘留
    expect(window.sessionStorage.getItem('cdmp.pendingToast')).toBeNull();
  });

  it('SIG-007 cdmp.pendingToast key 不存在 → 靜默不執行任何動作', async () => {
    expect(window.sessionStorage.getItem('cdmp.pendingToast')).toBeNull();
    mockedListLists.mockResolvedValue(buildResponse({ lists: [] }));
    renderPage();
    await waitFor(() => {
      expect(screen.getByTestId('kanban-board')).toBeTruthy();
    });
    const container = screen.queryByTestId('toast-container');
    if (container) {
      expect(container.children.length).toBe(0);
    }
  });
});

describe('F081 / F085 / F089 v1.3 — Rollback toast + 卡片即時遷移（TS-F081/085/089-005~007）', () => {
  it('F081 dept_ratio Rollback 成功 → info toast「已退回草稿，部門比例已清空」+ 卡片從 dept_ratio 欄遷至 draft 欄', async () => {
    const mockedRollbackDraft = vi.mocked(assignmentStageApi.rollbackToDraft);
    mockedRollbackDraft.mockResolvedValue({ listNo: 'OB202605010', stage: 'draft' });
    let callCount = 0;
    mockedListLists.mockImplementation(async () => {
      callCount += 1;
      if (callCount === 1) {
        return buildResponse({
          lists: [makeItem({ listNo: 'OB202605010', stage: 'dept_ratio' })],
          stageCounts: {
            draft: 0,
            dept_ratio: 1,
            personnel_ratio: 0,
            approval: 0,
            ready: 0,
            disabled: 0,
          },
        });
      }
      // Rollback 後刷新：卡片到 draft 欄
      return buildResponse({
        lists: [makeItem({ listNo: 'OB202605010', stage: 'draft' })],
        stageCounts: {
          draft: 1,
          dept_ratio: 0,
          personnel_ratio: 0,
          approval: 0,
          ready: 0,
          disabled: 0,
        },
      });
    });

    renderPage();
    await waitFor(() => {
      const card = screen.getByTestId('kanban-card-OB202605010');
      expect(within(screen.getByTestId('kanban-column-dept_ratio')).getByTestId('kanban-card-OB202605010')).toBe(card);
    });
    fireEvent.click(screen.getByTestId('btn-rollback-OB202605010'));

    // 卡片遷移
    await waitFor(() => {
      expect(within(screen.getByTestId('kanban-column-draft')).getByTestId('kanban-card-OB202605010')).toBeTruthy();
    });
    expect(within(screen.getByTestId('kanban-column-dept_ratio')).queryByTestId('kanban-card-OB202605010')).toBeNull();

    // info toast
    await waitFor(() => {
      expect(screen.getByText(/已退回/)).toBeTruthy();
    });
    expect(mockedRollbackDraft).toHaveBeenCalledWith('OB202605010');
  });

  it('F085 personnel_ratio Rollback → 卡片從 personnel_ratio 欄遷至 dept_ratio 欄', async () => {
    const mockedRollbackDept = vi.mocked(assignmentStageApi.rollbackToDeptRatio);
    mockedRollbackDept.mockResolvedValue({ listNo: 'OB202605020', stage: 'dept_ratio' });
    let callCount = 0;
    mockedListLists.mockImplementation(async () => {
      callCount += 1;
      if (callCount === 1) {
        return buildResponse({
          lists: [makeItem({ listNo: 'OB202605020', stage: 'personnel_ratio' })],
          stageCounts: {
            draft: 0,
            dept_ratio: 0,
            personnel_ratio: 1,
            approval: 0,
            ready: 0,
            disabled: 0,
          },
        });
      }
      return buildResponse({
        lists: [makeItem({ listNo: 'OB202605020', stage: 'dept_ratio' })],
        stageCounts: {
          draft: 0,
          dept_ratio: 1,
          personnel_ratio: 0,
          approval: 0,
          ready: 0,
          disabled: 0,
        },
      });
    });

    renderPage();
    await waitFor(() => {
      expect(within(screen.getByTestId('kanban-column-personnel_ratio')).getByTestId('kanban-card-OB202605020')).toBeTruthy();
    });
    fireEvent.click(screen.getByTestId('btn-rollback-OB202605020'));

    await waitFor(() => {
      expect(within(screen.getByTestId('kanban-column-dept_ratio')).getByTestId('kanban-card-OB202605020')).toBeTruthy();
    });
    expect(mockedRollbackDept).toHaveBeenCalledWith('OB202605020');
  });

  it('F089 ready Rollback → 卡片從 ready 欄遷至 approval 欄；CTA Banner 因 ready=0 消失', async () => {
    const mockedRollbackApproval = vi.mocked(assignmentStageApi.rollbackToApproval);
    mockedRollbackApproval.mockResolvedValue({ listNo: 'OB202605030', stage: 'approval' });
    let callCount = 0;
    mockedListLists.mockImplementation(async () => {
      callCount += 1;
      if (callCount === 1) {
        return buildResponse({
          lists: [makeItem({ listNo: 'OB202605030', stage: 'ready' })],
          stageCounts: {
            draft: 0,
            dept_ratio: 0,
            personnel_ratio: 0,
            approval: 0,
            ready: 1,
            disabled: 0,
          },
        });
      }
      return buildResponse({
        lists: [makeItem({ listNo: 'OB202605030', stage: 'approval' })],
        stageCounts: {
          draft: 0,
          dept_ratio: 0,
          personnel_ratio: 0,
          approval: 1,
          ready: 0,
          disabled: 0,
        },
      });
    });

    renderPage();
    await waitFor(() => {
      expect(screen.getByTestId('ready-cta-banner')).toBeTruthy();
    });
    fireEvent.click(screen.getByTestId('btn-rollback-OB202605030'));

    await waitFor(() => {
      expect(within(screen.getByTestId('kanban-column-approval')).getByTestId('kanban-card-OB202605030')).toBeTruthy();
    });
    // CTA Banner 因 ready=0 消失
    expect(screen.queryByTestId('ready-cta-banner')).toBeNull();
    expect(mockedRollbackApproval).toHaveBeenCalledWith('OB202605030');
  });
});

describe('F086 / F087 — approval 卡片就地核准 / 拒絕（29c 審閱頁移除後）', () => {
  function approvalResponse() {
    return buildResponse({
      lists: [makeItem({ listNo: 'OB202605040', stage: 'approval' })],
      stageCounts: {
        draft: 0,
        dept_ratio: 0,
        personnel_ratio: 0,
        approval: 1,
        ready: 0,
        disabled: 0,
      },
    });
  }

  it('APV-001 點「核准」→ 開核准 confirm modal（不離開頁面，無導航）', async () => {
    mockedListLists.mockResolvedValue(approvalResponse());
    renderPage();
    await waitFor(() => {
      expect(screen.getByTestId('btn-approve-OB202605040')).toBeTruthy();
    });
    fireEvent.click(screen.getByTestId('btn-approve-OB202605040'));
    await waitFor(() => {
      expect(screen.getByTestId('confirm-approve-modal')).toBeTruthy();
    });
    // 仍停留在 Kanban（就地操作，非導航至審閱頁）
    expect(screen.getByTestId('kanban-board')).toBeTruthy();
  });

  it('APV-002 核准確認 → 呼叫 approveList + refetch → 卡片離開待簽核欄', async () => {
    mockedApproveList.mockResolvedValue({ listNo: 'OB202605040', stage: 'ready' });
    let callCount = 0;
    mockedListLists.mockImplementation(async () => {
      callCount += 1;
      if (callCount === 1) return approvalResponse();
      // 核准後 refetch：卡片到 ready 欄
      return buildResponse({
        lists: [makeItem({ listNo: 'OB202605040', stage: 'ready' })],
        stageCounts: {
          draft: 0,
          dept_ratio: 0,
          personnel_ratio: 0,
          approval: 0,
          ready: 1,
          disabled: 0,
        },
      });
    });

    renderPage();
    await waitFor(() => {
      expect(screen.getByTestId('btn-approve-OB202605040')).toBeTruthy();
    });
    fireEvent.click(screen.getByTestId('btn-approve-OB202605040'));
    await waitFor(() => {
      expect(screen.getByTestId('btn-confirm-approve')).toBeTruthy();
    });
    fireEvent.click(screen.getByTestId('btn-confirm-approve'));

    await waitFor(() => {
      expect(mockedApproveList).toHaveBeenCalledWith('OB202605040');
    });
    // refetch 後卡片遷至 ready 欄
    await waitFor(() => {
      expect(
        within(screen.getByTestId('kanban-column-ready')).getByTestId('kanban-card-OB202605040'),
      ).toBeTruthy();
    });
    expect(
      within(screen.getByTestId('kanban-column-approval')).queryByTestId('kanban-card-OB202605040'),
    ).toBeNull();
  });

  it('APV-003 點「拒絕」→ 開 reject modal 含快速 chip', async () => {
    mockedListLists.mockResolvedValue(approvalResponse());
    renderPage();
    await waitFor(() => {
      expect(screen.getByTestId('btn-reject-OB202605040')).toBeTruthy();
    });
    fireEvent.click(screen.getByTestId('btn-reject-OB202605040'));
    await waitFor(() => {
      expect(screen.getByTestId('reject-modal')).toBeTruthy();
    });
    expect(screen.getByTestId('reject-reason-chips')).toBeTruthy();
    // reason 為空 → 確認拒絕 disabled
    expect((screen.getByTestId('btn-confirm-reject') as HTMLButtonElement).disabled).toBe(true);
  });

  it('APV-004 填拒絕原因 → 確認 → 呼叫 rejectList(reason) + refetch', async () => {
    mockedRejectList.mockResolvedValue({
      listNo: 'OB202605040',
      stage: 'personnel_ratio',
    });
    let callCount = 0;
    mockedListLists.mockImplementation(async () => {
      callCount += 1;
      if (callCount === 1) return approvalResponse();
      return buildResponse({
        lists: [makeItem({ listNo: 'OB202605040', stage: 'personnel_ratio' })],
        stageCounts: {
          draft: 0,
          dept_ratio: 0,
          personnel_ratio: 1,
          approval: 0,
          ready: 0,
          disabled: 0,
        },
      });
    });

    renderPage();
    await waitFor(() => {
      expect(screen.getByTestId('btn-reject-OB202605040')).toBeTruthy();
    });
    fireEvent.click(screen.getByTestId('btn-reject-OB202605040'));
    await waitFor(() => {
      expect(screen.getByTestId('reject-modal')).toBeTruthy();
    });
    fireEvent.change(screen.getByTestId('reject-reason-textarea'), {
      target: { value: '比例分配不均，請重新調整' },
    });
    const confirmBtn = screen.getByTestId('btn-confirm-reject') as HTMLButtonElement;
    expect(confirmBtn.disabled).toBe(false);
    fireEvent.click(confirmBtn);

    await waitFor(() => {
      expect(mockedRejectList).toHaveBeenCalledWith('OB202605040', {
        rejectReason: '比例分配不均，請重新調整',
      });
    });
    // refetch 後卡片遷至 personnel_ratio 欄
    await waitFor(() => {
      expect(
        within(screen.getByTestId('kanban-column-personnel_ratio')).getByTestId(
          'kanban-card-OB202605040',
        ),
      ).toBeTruthy();
    });
  });

  it('APV-005 套用快速 chip → 填入 textarea', async () => {
    mockedListLists.mockResolvedValue(approvalResponse());
    renderPage();
    await waitFor(() => {
      expect(screen.getByTestId('btn-reject-OB202605040')).toBeTruthy();
    });
    fireEvent.click(screen.getByTestId('btn-reject-OB202605040'));
    await waitFor(() => {
      expect(screen.getByTestId('reject-modal')).toBeTruthy();
    });
    fireEvent.click(screen.getByText('比例分配不均'));
    const textarea = screen.getByTestId('reject-reason-textarea') as HTMLTextAreaElement;
    expect(textarea.value).toBe('比例分配不均，請參考 4 月慣例調整為均衡分配');
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

// ===========================================================================
// F097 fix — 「新增名單」導航帶分派作業月份（target_work_ym）
// ===========================================================================
describe('F097 fix — 新增名單導航帶作業月', () => {
  function LocationProbe() {
    const loc = useLocation();
    return <div data-testid="loc">{loc.pathname + loc.search}</div>;
  }

  it('點「新增名單」→ navigate 至 /assignment/list-definitions/new?ym=2026-06（下月）', async () => {
    mockedListLists.mockResolvedValue(buildResponse());
    render(
      <ToastProvider>
        <MemoryRouter initialEntries={['/assignment/list-definitions']}>
          <AssignmentWorkYmProvider>
            <ListDefinitionPage />
            <LocationProbe />
          </AssignmentWorkYmProvider>
        </MemoryRouter>
      </ToastProvider>,
    );

    await waitFor(() => expect(screen.getByTestId('btn-create')).toBeTruthy());
    fireEvent.click(screen.getByTestId('btn-create'));

    await waitFor(() =>
      expect(screen.getByTestId('loc').textContent).toBe(
        '/assignment/list-definitions/new?ym=2026-06',
      ),
    );
  });
});
