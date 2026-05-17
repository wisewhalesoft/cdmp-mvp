import { describe, it, expect } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { PersonnelRatioAccordion } from '../personnel-ratio-accordion';

/**
 * 29b/29c 多部門 accordion 包裝器
 *
 * 設計：
 *   - 接 dept list，每個 dept 渲染一個可摺疊 panel
 *   - panel header 顯示 dept 名稱 + 該 dept 加總狀態 (sum / complete)
 *   - panel body 由父層 renderDept callback 提供
 *   - 全部展開 / 全部摺疊
 *   - 個別 dept 也可獨立 toggle
 */

const DEPTS = [
  { deptCode: 'D01', deptName: '北一處', sum: 100, complete: true },
  { deptCode: 'D02', deptName: '北二處', sum: 95, complete: false },
  { deptCode: 'D03', deptName: '南一處', sum: 100, complete: true },
];

describe('PersonnelRatioAccordion', () => {
  it('渲染所有 dept 為 accordion header', () => {
    render(
      <PersonnelRatioAccordion
        depts={DEPTS}
        renderDept={(d) => <div>Content for {d.deptCode}</div>}
      />,
    );
    expect(screen.getByText(/北一處/)).toBeInTheDocument();
    expect(screen.getByText(/北二處/)).toBeInTheDocument();
    expect(screen.getByText(/南一處/)).toBeInTheDocument();
  });

  it('每個 dept header 顯示加總百分比', () => {
    render(
      <PersonnelRatioAccordion
        depts={DEPTS}
        renderDept={(d) => <div>{d.deptCode}</div>}
      />,
    );
    const d01 = screen.getByTestId('dept-accordion-header-D01');
    expect(d01.textContent).toContain('100');
    const d02 = screen.getByTestId('dept-accordion-header-D02');
    expect(d02.textContent).toContain('95');
  });

  it('complete=true 顯示已完成標記', () => {
    render(
      <PersonnelRatioAccordion
        depts={DEPTS}
        renderDept={(d) => <div>{d.deptCode}</div>}
      />,
    );
    const d01 = screen.getByTestId('dept-accordion-header-D01');
    expect(d01.textContent).toMatch(/完成|✓/);
  });

  it('預設全部展開：所有 dept content 可見', () => {
    render(
      <PersonnelRatioAccordion
        depts={DEPTS}
        renderDept={(d) => <div>Content for {d.deptCode}</div>}
        defaultOpen
      />,
    );
    expect(screen.getByText('Content for D01')).toBeInTheDocument();
    expect(screen.getByText('Content for D02')).toBeInTheDocument();
    expect(screen.getByText('Content for D03')).toBeInTheDocument();
  });

  it('預設全部摺疊：content 隱藏', () => {
    render(
      <PersonnelRatioAccordion
        depts={DEPTS}
        renderDept={(d) => <div>Content for {d.deptCode}</div>}
        defaultOpen={false}
      />,
    );
    expect(screen.queryByText('Content for D01')).not.toBeInTheDocument();
  });

  it('點 dept header 展開 / 折疊該 dept', () => {
    render(
      <PersonnelRatioAccordion
        depts={DEPTS}
        renderDept={(d) => <div>Content for {d.deptCode}</div>}
        defaultOpen={false}
      />,
    );
    fireEvent.click(screen.getByTestId('dept-accordion-header-D01'));
    expect(screen.getByText('Content for D01')).toBeInTheDocument();
    expect(screen.queryByText('Content for D02')).not.toBeInTheDocument();
  });

  it('「全部展開」按鈕展開所有 dept', () => {
    render(
      <PersonnelRatioAccordion
        depts={DEPTS}
        renderDept={(d) => <div>Content for {d.deptCode}</div>}
        defaultOpen={false}
      />,
    );
    fireEvent.click(screen.getByText('全部展開'));
    expect(screen.getByText('Content for D01')).toBeInTheDocument();
    expect(screen.getByText('Content for D02')).toBeInTheDocument();
    expect(screen.getByText('Content for D03')).toBeInTheDocument();
  });

  it('「全部摺疊」按鈕關閉所有 dept', () => {
    render(
      <PersonnelRatioAccordion
        depts={DEPTS}
        renderDept={(d) => <div>Content for {d.deptCode}</div>}
        defaultOpen
      />,
    );
    fireEvent.click(screen.getByText('全部摺疊'));
    expect(screen.queryByText('Content for D01')).not.toBeInTheDocument();
  });

  it('depts = [] 顯示「無部門」訊息', () => {
    render(
      <PersonnelRatioAccordion
        depts={[]}
        renderDept={() => <div />}
      />,
    );
    expect(screen.getByText(/無部門|尚無/)).toBeInTheDocument();
  });

  it('顯示整體完成進度（X / Y）', () => {
    render(
      <PersonnelRatioAccordion
        depts={DEPTS}
        renderDept={(d) => <div>{d.deptCode}</div>}
        showProgress
      />,
    );
    const prog = screen.getByTestId('overall-progress');
    expect(prog.textContent).toContain('2');
    expect(prog.textContent).toContain('3');
  });
});
