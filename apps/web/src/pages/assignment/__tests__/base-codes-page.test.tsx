/**
 * F068：BaseCodesPage 基礎煙霧測試
 *
 * 測試重點限定在前端渲染邏輯（不重複 backend 驗證的 API 行為）：
 *   - 3 個 Tabs 正確顯示與切換
 *   - CASE_STATUS Tab 顯示業務語意對照 banner，其他 Tab 不顯示
 *   - listAssignmentCodes 在初始化時被各 tab 呼叫一次
 */

import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { BrowserRouter } from 'react-router-dom';
import { BaseCodesPage } from '../base-codes-page';
import * as api from '@/api/assignment-codes';
import * as authStore from '@/stores/auth-store';

vi.mock('@/api/assignment-codes', async () => {
  const actual = await vi.importActual<typeof api>('@/api/assignment-codes');
  return {
    ...actual,
    listAssignmentCodes: vi.fn(),
    createAssignmentCode: vi.fn(),
    updateAssignmentCode: vi.fn(),
    disableAssignmentCode: vi.fn(),
  };
});
vi.mock('@/api/auth', () => ({ logout: vi.fn().mockResolvedValue({}) }));
vi.mock('@/stores/auth-store');

const mockedList = vi.mocked(api.listAssignmentCodes);
const mockedGetUser = vi.mocked(authStore.getUser);
const mockedClearAuth = vi.mocked(authStore.clearAuth);

function wrap(node: React.ReactElement) {
  return <BrowserRouter>{node}</BrowserRouter>;
}

beforeEach(() => {
  vi.clearAllMocks();
  mockedGetUser.mockReturnValue({
    id: 'sm-id',
    name: 'Sales Manager',
    email: 'sm@cdmp.test',
    role: 'user',
    isSalesManager: true,
  } as any);
  mockedClearAuth.mockImplementation(() => {});
  mockedList.mockResolvedValue({ tblId: 'PROD_KIND' as any, data: [] });
});

describe('F068: BaseCodesPage 渲染煙霧測試', () => {
  it('渲染 3 個 Tabs', async () => {
    render(wrap(<BaseCodesPage />));
    // PROD_KIND 等字串會在多處出現（tab / scope 提示 / current tbl_id display），
    // 用 getAllByText 後檢查最少 1 個出現即可
    await waitFor(() => {
      expect(screen.getAllByText('PROD_KIND').length).toBeGreaterThan(0);
      expect(screen.getAllByText('SPEC_TP').length).toBeGreaterThan(0);
      expect(screen.getAllByText('CASE_STATUS').length).toBeGreaterThan(0);
    });
  });

  it('初始化時對 3 個 tbl_id 各呼叫 listAssignmentCodes 1 次', async () => {
    render(wrap(<BaseCodesPage />));
    await waitFor(() => {
      expect(mockedList).toHaveBeenCalledWith('PROD_KIND', true);
      expect(mockedList).toHaveBeenCalledWith('SPEC_TP', true);
      expect(mockedList).toHaveBeenCalledWith('CASE_STATUS', true);
    });
    expect(mockedList).toHaveBeenCalledTimes(3);
  });

  it('CASE_STATUS Tab 顯示業務語意對照 banner，其他 Tab 不顯示', async () => {
    render(wrap(<BaseCodesPage />));
    await waitFor(() => {
      expect(mockedList).toHaveBeenCalled();
    });
    expect(screen.queryByText(/4 個代碼業務語意對照/)).not.toBeInTheDocument();

    // 切換到 CASE_STATUS — 用 button role 精確指定 Tab 按鈕
    const caseStatusTab = screen.getAllByText('CASE_STATUS').find(
      (el) => el.closest('button') !== null,
    );
    expect(caseStatusTab).toBeDefined();
    fireEvent.click(caseStatusTab!.closest('button')!);
    await waitFor(() => {
      expect(screen.getByText(/4 個代碼業務語意對照/)).toBeInTheDocument();
    });
  });

  // ============================================================================
  // F075 v1.4.1：進階維護區塊（對齊 prototype 37-base-code.html L186-243）
  // F075 / F076 入口卡片從 sidebar 移出，改放代碼維護頁的「進階維護」區塊
  // ============================================================================
  describe('F075 v1.4.1：進階維護區塊（M06 入口卡片）', () => {
    it('「進階維護」區塊存在（advanced-maintenance-section testid）', async () => {
      render(wrap(<BaseCodesPage />));
      await waitFor(() => {
        expect(mockedList).toHaveBeenCalled();
      });
      expect(screen.getByTestId('advanced-maintenance-section')).toBeInTheDocument();
      expect(screen.getByText('進階維護')).toBeInTheDocument();
    });

    it('F075 卡片存在（card-pooldata-whitelist），標題為「篩選欄位管理」', async () => {
      render(wrap(<BaseCodesPage />));
      await waitFor(() => {
        expect(mockedList).toHaveBeenCalled();
      });
      const card = screen.getByTestId('card-pooldata-whitelist');
      expect(card).toBeInTheDocument();
      expect(card.textContent).toContain('篩選欄位管理');
    });

    it('F076 卡片存在（card-categorical-field-values），標題為「類別型欄位可選值」', async () => {
      render(wrap(<BaseCodesPage />));
      await waitFor(() => {
        expect(mockedList).toHaveBeenCalled();
      });
      const card = screen.getByTestId('card-categorical-field-values');
      expect(card).toBeInTheDocument();
      expect(card.textContent).toContain('類別型欄位可選值');
    });

    it('點擊 F075 卡片導向 /assignment/whitelist', async () => {
      render(wrap(<BaseCodesPage />));
      await waitFor(() => {
        expect(mockedList).toHaveBeenCalled();
      });
      const card = screen.getByTestId('card-pooldata-whitelist');
      // 期望卡片為 <a href="/assignment/whitelist"> 或 button onclick navigate
      // 採彈性 assertion：anchor 走 href、button 走 data-href / 不便測時改檢 closest('a').getAttribute('href')
      const anchor = card.closest('a') ?? card.querySelector('a') ?? card;
      const href =
        (anchor as HTMLElement).getAttribute('href') ??
        (anchor as HTMLElement).getAttribute('data-href');
      expect(href).toBe('/assignment/whitelist');
    });

    it('點擊 F076 卡片導向 /assignment/whitelist/options', async () => {
      render(wrap(<BaseCodesPage />));
      await waitFor(() => {
        expect(mockedList).toHaveBeenCalled();
      });
      const card = screen.getByTestId('card-categorical-field-values');
      const anchor = card.closest('a') ?? card.querySelector('a') ?? card;
      const href =
        (anchor as HTMLElement).getAttribute('href') ??
        (anchor as HTMLElement).getAttribute('data-href');
      expect(href).toBe('/assignment/whitelist/options');
    });
  });

  it('點擊「新增代碼」開啟 Modal', async () => {
    render(wrap(<BaseCodesPage />));
    await waitFor(() => {
      expect(mockedList).toHaveBeenCalled();
    });
    fireEvent.click(screen.getByText('新增代碼'));
    await waitFor(() => {
      // h3 標題為「新增代碼」
      expect(
        screen.getAllByText('新增代碼').some((el) => el.tagName === 'H3'),
      ).toBe(true);
    });
    // Modal 內 tbl_id input 應 disabled 且 value=PROD_KIND
    const tblIdInputs = screen.getAllByDisplayValue('PROD_KIND');
    expect(tblIdInputs.length).toBeGreaterThanOrEqual(1);
  });
});
