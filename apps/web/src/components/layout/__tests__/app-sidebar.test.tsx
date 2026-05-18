import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import type { BusinessRole } from '@cdmp/shared';
import { AppSidebar, getVisibleMenuItems, MENU_SECTIONS } from '../app-sidebar';

function renderSidebar(props: {
  role: 'admin' | 'user';
  businessRole: BusinessRole;
}) {
  return render(
    <MemoryRouter>
      <AppSidebar role={props.role} businessRole={props.businessRole} />
    </MemoryRouter>,
  );
}

describe('getVisibleMenuItems (pure function) — F002 v2.0 / AD-E07 v3.0', () => {
  it('admin → 顯示全部群組與項目（資料治理 + 應用模組 + 客戶名單分派）', () => {
    const visible = getVisibleMenuItems('admin', null);
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
    expect(allLabels).toContain('計分卡設定');
    expect(allLabels).toContain('名單定義');
  });

  it('業務部長（user + director） → Customer 360 + 客戶名單分派完整 11 子項，無資料治理', () => {
    const visible = getVisibleMenuItems('user', 'director');
    const allLabels = visible.flatMap((sec) => [
      ...(sec.items?.map((i) => i.label) ?? []),
      ...sec.groups.flatMap((g) => g.items.map((i) => i.label)),
    ]);
    expect(allLabels).toContain('Customer 360');
    expect(allLabels).toContain('代碼維護');
    expect(allLabels).toContain('計分卡設定');
    expect(allLabels).toContain('名單定義');
    expect(allLabels).toContain('Stage 0 試算');
    expect(allLabels).toContain('觸發月跑');
    expect(allLabels).not.toContain('帳號管理');
    expect(allLabels).not.toContain('資料來源');
    expect(allLabels).not.toContain('資料擷取');
    expect(allLabels).not.toContain('ETL Pipeline');
  });

  it('業務處長（user + section_chief） → M02 計分卡 / Stage 0 試算 / 觸發月跑 隱藏；其他 E07 子項可見', () => {
    const visible = getVisibleMenuItems('user', 'section_chief');
    const allLabels = visible.flatMap((sec) => [
      ...(sec.items?.map((i) => i.label) ?? []),
      ...sec.groups.flatMap((g) => g.items.map((i) => i.label)),
    ]);
    // 可見
    expect(allLabels).toContain('Customer 360');
    expect(allLabels).toContain('代碼維護');
    expect(allLabels).toContain('名單定義');
    expect(allLabels).toContain('執行進度');
    expect(allLabels).toContain('執行歷史');
    // 不可見（director_only）
    expect(allLabels).not.toContain('計分卡設定');
    expect(allLabels).not.toContain('Stage 0 試算');
    expect(allLabels).not.toContain('觸發月跑');
    // 不可見（admin 專屬）
    expect(allLabels).not.toContain('帳號管理');
  });

  it('一般使用者（user + null） → 僅 Customer 360', () => {
    const visible = getVisibleMenuItems('user', null);
    const allLabels = visible.flatMap((sec) => [
      ...(sec.items?.map((i) => i.label) ?? []),
      ...sec.groups.flatMap((g) => g.items.map((i) => i.label)),
    ]);
    expect(allLabels).toContain('Customer 360');
    expect(allLabels).not.toContain('帳號管理');
    expect(allLabels).not.toContain('代碼維護');
    expect(allLabels).not.toContain('名單定義');
    expect(allLabels).not.toContain('計分卡設定');
  });

  it('menu 設定中 12 個 E07 子項（含新增篩選欄位管理、準備完成名單；比例設定已移除）', () => {
    const directorView = getVisibleMenuItems('user', 'director');
    const assignmentGroup = directorView
      .flatMap((s) => s.groups)
      .find((g) => g.label === '客戶名單分派');
    expect(assignmentGroup).toBeDefined();
    // 10 個（v3.3）+ 1 個篩選欄位管理 + 1 個準備完成名單 = 12（F075 v1.4 命名改造）
    expect(assignmentGroup!.items.length).toBe(12);
    const labels = assignmentGroup!.items.map((i) => i.label);
    expect(labels).toContain('篩選欄位管理');
    expect(labels).toContain('準備完成名單');
  });

  it('MENU_SECTIONS 為宣告式陣列且 immutable structure', () => {
    expect(Array.isArray(MENU_SECTIONS)).toBe(true);
    const labels = MENU_SECTIONS.map((s) => s.label);
    expect(labels).toContain('資料治理');
    expect(labels).toContain('應用模組');
  });
});

describe('AppSidebar (component)', () => {
  it('admin sidebar 顯示完整 menu（DOM）', () => {
    renderSidebar({ role: 'admin', businessRole: null });
    expect(screen.getByText('帳號管理')).toBeInTheDocument();
    expect(screen.getByText('資料來源')).toBeInTheDocument();
    expect(screen.getByText('資料擷取')).toBeInTheDocument();
    expect(screen.getByText('ETL Pipeline')).toBeInTheDocument();
    expect(screen.getByText('Customer 360')).toBeInTheDocument();
    expect(screen.getByText('客戶名單分派')).toBeInTheDocument();
  });

  it('業務部長 sidebar 顯示 Customer 360 + 客戶名單分派，不顯示資料治理', () => {
    renderSidebar({ role: 'user', businessRole: 'director' });
    expect(screen.getByText('Customer 360')).toBeInTheDocument();
    expect(screen.getByText('客戶名單分派')).toBeInTheDocument();
    expect(screen.queryByText('帳號管理')).toBeNull();
    expect(screen.queryByText('資料來源')).toBeNull();
    expect(screen.queryByText('資料擷取')).toBeNull();
    expect(screen.queryByText('ETL Pipeline')).toBeNull();
  });

  it('業務處長 sidebar 客戶名單分派可見但不含 director_only 子項', () => {
    renderSidebar({ role: 'user', businessRole: 'section_chief' });
    expect(screen.getByText('客戶名單分派')).toBeInTheDocument();
    expect(screen.queryByText('計分卡設定')).toBeNull();
    expect(screen.queryByText('Stage 0 試算')).toBeNull();
    expect(screen.queryByText('觸發月跑')).toBeNull();
  });

  it('一般使用者 sidebar 僅顯示 Customer 360', () => {
    renderSidebar({ role: 'user', businessRole: null });
    expect(screen.getByText('Customer 360')).toBeInTheDocument();
    expect(screen.queryByText('客戶名單分派')).toBeNull();
    expect(screen.queryByText('帳號管理')).toBeNull();
  });

  it('一般使用者：DOM 中無「客戶名單分派」或 admin 群組節點（完全不渲染）', () => {
    const { container } = renderSidebar({ role: 'user', businessRole: null });
    expect(container.textContent).not.toContain('客戶名單分派');
    expect(container.textContent).not.toContain('帳號管理');
    expect(container.textContent).not.toContain('資料來源');
    expect(container.textContent).not.toContain('資料擷取');
    expect(container.textContent).not.toContain('ETL Pipeline');
    expect(container.textContent).not.toContain('代碼維護');
    expect(container.textContent).not.toContain('名單定義');
  });

  it('品牌標題「CDMP」存在', () => {
    renderSidebar({ role: 'admin', businessRole: null });
    expect(screen.getByText('CDMP')).toBeInTheDocument();
  });
});
