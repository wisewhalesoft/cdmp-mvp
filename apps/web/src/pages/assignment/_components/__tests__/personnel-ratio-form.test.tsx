import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { PersonnelRatioForm } from '../personnel-ratio-form';
import { ToastProvider } from '@/components/ui/toast';
import type { PersonnelRatioDepartment } from '@/api/assignment-stage';

/**
 * PersonnelRatioForm — 個別比例「直接編輯、不連動」行為（2026-07 用戶決議）測試。
 *
 * 重點：調整某一員工比例「只改該員工」，其他人維持不變；加總是否 = 100% 僅於儲存時檢查
 * （sum banner 即時提示、未達 100% 時儲存鈕 disabled）。
 */

function buildDept(): PersonnelRatioDepartment {
  return {
    deptCode: 'XTC0',
    deptName: '北一處',
    deptRatio: 30,
    directorName: '李處長',
    isInScope: true,
    activeCount: 3,
    sumValidated: false,
    allResigned: false,
    deptSum: 0,
    employees: [
      { empId: 'EMP001', empName: '王小明', ration: null, isResigned: false, createdBy: null },
      { empId: 'EMP002', empName: '林小美', ration: null, isResigned: false, createdBy: null },
      { empId: 'EMP003', empName: '張大華', ration: null, isResigned: false, createdBy: null },
    ],
  };
}

function renderForm(dept = buildDept()) {
  return render(
    <ToastProvider>
      <PersonnelRatioForm listNo="OB202607001" department={dept} />
    </ToastProvider>,
  );
}

function ratioInput(empId: string): HTMLInputElement {
  return screen.getByLabelText(`empl-ratio-${empId}`) as HTMLInputElement;
}

describe('PersonnelRatioForm — 不連動編輯', () => {
  afterEach(() => cleanup());

  it('初次進入無既有值 → 均等分配（3 人 33.33 / 33.33 / 33.34）', () => {
    renderForm();
    expect(ratioInput('EMP001').value).toBe('33.33');
    expect(ratioInput('EMP002').value).toBe('33.33');
    expect(ratioInput('EMP003').value).toBe('33.34');
  });

  it('調整某一員工比例「只改該員工」，其他人維持不變', () => {
    renderForm();
    fireEvent.change(ratioInput('EMP001'), { target: { value: '50' } });
    // 關鍵：EMP002 / EMP003 不被連動調整
    expect(ratioInput('EMP001').value).toBe('50');
    expect(ratioInput('EMP002').value).toBe('33.33');
    expect(ratioInput('EMP003').value).toBe('33.34');
  });

  it('加總 ≠ 100% 時 sum banner 標記 invalid 且「儲存本部門」disabled', () => {
    renderForm();
    fireEvent.change(ratioInput('EMP001'), { target: { value: '50' } });
    const banner = screen.getByTestId('personnel-sum-banner-XTC0');
    expect(banner).toHaveAttribute('data-valid', 'false');
    expect(screen.getByTestId('btn-save-dept-XTC0')).toBeDisabled();
  });

  it('手動調到加總 = 100% → sum banner valid 且「儲存本部門」enabled', () => {
    renderForm();
    fireEvent.change(ratioInput('EMP001'), { target: { value: '40' } });
    fireEvent.change(ratioInput('EMP002'), { target: { value: '30' } });
    fireEvent.change(ratioInput('EMP003'), { target: { value: '30' } });
    const banner = screen.getByTestId('personnel-sum-banner-XTC0');
    expect(banner).toHaveAttribute('data-valid', 'true');
    expect(screen.getByTestId('btn-save-dept-XTC0')).not.toBeDisabled();
  });

  it('獎懲 +10% 只加到該員工，不連動其他人', () => {
    renderForm();
    // EMP001 33.33 → +10 = 43.33；其他不變
    fireEvent.click(screen.getByTestId('tpl-+10%-EMP001'));
    expect(ratioInput('EMP001').value).toBe('43.33');
    expect(ratioInput('EMP002').value).toBe('33.33');
    expect(ratioInput('EMP003').value).toBe('33.34');
  });

  it('均等分配為明確批次操作 → 全體回到均等且加總 = 100%', () => {
    renderForm();
    fireEvent.change(ratioInput('EMP001'), { target: { value: '80' } });
    fireEvent.click(screen.getByTestId('dept-tpl-equal-XTC0'));
    expect(ratioInput('EMP001').value).toBe('33.33');
    expect(ratioInput('EMP002').value).toBe('33.33');
    expect(ratioInput('EMP003').value).toBe('33.34');
    expect(screen.getByTestId('personnel-sum-banner-XTC0')).toHaveAttribute('data-valid', 'true');
  });
});
