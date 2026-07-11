/**
 * F077 v1.3 BR-7 Role × Stage 操作矩陣 — 5 stage × 4 role 渲染驗證
 *
 * 對應 test spec：F077-test.md §一 矩陣測試（TS-F077-M-001 ~ M-015）
 *
 * 驗證原則（spec 第 50 行）：
 *   - 按鈕存在：getByRole('button', { name: '...' })
 *   - 按鈕不存在：queryByRole('button', { name: '...' }) === null（DOM 不存在，非 disabled）
 *
 * 注意：
 *   - admin / director 操作完全相同（M-001 vs M-002 / M-004 vs M-005 ...）
 *   - section_chief 在 personnel_ratio 階段有「設定本部門」按鈕（M-009）
 */

import { render, screen, cleanup } from '@testing-library/react';
import { describe, it, expect, afterEach } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import { RoleStageActions } from '../_components/RoleStageActions';
import type { AssignmentListItem } from '@/api/assignment-list';
import type { EffectiveIdentity } from '@cdmp/shared';

function makeList(stage: AssignmentListItem['stage'], listNo = 'OB202605001'): AssignmentListItem {
  return {
    listNo,
    listNm: 'Test',
    prodKind: null,
    caseYear: null,
    specTp: null,
    caseStatus: null,
    crEnabled: false,
    listPeriodStart: null,
    listPeriodEnd: null,
    listInterval: null,
    settleSrc: null,
    cardType: null,
    prodBest: null,
    status: 'active',
    stage,
    createdBy: 'u-1',
    createdAt: '2026-05-09T00:00:00Z',
    updatedAt: '2026-05-09T00:00:00Z',
    conditionPayload: null,
  };
}

function renderAt(
  stage: AssignmentListItem['stage'],
  identity: EffectiveIdentity,
  opts: { isHistorical?: boolean; isLocked?: boolean } = {},
) {
  return render(
    <MemoryRouter>
      <RoleStageActions
        list={makeList(stage)}
        identity={identity}
        isHistorical={opts.isHistorical ?? false}
        isLocked={opts.isLocked ?? false}
        onView={() => {}}
      />
    </MemoryRouter>,
  );
}

const TEST_ID = 'OB202605001';

afterEach(cleanup);

