import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi } from 'vitest';
import { Button } from '../button';

describe('Button', () => {
  it('渲染按鈕文字', () => {
    render(<Button>登入</Button>);
    expect(screen.getByRole('button', { name: '登入' })).toBeInTheDocument();
  });

  it('點擊時觸發 onClick', async () => {
    const user = userEvent.setup();
    const handleClick = vi.fn();
    render(<Button onClick={handleClick}>登入</Button>);
    await user.click(screen.getByRole('button', { name: '登入' }));
    expect(handleClick).toHaveBeenCalledTimes(1);
  });

  it('disabled 狀態不可點擊', async () => {
    const user = userEvent.setup();
    const handleClick = vi.fn();
    render(<Button disabled onClick={handleClick}>登入</Button>);
    const button = screen.getByRole('button', { name: '登入' });
    expect(button).toBeDisabled();
    await user.click(button);
    expect(handleClick).not.toHaveBeenCalled();
  });

  it('loading 狀態顯示 loading 文字且 disabled', () => {
    render(<Button loading loadingText="登入中...">登入</Button>);
    const button = screen.getByRole('button', { name: '登入中...' });
    expect(button).toBeDisabled();
    expect(button).toHaveTextContent('登入中...');
  });

  it('套用 text-sm 與 rounded-lg 樣式以符合原型設計', () => {
    render(<Button>測試</Button>);
    const button = screen.getByRole('button', { name: '測試' });
    expect(button.className).toContain('text-sm');
    expect(button.className).toContain('rounded-lg');
    expect(button.className).not.toContain('rounded-md');
  });
});
