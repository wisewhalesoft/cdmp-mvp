import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import { AppSidebar, getVisibleMenuItems, MENU_SECTIONS } from '../app-sidebar';

function renderSidebar(props: {
  role: 'admin' | 'user';
  isSalesManager: boolean;
}) {
  return render(
    <MemoryRouter>
      <AppSidebar role={props.role} isSalesManager={props.isSalesManager} />
    </MemoryRouter>,
  );
}

describe('getVisibleMenuItems (pure function)', () => {
  // T-009（新增）：admin 看到全部
  it('admin → 顯示全部群組與項目（資料治理 + 應用模組 + 客戶名單分派）', () => {
    const visible = getVisibleMenuItems('admin', false);
    const allLabels = visible.flatMap((sec) => [
      ...(sec.items?.map((i) => i.label) ?? []),
      ...sec.groups.flatMap((g) => g.items.map((i) => i.label)),
    ]);
    expect(allLabels).toContain('帳號管理');
    expect(allLabels).toContain('資料來源');
    expect(allLabels).toContain('資料擷取');
    expect(allLabels).toContain('ETL Pipeline');
    expect(allLabels).toContain('Customer 360');
    expect(allLabels).toContain('代碼維護');
    expect(allLabels).toContain('名單定義');
  });

  // T-010（新增）：sales manager 看 Customer 360 + 客戶名單分派（但不見資料治理）
  it('業務主管（user + isSalesManager=true） → Customer 360 + 客戶名單分派，無資料治理', () => {
    const visible = getVisibleMenuItems('user', true);
    const allLabels = visible.flatMap((sec) => [
      ...(sec.items?.map((i) => i.label) ?? []),
      ...sec.groups.flatMap((g) => g.items.map((i) => i.label)),
    ]);
    expect(allLabels).toContain('Customer 360');
    expect(allLabels).toContain('代碼維護');
    expect(allLabels).toContain('名單定義');
    expect(allLabels).not.toContain('帳號管理');
    expect(allLabels).not.toContain('資料來源');
    expect(allLabels).not.toContain('資料擷取');
    expect(allLabels).not.toContain('ETL Pipeline');
  });

  // T-011（新增）：一般 user 僅 Customer 360
  it('一般使用者（user + isSalesManager=false） → 僅 Customer 360', () => {
    const visible = getVisibleMenuItems('user', false);
    const allLabels = visible.flatMap((sec) => [
      ...(sec.items?.map((i) => i.label) ?? []),
      ...sec.groups.flatMap((g) => g.items.map((i) => i.label)),
    ]);
    expect(allLabels).toContain('Customer 360');
    expect(allLabels).not.toContain('帳號管理');
    expect(allLabels).not.toContain('代碼維護');
    expect(allLabels).not.toContain('名單定義');
  });

  it('menu 設定中 11 個 E07 子項全部存在於 sales_manager 分派群組', () => {
    const sm = getVisibleMenuItems('user', true);
    const assignmentGroup = sm
      .flatMap((s) => s.groups)
      .find((g) => g.label === '客戶名單分派');
    expect(assignmentGroup).toBeDefined();
    expect(assignmentGroup!.items.length).toBe(11);
  });

  it('MENU_SECTIONS 為宣告式陣列且 immutable structure', () => {
    expect(Array.isArray(MENU_SECTIONS)).toBe(true);
    // 至少包含「資料治理」與「應用模組」兩個 section
    const labels = MENU_SECTIONS.map((s) => s.label);
    expect(labels).toContain('資料治理');
    expect(labels).toContain('應用模組');
  });
});

describe('AppSidebar (component)', () => {
  // T-009（新增）：admin sidebar 顯示全部
  it('admin sidebar 顯示完整 menu（DOM）', () => {
    renderSidebar({ role: 'admin', isSalesManager: false });
    expect(screen.getByText('帳號管理')).toBeInTheDocument();
    expect(screen.getByText('資料來源')).toBeInTheDocument();
    expect(screen.getByText('資料擷取')).toBeInTheDocument();
    expect(screen.getByText('ETL Pipeline')).toBeInTheDocument();
    expect(screen.getByText('Customer 360')).toBeInTheDocument();
    expect(screen.getByText('客戶名單分派')).toBeInTheDocument();
  });

  // T-010（新增）：sales manager sidebar 顯示 Customer 360 + 客戶名單分派群組
  it('業務主管 sidebar 顯示 Customer 360 + 客戶名單分派，不顯示資料治理', () => {
    renderSidebar({ role: 'user', isSalesManager: true });
    expect(screen.getByText('Customer 360')).toBeInTheDocument();
    expect(screen.getByText('客戶名單分派')).toBeInTheDocument();
    expect(screen.queryByText('帳號管理')).toBeNull();
    expect(screen.queryByText('資料來源')).toBeNull();
    expect(screen.queryByText('資料擷取')).toBeNull();
    expect(screen.queryByText('ETL Pipeline')).toBeNull();
  });

  // T-011（新增）：一般 user sidebar 僅 Customer 360
  it('一般使用者 sidebar 僅顯示 Customer 360', () => {
    renderSidebar({ role: 'user', isSalesManager: false });
    expect(screen.getByText('Customer 360')).toBeInTheDocument();
    expect(screen.queryByText('客戶名單分派')).toBeNull();
    expect(screen.queryByText('帳號管理')).toBeNull();
  });

  // T-012（新增）：不可見項目完全不渲染 DOM（非 disabled、非 hidden）
  it('一般使用者：DOM 中無「客戶名單分派」或 admin 群組節點（完全不渲染）', () => {
    const { container } = renderSidebar({ role: 'user', isSalesManager: false });
    // 不可只是 hidden — 確認 DOM 不存在
    expect(container.textContent).not.toContain('客戶名單分派');
    expect(container.textContent).not.toContain('帳號管理');
    expect(container.textContent).not.toContain('資料來源');
    expect(container.textContent).not.toContain('資料擷取');
    expect(container.textContent).not.toContain('ETL Pipeline');
    expect(container.textContent).not.toContain('代碼維護');
    expect(container.textContent).not.toContain('名單定義');
  });

  it('品牌標題「CDMP」存在', () => {
    renderSidebar({ role: 'admin', isSalesManager: false });
    expect(screen.getByText('CDMP')).toBeInTheDocument();
  });
});
