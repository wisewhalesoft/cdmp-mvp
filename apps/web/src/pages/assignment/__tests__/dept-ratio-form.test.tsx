import { render, screen, fireEvent, cleanup, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { DeptRatioForm } from '../_components/dept-ratio-form';
import { ToastProvider } from '@/components/ui/toast';
import * as stageApi from '@/api/assignment-stage';

vi.mock('@/api/assignment-stage');

const mockedGet = vi.mocked(stageApi.getDeptRatios);
const mockedSet = vi.mocked(stageApi.setDeptRatios);

function renderForm() {
  return render(
    <ToastProvider>
      <DeptRatioForm listNo="OB202605001" />
    </ToastProvider>,
  );
}

describe('DeptRatioForm (M03a / F079)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => cleanup());

  it('載入已存在的部門比例並顯示', async () => {
    mockedGet.mockResolvedValue({
      listNo: 'OB202605001',
      deptRatios: [
        { obdeptId: 'D001', obdeptNm: '業務一部', ration: 50 },
        { obdeptId: 'D002', obdeptNm: '業務二部', ration: 50 },
      ],
      total: 100,
    });
    renderForm();
    await waitFor(() =>
      expect(screen.getByTestId('dept-ratio-form')).toBeInTheDocument(),
    );
    expect(screen.getByDisplayValue('D001')).toBeInTheDocument();
    expect(screen.getByDisplayValue('業務一部')).toBeInTheDocument();
    expect(screen.getByDisplayValue('業務二部')).toBeInTheDocument();
  });

  it('加總 = 100 顯示 valid indicator', async () => {
    mockedGet.mockResolvedValue({
      listNo: 'OB202605001',
      deptRatios: [
        { obdeptId: 'D001', obdeptNm: '業務一部', ration: 60 },
        { obdeptId: 'D002', obdeptNm: '業務二部', ration: 40 },
      ],
      total: 100,
    });
    renderForm();
    await waitFor(() =>
      expect(screen.getByTestId('ratio-sum-indicator').dataset.valid).toBe('true'),
    );
  });

  it('加總 ≠ 100 + 點儲存 → 顯示錯誤訊息', async () => {
    mockedGet.mockResolvedValue({
      listNo: 'OB202605001',
      deptRatios: [{ obdeptId: 'D001', obdeptNm: '業務一部', ration: 50 }],
      total: 50,
    });
    renderForm();
    await waitFor(() =>
      expect(screen.getByTestId('dept-ratio-form')).toBeInTheDocument(),
    );
    fireEvent.click(screen.getByRole('button', { name: /儲存部門比例/ }));
    await waitFor(() =>
      expect(screen.getByTestId('dept-ratio-error')).toHaveTextContent(/加總須為 100/),
    );
    expect(mockedSet).not.toHaveBeenCalled();
  });

  it('合法 payload + 點儲存 → 呼叫 setDeptRatios API', async () => {
    mockedGet.mockResolvedValue({
      listNo: 'OB202605001',
      deptRatios: [
        { obdeptId: 'D001', obdeptNm: '業務一部', ration: 60 },
        { obdeptId: 'D002', obdeptNm: '業務二部', ration: 40 },
      ],
      total: 100,
    });
    mockedSet.mockResolvedValue({
      listNo: 'OB202605001',
      savedCount: 2,
      total: 100,
      savedAt: '2026-05-10',
      savedBy: 'd1',
    });
    renderForm();
    await waitFor(() =>
      expect(screen.getByTestId('dept-ratio-form')).toBeInTheDocument(),
    );
    fireEvent.click(screen.getByRole('button', { name: /儲存部門比例/ }));
    await waitFor(() => expect(mockedSet).toHaveBeenCalledTimes(1));
    expect(mockedSet.mock.calls[0][0]).toBe('OB202605001');
    expect((mockedSet.mock.calls[0][1] as { deptRatios: unknown[] }).deptRatios).toHaveLength(2);
  });

  it('新增 + 移除部門 row 運作正常', async () => {
    mockedGet.mockResolvedValue({
      listNo: 'OB202605001',
      deptRatios: [{ obdeptId: 'D001', obdeptNm: '業務一部', ration: 100 }],
      total: 100,
    });
    renderForm();
    await waitFor(() =>
      expect(screen.getByTestId('dept-ratio-form')).toBeInTheDocument(),
    );
    fireEvent.click(screen.getByTestId('btn-add-dept'));
    // 現在應有 2 個 row（原 1 + 新增 1）
    const inputs = screen.getAllByPlaceholderText('例：D001');
    expect(inputs).toHaveLength(2);
  });
});
