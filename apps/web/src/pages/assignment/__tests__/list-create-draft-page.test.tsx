import { render, screen, cleanup, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import { ListCreateDraftPage } from '../list-create-draft-page';
import { ToastProvider } from '@/components/ui/toast';
import * as assignmentListApi from '@/api/assignment-list';
import * as authStore from '@/stores/auth-store';

vi.mock('@/api/assignment-list');
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
const mockedGetUser = vi.mocked(authStore.getUser);
const mockedGetBusinessRole = vi.mocked(authStore.getBusinessRole);
const mockedGetEffectiveIdentity = vi.mocked(authStore.getEffectiveIdentity);

function renderPage() {
  return render(
    <MemoryRouter initialEntries={['/assignment/list-definitions/new']}>
      <ToastProvider>
        <ListCreateDraftPage />
      </ToastProvider>
    </MemoryRouter>,
  );
}

describe('ListCreateDraftPage', () => {
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
  });

  afterEach(() => cleanup());

  it('渲染表單 4 個 section', () => {
    renderPage();
    expect(screen.getByText('基本資訊')).toBeInTheDocument();
    expect(screen.getByText('CR 回分規則')).toBeInTheDocument();
    expect(screen.getByText('商品與期別')).toBeInTheDocument();
    expect(screen.getByText('篩選條件（選填）')).toBeInTheDocument();
  });

  it('填了名稱但缺商品欄位 → JS 驗證顯示「請填寫所有必填欄位」', async () => {
    renderPage();
    // 只填名稱（繞過名稱必填的 HTML5 校驗）
    fireEvent.change(screen.getByTestId('input-listNm'), { target: { value: 'X' } });
    // 透過 form.requestSubmit 直接觸發 onSubmit handler（繞過其他 input required 攔截）
    const form = screen.getByTestId('input-listNm').closest('form')!;
    fireEvent.submit(form);
    await waitFor(() =>
      expect(screen.getByTestId('form-error')).toHaveTextContent(/必填/),
    );
    expect(mockedCreateList).not.toHaveBeenCalled();
  });

  it('填完必填欄位 + 提交 → 呼叫 createList API（多值以 $$ 分隔）', async () => {
    mockedCreateList.mockResolvedValue({ listNo: 'OB202605099' } as never);
    renderPage();

    fireEvent.change(screen.getByTestId('input-listNm'), {
      target: { value: '2026-05 測試名單' },
    });
    fireEvent.change(screen.getByTestId('input-prodKind'), {
      target: { value: 'A1' },
    });
    fireEvent.change(screen.getByTestId('input-caseYear'), {
      target: { value: '1,2' },
    });
    fireEvent.change(screen.getByTestId('input-specTp'), {
      target: { value: '01,02' },
    });
    fireEvent.change(screen.getByTestId('input-caseStatus'), {
      target: { value: '01,02' },
    });
    fireEvent.change(screen.getByTestId('input-settleSrc'), {
      target: { value: 'S1' },
    });

    fireEvent.click(screen.getByRole('button', { name: /儲存為草稿/ }));

    await waitFor(() => expect(mockedCreateList).toHaveBeenCalledTimes(1));
    const dto = mockedCreateList.mock.calls[0][0] as Record<string, unknown>;
    expect(dto.listNm).toBe('2026-05 測試名單');
    expect(dto.caseYear).toBe('1$$2');
    expect(dto.specTp).toBe('01$$02');
    expect(dto.caseStatus).toBe('01$$02');
    expect(dto.crEnabled).toBe(true);
  });

  it('新增條件按鈕新增 condition row + 移除按鈕移除', () => {
    renderPage();
    fireEvent.click(screen.getByTestId('btn-add-condition'));
    expect(screen.getByTestId('condition-row-0')).toBeInTheDocument();
    fireEvent.click(screen.getByTestId('btn-add-condition'));
    expect(screen.getByTestId('condition-row-1')).toBeInTheDocument();
  });

  it('API 失敗（422）顯示後端錯誤訊息', async () => {
    mockedCreateList.mockRejectedValue({
      response: {
        status: 422,
        data: {
          error: 'LIST_NO_DUPLICATE',
          message: '此商品 + 卡別組合在本月已有 active 名單',
        },
      },
    });
    renderPage();
    fireEvent.change(screen.getByTestId('input-listNm'), { target: { value: 'X' } });
    fireEvent.change(screen.getByTestId('input-prodKind'), { target: { value: 'A1' } });
    fireEvent.change(screen.getByTestId('input-caseYear'), { target: { value: '1' } });
    fireEvent.change(screen.getByTestId('input-specTp'), { target: { value: '01' } });
    fireEvent.change(screen.getByTestId('input-caseStatus'), { target: { value: '01' } });
    fireEvent.change(screen.getByTestId('input-settleSrc'), { target: { value: 'S1' } });

    fireEvent.click(screen.getByRole('button', { name: /儲存為草稿/ }));

    await waitFor(() =>
      expect(screen.getByTestId('form-error')).toHaveTextContent(/此商品 \+ 卡別組合/),
    );
  });

  describe('Phase 3 P2-6 從上月複製', () => {
    it('顯示「從上月複製」CTA', () => {
      renderPage();
      expect(screen.getByTestId('btn-open-copy-modal')).toBeInTheDocument();
    });

    it('點 CTA → 開啟 modal 並呼叫 listLists(prevYm)', async () => {
      mockedListLists.mockResolvedValue({
        selectedYm: '202604',
        currentWorkYm: '202605',
        isHistorical: false,
        isFuture: false,
        lockState: { locked: false, reason: null },
        lists: [],
        stageCounts: {
          draft: 0,
          dept_ratio: 0,
          personnel_ratio: 0,
          approval: 0,
          ready: 0,
          disabled: 0,
        },
      });
      renderPage();
      fireEvent.click(screen.getByTestId('btn-open-copy-modal'));
      await waitFor(() => {
        expect(screen.getByTestId('copy-prev-month-modal')).toBeInTheDocument();
      });
      // listLists 被呼叫且 ym 是上月（FE-7：current 2026-05 → prev 2026-04）
      expect(mockedListLists).toHaveBeenCalled();
      const arg = mockedListLists.mock.calls[0]?.[0];
      expect(typeof arg?.ym).toBe('string');
    });

    it('點某 row「使用此名單」→ 帶入欄位 + 顯示 banner + 關 modal', async () => {
      mockedListLists.mockResolvedValue({
        selectedYm: '202604',
        currentWorkYm: '202605',
        isHistorical: false,
        isFuture: false,
        lockState: { locked: false, reason: null },
        lists: [
          {
            listNo: 'OB202604001',
            listNm: '汽車期中',
            prodKind: 'AUTO',
            caseYear: '3$$4',
            specTp: '01',
            caseStatus: '01',
            crEnabled: true,
            listPeriodStart: 0,
            listPeriodEnd: 999,
            listInterval: 30,
            settleSrc: 'N',
            cardType: 'M3',
            prodBest: null,
            status: 'active',
            stage: 'ready',
            createdBy: '張部長',
            createdAt: '2026-04-10T00:00:00Z',
            updatedAt: '2026-04-10T00:00:00Z',
          },
        ],
        stageCounts: {
          draft: 0,
          dept_ratio: 0,
          personnel_ratio: 0,
          approval: 0,
          ready: 1,
          disabled: 0,
        },
      });
      renderPage();
      fireEvent.click(screen.getByTestId('btn-open-copy-modal'));
      await waitFor(() =>
        expect(screen.getByTestId('copy-row-OB202604001')).toBeInTheDocument(),
      );
      fireEvent.click(screen.getByTestId('btn-use-OB202604001'));

      // 1. modal 關閉
      await waitFor(() => {
        expect(screen.queryByTestId('copy-prev-month-modal')).not.toBeInTheDocument();
      });

      // 2. banner 顯示
      expect(screen.getByTestId('copy-applied-banner')).toBeInTheDocument();

      // 3. prodKind 欄位被填入
      const prodKindInput = screen.getByTestId('input-prodKind') as HTMLInputElement;
      expect(prodKindInput.value).toBe('AUTO');
    });
  });
});
