import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect } from 'vitest';
import { Input } from '../input';

describe('Input', () => {
  it('渲染帶 label 的輸入欄', () => {
    render(<Input label="Email" />);
    expect(screen.getByLabelText('Email')).toBeInTheDocument();
  });

  it('可以輸入文字', async () => {
    const user = userEvent.setup();
    render(<Input label="Email" />);
    const input = screen.getByLabelText('Email');
    await user.type(input, 'admin@example.com');
    expect(input).toHaveValue('admin@example.com');
  });

  it('error 狀態顯示紅色邊框和錯誤訊息', () => {
    render(<Input label="Email" error="請輸入有效的 Email 地址" />);
    const input = screen.getByLabelText('Email');
    expect(input).toHaveClass('border-danger-600');
    expect(screen.getByText('請輸入有效的 Email 地址')).toBeInTheDocument();
  });
});
