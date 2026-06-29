import {
  render,
  screen,
  cleanup,
  fireEvent,
  waitFor,
} from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import { Stage0EstimatePage } from '../stage0-estimate-page';
import { AssignmentWorkYmProvider } from '@/contexts/assignment-work-ym-context';
import { ToastProvider } from '@/components/ui/toast';
import * as runApi from '@/api/assignment-run';
import * as listApi from '@/api/assignment-list';
import * as authStore from '@/stores/auth-store';
import type {
  DeptEstimateResponse,
  DeptEstimateDay,
} from '@/api/assignment-run';

/**
 * F049 v2.0 Stage 0 試算頁（部門維度每日分派可行性）— 前端 Component 測試
 *
 * 涵蓋 test-design Part B 前端群組：AGG（聚合層）/ FE（部門矩陣）/ TERM（術語清理）。
 * 後端 DEPT/GAP/SCOPE/FEAS/INVAR/EDGE 由 stage0-dept-estimate.service.spec.ts 覆蓋。
 */

vi.mock('@/api/assignment-run');
vi.mock('@/api/assignment-list');
vi.mock('@/api/auth', () => ({ logout: vi.fn().mockResolvedValue({}) }));
vi.mock('@/stores/auth-store', async () => {
  const actual = await vi.importActual('@/stores/auth-store');
  return {
    ...actual,
    getUser: vi.fn(),
    getBusinessRole: vi.fn(),
    getEffectiveIdentity: vi.fn(),
    clearAuth: vi.fn(),
  };
});

const mockedGetDept = vi.mocked(runApi.getDeptEstimate);
const mockedListLists = vi.mocked(listApi.listLists);
const mockedGetCurrentWorkYm = vi.mocked(listApi.getCurrentWorkYm);
const mockedGetUser = vi.mocked(authStore.getUser);
const mockedGetBusinessRole = vi.mocked(authStore.getBusinessRole);

function activeList(listNo: string, listNm: string) {
  return {
    listNo,
    listNm,
    prodKind: 'A',
    caseYear: null,
    specTp: null,
    listPeriodStart: 0,
    listPeriodEnd: 999,
    listInterval: 30,
    settleSrc: null,
    cardType: null,
    prodBest: null,
    status: 'active' as const,
    stage: 'ready' as const,
    createdBy: '張部長',
    createdAt: '2026-05-15T00:00:00Z',
    updatedAt: '2026-05-15T00:00:00Z',
  };
}

function listsResp(lists: ReturnType<typeof activeList>[]) {
  return {
    selectedYm: '202606',
    currentWorkYm: '202605',
    isHistorical: false,
    isFuture: false,
    lockState: { locked: false, reason: null },
    lists,
    stageCounts: {
      draft: 0,
      dept_ratio: 0,
      personnel_ratio: 0,
      approval: 0,
      ready: lists.length,
      disabled: 0,
    },
  };
}

function workday(
  date: string,
  weekday: string,
  cells: DeptEstimateDay['deptCells'],
  org: number,
  gap: number,
): DeptEstimateDay {
  return {
    date,
    weekday,
    isWorkday: true,
    orgTotal: org,
    deptAssignedTotal: org - gap,
    gap,
    deptCells: cells,
  };
}
function restday(date: string, weekday: string): DeptEstimateDay {
  return {
    date,
    weekday,
    isWorkday: false,
    orgTotal: 0,
    deptAssignedTotal: 0,
    gap: 0,
    deptCells: [],
  };
}

