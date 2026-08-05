import { test, expect, type Page, type Route } from '@playwright/test';

/**
 * F118 — 從上月複製名單顯示「已複製過」提示：E2E Fidelity（Playwright）
 *
 * 權威來源：
 *   - prototypes/27a-list-create-draft.html（UI ground truth，L163-174 dupReminderBanner /
 *     L424-442 copyModal / L444-488 dupConfirmModal / L1192-1295 候選列渲染 + 確認流程）
 *   - docs/specs/features/F118-copy-from-prev-month-duplicate-indicator.md（AC-1/AC-3/AC-4/AC-10/AC-11）
 *   - docs/specs/contracts/F118-copy-duplicate-check.contract.ts（test-id 契約）
 *   - docs/test-specs/features/F118-test.md（TS-F118-FID-001~004）
 *
 * 資料策略（沿用 fidelity-f117-dept-ratio.spec.ts 之既定做法，記錄於
 * docs/test-specs/risks-and-gaps.md「F118」）：
 * 以 page.route() 攔截 GET listLists + GET copy-duplicate-check 兩端點，依固定資料供應
 * 回應，同時仍對「真實運行中的前端」執行導覽/渲染/斷言 —— 因此仍能捕捉建置/路由/proxy
 * 層級的漂移，只是資料層以攔截取代真實 DB round-trip。後端業務規則（BR-1~BR-9）之真實
 * 正確性由後端 Unit + Integration + E2E 三層真實覆蓋（見 F118-test.md §一~三），不依賴本檔。
 */

const CREATE_PAGE_PATH = '/assignment/list-definitions/new';

interface CandidateList {
  listNo: string;
  listNm: string;
  crEnabled: boolean;
  cardType: string;
  conditionPayload: { conditions: Array<{ columnName: string; fieldType: string; values?: string[] }>; logic: 'AND' };
}

const CANDIDATES: CandidateList[] = [
  {
    listNo: 'OB202604001',
    listNm: '2026-04 業務一部 主力催收',
    crEnabled: true,
    cardType: 'S5',
    conditionPayload: { conditions: [{ columnName: 'prod_kind', fieldType: 'categorical', values: ['02', '03'] }], logic: 'AND' },
  },
  {
    listNo: 'OB202604003',
    listNm: '2026-04 業務三部 信貸催收',
    crEnabled: true,
    cardType: 'OB',
    conditionPayload: { conditions: [{ columnName: 'case_status', fieldType: 'categorical', values: ['01', '02'] }], logic: 'AND' },
  },
];

function buildListListsResponse() {
  return {
    selectedYm: '202604',
    currentWorkYm: '202605',
    isHistorical: false,
    isFuture: false,
    lockState: { locked: false, reason: null },
    lists: CANDIDATES.map((c) => ({
      listNo: c.listNo,
      listNm: c.listNm,
      prodKind: null,
      caseYear: null,
      specTp: null,
      caseStatus: null,
      crEnabled: c.crEnabled,
      listPeriodStart: 0,
      listPeriodEnd: 999,
      listInterval: 30,
      settleSrc: null,
      cardType: c.cardType,
      prodBest: null,
      status: 'active',
      stage: 'ready',
      createdBy: 'E2E',
      createdAt: '2026-04-10T00:00:00.000Z',
      updatedAt: '2026-04-10T00:00:00.000Z',
      conditionPayload: c.conditionPayload,
    })),
    stageCounts: { draft: 0, dept_ratio: 0, personnel_ratio: 0, approval: 0, ready: 2, disabled: 0 },
  };
}

type DupMode = 'firstDuplicate' | 'noneDuplicate' | 'unavailable';

function buildCopyDuplicateCheckResponse(mode: DupMode) {
  if (mode === 'firstDuplicate') {
    return {
      prevYm: '202604',
      currentYm: '202605',
      items: [
        { listNo: 'OB202604001', alreadyCopied: true, copiedToListNo: 'OB202605099' },
        { listNo: 'OB202604003', alreadyCopied: false, copiedToListNo: null },
      ],
    };
  }
  return {
    prevYm: '202604',
    currentYm: '202605',
    items: CANDIDATES.map((c) => ({ listNo: c.listNo, alreadyCopied: false, copiedToListNo: null })),
  };
}

async function mockNetwork(page: Page, mode: DupMode) {
  await page.route('**/api/v1/assignment/lists**', (r: Route) => {
    if (r.request().url().includes('copy-duplicate-check')) return r.continue();
    if (r.request().method() !== 'GET') return r.continue();
    return r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(buildListListsResponse()) });
  });
  await page.route('**/copy-duplicate-check**', (r: Route) => {
    if (mode === 'unavailable') {
      return r.fulfill({ status: 500, contentType: 'application/json', body: JSON.stringify({ error: 'INTERNAL_ERROR' }) });
    }
    return r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(buildCopyDuplicateCheckResponse(mode)) });
  });
}

