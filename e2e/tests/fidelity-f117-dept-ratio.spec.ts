import { test, expect, type Page, type Route } from '@playwright/test';

/**
 * F117 v1.1 — 部門比例設定頁僅提供「有在職處長」之部門設定：E2E Fidelity（Playwright）
 *
 * 權威來源：
 *   - prototypes/29a-dept-ratio-config.html（UI ground truth，含 6 個 Demo 場景：
 *     all_director / hidden / orphan / orphan_inactive / empty / empty_orphan）
 *   - docs/specs/features/F117-dept-ratio-director-required-filter.md（AC-1/AC-3/AC-5/AC-7/AC-8）
 *   - docs/test-specs/features/F117-test.md（TS-F117-E2E-001~005）
 *
 * 資料策略（記錄於 docs/test-specs/risks-and-gaps.md「F117」R-F117-02）：
 * 以 page.route() 攔截 GET listLists + GET/PUT dept-ratio 兩端點，依 prototype 之
 * demo 場景固定供應回應，同時仍對「真實運行中的前端」執行導覽/渲染/斷言 ——
 * 因此仍能捕捉建置/路由/proxy 層級的漂移，只是資料層以攔截取代真實 DB round-trip。
 * 後端業務規則（BR-1~BR-9）之真實正確性由後端 Unit + Integration 兩層真實覆蓋
 * （apps/api/src/modules/assignment-stage/__tests__/dept-ratio.service.spec.ts +
 *   apps/api/test/f117-dept-ratio-director-filter.e2e-spec.ts），不依賴本檔。
 */

const LIST_NO = 'E2E-F117-DEMO';

interface DeptRow {
  obdeptId: string;
  obdeptNm: string;
  ration: number;
  isActive: boolean;
  directorName: string | null;
  hasActiveDirector: boolean;
  isRatioEditable: boolean;
}

function row(overrides: Partial<DeptRow> & Pick<DeptRow, 'obdeptId' | 'obdeptNm' | 'ration'>): DeptRow {
  return {
    isActive: true,
    directorName: null,
    hasActiveDirector: true,
    isRatioEditable: true,
    ...overrides,
  };
}

/** 對照 prototype 29a SCENARIOS 常數之對應資料集，轉為 GET response 形狀（F117 §5.1）。 */
const SCENARIOS: Record<string, DeptRow[]> = {
  // ① 全部有處長（AC-1）
  all_director: [
    row({ obdeptId: 'XTC0', obdeptNm: '北一處', ration: 30, directorName: '李處長' }),
    row({ obdeptId: 'XTC1', obdeptNm: '北二處', ration: 25, directorName: '王處長' }),
    row({ obdeptId: 'XTC2', obdeptNm: '中區處', ration: 25, directorName: '陳處長' }),
    row({ obdeptId: 'XTC3', obdeptNm: '南一處', ration: 20, directorName: '黃處長' }),
  ],
  // ③ 含孤兒鎖定列（AC-3/AC-5）——另 1 個無關部門已被後端隱藏（不出現於 response）
  orphan: [
    row({ obdeptId: 'XTC0', obdeptNm: '北一處', ration: 60, directorName: '李處長' }),
    row({
      obdeptId: 'XTE0',
      obdeptNm: '業務三部',
      ration: 40,
      directorName: null,
      hasActiveDirector: false,
      isRatioEditable: false,
    }),
  ],
  // ④ 孤兒＋已下線同列（BR-10）
  orphan_inactive: [
    row({ obdeptId: 'XTC0', obdeptNm: '北一處', ration: 45, directorName: '李處長' }),
    row({ obdeptId: 'XTC1', obdeptNm: '北二處', ration: 40, directorName: '王處長' }),
    row({
      obdeptId: 'XTC9',
      obdeptNm: '舊東區處',
      ration: 15,
      isActive: false,
      directorName: null,
      hasActiveDirector: false,
      isRatioEditable: false,
    }),
  ],
  // ⑤ 無任何處長（AC-7）
  empty: [],
  // ⑥ 空狀態＋孤兒並存（AC-7 末句）
  empty_orphan: [
    row({
      obdeptId: 'XTE0',
      obdeptNm: '業務三部',
      ration: 100,
      directorName: null,
      hasActiveDirector: false,
      isRatioEditable: false,
    }),
  ],
};

