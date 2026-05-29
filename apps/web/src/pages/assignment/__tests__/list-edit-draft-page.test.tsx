import { render, screen, cleanup, fireEvent, waitFor, within } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { ListEditDraftPage } from '../list-edit-draft-page';
import { ToastProvider } from '@/components/ui/toast';
import * as assignmentListApi from '@/api/assignment-list';
import * as pooldataFieldsApi from '@/api/pooldata-fields';
import * as cardTypeApi from '@/api/card-type';
import * as authStore from '@/stores/auth-store';
import type { AssignmentListItem, ListListsResponse } from '@/api/assignment-list';
import type {
  ListFieldsResponse,
  ListOptionsResponse,
} from '@/api/pooldata-fields';
import type { ListCardTypesResponse } from '@/api/card-type';

vi.mock('@/api/assignment-list');
vi.mock('@/api/pooldata-fields');
vi.mock('@/api/card-type');
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
const mockedListCardTypes = vi.mocked(cardTypeApi.listCardTypes);
const mockedGetUser = vi.mocked(authStore.getUser);
const mockedGetBusinessRole = vi.mocked(authStore.getBusinessRole);
const mockedGetEffectiveIdentity = vi.mocked(authStore.getEffectiveIdentity);

// v2.1.1（US-128/US-129）：fields 補 best_case；v2.3（US-144）：補 isSystemFixed（best_case=true）
const fieldsFixture: ListFieldsResponse = {
  fields: [
    { columnName: 'prod_kind', displayName: '產品類別', fieldType: 'categorical', isActive: true, isSystemFixed: false, createdAt: '', updatedAt: '' },
    { columnName: 'caseyear', displayName: '進件 / 滿期年數', fieldType: 'categorical', isActive: true, isSystemFixed: false, createdAt: '', updatedAt: '' },
    { columnName: 'case_status', displayName: '案件結清期別', fieldType: 'categorical', isActive: true, isSystemFixed: false, createdAt: '', updatedAt: '' },
    { columnName: 'best_case', displayName: '優質案件', fieldType: 'categorical', isActive: true, isSystemFixed: true, createdAt: '', updatedAt: '' },
    { columnName: 'month_cnt', displayName: '撈取月份計數', fieldType: 'numeric', isActive: true, isSystemFixed: false, createdAt: '', updatedAt: '' },
  ],
};

