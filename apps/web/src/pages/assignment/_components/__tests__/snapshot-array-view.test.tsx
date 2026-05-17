import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { SnapshotArrayView } from '../snapshot-array-view';

/**
 * F066 Snapshot input_list / result 共用陣列 view
 *
 * 自動從第一筆 row 萃取 column names；
 * 超過 100 筆顯示「前 100 列 / 共 N 列」+ 提示匯出。
 */

describe('SnapshotArrayView', () => {
  it('payload=null 顯示空狀態', () => {
    render(
      <SnapshotArrayView
        payload={null}
        arrayKey="cases"
        title="輸入名單"
      />,
    );
    expect(screen.getByTestId('snapshot-array-empty')).toBeInTheDocument();
  });

  it('陣列為空顯示「無紀錄」', () => {
    render(
      <SnapshotArrayView
        payload={{ cases: [] }}
        arrayKey="cases"
        title="輸入名單"
      />,
    );
    expect(screen.getByTestId('snapshot-array-empty-rows')).toBeInTheDocument();
  });

  it('渲染表格 with 欄位 + row', () => {
    render(
      <SnapshotArrayView
        payload={{
          cases: [
            { listNo: 'OB001', applNo: 'A1', cardType: 'M3' },
            { listNo: 'OB001', applNo: 'A2', cardType: 'M3' },
          ],
        }}
        arrayKey="cases"
        title="輸入名單"
      />,
    );
    const table = screen.getByTestId('snapshot-array-table');
    expect(table.textContent).toContain('listNo');
    expect(table.textContent).toContain('applNo');
    expect(table.textContent).toContain('A1');
    expect(table.textContent).toContain('A2');
  });

  it('超過 100 列只顯示前 100 + 提示', () => {
    const rows = Array.from({ length: 150 }, (_, i) => ({
      listNo: 'OB001',
      applNo: `A${i}`,
    }));
    render(
      <SnapshotArrayView
        payload={{ cases: rows }}
        arrayKey="cases"
        title="輸入名單"
      />,
    );
    const notice = screen.getByTestId('snapshot-array-truncate-notice');
    expect(notice.textContent).toContain('100');
    expect(notice.textContent).toContain('150');
  });

  it('陣列不存在 → 顯示空狀態', () => {
    render(
      <SnapshotArrayView
        payload={{ assignments: [] }}
        arrayKey="cases"
        title="輸入名單"
      />,
    );
    expect(screen.getByTestId('snapshot-array-empty-rows')).toBeInTheDocument();
  });
});
