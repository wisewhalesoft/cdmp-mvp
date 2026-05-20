import { render, screen, cleanup, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { ListEditDraftPage } from '../list-edit-draft-page';
import { ToastProvider } from '@/components/ui/toast';
import * as assignmentListApi from '@/api/assignment-list';
import * as pooldataFieldsApi from '@/api/pooldata-fields';
import * as authStore from '@/stores/auth-store';
import type { AssignmentListItem, ListListsResponse } from '@/api/assignment-list';
import type {
  ListFieldsResponse,
  ListOptionsResponse,
} from '@/api/pooldata-fields';

vi.mock('@/api/assignment-list');
vi.mock('@/api/pooldata-fields');
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

const mockedListLists = vi.mocked(assignmentListApi.listLists);
const mockedUpdateList = vi.mocked(assignmentListApi.updateList);
const mockedListFields = vi.mocked(pooldataFieldsApi.listFields);
const mockedListOptions = vi.mocked(pooldataFieldsApi.listOptions);
const mockedGetUser = vi.mocked(authStore.getUser);
const mockedGetBusinessRole = vi.mocked(authStore.getBusinessRole);
const mockedGetEffectiveIdentity = vi.mocked(authStore.getEffectiveIdentity);

const fieldsFixture: ListFieldsResponse = {
  fields: [
    { columnName: 'prod_kind', displayName: '產品類別', fieldType: 'categorical', isActive: true, createdAt: '', updatedAt: '' },
    { columnName: 'caseyear', displayName: '進件 / 滿期年數', fieldType: 'categorical', isActive: true, createdAt: '', updatedAt: '' },
    { columnName: 'case_status', displayName: '案件結清期別', fieldType: 'categorical', isActive: true, createdAt: '', updatedAt: '' },
    { columnName: 'month_cnt', displayName: '撈取月份計數', fieldType: 'numeric', isActive: true, createdAt: '', updatedAt: '' },
  ],
};
const prodKindOptionsFixture: ListOptionsResponse = {
  options: [
    { columnName: 'prod_kind', optionValue: '01', optionLabel: '汽車新車', isActive: false, createdAt: '', updatedAt: '' },
    { columnName: 'prod_kind', optionValue: '02', optionLabel: '機車', isActive: true, createdAt: '', updatedAt: '' },
    { columnName: 'prod_kind', optionValue: '03', optionLabel: '其他商品', isActive: true, createdAt: '', updatedAt: '' },
  ],
};

// Scenario ①: draft + 新名單（含 conditionPayload）
const scenario1List: AssignmentListItem = {
  listNo: 'OB202605001',
  listNm: '2026-05 業務一部 主力催收',
  prodKind: null,
  caseYear: null,
  specTp: null,
  caseStatus: null,
  crEnabled: true,
  listPeriodStart: 1,
  listPeriodEnd: 6,
  listInterval: 1,
  settleSrc: null,
  cardType: '01',
  prodBest: null,
  status: 'active',
  stage: 'draft',
  createdBy: '王部長',
  createdAt: '2026-05-02T00:00:00Z',
  updatedAt: '2026-05-02T00:00:00Z',
  conditionPayload: {
    conditions: [
      { columnName: 'caseyear', fieldType: 'categorical', values: ['1', '2'] },
    ],
    logic: 'AND',
  },
};

// Scenario ③: draft + LEGACY (conditionPayload IS NULL，含 5 個 entity column fallback)
const scenario3List: AssignmentListItem = {
  listNo: 'OB202604099',
  listNm: '2026-04 舊格式遷移名單',
  prodKind: '01$$02',
  caseYear: '1$$2$$3',
  specTp: '02$$04',
  caseStatus: '01$$02',
  crEnabled: true,
  listPeriodStart: 2,
  listPeriodEnd: 4,
  listInterval: 1,
  settleSrc: 'Y',
  cardType: '01',
  prodBest: null,
  status: 'active',
  stage: 'draft',
  createdBy: '李處長',
  createdAt: '2026-04-15T00:00:00Z',
  updatedAt: '2026-04-15T00:00:00Z',
  conditionPayload: null,
};

// Scenario ④: stage='dept_ratio'（已推進，無法編輯）
const scenario4List: AssignmentListItem = {
  ...scenario1List,
  listNo: 'OB202605003',
  listNm: '2026-05 業務三部 信貸催收',
  stage: 'dept_ratio',
};

function makeResp(lists: AssignmentListItem[]): ListListsResponse {
  return {
    selectedYm: '202605',
    currentWorkYm: '202605',
    isHistorical: false,
    isFuture: false,
    lockState: { locked: false, reason: null },
    lists,
    stageCounts: {
      draft: lists.filter((l) => l.stage === 'draft').length,
      dept_ratio: lists.filter((l) => l.stage === 'dept_ratio').length,
      personnel_ratio: 0,
      approval: 0,
      ready: 0,
      disabled: 0,
    },
  };
}

function setupDefaultMocks() {
  mockedListFields.mockResolvedValue(fieldsFixture);
  mockedListOptions.mockImplementation(async (col: string) => {
    if (col === 'prod_kind') return prodKindOptionsFixture;
    return { options: [] };
  });
}

function renderPage(listNo: string) {
  return render(
    <MemoryRouter initialEntries={[`/assignment/list-definitions/${listNo}/edit`]}>
      <ToastProvider>
        <Routes>
          <Route
            path="/assignment/list-definitions/:listNo/edit"
            element={<ListEditDraftPage />}
          />
        </Routes>
      </ToastProvider>
    </MemoryRouter>,
  );
}

describe('ListEditDraftPage v2.1 (Phase 5d 波 9)', () => {
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
    setupDefaultMocks();
  });

  afterEach(() => cleanup());

  // ─────────────────────────────────────────
  // le.test#1 — 場景①（draft + 新名單，有 conditionPayload）→ 條件 builder 可編輯
  // ─────────────────────────────────────────
  it('le.test#1: 場景① draft + 新名單 → 條件 builder 可編輯（btn-add-condition 存在且 not disabled）', async () => {
    mockedListLists.mockResolvedValue(makeResp([scenario1List]));
    renderPage('OB202605001');
    await waitFor(() => expect(screen.getByTestId('input-listNm')).toHaveValue('2026-05 業務一部 主力催收'));
    const addBtn = screen.getByTestId('btn-add-condition');
    expect(addBtn).toBeInTheDocument();
    expect(addBtn).not.toBeDisabled();
    // 條件已預填 1 個
    expect(screen.getByTestId('condition-row-0')).toBeInTheDocument();
  });

  // ─────────────────────────────────────────
  // le.test#2 — 場景③（draft + LEGACY, conditionPayload IS NULL）→ 唯讀摘要 + LegacyBanner
  // ─────────────────────────────────────────
  it('le.test#2: 場景③ LEGACY (conditionPayload IS NULL) → 顯示 LEGACY banner 與唯讀條件摘要', async () => {
    mockedListLists.mockResolvedValue(makeResp([scenario3List]));
    renderPage('OB202604099');
    await waitFor(() => expect(screen.getByTestId('input-listNm')).toHaveValue('2026-04 舊格式遷移名單'));
    expect(screen.getByTestId('legacy-condition-banner')).toBeInTheDocument();
    // 唯讀摘要應顯示舊 5 欄
    const readonly = screen.getByTestId('readonly-condition-summary');
    expect(readonly).toBeInTheDocument();
    expect(readonly.textContent).toContain('prod_kind');
    expect(readonly.textContent).toContain('01');
    expect(readonly.textContent).toContain('02');
  });

  // ─────────────────────────────────────────
  // le.test#3 — 場景③「新增條件」button 不存在 / disabled
  // ─────────────────────────────────────────
  it('le.test#3: 場景③ LEGACY → 「新增條件」button 不存在或 disabled', async () => {
    mockedListLists.mockResolvedValue(makeResp([scenario3List]));
    renderPage('OB202604099');
    await waitFor(() => expect(screen.getByTestId('legacy-condition-banner')).toBeInTheDocument());
    const addBtn = screen.queryByTestId('btn-add-condition');
    // 接受兩種策略：(a) 不渲染 (b) 渲染但 disabled
    if (addBtn) {
      expect(addBtn).toBeDisabled();
    } else {
      expect(addBtn).toBeNull();
    }
  });

  // ─────────────────────────────────────────
  // le.test#4 — LEGACY banner 文字含「此名單使用舊格式儲存，篩選條件暫時無法編輯」+ 完整尾巴
  //   對齊 prototype 27b L298-300
  // ─────────────────────────────────────────
  it('le.test#4: LEGACY banner 文字含 prototype 27b 完整文案', async () => {
    mockedListLists.mockResolvedValue(makeResp([scenario3List]));
    renderPage('OB202604099');
    await waitFor(() => expect(screen.getByTestId('legacy-condition-banner')).toBeInTheDocument());
    const banner = screen.getByTestId('legacy-condition-banner');
    expect(banner.textContent).toContain('此名單使用舊格式儲存，篩選條件暫時無法編輯');
    expect(banner.textContent).toContain('系統將於 Phase 3a 完成資料轉換');
  });

  // ─────────────────────────────────────────
  // le.test#5 — 場景①（新名單）不顯示 LEGACY 標籤
  // ─────────────────────────────────────────
  it('le.test#5: 場景① 新名單不顯示 LEGACY banner', async () => {
    mockedListLists.mockResolvedValue(makeResp([scenario1List]));
    renderPage('OB202605001');
    await waitFor(() => expect(screen.getByTestId('input-listNm')).toHaveValue('2026-05 業務一部 主力催收'));
    expect(screen.queryByTestId('legacy-condition-banner')).toBeNull();
    expect(screen.queryByTestId('legacy-tag')).toBeNull();
  });

  // ─────────────────────────────────────────
  // le.test#6 — 場景④（stage='dept_ratio'）→ 「無法編輯」banner，form hidden
  // ─────────────────────────────────────────
  it('le.test#6: 場景④ stage=dept_ratio → 顯示「無法編輯」banner，主表單隱藏', async () => {
    mockedListLists.mockResolvedValue(makeResp([scenario4List]));
    renderPage('OB202605003');
    await waitFor(() => expect(screen.getByTestId('not-draft-banner')).toBeInTheDocument());
    // 主表單 input 不應渲染
    expect(screen.queryByTestId('input-listNm')).toBeNull();
    // banner 提到階段
    const banner = screen.getByTestId('not-draft-banner');
    expect(banner.textContent).toContain('無法編輯');
  });

  // ─────────────────────────────────────────
  // le.test#7 — LEGACY 仍可編輯 list_nm / list_period_* / cr_enabled（非篩選欄位）
  //   送出時 body 不含 conditionPayload
  // ─────────────────────────────────────────
  it('le.test#7: LEGACY 仍可儲存（送出時 body 不含 conditionPayload）', async () => {
    mockedListLists.mockResolvedValue(makeResp([scenario3List]));
    mockedUpdateList.mockResolvedValue({} as never);
    renderPage('OB202604099');
    await waitFor(() => expect(screen.getByTestId('input-listNm')).toBeInTheDocument());

    fireEvent.change(screen.getByTestId('input-listNm'), { target: { value: '已改名的舊名單' } });
    fireEvent.click(screen.getByTestId('btn-save'));

    await waitFor(() => expect(mockedUpdateList).toHaveBeenCalledTimes(1));
    const [listNo, dto] = mockedUpdateList.mock.calls[0];
    expect(listNo).toBe('OB202604099');
    const body = dto as Record<string, unknown>;
    expect(body.listNm).toBe('已改名的舊名單');
    expect(body.conditionPayload).toBeUndefined();
  });
});