describe('F077 v1.3 — Role × Stage 矩陣（TS-F077-M-001~015）', () => {
  // ============================================================
  // draft 階段
  // ============================================================

  it('M-001 admin / draft → 編輯 / 推進 / 停用 / 查看', () => {
    renderAt('draft', 'admin');
    expect(screen.getByTestId(`btn-edit-${TEST_ID}`)).toBeTruthy();
    expect(screen.getByTestId(`btn-advance-${TEST_ID}`)).toBeTruthy();
    expect(screen.getByTestId(`btn-disable-${TEST_ID}`)).toBeTruthy();
    expect(screen.getByTestId(`btn-view-${TEST_ID}`)).toBeTruthy();
    // 「停用」按鈕全寫（F052 v2.1 AC-1）
    expect(screen.getByRole('button', { name: /停用/ })).toBeTruthy();
    expect(screen.queryByRole('button', { name: /^停$/ })).toBeNull();
    // 不應渲染其他寫入按鈕
    expect(screen.queryByTestId(`btn-configure-${TEST_ID}`)).toBeNull();
    expect(screen.queryByTestId(`btn-rollback-${TEST_ID}`)).toBeNull();
  });

  it('M-002 director / draft → 編輯 / 推進 / 停用 / 查看（與 admin 相同）', () => {
    renderAt('draft', 'director');
    expect(screen.getByTestId(`btn-edit-${TEST_ID}`)).toBeTruthy();
    expect(screen.getByTestId(`btn-advance-${TEST_ID}`)).toBeTruthy();
    expect(screen.getByTestId(`btn-disable-${TEST_ID}`)).toBeTruthy();
    expect(screen.getByTestId(`btn-view-${TEST_ID}`)).toBeTruthy();
  });

  it('M-003 section_chief / draft → 僅查看，其他寫入按鈕 DOM 不存在', () => {
    renderAt('draft', 'section_chief');
    expect(screen.getByTestId(`btn-view-${TEST_ID}`)).toBeTruthy();
    expect(screen.queryByTestId(`btn-edit-${TEST_ID}`)).toBeNull();
    expect(screen.queryByTestId(`btn-disable-${TEST_ID}`)).toBeNull();
    expect(screen.queryByTestId(`btn-advance-${TEST_ID}`)).toBeNull();
  });

  // ============================================================
  // dept_ratio 階段
  // ============================================================

  it('M-004 admin / dept_ratio → 設定 / 退回 / 查看', () => {
    renderAt('dept_ratio', 'admin');
    expect(screen.getByTestId(`btn-configure-${TEST_ID}`)).toBeTruthy();
    expect(screen.getByTestId(`btn-rollback-${TEST_ID}`)).toBeTruthy();
    expect(screen.getByTestId(`btn-view-${TEST_ID}`)).toBeTruthy();
    expect(screen.queryByTestId(`btn-edit-${TEST_ID}`)).toBeNull();
    expect(screen.queryByTestId(`btn-advance-${TEST_ID}`)).toBeNull();
    expect(screen.queryByTestId(`btn-disable-${TEST_ID}`)).toBeNull();
  });

  it('M-005 director / dept_ratio → 設定 / 退回 / 查看', () => {
    renderAt('dept_ratio', 'director');
    expect(screen.getByTestId(`btn-configure-${TEST_ID}`)).toBeTruthy();
    expect(screen.getByTestId(`btn-rollback-${TEST_ID}`)).toBeTruthy();
    expect(screen.getByTestId(`btn-view-${TEST_ID}`)).toBeTruthy();
  });

  it('M-006 section_chief / dept_ratio → 僅查看', () => {
    renderAt('dept_ratio', 'section_chief');
    expect(screen.getByTestId(`btn-view-${TEST_ID}`)).toBeTruthy();
    expect(screen.queryByTestId(`btn-configure-${TEST_ID}`)).toBeNull();
    expect(screen.queryByTestId(`btn-rollback-${TEST_ID}`)).toBeNull();
  });

  // ============================================================
  // personnel_ratio 階段
  // ============================================================

  it('M-007 admin / personnel_ratio → 檢視 / 退回 / 查看 / 快速模板', () => {
    renderAt('personnel_ratio', 'admin');
    expect(screen.getByTestId(`btn-review-${TEST_ID}`)).toBeTruthy();
    expect(screen.getByTestId(`btn-rollback-${TEST_ID}`)).toBeTruthy();
    expect(screen.getByTestId(`btn-view-${TEST_ID}`)).toBeTruthy();
    expect(screen.getByTestId(`btn-quick-template-${TEST_ID}`)).toBeTruthy();
    expect(screen.queryByTestId(`btn-set-my-dept-${TEST_ID}`)).toBeNull();
  });

  it('M-008 director / personnel_ratio → 檢視 / 退回 / 查看 / 快速模板', () => {
    renderAt('personnel_ratio', 'director');
    expect(screen.getByTestId(`btn-review-${TEST_ID}`)).toBeTruthy();
    expect(screen.getByTestId(`btn-rollback-${TEST_ID}`)).toBeTruthy();
    expect(screen.getByTestId(`btn-quick-template-${TEST_ID}`)).toBeTruthy();
  });

  it('M-009 section_chief / personnel_ratio → 設定本部門 / 查看；無退回 / 快速模板', () => {
    renderAt('personnel_ratio', 'section_chief');
    expect(screen.getByTestId(`btn-set-my-dept-${TEST_ID}`)).toBeTruthy();
    expect(screen.getByTestId(`btn-view-${TEST_ID}`)).toBeTruthy();
    expect(screen.queryByTestId(`btn-rollback-${TEST_ID}`)).toBeNull();
    expect(screen.queryByTestId(`btn-quick-template-${TEST_ID}`)).toBeNull();
  });

  // ============================================================
  // approval 階段
  // ============================================================

  it('M-010 admin / approval → 核准 / 拒絕 / 查看', () => {
    renderAt('approval', 'admin');
    expect(screen.getByTestId(`btn-approve-${TEST_ID}`)).toBeTruthy();
    expect(screen.getByTestId(`btn-reject-${TEST_ID}`)).toBeTruthy();
    expect(screen.getByTestId(`btn-view-${TEST_ID}`)).toBeTruthy();
    expect(screen.queryByTestId(`btn-configure-${TEST_ID}`)).toBeNull();
    expect(screen.queryByTestId(`btn-rollback-${TEST_ID}`)).toBeNull();
    expect(screen.queryByTestId(`btn-advance-${TEST_ID}`)).toBeNull();
  });

  it('M-011 director / approval → 核准 / 拒絕 / 查看', () => {
    renderAt('approval', 'director');
    expect(screen.getByTestId(`btn-approve-${TEST_ID}`)).toBeTruthy();
    expect(screen.getByTestId(`btn-reject-${TEST_ID}`)).toBeTruthy();
  });

  it('M-012 section_chief / approval → 僅查看', () => {
    renderAt('approval', 'section_chief');
    expect(screen.getByTestId(`btn-view-${TEST_ID}`)).toBeTruthy();
    expect(screen.queryByTestId(`btn-approve-${TEST_ID}`)).toBeNull();
    expect(screen.queryByTestId(`btn-reject-${TEST_ID}`)).toBeNull();
  });

  // ============================================================
  // ready 階段
  // ============================================================

  it('M-013 admin / ready → 退回 / 查看；無 per-card 月名單分派觸發按鈕', () => {
    renderAt('ready', 'admin');
    expect(screen.getByTestId(`btn-rollback-${TEST_ID}`)).toBeTruthy();
    expect(screen.getByTestId(`btn-view-${TEST_ID}`)).toBeTruthy();
    // 月名單分派觸發為 Ready 欄頂 CTA Banner（單一入口），per-card 不渲染
    expect(screen.queryByTestId(`btn-trigger-run-${TEST_ID}`)).toBeNull();
  });

  it('M-014 director / ready → 退回 / 查看', () => {
    renderAt('ready', 'director');
    expect(screen.getByTestId(`btn-rollback-${TEST_ID}`)).toBeTruthy();
    expect(screen.getByTestId(`btn-view-${TEST_ID}`)).toBeTruthy();
  });

  it('M-015 section_chief / ready → 僅查看', () => {
    renderAt('ready', 'section_chief');
    expect(screen.getByTestId(`btn-view-${TEST_ID}`)).toBeTruthy();
    expect(screen.queryByTestId(`btn-rollback-${TEST_ID}`)).toBeNull();
  });
});

