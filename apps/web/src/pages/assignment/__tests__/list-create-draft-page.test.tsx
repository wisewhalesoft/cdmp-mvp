import { render, screen, cleanup, fireEvent, waitFor, within } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import { ListCreateDraftPage } from '../list-create-draft-page';
import { ToastProvider } from '@/components/ui/toast';
import * as assignmentListApi from '@/api/assignment-list';
import * as assignmentStageApi from '@/api/assignment-stage';
import * as pooldataFieldsApi from '@/api/pooldata-fields';
import * as cardTypeApi from '@/api/card-type';
import * as authStore from '@/stores/auth-store';
import type { ListListsResponse, AssignmentListItem } from '@/api/assignment-list';
import type {
  ListFieldsResponse,
  ListOptionsResponse,
} from '@/api/pooldata-fields';
import type { ListCardTypesResponse } from '@/api/card-type';

vi.mock('@/api/assignment-list');
vi.mock('@/api/assignment-stage');
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

const mockedCreateList = vi.mocked(assignmentListApi.createList);
const mockedListLists = vi.mocked(assignmentListApi.listLists);
const mockedAdvanceToDeptRatio = vi.mocked(assignmentStageApi.advanceToDeptRatio);
const mockedListFields = vi.mocked(pooldataFieldsApi.listFields);
const mockedListOptions = vi.mocked(pooldataFieldsApi.listOptions);
const mockedListCardTypes = vi.mocked(cardTypeApi.listCardTypes);
const mockedGetUser = vi.mocked(authStore.getUser);
const mockedGetBusinessRole = vi.mocked(authStore.getBusinessRole);
const mockedGetEffectiveIdentity = vi.mocked(authStore.getEffectiveIdentity);
const mockedPreviewHitCount = vi.mocked(assignmentListApi.previewHitCount);

// 對齊 prototype 27a L510-519 之 FIELDS mock（含拍板 UI-Q5 birth_date date type）
// v2.1.1（US-128/US-129）：新增 best_case categorical（承接已移除之 prod_best 業務語意）
// v2.3 / US-144：每筆補 isSystemFixed（best_case=true，其餘=false）；
//   前端鎖定列 + dropdown 排除由此旗標驅動（不 hardcode 字串 best_case）
const fieldsFixture: ListFieldsResponse = {
  fields: [
    { columnName: 'prod_kind', displayName: '產品類別', fieldType: 'categorical', isActive: true, isSystemFixed: false, createdAt: '', updatedAt: '' },
    { columnName: 'caseyear', displayName: '進件 / 滿期年數', fieldType: 'categorical', isActive: true, isSystemFixed: false, createdAt: '', updatedAt: '' },
    { columnName: 'case_status', displayName: '案件結清期別', fieldType: 'categorical', isActive: true, isSystemFixed: false, createdAt: '', updatedAt: '' },
    { columnName: 'best_case', displayName: '優質案件', fieldType: 'categorical', isActive: true, isSystemFixed: true, createdAt: '', updatedAt: '' },
    { columnName: 'month_cnt', displayName: '撈取月份計數', fieldType: 'numeric', isActive: true, isSystemFixed: false, createdAt: '', updatedAt: '' },
    { columnName: 'birth_date', displayName: '客戶生日', fieldType: 'date', isActive: true, isSystemFixed: false, createdAt: '', updatedAt: '' },
    // list_period_* 三欄不出現在 fields 回傳（依 5d 紅線：whitelist 不含 list_period_*）
  ],
};

// v2.1.1（US-126）：cardTypesFixture — 5 筆 active，依 card_type 升冪（對齊 prototype 27a L218-226）
const cardTypesFixture: ListCardTypesResponse = {
  cardTypes: [
    { cardType: 'E', cardName: '期中', prodKind: '01', prodKindName: '三信', status: 'active', cardVersion: 1, sdate: null, edate: null, createdBy: null, createdAt: null },
    { cardType: 'M', cardName: '滿期', prodKind: '03', prodKindName: '一般商品', status: 'active', cardVersion: 1, sdate: null, edate: null, createdBy: null, createdAt: null },
    { cardType: 'OB', cardName: '一般催收', prodKind: '01', prodKindName: '三信', status: 'active', cardVersion: 1, sdate: null, edate: null, createdBy: null, createdAt: null },
    { cardType: 'S5', cardName: '主力催收', prodKind: '02', prodKindName: '中信', status: 'active', cardVersion: 1, sdate: null, edate: null, createdBy: null, createdAt: null },
    { cardType: 'S6', cardName: '重點戶', prodKind: '02', prodKindName: '中信', status: 'active', cardVersion: 1, sdate: null, edate: null, createdBy: null, createdAt: null },
  ],
};

// v2.1.1（US-129）：best_case options Y / N（大寫；[[feedback_mock_real_system_contract]]）
const bestCaseOptionsFixture: ListOptionsResponse = {
  options: [
    { columnName: 'best_case', optionValue: 'Y', optionLabel: '優質案件', isActive: true, createdAt: '', updatedAt: '' },
    { columnName: 'best_case', optionValue: 'N', optionLabel: '非優質案件', isActive: true, createdAt: '', updatedAt: '' },
  ],
};

// caseyear: 8 個 option（含 99 wildcard），對齊 prototype 27a L524
const caseyearOptionsFixture: ListOptionsResponse = {
  options: [
    { columnName: 'caseyear', optionValue: '0', optionLabel: '0 年', isActive: true, createdAt: '', updatedAt: '' },
    { columnName: 'caseyear', optionValue: '1', optionLabel: '1 年', isActive: true, createdAt: '', updatedAt: '' },
    { columnName: 'caseyear', optionValue: '2', optionLabel: '2 年', isActive: true, createdAt: '', updatedAt: '' },
    { columnName: 'caseyear', optionValue: '3', optionLabel: '3 年', isActive: true, createdAt: '', updatedAt: '' },
    { columnName: 'caseyear', optionValue: '4', optionLabel: '4 年', isActive: true, createdAt: '', updatedAt: '' },
    { columnName: 'caseyear', optionValue: '5', optionLabel: '5 年', isActive: true, createdAt: '', updatedAt: '' },
    { columnName: 'caseyear', optionValue: '6', optionLabel: '6 年（以上）', isActive: true, createdAt: '', updatedAt: '' },
    { columnName: 'caseyear', optionValue: '99', optionLabel: '不限年數', isActive: true, createdAt: '', updatedAt: '' },
  ],
};

const caseStatusOptionsFixture: ListOptionsResponse = {
  options: [
    { columnName: 'case_status', optionValue: '01', optionLabel: '期中（不含當月滿期）', isActive: true, createdAt: '', updatedAt: '' },
    { columnName: 'case_status', optionValue: '02', optionLabel: '中結', isActive: true, createdAt: '', updatedAt: '' },
    { columnName: 'case_status', optionValue: '03', optionLabel: '滿期（含當月滿期）', isActive: true, createdAt: '', updatedAt: '' },
    { columnName: 'case_status', optionValue: '04', optionLabel: '滿期（已結清）', isActive: true, createdAt: '', updatedAt: '' },
  ],
};

// prod_kind: '01' 為 inactive（對齊 prototype 27a L523 琥珀 demo）
const prodKindOptionsFixture: ListOptionsResponse = {
  options: [
    { columnName: 'prod_kind', optionValue: '01', optionLabel: '汽車新車', isActive: false, createdAt: '', updatedAt: '', deactivatedReason: 'manual' },
    { columnName: 'prod_kind', optionValue: '02', optionLabel: '機車', isActive: true, createdAt: '', updatedAt: '' },
    { columnName: 'prod_kind', optionValue: '03', optionLabel: '其他商品', isActive: true, createdAt: '', updatedAt: '' },
  ],
};

const emptyPrevMonthLists: ListListsResponse = {
  selectedYm: '202604',
  currentWorkYm: '202605',
  isHistorical: false,
  isFuture: false,
  lockState: { locked: false, reason: null },
  lists: [],
  stageCounts: { draft: 0, dept_ratio: 0, personnel_ratio: 0, approval: 0, ready: 0, disabled: 0 },
};

