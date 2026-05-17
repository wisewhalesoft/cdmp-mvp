import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { ChangeRoleDialog } from '../change-role-dialog';
import type { EffectiveIdentity } from '@cdmp/shared';

interface DialogProps {
  open?: boolean;
  accountName?: string;
  currentIdentity?: EffectiveIdentity;
  loading?: boolean;
  onConfirm?: (newIdentity: EffectiveIdentity) => void;
  onCancel?: () => void;
}

function renderDialog(props: DialogProps = {}) {
  const defaultProps = {
    open: true,
    accountName: 'Test User',
    currentIdentity: 'user' as EffectiveIdentity,
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

describe('ChangeRoleDialog (F006a / AD-E07 v3.0)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    cleanup();
  });

  it('open=false 時不渲染對話框', () => {
    renderDialog({ open: false });
    expect(screen.queryByText('變更角色')).not.toBeInTheDocument();
  });

  it('open=true 時顯示標題「變更角色」', () => {
    renderDialog();
    expect(screen.getByText('變更角色', { selector: 'h3' })).toBeInTheDocument();
  });

  it('顯示帳號名稱', () => {
    renderDialog({ accountName: 'Alice' });
    expect(screen.getByText('Alice')).toBeInTheDocument();
  });

  it('「目前角色」顯示對應的 4-角色 RoleBadge', () => {
    renderDialog({ currentIdentity: 'director' });
    // RoleBadge with data-testid="role-badge-director"
    expect(screen.getAllByTestId('role-badge-director').length).toBeGreaterThan(0);
  });

  it('顯示 4 個 radio option（admin / director / section_chief / user）', () => {
    renderDialog();
    expect(screen.getByTestId('new-role-admin')).toBeInTheDocument();
    expect(screen.getByTestId('new-role-director')).toBeInTheDocument();
    expect(screen.getByTestId('new-role-section_chief')).toBeInTheDocument();
    expect(screen.getByTestId('new-role-user')).toBeInTheDocument();
  });

  it('預設未選擇時，「下一步」按鈕為 disabled', () => {
    renderDialog();
    const nextBtn = screen.getByRole('button', { name: '下一步' });
    expect(nextBtn).toBeDisabled();
  });

  it('選擇與當前相同的身份時，「下一步」按鈕為 disabled', () => {
    renderDialog({ currentIdentity: 'user' });
    fireEvent.click(screen.getByTestId('new-role-user'));
    const nextBtn = screen.getByRole('button', { name: '下一步' });
    expect(nextBtn).toBeDisabled();
  });

  it('選擇不同身份後，「下一步」按鈕可點擊並顯示 before→after 預覽', () => {
    renderDialog({ currentIdentity: 'user' });
    fireEvent.click(screen.getByTestId('new-role-director'));
    const nextBtn = screen.getByRole('button', { name: '下一步' });
    expect(nextBtn).not.toBeDisabled();
    expect(screen.getByTestId('role-preview-box')).toBeInTheDocument();
  });

  it('amber 警告訊息「該帳號需重新登入」顯示', () => {
    renderDialog();
    expect(screen.getByText('該帳號需重新登入')).toBeInTheDocument();
  });

  it('footer 顯示 API 路徑 hint', () => {
    renderDialog();
    expect(
      screen.getByText(/PATCH \/accounts\/:id\/business-role/),
    ).toBeInTheDocument();
  });

  it('點擊「下一步」進入確認 step，顯示 before→after 與重新登入警告', () => {
    renderDialog({ currentIdentity: 'user' });
    fireEvent.click(screen.getByTestId('new-role-director'));
    fireEvent.click(screen.getByRole('button', { name: '下一步' }));

    expect(screen.getByText('確認角色變更')).toBeInTheDocument();
    expect(screen.getByText('此帳號需重新登入後新角色才生效')).toBeInTheDocument();
  });

  it('點擊「確認變更」呼叫 onConfirm(newIdentity)', () => {
    const onConfirm = vi.fn();
    renderDialog({ currentIdentity: 'user', onConfirm });
    fireEvent.click(screen.getByTestId('new-role-section_chief'));
    fireEvent.click(screen.getByRole('button', { name: '下一步' }));
    fireEvent.click(screen.getByRole('button', { name: '確認變更' }));
    expect(onConfirm).toHaveBeenCalledWith('section_chief');
  });

  it('點擊取消按鈕呼叫 onCancel', () => {
    const onCancel = vi.fn();
    renderDialog({ onCancel });
    fireEvent.click(screen.getAllByText('取消')[0]);
    expect(onCancel).toHaveBeenCalled();
  });

  it('loading=true 時，確認按鈕顯示 loading 文字', () => {
    renderDialog({ currentIdentity: 'user', loading: true });
    fireEvent.click(screen.getByTestId('new-role-director'));
    fireEvent.click(screen.getByRole('button', { name: '下一步' }));
    expect(screen.getByText('變更中...')).toBeInTheDocument();
  });

  it('open 重新打開時重置 selected 與 confirm 狀態', () => {
    const { rerender } = render(
      <ChangeRoleDialog
        open={true}
        accountName="Test"
        currentIdentity="user"
        loading={false}
        onConfirm={vi.fn()}
        onCancel={vi.fn()}
      />,
    );
    fireEvent.click(screen.getByTestId('new-role-director'));
    fireEvent.click(screen.getByRole('button', { name: '下一步' }));
    expect(screen.getByText('確認角色變更')).toBeInTheDocument();

    rerender(
      <ChangeRoleDialog
        open={false}
        accountName="Test"
        currentIdentity="user"
        loading={false}
        onConfirm={vi.fn()}
        onCancel={vi.fn()}
      />,
    );
    rerender(
      <ChangeRoleDialog
        open={true}
        accountName="Test"
        currentIdentity="user"
        loading={false}
        onConfirm={vi.fn()}
        onCancel={vi.fn()}
      />,
    );
    // Should be back on selection step (not confirm)
    expect(screen.queryByText('確認角色變更')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: '下一步' })).toBeDisabled();
  });
});
