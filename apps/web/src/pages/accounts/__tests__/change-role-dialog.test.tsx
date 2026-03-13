import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ChangeRoleDialog } from '../change-role-dialog';

function renderDialog(
  props: {
    open?: boolean;
    accountName?: string;
    currentRole?: 'admin' | 'user';
    loading?: boolean;
    onConfirm?: (newRole: 'admin' | 'user') => void;
    onCancel?: () => void;
  } = {},
) {
  const defaultProps = {
    open: true,
    accountName: 'Test User',
    currentRole: 'user' as const,
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

  it('顯示目前角色', () => {
    renderDialog({ currentRole: 'user' });
    // "目前角色" label followed by "User" text
    const label = screen.getByText('目前角色');
    const roleText = label.parentElement?.querySelector('p');
    expect(roleText?.textContent).toBe('User');
  });

  it('顯示目前角色為 Admin', () => {
    renderDialog({ currentRole: 'admin' });
    const label = screen.getByText('目前角色');
    const roleText = label.parentElement?.querySelector('p');
    expect(roleText?.textContent).toBe('Admin');
  });

  it('下拉選單包含 Admin 與 User 兩個選項', () => {
    renderDialog();
    const select = screen.getByRole('combobox');
    expect(select).toBeInTheDocument();
    const options = screen.getAllByRole('option');
    expect(options).toHaveLength(2);
    expect(options[0]).toHaveTextContent('Admin');
    expect(options[1]).toHaveTextContent('User');
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

  it('顯示角色變更影響的警告訊息', () => {
    renderDialog();
    expect(screen.getByText(/變更角色將立即影響該使用者的系統權限/)).toBeInTheDocument();
  });

  it('點擊確認變更呼叫 onConfirm 並傳入新角色', async () => {
    const user = userEvent.setup();
    const { onConfirm } = renderDialog({ currentRole: 'user' });
    await user.click(screen.getByRole('button', { name: '確認變更' }));
    expect(onConfirm).toHaveBeenCalledWith('admin');
  });

  it('選擇不同角色後點擊確認傳入正確的角色', async () => {
    const user = userEvent.setup();
    const { onConfirm } = renderDialog({ currentRole: 'user' });
    // Default is admin; change to user
    const select = screen.getByRole('combobox');
    await user.selectOptions(select, 'user');
    await user.click(screen.getByRole('button', { name: '確認變更' }));
    expect(onConfirm).toHaveBeenCalledWith('user');
  });

  it('點擊取消呼叫 onCancel', async () => {
    const user = userEvent.setup();
    const { onCancel } = renderDialog();
    await user.click(screen.getByRole('button', { name: '取消' }));
    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it('loading 狀態下確認按鈕 disabled', () => {
    renderDialog({ loading: true });
    expect(screen.getByRole('button', { name: '變更中...' })).toBeDisabled();
  });

  it('點擊背景遮罩呼叫 onCancel', async () => {
    const user = userEvent.setup();
    const { onCancel } = renderDialog();
    await user.click(screen.getByTestId('dialog-backdrop'));
    expect(onCancel).toHaveBeenCalledTimes(1);
  });
});
