import { render, screen, cleanup, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { ListEditDraftPage } from '../list-edit-draft-page';
import { ToastProvider } from '@/components/ui/toast';
import * as assignmentListApi from '@/api/assignment-list';
import * as authStore from '@/stores/auth-store';
import type { AssignmentListItem, ListListsResponse } from '@/api/assignment-list';

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

const mockedListLists = vi.mocked(assignmentListApi.listLists);
const mockedUpdateList = vi.mocked(assignmentListApi.updateList);
const mockedGetUser = vi.mocked(authStore.getUser);
const mockedGetBusinessRole = vi.mocked(authStore.getBusinessRole);
const mockedGetEffectiveIdentity = vi.mocked(authStore.getEffectiveIdentity);

const draftList: AssignmentListItem = {
  listNo: 'OB202605001',
  listNm: '測試名單',
  prodKind: 'A1',
  caseYear: '1$$2',
  specTp: '01$$02',
  listPeriodStart: 0,
  listPeriodEnd: 999,
  listInterval: 30,
  settleSrc: 'S1',
  cardType: 'M3',
  prodBest: null,
  status: 'active',
  stage: 'draft',
  createdBy: 'Director',
  createdAt: '2026-05-02T00:00:00.000Z',
  updatedAt: '2026-05-02T00:00:00.000Z',
};

const mockResponse: ListListsResponse = {
  selectedYm: '202605',
  currentWorkYm: '202605',
  isHistorical: false,
  isFuture: false,
  lockState: { locked: false, reason: null },
  lists: [draftList],
  stageCounts: { draft: 1, dept_ratio: 0, personnel_ratio: 0, approval: 0, ready: 0, disabled: 0 },
};

function renderPage(listNo = 'OB202605001') {
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

describe('ListEditDraftPage', () => {
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

  it('draft 階段 → 預填表單欄位且可編輯', async () => {
    mockedListLists.mockResolvedValue(mockResponse);
    renderPage();

    await waitFor(() =>
      expect(screen.getByTestId('input-listNm')).toHaveValue('測試名單'),
    );
    expect(screen.getByTestId('input-prodKind')).toHaveValue('A1');
    expect(screen.getByTestId('input-caseYear')).toHaveValue('1,2');
    expect(screen.getByTestId('input-specTp')).toHaveValue('01,02');
    expect(screen.queryByTestId('readonly-notice')).toBeNull();
  });

  it('非 draft 階段 → 顯示唯讀通知 + RejectBanner + 表單欄位 disabled', async () => {
    mockedListLists.mockResolvedValue({
      ...mockResponse,
      lists: [{ ...draftList, stage: 'dept_ratio' }],
    });
    renderPage();

    await waitFor(() => expect(screen.getByTestId('readonly-notice')).toBeInTheDocument());
    expect(screen.getByTestId('reject-banner')).toBeInTheDocument();
    expect(screen.getByTestId('input-listNm')).toBeDisabled();
  });

  it('list 找不到 → 顯示錯誤訊息', async () => {
    mockedListLists.mockResolvedValue({ ...mockResponse, lists: [] });
    renderPage('OB999999999');
    await waitFor(() =>
      expect(screen.getByTestId('form-error')).toHaveTextContent(/找不到名單/),
    );
  });

  it('提交時呼叫 updateList API（多值以 $$ 分隔）', async () => {
    mockedListLists.mockResolvedValue(mockResponse);
    mockedUpdateList.mockResolvedValue({} as never);
    renderPage();

    await waitFor(() =>
      expect(screen.getByTestId('input-listNm')).toHaveValue('測試名單'),
    );
    // caseStatus 未在 list response，需手動填入
    fireEvent.change(screen.getByTestId('input-caseStatus'), {
      target: { value: '01,02' },
    });

    fireEvent.click(screen.getByRole('button', { name: /儲存變更/ }));

    await waitFor(() => expect(mockedUpdateList).toHaveBeenCalledTimes(1));
    expect(mockedUpdateList.mock.calls[0][0]).toBe('OB202605001');
    const dto = mockedUpdateList.mock.calls[0][1] as Record<string, unknown>;
    expect(dto.caseYear).toBe('1$$2');
    expect(dto.caseStatus).toBe('01$$02');
  });
});
