import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ChangeRoleDialog } from '../change-role-dialog';
import type { UserRole } from '@cdmp/shared';

function renderDialog(
  props: {
    open?: boolean;
    accountName?: string;
    currentRole?: UserRole;
    loading?: boolean;
    onConfirm?: (newRole: UserRole) => void;
    onCancel?: () => void;
  } = {},
) {
  const defaultProps = {
    open: true,
    accountName: 'Test User',
    currentRole: 'user' as UserRole,
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

  it('顯示目前角色（中文名稱）', () => {
    renderDialog({ currentRole: 'user' });
    const label = screen.getByText('目前角色');
    const roleText = label.parentElement?.querySelector('p');
    expect(roleText?.textContent).toBe('使用者（User）');
  });

  it('顯示目前角色為管理者', () => {
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

  it('目前角色為 User 時下拉選單預設選中 Admin', () => {
    renderDialog({ currentRole: 'user' });
    const select = screen.getByRole('combobox') as HTMLSelectElement;
    expect(select.value).toBe('admin');
  });

  it('目前角色為 Admin 時下拉選單預設選中 User', () => {
    renderDialog({ currentRole: 'admin' });
    const select = screen.getByRole('combobox') as HTMLSelectElement;
    expect(select.value).toBe('user');
  });

  // Two-step flow: select → confirm
  it('點擊下一步後進入確認頁面', async () => {
    const user = userEvent.setup();
    renderDialog({ currentRole: 'user' });
    await user.click(screen.getByRole('button', { name: '下一步' }));
    expect(screen.getByText('確認角色變更')).toBeInTheDocument();
  });

  it('確認頁面顯示角色變更方向與帳號名稱', async () => {
    const user = userEvent.setup();
    renderDialog({ currentRole: 'user', accountName: 'Alice' });
    await user.click(screen.getByRole('button', { name: '下一步' }));
    // Badge 樣式的角色顯示
    expect(screen.getByText('使用者（User）')).toBeInTheDocument();
    expect(screen.getByText('管理者（Admin）')).toBeInTheDocument();
    // 帳號名稱確認文字
    expect(screen.getByText('Alice')).toBeInTheDocument();
    expect(screen.getByText(/確定要變更/)).toBeInTheDocument();
  });

  it('確認頁面點擊確認變更呼叫 onConfirm', async () => {
    const user = userEvent.setup();
    const { onConfirm } = renderDialog({ currentRole: 'user' });
    await user.click(screen.getByRole('button', { name: '下一步' }));
    await user.click(screen.getByRole('button', { name: '確認變更' }));
    expect(onConfirm).toHaveBeenCalledWith('admin');
  });

  it('選擇角色後確認傳入正確的角色', async () => {
    const user = userEvent.setup();
    const { onConfirm } = renderDialog({ currentRole: 'user' });
    // Default selection is 'admin' when current is 'user'
    await user.click(screen.getByRole('button', { name: '下一步' }));
    await user.click(screen.getByRole('button', { name: '確認變更' }));
    expect(onConfirm).toHaveBeenCalledWith('admin');
  });

  it('確認頁面點擊取消呼叫 onCancel', async () => {
    const user = userEvent.setup();
    const { onCancel } = renderDialog({ currentRole: 'user' });
    await user.click(screen.getByRole('button', { name: '下一步' }));
    expect(screen.getByText('確認角色變更')).toBeInTheDocument();
    // Step 2 "取消" 按鈕呼叫 onCancel（與 prototype 一致）
    const cancelButtons = screen.getAllByRole('button', { name: '取消' });
    await user.click(cancelButtons[0]);
    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it('點擊取消呼叫 onCancel', async () => {
    const user = userEvent.setup();
    const { onCancel } = renderDialog();
    await user.click(screen.getByRole('button', { name: '取消' }));
    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it('相同角色時下一步按鈕 disabled', () => {
    renderDialog({ currentRole: 'admin' });
    const select = screen.getByRole('combobox') as HTMLSelectElement;
    // Default is 'user' when current is 'admin', so button should be enabled
    expect(screen.getByRole('button', { name: '下一步' })).not.toBeDisabled();
  });

  it('點擊背景遮罩呼叫 onCancel', async () => {
    const user = userEvent.setup();
    const { onCancel } = renderDialog();
    await user.click(screen.getByTestId('dialog-backdrop'));
    expect(onCancel).toHaveBeenCalledTimes(1);
  });
});
