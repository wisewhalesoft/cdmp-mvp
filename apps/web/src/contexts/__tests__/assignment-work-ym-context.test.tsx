import { render, screen, cleanup, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  AssignmentWorkYmProvider,
  useAssignmentWorkYm,
  addOneMonth,
} from '../assignment-work-ym-context';
import * as listApi from '@/api/assignment-list';

/**
 * F097 / US-137 — AssignmentWorkYmContext 測試（TS-F097-CTX-001~006）
 */

vi.mock('@/api/assignment-list');

const mockedGetCurrentWorkYm = vi.mocked(listApi.getCurrentWorkYm);

/** Consumer：暴露 context 值與 setter 供斷言 */
function Consumer({ id = 'c' }: { id?: string }) {
  const { currentWorkYm, targetWorkYm, setTargetWorkYm } = useAssignmentWorkYm();
  return (
    <div>
      <span data-testid={`${id}-current`}>{currentWorkYm}</span>
      <span data-testid={`${id}-target`}>{targetWorkYm}</span>
      <button
        type="button"
        data-testid={`${id}-set-202607`}
        onClick={() => setTargetWorkYm('202607')}
      >
        set
      </button>
      <span data-testid={`${id}-setter-type`}>{typeof setTargetWorkYm}</span>
    </div>
  );
}

function renderWithProvider(ui: React.ReactNode) {
  return render(<AssignmentWorkYmProvider>{ui}</AssignmentWorkYmProvider>);
}

describe('AssignmentWorkYmContext (F097)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockedGetCurrentWorkYm.mockResolvedValue({ currentWorkYm: '202605' });
  });
  afterEach(() => cleanup());

  // addOneMonth 純函式
  it('addOneMonth：一般月 / 跨年', () => {
    expect(addOneMonth('202605')).toBe('202606');
    expect(addOneMonth('202512')).toBe('202601');
  });

  // TS-F097-CTX-001：預設 targetWorkYm = currentWorkYm + 1
  it('TS-F097-CTX-001：預設 targetWorkYm = currentWorkYm + 1（202605 → 202606）', async () => {
    renderWithProvider(<Consumer />);
    await waitFor(() => expect(screen.getByTestId('c-current').textContent).toBe('202605'));
    expect(screen.getByTestId('c-target').textContent).toBe('202606');
  });

  // TS-F097-CTX-002：跨年邊界
  it('TS-F097-CTX-002：currentWorkYm=202512 → targetWorkYm=202601（非 202513）', async () => {
    mockedGetCurrentWorkYm.mockResolvedValue({ currentWorkYm: '202512' });
    renderWithProvider(<Consumer />);
    await waitFor(() => expect(screen.getByTestId('c-target').textContent).toBe('202601'));
  });

  // TS-F097-CTX-003：一處切換四頁同步
  it('TS-F097-CTX-003：一處 setTargetWorkYm → 多 consumer 同步', async () => {
    renderWithProvider(
      <>
        <Consumer id="a" />
        <Consumer id="b" />
        <Consumer id="c" />
        <Consumer id="d" />
      </>,
    );
    await waitFor(() => expect(screen.getByTestId('a-target').textContent).toBe('202606'));
    // 於 a 頁切換
    fireEvent.click(screen.getByTestId('a-set-202607'));
    await waitFor(() => expect(screen.getByTestId('a-target').textContent).toBe('202607'));
    expect(screen.getByTestId('b-target').textContent).toBe('202607');
    expect(screen.getByTestId('c-target').textContent).toBe('202607');
    expect(screen.getByTestId('d-target').textContent).toBe('202607');
  });

  // TS-F097-CTX-005：context 值可讀 + setter 為函式
  it('TS-F097-CTX-005：currentWorkYm / targetWorkYm / setTargetWorkYm 均可用', async () => {
    renderWithProvider(<Consumer />);
    await waitFor(() => expect(screen.getByTestId('c-current').textContent).toBe('202605'));
    expect(screen.getByTestId('c-target').textContent).toBe('202606');
    expect(screen.getByTestId('c-setter-type').textContent).toBe('function');
    fireEvent.click(screen.getByTestId('c-set-202607'));
    await waitFor(() => expect(screen.getByTestId('c-target').textContent).toBe('202607'));
  });

  // useAssignmentWorkYm 在 Provider 外使用 → throw
  it('useAssignmentWorkYm 在 Provider 外 → throw', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    expect(() => render(<Consumer />)).toThrow();
    spy.mockRestore();
  });
});
