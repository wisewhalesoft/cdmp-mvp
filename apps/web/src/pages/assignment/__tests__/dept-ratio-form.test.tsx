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
 *
 * F117 v1.1 增量（docs/specs/contracts/F117-dept-ratio.contract.ts）：
 *   deptRatios[].hasActiveDirector / isRatioEditable 恆計算並回傳（預設 true，向後相容既有呼叫）；
 *   response 層新增 hiddenNoDirectorCount（預設 0）。
 */
function buildGetResponse(
  deptRatios: Array<{
    obdeptId: string;
    obdeptNm: string;
    ration: number;
    isActive?: boolean;
    hasActiveDirector?: boolean;
    isRatioEditable?: boolean;
  }>,
  opts: { hiddenNoDirectorCount?: number } = {},
): stageApi.GetDeptRatiosResponse {
  const items = deptRatios.map((d) => ({
    isActive: true,
    directorName: null,
    hasActiveDirector: true,
    isRatioEditable: true,
    ...d,
  }));
  return {
    listNo: 'OB202605001',
    listNm: '測試名單',
    projectWorkym: '202605',
    stage: 'dept_ratio',
    deptRatios: items,
    total: items.reduce((s, d) => s + d.ration, 0),
    isReadOnly: false,
    hiddenNoDirectorCount: opts.hiddenNoDirectorCount ?? 0,
  } as stageApi.GetDeptRatiosResponse;
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

/**
 * F117 v1.1 — 部門比例設定頁僅提供「有在職處長」之部門設定（表格渲染邏輯）
 *
 * 對應：docs/specs/features/F117-dept-ratio-director-required-filter.md（AC-3/AC-4/AC-5/AC-8）
 *       docs/test-specs/features/F117-test.md（TS-F117-FE-001~005）
 *
 * Test-id 對照說明（見 F117-test.md §三）：孤兒鎖定列 / 已隱藏資訊列 / 無處長徽章採
 * prototype 29a-dept-ratio-config.html 明訂之 data-testid；Sum Banner 沿用既有
 * F079 test-id `dept-ratio-sum-banner`（未重新命名，理由見 risks-and-gaps.md R-F117-03）。
 */
describe('DeptRatioForm (F117)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => cleanup());

  // TS-F117-FE-001 / TS-F117-FE-002
  it('孤兒列（isRatioEditable=false 且 ration>0）之 ration input 為 disabled，並顯示「無在職處長」徽章', async () => {
    mockedGet.mockResolvedValue(
      buildGetResponse([
        { obdeptId: 'D001', obdeptNm: '業務一部', ration: 60, hasActiveDirector: true, isRatioEditable: true },
        { obdeptId: 'D002', obdeptNm: '業務二部（孤兒）', ration: 40, hasActiveDirector: false, isRatioEditable: false },
      ]),
    );
    renderForm();
    await waitFor(() => expect(screen.getByTestId('dept-ratio-form')).toBeInTheDocument());

    const lockedInput = screen.getByTestId('ration-input-locked');
    expect(lockedInput).toBeDisabled();
    expect(screen.getByTestId('no-active-director-badge')).toBeInTheDocument();
    // 可編輯列不應也被鎖定
    expect(screen.queryAllByTestId('ration-input-locked')).toHaveLength(1);
  });

  // TS-F117-FE-002（BR-10：與「已下線」徽章並存不混淆）
  it('孤兒 + 已下線同時成立時，兩個徽章皆顯示且可區分', async () => {
    mockedGet.mockResolvedValue(
      buildGetResponse([
        {
          obdeptId: 'D099',
          obdeptNm: '舊東區處',
          ration: 15,
          isActive: false,
          hasActiveDirector: false,
          isRatioEditable: false,
        },
      ]),
    );
    renderForm();
    await waitFor(() => expect(screen.getByTestId('dept-ratio-form')).toBeInTheDocument());

    expect(screen.getByTestId('dept-inactive-badge-D099')).toBeInTheDocument();
    expect(screen.getByTestId('no-active-director-badge')).toBeInTheDocument();
  });

  // TS-F117-FE-003
  it('孤兒鎖定列之操作欄不渲染任何寫入動作（無「清空」按鈕）', async () => {
    mockedGet.mockResolvedValue(
      buildGetResponse([
        { obdeptId: 'D002', obdeptNm: '業務二部（孤兒）', ration: 40, hasActiveDirector: false, isRatioEditable: false },
      ]),
    );
    renderForm();
    await waitFor(() => expect(screen.getByTestId('dept-ratio-form')).toBeInTheDocument());

    const row = screen.getByTestId('ration-input-locked').closest('tr');
    expect(row).not.toBeNull();
    expect(row!.querySelector('button')).toBeNull();
  });

  // TS-F117-FE-004
  it('加總涵蓋孤兒鎖定列（AC-5）：可編輯 60 + 鎖定 40 = 100', async () => {
    mockedGet.mockResolvedValue(
      buildGetResponse([
        { obdeptId: 'D001', obdeptNm: '業務一部', ration: 60, hasActiveDirector: true, isRatioEditable: true },
        { obdeptId: 'D002', obdeptNm: '業務二部（孤兒）', ration: 40, hasActiveDirector: false, isRatioEditable: false },
      ]),
    );
    renderForm();
    await waitFor(() =>
      expect(screen.getByTestId('dept-ratio-sum-banner').dataset.valid).toBe('true'),
    );
  });

  // TS-F117-FE-005
  it('hiddenNoDirectorCount > 0 → 已隱藏資訊列顯示且含數字；= 0 → 不顯示', async () => {
    mockedGet.mockResolvedValue(
      buildGetResponse(
        [{ obdeptId: 'D001', obdeptNm: '業務一部', ration: 100, hasActiveDirector: true, isRatioEditable: true }],
        { hiddenNoDirectorCount: 2 },
      ),
    );
    renderForm();
    await waitFor(() => expect(screen.getByTestId('hidden-depts-notice')).toBeInTheDocument());
    expect(screen.getByTestId('hidden-depts-notice')).toHaveTextContent('2');

    cleanup();
    vi.clearAllMocks();
    mockedGet.mockResolvedValue(
      buildGetResponse(
        [{ obdeptId: 'D001', obdeptNm: '業務一部', ration: 100, hasActiveDirector: true, isRatioEditable: true }],
        { hiddenNoDirectorCount: 0 },
      ),
    );
    renderForm();
    await waitFor(() => expect(screen.getByTestId('dept-ratio-form')).toBeInTheDocument());
    expect(screen.queryByTestId('hidden-depts-notice')).not.toBeInTheDocument();
  });

  // TS-F117-FE-006 / AC-7
  it('可編輯部門數 = 0（全為孤兒鎖定列）→ 空狀態顯示，儲存按鈕停用或不渲染', async () => {
    mockedGet.mockResolvedValue(
      buildGetResponse([
        { obdeptId: 'D001', obdeptNm: '業務一部（孤兒）', ration: 100, hasActiveDirector: false, isRatioEditable: false },
      ]),
    );
    renderForm();
    await waitFor(() =>
      expect(screen.getByTestId('no-active-director-empty-state')).toBeInTheDocument(),
    );
    const saveBtn = screen.queryByTestId('btn-save-dept-ratio');
    if (saveBtn) expect(saveBtn).toBeDisabled();
    // 文案不得沿用會誤導為同步異常的舊字串
    expect(screen.getByTestId('no-active-director-empty-state').textContent).not.toMatch(
      /目前無在職部門可設定/,
    );
  });

  // TS-F117-FE-007 / AC-7 末句
  it('空狀態與孤兒鎖定列並存：可編輯部門數=0 但仍有孤兒列時，兩者同時顯示', async () => {
    mockedGet.mockResolvedValue(
      buildGetResponse([
        { obdeptId: 'D001', obdeptNm: '業務一部（孤兒）', ration: 100, hasActiveDirector: false, isRatioEditable: false },
      ]),
    );
    renderForm();
    await waitFor(() =>
      expect(screen.getByTestId('no-active-director-empty-state')).toBeInTheDocument(),
    );
    expect(screen.getByTestId('ration-input-locked')).toBeInTheDocument();
  });
});