function buildListListsResponse() {
  return {
    selectedYm: '202605',
    currentWorkYm: '202605',
    isHistorical: false,
    isFuture: false,
    lockState: { locked: false, reason: null },
    lists: [
      {
        listNo: LIST_NO,
        listNm: 'F117 E2E Demo 名單',
        prodKind: 'A1',
        caseYear: null,
        specTp: null,
        listPeriodStart: 0,
        listPeriodEnd: 999,
        listInterval: 30,
        settleSrc: null,
        cardType: null,
        prodBest: null,
        status: 'active',
        stage: 'dept_ratio',
        createdBy: 'E2E',
        createdAt: '2026-05-15T00:00:00.000Z',
        updatedAt: '2026-05-15T00:00:00.000Z',
      },
    ],
    stageCounts: { draft: 0, dept_ratio: 1, personnel_ratio: 0, approval: 0, ready: 0, disabled: 0 },
  };
}

function buildGetDeptRatiosResponse(scenario: keyof typeof SCENARIOS) {
  const rows = SCENARIOS[scenario];
  const visibleTotal = rows.reduce((s, r) => s + r.ration, 0);
  return {
    listNo: LIST_NO,
    listNm: 'F117 E2E Demo 名單',
    projectWorkym: '202605',
    stage: 'dept_ratio',
    deptRatios: rows,
    total: visibleTotal,
    isReadOnly: false,
    hiddenNoDirectorCount: scenario === 'orphan' ? 1 : 0,
  };
}

async function mockNetwork(page: Page, scenario: keyof typeof SCENARIOS) {
  await page.route('**/api/v1/assignment/lists**', (r: Route) =>
    r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(buildListListsResponse()) }),
  );
  await page.route('**/api/v1/assignment/ratios/dept/**', (r: Route) => {
    if (r.request().method() === 'GET') {
      return r.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(buildGetDeptRatiosResponse(scenario)),
      });
    }
    return r.continue();
  });
}

async function gotoDeptRatioPage(page: Page, scenario: keyof typeof SCENARIOS) {
  await mockNetwork(page, scenario);
  await page.goto(`/assignment/lists/${LIST_NO}/dept-ratio`);
  // AC-7 末句／prototype demo⑥（empty_orphan）明訂空狀態與孤兒鎖定列可並存於同一畫面，
  // 故 dept-ratio-form 與 no-active-director-empty-state 兩個 testid 在該情境下會同時
  // 匹配到元素。.or() 是聯集 locator：兩者皆存在時 resolve 到 2 個元素，對這類多match
  // locator 呼叫 toBeVisible() 會觸發 Playwright strict mode violation——這是本 helper
  // 「等待頁面完成初始渲染」機制本身的實作瑕疵，與下方各測試各自對
  // dept-ratio-form / no-active-director-empty-state / ration-input-locked 等元素的
  // 獨立斷言內容無關（裁決見 test-generator dispute #3 回應）。改用 .first()：
  // 聯集中只要有一個元素已渲染完成即視為就緒，兩者皆存在時任取其一必為 visible，
  // 不影響、也不弱化任何斷言本體。
  await expect(
    page.getByTestId('dept-ratio-form').or(page.getByTestId('no-active-director-empty-state')).first(),
  ).toBeVisible();
}

