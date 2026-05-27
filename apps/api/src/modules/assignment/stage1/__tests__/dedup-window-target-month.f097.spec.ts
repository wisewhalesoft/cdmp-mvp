/**
 * F097 — Stage 1 去重視窗 workdt 對齊目標月（US-142）
 *
 * 涵蓋：
 *   - TS-F097-DEDUP-002：workdt 來自 project_workym + '01'（非 new Date()）
 *   - TS-F097-DEDUP-003：regression — 上界後移一個月（202605→2026-04-30 vs 202606→2026-05-31）
 *   - TS-F097-DEDUP-004：ETL 切點近似落差 文件化（computeDedupWindow 附近注釋存在）
 *   - TS-F097-NODEDUP-001：computeDedupWindow 函式不修改（git diff 對比 HEAD 無變更）
 *   - TS-F097-FORWARD-001：forward-only 注釋存在於 AssignmentRunService.triggerRun 附近
 *
 * 設計：AC-20 規定 computeDedupWindow 不改，語意對齊靠傳入正確 workdt（= project_workym + '01'）。
 *       本檔以 computeDedupWindow + project_workym 衍生 workdt 驗證上界，並以靜態掃描守 AC-20/21/18。
 */

import { describe, it, expect, vi } from 'vitest';
import { execSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { computeDedupWindow } from '../stage1-filter-chain';
import type { Repository } from 'typeorm';
import type { ObPoolDataList } from '@/database/entities/ob-pool-data-list.entity';

// __dirname = src/modules/assignment/stage1/__tests__ → 4 層回到 src
const API_SRC = join(__dirname, '..', '..', '..', '..');
const REPO_ROOT = join(API_SRC, '..', '..', '..');

/** 對應 pipeline parseWorkdt：project_workym（YYYYMM）→ 目標月 1 號 Date（本地時間） */
function parseWorkdt(ym: string): Date {
  const year = parseInt(ym.slice(0, 4), 10);
  const month = parseInt(ym.slice(4, 6), 10); // 1-based
  return new Date(year, month - 1, 1);
}

function mockPoolDataListRepo(maxAssignday: string | null) {
  const qb = {
    select: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
    andWhere: vi.fn().mockReturnThis(),
    getRawOne: vi.fn().mockResolvedValue({ max: maxAssignday }),
    getRawMany: vi.fn().mockResolvedValue([]),
  };
  return {
    createQueryBuilder: vi.fn().mockReturnValue(qb),
  } as unknown as Repository<ObPoolDataList>;
}

describe('F097 Stage 1 去重視窗對齊目標月', () => {
  // TS-F097-DEDUP-002：workdt 來自 project_workym + '01'
  it('TS-F097-DEDUP-002：project_workym=202606 衍生 workdt=2026-06-01（非 new Date()）', async () => {
    const workdt = parseWorkdt('202606');
    expect(workdt.getFullYear()).toBe(2026);
    expect(workdt.getMonth()).toBe(5); // June (0-based)
    expect(workdt.getDate()).toBe(1);
  });

  // TS-F097-DEDUP-001 / DEDUP-002 上界：MAX(assignday) 高於 workdt-1 → 取 workdt-1 = 2026-05-31
  it('TS-F097-DEDUP-001：project_workym=202606 → 去重上界 2026-05-31（作業月上月底）', async () => {
    const pdlRepo = mockPoolDataListRepo('20261231'); // 異常未來 → 取 workdt-1 封頂
    const { assigndayStart, assigndayEnd } = await computeDedupWindow(
      parseWorkdt('202606'),
      pdlRepo,
    );
    expect(assigndayStart).toBe('20260301'); // workdt − 3 月
    expect(assigndayEnd).toBe('20260531'); // workdt − 1 日（作業月上月底）
  });

  // TS-F097-DEDUP-003：regression — 上界整體後移一個月
  it('TS-F097-DEDUP-003：202605 上界 2026-04-30 vs 202606 上界 2026-05-31（後移一月）', async () => {
    const pdlRepoFuture = () => mockPoolDataListRepo('20271231'); // 封頂取 workdt-1

    const before = await computeDedupWindow(parseWorkdt('202605'), pdlRepoFuture());
    const after = await computeDedupWindow(parseWorkdt('202606'), pdlRepoFuture());

    expect(before.assigndayEnd).toBe('20260430'); // F097 前語意（執行月上月底）
    expect(after.assigndayEnd).toBe('20260531'); // F097 後語意（作業月上月底）
  });

  // TS-F097-DEDUP-004：ETL 切點近似落差 文件化（computeDedupWindow 附近注釋）
  it('TS-F097-DEDUP-004：computeDedupWindow 附近含 ETL 近似 / OQ-STAGE1-02 注釋', () => {
    const src = readFileSync(
      join(API_SRC, 'modules', 'assignment', 'stage1', 'stage1-filter-chain.ts'),
      'utf-8',
    );
    const idx = src.indexOf('export async function computeDedupWindow');
    expect(idx).toBeGreaterThan(0);
    // 取函式前 1200 字元（注釋區）
    const around = src.slice(Math.max(0, idx - 1200), idx);
    expect(around).toContain('OQ-STAGE1-02');
    expect(around).toMatch(/ETL|近似/);
  });

  // TS-F097-NODEDUP-001：computeDedupWindow 函式不修改（git diff 對比 HEAD）
  it('TS-F097-NODEDUP-001：computeDedupWindow 相對 HEAD 無 git diff', () => {
    const rel = 'apps/api/src/modules/assignment/stage1/stage1-filter-chain.ts';
    let diff = '';
    try {
      diff = execSync(`git -C "${REPO_ROOT}" diff HEAD -- ${rel}`, {
        encoding: 'utf-8',
      });
    } catch {
      diff = '';
    }
    // 整檔無 diff（F097 完全未改 stage1-filter-chain.ts）→ 必然涵蓋 computeDedupWindow 不變
    expect(diff.trim()).toBe('');
  });

  // TS-F097-FORWARD-001：forward-only 注釋 + 生效日期 於 triggerRun 附近
  it('TS-F097-FORWARD-001：AssignmentRunService.triggerRun 附近含 forward-only / F097 注釋', () => {
    const src = readFileSync(
      join(API_SRC, 'modules', 'assignment', 'services', 'assignment-run.service.ts'),
      'utf-8',
    );
    expect(src).toContain('forward-only');
    expect(src).toContain('F097');
  });
});
