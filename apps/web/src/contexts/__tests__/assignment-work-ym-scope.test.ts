/**
 * F097 — AssignmentWorkYmContext 涵蓋範圍靜態驗證
 *
 * 涵蓋：
 *   - TS-F097-CTX-004：run-history 頁不 consume 共享 Context（獨立 local state）
 *   - TS-F097-DOWNSTREAM-004：下游結果頁（F062/F063/F066/F067）不 consume Context
 *   - TS-F097-LABEL-003：F097 未新增 E07 sidebar 路由（sidebar route 條目不變）
 *
 * 以原始碼掃描守命名 / 範圍 drift（依專案 feedback：不可僅靠 Grep tool，補 fs + regex regression guard）。
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const WEB_SRC = join(__dirname, '..', '..');

function read(relFromSrc: string): string {
  return readFileSync(join(WEB_SRC, relFromSrc), 'utf-8');
}

describe('F097 AssignmentWorkYmContext 涵蓋範圍（靜態）', () => {
  // TS-F097-CTX-004：run-history 不接 Context
  it('TS-F097-CTX-004：run-history-page 不引用 useAssignmentWorkYm / Context', () => {
    const src = read('pages/assignment/run-history-page.tsx');
    expect(src).not.toContain('useAssignmentWorkYm');
    expect(src).not.toContain('AssignmentWorkYmContext');
  });

  // TS-F097-DOWNSTREAM-004：下游四頁不接 Context
  it('TS-F097-DOWNSTREAM-004：下游結果頁（progress/summary/snapshot/compare）不引用 Context', () => {
    const downstream = [
      'pages/assignment/run-progress-page.tsx',
      'pages/assignment/run-summary-page.tsx',
      'pages/assignment/snapshot-detail-page.tsx',
      'pages/assignment/run-compare-page.tsx',
    ];
    for (const f of downstream) {
      const src = read(f);
      expect(src).not.toContain('useAssignmentWorkYm');
      expect(src).not.toContain('AssignmentWorkYmContext');
    }
  });

  // 四頁確實 consume Context
  it('四頁（list-definition/ready-summary/stage0-estimate/trigger-run）consume Context', () => {
    const shared = [
      'pages/assignment/list-definition-page.tsx',
      'pages/assignment/ready-summary-list-page.tsx',
      'pages/assignment/stage0-estimate-page.tsx',
      'pages/assignment/trigger-run-page.tsx',
    ];
    for (const f of shared) {
      expect(read(f)).toContain('useAssignmentWorkYm');
    }
  });

  // TS-F097-LABEL-003：未新增 F097 專屬 sidebar 路由（work-ym / target-work）。
  //   positive 清單同步為目前 app-sidebar 實際的 /assignment/* 連結：
  //   run 詳情頁（run-progress / run-summary 等）已改為由「執行歷史」帶 ?runId 進入、無獨立 sidebar 入口；
  //   另 F111 新增「分派總覽」/overview、F050 併入「篩選欄位」/field-base 與「計分卡設定」/scoring。
  it('TS-F097-LABEL-003：app-sidebar 為現行 E07 路由，且無 F097 專屬路由', () => {
    const src = read('components/layout/app-sidebar.tsx');
    const expectedRoutes = [
      '/assignment/overview',
      '/assignment/field-base',
      '/assignment/scoring',
      '/assignment/list-definitions',
      '/assignment/ready-summary',
      '/assignment/estimate',
      '/assignment/run',
      '/assignment/history',
    ];
    for (const r of expectedRoutes) {
      expect(src).toContain(`'${r}'`);
    }
    // 不得出現任何 F097 新路由（如 work-ym / target-work-ym 專屬頁）
    expect(src).not.toContain('work-ym');
    expect(src).not.toContain('target-work');
  });
});