function deptResp(
  overrides: Partial<DeptEstimateResponse> = {},
): DeptEstimateResponse {
  return {
    ym: '202606',
    mode: 'aggregated',
    listNo: null,
    calendarSource: 'weekday',
    startDate: '2026-06-01',
    endDate: '2026-06-30',
    scope: { role: 'director', deptCode: null, scoped: false },
    departments: [
      { deptCode: 'XVE1', deptName: '北區電銷一課', activeHeadcount: 27 },
      { deptCode: 'XVE2', deptName: '北區電銷二課', activeHeadcount: 28 },
      { deptCode: 'XVE3', deptName: '中區電銷課', activeHeadcount: 22 },
    ],
    days: [
      workday(
        '2026-06-01',
        '一',
        [
          { deptCode: 'XVE1', cases: 405, perPerson: 15, overThreshold: false },
          { deptCode: 'XVE2', cases: 364, perPerson: 13, overThreshold: false },
          { deptCode: 'XVE3', cases: 220, perPerson: 10, overThreshold: false },
        ],
        989,
        0,
      ),
      restday('2026-06-07', '日'),
    ],
    threshold: 18,
    warnings: [],
    poolCount: 50000,
    poolWarning: null,
    ...overrides,
  };
}

function renderPage() {
  return render(
    <MemoryRouter>
      <ToastProvider>
        <AssignmentWorkYmProvider>
          <Stage0EstimatePage />
        </AssignmentWorkYmProvider>
      </ToastProvider>
    </MemoryRouter>,
  );
}