async function gotoCreatePageAndOpenCopyModal(page: Page, mode: DupMode) {
  await mockNetwork(page, mode);
  await page.goto(CREATE_PAGE_PATH);
  await expect(page.getByTestId('btn-open-copy-modal')).toBeVisible();
  await page.getByTestId('btn-open-copy-modal').click();
  await expect(page.getByTestId('copy-row-OB202604001')).toBeVisible();
}

// 執行： npx playwright test tests/fidelity-f118-copy-duplicate.spec.ts --project=admin
test.describe('F118 E2E Fidelity — 從上月複製「已複製過」提示', () => {
  test.beforeEach(async ({}, testInfo) => {
    test.skip(
      testInfo.project.name !== 'admin',
      'F118 fidelity 僅涵蓋 admin/director-equivalent persona（建立草稿名單頁本就限定該角色），對齊 F117 之既有守衛慣例',
    );
  });

  // TS-F118-FID-001
  test('已複製過候選顯示徽章，內容含目標編號；未複製過候選不顯示（AC-1/AC-4，對照 prototype L1192-1206）', async ({ page }) => {
    await gotoCreatePageAndOpenCopyModal(page, 'firstDuplicate');

    const row1 = page.getByTestId('copy-row-OB202604001');
    await expect(row1.getByTestId('already-copied-badge')).toBeVisible();
    await expect(row1.getByTestId('already-copied-badge')).toContainText('OB202605099');
    await expect(row1).toHaveAttribute('data-already-copied', 'true');

    const row3 = page.getByTestId('copy-row-OB202604003');
    await expect(row3.getByTestId('already-copied-badge')).toHaveCount(0);
    await expect(row3).toHaveAttribute('data-already-copied', 'false');
  });

  // TS-F118-FID-002
  test('點擊已複製過候選 → 二次確認彈窗 → 確認 → 表單出現 AC-11 提醒列（對照 prototype L444-488 / L163-174）', async ({ page }) => {
    await gotoCreatePageAndOpenCopyModal(page, 'firstDuplicate');

    await page.getByTestId('btn-use-OB202604001').click();
    const confirmModal = page.getByTestId('dup-confirm-modal');
    await expect(confirmModal).toBeVisible();
    await expect(page.getByTestId('dup-confirm-target-list-no')).toContainText('OB202605099');

    await page.getByTestId('btn-confirm-dup-copy').click();
    await expect(confirmModal).toBeHidden();

    const reminderBanner = page.getByTestId('dup-reminder-banner');
    await expect(reminderBanner).toBeVisible();
    await expect(reminderBanner).toContainText('OB202605099');
  });

  // TS-F118-FID-003
  test('判定端點回應失敗 → Modal 正常列出候選、不顯示任何徽章、不阻擋複製（AC-10）', async ({ page }) => {
    await gotoCreatePageAndOpenCopyModal(page, 'unavailable');

    await expect(page.getByTestId('copy-row-OB202604001')).toBeVisible();
    await expect(page.getByTestId('copy-row-OB202604001').getByTestId('already-copied-badge')).toHaveCount(0);

    // 點擊仍可直接複製，不觸發確認彈窗（AC-10 降級）
    await page.getByTestId('btn-use-OB202604001').click();
    await expect(page.getByTestId('dup-confirm-modal')).toHaveCount(0);
    await expect(page.getByTestId('copy-applied-banner')).toBeVisible();
  });

  // TS-F118-FID-004
  test('Sidebar／Header 導覽路徑與既有 F050 建立草稿頁一致（未變更導覽層級）', async ({ page }) => {
    await gotoCreatePageAndOpenCopyModal(page, 'noneDuplicate');

    // CLAUDE.md 導覽層級 fidelity 規則：F118 未變更導覽層級，「客戶名單分派 → 名單定義」
    // 側欄項目應維持既有高亮/存在，不因本 feature 新增/移除任何 sidebar 項目。
    //
    // ⚠️ locator 必須限定於 navigation landmark：「名單定義」在本頁同時出現於
    //    ①側欄導覽項 ②header 麵包屑連結，未限定會觸發 strict mode violation
    //    （兩者皆為 <a href="/assignment/list-definitions">）。
    const sidebar = page.getByRole('navigation');
    const navItem = sidebar.getByRole('link', { name: '名單定義' });
    await expect(navItem).toBeVisible();
    // 建立草稿頁隸屬「名單定義」節點 → 該側欄項須為當前頁高亮（導覽層級未被本 feature 改動）
    await expect(navItem).toHaveAttribute('aria-current', 'page');
    // 「客戶名單分派」區段須維持展開，且本 feature 不得新增/移除任何側欄入口
    await expect(sidebar.getByRole('button', { name: '客戶名單分派' })).toHaveAttribute(
      'aria-expanded',
      'true',
    );
  });
});
