import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { RunPageBreadcrumb } from '../run-page-breadcrumb';

/**
 * 月名單分派下游頁共用麵包屑：執行歷史 › {leaf}
 *
 * 取代各頁 header 原本的「返回箭頭 + 標題 + 長版 runId code」。
 * 對應 prototype 32 / 33 / 35 / 36 header（leaf 標題與 prototype 一致）。
 */
function setup(leaf: string) {
  return render(
    <MemoryRouter>
      <RunPageBreadcrumb leaf={leaf} />
    </MemoryRouter>,
  );
}

describe('RunPageBreadcrumb', () => {
  it('渲染「執行歷史 › {leaf}」結構', () => {
    setup('結果摘要');
    const nav = screen.getByTestId('run-breadcrumb');
    expect(nav).toHaveTextContent('執行歷史');
    expect(nav).toHaveTextContent('結果摘要');
  });

  it('「執行歷史」為連回 /assignment/history 的連結', () => {
    setup('結果摘要');
    const link = screen.getByRole('link', { name: '執行歷史' });
    expect(link).toHaveAttribute('href', '/assignment/history');
  });

  it('leaf 為目前頁（aria-current=page），非連結', () => {
    setup('快照詳情');
    const leaf = screen.getByText('快照詳情');
    expect(leaf).toHaveAttribute('aria-current', 'page');
    expect(leaf.tagName).not.toBe('A');
  });
});
