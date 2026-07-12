import { describe, it, expect, vi } from 'vitest';
import type { Logger } from '@nestjs/common';
import {
  OVERVIEW_BLOCK_ERROR_MESSAGE,
  deriveDeptDistribution,
  sumWorkdayCases,
  wrapBlock,
} from '../assignment-overview.util';

/**
 * F111-test.md J 組（UTIL-001~010）— assignment-overview.util.ts 純函式。
 * 無 I/O、無 DB 依賴。
 */

const fakeLogger = { error: vi.fn() } as unknown as Logger;

// 建構最小 Stage0DeptEstimateResult-like 物件（僅填純函式用到的欄位）。
function estimate(opts: {
  scoped?: boolean;
  departments?: Array<{ deptCode: string; deptName: string }>;
  days?: Array<{
    isWorkday: boolean;
    deptCells: Array<{ deptCode: string; cases: number }>;
  }>;
}): any {
  return {
    scope: { role: 'director', deptCode: null, scoped: opts.scoped ?? false },
    departments: (opts.departments ?? []).map((d) => ({
      ...d,
      activeHeadcount: 10,
    })),
    days: (opts.days ?? []).map((d) => ({
      date: '2026-08-03',
      weekday: '一',
      isWorkday: d.isWorkday,
      orgTotal: d.isWorkday ? 0 : 0,
      deptAssignedTotal: 0,
      gap: 0,
      deptCells: d.deptCells.map((c) => ({
        deptCode: c.deptCode,
        cases: c.cases,
        perPerson: null,
        overThreshold: false,
      })),
    })),
  };
}

describe('assignment-overview.util — wrapBlock', () => {
  it('UTIL-001：fn 成功 resolve → { error:false, ...data }', async () => {
    const result = await wrapBlock(
      () => Promise.resolve({ foo: 'bar' }),
      'STAGE_TODO_UNAVAILABLE',
      fakeLogger,
    );
    expect(result).toEqual({ error: false, foo: 'bar' });
  });

  it('UTIL-002：fn reject → { error:true, errorCode, message }，wrapBlock 自身永不 reject', async () => {
    // 不包 try/catch — 若 wrapBlock 自身 reject 此測試會 fail
    const result = await wrapBlock(
      () => Promise.reject(new Error('boom')),
      'RUN_READINESS_UNAVAILABLE',
      fakeLogger,
    );
    expect(result).toEqual({
      error: true,
      errorCode: 'RUN_READINESS_UNAVAILABLE',
      message: OVERVIEW_BLOCK_ERROR_MESSAGE,
    });
  });

  it('UTIL-003：錯誤訊息為固定文案，不含原始 Error.message（不外洩技術細節）', async () => {
    const result = (await wrapBlock(
      () => Promise.reject(new Error('SQL syntax error near ECONNREFUSED 5432')),
      'DIALING_VOLUME_UNAVAILABLE',
      fakeLogger,
    )) as { message: string };
    expect(result.message).toBe(OVERVIEW_BLOCK_ERROR_MESSAGE);
    expect(result.message).not.toContain('SQL syntax error');
    expect(result.message).not.toContain('ECONNREFUSED');
  });
});

describe('assignment-overview.util — sumWorkdayCases', () => {
  it('UTIL-004：僅加總 isWorkday=true 之 deptCells.cases（非工作日即使非空亦排除）', () => {
    const r = estimate({
      days: [
        { isWorkday: true, deptCells: [{ deptCode: 'A', cases: 100 }] },
        { isWorkday: false, deptCells: [{ deptCode: 'A', cases: 9999 }] },
      ],
    });
    expect(sumWorkdayCases(r)).toBe(100);
  });

  it('UTIL-005：跨部門、跨日正確加總', () => {
    const r = estimate({
      days: [
        {
          isWorkday: true,
          deptCells: [
            { deptCode: 'A', cases: 10 },
            { deptCode: 'B', cases: 20 },
          ],
        },
        {
          isWorkday: true,
          deptCells: [
            { deptCode: 'A', cases: 30 },
            { deptCode: 'B', cases: 40 },
          ],
        },
        {
          isWorkday: true,
          deptCells: [
            { deptCode: 'A', cases: 1 },
            { deptCode: 'B', cases: 2 },
          ],
        },
      ],
    });
    expect(sumWorkdayCases(r)).toBe(10 + 20 + 30 + 40 + 1 + 2);
  });

  it('UTIL-006：days=[] → 回傳 0（非 null/NaN）', () => {
    const r = estimate({ days: [] });
    expect(sumWorkdayCases(r)).toBe(0);
  });
});

