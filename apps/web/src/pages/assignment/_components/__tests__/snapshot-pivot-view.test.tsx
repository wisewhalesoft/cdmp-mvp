import { render, screen, cleanup, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { SnapshotPivotView } from '../snapshot-pivot-view';
import * as runApi from '@/api/assignment-run';

vi.mock('@/api/assignment-run');

const mockedGetPivot = vi.mocked(runApi.getPivot);

function pivot(): runApi.PivotResponse {
  return {
    runId: 'R001',
    listNos: ['OB1', 'OB2'],
    depts: [
      {
        deptName: '中區電銷1',
        total: 4,
        byList: { OB1: 3, OB2: 1 },
        emplids: [
          { emplid: '20501', empNm: '王大明', total: 3, byList: { OB1: 2, OB2: 1 } },
          { emplid: '20502', empNm: '林淑芬', total: 1, byList: { OB1: 1 } },
        ],
      },
      {
        deptName: '北區電銷1',
        total: 2,
        byList: { OB1: 1, OB2: 1 },
        emplids: [{ emplid: '30001', empNm: '陳志明', total: 2, byList: { OB1: 1, OB2: 1 } }],
      },
    ],
    grandByList: { OB1: 5, OB2: 2 },
    grandTotal: 7,
  };
}

describe('SnapshotPivotView (F116)', () => {
  beforeEach(() => vi.clearAllMocks());
  afterEach(() => cleanup());

  it('載入樞紐、顯示部門與員編（+姓名），第一部門預設展開', async () => {
    mockedGetPivot.mockResolvedValue(pivot());
    render(<SnapshotPivotView runId="R001" />);
    await waitFor(() => expect(screen.getByTestId('pivot-table')).toBeInTheDocument());
    expect(mockedGetPivot).toHaveBeenCalledWith('R001');
    expect(screen.getByText('中區電銷1')).toBeInTheDocument();
    expect(screen.getByText('北區電銷1')).toBeInTheDocument();
    // 第一部門展開 → 員編 + 姓名可見
    expect(screen.getByText('王大明')).toBeInTheDocument();
    expect(screen.getByText('林淑芬')).toBeInTheDocument();
    // 第二部門收合 → 其員編隱藏
    expect(screen.queryByText('陳志明')).not.toBeInTheDocument();
    // 欄（名單代號）+ 總計
    expect(screen.getByText('OB1')).toBeInTheDocument();
    expect(screen.getAllByText('總計').length).toBeGreaterThan(0);
  });

  it('展開第二部門 → 顯示其員編', async () => {
    mockedGetPivot.mockResolvedValue(pivot());
    render(<SnapshotPivotView runId="R001" />);
    await waitFor(() => expect(screen.getByTestId('pivot-table')).toBeInTheDocument());
    fireEvent.click(screen.getByTestId('pivot-dept-北區電銷1'));
    await waitFor(() => expect(screen.getByText('陳志明')).toBeInTheDocument());
  });

  it('計數 / 佔比 toggle：切至佔比顯示百分比', async () => {
    mockedGetPivot.mockResolvedValue(pivot());
    render(<SnapshotPivotView runId="R001" />);
    await waitFor(() => expect(screen.getByTestId('pivot-table')).toBeInTheDocument());
    // 預設計數：不應有 %
    expect(screen.queryByText(/%/)).not.toBeInTheDocument();
    fireEvent.click(screen.getByTestId('pivot-mode-pct'));
    await waitFor(() => expect(screen.getAllByText(/%/).length).toBeGreaterThan(0));
  });

  it('全部收合 / 全部展開', async () => {
    mockedGetPivot.mockResolvedValue(pivot());
    render(<SnapshotPivotView runId="R001" />);
    await waitFor(() => expect(screen.getByTestId('pivot-table')).toBeInTheDocument());
    fireEvent.click(screen.getByTestId('pivot-collapse-all'));
    expect(screen.queryByText('王大明')).not.toBeInTheDocument();
    fireEvent.click(screen.getByTestId('pivot-expand-all'));
    await waitFor(() => expect(screen.getByText('陳志明')).toBeInTheDocument());
    expect(screen.getByText('王大明')).toBeInTheDocument();
  });

  it('空結果顯示空狀態', async () => {
    mockedGetPivot.mockResolvedValue({
      runId: 'R001',
      listNos: [],
      depts: [],
      grandByList: {},
      grandTotal: 0,
    });
    render(<SnapshotPivotView runId="R001" />);
    await waitFor(() => expect(screen.getByTestId('pivot-empty')).toBeInTheDocument());
  });
});