function setupDefaultMocks() {
  // listFields: 預設 active=true 過濾
  mockedListFields.mockResolvedValue(fieldsFixture);
  // listOptions: 依 columnName 分流
  mockedListOptions.mockImplementation(async (columnName: string) => {
    if (columnName === 'caseyear') return caseyearOptionsFixture;
    if (columnName === 'case_status') return caseStatusOptionsFixture;
    if (columnName === 'prod_kind') return prodKindOptionsFixture;
    if (columnName === 'best_case') return bestCaseOptionsFixture;
    return { options: [] };
  });
  // v2.1.1（US-126）：cardTypes — 預設回 5 筆 active
  mockedListCardTypes.mockResolvedValue(cardTypesFixture);
  mockedListLists.mockResolvedValue(emptyPrevMonthLists);
}

function renderPage(entry = '/assignment/list-definitions/new') {
  return render(
    <MemoryRouter initialEntries={[entry]}>
      <ToastProvider>
        <ListCreateDraftPage />
      </ToastProvider>
    </MemoryRouter>,
  );
}

describe('ListCreateDraftPage v2.1 (Phase 5d 波 8)', () => {
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
  // lc.test#1 — 渲染 4 section 標題（對齊 prototype 27a L173/219/261/320）
  // ─────────────────────────────────────────
  it('lc.test#1: 渲染 4 section 標題（基本資訊 / 撈案期間 / 篩選條件 / CR 回分規則）', async () => {
    renderPage();
    await waitFor(() => {
      expect(screen.getByText('基本資訊')).toBeInTheDocument();
    });
    expect(screen.getByText('撈案期間')).toBeInTheDocument();
    expect(screen.getByText('篩選條件')).toBeInTheDocument();
    expect(screen.getByText('CR 回分規則')).toBeInTheDocument();
  });

  // ─────────────────────────────────────────
  // lc.test#2 — 撈案期間 3 input + 一級保留欄位徽章
  // ─────────────────────────────────────────
  it('lc.test#2: 撈案期間區塊含 listPeriodStart/End/Interval 3 input + 「一級保留欄位」徽章', async () => {
    renderPage();
    await waitFor(() => {
      expect(screen.getByTestId('input-listPeriodStart')).toBeInTheDocument();
    });
    expect(screen.getByTestId('input-listPeriodEnd')).toBeInTheDocument();
    expect(screen.getByTestId('input-listInterval')).toBeInTheDocument();
    expect(screen.getByText('一級保留欄位')).toBeInTheDocument();
  });

  // ─────────────────────────────────────────
  // lc.test#3 — 「新增條件」開 dropdown，來源 listFields({active:'true'})；list_period_* 不出現
  // ─────────────────────────────────────────
  it('lc.test#3: 點「新增條件」開 dropdown → 來源 listFields({active:true})；list_period_* 不出現', async () => {
    renderPage();
    await waitFor(() => expect(mockedListFields).toHaveBeenCalled());
    // 確認 listFields 帶 active=true
    expect(mockedListFields).toHaveBeenCalledWith(
      expect.objectContaining({ active: 'true' }),
    );

    fireEvent.click(screen.getByTestId('btn-add-condition'));

    await waitFor(() => {
      expect(screen.getByTestId('add-field-dropdown')).toBeInTheDocument();
    });
    const dropdown = screen.getByTestId('add-field-dropdown');
    // active 欄位顯示
    expect(within(dropdown).getByText('產品類別')).toBeInTheDocument();
    expect(within(dropdown).getByText('進件 / 滿期年數')).toBeInTheDocument();
    // list_period_* 不應出現
    expect(within(dropdown).queryByText(/list_period/i)).toBeNull();
  });

  // ─────────────────────────────────────────
  // lc.test#4 — conditions=[] 點儲存 → 最低條件數錯誤（US-144 v2.3.1 改文案）+ createList 未被呼叫
  //   對齊 prototype 27a L1000
  // ─────────────────────────────────────────
  it('lc.test#4: 無（非系統固定）條件提交 → 顯示最低條件數錯誤 + createList 不被呼叫', async () => {
    renderPage();
    await waitFor(() => expect(screen.getByTestId('input-listNm')).toBeInTheDocument());

    fireEvent.change(screen.getByTestId('input-listNm'), { target: { value: '測試名單' } });
    fireEvent.change(screen.getByTestId('input-listPeriodStart'), { target: { value: '1' } });
    fireEvent.change(screen.getByTestId('input-listPeriodEnd'), { target: { value: '6' } });
    fireEvent.change(screen.getByTestId('input-listInterval'), { target: { value: '1' } });

    fireEvent.click(screen.getByTestId('btn-save-draft'));

    await waitFor(() => {
      expect(screen.getByTestId('form-error')).toHaveTextContent(
        '請至少新增 1 個篩選條件（優質案件為系統固定，不計入）',
      );
    });
    expect(mockedCreateList).not.toHaveBeenCalled();
  });

  // ─────────────────────────────────────────
  // F097 fix — 建立名單帶分派作業月份 workYm（來自共享作業月 ?ym）
  // ─────────────────────────────────────────
  it('F097: ?ym=2026-06（作業月）送出 → createList body 含 workYm=202606', async () => {
    mockedCreateList.mockResolvedValue({ listNo: 'OB202606099' } as never);
    renderPage('/assignment/list-definitions/new?ym=2026-06');
    await waitFor(() => expect(screen.getByTestId('input-listNm')).toBeInTheDocument());

    fireEvent.change(screen.getByTestId('input-listNm'), { target: { value: '2026-06 測試名單' } });
    fireEvent.change(screen.getByTestId('input-listPeriodStart'), { target: { value: '1' } });
    fireEvent.change(screen.getByTestId('input-listPeriodEnd'), { target: { value: '6' } });
    fireEvent.change(screen.getByTestId('input-listInterval'), { target: { value: '1' } });

    fireEvent.click(screen.getByTestId('btn-add-condition'));
    await waitFor(() => expect(screen.getByTestId('add-field-dropdown')).toBeInTheDocument());
    fireEvent.click(screen.getByTestId('add-field-caseyear'));
    await waitFor(() => expect(mockedListOptions).toHaveBeenCalledWith('caseyear', expect.any(Object)));
    fireEvent.click(screen.getByTestId('btn-open-values-0'));
    await waitFor(() => expect(screen.getByTestId('value-checkbox-0-0')).toBeInTheDocument());
    fireEvent.click(screen.getByTestId('value-checkbox-0-0'));

    fireEvent.click(screen.getByTestId('btn-save-draft'));

    await waitFor(() => expect(mockedCreateList).toHaveBeenCalledTimes(1));
    const dto = mockedCreateList.mock.calls[0][0] as Record<string, unknown>;
    expect(dto.workYm).toBe('202606');
  });

  it('F097: 複製上月以「作業月的上月」查詢（?ym=2026-06 → listLists ym=202605）', async () => {
    renderPage('/assignment/list-definitions/new?ym=2026-06');
    await waitFor(() =>
      expect(screen.getByTestId('btn-open-copy-modal')).toBeInTheDocument(),
    );
    fireEvent.click(screen.getByTestId('btn-open-copy-modal'));
    await waitFor(() =>
      expect(mockedListLists).toHaveBeenCalledWith({ ym: '202605' }),
    );
  });

  // ─────────────────────────────────────────
  // lc.test#5 — 合法 condition 送出 → createList body 不含 prodKind/caseYear/specTp/caseStatus/settleSrc
  // ─────────────────────────────────────────
  it('lc.test#5: 合法 categorical condition 送出 → createList body 用 conditionPayload，無 v2.0 5 欄', async () => {
    mockedCreateList.mockResolvedValue({ listNo: 'OB202605099' } as never);
    renderPage();
    await waitFor(() => expect(screen.getByTestId('input-listNm')).toBeInTheDocument());

    fireEvent.change(screen.getByTestId('input-listNm'), { target: { value: '2026-05 測試名單' } });
    fireEvent.change(screen.getByTestId('input-listPeriodStart'), { target: { value: '1' } });
    fireEvent.change(screen.getByTestId('input-listPeriodEnd'), { target: { value: '6' } });
    fireEvent.change(screen.getByTestId('input-listInterval'), { target: { value: '1' } });

    // 新增 caseyear condition + 選 '0' '1' 2 個值
    fireEvent.click(screen.getByTestId('btn-add-condition'));
    await waitFor(() => expect(screen.getByTestId('add-field-dropdown')).toBeInTheDocument());
    fireEvent.click(screen.getByTestId('add-field-caseyear'));

    // 等載入 options
    await waitFor(() => expect(mockedListOptions).toHaveBeenCalledWith('caseyear', expect.any(Object)));
    // 點開值 dropdown
    fireEvent.click(screen.getByTestId('btn-open-values-0'));
    await waitFor(() => expect(screen.getByTestId('value-checkbox-0-0')).toBeInTheDocument());
    fireEvent.click(screen.getByTestId('value-checkbox-0-0'));
    fireEvent.click(screen.getByTestId('value-checkbox-0-1'));

    fireEvent.click(screen.getByTestId('btn-save-draft'));

    await waitFor(() => expect(mockedCreateList).toHaveBeenCalledTimes(1));
    const dto = mockedCreateList.mock.calls[0][0] as Record<string, unknown>;
    expect(dto.listNm).toBe('2026-05 測試名單');
    expect(dto.listPeriodStart).toBe(1);
    expect(dto.listPeriodEnd).toBe(6);
    expect(dto.listInterval).toBe(1);
    expect(dto.conditionPayload).toEqual({
      conditions: [
        { columnName: 'caseyear', fieldType: 'categorical', values: ['0', '1'] },
      ],
      logic: 'AND',
    });
    // 5 個 v2.0 一級欄位不可出現於 body
    expect(dto.prodKind).toBeUndefined();
    expect(dto.caseYear).toBeUndefined();
    expect(dto.specTp).toBeUndefined();
    expect(dto.caseStatus).toBeUndefined();
    expect(dto.settleSrc).toBeUndefined();
  });

  // ─────────────────────────────────────────
  // lc.test#6 — 選 caseyear → fetch listOptions(caseyear, {active:'true'}) → 8 個 checkbox
  // ─────────────────────────────────────────
  it('lc.test#6: 選 caseyear → 呼叫 listOptions(caseyear, {active:true}) 並渲染 8 個 checkbox', async () => {
    renderPage();
    await waitFor(() => expect(screen.getByTestId('btn-add-condition')).toBeInTheDocument());
    fireEvent.click(screen.getByTestId('btn-add-condition'));
    await waitFor(() => expect(screen.getByTestId('add-field-caseyear')).toBeInTheDocument());
    fireEvent.click(screen.getByTestId('add-field-caseyear'));

    await waitFor(() =>
      expect(mockedListOptions).toHaveBeenCalledWith(
        'caseyear',
        expect.objectContaining({ active: 'true' }),
      ),
    );

    fireEvent.click(screen.getByTestId('btn-open-values-0'));
    await waitFor(() => {
      expect(screen.getByTestId('value-checkbox-0-99')).toBeInTheDocument();
    });
    // 8 個 checkbox（0/1/2/3/4/5/6/99）
    for (const v of ['0', '1', '2', '3', '4', '5', '6', '99']) {
      expect(screen.getByTestId(`value-checkbox-0-${v}`)).toBeInTheDocument();
    }
  });

  // ─────────────────────────────────────────
  // lc.test#7 — 選 case_status → 從 listOptions 載入；無任何 /assignment-codes call
  //   (確認 F068 廢除：assignment-codes API 不再被呼叫；用 pooldata-fields 取代)
  // ─────────────────────────────────────────
  it('lc.test#7: 選 case_status → 呼叫 listOptions(case_status)；不呼叫 /assignment-codes', async () => {
    renderPage();
    await waitFor(() => expect(screen.getByTestId('btn-add-condition')).toBeInTheDocument());
    fireEvent.click(screen.getByTestId('btn-add-condition'));
    await waitFor(() => expect(screen.getByTestId('add-field-case_status')).toBeInTheDocument());
    fireEvent.click(screen.getByTestId('add-field-case_status'));

    await waitFor(() =>
      expect(mockedListOptions).toHaveBeenCalledWith('case_status', expect.any(Object)),
    );
    // 4 個 option
    fireEvent.click(screen.getByTestId('btn-open-values-0'));
    await waitFor(() => {
      expect(screen.getByTestId('value-checkbox-0-01')).toBeInTheDocument();
    });
    expect(screen.getByTestId('value-checkbox-0-04')).toBeInTheDocument();
  });

  // ─────────────────────────────────────────
  // lc.test#8 — numeric 欄位 → min/max input
  // ─────────────────────────────────────────
  it('lc.test#8: 選 month_cnt（numeric） → 渲染 min/max input', async () => {
    renderPage();
    await waitFor(() => expect(screen.getByTestId('btn-add-condition')).toBeInTheDocument());
    fireEvent.click(screen.getByTestId('btn-add-condition'));
    await waitFor(() => expect(screen.getByTestId('add-field-month_cnt')).toBeInTheDocument());
    fireEvent.click(screen.getByTestId('add-field-month_cnt'));

    await waitFor(() => {
      expect(screen.getByTestId('input-numeric-min-0')).toBeInTheDocument();
    });
    expect(screen.getByTestId('input-numeric-max-0')).toBeInTheDocument();
  });

  // ─────────────────────────────────────────
  // lc.test#9 — date 欄位 → dateStart/dateEnd input
  // ─────────────────────────────────────────
  it('lc.test#9: 選 birth_date（date） → 渲染 dateStart/dateEnd input', async () => {
    renderPage();
    await waitFor(() => expect(screen.getByTestId('btn-add-condition')).toBeInTheDocument());
    fireEvent.click(screen.getByTestId('btn-add-condition'));
    await waitFor(() => expect(screen.getByTestId('add-field-birth_date')).toBeInTheDocument());
    fireEvent.click(screen.getByTestId('add-field-birth_date'));

    await waitFor(() => {
      expect(screen.getByTestId('input-date-start-0')).toBeInTheDocument();
    });
    expect(screen.getByTestId('input-date-end-0')).toBeInTheDocument();
  });

  // ─────────────────────────────────────────
  // lc.test#10 — INACTIVE option → 琥珀 warning + 「N 個可選值已停用，將被保留但月名單分派時不會匹配」
  //   對齊 prototype 27a L763
  // ─────────────────────────────────────────
  it('lc.test#10: 含 INACTIVE option → 顯示琥珀 banner（「N 個可選值已停用」訊息）', async () => {
    renderPage();
    await waitFor(() => expect(screen.getByTestId('btn-add-condition')).toBeInTheDocument());

    // 新增 prod_kind condition（'01' 在 fixture 為 inactive）
    fireEvent.click(screen.getByTestId('btn-add-condition'));
    await waitFor(() => expect(screen.getByTestId('add-field-prod_kind')).toBeInTheDocument());
    fireEvent.click(screen.getByTestId('add-field-prod_kind'));

    await waitFor(() => expect(mockedListOptions).toHaveBeenCalledWith('prod_kind', expect.any(Object)));
    fireEvent.click(screen.getByTestId('btn-open-values-0'));
    await waitFor(() => expect(screen.getByTestId('value-checkbox-0-01')).toBeInTheDocument());

    // 勾選 inactive '01'
    fireEvent.click(screen.getByTestId('value-checkbox-0-01'));

    await waitFor(() => {
      expect(screen.getByTestId('inactive-warning-banner')).toBeInTheDocument();
    });
    const banner = screen.getByTestId('inactive-warning-banner');
    expect(banner.textContent).toContain('1 個可選值已停用，將被保留但月名單分派時不會匹配');
  });

  // ─────────────────────────────────────────
  // lc.test#11 — 「從上月複製」modal 只顯示 conditionPayload !== null 的名單
  // ─────────────────────────────────────────
  it('lc.test#11: 從上月複製 modal 過濾掉 conditionPayload IS NULL 的舊名單', async () => {
    const listWithPayload: AssignmentListItem = {
      listNo: 'OB202604001',
      listNm: '新格式名單',
      prodKind: null,
      caseYear: null,
      specTp: null,
      caseStatus: null,
      crEnabled: true,
      listPeriodStart: 1,
      listPeriodEnd: 6,
      listInterval: 1,
      settleSrc: null,
      cardType: null,
      prodBest: null,
      status: 'active',
      stage: 'ready',
      createdBy: '王部長',
      createdAt: '2026-04-10T00:00:00Z',
      updatedAt: '2026-04-10T00:00:00Z',
      conditionPayload: {
        conditions: [{ columnName: 'caseyear', fieldType: 'categorical', values: ['1'] }],
        logic: 'AND',
      },
    };
    const legacyList: AssignmentListItem = {
      ...listWithPayload,
      listNo: 'OB202604099',
      listNm: '舊格式名單',
      conditionPayload: null,
    };
    mockedListLists.mockResolvedValue({
      ...emptyPrevMonthLists,
      lists: [listWithPayload, legacyList],
      stageCounts: { draft: 0, dept_ratio: 0, personnel_ratio: 0, approval: 0, ready: 2, disabled: 0 },
    });
    renderPage();
    await waitFor(() => expect(screen.getByTestId('btn-open-copy-modal')).toBeInTheDocument());

    fireEvent.click(screen.getByTestId('btn-open-copy-modal'));
    await waitFor(() => {
      expect(screen.getByTestId('copy-row-OB202604001')).toBeInTheDocument();
    });
    // 舊格式（conditionPayload=null）不應出現
    expect(screen.queryByTestId('copy-row-OB202604099')).toBeNull();
  });

  // ─────────────────────────────────────────
  // lc.test#12 — 點「儲存並推進至部門比例」+ 含 INACTIVE → 確認 checkbox + advance disabled until checked
  //   對齊 prototype 27a L394 / L420-422
  // ─────────────────────────────────────────
  it('lc.test#12: 推進 + INACTIVE → 標題「儲存並推進至部門比例階段？」+ 必勾「我已了解推進後條件將被固化」', async () => {
    renderPage();
    await waitFor(() => expect(screen.getByTestId('input-listNm')).toBeInTheDocument());

    fireEvent.change(screen.getByTestId('input-listNm'), { target: { value: '測試' } });
    fireEvent.change(screen.getByTestId('input-listPeriodStart'), { target: { value: '1' } });
    fireEvent.change(screen.getByTestId('input-listPeriodEnd'), { target: { value: '6' } });
    fireEvent.change(screen.getByTestId('input-listInterval'), { target: { value: '1' } });

    // 加 prod_kind condition 含 inactive '01'
    fireEvent.click(screen.getByTestId('btn-add-condition'));
    await waitFor(() => expect(screen.getByTestId('add-field-prod_kind')).toBeInTheDocument());
    fireEvent.click(screen.getByTestId('add-field-prod_kind'));
    await waitFor(() => expect(mockedListOptions).toHaveBeenCalledWith('prod_kind', expect.any(Object)));
    fireEvent.click(screen.getByTestId('btn-open-values-0'));
    await waitFor(() => expect(screen.getByTestId('value-checkbox-0-01')).toBeInTheDocument());
    fireEvent.click(screen.getByTestId('value-checkbox-0-01'));

    // 點推進
    fireEvent.click(screen.getByTestId('btn-advance'));

    await waitFor(() => expect(screen.getByTestId('advance-confirm-modal')).toBeInTheDocument());
    // 標題（對齊 prototype 27a L394）
    expect(screen.getByText('儲存並推進至部門比例階段？')).toBeInTheDocument();
    // INACTIVE 警告 + checkbox 文案
    expect(screen.getByText('我已了解推進後條件將被固化')).toBeInTheDocument();
    // 確認按鈕初始 disabled
    const confirmBtn = screen.getByTestId('btn-confirm-advance');
    expect(confirmBtn).toBeDisabled();
    // 勾選後 enabled
    fireEvent.click(screen.getByTestId('checkbox-inactive-acknowledge'));
    expect(confirmBtn).not.toBeDisabled();
  });

  // ─────────────────────────────────────────
  // lc.test#12.b — 「儲存並推進」一鍵流：createList 之後必呼 advanceToDeptRatio
  //   修復 2026-05-25 bug：舊版只 createList、不 advance，名單留在 draft，
  //   用戶以為已推進到 dept_ratio。
  // ─────────────────────────────────────────
  // Helper：填表單到滿足 validate() 通過的最小集（一個 categorical 條件 = prod_kind:01）
  const fillFormWithMinCondition = async (listNm: string) => {
    await waitFor(() => expect(screen.getByTestId('input-listNm')).toBeInTheDocument());
    fireEvent.change(screen.getByTestId('input-listNm'), { target: { value: listNm } });
    fireEvent.change(screen.getByTestId('input-listPeriodStart'), { target: { value: '1' } });
    fireEvent.change(screen.getByTestId('input-listPeriodEnd'), { target: { value: '6' } });
    fireEvent.change(screen.getByTestId('input-listInterval'), { target: { value: '1' } });

    fireEvent.click(screen.getByTestId('btn-add-condition'));
    await waitFor(() => expect(screen.getByTestId('add-field-prod_kind')).toBeInTheDocument());
    fireEvent.click(screen.getByTestId('add-field-prod_kind'));
    await waitFor(() => expect(mockedListOptions).toHaveBeenCalledWith('prod_kind', expect.any(Object)));
    fireEvent.click(screen.getByTestId('btn-open-values-0'));
    await waitFor(() => expect(screen.getByTestId('value-checkbox-0-01')).toBeInTheDocument());
    fireEvent.click(screen.getByTestId('value-checkbox-0-01'));
  };

  it('lc.test#12.b: 「儲存並推進」依序呼叫 createList → advanceToDeptRatio（修復 stage 卡 draft）', async () => {
    mockedCreateList.mockResolvedValue({ listNo: 'OB202605099' } as any);
    mockedAdvanceToDeptRatio.mockResolvedValue({
      listNo: 'OB202605099',
      stage: 'dept_ratio',
    });

    renderPage();
    await fillFormWithMinCondition('推進測試');

    fireEvent.click(screen.getByTestId('btn-advance'));
    await waitFor(() => expect(screen.getByTestId('advance-confirm-modal')).toBeInTheDocument());
    // INACTIVE checkbox 因含 prod_kind=01 仍會被要求勾選
    fireEvent.click(screen.getByTestId('checkbox-inactive-acknowledge'));
    fireEvent.click(screen.getByTestId('btn-confirm-advance'));

    await waitFor(() => {
      expect(mockedCreateList).toHaveBeenCalledTimes(1);
      expect(mockedAdvanceToDeptRatio).toHaveBeenCalledWith('OB202605099');
    });
    // create 必先於 advance
    const createOrder = mockedCreateList.mock.invocationCallOrder[0];
    const advanceOrder = mockedAdvanceToDeptRatio.mock.invocationCallOrder[0];
    expect(createOrder).toBeLessThan(advanceOrder);
  });

  it('lc.test#12.c: createList 失敗 → 不呼叫 advanceToDeptRatio', async () => {
    mockedCreateList.mockRejectedValue({
      response: { data: { message: '建立失敗 mock' } },
    });

    renderPage();
    await fillFormWithMinCondition('失敗測試');

    fireEvent.click(screen.getByTestId('btn-advance'));
    await waitFor(() => expect(screen.getByTestId('advance-confirm-modal')).toBeInTheDocument());
    fireEvent.click(screen.getByTestId('checkbox-inactive-acknowledge'));
    fireEvent.click(screen.getByTestId('btn-confirm-advance'));

    await waitFor(() => expect(mockedCreateList).toHaveBeenCalledTimes(1));
    expect(mockedAdvanceToDeptRatio).not.toHaveBeenCalled();
  });

  // ==========================================================================
  // v2.1.1 補強 H 群組（US-126 / US-128 / US-129 / F050 AC-16 / §18.11.5）
  //   - cardType: <input type="text"> → <select data-testid="select-cardType">
  //   - prodBest: 移除 input-prodBest 元素 + state + DTO 寫入
  //   - best_case: 篩選條件 dropdown 含此欄位 + 可加入 Y/N 條件
  // ==========================================================================
  describe('v2.1.1 補強 (US-126/US-128/US-129)', () => {
    it('TS-F050-H01：移除 prodBest input — queryByTestId(\'input-prodBest\') 為 null（DOM 完全不存在）', async () => {
      renderPage();
      await waitFor(() => expect(screen.getByTestId('input-listNm')).toBeInTheDocument());

      expect(screen.queryByTestId('input-prodBest')).toBeNull();
    });

    it('TS-F050-H02：卡別 <select> 以 testid select-cardType 渲染，tagName 為 SELECT', async () => {
      renderPage();
      await waitFor(() => expect(screen.getByTestId('select-cardType')).toBeInTheDocument());

      const el = screen.getByTestId('select-cardType');
      expect(el.tagName).toBe('SELECT');
    });

    it('TS-F050-H03：卡別下拉首選項為「— 未選擇 —」且預設選中（空值）', async () => {
      renderPage();
      await waitFor(() => expect(screen.getByTestId('select-cardType')).toBeInTheDocument());

      const select = screen.getByTestId('select-cardType') as HTMLSelectElement;
      // 首選項
      expect(select.options[0].text).toMatch(/未選擇/);
      expect(select.options[0].value).toBe('');
      // 預設值為空（首選項 selected）
      expect(select.value).toBe('');
    });

    it('TS-F050-H04：卡別下拉 options 來自 mock cardTypes API — 共 6 個（1 首選 + 5 active），依升冪', async () => {
      renderPage();
      await waitFor(() => expect(mockedListCardTypes).toHaveBeenCalled());

      const select = screen.getByTestId('select-cardType') as HTMLSelectElement;
      expect(select.options.length).toBe(6); // 1 首選 + 5 active

      // 依升冪：E, M, OB, S5, S6（首選項在 index 0）
      const values = Array.from(select.options).map((o) => o.value);
      expect(values).toEqual(['', 'E', 'M', 'OB', 'S5', 'S6']);

      // option text 格式：含 card_type — card_name（prod_kind 或 prodKindName）
      const s5 = Array.from(select.options).find((o) => o.value === 'S5');
      expect(s5).toBeDefined();
      expect(s5!.text).toContain('S5');
      expect(s5!.text).toContain('主力催收');
    });

    it('TS-F050-H05：選取 S5 後送出 DTO — cardType === \'S5\'（純代碼字串）', async () => {
      mockedCreateList.mockResolvedValue({ listNo: 'OB202605099' } as never);
      renderPage();
      await waitFor(() => expect(screen.getByTestId('input-listNm')).toBeInTheDocument());
      await waitFor(() => expect(screen.getByTestId('select-cardType')).toBeInTheDocument());

      fireEvent.change(screen.getByTestId('input-listNm'), { target: { value: '測試' } });
      fireEvent.change(screen.getByTestId('input-listPeriodStart'), { target: { value: '1' } });
      fireEvent.change(screen.getByTestId('input-listPeriodEnd'), { target: { value: '6' } });
      fireEvent.change(screen.getByTestId('input-listInterval'), { target: { value: '1' } });

      // 選 cardType=S5
      fireEvent.change(screen.getByTestId('select-cardType'), { target: { value: 'S5' } });

      // 加最小條件以通過必填驗證
      fireEvent.click(screen.getByTestId('btn-add-condition'));
      await waitFor(() => expect(screen.getByTestId('add-field-caseyear')).toBeInTheDocument());
      fireEvent.click(screen.getByTestId('add-field-caseyear'));
      await waitFor(() => expect(mockedListOptions).toHaveBeenCalledWith('caseyear', expect.any(Object)));
      fireEvent.click(screen.getByTestId('btn-open-values-0'));
      await waitFor(() => expect(screen.getByTestId('value-checkbox-0-0')).toBeInTheDocument());
      fireEvent.click(screen.getByTestId('value-checkbox-0-0'));

      fireEvent.click(screen.getByTestId('btn-save-draft'));
      await waitFor(() => expect(mockedCreateList).toHaveBeenCalledTimes(1));

      const dto = mockedCreateList.mock.calls[0][0] as Record<string, unknown>;
      expect(dto.cardType).toBe('S5');
    });

    it('TS-F050-H06：API 載入失敗時顯示 fallback 提示「卡別資料載入失敗，請重新整理頁面」；不阻擋儲存', async () => {
      mockedListCardTypes.mockRejectedValue(new Error('Network Error'));
      mockedCreateList.mockResolvedValue({ listNo: 'OB202605099' } as never);

      renderPage();
      await waitFor(() => expect(screen.getByTestId('input-listNm')).toBeInTheDocument());

      // fallback 文字出現
      await waitFor(() => {
        expect(screen.getByText('卡別資料載入失敗，請重新整理頁面')).toBeInTheDocument();
      });

      // 填其他欄位仍可儲存
      fireEvent.change(screen.getByTestId('input-listNm'), { target: { value: '測試' } });
      fireEvent.change(screen.getByTestId('input-listPeriodStart'), { target: { value: '1' } });
      fireEvent.change(screen.getByTestId('input-listPeriodEnd'), { target: { value: '6' } });
      fireEvent.change(screen.getByTestId('input-listInterval'), { target: { value: '1' } });

      fireEvent.click(screen.getByTestId('btn-add-condition'));
      await waitFor(() => expect(screen.getByTestId('add-field-caseyear')).toBeInTheDocument());
      fireEvent.click(screen.getByTestId('add-field-caseyear'));
      await waitFor(() => expect(mockedListOptions).toHaveBeenCalledWith('caseyear', expect.any(Object)));
      fireEvent.click(screen.getByTestId('btn-open-values-0'));
      await waitFor(() => expect(screen.getByTestId('value-checkbox-0-0')).toBeInTheDocument());
      fireEvent.click(screen.getByTestId('value-checkbox-0-0'));

      fireEvent.click(screen.getByTestId('btn-save-draft'));
      await waitFor(() => expect(mockedCreateList).toHaveBeenCalledTimes(1));
    });

    // US-144（v2.3）SUPERSEDES US-129 H07/H08：best_case 自 US-144 起為系統固定條件，
    //   不再以使用者可新增條件呈現（改為鎖定列 + dropdown 排除）。H07/H08 改驗新行為。
    it('TS-F050-H07（US-144 superseded）：篩選條件 dropdown 不含 best_case「優質案件」（系統固定排除）', async () => {
      renderPage();
      await waitFor(() => expect(mockedListFields).toHaveBeenCalled());
      // 等待鎖定列渲染（確認 fields 載入完成）
      await waitFor(() => expect(screen.getByTestId('condition-row-best_case')).toBeInTheDocument());

      fireEvent.click(screen.getByTestId('btn-add-condition'));
      await waitFor(() => expect(screen.getByTestId('add-field-dropdown')).toBeInTheDocument());

      const dropdown = screen.getByTestId('add-field-dropdown');
      expect(within(dropdown).queryByText('優質案件')).toBeNull();
      // 其他非系統固定欄位仍出現
      expect(within(dropdown).getByText('產品類別')).toBeInTheDocument();
    });

    it('TS-F050-H08（US-144 superseded）：best_case 以鎖定列恆顯示（Y · 優質案件），無 add-field-best_case 入口', async () => {
      renderPage();
      await waitFor(() => expect(screen.getByTestId('condition-row-best_case')).toBeInTheDocument());

      const row = screen.getByTestId('condition-row-best_case');
      expect(row.getAttribute('data-system-fixed')).toBe('true');
      expect(within(row).getByTestId('value-best_case')).toHaveTextContent('Y · 優質案件');
      // dropdown 入口不存在（系統固定欄位不可被新增）
      fireEvent.click(screen.getByTestId('btn-add-condition'));
      await waitFor(() => expect(screen.getByTestId('add-field-dropdown')).toBeInTheDocument());
      expect(screen.queryByTestId('add-field-best_case')).toBeNull();
    });
  });

  // ==========================================================================
  // Q 群組（US-144 AC-3/AC-4/AC-10）：best_case 系統固定鎖定列（建立頁）
  // 對應 F050-test.md §十六 Q 群組 TS-F050-Q01~Q06
  // ==========================================================================
  describe('v2.3 — best_case 系統固定鎖定列（US-144 AC-3/4）', () => {
    it('TS-F050-Q01：condition-row-best_case 存在於 DOM，data-system-fixed="true"', async () => {
      renderPage();
      await waitFor(() => expect(screen.getByTestId('condition-row-best_case')).toBeInTheDocument());
      expect(
        screen.getByTestId('condition-row-best_case').getAttribute('data-system-fixed'),
      ).toBe('true');
    });

    it('TS-F050-Q02：remove-condition-best_case 元素在 DOM 中完全不存在', async () => {
      renderPage();
      await waitFor(() => expect(screen.getByTestId('condition-row-best_case')).toBeInTheDocument());
      expect(screen.queryByTestId('remove-condition-best_case')).toBeNull();
    });

    it('TS-F050-Q03：value-best_case 值 chip 處於 disabled（aria-disabled=true）', async () => {
      renderPage();
      await waitFor(() => expect(screen.getByTestId('value-best_case')).toBeInTheDocument());
      const chip = screen.getByTestId('value-best_case');
      expect(
        (chip as HTMLElement).getAttribute('aria-disabled') === 'true' ||
          (chip as HTMLInputElement).disabled === true,
      ).toBe(true);
    });

    it('TS-F050-Q04：「新增條件」dropdown 展開後不含 best_case（優質案件）', async () => {
      renderPage();
      await waitFor(() => expect(screen.getByTestId('condition-row-best_case')).toBeInTheDocument());
      fireEvent.click(screen.getByTestId('btn-add-condition'));
      await waitFor(() => expect(screen.getByTestId('add-field-dropdown')).toBeInTheDocument());
      const dropdown = screen.getByTestId('add-field-dropdown');
      expect(within(dropdown).queryByText('優質案件')).toBeNull();
      expect(within(dropdown).getByText('產品類別')).toBeInTheDocument();
    });

    it('TS-F050-Q05：僅有 best_case 系統固定條件時點儲存 → 顯示最低條件數錯誤 + createList 不被呼叫', async () => {
      renderPage();
      await waitFor(() => expect(screen.getByTestId('condition-row-best_case')).toBeInTheDocument());

      fireEvent.change(screen.getByTestId('input-listNm'), { target: { value: '測試名單' } });
      fireEvent.change(screen.getByTestId('input-listPeriodStart'), { target: { value: '1' } });
      fireEvent.change(screen.getByTestId('input-listPeriodEnd'), { target: { value: '6' } });
      fireEvent.change(screen.getByTestId('input-listInterval'), { target: { value: '1' } });

      fireEvent.click(screen.getByTestId('btn-save-draft'));

      await waitFor(() => {
        expect(screen.getByTestId('form-error')).toHaveTextContent(
          '請至少新增 1 個篩選條件（優質案件為系統固定，不計入）',
        );
      });
      expect(mockedCreateList).not.toHaveBeenCalled();
    });

    it('TS-F050-Q06：best_case 鎖定列顯示「系統固定」標籤 + 唯讀值', async () => {
      renderPage();
      await waitFor(() => expect(screen.getByTestId('condition-row-best_case')).toBeInTheDocument());
      const row = screen.getByTestId('condition-row-best_case');
      expect(row.textContent).toContain('系統固定');
      expect(within(row).getByTestId('value-best_case')).toHaveTextContent('優質案件');
    });
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// F109 / US-172 — 「新增條件」選單依 dataSource 分組（AC-3 / FE-004~006）
// ═══════════════════════════════════════════════════════════════════════════
describe('F109 ListCreateDraftPage — 新增條件選單依 dataSource 分組', () => {
  // 含案件（prod_kind）+ 客戶（gender categorical / date_of_birth numeric）+ 系統固定（best_case）
  const f109Fixture: ListFieldsResponse = {
    fields: [
      { columnName: 'prod_kind', displayName: '產品類別', fieldType: 'categorical', isActive: true, isSystemFixed: false, dataSource: 'ob_pool_data', createdAt: '', updatedAt: '' },
      { columnName: 'best_case', displayName: '優質案件', fieldType: 'categorical', isActive: true, isSystemFixed: true, dataSource: 'ob_pool_data', createdAt: '', updatedAt: '' },
      { columnName: 'gender', displayName: '性別', fieldType: 'categorical', isActive: true, isSystemFixed: false, dataSource: 'customer_core', createdAt: '', updatedAt: '' },
      { columnName: 'date_of_birth', displayName: '年齡', fieldType: 'numeric', isActive: true, isSystemFixed: false, dataSource: 'customer_core', createdAt: '', updatedAt: '' },
    ],
  };

  beforeEach(() => {
    mockedGetEffectiveIdentity.mockReturnValue('director');
    mockedListFields.mockResolvedValue(f109Fixture);
    mockedListOptions.mockResolvedValue({ options: [] });
  });

  async function openDropdown() {
    renderPage();
    await waitFor(() => expect(mockedListFields).toHaveBeenCalled());
    fireEvent.click(screen.getByTestId('btn-add-condition'));
    await waitFor(() => expect(screen.getByTestId('add-field-dropdown')).toBeInTheDocument());
    return screen.getByTestId('add-field-dropdown');
  }

  it('TS-F109-FE-004：dropdown 含「案件資料」「客戶資料」兩群組標題，各群組含對應欄位', async () => {
    const dropdown = await openDropdown();
    // 兩群組標題
    expect(within(dropdown).getByTestId('add-field-group-ob_pool_data')).toBeInTheDocument();
    expect(within(dropdown).getByTestId('add-field-group-customer_core')).toBeInTheDocument();
    expect(within(dropdown).getByText('案件資料')).toBeInTheDocument();
    expect(within(dropdown).getByText('客戶資料')).toBeInTheDocument();
    // 案件資料含 prod_kind；客戶資料含 gender + date_of_birth
    expect(within(dropdown).getByTestId('add-field-prod_kind')).toBeInTheDocument();
    expect(within(dropdown).getByTestId('add-field-gender')).toBeInTheDocument();
    expect(within(dropdown).getByTestId('add-field-date_of_birth')).toBeInTheDocument();
  });

  it('TS-F109-FE-004b：可跨群組選取並存（先加 prod_kind 再加 gender，兩條件列共存）', async () => {
    await openDropdown();
    fireEvent.click(screen.getByTestId('add-field-prod_kind'));
    await waitFor(() => expect(screen.getByTestId('condition-row-0')).toBeInTheDocument());
    // 重開 dropdown 加 gender（客戶資料群組）
    fireEvent.click(screen.getByTestId('btn-add-condition'));
    await waitFor(() => expect(screen.getByTestId('add-field-dropdown')).toBeInTheDocument());
    fireEvent.click(screen.getByTestId('add-field-gender'));
    await waitFor(() => expect(screen.getByTestId('condition-row-1')).toBeInTheDocument());
    // 兩條件列共存
    expect(screen.getByTestId('condition-row-0')).toBeInTheDocument();
    expect(screen.getByTestId('condition-row-1')).toBeInTheDocument();
  });

  it('TS-F109-FE-005：is_system_fixed（best_case）排除於可選池，與來源分組正交', async () => {
    const dropdown = await openDropdown();
    // best_case 為 ob_pool_data 但 isSystemFixed → 不出現在 dropdown
    expect(within(dropdown).queryByTestId('add-field-best_case')).toBeNull();
    // 案件資料群組仍存在（含 prod_kind），證明群組本身有但 best_case 被排除
    expect(within(dropdown).getByTestId('add-field-group-ob_pool_data')).toBeInTheDocument();
  });

  it('TS-F109-FE-006：年齡（date_of_birth numeric）→ 渲染 min/max 數值輸入（非多選）', async () => {
    await openDropdown();
    fireEvent.click(screen.getByTestId('add-field-date_of_birth'));
    await waitFor(() => expect(screen.getByTestId('condition-row-0')).toBeInTheDocument());
    expect(screen.getByTestId('input-numeric-min-0')).toBeInTheDocument();
    expect(screen.getByTestId('input-numeric-max-0')).toBeInTheDocument();
  });
});

// ============================================================
// F050 v2.4 / AD-E07-45（US-176）：草稿「預估命中筆數」真實抽樣估算
// ============================================================
describe('ListCreateDraftPage — 預估命中筆數（US-176 抽樣估算）', () => {
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
    mockedPreviewHitCount.mockResolvedValue({
      estimatedHitCount: 8500,
      isEstimate: true,
      sampleSize: 50000,
      totalCount: 1679489,
    });
  });

  afterEach(() => cleanup());

  // 新增一個完整 caseyear categorical 條件（勾第一個值 → 條件完整）
  async function addCompleteCaseyear() {
    fireEvent.click(screen.getByTestId('btn-add-condition'));
    await waitFor(() =>
      expect(screen.getByTestId('add-field-caseyear')).toBeInTheDocument(),
    );
    fireEvent.click(screen.getByTestId('add-field-caseyear'));
    await waitFor(() =>
      expect(screen.getByTestId('btn-open-values-0')).toBeInTheDocument(),
    );
    fireEvent.click(screen.getByTestId('btn-open-values-0'));
    await waitFor(() =>
      expect(screen.getByTestId('value-checkbox-0-0')).toBeInTheDocument(),
    );
    fireEvent.click(screen.getByTestId('value-checkbox-0-0'));
  }

  it('TS-F050-V01 + W03：呼叫 §6.3 API，面板顯示「約 N」估算標示（非本地假公式）', async () => {
    renderPage();
    await waitFor(() =>
      expect(screen.getByTestId('btn-add-condition')).toBeInTheDocument(),
    );
    await addCompleteCaseyear();

    await waitFor(() =>
      expect(screen.getByTestId('stage0-preview-banner')).toBeInTheDocument(),
    );
    // 數字來自 API（8,500），非 12500 遞減公式
    const countEl = screen.getByTestId('hit-estimate-count');
    expect(countEl.textContent).toContain('約');
    expect(countEl.textContent).toContain('8,500');
    // 呼叫 §6.3 端點，body 含 conditionPayload
    expect(mockedPreviewHitCount).toHaveBeenCalled();
    const arg = mockedPreviewHitCount.mock.calls[0][0];
    expect(arg.conditions).toEqual([
      { columnName: 'caseyear', fieldType: 'categorical', values: ['0'] },
    ]);
  });

  it('TS-F050-U01：新增第二值後面板更新為新估算值', async () => {
    mockedPreviewHitCount
      .mockResolvedValueOnce({
        estimatedHitCount: 8500,
        isEstimate: true,
        sampleSize: 50000,
        totalCount: 1679489,
      })
      .mockResolvedValue({
        estimatedHitCount: 12345,
        isEstimate: true,
        sampleSize: 50000,
        totalCount: 1679489,
      });
    renderPage();
    await waitFor(() =>
      expect(screen.getByTestId('btn-add-condition')).toBeInTheDocument(),
    );
    await addCompleteCaseyear();
    await waitFor(() =>
      expect(screen.getByTestId('hit-estimate-count').textContent).toContain('8,500'),
    );
    // 勾第二個值 → 條件改變 → 重新估算
    fireEvent.click(screen.getByTestId('value-checkbox-0-1'));
    await waitFor(() =>
      expect(screen.getByTestId('hit-estimate-count').textContent).toContain('12,345'),
    );
  });

  it('TS-F050-U03：debounce 期間連續多次編輯只觸發一次 API 呼叫', async () => {
    renderPage();
    await waitFor(() =>
      expect(screen.getByTestId('btn-add-condition')).toBeInTheDocument(),
    );
    fireEvent.click(screen.getByTestId('btn-add-condition'));
    await waitFor(() =>
      expect(screen.getByTestId('add-field-caseyear')).toBeInTheDocument(),
    );
    fireEvent.click(screen.getByTestId('add-field-caseyear'));
    await waitFor(() =>
      expect(screen.getByTestId('btn-open-values-0')).toBeInTheDocument(),
    );
    fireEvent.click(screen.getByTestId('btn-open-values-0'));
    await waitFor(() =>
      expect(screen.getByTestId('value-checkbox-0-0')).toBeInTheDocument(),
    );
    // 連續同步勾選 3 個值（皆在同一 debounce 窗內）
    fireEvent.click(screen.getByTestId('value-checkbox-0-0'));
    fireEvent.click(screen.getByTestId('value-checkbox-0-1'));
    fireEvent.click(screen.getByTestId('value-checkbox-0-2'));

    await waitFor(() =>
      expect(mockedPreviewHitCount).toHaveBeenCalledTimes(1),
    );
  });

  it('TS-F050-V02：估算失敗顯示「預估暫時無法取得」，不顯示 0 或誤導數字', async () => {
    mockedPreviewHitCount.mockRejectedValue({ response: { status: 500 } });
    renderPage();
    await waitFor(() =>
      expect(screen.getByTestId('btn-add-condition')).toBeInTheDocument(),
    );
    await addCompleteCaseyear();

    await waitFor(() =>
      expect(screen.getByTestId('hit-estimate-error')).toBeInTheDocument(),
    );
    expect(screen.getByTestId('hit-estimate-error').textContent).toContain(
      '預估暫時無法取得',
    );
    // 不得顯示 0 / 任何具體數字
    expect(screen.queryByTestId('hit-estimate-count')).toBeNull();
    expect(screen.queryByTestId('stage0-preview-banner')).toBeNull();
  });

  it('TS-F050-V03：估算失敗不阻擋儲存', async () => {
    mockedPreviewHitCount.mockRejectedValue({ response: { status: 500 } });
    mockedCreateList.mockResolvedValue({ listNo: 'OB202605099' } as never);
    renderPage();
    await waitFor(() =>
      expect(screen.getByTestId('input-listNm')).toBeInTheDocument(),
    );
    fireEvent.change(screen.getByTestId('input-listNm'), {
      target: { value: '估算失敗仍可存' },
    });
    fireEvent.change(screen.getByTestId('input-listPeriodStart'), {
      target: { value: '1' },
    });
    fireEvent.change(screen.getByTestId('input-listPeriodEnd'), {
      target: { value: '6' },
    });
    fireEvent.change(screen.getByTestId('input-listInterval'), {
      target: { value: '1' },
    });
    await addCompleteCaseyear();
    await waitFor(() =>
      expect(screen.getByTestId('hit-estimate-error')).toBeInTheDocument(),
    );
    // 估算失敗態下仍可儲存
    fireEvent.click(screen.getByTestId('btn-save-draft'));
    await waitFor(() => expect(mockedCreateList).toHaveBeenCalledTimes(1));
  });

  it('TS-F050-V04：無使用者條件時不呼叫估算 API（不顯示估算面板）', async () => {
    renderPage();
    await waitFor(() =>
      expect(screen.getByTestId('btn-add-condition')).toBeInTheDocument(),
    );
    // 未新增任何條件
    await new Promise((r) => setTimeout(r, 350));
    expect(mockedPreviewHitCount).not.toHaveBeenCalled();
    expect(screen.queryByTestId('stage0-preview-banner')).toBeNull();
    expect(screen.queryByTestId('hit-estimate-loading')).toBeNull();
  });

  it('TS-F050-W01：ready 態保留「開啟 Stage 0 試算」連結（導向 F049）', async () => {
    renderPage();
    await waitFor(() =>
      expect(screen.getByTestId('btn-add-condition')).toBeInTheDocument(),
    );
    await addCompleteCaseyear();
    await waitFor(() =>
      expect(screen.getByTestId('stage0-preview-banner')).toBeInTheDocument(),
    );
    const link = within(
      screen.getByTestId('stage0-preview-banner'),
    ).getByText('開啟 Stage 0 試算');
    expect(link.getAttribute('href')).toBe('/assignment/estimate');
  });

  it('section_chief：隱藏估算區（不呼叫 §6.3，不顯示 403）', async () => {
    mockedGetBusinessRole.mockReturnValue('section_chief');
    mockedGetEffectiveIdentity.mockReturnValue('section_chief');
    renderPage();
    await waitFor(() =>
      expect(screen.getByTestId('btn-add-condition')).toBeInTheDocument(),
    );
    await addCompleteCaseyear();
    // 等待可能的 debounce 窗
    await new Promise((r) => setTimeout(r, 350));
    expect(mockedPreviewHitCount).not.toHaveBeenCalled();
    expect(screen.queryByTestId('stage0-preview-banner')).toBeNull();
    expect(screen.queryByTestId('hit-estimate-loading')).toBeNull();
    expect(screen.queryByTestId('hit-estimate-error')).toBeNull();
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 值選擇器批次操作（全選 / 清除 / 完成）— 對齊 prototype 27a L895-921
//   全選＝僅啟用值 ∪ 已選停用值（非破壞性聯集，不掉既有停用選擇）
//   清除＝清空（含停用），面板保持開啟
//   完成＝關閉面板、不改動已選值
//   多選＝面板跨多次切換持續開啟
// ═══════════════════════════════════════════════════════════════════════════
describe('ListCreateDraftPage — 值選擇器批次操作（全選 / 清除 / 完成）', () => {
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

  // 新增 categorical 條件（idx 0）並開啟值清單，等待指定 checkbox 出現
  async function addCatAndOpen(addFieldTestId: string, waitCheckbox: string) {
    fireEvent.click(screen.getByTestId('btn-add-condition'));
    await waitFor(() =>
      expect(screen.getByTestId(addFieldTestId)).toBeInTheDocument(),
    );
    fireEvent.click(screen.getByTestId(addFieldTestId));
    await waitFor(() =>
      expect(screen.getByTestId('btn-open-values-0')).toBeInTheDocument(),
    );
    fireEvent.click(screen.getByTestId('btn-open-values-0'));
    await waitFor(() =>
      expect(screen.getByTestId(waitCheckbox)).toBeInTheDocument(),
    );
  }

  it('全選：僅套用啟用值並聯集保留已選的停用值（不移除既有停用選擇）', async () => {
    renderPage();
    await waitFor(() =>
      expect(screen.getByTestId('btn-add-condition')).toBeInTheDocument(),
    );
    // prod_kind：'01' 停用、'02'/'03' 啟用
    await addCatAndOpen('add-field-prod_kind', 'value-checkbox-0-01');
    // 先勾選停用值 '01'
    fireEvent.click(screen.getByTestId('value-checkbox-0-01'));
    expect(screen.getByTestId('value-checkbox-0-01')).toBeChecked();

    // 點全選 → 納入啟用 '02'/'03'，並保留已選停用 '01'
    fireEvent.click(screen.getByTestId('value-select-all-prod_kind'));
    await waitFor(() =>
      expect(screen.getByTestId('value-checkbox-0-02')).toBeChecked(),
    );
    expect(screen.getByTestId('value-checkbox-0-03')).toBeChecked();
    expect(screen.getByTestId('value-checkbox-0-01')).toBeChecked(); // 停用值未被移除
    expect(screen.getByTestId('value-selected-count-prod_kind')).toHaveTextContent(
      '3',
    );
  });

  it('清除：清空所有已選值（含停用），面板保持開啟', async () => {
    renderPage();
    await waitFor(() =>
      expect(screen.getByTestId('btn-add-condition')).toBeInTheDocument(),
    );
    await addCatAndOpen('add-field-caseyear', 'value-checkbox-0-0');
    fireEvent.click(screen.getByTestId('value-checkbox-0-0'));
    fireEvent.click(screen.getByTestId('value-checkbox-0-1'));
    expect(
      screen.getByTestId('value-selected-count-caseyear'),
    ).toHaveTextContent('2');

    fireEvent.click(screen.getByTestId('value-clear-caseyear'));
    await waitFor(() =>
      expect(
        screen.getByTestId('value-selected-count-caseyear'),
      ).toHaveTextContent('0'),
    );
    expect(screen.getByTestId('value-checkbox-0-0')).not.toBeChecked();
    expect(screen.getByTestId('value-checkbox-0-1')).not.toBeChecked();
    // 面板保持開啟
    expect(screen.getByTestId('value-dropdown-caseyear')).toBeInTheDocument();
  });

  it('完成：關閉面板且不改動已選值', async () => {
    renderPage();
    await waitFor(() =>
      expect(screen.getByTestId('btn-add-condition')).toBeInTheDocument(),
    );
    await addCatAndOpen('add-field-caseyear', 'value-checkbox-0-0');
    fireEvent.click(screen.getByTestId('value-checkbox-0-0'));
    expect(screen.getByTestId('value-dropdown-caseyear')).toBeInTheDocument();

    // 完成 → 關閉面板
    fireEvent.click(screen.getByTestId('value-done-caseyear'));
    await waitFor(() =>
      expect(screen.queryByTestId('value-dropdown-caseyear')).toBeNull(),
    );
    // 值未被改動：chip 仍在
    expect(screen.getByTestId('value-chip-0-0')).toBeInTheDocument();
    // 重新開啟後 checkbox 仍勾選（證明未清空）
    fireEvent.click(screen.getByTestId('btn-open-values-0'));
    await waitFor(() =>
      expect(screen.getByTestId('value-checkbox-0-0')).toBeInTheDocument(),
    );
    expect(screen.getByTestId('value-checkbox-0-0')).toBeChecked();
  });

  it('多選：連續切換多個值面板持續開啟（不因重繪關閉）', async () => {
    renderPage();
    await waitFor(() =>
      expect(screen.getByTestId('btn-add-condition')).toBeInTheDocument(),
    );
    await addCatAndOpen('add-field-caseyear', 'value-checkbox-0-0');
    fireEvent.click(screen.getByTestId('value-checkbox-0-0'));
    expect(screen.getByTestId('value-dropdown-caseyear')).toBeInTheDocument();
    fireEvent.click(screen.getByTestId('value-checkbox-0-1'));
    expect(screen.getByTestId('value-dropdown-caseyear')).toBeInTheDocument();
    fireEvent.click(screen.getByTestId('value-checkbox-0-2'));
    expect(screen.getByTestId('value-dropdown-caseyear')).toBeInTheDocument();
    expect(
      screen.getByTestId('value-selected-count-caseyear'),
    ).toHaveTextContent('3');
  });

  it('全選在 0 個啟用值時 disabled', async () => {
    // 覆寫 prod_kind options 為全部停用 → activeCount === 0
    mockedListOptions.mockImplementation(async (col: string) => {
      if (col === 'prod_kind')
        return {
          options: [
            { columnName: 'prod_kind', optionValue: '01', optionLabel: '停用A', isActive: false, createdAt: '', updatedAt: '' },
            { columnName: 'prod_kind', optionValue: '02', optionLabel: '停用B', isActive: false, createdAt: '', updatedAt: '' },
          ],
        };
      return { options: [] };
    });
    renderPage();
    await waitFor(() =>
      expect(screen.getByTestId('btn-add-condition')).toBeInTheDocument(),
    );
    await addCatAndOpen('add-field-prod_kind', 'value-checkbox-0-01');
    expect(screen.getByTestId('value-select-all-prod_kind')).toBeDisabled();
  });

  it('清除在 0 個已選時 disabled；有選取後 enabled', async () => {
    renderPage();
    await waitFor(() =>
      expect(screen.getByTestId('btn-add-condition')).toBeInTheDocument(),
    );
    await addCatAndOpen('add-field-caseyear', 'value-checkbox-0-0');
    // 初始未選 → 清除 disabled、全選 enabled（8 啟用值）
    expect(screen.getByTestId('value-clear-caseyear')).toBeDisabled();
    expect(screen.getByTestId('value-select-all-caseyear')).not.toBeDisabled();
    // 勾一個 → 清除 enabled
    fireEvent.click(screen.getByTestId('value-checkbox-0-0'));
    expect(screen.getByTestId('value-clear-caseyear')).not.toBeDisabled();
  });

  it('系統固定 best_case 鎖定列不渲染值選擇器 / 全選 / 清除 / 完成', async () => {
    renderPage();
    await waitFor(() =>
      expect(screen.getByTestId('condition-row-best_case')).toBeInTheDocument(),
    );
    expect(screen.queryByTestId('value-dropdown-best_case')).toBeNull();
    expect(screen.queryByTestId('value-select-all-best_case')).toBeNull();
    expect(screen.queryByTestId('value-clear-best_case')).toBeNull();
    expect(screen.queryByTestId('value-done-best_case')).toBeNull();
  });
});

// TS-F050-W02：迴歸守門 — 靜態掃描確認假公式（12500 遞減）已移除
describe('ListCreateDraftPage — 假公式移除迴歸守門（TS-F050-W02）', () => {
  it('list-create-draft-page.tsx 不得殘留 12500 / 0.85 假公式', async () => {
    const fs = await import('fs');
    const path = await import('path');
    const src = fs.readFileSync(
      path.resolve(__dirname, '../list-create-draft-page.tsx'),
      'utf-8',
    );
    expect(src).not.toMatch(/12500/);
    expect(src).not.toMatch(/0\.85/);
  });
});
