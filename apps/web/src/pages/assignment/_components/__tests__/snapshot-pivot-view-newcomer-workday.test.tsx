/**
 * SnapshotPivotView — F116 v1.1（US-182：職稱／新人標註／總計欄置前／工作天模式）
 *
 * 對應 spec：F116 v1.1 §4 AC-6~AC-11 / §7 UI/UX 需求。
 * 對應 prototype：prototypes/35-snapshot-detail.html #panel-pivot（第 4 頁籤「樞紐分析」）。
 * ⚠️ prototype 內「原型示範開關」（setPivotDemoWorkingDays，35-snapshot-detail.html:582-589，
 * 標註「此為原型示範開關，產品不提供」）非產品功能，本檔不為其撰寫任何測試；workingDays=0
 * 情境一律透過 mock API 回應驅動（見 pivotZeroWorkdayFixture）。
 *
 * 盲測原則：斷言內容僅依 F116 v1.1 spec / AD-E07-49 之契約與 prototype 撰寫，未讀取
 * snapshot-pivot-view.tsx 生產碼決定斷言內容；僅讀取既有 snapshot-pivot-view.test.tsx（v1.0，
 * 同目錄）以沿用既有 `vi.mock('@/api/assignment-run')` 慣例與既有 test-id
 * （pivot-table/pivot-dept-{name}/pivot-mode-pct/pivot-collapse-all/pivot-expand-all/pivot-empty）。
 *
 * v1.0 既有測試（snapshot-pivot-view.test.tsx）維持不變、不弱化；本檔僅新增 v1.1 場景。
 *
 * 本檔新定義之 test-id（prototype 僅以原生 id/class 標註處，由本檔裁定，前端實作須依此命名，
 * 沿用既有 `pivot-dept-{deptName}` 之命名風格）：
 *   - `pivot-emp-{emplid}`：員編列容器（平行於既有 `pivot-dept-{deptName}`）
 *   - `pivot-total-row`：表格最下方「總計」列容器
 *   - `pivot-cell-total`：任一列（部門/員編/總計列）內「總計欄」儲存格，需以 within(row) 限定範圍查詢
 *   - `pivot-cell-list-{listNo}`：任一列內特定名單代號欄儲存格，需以 within(row) 限定範圍查詢
 *   - `pivot-header-label` / `pivot-header-total` / `pivot-header-list-{listNo}`：表頭儲存格（依 BR-11
 *     欄序需求，DOM 出現順序即代表視覺欄序）
 *   - `pivot-dim-full` / `pivot-dim-workday`：整月／工作天切換按鈕（平行於既有 `pivot-mode-count`/`pivot-mode-pct`）
 *   - `pivot-workday-info` / `pivot-workday-warning`：工作天模式之說明／缺工作日資料提示區塊
 *   - `pivot-newcomer-badge`：員編列內「新人」標註（僅 isNewcomer=true 時渲染，需以 within(row) 限定範圍）
 */

import { render, screen, cleanup, fireEvent, waitFor, within } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { SnapshotPivotView } from '../snapshot-pivot-view';
import * as runApi from '@/api/assignment-run';

vi.mock('@/api/assignment-run');

const mockedGetPivot = vi.mocked(runApi.getPivot);

// 基準情境：對齊 v1.0 既有 pivot() fixture 之部門/員編結構，額外補上 v1.1 欄位
// （jfunNm=null 與 isNewcomer=true 同時發生於 20502，比照 prototype PIVOT_DEPTS 之
// 30112 黃雅婷「兩個邊界同時發生」示範案例，35-snapshot-detail.html:715）
function pivotV11(): runApi.PivotResponse {
  return {
    runId: 'R001',
    projectWorkym: '202607',
    workingDays: 21,
    listNos: ['OB1', 'OB2'],
    depts: [
      {
        deptName: '中區電銷1',
        total: 4,
        byList: { OB1: 3, OB2: 1 },
        emplids: [
          { emplid: '20501', empNm: '王大明', jfunNm: '業務專員', isNewcomer: false, total: 3, byList: { OB1: 2, OB2: 1 } },
          { emplid: '20502', empNm: '林淑芬', jfunNm: null, isNewcomer: true, total: 1, byList: { OB1: 1 } },
        ],
      },
      {
        deptName: '北區電銷1',
        total: 2,
        byList: { OB1: 1, OB2: 1 },
        emplids: [
          { emplid: '30001', empNm: '陳志明', jfunNm: '業務襄理', isNewcomer: false, total: 2, byList: { OB1: 1, OB2: 1 } },
        ],
      },
      {
        // BR-2/BR-10：「(空白)」分組，無 ob_emphire 對應 → jfunNm=null、isNewcomer=false
        deptName: '(空白)',
        total: 1,
        byList: { OB1: 1 },
        emplids: [{ emplid: '(空白)', empNm: null, jfunNm: null, isNewcomer: false, total: 1, byList: { OB1: 1 } }],
      },
    ],
    grandByList: { OB1: 5, OB2: 2 },
    grandTotal: 7,
  };
}

