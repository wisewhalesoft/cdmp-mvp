import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ChangeRoleDialog } from '../change-role-dialog';
import type { UserRole } from '@cdmp/shared';

interface DialogProps {
  open?: boolean;
  accountName?: string;
  currentRole?: UserRole;
  currentIsSalesManager?: boolean;
  loading?: boolean;
  onConfirm?: (newRole: UserRole, newIsSalesManager: boolean) => void;
  onCancel?: () => void;
}

function renderDialog(props: DialogProps = {}) {
  const defaultProps = {
    open: true,
    accountName: 'Test User',
    currentRole: 'user' as UserRole,
    currentIsSalesManager: false,
    loading: false,
    onConfirm: vi.fn(),
    onCancel: vi.fn(),
    ...props,
  };
  return {
    ...render(<ChangeRoleDialog {...defaultProps} />),
    ...defaultProps,
  };
}

describe('ChangeRoleDialog', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('open=false 時不渲染對話框', () => {
    renderDialog({ open: false });
    expect(screen.queryByText('變更角色')).not.toBeInTheDocument();
  });

  it('open=true 時顯示對話框標題「變更角色」', () => {
    renderDialog();
    expect(screen.getByText('變更角色')).toBeInTheDocument();
  });

  it('顯示帳號名稱', () => {
    renderDialog({ accountName: 'Alice' });
    expect(screen.getByText('Alice')).toBeInTheDocument();
  });

  it('顯示目前角色（中文名稱）— 使用者', () => {
    renderDialog({ currentRole: 'user' });
    const label = screen.getByText('目前角色');
    const roleText = label.parentElement?.querySelector('p');
    expect(roleText?.textContent).toBe('使用者（User）');
  });

  it('顯示目前角色（中文名稱）— 管理者', () => {
    renderDialog({ currentRole: 'admin' });
    const label = screen.getByText('目前角色');
    const roleText = label.parentElement?.querySelector('p');
    expect(roleText?.textContent).toBe('管理者（Admin）');
  });

  it('下拉選單包含全部 2 種角色', () => {
    renderDialog();
    const select = screen.getByRole('combobox');
    expect(select).toBeInTheDocument();
    const options = screen.getAllByRole('option');
    expect(options).toHaveLength(2);
  });

  // F008 v3.2: 合併 UX dialog 預設下拉選單為「目前角色」(允許僅改 flag)
  it('預設下拉選單值為目前角色（user → user）', () => {
    renderDialog({ currentRole: 'user' });
    const select = screen.getByRole('combobox') as HTMLSelectElement;
    expect(select.value).toBe('user');
  });

  it('預設下拉選單值為目前角色（admin → admin）', () => {
    renderDialog({ currentRole: 'admin' });
    const select = screen.getByRole('combobox') as HTMLSelectElement;
    expect(select.value).toBe('admin');
  });

  // F008 v3.2 AC-10 / TS-F008-SM-FE-001: 預填 checkbox 為目前值
  it('User + is_sales_manager=true → checkbox 顯示且預勾選', () => {
    renderDialog({ currentRole: 'user', currentIsSalesManager: true });
    const wrap = screen.getByTestId('role-dialog-sales-manager-wrap');
    expect(wrap).toBeInTheDocument();
    const cb = screen.getByTestId('role-dialog-sales-manager-flag') as HTMLInputElement;
    expect(cb.checked).toBe(true);
  });

  // TS-F008-SM-FE-002
  it('User + is_sales_manager=false → checkbox 顯示且未勾選', () => {
    renderDialog({ currentRole: 'user', currentIsSalesManager: false });
    const wrap = screen.getByTestId('role-dialog-sales-manager-wrap');
    expect(wrap).toBeInTheDocument();
    const cb = screen.getByTestId('role-dialog-sales-manager-flag') as HTMLInputElement;
    expect(cb.checked).toBe(false);
  });

  // TS-F008-SM-FE-003
  it('Admin 帳號開啟 dialog → checkbox 不顯示', () => {
    renderDialog({ currentRole: 'admin', currentIsSalesManager: false });
    expect(screen.queryByTestId('role-dialog-sales-manager-wrap')).not.toBeInTheDocument();
  });

  // TS-F008-SM-FE-004: 切 user→admin checkbox 隱藏並重置
  it('newRole 切換 user→admin → checkbox 隱藏', async () => {
    const user = userEvent.setup();
    renderDialog({ currentRole: 'user', currentIsSalesManager: true });
    expect(screen.getByTestId('role-dialog-sales-manager-wrap')).toBeInTheDocument();
    await user.selectOptions(screen.getByRole('combobox'), 'admin');
    expect(screen.queryByTestId('role-dialog-sales-manager-wrap')).not.toBeInTheDocument();
  });

  // TS-F008-SM-FE-005: ASSUMPTION 4 — admin → user checkbox 預設未勾選
  it('newRole 切換 admin→user → checkbox 顯示但預設未勾選（ASSUMPTION 4）', async () => {
    const user = userEvent.setup();
    renderDialog({ currentRole: 'admin', currentIsSalesManager: false });
    await user.selectOptions(screen.getByRole('combobox'), 'user');
    const cb = screen.getByTestId('role-dialog-sales-manager-flag') as HTMLInputElement;
    expect(cb).toBeInTheDocument();
    expect(cb.checked).toBe(false);
  });

  // TS-F008-SM-FE-007
  it('checkbox 區塊 className 嚴格對齊 prototype 07 line 631', () => {
    renderDialog({ currentRole: 'user', currentIsSalesManager: false });
    const wrap = screen.getByTestId('role-dialog-sales-manager-wrap');
    expect(wrap.className).toContain('rounded-lg');
    expect(wrap.className).toContain('border-amber-200');
    expect(wrap.className).toContain('bg-amber-50/50');
    expect(wrap.className).toContain('p-3');
  });

  // TS-F008-SM-FE-008
  it('checkbox label 顯示說明文字', () => {
    renderDialog({ currentRole: 'user', currentIsSalesManager: false });
    expect(
      screen.getByText(/啟用後此帳號可存取 E07 客戶名單分派與 E06 Customer 360/),
    ).toBeInTheDocument();
  });

  // 進入確認頁面
  it('點擊下一步後進入確認頁面', async () => {
    const user = userEvent.setup();
    renderDialog({ currentRole: 'user', currentIsSalesManager: false });
    // 角色 user → user，僅改 flag
    await user.click(screen.getByTestId('role-dialog-sales-manager-flag'));
    await user.click(screen.getByRole('button', { name: '下一步' }));
    expect(screen.getByText('確認角色變更')).toBeInTheDocument();
  });

  // TS-F008-SM-FE-009: User + checkbox 勾選 → 摘要「已啟用」（綠字）
  it('確認頁面：新角色=User + checkbox 勾選 → 摘要顯示「已啟用」', async () => {
    const user = userEvent.setup();
    renderDialog({ currentRole: 'user', currentIsSalesManager: false });
    await user.click(screen.getByTestId('role-dialog-sales-manager-flag'));
    await user.click(screen.getByRole('button', { name: '下一步' }));
    const summary = screen.getByTestId('confirm-sales-manager-summary');
    expect(summary).toBeInTheDocument();
    const value = screen.getByTestId('confirm-sales-manager-summary-value');
    expect(value.textContent).toContain('啟用');
    expect(value.className).toMatch(/text-(green|success)/);
  });

  // TS-F008-SM-FE-010: User + 未勾選 → 摘要「未啟用」（灰字）
  it('確認頁面：新角色=User + checkbox 未勾選 → 摘要顯示「未啟用」', async () => {
    const user = userEvent.setup();
    renderDialog({ currentRole: 'user', currentIsSalesManager: true });
    await user.click(screen.getByTestId('role-dialog-sales-manager-flag')); // 取消勾選
    await user.click(screen.getByRole('button', { name: '下一步' }));
    const value = screen.getByTestId('confirm-sales-manager-summary-value');
    expect(value.textContent).toContain('未啟用');
    expect(value.className).toMatch(/text-gray/);
  });

  // TS-F008-SM-FE-011: 新角色=Admin → 摘要列不顯示
  it('確認頁面：新角色=Admin → 摘要列不顯示', async () => {
    const user = userEvent.setup();
    renderDialog({ currentRole: 'user', currentIsSalesManager: false });
    await user.selectOptions(screen.getByRole('combobox'), 'admin');
    await user.click(screen.getByRole('button', { name: '下一步' }));
    expect(screen.queryByTestId('confirm-sales-manager-summary')).not.toBeInTheDocument();
  });

  // 確認頁面顯示帳號名稱與角色變更
  it('確認頁面顯示角色變更方向與帳號名稱', async () => {
    const user = userEvent.setup();
    renderDialog({ currentRole: 'user', currentIsSalesManager: false, accountName: 'Alice' });
    await user.selectOptions(screen.getByRole('combobox'), 'admin');
    await user.click(screen.getByRole('button', { name: '下一步' }));
    expect(screen.getByText('使用者（User）')).toBeInTheDocument();
    expect(screen.getByText('管理者（Admin）')).toBeInTheDocument();
    expect(screen.getByText('Alice')).toBeInTheDocument();
  });

  // 確認後 onConfirm 帶兩個參數
  it('確認頁面點擊確認變更 → 呼叫 onConfirm(newRole, newSm)', async () => {
    const user = userEvent.setup();
    const { onConfirm } = renderDialog({
      currentRole: 'user',
      currentIsSalesManager: false,
    });
    await user.selectOptions(screen.getByRole('combobox'), 'admin');
    await user.click(screen.getByRole('button', { name: '下一步' }));
    await user.click(screen.getByRole('button', { name: '確認變更' }));
    expect(onConfirm).toHaveBeenCalledWith('admin', false);
  });

  it('確認頁面點擊取消呼叫 onCancel', async () => {
    const user = userEvent.setup();
    const { onCancel } = renderDialog({ currentRole: 'user', currentIsSalesManager: false });
    await user.selectOptions(screen.getByRole('combobox'), 'admin');
    await user.click(screen.getByRole('button', { name: '下一步' }));
    expect(screen.getByText('確認角色變更')).toBeInTheDocument();
    const cancelButtons = screen.getAllByRole('button', { name: '取消' });
    await user.click(cancelButtons[0]);
    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it('Step 1 點擊取消呼叫 onCancel', async () => {
    const user = userEvent.setup();
    const { onCancel } = renderDialog();
    await user.click(screen.getByRole('button', { name: '取消' }));
    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  // ASSUMPTION 2 / TS-F008-SM-INT-006: 無變更時 disable 下一步
  it('情境 F：角色與旗標皆未變 → 下一步 disabled', () => {
    renderDialog({ currentRole: 'user', currentIsSalesManager: true });
    expect(screen.getByRole('button', { name: '下一步' })).toBeDisabled();
  });

  it('情境 F：角色 admin 不變且無旗標選項 → 下一步 disabled', () => {
    renderDialog({ currentRole: 'admin', currentIsSalesManager: false });
    expect(screen.getByRole('button', { name: '下一步' })).toBeDisabled();
  });

  it('僅角色變更（無旗標變動）→ 下一步 enabled', async () => {
    const user = userEvent.setup();
    renderDialog({ currentRole: 'user', currentIsSalesManager: false });
    await user.selectOptions(screen.getByRole('combobox'), 'admin');
    expect(screen.getByRole('button', { name: '下一步' })).not.toBeDisabled();
  });

  it('僅旗標變更（無角色變動）→ 下一步 enabled', async () => {
    const user = userEvent.setup();
    renderDialog({ currentRole: 'user', currentIsSalesManager: false });
    await user.click(screen.getByTestId('role-dialog-sales-manager-flag'));
    expect(screen.getByRole('button', { name: '下一步' })).not.toBeDisabled();
  });

  it('點擊背景遮罩呼叫 onCancel', async () => {
    const user = userEvent.setup();
    const { onCancel } = renderDialog();
    await user.click(screen.getByTestId('dialog-backdrop'));
    expect(onCancel).toHaveBeenCalledTimes(1);
  });
});
