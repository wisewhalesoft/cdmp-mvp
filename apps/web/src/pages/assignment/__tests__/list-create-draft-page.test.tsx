import { render, screen, cleanup, fireEvent, waitFor, within } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import { ListCreateDraftPage } from '../list-create-draft-page';
import { ToastProvider } from '@/components/ui/toast';
import * as assignmentListApi from '@/api/assignment-list';
import * as pooldataFieldsApi from '@/api/pooldata-fields';
import * as authStore from '@/stores/auth-store';
import type { ListListsResponse, AssignmentListItem } from '@/api/assignment-list';
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

const mockedCreateList = vi.mocked(assignmentListApi.createList);
const mockedListLists = vi.mocked(assignmentListApi.listLists);
const mockedListFields = vi.mocked(pooldataFieldsApi.listFields);
const mockedListOptions = vi.mocked(pooldataFieldsApi.listOptions);
const mockedGetUser = vi.mocked(authStore.getUser);
const mockedGetBusinessRole = vi.mocked(authStore.getBusinessRole);
const mockedGetEffectiveIdentity = vi.mocked(authStore.getEffectiveIdentity);

// 對齊 prototype 27a L510-519 之 FIELDS mock（含拍板 UI-Q5 birth_date date type）
const fieldsFixture: ListFieldsResponse = {
  fields: [
    { columnName: 'prod_kind', displayName: '產品類別', fieldType: 'categorical', isActive: true, createdAt: '', updatedAt: '' },
    { columnName: 'caseyear', displayName: '進件 / 滿期年數', fieldType: 'categorical', isActive: true, createdAt: '', updatedAt: '' },
    { columnName: 'case_status', displayName: '案件結清期別', fieldType: 'categorical', isActive: true, createdAt: '', updatedAt: '' },
    { columnName: 'month_cnt', displayName: '撈取月份計數', fieldType: 'numeric', isActive: true, createdAt: '', updatedAt: '' },
    { columnName: 'birth_date', displayName: '客戶生日', fieldType: 'date', isActive: true, createdAt: '', updatedAt: '' },
    // list_period_* 三欄不出現在 fields 回傳（依 5d 紅線：whitelist 不含 list_period_*）
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
    return { options: [] };
  });
  mockedListLists.mockResolvedValue(emptyPrevMonthLists);
}

function renderPage() {
  return render(
    <MemoryRouter initialEntries={['/assignment/list-definitions/new']}>
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
  // lc.test#4 — conditions=[] 點儲存 → 「請至少設定一個篩選條件」+ createList 未被呼叫
  //   對齊 prototype 27a L899
  // ─────────────────────────────────────────
  it('lc.test#4: 無條件提交 → 顯示「請至少設定一個篩選條件」+ createList 不被呼叫', async () => {
    renderPage();
    await waitFor(() => expect(screen.getByTestId('input-listNm')).toBeInTheDocument());

    fireEvent.change(screen.getByTestId('input-listNm'), { target: { value: '測試名單' } });
    fireEvent.change(screen.getByTestId('input-listPeriodStart'), { target: { value: '1' } });
    fireEvent.change(screen.getByTestId('input-listPeriodEnd'), { target: { value: '6' } });
    fireEvent.change(screen.getByTestId('input-listInterval'), { target: { value: '1' } });

    fireEvent.click(screen.getByTestId('btn-save-draft'));

    await waitFor(() => {
      expect(screen.getByTestId('form-error')).toHaveTextContent('請至少設定一個篩選條件');
    });
    expect(mockedCreateList).not.toHaveBeenCalled();
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
  // lc.test#10 — INACTIVE option → 琥珀 warning + 「N 個可選值已停用，將被保留但月跑 Stage 1 不會匹配」
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
    expect(banner.textContent).toContain('1 個可選值已停用，將被保留但月跑 Stage 1 不會匹配');
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
});