describe('Stage0EstimatePage（F049 v2.0 部門維度）', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockedGetUser.mockReturnValue({
      id: 'd1',
      name: '張部長',
      email: 'd@test',
      role: 'user',
      businessRole: 'director',
      status: 'active',
    } as never);
    mockedGetBusinessRole.mockReturnValue('director');
    mockedListLists.mockResolvedValue(
      listsResp([
        activeList('OB202606001', '汽車期中名單'),
        activeList('OB202606002', '信貸滿期名單'),
      ]),
    );
    mockedGetDept.mockResolvedValue(deptResp());
    mockedGetCurrentWorkYm.mockResolvedValue({ currentWorkYm: '202605' });
  });
  afterEach(() => cleanup());

  // =====================================================================
  // 十一、AGG — 聚合層
  // =====================================================================
  describe('AGG — 聚合層（US-166）', () => {
    it('TS-F049-AGG-001：預設全名單彙總；mode indicator + 3 部門列', async () => {
      renderPage();
      await waitFor(() => {
        expect(screen.getByTestId('dept-row-XVE1')).toBeInTheDocument();
      });
      expect(screen.getByTestId('mode-indicator').textContent).toContain(
        '所有啟用名單彙總',
      );
      const filter = screen.getByTestId('list-filter') as HTMLSelectElement;
      expect(filter.value).toBe('ALL');
      expect(Array.from(filter.options)[0].textContent).toContain('全部名單');
      expect(screen.getByTestId('dept-row-XVE1')).toBeInTheDocument();
      expect(screen.getByTestId('dept-row-XVE2')).toBeInTheDocument();
      expect(screen.getByTestId('dept-row-XVE3')).toBeInTheDocument();
    });

    it('TS-F049-AGG-002：切換單一名單 → API 帶 listNo 重呼叫；mode/件數更新；切回彙總', async () => {
      mockedGetDept.mockImplementation(async (_ym, opts) => {
        if (opts?.listNo === 'OB202606002') {
          return deptResp({
            mode: 'single-list',
            listNo: 'OB202606002',
            departments: [
              { deptCode: 'XVE1', deptName: '北區電銷一課', activeHeadcount: 10 },
            ],
            days: [
              workday(
                '2026-06-01',
                '一',
                [{ deptCode: 'XVE1', cases: 40, perPerson: 4, overThreshold: false }],
                40,
                0,
              ),
            ],
          });
        }
        return deptResp({
          departments: [
            { deptCode: 'XVE1', deptName: '北區電銷一課', activeHeadcount: 10 },
          ],
          days: [
            workday(
              '2026-06-01',
              '一',
              [{ deptCode: 'XVE1', cases: 100, perPerson: 10, overThreshold: false }],
              100,
              0,
            ),
          ],
        });
      });
      renderPage();
      await waitFor(() => {
        expect(screen.getByTestId('cases-XVE1').textContent).toContain('100');
      });

      fireEvent.change(screen.getByTestId('list-filter'), {
        target: { value: 'OB202606002' },
      });
      await waitFor(() => {
        expect(screen.getByTestId('cases-XVE1').textContent).toContain('40');
      });
      expect(screen.getByTestId('mode-indicator').textContent).toContain(
        '單一名單',
      );
      expect(screen.getByTestId('mode-indicator').textContent).toContain(
        '信貸滿期名單',
      );
      const last = mockedGetDept.mock.calls[mockedGetDept.mock.calls.length - 1];
      expect(last[1]).toMatchObject({ listNo: 'OB202606002' });

      // 切回全部名單 → aggregated（100）
      fireEvent.change(screen.getByTestId('list-filter'), {
        target: { value: 'ALL' },
      });
      await waitFor(() => {
        expect(screen.getByTestId('cases-XVE1').textContent).toContain('100');
      });
      expect(screen.getByTestId('mode-indicator').textContent).toContain(
        '所有啟用名單彙總',
      );
    });

    it('TS-F049-AGG-003：0 active 名單 → 空狀態 + KPI「—」', async () => {
      mockedListLists.mockResolvedValue(listsResp([]));
      mockedGetDept.mockResolvedValue(
        deptResp({ departments: [], days: [] }),
      );
      renderPage();
      await waitFor(() => {
        expect(screen.getByTestId('empty-state')).toBeInTheDocument();
      });
      expect(screen.getByTestId('kpi-working-days').textContent).toContain('—');
      expect(screen.getByTestId('kpi-total-cases').textContent).toContain('—');
    });

    it('TS-F049-AGG-005：月份切換 → 以新月份重新 fetch dept-estimate', async () => {
      renderPage();
      await waitFor(() => {
        expect(mockedGetDept).toHaveBeenCalledWith(
          '202606',
          expect.anything(),
        );
      });
      fireEvent.click(screen.getByTestId('month-picker-next'));
      await waitFor(() => {
        expect(mockedGetDept).toHaveBeenCalledWith(
          '202607',
          expect.anything(),
        );
      });
    });
  });

  // =====================================================================
  // 十二、FE — 部門矩陣
  // =====================================================================
  describe('FE — 部門矩陣（US-167/168/169）', () => {
    it('TS-F049-FE-001：部門列 / 人均欄 / org_total 合計列 / gap 橘色徽章', async () => {
      mockedGetDept.mockResolvedValue(
        deptResp({
          departments: [
            { deptCode: 'D001', deptName: '北一課', activeHeadcount: 10 },
          ],
          days: [
            workday(
              '2026-06-01',
              '一',
              [{ deptCode: 'D001', cases: 120, perPerson: 12, overThreshold: false }],
              200,
              80,
            ),
          ],
        }),
      );
      renderPage();
      await waitFor(() => {
        expect(screen.getByTestId('dept-row-D001')).toBeInTheDocument();
      });
      expect(screen.getByTestId('cases-D001').textContent).toContain('120');
      expect(screen.getByTestId('per-person-D001').textContent).toContain('12');
      // 全名單總量合計列
      const orgRow = screen.getByTestId('org-total-row');
      expect(orgRow.textContent).toContain('200');
      // 缺口橘色徽章
      const gapRow = screen.getByTestId('gap-row');
      expect(gapRow.textContent).toContain('80');
      expect(gapRow.textContent).toContain('未分派');
    });

    it('TS-F049-FE-002：gap=0 → 缺口列不渲染（DOM 不存在）', async () => {
      mockedGetDept.mockResolvedValue(
        deptResp({
          days: [
            workday(
              '2026-06-01',
              '一',
              [{ deptCode: 'XVE1', cases: 400, perPerson: 15, overThreshold: false }],
              400,
              0,
            ),
          ],
        }),
      );
      renderPage();
      await waitFor(() => {
        expect(screen.getByTestId('dept-row-XVE1')).toBeInTheDocument();
      });
      expect(screen.queryByTestId('gap-row')).not.toBeInTheDocument();
    });

    it('TS-F049-FE-003：處長唯讀 banner；無 org_total 合計列；XVE1 列正常', async () => {
      mockedGetBusinessRole.mockReturnValue('section_chief');
      mockedGetDept.mockResolvedValue(
        deptResp({
          scope: { role: 'section_chief', deptCode: 'XVE1', scoped: true },
          departments: [
            { deptCode: 'XVE1', deptName: '北區電銷一課', activeHeadcount: 27 },
          ],
          days: [
            {
              date: '2026-06-01',
              weekday: '一',
              isWorkday: true,
              orgTotal: null,
              deptAssignedTotal: null,
              gap: null,
              deptCells: [
                { deptCode: 'XVE1', cases: 405, perPerson: 15, overThreshold: false },
              ],
            },
          ],
        }),
      );
      renderPage();
      await waitFor(() => {
        expect(
          screen.getByTestId('section-chief-readonly-banner'),
        ).toBeInTheDocument();
      });
      expect(screen.queryByTestId('org-total-row')).not.toBeInTheDocument();
      expect(screen.getByTestId('dept-row-XVE1')).toBeInTheDocument();
    });

    it('TS-F049-FE-004：處長 scope=null → 友善提示，不 crash', async () => {
      mockedGetBusinessRole.mockReturnValue('section_chief');
      mockedGetDept.mockResolvedValue(
        deptResp({
          scope: { role: 'section_chief', deptCode: null, scoped: true },
          departments: [],
          days: [],
          warnings: [
            { code: 'SCOPE_UNRESOLVED', message: '無法識別您的轄區部門' },
          ],
        }),
      );
      renderPage();
      await waitFor(() => {
        expect(
          screen.getByTestId('scope-unresolved-card'),
        ).toBeInTheDocument();
      });
      expect(screen.getByTestId('scope-unresolved-card').textContent).toContain(
        '無法識別您的轄區部門',
      );
      expect(screen.getByTestId('scope-unresolved-card').textContent).toContain(
        '—',
      );
    });

    it('TS-F049-FE-005：overThreshold → 人均欄紅色 + 提示文字', async () => {
      mockedGetDept.mockResolvedValue(
        deptResp({
          threshold: 15,
          departments: [
            { deptCode: 'D002', deptName: '北二課', activeHeadcount: 10 },
          ],
          days: [
            workday(
              '2026-06-01',
              '一',
              [{ deptCode: 'D002', cases: 200, perPerson: 20, overThreshold: true }],
              200,
              0,
            ),
          ],
        }),
      );
      renderPage();
      await waitFor(() => {
        expect(screen.getByTestId('per-person-D002')).toBeInTheDocument();
      });
      const cell = screen.getByTestId('per-person-D002');
      expect(cell.className).toMatch(/text-red-600/);
      expect(cell.getAttribute('title')).toContain('超過每人每日上限 15 件');
    });

    it('TS-F049-FE-006：派案日曆切換 → 帶 calendarSource=all 重呼叫；業務標籤', async () => {
      mockedGetDept.mockImplementation(async (_ym, opts) => {
        const cases = opts?.calendarSource === 'all' ? 130 : 100;
        return deptResp({
          calendarSource: opts?.calendarSource ?? 'weekday',
          departments: [
            { deptCode: 'XVE1', deptName: '北區電銷一課', activeHeadcount: 10 },
          ],
          days: [
            workday(
              '2026-06-01',
              '一',
              [{ deptCode: 'XVE1', cases, perPerson: 1, overThreshold: false }],
              cases,
              0,
            ),
          ],
        });
      });
      renderPage();
      await waitFor(() => {
        expect(screen.getByTestId('cases-XVE1').textContent).toContain('100');
      });
      const select = screen.getByTestId('calendar-select');
      // 業務標籤
      expect(select.textContent).toContain('只排上班日');
      expect(select.textContent).toContain('連週末都排（全月每天）');
      fireEvent.change(select, { target: { value: 'all' } });
      await waitFor(() => {
        expect(screen.getByTestId('cases-XVE1').textContent).toContain('130');
      });
      const last = mockedGetDept.mock.calls[mockedGetDept.mock.calls.length - 1];
      expect(last[1]).toMatchObject({ calendarSource: 'all' });
    });
  });

  // =====================================================================
  // 十三、TERM — 術語清理（US-170 / §19）
  // =====================================================================
  describe('TERM — 術語清理（US-170）', () => {
    const BLACKLIST = [
      'rest_flg',
      'base ratio',
      'base+1',
      'ratioPerMille',
      'remainder',
      '餘數',
      'ob_assign_set',
      'ob_pool_data',
      'OBPOOLDATA',
      'STAGE0_POOL_WARN_THRESHOLD',
      'calendar_date',
      'AD-E07-8',
      'AD-E07-29',
      'GET /api/v1/',
    ];

    it('TS-F049-TERM-001：DOM 全文掃描 — §19.1 黑名單字串均不出現', async () => {
      mockedGetDept.mockResolvedValue(
        deptResp({ poolCount: 500, poolWarning: 'POOL_COUNT_LOW' }),
      );
      renderPage();
      await waitFor(() => {
        expect(screen.getByTestId('mode-indicator')).toBeInTheDocument();
      });
      const body = document.body.textContent ?? '';
      for (const term of BLACKLIST) {
        expect(body).not.toContain(term);
      }
    });

    it('TS-F049-TERM-002：KPI 區無 base ratio / remainder 卡片', async () => {
      renderPage();
      await waitFor(() => {
        expect(screen.getByTestId('kpi-working-days')).toBeInTheDocument();
      });
      expect(screen.queryByTestId('kpi-base')).not.toBeInTheDocument();
      expect(screen.queryByTestId('kpi-remainder')).not.toBeInTheDocument();
      const body = document.body.textContent ?? '';
      expect(body).not.toContain('base ratio');
      expect(body).not.toContain('remainder');
    });

    it('TS-F049-TERM-003：休息日「休息日（不派案）」；無 base+1 徽章；工作日業務語言', async () => {
      renderPage();
      await waitFor(() => {
        expect(screen.getByTestId('calendar-grid')).toBeInTheDocument();
      });
      const body = document.body.textContent ?? '';
      expect(body).toContain('休息日（不派案）');
      expect(body).toContain('工作日');
      expect(body).not.toContain('跳過');
      expect(body).not.toContain('base+1');
      expect(body).not.toContain('餘數補');
    });

    it('TS-F049-TERM-004：Pool 偏低警示為業務語言、無技術詞彙', async () => {
      mockedGetDept.mockResolvedValue(
        deptResp({ poolCount: 500, poolWarning: 'POOL_COUNT_LOW' }),
      );
      renderPage();
      await waitFor(() => {
        expect(screen.getByTestId('pool-low-warning')).toBeInTheDocument();
      });
      const warn = screen.getByTestId('pool-low-warning');
      expect(warn.textContent).toContain('筆');
      expect(warn.textContent).toContain('500');
      expect(warn.textContent).not.toContain('OBPOOLDATA');
      expect(warn.textContent).not.toContain('STAGE0_POOL_WARN_THRESHOLD');
      expect(warn.textContent).not.toContain('ob_pool_data');
    });

    it('TS-F049-TERM-005：AD-E07-8 公式框不顯示', async () => {
      renderPage();
      await waitFor(() => {
        expect(screen.getByTestId('mode-indicator')).toBeInTheDocument();
      });
      const body = document.body.textContent ?? '';
      expect(body).not.toContain('FLOOR(1000');
      expect(body).not.toContain('1000 mod');
      expect(body).not.toContain('AD-E07-8');
    });
  });

  // ---- smoke ----
  it('渲染部門負載總覽 + 月曆 + KPI（director）', async () => {
    renderPage();
    await waitFor(() => {
      expect(screen.getByTestId('dept-summary-table')).toBeInTheDocument();
    });
    expect(screen.getByTestId('calendar-grid')).toBeInTheDocument();
    expect(screen.getByTestId('kpi-working-days')).toBeInTheDocument();
    // 全部門合計 pill 存在（director）
    expect(screen.getByTestId('dept-pill-ALL')).toBeInTheDocument();
  });
});
