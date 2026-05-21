import { render, screen, fireEvent, cleanup, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { DeptRatioForm } from '../_components/dept-ratio-form';
import { ToastProvider } from '@/components/ui/toast';
import * as stageApi from '@/api/assignment-stage';

vi.mock('@/api/assignment-stage');

const mockedGet = vi.mocked(stageApi.getDeptRatios);
const mockedSet = vi.mocked(stageApi.setDeptRatios);

/**
 * 對齊後端 spec F079 §5.1 之完整 response shape；test 必須使用相同 shape，
 * 避免再次發生 mock 與真實 contract drift（feedback_mock_real_system_contract）。
 */
function buildGetResponse(
  deptRatios: Array<{ obdeptId: string; obdeptNm: string; ration: number; isActive?: boolean }>,
): stageApi.GetDeptRatiosResponse {
  const items = deptRatios.map((d) => ({ isActive: true, directorName: null, ...d }));
  return {
    listNo: 'OB202605001',
    listNm: '測試名單',
    projectWorkym: '202605',
    stage: 'dept_ratio',
    deptRatios: items,
    total: items.reduce((s, d) => s + d.ration, 0),
    isReadOnly: false,
  };
}

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

  it('載入後端回的部門列並顯示（obdeptId / obdeptNm 為唯讀文字）', async () => {
    mockedGet.mockResolvedValue(
      buildGetResponse([
        { obdeptId: 'D001', obdeptNm: '業務一部', ration: 50 },
        { obdeptId: 'D002', obdeptNm: '業務二部', ration: 50 },
      ]),
    );
    renderForm();
    await waitFor(() =>
      expect(screen.getByTestId('dept-ratio-form')).toBeInTheDocument(),
    );
    // obdeptId / obdeptNm 不應該是可編輯 input，應該是純文字
    expect(screen.queryByDisplayValue('D001')).not.toBeInTheDocument();
    expect(screen.queryByDisplayValue('業務一部')).not.toBeInTheDocument();
    expect(screen.getByText('D001')).toBeInTheDocument();
    expect(screen.getByText('業務一部')).toBeInTheDocument();
    expect(screen.getByText('業務二部')).toBeInTheDocument();
    // ration 仍為可編輯 input
    expect(screen.getByLabelText('ratio-D001')).toBeInTheDocument();
  });

  it('isActive=false 的部門顯示「已下線」徽章', async () => {
    mockedGet.mockResolvedValue(
      buildGetResponse([
        { obdeptId: 'D001', obdeptNm: '業務一部', ration: 70, isActive: true },
        { obdeptId: 'D099', obdeptNm: '舊東區處', ration: 30, isActive: false },
      ]),
    );
    renderForm();
    await waitFor(() =>
      expect(screen.getByTestId('dept-ratio-form')).toBeInTheDocument(),
    );
    expect(screen.getByTestId('dept-inactive-badge-D099')).toBeInTheDocument();
    expect(screen.queryByTestId('dept-inactive-badge-D001')).not.toBeInTheDocument();
  });

  it('UI 不再提供「新增部門」按鈕（部門列由後端決定）', async () => {
    mockedGet.mockResolvedValue(
      buildGetResponse([{ obdeptId: 'D001', obdeptNm: '業務一部', ration: 100 }]),
    );
    renderForm();
    await waitFor(() =>
      expect(screen.getByTestId('dept-ratio-form')).toBeInTheDocument(),
    );
    expect(screen.queryByTestId('btn-add-dept')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /新增部門/ })).not.toBeInTheDocument();
  });

  it('加總 = 100 顯示獨立 Sum Banner valid 狀態', async () => {
    mockedGet.mockResolvedValue(
      buildGetResponse([
        { obdeptId: 'D001', obdeptNm: '業務一部', ration: 60 },
        { obdeptId: 'D002', obdeptNm: '業務二部', ration: 40 },
      ]),
    );
    renderForm();
    await waitFor(() =>
      expect(screen.getByTestId('dept-ratio-sum-banner').dataset.valid).toBe('true'),
    );
  });

  it('加總 ≠ 100 時儲存按鈕 disabled，不會 PUT', async () => {
    mockedGet.mockResolvedValue(
      buildGetResponse([{ obdeptId: 'D001', obdeptNm: '業務一部', ration: 50 }]),
    );
    renderForm();
    await waitFor(() =>
      expect(screen.getByTestId('dept-ratio-form')).toBeInTheDocument(),
    );
    const btn = screen.getByTestId('btn-save-dept-ratio');
    expect(btn).toBeDisabled();
    fireEvent.click(btn);
    expect(mockedSet).not.toHaveBeenCalled();
  });

  it('合法 payload + 點儲存 → 呼叫 setDeptRatios API（不送 isActive 欄位）', async () => {
    mockedGet.mockResolvedValue(
      buildGetResponse([
        { obdeptId: 'D001', obdeptNm: '業務一部', ration: 60 },
        { obdeptId: 'D002', obdeptNm: '業務二部', ration: 40 },
      ]),
    );
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
    fireEvent.click(screen.getByTestId('btn-save-dept-ratio'));
    await waitFor(() => expect(mockedSet).toHaveBeenCalledTimes(1));
    expect(mockedSet.mock.calls[0][0]).toBe('OB202605001');
    const sentBody = mockedSet.mock.calls[0][1] as unknown as {
      deptRatios: Array<Record<string, unknown>>;
    };
    expect(sentBody.deptRatios).toHaveLength(2);
    // PUT body 不應夾帶 isActive / directorName
    expect(sentBody.deptRatios[0]).not.toHaveProperty('isActive');
    expect(sentBody.deptRatios[0]).not.toHaveProperty('directorName');
    expect(sentBody.deptRatios[0]).toEqual({ obdeptId: 'D001', obdeptNm: '業務一部', ration: 60 });
  });

  it('後端回空陣列時顯示空狀態（save/advance 不渲染，但 cancel/rollback 仍可顯示）', async () => {
    mockedGet.mockResolvedValue(buildGetResponse([]));
    renderForm();
    await waitFor(() =>
      expect(screen.getByTestId('dept-ratio-empty')).toBeInTheDocument(),
    );
    expect(screen.queryByTestId('btn-save-dept-ratio')).not.toBeInTheDocument();
    expect(screen.queryByTestId('btn-advance-personnel-ratio')).not.toBeInTheDocument();
  });

  it('directorName 有值時顯示處長，無則顯示「—」', async () => {
    mockedGet.mockResolvedValue(
      buildGetResponse([
        { obdeptId: 'XVE1', obdeptNm: '北區電銷1', ration: 50, directorName: '盧淑娟' } as any,
        { obdeptId: 'AI000', obdeptNm: '企劃部', ration: 50, directorName: null } as any,
      ]),
    );
    renderForm();
    await waitFor(() =>
      expect(screen.getByTestId('dept-director-XVE1')).toBeInTheDocument(),
    );
    expect(screen.getByTestId('dept-director-XVE1')).toHaveTextContent('盧淑娟');
    expect(screen.getByTestId('dept-director-none-AI000')).toBeInTheDocument();
  });

  it('totalEstimate 給定時顯示預估案件數 = totalEstimate × ration / 100', async () => {
    mockedGet.mockResolvedValue(
      buildGetResponse([
        { obdeptId: 'D001', obdeptNm: '業務一部', ration: 30 },
        { obdeptId: 'D002', obdeptNm: '業務二部', ration: 70 },
      ]),
    );
    render(
      <ToastProvider>
        <DeptRatioForm listNo="OB202605001" totalEstimate={1200} />
      </ToastProvider>,
    );
    await waitFor(() =>
      expect(screen.getByTestId('dept-case-count-D001')).toBeInTheDocument(),
    );
    expect(screen.getByTestId('dept-case-count-D001')).toHaveTextContent('360');
    expect(screen.getByTestId('dept-case-count-D002')).toHaveTextContent('840');
  });
});