describe('assignment-overview.util — deriveDeptDistribution', () => {
  it('UTIL-007：依 deptCells 正確彙總每部門 totalCases（僅工作日）', () => {
    const r = estimate({
      departments: [
        { deptCode: 'A', deptName: '部門A' },
        { deptCode: 'B', deptName: '部門B' },
      ],
      days: [
        {
          isWorkday: true,
          deptCells: [
            { deptCode: 'A', cases: 100 },
            { deptCode: 'B', cases: 50 },
          ],
        },
        {
          isWorkday: true,
          deptCells: [
            { deptCode: 'A', cases: 200 },
            { deptCode: 'B', cases: 50 },
          ],
        },
        {
          isWorkday: false,
          deptCells: [
            { deptCode: 'A', cases: 9999 },
            { deptCode: 'B', cases: 9999 },
          ],
        },
      ],
    });
    const dist = deriveDeptDistribution(r);
    const a = dist.find((d) => d.deptCode === 'A')!;
    const b = dist.find((d) => d.deptCode === 'B')!;
    expect(a.totalCases).toBe(300); // 100 + 200（非工作日 9999 排除）
    expect(b.totalCases).toBe(100);
  });

  it('UTIL-008：非 scoped → ratio 為佔比百分比、四捨五入至小數點後 1 位', () => {
    // A=9600, B=(29722-9600)=20122 → grandTotal=29722；A ratio = round(9600/29722*1000)/10 = 32.3
    const r = estimate({
      scoped: false,
      departments: [
        { deptCode: 'A', deptName: '部門A' },
        { deptCode: 'B', deptName: '部門B' },
      ],
      days: [
        {
          isWorkday: true,
          deptCells: [
            { deptCode: 'A', cases: 9600 },
            { deptCode: 'B', cases: 20122 },
          ],
        },
      ],
    });
    const a = deriveDeptDistribution(r).find((d) => d.deptCode === 'A')!;
    expect(a.totalCases).toBe(9600);
    expect(a.ratio).toBe(32.3);
  });

  it('UTIL-009：scoped（處長）→ ratio 恆為 null（即使 totalCases>0）', () => {
    const r = estimate({
      scoped: true,
      departments: [{ deptCode: 'D003', deptName: '轄區部門' }],
      days: [
        {
          isWorkday: true,
          deptCells: [{ deptCode: 'D003', cases: 9600 }],
        },
      ],
    });
    const dist = deriveDeptDistribution(r);
    expect(dist[0].totalCases).toBe(9600);
    expect(dist[0].ratio).toBeNull();
  });

  it('UTIL-010：grandTotal=0（所有部門 cases=0）非 scoped → ratio=0（非 NaN/Infinity）', () => {
    const r = estimate({
      scoped: false,
      departments: [
        { deptCode: 'A', deptName: '部門A' },
        { deptCode: 'B', deptName: '部門B' },
      ],
      days: [
        {
          isWorkday: true,
          deptCells: [
            { deptCode: 'A', cases: 0 },
            { deptCode: 'B', cases: 0 },
          ],
        },
      ],
    });
    for (const d of deriveDeptDistribution(r)) {
      expect(d.ratio).toBe(0);
      expect(Number.isNaN(d.ratio as number)).toBe(false);
      expect(Number.isFinite(d.ratio as number)).toBe(true);
    }
  });
});