// 本檔僅需 admin persona（涵蓋所有「部長可寫」情境，見 README「Auth 策略」）；
// 執行： npx playwright test tests/fidelity-f117-dept-ratio.spec.ts --project=admin
test.describe('F117 E2E Fidelity — 部門比例設定頁「有在職處長」過濾', () => {
  // 裁決見 test-generator dispute #2 / #4 回應（docs/test-specs/risks-and-gaps.md R-F117-06）：
  // `npm run test:e2e`（不帶 --project）會在 playwright.config.ts 的 admin 與 user 兩個
  // project 下各跑一次全部 5 個 scenario。user persona 依 F079 AC-8 / F117 AC-9 本就無 E07
  // 入口（403 AUTH_FORBIDDEN、不渲染入口）——此為既有、刻意保留之限制，該路徑已由
  // apps/api/test/f117-dept-ratio-director-filter.e2e-spec.ts 的 TS-F117-INT-004
  // 以真實 HTTP+Guard round-trip 覆蓋，非本檔（前端渲染 fidelity）待驗證對象。
  // 若不加此守衛，本檔在 user project 下必然全紅，等同斷言「無權限 persona 應看見
  // 部長專用 UI」，與 AC-9 矛盾。
  test.beforeEach(async ({}, testInfo) => {
    test.skip(
      testInfo.project.name !== 'admin',
      'F117 fidelity 僅涵蓋 admin/director-equivalent persona；user persona 之 403/不渲染入口已由 TS-F117-INT-004 覆蓋（見 F117 AC-9、README「Auth 策略」）',
    );
  });

  // TS-F117-E2E-001
  test('三分類渲染（orphan 場景，對照 prototype demo③）', async ({ page }) => {
    await gotoDeptRatioPage(page, 'orphan');

    // 僅 2 列可見（可編輯 XTC0 + 孤兒鎖定 XTE0），無關部門已被後端過濾不應出現於 DOM
    const lockedInput = page.getByTestId('ration-input-locked');
    await expect(lockedInput).toBeVisible();
    await expect(lockedInput).toBeDisabled();
    await expect(page.getByTestId('no-active-director-badge')).toBeVisible();

    const hiddenNotice = page.getByTestId('hidden-depts-notice');
    await expect(hiddenNotice).toBeVisible();
    await expect(hiddenNotice).toContainText('1');
  });

  // TS-F117-E2E-002
  test('孤兒＋已下線同列並存（對照 prototype demo④，BR-10）', async ({ page }) => {
    await gotoDeptRatioPage(page, 'orphan_inactive');

    await expect(page.getByTestId('dept-inactive-badge-XTC9')).toBeVisible();
    await expect(page.getByTestId('no-active-director-badge')).toBeVisible();
  });

  // TS-F117-E2E-003
  test('空狀態（對照 prototype demo⑤）', async ({ page }) => {
    await gotoDeptRatioPage(page, 'empty');

    const emptyState = page.getByTestId('no-active-director-empty-state');
    await expect(emptyState).toBeVisible();
    await expect(emptyState).not.toContainText('資料同步異常');
    await expect(emptyState).not.toContainText('目前無在職部門可設定');
  });

  // TS-F117-E2E-004
  test('空狀態＋孤兒並存（對照 prototype demo⑥，AC-7 末句）', async ({ page }) => {
    await gotoDeptRatioPage(page, 'empty_orphan');

    await expect(page.getByTestId('no-active-director-empty-state')).toBeVisible();
    await expect(page.getByTestId('ration-input-locked')).toBeVisible();
  });

  // TS-F117-E2E-005
  test('Sidebar／Header 導覽路徑與既有 F079 頁一致（未變更導覽層級）', async ({ page }) => {
    await gotoDeptRatioPage(page, 'all_director');

    // CLAUDE.md 導覽層級 fidelity 規則：F117 未變更導覽層級，「客戶名單分派 → 名單定義」
    // 側欄項目應維持既有高亮/存在，不因本 feature 新增/移除任何 sidebar 項目
    await expect(page.getByRole('link', { name: /名單定義/ })).toBeVisible();
  });
});
