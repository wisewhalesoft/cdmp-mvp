import { render, screen, cleanup, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { ReadySummaryDetailPage } from '../ready-summary-detail-page';
import { ToastProvider } from '@/components/ui/toast';
import * as assignmentListApi from '@/api/assignment-list';
import * as assignmentStageApi from '@/api/assignment-stage';
import * as assignmentRunApi from '@/api/assignment-run';
import * as pooldataFieldsApi from '@/api/pooldata-fields';
import * as cardTypeApi from '@/api/card-type';
import * as authStore from '@/stores/auth-store';
import type { AssignmentListItem, ListListsResponse } from '@/api/assignment-list';
import { __resetConditionDecoderCache } from '../_hooks/use-condition-decoder';
import {
  DECODER_FIELDS,
  DECODER_CARD_TYPES,
  optionsResponseFor,
} from '../_hooks/__tests__/condition-decoder-fixtures';

/**
 * 29d 模式 B：單一 ready 名單詳情頁面測試
 *
 * 對應 prototype 29d-ready-summary.html L243-362
 */

vi.mock('@/api/assignment-list');
vi.mock('@/api/assignment-stage');
vi.mock('@/api/assignment-run');
vi.mock('@/api/auth', () => ({ logout: vi.fn().mockResolvedValue({}) }));
vi.mock('@/api/pooldata-fields', async () => {
  const actual = await vi.importActual<typeof pooldataFieldsApi>('@/api/pooldata-fields');
  return { ...actual, listFields: vi.fn(), listOptions: vi.fn() };
});
vi.mock('@/api/card-type', async () => {
  const actual = await vi.importActual<typeof cardTypeApi>('@/api/card-type');
  return { ...actual, listCardTypes: vi.fn() };
});
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
const mockedGetDeptRatios = vi.mocked(assignmentStageApi.getDeptRatios);
const mockedGetPersonnelRatios = vi.mocked(assignmentStageApi.getPersonnelRatios);
const mockedGetApprovalHistory = vi.mocked(assignmentStageApi.getApprovalHistory);
const mockedRollbackApproval = vi.mocked(assignmentStageApi.rollbackToApproval);
const mockedGetListEstimate = vi.mocked(assignmentRunApi.getListEstimate);
const mockedGetUser = vi.mocked(authStore.getUser);
const mockedGetBusinessRole = vi.mocked(authStore.getBusinessRole);
const mockedListFields = vi.mocked(pooldataFieldsApi.listFields);
const mockedListOptions = vi.mocked(pooldataFieldsApi.listOptions);
const mockedListCardTypes = vi.mocked(cardTypeApi.listCardTypes);

const list: AssignmentListItem = {
  listNo: 'OB202605002',
  listNm: '2026-05 業務二部 主力催收',
  prodKind: 'A1',
  caseYear: '2',
  specTp: '01',
  listPeriodStart: 0,
  listPeriodEnd: 999,
  listInterval: 30,
  settleSrc: 'N',
  cardType: 'M3',
  prodBest: null,
  status: 'active',
  stage: 'ready',
  createdBy: '張部長',
  createdAt: '2026-05-14T18:05:00.000Z',
  updatedAt: '2026-05-14T18:05:00.000Z',
};

const mockListsResp: ListListsResponse = {
  selectedYm: '202605',
  currentWorkYm: '202605',
  isHistorical: false,
  isFuture: false,
  lockState: { locked: false, reason: null },
  lists: [list],
  stageCounts: {
    draft: 0,
    dept_ratio: 0,
    personnel_ratio: 0,
    approval: 0,
    ready: 1,
    disabled: 0,
  },
};

function renderPage(listNo = 'OB202605002') {
  return render(
    <MemoryRouter initialEntries={[`/assignment/ready-summary/${listNo}`]}>
      <ToastProvider>
        <Routes>
          <Route
            path="/assignment/ready-summary/:listNo"
            element={<ReadySummaryDetailPage />}
          />
        </Routes>
      </ToastProvider>
    </MemoryRouter>,
  );
}

describe('ReadySummaryDetailPage (29d 模式 B)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    __resetConditionDecoderCache();
    mockedListFields.mockResolvedValue(DECODER_FIELDS);
    mockedListOptions.mockImplementation(async (col: string) => optionsResponseFor(col));
    mockedListCardTypes.mockResolvedValue(DECODER_CARD_TYPES);
    mockedGetUser.mockReturnValue({
      id: 'd1',
      name: 'Director',
      email: 'd@test',
      role: 'user',
      businessRole: 'director',
      status: 'active',
    } as any);
    mockedGetBusinessRole.mockReturnValue('director');
    mockedListLists.mockResolvedValue(mockListsResp);
    mockedGetDeptRatios.mockResolvedValue({
      listNo: 'OB202605002',
      listNm: '測試名單',
      projectWorkym: '202605',
      stage: 'ready',
      deptRatios: [
        { obdeptId: 'D01', obdeptNm: '北一處', ration: 60, isActive: true, directorName: '李處長', setByName: '張部長', proxyByDirector: true },
        { obdeptId: 'D02', obdeptNm: '南一處', ration: 40, isActive: true, directorName: null, setByName: '李處長', proxyByDirector: false },
      ],
      total: 100,
      isReadOnly: true,
    });
    mockedGetPersonnelRatios.mockResolvedValue({
      listNo: 'OB202605002',
      listNm: '測試名單',
      projectWorkym: '202605',
      stage: 'ready',
      isReadOnly: true,
      viewerRole: 'director',
      departments: [
        {
          deptCode: 'D01',
          deptName: '北一處',
          deptRatio: 60,
          directorName: '李處長',
          isInScope: true,
          activeCount: 2,
          sumValidated: true,
          allResigned: false,
          deptSum: 100,
          employees: [
            { empId: 'E1', empName: '王小明', ration: 60, isResigned: false, createdBy: null },
            { empId: 'E2', empName: '林小美', ration: 40, isResigned: false, createdBy: null },
          ],
        },
        {
          deptCode: 'D02',
          deptName: '南一處',
          deptRatio: 40,
          directorName: null,
          isInScope: true,
          activeCount: 1,
          sumValidated: true,
          allResigned: false,
          deptSum: 100,
          employees: [
            { empId: 'E3', empName: '張大華', ration: 100, isResigned: false, createdBy: null },
            { empId: 'E9', empName: '潘秀英', ration: null, isResigned: true, createdBy: null },
          ],
        },
      ],
      latestRejection: null,
    });
    mockedGetListEstimate.mockResolvedValue({
      listNo: 'OB202605002',
      count: 12400,
    });
    mockedGetApprovalHistory.mockResolvedValue({
      listNo: 'OB202605002',
      history: [
        {
          approvalId: 'a1',
          action: 'approve',
          rejectReason: null,
          approverId: 'dir-001',
          approverName: '張部長',
          approverRole: 'director',
          approvedAt: '2026-05-14T18:05:00Z',
        },
      ],
    });
  });

  afterEach(() => {
    cleanup();
  });

  it('載入時顯示名單標題卡（listNo / listNm / 最終核准資訊）', async () => {
    renderPage();
    await waitFor(() => {
      const matches = screen.getAllByText(/OB202605002/);
      expect(matches.length).toBeGreaterThan(0);
    });
    expect(screen.getAllByText(/2026-05 業務二部 主力催收/).length).toBeGreaterThan(0);
  });

  it('顯示部門比例唯讀表', async () => {
    renderPage();
    await waitFor(() => {
      expect(screen.getByTestId('detail-dept-ratio-table')).toBeInTheDocument();
    });
  });

  it('顯示個別比例 accordion', async () => {
    renderPage();
    await waitFor(() => {
      expect(screen.getByTestId('dept-accordion-header-D01')).toBeInTheDocument();
    });
  });

  it('以 excludeZeroRatio 載入部門比例（隱藏 0% 部門，含個別比例區塊由 depts 驅動）', async () => {
    renderPage();
    await waitFor(() => {
      expect(mockedGetDeptRatios).toHaveBeenCalledWith('OB202605002', {
        excludeZeroRatio: true,
      });
    });
  });

  it('顯示簽核歷史（含 approve 紀錄）', async () => {
    renderPage();
    await waitFor(() => {
      expect(screen.getByTestId('approval-history-item-a1')).toBeInTheDocument();
    });
  });

  it('director 顯示「退回簽核」按鈕', async () => {
    renderPage();
    await waitFor(() => {
      expect(screen.getByTestId('btn-rollback-approval')).toBeInTheDocument();
    });
  });

  it('director 顯示「執行月名單分派」按鈕', async () => {
    renderPage();
    await waitFor(() => {
      expect(screen.getByTestId('btn-run-month')).toBeInTheDocument();
    });
  });

  it('section_chief 不顯示「退回簽核」按鈕（director only F089）', async () => {
    mockedGetBusinessRole.mockReturnValue('section_chief');
    renderPage();
    await waitFor(() => {
      expect(screen.getAllByText(/2026-05 業務二部 主力催收/).length).toBeGreaterThan(0);
    });
    expect(screen.queryByTestId('btn-rollback-approval')).not.toBeInTheDocument();
  });

  it('「退回簽核」按鈕觸發 rollbackToApproval API', async () => {
    mockedRollbackApproval.mockResolvedValue({
      listNo: 'OB202605002',
      stage: 'approval',
    });
    renderPage();
    await waitFor(() => {
      expect(screen.getByTestId('btn-rollback-approval')).toBeInTheDocument();
    });
    fireEvent.click(screen.getByTestId('btn-rollback-approval'));
    await waitFor(() => {
      expect(screen.getByTestId('confirm-rollback-modal')).toBeInTheDocument();
    });
    fireEvent.click(screen.getByTestId('btn-confirm-rollback'));
    await waitFor(() => {
      expect(mockedRollbackApproval).toHaveBeenCalledWith('OB202605002');
    });
  });

  it('顯示 stat cards（部門數 / 業務員數 / 簽核紀錄數）', async () => {
    renderPage();
    await waitFor(() => {
      expect(screen.getByTestId('detail-stat-dept-count')).toBeInTheDocument();
    });
    const deptCount = screen.getByTestId('detail-stat-dept-count');
    expect(deptCount.textContent).toContain('2');
  });

  it('名單階段不是 ready 時顯示警告', async () => {
    mockedListLists.mockResolvedValue({
      ...mockListsResp,
      lists: [{ ...list, stage: 'approval' }],
    });
    renderPage();
    await waitFor(() => {
      expect(screen.getByTestId('stage-mismatch-warning')).toBeInTheDocument();
    });
  });

  it('listNo 不存在 → 顯示找不到名單錯誤', async () => {
    mockedListLists.mockResolvedValue({
      ...mockListsResp,
      lists: [],
    });
    renderPage();
    await waitFor(() => {
      expect(screen.getByTestId('list-not-found')).toBeInTheDocument();
    });
  });

  // F097 fix：名單 project_workym 可能為未來月（作業月＝下月）。listNo 內嵌 YYYYMM，
  // 頁面須以此查詢對應月份，否則 listLists 預設當月找不到下月名單 → 誤報「找不到」。
  it('F097: 未來月名單 OB202606001 → listLists 以 ym=202606 查詢並成功載入', async () => {
    const futureList = {
      ...list,
      listNo: 'OB202606001',
      listNm: '2026-06 業務二部 主力催收',
    };
    mockedListLists.mockResolvedValue({
      ...mockListsResp,
      selectedYm: '202606',
      isFuture: true,
      lists: [futureList],
    });
    renderPage('OB202606001');
    await waitFor(() => {
      expect(screen.getAllByText(/2026-06 業務二部 主力催收/).length).toBeGreaterThan(0);
    });
    expect(mockedListLists).toHaveBeenCalledWith({ ym: '202606' });
    expect(screen.queryByTestId('list-not-found')).not.toBeInTheDocument();
  });

  it('篩選條件 chip 解碼欄位名稱與值（含 card_type 走 listCardTypes；未知碼 raw fallback）', async () => {
    renderPage();
    await waitFor(() => {
      expect(screen.getByTestId('list-summary-card')).toBeInTheDocument();
    });
    // spec_tp 01→本牌/新車；settle_src N→不含他行代償；caseyear 2→2 年
    await waitFor(() => {
      const card = screen.getByTestId('list-summary-card');
      expect(card.textContent).toContain('專案類別：本牌/新車');
      expect(card.textContent).toContain('不含他行代償');
      expect(card.textContent).toContain('2 年');
      // card_type M3 → listCardTypes 之 cardName「滿期卡」，欄位名「卡別」
      expect(card.textContent).toContain('卡別：滿期卡');
    });
    const card = screen.getByTestId('list-summary-card');
    // prod_kind 'A1' 非白名單可選值 → raw fallback（顯示原碼），且不再裸露開發者 SQL 字串
    expect(card.textContent).toContain('產品類別：A1');
    expect(card.textContent).not.toContain('PROD_KIND');
    expect(card.textContent).not.toContain('SETTLE_SRC');
  });

  it('麵包屑：含「名單定義」根節點與「準備完成摘要 — 詳情」leaf + listNo', async () => {
    renderPage();
    await waitFor(() => {
      expect(screen.getByTestId('ready-detail-breadcrumb')).toBeInTheDocument();
    });
    const bc = screen.getByTestId('ready-detail-breadcrumb');
    expect(bc.textContent).toContain('名單定義');
    expect(bc.textContent).toContain('準備完成摘要');
    expect(bc.textContent).toContain('OB202605002');
  });

  it('顯示 5-step 階段路徑（StageBreadcrumb，current=ready）', async () => {
    renderPage();
    await waitFor(() => {
      expect(screen.getByTestId('stage-breadcrumb')).toBeInTheDocument();
    });
    expect(screen.getByTestId('stage-step-5-current')).toBeInTheDocument();
  });

  it('stat：預估案件數來自 getListEstimate（~12,400）', async () => {
    renderPage();
    await waitFor(() => {
      expect(screen.getByTestId('detail-stat-estimate')).toBeInTheDocument();
    });
    await waitFor(() => {
      expect(
        screen.getByTestId('detail-stat-estimate').textContent,
      ).toContain('12,400');
    });
  });

  it('stat：在職業務員排除離職並顯示「X 位離職不計」', async () => {
    renderPage();
    await waitFor(() => {
      expect(screen.getByTestId('detail-stat-emp-count')).toBeInTheDocument();
    });
    const stat = screen.getByTestId('detail-stat-emp-count');
    // 在職 3（D01:2 + D02:1）、離職 1（潘秀英）
    expect(stat.textContent).toContain('3');
    expect(stat.textContent).toContain('1 位離職不計');
  });

  it('stat：簽核紀錄顯示 核准 · 拒絕 拆分', async () => {
    renderPage();
    await waitFor(() => {
      expect(
        screen.getByTestId('detail-stat-history-count'),
      ).toBeInTheDocument();
    });
    expect(
      screen.getByTestId('detail-stat-history-count').textContent,
    ).toContain('1 核准 · 0 拒絕');
  });

  it('部門比例表含「處長」欄（李處長）', async () => {
    renderPage();
    await waitFor(() => {
      expect(screen.getByTestId('detail-dept-ratio-table')).toBeInTheDocument();
    });
    const table = screen.getByTestId('detail-dept-ratio-table');
    expect(table.textContent).toContain('處長');
    expect(table.textContent).toContain('李處長');
  });

  it('部門比例表含「設定者」欄：proxyByDirector → 部長代設定；否則 由 X 設定', async () => {
    renderPage();
    await waitFor(() => {
      expect(screen.getByTestId('detail-dept-ratio-table')).toBeInTheDocument();
    });
    const table = screen.getByTestId('detail-dept-ratio-table');
    expect(table.textContent).toContain('設定者');
    // D01 proxyByDirector=true → 部長代設定
    expect(table.textContent).toContain('部長代設定');
    // D02 proxyByDirector=false + setByName=李處長 → 由 李處長 設定
    expect(table.textContent).toContain('由 李處長 設定');
  });

  it('個別比例展開後：員工表含「名單分配占比」欄與離職 badge', async () => {
    renderPage();
    await waitFor(() => {
      expect(screen.getByTestId('dept-accordion-header-D01')).toBeInTheDocument();
    });
    // D01 預設摺疊 → 展開
    fireEvent.click(screen.getByTestId('dept-accordion-header-D01'));
    await waitFor(() => {
      // D01 deptRatio=60 × E1 ration=60% ⇒ 名單分配占比 36.00%
      expect(screen.getByText('名單分配占比')).toBeInTheDocument();
    });
    expect(screen.getByText('36.00%')).toBeInTheDocument();

    // D02 含離職員工（潘秀英）→ 展開後顯示「離職」badge
    fireEvent.click(screen.getByTestId('dept-accordion-header-D02'));
    await waitFor(() => {
      expect(screen.getByText('潘秀英')).toBeInTheDocument();
    });
    expect(screen.getAllByText('離職').length).toBeGreaterThan(0);
  });
});
