import swc from 'unplugin-swc';
import { defineConfig } from 'vitest/config';
import path from 'path';

/**
 * F117 + F118 — Stryker 專用 vitest include 範圍（test-generator 裁決 dispute #1，2026-08-04；
 * F118 追加 2026-08-04）。
 *
 * 為何不直接沿用 vitest.config.ts：
 *   1. `vitest.config.ts` 的 include 為 `['src/**\/*.spec.ts', 'test/**\/*.spec.ts']`，
 *      會把整個 src 樹的全部 unit spec（含與本 feature 無關、HEAD baseline 即紅的
 *      `src/database/__tests__/mssql-p1b1.mssql.spec.ts` TS-MSSQL-P1B1-DEFAULT-002，
 *      UTC+8 時差既有缺陷）一併拉進 Stryker 的 initial dry run。Stryker 要求 dry run
 *      全數通過才能產出突變分數，一顆與本 feature 無關的既有紅測試即可讓整條 mutation
 *      gate 完全無法產出分數（非「分數偏低」，而是「無分數」）。
 *   2. `test/**\/*.spec.ts` 這個 glob 不會比對到本專案 e2e/integration 測試慣用的
 *      `*.e2e-spec.ts` 命名（全 apps/api/test/ 下 29+ 個既有檔案皆用此慣例，
 *      見 apps/api/vitest.e2e.config.ts 的 `include: ['test/**\/*.e2e-spec.ts']`），
 *      因此 F117 的 `test/f117-dept-ratio-director-filter.e2e-spec.ts` 從未真正參與
 *      mutation run——而該檔案是唯一能殺死 `computeActiveDirectorMap()` 內 TypeORM
 *      QueryBuilder SQL 字串突變（'TRIM(e.dept_code)'、'處長'、orderBy 方向）的測試，
 *      mock repo 的 unit test 在結構上無法偵測這類突變（mock 不執行真實 SQL）。
 *
 * 本設定僅將 include 縮限為 F117 觸及之兩個測試檔（unit + integration，
 * 皆為 SQLite in-memory）。F117 §10「後端測試須同時涵蓋 SQLite unit 與 MSSQL spec
 * 兩軌」之要求不因此落空：AD-E07-48 §9 已明確裁定 F117 無 PG/MSSQL-only 依賴，
 * 「兩軌」由既有 `emphire-active.util` 的既有兩軌 dialect 測試涵蓋，F117 本身
 * 無需新增 dialect-only 測試分支——故 Stryker 的 include 範圍縮限不影響 §10 的
 * 覆蓋契約，僅是讓 mutation gate 本身可以正確產出分數。
 *
 * 詳見 docs/test-specs/risks-and-gaps.md「F117」R-F117-05。
 *
 * F118 追加說明（docs/test-specs/risks-and-gaps.md「F118」）：
 * `mutate` 新增 assignment-list.service.ts 是「整檔」（Stryker 無檔案內函式級 scoping，
 * 且 test-generator 不得編輯 production 檔加 `// Stryker disable` 註解）。該檔為既有
 * 1580 行大檔，`checkCopyDuplicates` 只是其中一個新方法。若僅把本輪新增的
 * f118-copy-duplicate-check.spec.ts 納入 dry-run include，該檔其餘既有邏輯
 * （createList / updateList / normalizeConditionPayload 等）會被判定 NoCoverage
 * （因為涵蓋它們的既有測試不在 include 內），拖累出一個「看似低但其實失真」的分數。
 * 因此改為納入該模組全部既有 19 個 SQLite unit spec（`__tests__/*.spec.ts`，已於
 * 2026-08-04 確認全數綠燈、共 330 test，7 秒內完成，見 risks-and-gaps.md 執行紀錄）
 * + 本輪新增之 f118-copy-duplicate-check.spec.ts。刻意不納入 .mssql.spec.ts（跨
 * dialect、需外部 MSSQL）與 apps/api/test/*.e2e-spec.ts（HTTP+Guard 完整開銷，
 * assignment-list.service.ts 之業務邏輯已由 SQLite unit spec 充分覆蓋，不需要
 * 額外拉入較重的 e2e 開銷才能產出有意義的分數 —— 與 F117 需要 e2e-spec 才能殺死
 * QueryBuilder SQL 字串突變的情況不同：本模組既有 CL-013c/BE-011 等測試本身就是
 * 真實 SQLite round-trip，已足以偵測 ORDER BY / 欄位名等字串突變）。
 */
export default defineConfig({
  test: {
    globals: true,
    root: './',
    include: [
      'src/modules/assignment-stage/__tests__/dept-ratio.service.spec.ts',
      'test/f117-dept-ratio-director-filter.e2e-spec.ts',
      'src/modules/assignment-list/__tests__/*.spec.ts',
    ],
    exclude: ['**/node_modules/**', '**/*.mssql.spec.ts'],
    setupFiles: ['./test/setup.ts'],
    testTimeout: 30000,
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  plugins: [swc.vite()],
});