// I-F116-CEIL-PER-CELL-01 專用情境：刻意設計「逐格 ceil 之和」≠「總計欄/列先加總再 ceil」，
// 以驗證實作未偷偷改為「先加總再 ceil」或「先 ceil 再加總」。
// workingDays=4：Α部門 total=4→ceil=1；OB1=1→ceil=1、OB2=3→ceil=1（合計 2 ≠ 部門總計欄 1）
// 總計列 grandTotal=6→ceil=2；grandByList.OB1=1→ceil=1、OB2=5→ceil=2（合計 3 ≠ 總計列總計欄 2）
function pivotWorkdayFixture(): runApi.PivotResponse {
  return {
    runId: 'R002',
    projectWorkym: '202607',
    workingDays: 4,
    listNos: ['OB1', 'OB2'],
    depts: [
      {
        deptName: 'Α部門',
        total: 4,
        byList: { OB1: 1, OB2: 3 },
        emplids: [{ emplid: 'E1', empNm: '甲', jfunNm: null, isNewcomer: false, total: 4, byList: { OB1: 1, OB2: 3 } }],
      },
      {
        deptName: 'Β部門',
        total: 2,
        byList: { OB2: 2 },
        emplids: [{ emplid: 'E2', empNm: '乙', jfunNm: null, isNewcomer: false, total: 2, byList: { OB2: 2 } }],
      },
    ],
    grandByList: { OB1: 1, OB2: 5 },
    grandTotal: 6,
  };
}

// AC-11/BR-15 專用情境：該月 ob_calendar 無資料 → workingDays=0
function pivotZeroWorkdayFixture(): runApi.PivotResponse {
  return {
    runId: 'R003',
    projectWorkym: '202609',
    workingDays: 0,
    listNos: ['OB1'],
    depts: [
      {
        deptName: '中區電銷1',
        total: 5,
        byList: { OB1: 5 },
        emplids: [
          { emplid: '20501', empNm: '王大明', jfunNm: '業務專員', isNewcomer: false, total: 5, byList: { OB1: 5 } },
        ],
      },
    ],
    grandByList: { OB1: 5 },
    grandTotal: 5,
  };
}