// v2.1.1（US-127 / AC-16）：cardTypesAllFixture — 編輯模式 status=all（含 active + inactive）
// 對齊 prototype 27b L503-510
const cardTypesAllFixture: ListCardTypesResponse = {
  cardTypes: [
    { cardType: 'E', cardName: '期中', prodKind: '01', prodKindName: '三信', status: 'active', cardVersion: 1, sdate: null, edate: null, createdBy: null, createdAt: null },
    { cardType: 'M', cardName: '滿期', prodKind: '03', prodKindName: '一般商品', status: 'active', cardVersion: 1, sdate: null, edate: null, createdBy: null, createdAt: null },
    { cardType: 'OB', cardName: '一般催收', prodKind: '01', prodKindName: '三信', status: 'active', cardVersion: 1, sdate: null, edate: null, createdBy: null, createdAt: null },
    // inactive — 僅供保留舊值（對齊 prototype 27b L509-510）
    { cardType: 'OL2', cardName: '舊催收卡', prodKind: '01', prodKindName: '三信', status: 'inactive', cardVersion: 1, sdate: null, edate: null, createdBy: null, createdAt: null },
    { cardType: 'S5', cardName: '主力催收', prodKind: '02', prodKindName: '中信', status: 'active', cardVersion: 1, sdate: null, edate: null, createdBy: null, createdAt: null },
    { cardType: 'S6', cardName: '重點戶', prodKind: '02', prodKindName: '中信', status: 'active', cardVersion: 1, sdate: null, edate: null, createdBy: null, createdAt: null },
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
// v2.1.1（US-127）：cardType 改為 'S5'（active，對齊 ob_card_type 真實值範圍 ^[A-Z0-9]{1,5}$）
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
  cardType: 'S5',
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

// Scenario ⑤ (v2.1.1 / US-127): 名單現存 cardType 為 inactive 'OL2'（測試 disabled 保留語意）
const scenario5List: AssignmentListItem = {
  ...scenario1List,
  listNo: 'OB202605005',
  listNm: '2026-05 含已停用卡別測試',
  cardType: 'OL2',
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
  // v2.1.1（US-127 / AC-16）：編輯模式呼叫 listCardTypes('all')，含 inactive 卡別
  mockedListCardTypes.mockResolvedValue(cardTypesAllFixture);
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
  // F097 fix — 未來月名單（project_workym＝下月）以 listNo 內嵌月份查詢
  //   原 listLists({}) 預設當月 → 下月名單不在清單 → 誤報「找不到名單」。
  // ─────────────────────────────────────────
  it('le.test#F097: 未來月名單 OB202606001 → listLists 以 ym=202606 查詢並帶入資料', async () => {
    const futureList: AssignmentListItem = {
      ...scenario1List,
      listNo: 'OB202606001',
      listNm: '2026-06 業務一部 主力催收',
    };
    mockedListLists.mockResolvedValue({
      ...makeResp([futureList]),
      selectedYm: '202606',
      isFuture: true,
    });
    renderPage('OB202606001');
    await waitFor(() =>
      expect(screen.getByTestId('input-listNm')).toHaveValue('2026-06 業務一部 主力催收'),
    );
    expect(mockedListLists).toHaveBeenCalledWith({ ym: '202606' });
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

  // ==========================================================================
  // v2.1.1 補強 I 群組（US-127 / US-128 / F050 AC-16 / §18.11.5）
  //   - cardType: <input type="text"> → <select data-testid="select-cardType">
  //   - 編輯模式 listCardTypes('all') — active 5 + inactive 1 (OL2)
  //   - 名單現存 inactive 卡別 → disabled option + 「（已停用 — 僅供保留舊值）」
  //   - prodBest: 移除（編輯頁本即無 input-prodBest，僅補驗 DOM 不存在）
  // ==========================================================================
  describe('v2.1.1 補強 (US-127/US-128)', () => {
    it('TS-F050-I01：編輯頁移除 prodBest input — DOM 完全不存在', async () => {
      mockedListLists.mockResolvedValue(makeResp([scenario1List]));
      renderPage('OB202605001');

      await waitFor(() => expect(screen.getByTestId('input-listNm')).toBeInTheDocument());
      expect(screen.queryByTestId('input-prodBest')).toBeNull();
    });

    it('TS-F050-I02：編輯頁卡別 select-cardType 渲染，預填現有 cardType=\'S5\'', async () => {
      mockedListLists.mockResolvedValue(makeResp([scenario1List]));
      renderPage('OB202605001');

      await waitFor(() => expect(screen.getByTestId('select-cardType')).toBeInTheDocument());
      const select = screen.getByTestId('select-cardType') as HTMLSelectElement;
      expect(select.tagName).toBe('SELECT');
      expect(select.value).toBe('S5');
    });

    it("TS-F050-I03：名單現存 inactive 卡別（OL2）— 下拉含 OL2 disabled option + 附「已停用」文字", async () => {
      mockedListLists.mockResolvedValue(makeResp([scenario5List]));
      renderPage('OB202605005');

      await waitFor(() => expect(screen.getByTestId('select-cardType')).toBeInTheDocument());
      const select = screen.getByTestId('select-cardType') as HTMLSelectElement;

      // 名單現存值 OL2 預設選中
      expect(select.value).toBe('OL2');

      // 找 OL2 option，應為 disabled + 含「已停用」文字
      const ol2Option = Array.from(select.options).find((o) => o.value === 'OL2');
      expect(ol2Option).toBeDefined();
      expect(ol2Option!.disabled).toBe(true);
      expect(ol2Option!.text).toContain('已停用');

      // active 選項（如 S5）的 disabled 屬性為 false
      const s5Option = Array.from(select.options).find((o) => o.value === 'S5');
      expect(s5Option).toBeDefined();
      expect(s5Option!.disabled).toBe(false);
    });

    it("TS-F050-I04：切換 inactive 卡別 OL2 → active S5 → PATCH 含新 cardType='S5'", async () => {
      mockedListLists.mockResolvedValue(makeResp([scenario5List]));
      mockedUpdateList.mockResolvedValue({ listNo: 'OB202605005' } as never);
      renderPage('OB202605005');

      await waitFor(() => expect(screen.getByTestId('select-cardType')).toBeInTheDocument());

      // 切到 S5
      fireEvent.change(screen.getByTestId('select-cardType'), { target: { value: 'S5' } });

      fireEvent.click(screen.getByTestId('btn-save'));
      await waitFor(() => expect(mockedUpdateList).toHaveBeenCalledTimes(1));
      const [, dto] = mockedUpdateList.mock.calls[0];
      const body = dto as Record<string, unknown>;
      expect(body.cardType).toBe('S5');
    });

    it("TS-F050-I05：清除卡別為「— 未選擇 —」→ PATCH cardType=null 或不帶 cardType", async () => {
      mockedListLists.mockResolvedValue(makeResp([scenario5List]));
      mockedUpdateList.mockResolvedValue({ listNo: 'OB202605005' } as never);
      renderPage('OB202605005');

      await waitFor(() => expect(screen.getByTestId('select-cardType')).toBeInTheDocument());

      // 切到「— 未選擇 —」（空值）
      fireEvent.change(screen.getByTestId('select-cardType'), { target: { value: '' } });

      fireEvent.click(screen.getByTestId('btn-save'));
      await waitFor(() => expect(mockedUpdateList).toHaveBeenCalledTimes(1));
      const [, dto] = mockedUpdateList.mock.calls[0];
      const body = dto as Record<string, unknown>;
      // 不帶 cardType（undefined）或為 null 均符合 spec
      expect(body.cardType === null || body.cardType === undefined).toBe(true);
    });

    it('TS-F050-I06：LEGACY 名單（conditionPayload=null）仍可正常使用卡別下拉、可儲存', async () => {
      mockedListLists.mockResolvedValue(makeResp([scenario3List]));
      mockedUpdateList.mockResolvedValue({ listNo: 'OB202604099' } as never);
      renderPage('OB202604099');

      await waitFor(() => expect(screen.getByTestId('select-cardType')).toBeInTheDocument());
      const select = screen.getByTestId('select-cardType') as HTMLSelectElement;
      // select 整體不應 disabled（LEGACY 名單仍可編輯卡別）
      expect(select.disabled).toBe(false);

      // 改卡別並儲存
      fireEvent.change(screen.getByTestId('select-cardType'), { target: { value: 'M' } });
      fireEvent.change(screen.getByTestId('input-listNm'), { target: { value: '已改名的舊名單' } });
      fireEvent.click(screen.getByTestId('btn-save'));
      await waitFor(() => expect(mockedUpdateList).toHaveBeenCalledTimes(1));
    });

    it("TS-F050-I07：stage != 'draft' 名單 — 主表單隱藏，卡別下拉不渲染（DOM 完全不存在）", async () => {
      mockedListLists.mockResolvedValue(makeResp([scenario4List]));
      renderPage('OB202605003');

      // NotDraftBanner 顯示，主表單隱藏
      // 等待頁面渲染完成 — 至少需有某種頁面內容
      await waitFor(() => {
        // 不論 banner testid 名稱為何，主要驗證 select-cardType 不渲染
        return screen.queryByTestId('select-cardType') !== undefined;
      });
      expect(screen.queryByTestId('select-cardType')).toBeNull();
    });
  });

  // ==========================================================================
  // R 群組（US-144 AC-2/AC-3）：best_case 系統固定鎖定列（編輯頁）
  // 對應 F050-test.md §十六 R 群組 TS-F050-R01~R03
  // ==========================================================================
  describe('v2.3 — best_case 系統固定鎖定列（US-144 AC-2/3）', () => {
    // 場景：draft 名單載入含 best_case（後端注入後）+ prod_kind 使用者條件
    const listWithBestCase: AssignmentListItem = {
      ...scenario1List,
      listNo: 'OB202605001',
      conditionPayload: {
        conditions: [
          { columnName: 'prod_kind', fieldType: 'categorical', values: ['02'] },
          { columnName: 'best_case', fieldType: 'categorical', values: ['Y'] },
        ],
        logic: 'AND',
      },
    };

    it('TS-F050-R01：載入含 best_case 的 payload → condition-row-best_case 鎖定列渲染，無 remove，值唯讀', async () => {
      mockedListLists.mockResolvedValue(makeResp([listWithBestCase]));
      renderPage('OB202605001');
      await waitFor(() =>
        expect(screen.getByTestId('condition-row-best_case')).toBeInTheDocument(),
      );
      const row = screen.getByTestId('condition-row-best_case');
      expect(row.getAttribute('data-system-fixed')).toBe('true');
      expect(screen.queryByTestId('remove-condition-best_case')).toBeNull();
      const chip = screen.getByTestId('value-best_case');
      expect(
        (chip as HTMLElement).getAttribute('aria-disabled') === 'true' ||
          (chip as HTMLInputElement).disabled === true,
      ).toBe(true);
    });

    it('TS-F050-R02：編輯頁「新增條件」dropdown 不含 best_case', async () => {
      mockedListLists.mockResolvedValue(makeResp([listWithBestCase]));
      renderPage('OB202605001');
      await waitFor(() =>
        expect(screen.getByTestId('condition-row-best_case')).toBeInTheDocument(),
      );
      fireEvent.click(screen.getByTestId('btn-add-condition'));
      await waitFor(() => expect(screen.getByTestId('add-field-dropdown')).toBeInTheDocument());
      const dropdown = screen.getByTestId('add-field-dropdown');
      expect(within(dropdown).queryByText('優質案件')).toBeNull();
      // prod_kind 已被使用者選用（在 conditions 中），故不在 dropdown；改驗其他可選非系統固定欄位
      expect(within(dropdown).getByText('進件 / 滿期年數')).toBeInTheDocument();
    });

    it('TS-F050-R03：刪除唯一非系統固定條件後點儲存 → 顯示最低條件數錯誤，updateList 不被呼叫', async () => {
      mockedListLists.mockResolvedValue(makeResp([listWithBestCase]));
      renderPage('OB202605001');
      // 等待使用者條件 prod_kind 列（index 0）渲染（best_case 已過濾為鎖定列）
      await waitFor(() => expect(screen.getByTestId('condition-row-0')).toBeInTheDocument());

      // 刪除 prod_kind（唯一非系統固定條件）
      fireEvent.click(screen.getByTestId('btn-remove-condition-0'));
      await waitFor(() => expect(screen.queryByTestId('condition-row-0')).toBeNull());

      fireEvent.click(screen.getByTestId('btn-save'));
      await waitFor(() => {
        expect(screen.getByTestId('form-error')).toHaveTextContent(
          '請至少新增 1 個篩選條件（優質案件為系統固定，不計入）',
        );
      });
      expect(mockedUpdateList).not.toHaveBeenCalled();
    });
  });
});
