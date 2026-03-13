import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect } from 'vitest';
import { PasswordInput } from '../password-input';

describe('PasswordInput', () => {
  it('預設為密碼遮罩模式', () => {
    render(<PasswordInput label="密碼" />);
    const input = screen.getByLabelText('密碼');
    expect(input).toHaveAttribute('type', 'password');
  });

  it('點擊眼睛圖示切換為可見', async () => {
    const user = userEvent.setup();
    render(<PasswordInput label="密碼" />);
    const toggleButton = screen.getByRole('button', { name: '顯示密碼' });
    await user.click(toggleButton);
    const input = screen.getByLabelText('密碼');
    expect(input).toHaveAttribute('type', 'text');
  });

  it('再次點擊眼睛圖示切換回遮罩', async () => {
    const user = userEvent.setup();
    render(<PasswordInput label="密碼" />);
    const toggleButton = screen.getByRole('button', { name: '顯示密碼' });
    await user.click(toggleButton);
    const hideButton = screen.getByRole('button', { name: '隱藏密碼' });
    await user.click(hideButton);
    const input = screen.getByLabelText('密碼');
    expect(input).toHaveAttribute('type', 'password');
  });
});