describe('F077 v1.3 — 橫切條件（C-1 / C-2 / C-5）', () => {
  it('C1-001 歷史月份 → 所有寫入按鈕 DOM 不存在；查看保留', () => {
    renderAt('draft', 'director', { isHistorical: true });
    expect(screen.queryByTestId(`btn-edit-${TEST_ID}`)).toBeNull();
    expect(screen.queryByTestId(`btn-advance-${TEST_ID}`)).toBeNull();
    expect(screen.queryByTestId(`btn-disable-${TEST_ID}`)).toBeNull();
    expect(screen.getByTestId(`btn-view-${TEST_ID}`)).toBeTruthy();
  });

  it('C2-001 月名單分派鎖中 → 寫入按鈕 disabled；查看 enabled', () => {
    renderAt('draft', 'director', { isLocked: true });
    const editBtn = screen.getByTestId(`btn-edit-${TEST_ID}`) as HTMLButtonElement;
    const advanceBtn = screen.getByTestId(`btn-advance-${TEST_ID}`) as HTMLButtonElement;
    const disableBtn = screen.getByTestId(`btn-disable-${TEST_ID}`) as HTMLButtonElement;
    const viewBtn = screen.getByTestId(`btn-view-${TEST_ID}`) as HTMLButtonElement;
    expect(editBtn.disabled).toBe(true);
    expect(advanceBtn.disabled).toBe(true);
    expect(disableBtn.disabled).toBe(true);
    expect(viewBtn.disabled).toBe(false);
  });

  it('C5-001 月名單分派鎖 + 歷史月份雙重條件下，查看仍可點擊', () => {
    renderAt('approval', 'director', { isHistorical: true, isLocked: true });
    const viewBtn = screen.getByTestId(`btn-view-${TEST_ID}`) as HTMLButtonElement;
    expect(viewBtn).toBeTruthy();
    expect(viewBtn.disabled).toBe(false);
  });
});