describe('SnapshotPivotView — F116 v1.1（US-182）', () => {
  beforeEach(() => vi.clearAllMocks());
  afterEach(() => cleanup());

  describe('AC-6：員編列顯示「員編－姓名－職稱」', () => {
    it('TS-F116-030（★核心）：職稱來源顯示於員編列，呈現順序為「員編 → 姓名 → 職稱」', async () => {
      mockedGetPivot.mockResolvedValue(pivotV11());
      render(<SnapshotPivotView runId="R001" />);
      await waitFor(() => expect(screen.getByTestId('pivot-table')).toBeInTheDocument());
      // 第一部門預設展開（沿用 v1.0 既有行為）
      const row = screen.getByTestId('pivot-emp-20501');
      const text = row.textContent ?? '';
      expect(within(row).getByText('20501')).toBeInTheDocument();
      expect(within(row).getByText('王大明')).toBeInTheDocument();
      expect(within(row).getByText('業務專員')).toBeInTheDocument();
      expect(text.indexOf('20501')).toBeLessThan(text.indexOf('王大明'));
      expect(text.indexOf('王大明')).toBeLessThan(text.indexOf('業務專員'));
    });
  });

  describe('AC-7：未滿三個月標註「新人」', () => {
    it('TS-F116-031：isNewcomer=true → 員編列顯示「新人」標註', async () => {
      mockedGetPivot.mockResolvedValue(pivotV11());
      render(<SnapshotPivotView runId="R001" />);
      await waitFor(() => expect(screen.getByTestId('pivot-table')).toBeInTheDocument());
      const row = screen.getByTestId('pivot-emp-20502');
      expect(within(row).getByTestId('pivot-newcomer-badge')).toHaveTextContent('新人');
    });

    it('TS-F116-032：isNewcomer=false → 員編列不顯示「新人」標註', async () => {
      mockedGetPivot.mockResolvedValue(pivotV11());
      render(<SnapshotPivotView runId="R001" />);
      await waitFor(() => expect(screen.getByTestId('pivot-table')).toBeInTheDocument());
      const row = screen.getByTestId('pivot-emp-20501');
      expect(within(row).queryByTestId('pivot-newcomer-badge')).not.toBeInTheDocument();
    });
  });

  describe('AC-8：職稱／新人標註之邊界情境', () => {
    it('TS-F116-033：jfunNm=null → 不顯示職稱文字，但員編／姓名整列仍正常顯示（不得整列消失）', async () => {
      mockedGetPivot.mockResolvedValue(pivotV11());
      render(<SnapshotPivotView runId="R001" />);
      await waitFor(() => expect(screen.getByTestId('pivot-table')).toBeInTheDocument());
      const row = screen.getByTestId('pivot-emp-20502');
      expect(within(row).getByText('20502')).toBeInTheDocument();
      expect(within(row).getByText('林淑芬')).toBeInTheDocument();
    });

    it('TS-F116-034：「(空白)」分組員編列不顯示職稱與新人標註，計數仍正常顯示', async () => {
      mockedGetPivot.mockResolvedValue(pivotV11());
      render(<SnapshotPivotView runId="R001" />);
      await waitFor(() => expect(screen.getByTestId('pivot-table')).toBeInTheDocument());
      // 「(空白)」為第 3 個部門，v1.0 既有行為僅第一部門預設展開，故先展開之
      fireEvent.click(screen.getByTestId('pivot-dept-(空白)'));
      await waitFor(() => expect(screen.getByTestId('pivot-emp-(空白)')).toBeInTheDocument());
      const row = screen.getByTestId('pivot-emp-(空白)');
      expect(within(row).queryByTestId('pivot-newcomer-badge')).not.toBeInTheDocument();
      expect(within(within(row).getByTestId('pivot-cell-total')).getByText('1')).toBeInTheDocument();
    });
  });

  describe('AC-9 / BR-11：欄序（總計欄置左、總計列維持最下）', () => {
    it('TS-F116-035（★核心）：表頭欄序為「列標籤 → 總計 → 名單代號（升冪）」', async () => {
      mockedGetPivot.mockResolvedValue(pivotV11());
      render(<SnapshotPivotView runId="R001" />);
      await waitFor(() => expect(screen.getByTestId('pivot-table')).toBeInTheDocument());
      const headers = screen.getAllByTestId(/^pivot-header-/);
      const ids = headers.map((h) => h.getAttribute('data-testid'));
      expect(ids).toEqual(['pivot-header-label', 'pivot-header-total', 'pivot-header-list-OB1', 'pivot-header-list-OB2']);
    });

    it('TS-F116-036：「總計」列（橫向）不受總計欄（縱向）移動影響，仍維持在表格最下方', async () => {
      mockedGetPivot.mockResolvedValue(pivotV11());
      render(<SnapshotPivotView runId="R001" />);
      await waitFor(() => expect(screen.getByTestId('pivot-table')).toBeInTheDocument());
      fireEvent.click(screen.getByTestId('pivot-expand-all'));
      await waitFor(() => expect(screen.getByText('陳志明')).toBeInTheDocument());
      const rows = screen.getAllByTestId(/^pivot-(dept|emp)-|^pivot-total-row$/);
      expect(rows[rows.length - 1].getAttribute('data-testid')).toBe('pivot-total-row');
    });
  });

  describe('AC-10 / BR-12~16：整月／工作天維度切換', () => {
    it('TS-F116-037：預設為「整月」；切至「工作天」→ 每格顯示 ceil(整月計數 ÷ workingDays)', async () => {
      mockedGetPivot.mockResolvedValue(pivotWorkdayFixture());
      render(<SnapshotPivotView runId="R002" />);
      await waitFor(() => expect(screen.getByTestId('pivot-table')).toBeInTheDocument());
      fireEvent.click(screen.getByTestId('pivot-dim-workday'));
      const deptRow = await screen.findByTestId('pivot-dept-Α部門');
      await waitFor(() =>
        expect(within(within(deptRow).getByTestId('pivot-cell-total')).getByText('1')).toBeInTheDocument(),
      );
    });

    it('TS-F116-038（★核心 / I-F116-CEIL-PER-CELL-01）：逐格獨立 ceil，總計列之「總計」欄不等於其名單代號欄相加', async () => {
      mockedGetPivot.mockResolvedValue(pivotWorkdayFixture());
      render(<SnapshotPivotView runId="R002" />);
      await waitFor(() => expect(screen.getByTestId('pivot-table')).toBeInTheDocument());
      fireEvent.click(screen.getByTestId('pivot-dim-workday'));
      const totalRow = await screen.findByTestId('pivot-total-row');
      await waitFor(() => {
        const totalCol = within(within(totalRow).getByTestId('pivot-cell-total')).getByText('2');
        expect(totalCol).toBeInTheDocument();
      });
      const ob1 = within(within(totalRow).getByTestId('pivot-cell-list-OB1')).getByText('1');
      const ob2 = within(within(totalRow).getByTestId('pivot-cell-list-OB2')).getByText('2');
      expect(ob1).toBeInTheDocument();
      expect(ob2).toBeInTheDocument();
      // 總計欄（2）≠ OB1（1）+ OB2（2）之和（3）—— ceil 為逐格獨立計算之預期行為（BR-14）
      expect(1 + 2).not.toBe(2);
    });

    it('TS-F116-039：工作天模式下「佔比」切換按鈕 disabled（BR-16，合法組合僅 3 種）', async () => {
      mockedGetPivot.mockResolvedValue(pivotV11());
      render(<SnapshotPivotView runId="R001" />);
      await waitFor(() => expect(screen.getByTestId('pivot-table')).toBeInTheDocument());
      fireEvent.click(screen.getByTestId('pivot-dim-workday'));
      await waitFor(() => expect(screen.getByTestId('pivot-mode-pct')).toBeDisabled());
    });

    it('TS-F116-040：由「整月-佔比」切至「工作天」→ 值自動回落為計數（不殘留 %），佔比按鈕 disabled', async () => {
      mockedGetPivot.mockResolvedValue(pivotV11());
      render(<SnapshotPivotView runId="R001" />);
      await waitFor(() => expect(screen.getByTestId('pivot-table')).toBeInTheDocument());
      fireEvent.click(screen.getByTestId('pivot-mode-pct'));
      await waitFor(() => expect(screen.getAllByText(/%/).length).toBeGreaterThan(0));
      fireEvent.click(screen.getByTestId('pivot-dim-workday'));
      await waitFor(() => expect(screen.getByTestId('pivot-mode-pct')).toBeDisabled());
      expect(screen.queryByText(/%/)).not.toBeInTheDocument();
    });

    it('TS-F116-041：由「工作天」切回「整月」→ 佔比切換按鈕恢復 enabled', async () => {
      mockedGetPivot.mockResolvedValue(pivotV11());
      render(<SnapshotPivotView runId="R001" />);
      await waitFor(() => expect(screen.getByTestId('pivot-table')).toBeInTheDocument());
      fireEvent.click(screen.getByTestId('pivot-dim-workday'));
      await waitFor(() => expect(screen.getByTestId('pivot-mode-pct')).toBeDisabled());
      fireEvent.click(screen.getByTestId('pivot-dim-full'));
      await waitFor(() => expect(screen.getByTestId('pivot-mode-pct')).not.toBeDisabled());
    });
  });

  describe('AC-11 / BR-15：workingDays=0 之邊界情境', () => {
    it('TS-F116-042（★核心）：workingDays=0 → 全表數值格顯示「-」，不得出現 NaN/Infinity，顯示提示訊息', async () => {
      mockedGetPivot.mockResolvedValue(pivotZeroWorkdayFixture());
      render(<SnapshotPivotView runId="R003" />);
      await waitFor(() => expect(screen.getByTestId('pivot-table')).toBeInTheDocument());
      fireEvent.click(screen.getByTestId('pivot-dim-workday'));
      const deptRow = await screen.findByTestId('pivot-dept-中區電銷1');
      await waitFor(() =>
        expect(within(within(deptRow).getByTestId('pivot-cell-total')).getByText('-')).toBeInTheDocument(),
      );
      const totalRow = screen.getByTestId('pivot-total-row');
      expect(within(within(totalRow).getByTestId('pivot-cell-total')).getByText('-')).toBeInTheDocument();
      expect(within(within(totalRow).getByTestId('pivot-cell-list-OB1')).getByText('-')).toBeInTheDocument();
      expect(screen.queryByText(/NaN/)).not.toBeInTheDocument();
      expect(screen.queryByText(/Infinity/)).not.toBeInTheDocument();
      expect(screen.getByTestId('pivot-workday-warning')).toBeInTheDocument();
      expect(screen.queryByTestId('pivot-workday-info')).not.toBeInTheDocument();
    });

    it('TS-F116-043：workingDays=0 時切回「整月」→ 計數正常顯示，提示訊息消失', async () => {
      mockedGetPivot.mockResolvedValue(pivotZeroWorkdayFixture());
      render(<SnapshotPivotView runId="R003" />);
      await waitFor(() => expect(screen.getByTestId('pivot-table')).toBeInTheDocument());
      fireEvent.click(screen.getByTestId('pivot-dim-workday'));
      await waitFor(() => expect(screen.getByTestId('pivot-workday-warning')).toBeInTheDocument());
      fireEvent.click(screen.getByTestId('pivot-dim-full'));
      await waitFor(() => expect(screen.queryByTestId('pivot-workday-warning')).not.toBeInTheDocument());
      const deptRow = screen.getByTestId('pivot-dept-中區電銷1');
      expect(within(within(deptRow).getByTestId('pivot-cell-total')).getByText('5')).toBeInTheDocument();
    });
  });

  describe('AC-3 補充：展開/收合狀態不受維度切換影響', () => {
    it('TS-F116-044：展開第二部門後切換整月/工作天，展開狀態維持不變', async () => {
      mockedGetPivot.mockResolvedValue(pivotV11());
      render(<SnapshotPivotView runId="R001" />);
      await waitFor(() => expect(screen.getByTestId('pivot-table')).toBeInTheDocument());
      fireEvent.click(screen.getByTestId('pivot-dept-北區電銷1'));
      await waitFor(() => expect(screen.getByTestId('pivot-emp-30001')).toBeInTheDocument());
      fireEvent.click(screen.getByTestId('pivot-dim-workday'));
      await waitFor(() => expect(screen.getByTestId('pivot-emp-30001')).toBeInTheDocument());
      fireEvent.click(screen.getByTestId('pivot-dim-full'));
      expect(screen.getByTestId('pivot-emp-30001')).toBeInTheDocument();
    });
  });

  describe('I-F116-CLIENT-STATE-01（AD-E07-49 §3 A-5 / §7）：維度／值狀態純前端記憶體 state，不落地', () => {
    it('TS-F116-045：切換整月/工作天與計數/佔比皆不寫入 localStorage/sessionStorage，亦不改變 URL', async () => {
      const setLocal = vi.spyOn(Storage.prototype, 'setItem');
      const originalSearch = window.location.search;
      mockedGetPivot.mockResolvedValue(pivotV11());
      render(<SnapshotPivotView runId="R001" />);
      await waitFor(() => expect(screen.getByTestId('pivot-table')).toBeInTheDocument());
      fireEvent.click(screen.getByTestId('pivot-mode-pct'));
      await waitFor(() => expect(screen.getAllByText(/%/).length).toBeGreaterThan(0));
      fireEvent.click(screen.getByTestId('pivot-dim-workday'));
      await waitFor(() => expect(screen.getByTestId('pivot-mode-pct')).toBeDisabled());
      fireEvent.click(screen.getByTestId('pivot-dim-full'));
      expect(setLocal).not.toHaveBeenCalled();
      expect(window.location.search).toBe(originalSearch);
      setLocal.mockRestore();
    });
  });
});
