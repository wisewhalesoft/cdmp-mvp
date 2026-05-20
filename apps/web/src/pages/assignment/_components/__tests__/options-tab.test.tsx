/**
 * F050 v2.1 Phase 5d 波 5：OptionsTab（移植 field-options-page main）
 *
 * 對應 prototype: /prototypes/37-base-code.html line 242-323 Tab 2
 *
 * 涵蓋：
 *   - toolbar（搜尋 / 顯示已停用值 / 統計 / 全部展開，prototype L278-291）
 *   - 自動載入所有 categorical 欄位 → Promise.all listOptions
 *   - F076 v1.5 商業規則 footer（含「caseyear / case_status / prod_kind / spec_tp / settle_src
 *     之可選值統一在此管理（取代 F068 ob_code_df）」prototype L317）
 *   - ?col=XX 自動展開該 accordion（既有 deep link，v1.4.5 行為保留）
 */
import { render, screen, cleanup, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { OptionsTab } from '../options-tab';
import { ToastProvider } from '@/components/ui/toast';
import * as poolApi from '@/api/pooldata-fields';
import * as authStore from '@/stores/auth-store';

vi.mock('@/api/pooldata-fields');
vi.mock('@/stores/auth-store');

const mockedListFields = vi.mocked(poolApi.listFields);
const mockedListOptions = vi.mocked(poolApi.listOptions);

function renderAt(path = '/assignment/field-base?tab=options') {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <ToastProvider>
        <Routes>
          <Route path="/assignment/field-base" element={<OptionsTab />} />
        </Routes>
      </ToastProvider>
    </MemoryRouter>,
  );
}

describe('OptionsTab — Phase 5d 波 5', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(authStore.getEffectiveIdentity).mockReturnValue('director');
    mockedListFields.mockResolvedValue({
      fields: [
        {
          columnName: 'prod_kind',
          displayName: '產品類別',
          fieldType: 'categorical',
          isActive: true,
          createdAt: '2026-05-01T00:00:00Z',
          updatedAt: '2026-05-01T00:00:00Z',
        },
        {
          columnName: 'caseyear',
          displayName: '進件 / 滿期年數',
          fieldType: 'categorical',
          isActive: true,
          createdAt: '2026-05-01T00:00:00Z',
          updatedAt: '2026-05-01T00:00:00Z',
        },
      ],
    });
    mockedListOptions.mockResolvedValue({ options: [] });
  });
  afterEach(() => cleanup());

  it('options-tab-1：mount 時呼叫 listFields({active: true}) 過濾 categorical', async () => {
    renderAt();
    await waitFor(() => {
      expect(mockedListFields).toHaveBeenCalledWith({ active: 'true' });
    });
  });

  it('options-tab-2：對每個 categorical 欄位呼叫 listOptions', async () => {
    renderAt();
    await waitFor(() => {
      expect(mockedListOptions).toHaveBeenCalledWith('prod_kind', expect.any(Object));
      expect(mockedListOptions).toHaveBeenCalledWith('caseyear', expect.any(Object));
    });
  });

  it('options-tab-3：toolbar 含搜尋 / 顯示已停用 / 統計 / 全部展開', async () => {
    renderAt();
    await waitFor(() => expect(mockedListFields).toHaveBeenCalled());
    expect(screen.getByTestId('field-options-toolbar')).toBeInTheDocument();
    expect(screen.getByTestId('toggle-include-inactive')).toBeInTheDocument();
    expect(screen.getByTestId('option-stats')).toBeInTheDocument();
    expect(screen.getByTestId('btn-expand-all')).toBeInTheDocument();
  });

  it('options-tab-4：F076 v1.5 商業規則 footer 含「caseyear / case_status / prod_kind / spec_tp / settle_src 統一在此管理」文字', async () => {
    renderAt();
    await waitFor(() => expect(mockedListFields).toHaveBeenCalled());
    const footer = screen.getByTestId('field-options-rules-footer');
    expect(footer).toHaveTextContent('F076');
    expect(footer).toHaveTextContent('BR-1');
    expect(footer).toHaveTextContent('BR-3');
    // BR-4 文字 prototype 同樣稱呼為「停用不回溯」
    expect(footer.textContent).toMatch(/不回溯/);
    // prototype L317 v1.5 新增：caseyear / case_status / prod_kind / spec_tp / settle_src 統一管理
    expect(footer).toHaveTextContent('caseyear');
    expect(footer).toHaveTextContent('case_status');
    expect(footer).toHaveTextContent('prod_kind');
    expect(footer).toHaveTextContent('spec_tp');
    expect(footer).toHaveTextContent('settle_src');
    expect(footer.textContent).toMatch(/取代\s*F068|F068.*ob_code_df/);
  });
});
